/**
 * GIFT & FULFILMENT AND INSURANCE CARD STORE — in-browser mock repository (Phase 9).
 *
 * - Module 8 starts after the member chooses a gift: redemption, wallet debits and refunds stay with
 *   the Phase 7 Wallet / Redemption service. This store never edits a balance.
 * - Backend gift redemption reuses the Phase 7 engine (submitGift) with the catalogue item resolved
 *   here; completed redemptions are fulfilled once (idempotent by redemption ID).
 * - Catalogue publication, point-cost changes, voucher recovery and insurance uploads / publication go
 *   through the central Approval Engine. Approval and execution stay separate.
 * - N09 events go to the Phase 8 Communication Centre with stable event IDs.
 * - Partners, voucher providers, tracking and insurers are mock adapters. Every action re-checks RBAC
 *   and writes an append-only audit event.
 */
import { useSyncExternalStore } from "react";
import { MILESTONES } from "@/config/giftsCatalogue";
import { SEED_SKUS } from "@/data/mock/masterSeed";
import { SEED_TIERS } from "@/data/mock/schemeSeed";
import { accessStore } from "@/features/access/store";
import { hasPermission, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { commsStore, ingest } from "@/features/comms/store";
import { geoOfMember, maskMobile, memberById } from "@/features/members/engine";
import { memberStore } from "@/features/members/store";
import { masterStore } from "@/features/masters/store";
import { submitAdjustment, submitGift, updateProductFulfilment, walletStore } from "@/features/wallet/store";
import { memberBalances } from "@/features/wallet/engine";
import { schemeStore } from "@/features/schemes/store";
import type { ApprovalRequest } from "@/types/approval";
import type { ActionId } from "@/types/rbac";
import type { Member } from "@/types/members";
import type { NotificationEvent } from "@/types/comms";
import type { AddressSnapshot, DeliveryMilestone, DeliveryState, FulfilmentPartner, GiftCategory, GiftItem, GiftOrder, GiftState, InsuranceCard, InsuranceCardType, PointCostRule, RecoveryOutcome, RenderConfig, SkuMapping, TrackingEvent, VoucherRecord } from "@/types/gifts";
import { cardModel, costFor, day, hashKey, insuranceKey, maskCode, maskInsurance, parseCsvText, redeemBlocks, segmentReasons, validateCostRule, validateInsuranceCsv, validateItem, validateMapping, validateSegmentation, voucherStatusAt, type CardModel } from "./engine";
import { catalogueSpec, costSpec, insuranceBatchSpec, insurancePublishSpec, recoverySpec, type GiftSpec } from "./requests";
import { buildGiftSeed } from "./seed";
import { BACKEND_GIFT_CSV_HEADER } from "@/config/giftsCatalogue";

const STORAGE_KEY = "vg-rishta.gifts-store.v1";
type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const now = () => demoNow();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const nextId = (prefix: string, list: { id: string }[], w = 4) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-").pop()) || 0), 0) + 1, w)}`;
const skus = () => (masterStore.get().skus?.length ? masterStore.get().skus : SEED_SKUS);
const tiers = () => SEED_TIERS;

/* ---------------- Store plumbing ---------------- */

function linkApprovals(s: GiftState): GiftState {
  const reqs = approvalStore.get().requests;
  const find = (ref: string) => [...reqs].reverse().find((r) => r.entityRef === ref)?.id ?? null;
  return {
    ...s,
    items: s.items.map((i) => ({ ...i, approvalRequestId: i.approvalRequestId ?? (i.status === "pending_approval" ? find(`${i.id} v${i.version}`) : null) })),
    costs: s.costs.map((c) => ({ ...c, approvalRequestId: c.approvalRequestId ?? (c.status === "pending_approval" ? find(c.id) : null) })),
    recoveries: s.recoveries.map((r) => ({ ...r, approvalRequestId: r.approvalRequestId ?? find(r.id) })),
    batches: s.batches.map((b) => ({ ...b, approvalRequestId: b.approvalRequestId ?? find(b.id) })),
    publications: s.publications.map((p) => ({ ...p, approvalRequestId: p.approvalRequestId ?? find(p.id) })),
    cards: s.cards.map((c) => ({ ...c, publication: { ...c.publication, approvalRequestId: c.publication.approvalRequestId ?? (c.publication.ref ? find(c.publication.ref) : null) } })),
  };
}

let state: GiftState;
const listeners = new Set<() => void>();
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function commit(next: GiftState) {
  if (next === state) return;
  state = next;
  persist();
  listeners.forEach((l) => l());
}
function load(): GiftState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as GiftState;
  } catch {
    /* seed */
  }
  return linkApprovals(buildGiftSeed(walletStore.get(), mem()));
}
state = load();
export const giftsStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useGiftsState = () => useSyncExternalStore(giftsStore.subscribe, giftsStore.get, giftsStore.get);
export const resetGiftsDemoData = () => {
  state = linkApprovals(buildGiftSeed(walletStore.get(), mem()));
  persist();
  listeners.forEach((l) => l());
};

function audited(s: GiftState, actor: string, entity: string, entityId: string, action: string, after: string | null, reason: string, approvalRequestId: string | null = null, before: string | null = null, partnerRef: string | null = null): GiftState {
  return { ...s, audit: [...s.audit, { id: `GAE-${pad(s.audit.length + 1, 6)}`, at: now(), actor, entity, entityId, action, before, after, reason, approvalRequestId, partnerRef }] };
}

const LABEL: Record<string, string> = { "gift-catalogue": "Gift catalogue", "fulfilment-partners": "Fulfilment partners", vouchers: "Voucher operations", "gift-orders": "Physical gift orders", insurance: "Insurance cards", "gift-redemption": "Backend gift redemption" };
const need = (m: string, a: string) => `You need ${LABEL[m] ?? m}: ${a}`;
const can = (uid: string, module: string, action: ActionId, programme?: string) => hasPermission(acc(), uid, module, action, programme ? { programme } : {}).allowed;
/** Programme + geography check against the member a record belongs to. */
export const canOnMember = (uid: string, module: string, action: ActionId, memberId: string | null) => {
  const m = memberId ? memberById(mem(), memberId) : undefined;
  return m ? hasPermission(acc(), uid, module, action, { programme: m.programme, geo: geoOfMember(m) }).allowed : can(uid, module, action);
};

function raise(uid: string, s: GiftSpec) {
  return createRequest(uid, { requestType: s.type, title: s.title, entityRef: s.entity, programme: s.programme, location: null, amount: s.amount, fields: s.fields, purpose: s.purpose, reason: s.reason, justification: s.justification, attachments: [], impact: s.impact }, true);
}

/* ======================= N09 bridge (Phase 8 Communication Centre) ======================= */

type Draft = Omit<NotificationEvent, "status" | "commId" | "detail" | "receivedCount">;
function n09(id: string, type: string, ref: string, at: string, memberId: string, payload: { gift_ref: string; gift_status: string; expiry?: string; tracking_ref?: string }): Draft {
  const m = memberById(mem(), memberId);
  return { id, notificationId: "N09", type, sourceModule: "Gift & Fulfilment", sourceRef: ref, at, memberId, programme: m?.programme ?? null, payload: { member_name: m?.name ?? memberId, gift_ref: payload.gift_ref, gift_status: payload.gift_status, expiry: payload.expiry ?? "", tracking_ref: payload.tracking_ref ?? "" } };
}
let outbox: Draft[] = [];
function flushN09() {
  if (!outbox.length) return;
  const drafts = outbox;
  outbox = [];
  ingest(drafts);
}

/** Channel delivery state of a voucher, read from the Communication Centre attempts for its N09 event. */
export function voucherDelivery(v: VoucherRecord): { whatsapp: DeliveryState; inapp: DeliveryState; commId: string | null } {
  if (!v.delivery.commId) return v.delivery;
  const cs = commsStore.get();
  const e = cs.events.find((x) => x.id === v.delivery.commId);
  if (!e?.commId) return { ...v.delivery, commId: null };
  const st = (ch: string): DeliveryState => {
    const a = cs.attempts.filter((x) => x.commId === e.commId && x.channel === ch && x.recipientKind === "member").slice(-1)[0];
    if (!a) return "not_applicable";
    return a.status === "delivered" || a.status === "published" ? "delivered" : a.status === "failed" || a.status === "provider_error" ? "failed" : "pending";
  };
  return { whatsapp: st("whatsapp"), inapp: st("inapp"), commId: e.commId };
}

/* ======================= Catalogue ======================= */

export function saveItem(uid: string, input: GiftItem, reason = ""): Res {
  const prev = state.items.find((i) => i.id === input.id);
  const isNew = !prev;
  if (!can(uid, "gift-catalogue", isNew ? "create" : "edit")) return NO(need("gift-catalogue", isNew ? "Create" : "Edit"));
  if (prev?.status === "pending_approval" || prev?.draft?.status === "pending_approval") return NO("A version of this item is awaiting approval");
  const id = isNew ? nextId("GIF", state.items) : input.id;
  const candidate: GiftItem = { ...input, id, code: input.code.trim() || id, name: input.name.trim() };
  const v = validateItem(state, candidate, { skus: skus(), tiers: tiers() });
  if (v.errors.length) return { ...NO(...v.errors), warnings: v.warnings };
  let s: GiftState;
  if (isNew || prev.status === "draft" || prev.status === "rejected") {
    const item: GiftItem = { ...candidate, status: "draft", version: prev?.version ?? 1, approvalRequestId: null, history: [...(prev?.history ?? []), { version: prev?.version ?? 1, at: now(), by: uid, change: reason || (isNew ? "Created" : "Draft edited"), approvalRequestId: null }], createdAt: prev?.createdAt ?? now(), updatedAt: now(), updatedBy: uid, publishedAt: null, draft: null };
    s = { ...state, items: isNew ? [...state.items, item] : state.items.map((x) => (x.id === id ? item : x)) };
    s = audited(s, uid, "gift", id, isNew ? "gift_created" : "gift_modified", `${item.name} · ${item.type}`, reason || "Draft saved");
  } else {
    // Live item: the change waits as a draft; members keep seeing the approved version.
    const { draft: _d, history: _h, ...rest } = candidate;
    void _d;
    void _h;
    const draft = { ...rest, status: "draft" as const, version: prev.version + 1, approvalRequestId: null, updatedAt: now(), updatedBy: uid, reason: reason || "Catalogue change" };
    s = { ...state, items: state.items.map((x) => (x.id === id ? { ...x, draft } : x)) };
    const segChanged = JSON.stringify(prev.segmentation) !== JSON.stringify(candidate.segmentation);
    s = audited(s, uid, "gift", id, segChanged ? "segmentation_change_drafted" : "gift_modified", `v${draft.version} draft`, draft.reason, null, `v${prev.version}`);
  }
  commit(s);
  return OK(id, v.warnings);
}

/** Point cost captured on the create wizard (stored as a draft rule, approved with the item). */
export function saveInitialCost(uid: string, giftId: string, programme: PointCostRule["programme"], points: number, effectiveFrom: string): Res {
  return saveCostRule(uid, { id: "", giftId, programme, memberType: null, states: [], tiers: [], points, effectiveFrom, effectiveTo: null, status: "draft", approvalRequestId: null, replaces: null, updatedBy: uid, updatedAt: now() });
}

export function submitItem(uid: string, id: string): Res {
  const i = state.items.find((x) => x.id === id);
  if (!i) return NO("Gift item not found");
  const cand = i.draft ? ({ ...i.draft, history: i.history, draft: null } as GiftItem) : i;
  if (cand.status !== "draft") return NO(`Item is ${cand.status.replace("_", " ")}; only a draft can be submitted`);
  if (!can(uid, "gift-catalogue", "submit")) return NO(need("gift-catalogue", "Submit"));
  const v = validateItem(state, cand, { skus: skus(), tiers: tiers() });
  if (v.errors.length) return NO(...v.errors);
  const costs = state.costs.filter((c) => c.giftId === id && ["active", "pending_approval", "draft"].includes(c.status));
  if (!costs.length) return NO("Configure at least one point cost before publishing (no universal cost is assumed)");
  if (!state.config.catalogueApproval) {
    if (!can(uid, "gift-catalogue", "publish")) return NO(need("gift-catalogue", "Publish"));
    commit(publishItem(state, id, uid, null));
    return OK(id, v.warnings);
  }
  const r = raise(uid, catalogueSpec(cand, i.draft ? i : undefined, state));
  if (!r.ok) return r;
  const apr = r.id ?? null;
  let s: GiftState = { ...state, items: state.items.map((x) => (x.id !== id ? x : x.draft ? { ...x, draft: { ...x.draft, status: "pending_approval", approvalRequestId: apr } } : { ...x, status: "pending_approval", approvalRequestId: apr })) };
  s = audited(s, uid, "gift", id, "submitted", `v${cand.version}`, "Catalogue publication", apr);
  commit(s);
  return OK(id, v.warnings);
}

function publishItem(s: GiftState, id: string, actor: string, apr: string | null): GiftState {
  const i = s.items.find((x) => x.id === id)!;
  const live: GiftItem = i.draft ? { ...i, ...i.draft, draft: null, history: i.history } : i;
  const next: GiftItem = { ...live, status: "active", approvalRequestId: apr, publishedAt: now(), updatedAt: now(), history: [...live.history, { version: live.version, at: now(), by: actor, change: i.draft ? `Published v${live.version}: ${i.draft.reason}` : "Published", approvalRequestId: apr }] };
  delete (next as Partial<GiftItem> & { reason?: string }).reason;
  let out: GiftState = { ...s, items: s.items.map((x) => (x.id === id ? next : x)), costs: s.costs.map((c) => (c.giftId === id && c.status === "draft" ? { ...c, status: "active", approvalRequestId: apr } : c)) };
  out = audited(out, actor, "gift", id, "gift_published", `v${next.version}`, "Approved catalogue version", apr, i.draft ? `v${i.version}` : null);
  if (i.draft && JSON.stringify(i.segmentation) !== JSON.stringify(next.segmentation)) out = audited(out, actor, "gift", id, "segmentation_changed", JSON.stringify(next.segmentation), "Programme / region / tier segmentation", apr, JSON.stringify(i.segmentation));
  return out;
}

export function setItemStatus(uid: string, id: string, status: "active" | "inactive", reason: string): Res {
  const i = state.items.find((x) => x.id === id);
  if (!i) return NO("Gift item not found");
  if (!reason.trim()) return NO("Give a reason");
  if (status === "inactive") {
    if (!can(uid, "gift-catalogue", "disable")) return NO(need("gift-catalogue", "Deactivate"));
    if (i.status !== "active") return NO("Only an active item can be deactivated");
  } else {
    if (!can(uid, "gift-catalogue", "publish")) return NO(need("gift-catalogue", "Publish"));
    if (i.status !== "inactive" || !i.publishedAt) return NO("Only a previously approved, inactive item can be reactivated. New items go through approval");
    const v = validateItem(state, i, { skus: skus(), tiers: tiers() });
    if (v.errors.length) return NO(...v.errors);
  }
  commit(audited({ ...state, items: state.items.map((x) => (x.id === id ? { ...x, status, updatedAt: now(), updatedBy: uid, history: [...x.history, { version: x.version, at: now(), by: uid, change: `${status === "inactive" ? "Deactivated" : "Reactivated"}: ${reason}`, approvalRequestId: null }] } : x)) }, uid, "gift", id, status === "inactive" ? "gift_deactivated" : "gift_reactivated", status, reason, null, i.status));
  return OK(id);
}

export function setAvailability(uid: string, id: string, availability: GiftItem["availability"], reason: string): Res {
  const i = state.items.find((x) => x.id === id);
  if (!i) return NO("Gift item not found");
  if (!can(uid, "gift-catalogue", "edit")) return NO(need("gift-catalogue", "Edit"));
  if (!reason.trim()) return NO("Give a reason");
  const warnings = availability === "available" && i.inventory.source === "not_supplied" ? ["No inventory data is supplied: availability is recorded as an operator decision"] : [];
  commit(audited({ ...state, items: state.items.map((x) => (x.id === id ? { ...x, availability, updatedAt: now(), updatedBy: uid } : x)) }, uid, "gift", id, "availability_updated", availability, reason, null, i.availability));
  return OK(id, warnings);
}

/** Mock inventory service read: availability follows the supplied quantity; never set to Available without data. */
export function syncItemInventory(uid: string, id: string, quantity: number | null): Res {
  const i = state.items.find((x) => x.id === id);
  if (!i) return NO("Gift item not found");
  if (!can(uid, "gift-catalogue", "edit")) return NO(need("gift-catalogue", "Edit"));
  if (quantity == null) {
    commit(audited({ ...state, items: state.items.map((x) => (x.id === id ? { ...x, availability: "unknown", inventory: { ...x.inventory, quantity: null, source: "not_supplied", syncedAt: now() } } : x)) }, "SYSTEM", "gift", id, "availability_updated", "unknown", "Inventory service returned no data: availability is not assumed", null, i.availability));
    return OK(id, ["Inventory data missing: the item is shown as Not supplied, not Available"]);
  }
  const availability = quantity > 0 ? "available" : "out_of_stock";
  commit(audited({ ...state, items: state.items.map((x) => (x.id === id ? { ...x, availability, inventory: { reference: x.inventory.reference ?? `INVREF-${x.code}`, quantity, source: "inventory_service", syncedAt: now() } } : x)) }, "SYSTEM", "gift", id, "availability_updated", `${availability} (${quantity})`, "Mock inventory service", null, i.availability));
  return OK(id);
}

/* ---------------- Point costs ---------------- */

export function saveCostRule(uid: string, r: PointCostRule): Res {
  if (!can(uid, "gift-catalogue", "edit")) return NO(need("gift-catalogue", "Edit point costs"));
  const prev = r.id ? state.costs.find((x) => x.id === r.id) : undefined;
  if (prev && prev.status !== "draft" && prev.status !== "rejected") return NO("Approved point costs are never overwritten: create a replacement rule instead");
  const id = prev?.id ?? nextId("PCR", state.costs);
  const rule: PointCostRule = { ...r, id, status: "draft", approvalRequestId: null, updatedBy: uid, updatedAt: now() };
  if (rule.replaces) {
    const old = state.costs.find((x) => x.id === rule.replaces);
    if (!old || old.status !== "active") return NO("The rule being replaced must be active");
    if (state.costs.some((x) => x.replaces === old.id && x.status === "pending_approval")) return NO(`A replacement for ${old.id} is already awaiting approval`);
  }
  const errors = validateCostRule({ ...state, costs: state.costs.filter((x) => x.id !== id) }, rule);
  if (errors.length) return NO(...errors);
  commit(audited({ ...state, costs: prev ? state.costs.map((x) => (x.id === id ? rule : x)) : [...state.costs, rule] }, uid, "point_cost", id, "point_cost_drafted", `${rule.points} points`, rule.replaces ? `Replaces ${rule.replaces}` : "New segment cost", null, rule.replaces ? String(state.costs.find((x) => x.id === rule.replaces)?.points ?? "") : null));
  return OK(id);
}

export function submitCostRule(uid: string, id: string): Res {
  const r = state.costs.find((x) => x.id === id);
  if (!r) return NO("Point cost rule not found");
  if (r.status !== "draft") return NO(`Rule is ${r.status.replace("_", " ")}`);
  if (!can(uid, "gift-catalogue", "submit")) return NO(need("gift-catalogue", "Submit"));
  const errors = validateCostRule(state, r);
  if (errors.length) return NO(...errors);
  const item = state.items.find((x) => x.id === r.giftId);
  if (!state.config.catalogueApproval) {
    if (!can(uid, "gift-catalogue", "publish")) return NO(need("gift-catalogue", "Publish"));
    commit(activateCost(state, id, uid, null));
    return OK(id);
  }
  const q = raise(uid, costSpec(r, r.replaces ? state.costs.find((x) => x.id === r.replaces) : undefined, item));
  if (!q.ok) return q;
  commit(audited({ ...state, costs: state.costs.map((x) => (x.id === id ? { ...x, status: "pending_approval", approvalRequestId: q.id ?? null } : x)) }, uid, "point_cost", id, "submitted", `${r.points} points`, "Point cost change", q.id ?? null));
  return OK(id);
}

const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
function activateCost(s: GiftState, id: string, actor: string, apr: string | null): GiftState {
  const r = s.costs.find((x) => x.id === id)!;
  const old = r.replaces ? s.costs.find((x) => x.id === r.replaces) : undefined;
  const today = day(now());
  let out: GiftState = {
    ...s,
    costs: s.costs.map((x) => {
      if (x.id === id) return { ...x, status: "active", approvalRequestId: apr ?? x.approvalRequestId };
      if (old && x.id === old.id) {
        const to = dayBefore(r.effectiveFrom);
        return { ...x, effectiveTo: to, status: to < today ? "superseded" : x.status };
      }
      return x;
    }),
  };
  out = audited(out, actor, "point_cost", id, "point_cost_changed", `${r.points} points from ${r.effectiveFrom}`, old ? `Replaces ${old.id}; old value kept until ${dayBefore(r.effectiveFrom)}` : "New segment cost", apr, old ? `${old.points} points` : null);
  return out;
}

/* ---------------- Categories ---------------- */

export function saveCategory(uid: string, c: Omit<GiftCategory, "updatedAt" | "updatedBy" | "status"> & { status?: GiftCategory["status"] }): Res {
  const isNew = !c.id || !state.categories.some((x) => x.id === c.id);
  if (!can(uid, "gift-catalogue", isNew ? "create" : "edit")) return NO(need("gift-catalogue", isNew ? "Create" : "Edit"));
  if (!c.name.trim()) return NO("Name the category");
  if (state.categories.some((x) => x.id !== c.id && x.name.trim().toLowerCase() === c.name.trim().toLowerCase())) return NO("A gift category with this name exists");
  const id = isNew ? `GCT-${pad(state.categories.length + 1, 3)}` : c.id;
  const prev = state.categories.find((x) => x.id === id);
  const next: GiftCategory = { id, name: c.name.trim(), description: c.description.trim(), status: prev?.status ?? "active", updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, categories: isNew ? [...state.categories, next] : state.categories.map((x) => (x.id === id ? next : x)) }, uid, "gift_category", id, isNew ? "category_created" : "category_modified", next.name, "Gift category (catalogue classification, not the Product category master)"));
  return OK(id);
}
export function categoryImpact(id: string) {
  return state.items.filter((i) => i.categoryId === id);
}
export function setCategoryStatus(uid: string, id: string, status: GiftCategory["status"], reason: string): Res & { impacted?: string[] } {
  if (!can(uid, "gift-catalogue", "disable")) return NO(need("gift-catalogue", "Deactivate"));
  if (!reason.trim()) return NO("Give a reason");
  const impacted = categoryImpact(id);
  const live = impacted.filter((i) => i.status === "active" || i.status === "pending_approval");
  if (status === "inactive" && live.length) return { ...NO(`${live.length} active or pending item(s) depend on this category: ${live.map((i) => i.code).join(", ")}. Move or deactivate them first`), impacted: live.map((i) => i.id) };
  commit(audited({ ...state, categories: state.categories.map((x) => (x.id === id ? { ...x, status, updatedAt: now(), updatedBy: uid } : x)) }, uid, "gift_category", id, status === "inactive" ? "category_deactivated" : "category_activated", status, reason));
  return { ...OK(id), impacted: impacted.map((i) => i.id) };
}

/* ======================= Partners and mappings ======================= */

const SECRET = /(secret|token|password|api[_ -]?key|bearer)/i;
export function savePartner(uid: string, p: Omit<FulfilmentPartner, "integration" | "updatedAt" | "updatedBy"> & { integration?: FulfilmentPartner["integration"] }): Res {
  const isNew = !p.id || !state.partners.some((x) => x.id === p.id);
  if (!can(uid, "fulfilment-partners", isNew ? "create" : "edit")) return NO(need("fulfilment-partners", isNew ? "Create" : "Edit"));
  const errors: string[] = [];
  if (!p.name.trim()) errors.push("Partner name is required");
  if (!p.code.trim()) errors.push("Partner code is required");
  if (!p.supportedTypes.length) errors.push("Choose at least one supported gift type");
  if (state.partners.some((x) => x.id !== p.id && x.code.toLowerCase() === p.code.trim().toLowerCase())) errors.push("Partner code already used");
  if ([p.contactRef, p.integrationRef, p.description].some((x) => SECRET.test(x))) errors.push("Do not store credentials, secrets or tokens here: record only the integration reference");
  if (errors.length) return NO(...errors);
  const id = isNew ? nextId("FPT", state.partners) : p.id;
  const prev = state.partners.find((x) => x.id === id);
  const next: FulfilmentPartner = { ...p, id, code: p.code.trim(), name: p.name.trim(), integration: prev?.integration ?? { connection: "not_connected", lastSuccess: null, lastFailure: null, sync: "never", errorSummary: null, lastFulfilmentRef: null }, updatedAt: now(), updatedBy: uid };
  const warnings = prev && prev.status === "active" && next.status === "inactive" ? state.items.filter((i) => i.partnerId === id && i.status === "active").map((i) => `${i.code} becomes unredeemable while the partner is inactive`) : [];
  commit(audited({ ...state, partners: isNew ? [...state.partners, next] : state.partners.map((x) => (x.id === id ? next : x)) }, uid, "partner", id, isNew ? "partner_created" : "partner_modified", `${next.name} · ${next.status}`, "Fulfilment partner"));
  return OK(id, warnings);
}

export function saveMapping(uid: string, mp: Omit<SkuMapping, "updatedAt" | "updatedBy" | "status"> & { status?: SkuMapping["status"] }): Res {
  if (!can(uid, "fulfilment-partners", "manage")) return NO(need("fulfilment-partners", "Manage mappings"));
  const isNew = !mp.id || !state.mappings.some((x) => x.id === mp.id);
  const id = isNew ? nextId("PSM", state.mappings) : mp.id;
  const errors = validateMapping(state, { ...mp, id }, skus());
  if (errors.length) return NO(...errors);
  const prev = state.mappings.find((x) => x.id === id);
  const next: SkuMapping = { ...mp, id, partnerSku: mp.partnerSku.trim(), status: mp.status ?? "active", updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, mappings: isNew ? [...state.mappings, next] : state.mappings.map((x) => (x.id === id ? next : x)) }, uid, "mapping", id, "mapping_changed", `${next.giftId} → ${next.partnerId} ${next.partnerSku}${next.productSkuId ? ` (${next.productSkuId})` : ""}`, "Partner / SKU mapping", null, prev ? `${prev.partnerSku}` : null));
  return OK(id);
}
export function setMappingStatus(uid: string, id: string, status: SkuMapping["status"], reason: string): Res {
  if (!can(uid, "fulfilment-partners", "manage")) return NO(need("fulfilment-partners", "Manage mappings"));
  if (!reason.trim()) return NO("Give a reason");
  commit(audited({ ...state, mappings: state.mappings.map((x) => (x.id === id ? { ...x, status, updatedAt: now(), updatedBy: uid } : x)) }, uid, "mapping", id, "mapping_changed", status, reason));
  return OK(id);
}

/* ======================= Vouchers ======================= */

/** Mock voucher-provider inventory read. "invalid" simulates an invalid provider response (nothing recorded). */
export function syncVoucherInventory(uid: string, giftId: string, count: number, outcome: "ok" | "invalid" | "timeout" = "ok"): Res {
  if (!can(uid, "vouchers", "manage")) return NO(need("vouchers", "Manage inventory"));
  const g = state.items.find((x) => x.id === giftId && x.type === "voucher");
  if (!g || !g.partnerId) return NO("Not a voucher catalogue item");
  const p = state.partners.find((x) => x.id === g.partnerId)!;
  if (p.status !== "active") return NO(`${p.name} is inactive`);
  const pi = (patch: Partial<FulfilmentPartner["integration"]>) => state.partners.map((x) => (x.id === p.id ? { ...x, integration: { ...x.integration, ...patch } } : x));
  if (outcome !== "ok") {
    const msg = outcome === "invalid" ? "Provider returned an invalid inventory response (mock)" : "Inventory request timed out (mock)";
    commit(audited({ ...state, partners: pi({ lastFailure: now(), sync: "failed", errorSummary: msg }) }, "SYSTEM", "voucher_inventory", g.id, "voucher_inventory_failed", null, msg, null, null, p.integrationRef));
    return NO(`${msg}. No voucher was recorded`);
  }
  if (!Number.isInteger(count) || count < 1) return NO("Enter how many vouchers the provider made available");
  if (g.voucher?.denomination == null) return NO("Variable-value vouchers are issued on demand by the provider: there is no inventory to sync");
  const start = state.vouchers.length;
  const created: VoucherRecord[] = Array.from({ length: count }, (_, k) => ({ id: `VCH-${pad(start + k + 1, 5)}`, partnerId: p.id, giftId, partnerSku: state.mappings.find((m) => m.giftId === giftId && m.status === "active")?.partnerSku ?? "", value: g.voucher!.denomination!, codeMasked: "XXXX-XXXX-XXXX", vaultRef: `DEV-VAULT-${giftId}-${start + k + 1}`, status: "available", memberId: null, redemptionRef: null, ledgerRef: null, issuedAt: null, expiresOn: null, usedAt: null, delivery: { whatsapp: "not_applicable", inapp: "not_applicable", commId: null }, providerRef: null, recoverable: true, callbackIds: [], origin: "provider_inventory_mock" }));
  const avail = state.vouchers.filter((v) => v.giftId === giftId && v.status === "available").length + count;
  let s: GiftState = { ...state, vouchers: [...state.vouchers, ...created], partners: pi({ lastSuccess: now(), sync: "ok", errorSummary: null }), items: state.items.map((x) => (x.id === giftId ? { ...x, availability: "available", inventory: { reference: x.inventory.reference ?? `INVREF-${x.code}`, quantity: avail, source: "inventory_service", syncedAt: now() } } : x)) };
  s = audited(s, "SYSTEM", "voucher_inventory", giftId, "voucher_inventory_received", `${count} available (${avail} in total)`, "Mock provider inventory sync", null, p.integrationRef);
  commit(s);
  return OK(giftId);
}

/** Permission-controlled code view: shows the masked code and vault reference; full codes stay with the provider. */
export function viewVoucherCode(uid: string, voucherId: string): Res & { code?: string } {
  const v = state.vouchers.find((x) => x.id === voucherId);
  if (!v) return NO("Voucher not found");
  if (!canOnMember(uid, "vouchers", "view_sensitive", v.memberId)) return NO("You need Voucher operations: View sensitive (voucher code) for this member");
  commit(audited(state, uid, "voucher", voucherId, "voucher_code_viewed", null, "Permission-controlled code view"));
  return { ...OK(voucherId, ["Development data: the provider vault reference stands in for the code"]), code: `${v.codeMasked} · vault ${v.vaultRef}` };
}

function issueVoucher(s: GiftState, giftId: string, memberId: string, redemptionRef: string, ledgerRef: string | null, value: number, origin: VoucherRecord["origin"], providerOutcome: "ok" | "invalid" = "ok"): { s: GiftState; voucher: VoucherRecord | null; error: string | null } {
  const g = s.items.find((x) => x.id === giftId)!;
  const p = s.partners.find((x) => x.id === g.partnerId);
  if (!p || p.status !== "active") return { s, voucher: null, error: "Voucher partner inactive at issue" };
  if (providerOutcome === "invalid") return { s: { ...s, partners: s.partners.map((x) => (x.id === p.id ? { ...x, integration: { ...x.integration, lastFailure: now(), sync: "failed", errorSummary: "Invalid issue response (mock)" } } : x)) }, voucher: null, error: "Voucher provider returned an invalid response: no voucher recorded" };
  const at = now();
  const last4 = String(1000 + (parseInt(hashKey(redemptionRef).slice(0, 6), 16) % 8999));
  const pool = s.vouchers.find((v) => v.giftId === giftId && v.status === "available");
  const expiresOn = pool?.expiresOn ?? new Date(Date.parse(`${day(at)}T00:00:00Z`) + 365 * 86400_000).toISOString().slice(0, 10);
  const eventId = `EVT-N09-${redemptionRef}-voucher`;
  let voucher: VoucherRecord;
  let vouchers: VoucherRecord[];
  if (pool) {
    voucher = { ...pool, status: "issued", memberId, redemptionRef, ledgerRef, issuedAt: at, expiresOn, codeMasked: maskCode(last4), providerRef: `MOCK-VPR-${redemptionRef}`, delivery: { whatsapp: "pending", inapp: "pending", commId: eventId }, origin };
    vouchers = s.vouchers.map((v) => (v.id === pool.id ? voucher : v));
  } else {
    if (g.voucher?.denomination != null) return { s, voucher: null, error: `No ${g.name} inventory available from the provider` };
    voucher = { id: `VCH-${pad(s.vouchers.length + 1, 5)}`, partnerId: p.id, giftId, partnerSku: s.mappings.find((m) => m.giftId === giftId && m.status === "active")?.partnerSku ?? "", value, codeMasked: maskCode(last4), vaultRef: `DEV-VAULT-${redemptionRef}`, status: "issued", memberId, redemptionRef, ledgerRef, issuedAt: at, expiresOn, usedAt: null, delivery: { whatsapp: "pending", inapp: "pending", commId: eventId }, providerRef: `MOCK-VPR-${redemptionRef}`, recoverable: true, callbackIds: [], origin };
    vouchers = [...s.vouchers, voucher];
  }
  const remaining = vouchers.filter((v) => v.giftId === giftId && v.status === "available").length;
  let out: GiftState = { ...s, vouchers, items: g.inventory.source === "inventory_service" ? s.items.map((x) => (x.id === giftId ? { ...x, inventory: { ...x.inventory, quantity: remaining, syncedAt: at }, availability: remaining > 0 ? "available" : "out_of_stock" } : x)) : s.items, partners: s.partners.map((x) => (x.id === p.id ? { ...x, integration: { ...x.integration, lastSuccess: at, lastFulfilmentRef: voucher.providerRef } } : x)) };
  out = audited(out, "SYSTEM", "voucher", voucher.id, pool ? "voucher_allocated" : "voucher_issued", `${memberId} · ${voucher.codeMasked}`, `Redemption ${redemptionRef}`, null, null, voucher.providerRef);
  if (pool) out = audited(out, "SYSTEM", "voucher", voucher.id, "voucher_issued", voucher.codeMasked, `Redemption ${redemptionRef}`, null, null, voucher.providerRef);
  outbox.push(n09(eventId, "voucher.issued", voucher.id, at, memberId, { gift_ref: voucher.id, gift_status: "issued", expiry: expiresOn }));
  return { s: out, voucher, error: null };
}

/** Mock provider callback for a voucher (usage, expiry or delivery report). Duplicate callback IDs are ignored. */
export function voucherProviderCallback(voucherId: string, status: "used" | "expired", callbackId: string): Res {
  const v = state.vouchers.find((x) => x.id === voucherId);
  if (!v) return NO("Voucher not found");
  if (v.callbackIds.includes(callbackId)) {
    commit(audited(state, "SYSTEM", "voucher", voucherId, "duplicate_callback_ignored", callbackId, "Callback already applied"));
    return OK(voucherId, ["Duplicate provider callback ignored"]);
  }
  if (v.status !== "issued") return NO(`Voucher is ${v.status}; a ${status} report does not apply`);
  commit(audited({ ...state, vouchers: state.vouchers.map((x) => (x.id === voucherId ? { ...x, status, usedAt: status === "used" ? now() : x.usedAt, callbackIds: [...x.callbackIds, callbackId] } : x)) }, "SYSTEM", "voucher", voucherId, status === "used" ? "voucher_used" : "voucher_expired", status, "Provider report (mock)", null, "issued", callbackId));
  return OK(voucherId);
}

/** Recovery request: validated against the voucher, member, status, expiry and provider support. */
export function requestRecovery(uid: string, i: { voucherId: string; memberId: string; reason: string; remarks: string; evidence: string[] }): Res {
  const v = state.vouchers.find((x) => x.id === i.voucherId.trim());
  if (!canOnMember(uid, "vouchers", "create", v?.memberId ?? null) || !can(uid, "vouchers", "submit")) return NO(need("vouchers", "Initiate recovery"));
  if (!v) return NO("Original voucher not found");
  if (v.memberId !== i.memberId.trim()) return NO("The voucher does not belong to the selected member");
  const st = voucherStatusAt(v, now());
  if (st === "expired") return NO(`Voucher expired on ${v.expiresOn}: it cannot be recovered`);
  if (st === "used") return NO("Voucher already used: it cannot be recovered");
  if (st !== "issued") return NO(`Voucher is ${st}; only an issued voucher can be recovered`);
  const p = state.partners.find((x) => x.id === v.partnerId);
  if (!v.recoverable || !p || p.status !== "active") return NO("The provider does not support recovery for this voucher (partner inactive or reissue not supported)");
  if (state.recoveries.some((r) => r.voucherId === v.id && (r.status === "pending_approval" || r.status === "approved"))) return NO("A recovery for this voucher is already open");
  if (!i.reason) return NO("Choose a reason");
  if (!i.remarks.trim()) return NO("Remarks are required");
  const id = nextId("VRR", state.recoveries);
  const rec = { id, voucherId: v.id, memberId: v.memberId!, reason: i.reason, remarks: i.remarks.trim(), evidence: i.evidence, status: "pending_approval" as const, outcome: "open" as const, outcomeDetail: "", reissuedVoucherId: null, approvalRequestId: null, commId: null, requestedBy: uid, requestedAt: now(), events: [{ at: now(), event: "recovery_requested", detail: "Submitted for approval" }] };
  const q = raise(uid, recoverySpec(rec, v));
  if (!q.ok) return q;
  commit(audited({ ...state, recoveries: [...state.recoveries, { ...rec, approvalRequestId: q.id ?? null }] }, uid, "voucher", v.id, "voucher_recovery_requested", id, rec.remarks, q.id ?? null));
  return OK(id);
}

/** Development control: what the mock provider will answer when the approved recovery executes. */
const providerAnswer = new Map<string, Exclude<RecoveryOutcome, "open" | "rejected" | "expired">>();
export function setRecoverySimulation(uid: string, recoveryId: string, outcome: Exclude<RecoveryOutcome, "open" | "rejected" | "expired">): Res {
  if (!can(uid, "vouchers", "manage")) return NO(need("vouchers", "Manage"));
  providerAnswer.set(recoveryId, outcome);
  return OK(recoveryId, ["Mock provider response set (development only)"]);
}

/* ======================= Physical fulfilment ======================= */

export const orderVisible = (uid: string, o: GiftOrder) => canOnMember(uid, "gift-orders", "view", o.memberId);
export function ordersFor(uid: string) {
  return state.orders.filter((o) => orderVisible(uid, o));
}
export function maskedAddress(uid: string, o: GiftOrder): AddressSnapshot {
  if (canOnMember(uid, "gift-orders", "view_sensitive", o.memberId)) return o.address;
  return { ...o.address, line: o.address.line ? "•••• (address restricted)" : "", pincode: o.address.pincode ? `${o.address.pincode.slice(0, 3)}•••` : "" };
}

export function setAddressMethod(uid: string, method: string | null, trackingPartner: string | null): Res {
  if (!can(uid, "gift-orders", "manage")) return NO(need("gift-orders", "Manage"));
  if (method != null && !method.trim()) return NO("Describe the verification method or clear it");
  commit(audited({ ...state, config: { ...state.config, addressMethod: method?.trim() || null, trackingPartner: trackingPartner?.trim() || null } }, uid, "config", "OP-GIFT1", "address_method_configured", method ?? "not set", "Development configuration: OP-GIFT1 stays Business Confirmation Required", null, state.config.addressMethod));
  return OK(undefined, ["Recorded as a development setting. No real verification is performed in this build"]);
}

function ord(uid: string, id: string, action: ActionId = "manage"): GiftOrder | string {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return "Order not found";
  if (!canOnMember(uid, "gift-orders", action, o.memberId)) return need("gift-orders", action === "manage" ? "Manage (in your programme and geography)" : "View");
  return o;
}
const setOrder = (s: GiftState, o: GiftOrder): GiftState => ({ ...s, orders: s.orders.map((x) => (x.id === o.id ? { ...o, updatedAt: now() } : x)) });

/** Records the outcome of the configured verification step (mock). Never claims real verification. */
export function confirmAddress(uid: string, orderId: string, outcome: "confirmed" | "failed" | "change_requested", reference: string): Res {
  const o = ord(uid, orderId);
  if (typeof o === "string") return NO(o);
  if (!state.config.addressMethod) return NO("No address verification method is configured (OP-GIFT1). Record the method first; OTP is not assumed");
  if (o.status !== "awaiting_address") return NO("Address confirmation applies before dispatch only");
  if (!o.address.line) return NO("The member has no gift delivery address: request an address change first");
  if (outcome === "confirmed" && !reference.trim()) return NO("Record the verification reference");
  const conf = { status: outcome, method: state.config.addressMethod, reference: reference.trim() || null, at: now(), simulated: true };
  const next: GiftOrder = { ...o, addressConfirmation: conf, exceptions: outcome === "failed" ? [...o.exceptions, { id: nextId("GEX", state.orders.flatMap((x) => x.exceptions)), kind: "address_issue", detail: "Address verification failed", at: now(), remarks: [], issueRef: null, open: true }] : o.exceptions };
  commit(audited(setOrder(state, next), uid, "order", orderId, outcome === "confirmed" ? "address_confirmed" : outcome === "failed" ? "address_verification_failed" : "address_change_requested", reference || outcome, `Method: ${state.config.addressMethod} (simulated, OP-GIFT1 open)`, null, o.addressConfirmation.status));
  return OK(orderId, ["Simulated verification: no real verification occurred"]);
}

/** A member-requested address change after order creation: new version, earlier snapshot kept, reconfirmation needed. */
export function changeOrderAddress(uid: string, orderId: string, a: { line: string; district: string; state: string; pincode: string }, reason: string): Res {
  const o = ord(uid, orderId);
  if (typeof o === "string") return NO(o);
  if (!["awaiting_address", "placed"].includes(o.status)) return NO("The address cannot change after dispatch");
  if (!a.line.trim() || !a.state.trim() || !/^\d{6}$/.test(a.pincode.trim())) return NO("Enter the address line, state and a 6-digit pincode");
  if (!reason.trim()) return NO("Give a reason");
  const snap: AddressSnapshot = { ...o.address, version: o.address.version + 1, line: a.line.trim(), district: a.district.trim(), state: a.state.trim(), pincode: a.pincode.trim(), source: "Member-requested change (recorded by operator)", capturedAt: now() };
  const next: GiftOrder = { ...o, addressHistory: [...o.addressHistory, o.address], address: snap, addressChanges: [...o.addressChanges, { at: now(), version: snap.version, detail: reason.trim() }], addressConfirmation: { status: o.addressConfirmation.status === "pending" ? "pending" : "reconfirmation_required", method: null, reference: null, at: null, simulated: false }, status: o.status === "placed" ? "awaiting_address" : o.status };
  commit(audited(setOrder(state, next), uid, "order", orderId, "address_changed", `v${snap.version}`, reason, null, `v${o.address.version}`));
  return OK(orderId, ["Reconfirmation required before dispatch. The earlier address version is kept on the order"]);
}

/** Places the order with the partner: only once the address is confirmed. */
export function placeOrder(uid: string, orderId: string): Res {
  const o = ord(uid, orderId);
  if (typeof o === "string") return NO(o);
  if (o.addressConfirmation.status !== "confirmed") return NO("The delivery address is not confirmed: the order cannot be placed or dispatched");
  if (o.status !== "awaiting_address") return NO(`Order is already ${o.status.replace(/_/g, " ")}`);
  const g = state.items.find((x) => x.id === o.giftId);
  const p = state.partners.find((x) => x.id === o.partnerId);
  if (!p || p.status !== "active") return NO("The fulfilment partner is inactive");
  if (g?.type === "physical" && !state.mappings.some((m) => m.giftId === o.giftId && m.partnerId === p.id && m.status === "active")) return NO("No active partner / SKU mapping for this gift");
  const po = `MOCK-PO-${orderId.split("-")[1]}${pad(state.seq + 1, 3)}`;
  const ev: TrackingEvent = { id: `TRK-${pad(state.orders.flatMap((x) => x.tracking).length + 1, 5)}`, partnerStatus: "placed", milestone: "placed", at: now(), source: "order_service", partnerRef: po, remarks: "Order accepted by the mock partner adapter", duplicate: false, accepted: true };
  let s = setOrder({ ...state, seq: state.seq + 1 }, { ...o, status: "placed", partnerOrderRef: po, tracking: [...o.tracking, ev] });
  s = { ...s, partners: s.partners.map((x) => (x.id === p.id ? { ...x, integration: { ...x.integration, lastSuccess: now(), lastFulfilmentRef: po } } : x)) };
  commit(audited(s, uid, "order", orderId, "order_placed", po, "Mock fulfilment partner", null, null, po));
  return OK(orderId);
}

const RANK: Record<DeliveryMilestone, number> = { placed: 0, dispatched: 1, out_for_delivery: 2, delivered: 3 };
/**
 * Tracking adapter contract: the partner reports one of the SOW milestones (placed, dispatched,
 * out_for_delivery, delivered). Anything else is kept as reported and shown as an exception. A
 * repeated event ID is recorded as a duplicate and changes nothing.
 */
export function trackingUpdate(orderId: string, eventId: string, partnerStatus: string, at: string, partnerRef: string | null, remarks = ""): Res {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return NO("Order not found");
  const known = o.tracking.find((t) => t.id === eventId);
  if (known) {
    const dupEv: TrackingEvent = { ...known, id: `${eventId}#dup${o.tracking.filter((t) => t.id.startsWith(`${eventId}#dup`)).length + 1}`, duplicate: true, accepted: false, at, remarks: "Duplicate partner event ignored" };
    commit(audited(setOrder(state, { ...o, tracking: [...o.tracking, dupEv] }), "PARTNER", "order", orderId, "duplicate_tracking_event_ignored", eventId, "Same partner event received again", null, null, partnerRef));
    return OK(orderId, ["Duplicate tracking event ignored: status unchanged"]);
  }
  const milestone = (MILESTONES.find((m) => m.id === partnerStatus)?.id ?? null) as DeliveryMilestone | null;
  const base: TrackingEvent = { id: eventId, partnerStatus, milestone, at, source: "partner_adapter", partnerRef, remarks, duplicate: false, accepted: false };
  if (!milestone) {
    const kind = /return/i.test(partnerStatus) ? "returned" : /fail|undeliver/i.test(partnerStatus) ? "failed_delivery" : "unmapped_status";
    const next: GiftOrder = { ...o, status: "exception", tracking: [...o.tracking, { ...base, accepted: true }], exceptions: [...o.exceptions, { id: nextId("GEX", state.orders.flatMap((x) => x.exceptions)), kind, detail: `Partner reported "${partnerStatus}" (kept as reported)`, at, remarks: [], issueRef: null, open: true }] };
    commit(audited(setOrder(state, next), "PARTNER", "order", orderId, "delivery_exception", partnerStatus, "Partner status preserved; mapped to the exception queue", null, o.status, partnerRef));
    return OK(orderId, ["Recorded as a delivery exception"]);
  }
  if (milestone !== "placed" && o.addressConfirmation.status !== "confirmed") {
    const next: GiftOrder = { ...o, tracking: [...o.tracking, base], exceptions: [...o.exceptions, { id: nextId("GEX", state.orders.flatMap((x) => x.exceptions)), kind: "address_issue", detail: `Partner reported ${partnerStatus} before the address was confirmed: not accepted`, at, remarks: [], issueRef: null, open: true }] };
    commit(audited(setOrder(state, next), "PARTNER", "order", orderId, "tracking_event_refused", partnerStatus, "Dispatch is blocked until the address is confirmed", null, null, partnerRef));
    return NO("Dispatch refused: the delivery address is not confirmed");
  }
  const cur = o.status === "awaiting_address" || o.status === "exception" ? -1 : RANK[o.status as DeliveryMilestone];
  if (o.status === "awaiting_address" && milestone !== "placed") return NO("The order has not been placed with the partner");
  if (RANK[milestone] <= cur) {
    commit(audited(setOrder(state, { ...o, tracking: [...o.tracking, { ...base, remarks: `Out of sequence: order already ${o.status}` }] }), "PARTNER", "order", orderId, "tracking_event_out_of_sequence", partnerStatus, "Not applied"));
    return NO(`Out of sequence: the order is already ${o.status.replace(/_/g, " ")}`);
  }
  const shipmentRef = o.shipmentRef ?? (milestone === "dispatched" ? partnerRef : o.shipmentRef);
  const next: GiftOrder = { ...o, status: milestone, shipmentRef, tracking: [...o.tracking, { ...base, accepted: true }], exceptions: o.exceptions.map((e) => (e.kind === "partner_update_missing" || e.kind === "tracking_unavailable" ? { ...e, open: false } : e)) };
  let s = audited(setOrder(state, next), "PARTNER", "order", orderId, milestone === "dispatched" ? "dispatched" : milestone === "out_for_delivery" ? "out_for_delivery" : milestone === "delivered" ? "delivered" : "partner_status_updated", partnerStatus, "Partner tracking adapter (mock)", null, o.status, partnerRef);
  if (milestone === "dispatched") s = audited(s, "PARTNER", "order", orderId, "shipment_created", shipmentRef, "", null, null, partnerRef);
  commit(s);
  if (milestone === "dispatched" || milestone === "delivered") {
    const isPhase7 = o.origin === "phase7_redemption";
    // Phase 7 product redemptions: the delivered notification comes from the redemption record (same event ID).
    if (!(isPhase7 && milestone === "delivered")) outbox.push(n09(`EVT-N09-${o.redemptionRef}-${milestone}`, `gift.${milestone}`, o.id, at, o.memberId, { gift_ref: o.id, gift_status: milestone, tracking_ref: shipmentRef ?? "" }));
    if (isPhase7) updateProductFulfilment(o.redemptionRef, milestone === "delivered" ? { fulfilment: "delivered", delivery: "delivered" } : { fulfilment: "ordered", delivery: "in_transit" }, at, o.id);
    flushN09();
  }
  return OK(orderId);
}

/** The tracking provider did not answer: recorded as an exception, the order status is not changed. */
export function trackingProviderFailure(orderId: string, detail = "Tracking provider unavailable (mock)"): Res {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return NO("Order not found");
  const s = { ...setOrder(state, { ...o, exceptions: [...o.exceptions, { id: nextId("GEX", state.orders.flatMap((x) => x.exceptions)), kind: "tracking_unavailable" as const, detail, at: now(), remarks: [], issueRef: null, open: true }] }), partners: state.partners.map((x) => (x.id === o.partnerId ? { ...x, integration: { ...x.integration, lastFailure: now(), sync: "failed" as const, errorSummary: detail } } : x)) };
  commit(audited(s, "SYSTEM", "order", orderId, "tracking_unavailable", null, detail));
  return OK(orderId, ["Order status unchanged"]);
}

/** Operators cannot mark a gift delivered: only the partner's confirmation does. */
export function markDeliveredManually(uid: string, orderId: string): Res {
  void uid;
  void orderId;
  return NO("Delivered needs the fulfilment partner's confirmation. Operators cannot mark an order delivered");
}

export function addExceptionRemark(uid: string, orderId: string, exceptionId: string, text: string, raiseIssue = false): Res {
  const o = ord(uid, orderId);
  if (typeof o === "string") return NO(o);
  if (!text.trim()) return NO("Write the remark");
  const ex = o.exceptions.find((e) => e.id === exceptionId);
  if (!ex) return NO("Exception not found");
  const issueRef = raiseIssue && !ex.issueRef ? `FIS-${orderId.split("-")[1]}-${pad(o.exceptions.indexOf(ex) + 1, 2)}` : ex.issueRef;
  const next: GiftOrder = { ...o, exceptions: o.exceptions.map((e) => (e.id === exceptionId ? { ...e, remarks: [...e.remarks, `${now()} ${uid}: ${text.trim()}`], issueRef } : e)) };
  commit(audited(setOrder(state, next), uid, "order", orderId, raiseIssue ? "fulfilment_issue_raised" : "exception_remark", issueRef ?? text.trim(), text.trim()));
  return OK(issueRef ?? orderId, ["The partner's reported status is not changed"]);
}

/* ======================= Backend gift redemption (reuses Phase 7) ======================= */

export interface BackendGiftInput {
  memberId: string;
  giftId: string;
  quantity: number;
  deductPoints: boolean;
  reason: string;
  remarks: string;
  evidence: string[];
}
/** Catalogue checks, then the Phase 7 engine with the catalogue item and the member's point cost. */
export function submitBackendGift(uid: string, i: BackendGiftInput, batchId: string | null = null): Res {
  const m = memberById(mem(), i.memberId.trim());
  if (!m) return NO(`Member ${i.memberId || "(blank)"} not found`);
  const g = state.items.find((x) => x.id === i.giftId.trim());
  if (!g) return NO(`Gift ${i.giftId || "(blank)"} not found in the catalogue`);
  const blocks = redeemBlocks(state, g, m, now());
  const cost = costFor(state, g.id, m, now());
  const errors = [...blocks];
  if (cost.points == null) errors.push(cost.message);
  if (errors.length) return NO(...errors);
  return submitGift(uid, { memberId: m.id, catalogueRef: g.id, quantity: i.quantity, foc: !i.deductPoints, reason: i.reason, remarks: i.remarks, evidence: i.evidence }, batchId, { ref: g.id, item: g.name, points: cost.points!, available: true, programmes: [m.programme] });
}

/** Bulk backend gifts. Same file content twice is refused, so a retry never creates duplicate orders. */
export function submitBackendGiftBatch(uid: string, fileName: string, text: string): Res & { rows?: GiftState["giftBatches"][number]["rows"] } {
  if (!can(uid, "gift-redemption", "create")) return NO(need("gift-redemption", "Create"));
  const all = parseCsvText(text);
  if (!all.length || BACKEND_GIFT_CSV_HEADER.some((h, i) => all[0][i]?.trim().toLowerCase() !== h)) return NO(`Header must be: ${BACKEND_GIFT_CSV_HEADER.join(",")}`);
  const hash = hashKey(all.slice(1).map((r) => r.map((c) => c.trim()).join(",")).join("\n"));
  const prior = state.giftBatches.find((b) => b.hash === hash);
  if (prior) return NO(`This file content was already uploaded as ${prior.id}: re-uploading would create duplicate gift orders`);
  const id = nextId("GBB", state.giftBatches);
  const seen = new Set<string>();
  const rows: GiftState["giftBatches"][number]["rows"] = [];
  for (const [n, c] of all.slice(1).entries()) {
    const [memberId = "", giftId = "", quantity = "", foc = "", reason = "", remarks = ""] = c.map((x) => x.trim());
    const key = `${memberId}|${giftId}`.toLowerCase();
    if (seen.has(key)) {
      rows.push({ row: n + 2, memberId, giftId, quantity, foc, result: "duplicate", message: "Duplicate of an earlier row: not processed", giftRedemptionId: null });
      continue;
    }
    seen.add(key);
    const isFoc = foc.toLowerCase() === "yes";
    if (!/^\d+$/.test(quantity)) {
      rows.push({ row: n + 2, memberId, giftId, quantity, foc, result: "invalid", message: "Quantity must be a whole number", giftRedemptionId: null });
      continue;
    }
    const r = submitBackendGift(uid, { memberId, giftId, quantity: Number(quantity), deductPoints: !isFoc, reason, remarks, evidence: isFoc ? [`${fileName} (FOC justification)`] : [] }, id);
    rows.push({ row: n + 2, memberId, giftId, quantity, foc, result: r.ok ? "valid" : "invalid", message: r.ok ? `${r.id} submitted for approval${isFoc ? " (FOC)" : ""}` : r.errors.join("; "), giftRedemptionId: r.ok ? r.id ?? null : null });
  }
  commit(audited({ ...state, giftBatches: [...state.giftBatches, { id, fileName, hash, rows, createdBy: uid, createdAt: now() }] }, uid, "gift_batch", id, "uploaded", `${rows.filter((r) => r.result === "valid").length} of ${rows.length} rows submitted`, fileName));
  return { ...OK(id), rows };
}

/** Turns a completed Phase 7 gift redemption into a voucher or an order, exactly once. */
export function fulfilRedemption(giftRedemptionId: string, opts: { voucherOutcome?: "ok" | "invalid" } = {}): Res {
  if (state.fulfilled.includes(giftRedemptionId)) return OK(giftRedemptionId, ["Already fulfilled: duplicate completion callback ignored, no second order or voucher"]);
  const g = walletStore.get().gifts.find((x) => x.id === giftRedemptionId);
  if (!g || g.status !== "completed") return NO("The redemption is not completed in the wallet service");
  const item = state.items.find((x) => x.id === g.catalogueRef);
  if (!item) return NO("Not a Gift Catalogue redemption");
  const m = memberById(mem(), g.memberId);
  const points = g.foc ? 0 : g.quantity * g.pointsPerUnit;
  const ledgerRef = g.ledgerIds[0] ?? null;
  let s: GiftState = { ...state, fulfilled: [...state.fulfilled, g.id] };
  const issue = (kind: GiftState["issues"][number]["kind"], detail: string) => {
    s = { ...s, issues: [...s.issues, { id: nextId("GFI", s.issues), redemptionRef: g.id, memberId: g.memberId, giftId: item.id, kind, detail, at: now(), status: "open", pointsDeducted: points, ledgerRef, refundRef: null, remarks: [] }] };
    s = audited(s, "SYSTEM", "redemption", g.id, "fulfilment_failed", kind, `${detail}. The redemption and its ledger debit are kept; a refund goes through the wallet service`);
  };
  if (item.type === "voucher") {
    for (let q = 0; q < g.quantity; q++) {
      const out = issueVoucher(s, item.id, g.memberId, g.quantity > 1 ? `${g.id}-${q + 1}` : g.id, ledgerRef, item.voucher?.denomination ?? g.pointsPerUnit, "backend_gift", opts.voucherOutcome);
      if (out.error) {
        issue(out.error.includes("invalid") ? "provider_invalid_response" : out.error.includes("inactive") ? "partner_inactive" : "voucher_unavailable", out.error);
        break;
      }
      s = out.s;
    }
  } else {
    const a = m?.addresses.gift;
    const id = nextId("GOR", s.orders);
    const order: GiftOrder = { id, memberId: g.memberId, programme: g.programme, branchCode: m?.branchCode ?? "", giftId: item.id, productSkuId: item.productSkuId, quantity: g.quantity, points, foc: g.foc, redemptionRef: g.id, ledgerRef, partnerId: item.partnerId, partnerOrderRef: null, shipmentRef: null, address: { version: 1, recipient: m?.name ?? "", line: a?.line ?? "", district: a?.district ?? "", state: a?.state ?? "", pincode: a?.pincode ?? "", contactMasked: m ? maskMobile(m.mobile) : "", source: a ? `Gift delivery address (${a.source.replace("_", " ")})` : "No gift delivery address on the member profile", capturedAt: now() }, addressHistory: [], addressChanges: [], addressConfirmation: { status: "pending", method: null, reference: null, at: null, simulated: false }, status: "awaiting_address", tracking: [], exceptions: a ? [] : [{ id: nextId("GEX", s.orders.flatMap((x) => x.exceptions)), kind: "address_issue", detail: "No gift delivery address on the member profile", at: now(), remarks: [], issueRef: null, open: true }], refundRef: null, createdAt: now(), updatedAt: now(), origin: "backend_gift" };
    const p = s.partners.find((x) => x.id === item.partnerId);
    s = { ...s, orders: [...s.orders, order] };
    s = audited(s, "SYSTEM", "order", id, "order_created", `${item.name} × ${g.quantity}${g.foc ? " (FOC)" : ""}`, `Backend redemption ${g.id}`);
    s = audited(s, "SYSTEM", "order", id, "address_confirmation_requested", null, state.config.addressMethod ? `Method: ${state.config.addressMethod}` : "Verification method not configured (OP-GIFT1)");
    if (!p || p.status !== "active") issue("partner_inactive", `${p?.name ?? "Partner"} is inactive: the order cannot be placed`);
  }
  commit(s);
  flushN09();
  return OK(giftRedemptionId);
}

/** Refund for a failed fulfilment: raised as a Phase 7 adjustment linked to the original redemption. */
export function requestFulfilmentRefund(uid: string, issueId: string, remarks: string): Res {
  const f = state.issues.find((x) => x.id === issueId);
  if (!f) return NO("Fulfilment issue not found");
  if (f.refundRef) return NO(`A refund is already linked (${f.refundRef})`);
  if (f.pointsDeducted <= 0) return NO("No points were deducted (FOC): nothing to refund");
  if (!remarks.trim()) return NO("Remarks are required");
  const m = memberById(mem(), f.memberId);
  const r = submitAdjustment(uid, { memberId: f.memberId, programme: m?.programme ?? "", direction: "add", category: "base", points: f.pointsDeducted, reasonCode: "ADJ-GIFT-FULFIL", remarks: `Refund for failed fulfilment ${f.id} of redemption ${f.redemptionRef}${f.ledgerRef ? ` (debit ${f.ledgerRef})` : ""}: ${remarks.trim()}`, approvalCode: f.redemptionRef, evidence: [] });
  if (!r.ok) return r;
  commit(audited({ ...state, issues: state.issues.map((x) => (x.id === issueId ? { ...x, status: "refund_requested", refundRef: r.id ?? null, remarks: [...x.remarks, { at: now(), by: uid, text: remarks.trim() }] } : x)), orders: state.orders.map((o) => (o.redemptionRef === f.redemptionRef ? { ...o, refundRef: r.id ?? null } : o)) }, uid, "redemption", f.redemptionRef, "refund_requested", r.id ?? null, "Linked to the original redemption; posted only after wallet approval"));
  return OK(r.id, ["Refund raised through the wallet service (Maker-Checker). The original redemption is kept"]);
}

/* ======================= Insurance cards ======================= */

export function saveCardType(uid: string, t: Omit<InsuranceCardType, "updatedAt" | "updatedBy">): Res {
  const isNew = !t.id || !state.cardTypes.some((x) => x.id === t.id);
  if (!can(uid, "insurance", isNew ? "create" : "edit")) return NO(need("insurance", isNew ? "Create" : "Edit"));
  const errors: string[] = [];
  if (!t.name.trim()) errors.push("Name the card type");
  if (!t.insurer.trim()) errors.push("Insurer name is required");
  if (t.segmentation.programmes.some((p) => !["EP", "ST", "CS"].includes(p))) errors.push("Insurance cards apply to EP, ST and CS only (Retailer and DD need business confirmation)");
  errors.push(...validateSegmentation(t.segmentation, tiers()));
  if (errors.length) return NO(...errors);
  const id = isNew ? `ICT-${pad(state.cardTypes.length + 1, 3)}` : t.id;
  const next: InsuranceCardType = { ...t, id, name: t.name.trim(), insurer: t.insurer.trim(), updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, cardTypes: isNew ? [...state.cardTypes, next] : state.cardTypes.map((x) => (x.id === id ? next : x)) }, uid, "insurance_type", id, isNew ? "card_type_created" : "card_type_modified", `${next.name} · ${next.segmentation.programmes.join("/")}`, "Insurance card type"));
  return OK(id);
}

/** AF20: turn a card type on or off for a programme. Backend configuration only, no app release. */
export function setTypeEnabled(uid: string, typeId: string, programme: "EP" | "ST" | "CS", enabled: boolean, reason: string): Res {
  if (!can(uid, "insurance", enabled ? "activate" : "disable", programme)) return NO(need("insurance", enabled ? "Activate" : "Deactivate"));
  if (!reason.trim()) return NO("Give a reason");
  const t = state.cardTypes.find((x) => x.id === typeId);
  if (!t) return NO("Card type not found");
  if (!t.segmentation.programmes.includes(programme)) return NO(`${t.name} is not segmented for ${programme}`);
  commit(audited({ ...state, cardTypes: state.cardTypes.map((x) => (x.id === typeId ? { ...x, enabled: { ...x.enabled, [programme]: enabled }, updatedAt: now(), updatedBy: uid } : x)) }, uid, "insurance_type", typeId, enabled ? "segment_enabled" : "segment_disabled", `${programme}: ${enabled ? "on" : "off"}`, `${reason} (backend configuration: no app release required)`, null, String(t.enabled[programme])));
  return OK(typeId);
}

export function uploadInsuranceCsv(uid: string, fileName: string, text: string, sizeKb: number): Res & { headerError?: string } {
  if (!can(uid, "insurance", "create")) return NO(need("insurance", "CSV upload"));
  if (!/\.csv$/i.test(fileName)) return NO("Upload a .csv file");
  const v = validateInsuranceCsv(text, { s: state, mem: mem(), at: now() });
  if (v.headerError) return { ...NO(v.headerError), headerError: v.headerError };
  if (!v.rows.length) return NO("The file has no data rows");
  const id = nextId("INB", state.batches);
  let s: GiftState = { ...state, batches: [...state.batches, { id, fileName, sizeKb, uploadedBy: uid, uploadedAt: now(), policy: state.config.insurancePolicy, rows: v.rows, status: "validated", approvalRequestId: null, approvedBy: null, completedAt: null }] };
  s = audited(s, uid, "insurance_batch", id, "csv_uploaded", `${v.rows.length} rows · ${fileName}`, "");
  s = audited(s, "SYSTEM", "insurance_batch", id, "csv_validated", `${v.rows.filter((r) => r.result === "valid").length} valid · ${v.rows.filter((r) => r.result === "invalid").length} invalid · ${v.rows.filter((r) => r.result === "duplicate").length} duplicate`, "");
  commit(s);
  return OK(id);
}

export function submitInsuranceBatch(uid: string, batchId: string): Res {
  const b = state.batches.find((x) => x.id === batchId);
  if (!b) return NO("Batch not found");
  if (!can(uid, "insurance", "submit")) return NO(need("insurance", "Submit"));
  if (b.status !== "validated") return NO(`Batch is ${b.status.replace("_", " ")}`);
  const valid = b.rows.filter((r) => r.result === "valid");
  if (!valid.length) return NO("No valid records to submit");
  if (b.policy === "atomic" && valid.length !== b.rows.length) return NO(`Atomic upload policy: ${b.rows.length - valid.length} row(s) are invalid or duplicate. Correct the file; a batch is never partially published`);
  const ms = valid.map((r) => memberById(mem(), r.values.member_id)).filter(Boolean) as Member[];
  const regions = [...new Set(ms.map((m) => (geoOfMember(m) as { state?: string }).state ?? ""))].filter(Boolean);
  const tierList = [...new Set(ms.map((m) => state.config.tierAssignments[m.id]).filter(Boolean))];
  const r = raise(uid, insuranceBatchSpec(b, [...new Set(ms.map((m) => m.programme))], regions, tierList, wmText(state.render)));
  if (!r.ok) return r;
  commit(audited({ ...state, batches: state.batches.map((x) => (x.id === batchId ? { ...x, status: "pending_approval", approvalRequestId: r.id ?? null } : x)) }, uid, "insurance_batch", batchId, "upload_submitted", `${valid.length} records`, "Maker-Checker approval required (SOW 8.4)", r.id ?? null));
  return OK(batchId);
}
const wmText = (r: RenderConfig) => (r.watermark.text ? `${r.watermark.text} · ${r.watermark.position} · ${r.watermark.opacity} (development setting)` : "Not configured (OP-INS1)");

function processBatch(s: GiftState, batchId: string, apr: string, approver: string): { s: GiftState; ok: boolean; message: string } {
  const b = s.batches.find((x) => x.id === batchId)!;
  // Re-validate against the current state (cards created since upload count as duplicates).
  const header = Object.keys(b.rows[0]?.values ?? {});
  const csv = [header.join(","), ...b.rows.map((r) => header.map((h) => `"${(r.values[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const re = validateInsuranceCsv(csv, { s, mem: mem(), at: now() });
  const ok = re.rows.map((r, i) => ({ row: b.rows[i], now: r })).filter((x) => x.row.result === "valid");
  const failing = ok.filter((x) => x.now.result !== "valid");
  if (b.policy === "atomic" && failing.length) {
    const rows = b.rows.map((r) => (r.result === "valid" ? { ...r, result: "failed" as const, errors: [...r.errors, ...(re.rows[b.rows.indexOf(r)]?.errors ?? [])] } : r));
    const out = audited({ ...s, batches: s.batches.map((x) => (x.id === batchId ? { ...x, rows, status: "failed", approvedBy: approver, completedAt: now() } : x)) }, "SYSTEM", "insurance_batch", batchId, "batch_failed", `${failing.length} row(s) failed re-validation`, "Atomic policy: no card was created", apr);
    return { s: out, ok: false, message: `Not processed: ${failing.length} row(s) failed re-validation and the policy is atomic. No card was created` };
  }
  let cards = [...s.cards];
  const rows = b.rows.map((r, i) => {
    if (r.result !== "valid") return { ...r, result: "rejected" as const };
    if (re.rows[i].result !== "valid") return { ...r, result: "failed" as const, errors: re.rows[i].errors };
    const m = memberById(mem(), r.values.member_id)!;
    const [from, to] = r.values["Validity Dates"].split(/\s+to\s+/i);
    const id = `INC-${pad(cards.length + 1, 5)}`;
    cards.push({ id, typeId: r.values.card_type, memberId: m.id, programme: m.programme as "EP", name: r.values.Name, numberMasked: maskInsurance(r.values.Number), numberKey: insuranceKey(r.values["Insurer Name"], r.values.Number), qualification: r.values.Qualification, tollFree: r.values["Toll-Free Number"], amount: Number(r.values["Insurance Amount"]), validFrom: from, validTo: to, insurer: r.values["Insurer Name"], region: (geoOfMember(m) as { state?: string }).state ?? "", tier: s.config.tierAssignments[m.id] ?? null, active: false, publication: { status: "unpublished", ref: null, at: null, approvalRequestId: null }, batchId, createdAt: now(), history: [{ at: now(), by: "SYSTEM", action: "insurance_record_created", detail: `Approved batch ${batchId}` }] });
    return { ...r, result: "imported" as const, cardId: id };
  });
  // Raw insurance numbers are not kept after processing: only the masked form and the key.
  const scrubbed = rows.map((r) => ({ ...r, values: { ...r.values, Number: maskInsurance(r.values.Number ?? "") } }));
  cards = cards.slice();
  const imported = rows.filter((r) => r.result === "imported").length;
  let out: GiftState = { ...s, cards, batches: s.batches.map((x) => (x.id === batchId ? { ...x, rows: scrubbed, status: "completed", approvedBy: approver, completedAt: now() } : x)) };
  for (const r of rows.filter((x) => x.cardId)) out = audited(out, "SYSTEM", "insurance_card", r.cardId!, "insurance_record_created", r.values.member_id, `Batch ${batchId}`, apr);
  out = audited(out, "SYSTEM", "insurance_batch", batchId, "batch_processed", `${imported} imported · ${rows.filter((r) => r.result === "rejected").length} rejected · ${rows.filter((r) => r.result === "failed").length} failed`, "Mock insurance-card service. Cards are created unpublished", apr);
  return { s: out, ok: true, message: `${imported} card record(s) created (unpublished). Publication is a separate approval` };
}

export function requestPublication(uid: string, cardIds: string[]): Res {
  if (!can(uid, "insurance", "publish")) return NO(need("insurance", "Publish"));
  const cards = cardIds.map((id) => state.cards.find((c) => c.id === id)).filter(Boolean) as InsuranceCard[];
  if (!cards.length) return NO("Choose the cards to publish");
  const errors: string[] = [];
  for (const c of cards) {
    if (c.publication.status !== "unpublished") errors.push(`${c.id} is already ${c.publication.status.replace("_", " ")}`);
    if (c.validTo < day(now())) errors.push(`${c.id} has expired (${c.validTo})`);
  }
  if (errors.length) return NO(...errors);
  const id = nextId("PUB", state.publications);
  const r = raise(uid, insurancePublishSpec(id, cards, wmText(state.render), state.render.productionFormat ?? "Business Confirmation Required (OP-INS1)"));
  if (!r.ok) return r;
  let s: GiftState = { ...state, publications: [...state.publications, { id, cardIds, status: "pending_approval", approvalRequestId: r.id ?? null, requestedBy: uid, requestedAt: now(), publishedAt: null }], cards: state.cards.map((c) => (cardIds.includes(c.id) ? { ...c, publication: { status: "pending_approval", ref: id, at: null, approvalRequestId: r.id ?? null } } : c)) };
  s = audited(s, uid, "insurance_card", id, "publication_submitted", `${cards.length} card(s)`, "Preview and test download reviewed", r.id ?? null);
  commit(s);
  const photoIssues = cards.filter((c) => cardModel(c, memberById(mem(), c.memberId), mem(), state.render, true).photo.status !== "approved").map((c) => `${c.id}: invalid profile photo reference`);
  return OK(id, photoIssues);
}

/** AF20 on / off for one card. Only an approved (published) card can be activated; validity dates never change. */
export function setCardActive(uid: string, cardId: string, active: boolean, reason: string): Res {
  const c = state.cards.find((x) => x.id === cardId);
  if (!c) return NO("Card not found");
  if (!canOnMember(uid, "insurance", active ? "activate" : "disable", c.memberId)) return NO(need("insurance", active ? "Activate" : "Deactivate"));
  if (!reason.trim()) return NO("Give a reason");
  if (active) {
    if (c.publication.status !== "published") return NO("This card has not been published through approval: activation is not allowed");
    if (c.validTo < day(now())) return NO(`The card expired on ${c.validTo}. Validity dates are not changed by activation`);
  }
  if (c.active === active) return NO(`Card is already ${active ? "active" : "inactive"}`);
  commit(audited({ ...state, cards: state.cards.map((x) => (x.id === cardId ? { ...x, active, history: [...x.history, { at: now(), by: uid, action: active ? "card_activated" : "card_deactivated", detail: reason.trim() }] } : x)) }, uid, "insurance_card", cardId, active ? "card_activated" : "card_deactivated", String(active), `${reason.trim()} (backend change: no app release required)`, null, String(c.active)));
  return OK(cardId);
}

export function previewCard(uid: string, cardId: string): Res & { model?: CardModel } {
  const c = state.cards.find((x) => x.id === cardId);
  if (!c) return NO("Card not found");
  if (!canOnMember(uid, "insurance", "view_sensitive", c.memberId)) return NO("You need Insurance cards: View sensitive (card preview) for this member");
  const model = cardModel(c, memberById(mem(), c.memberId), mem(), state.render, true);
  commit(audited(state, uid, "insurance_card", cardId, "preview_generated", null, "Card preview"));
  return { ...OK(cardId, model.photo.status !== "approved" ? [model.photo.note] : []), model };
}

/** Records a permitted test download; the page renders the JPEG (canvas) or PDF (buildTestPdf). */
export function recordTestDownload(uid: string, cardId: string, format: "jpeg" | "pdf"): Res & { model?: CardModel } {
  const c = state.cards.find((x) => x.id === cardId);
  if (!c) return NO("Card not found");
  if (!canOnMember(uid, "insurance", "download", c.memberId)) return NO("You need Insurance cards: Download (test download) for this member");
  if (!state.render.formats[format]) return NO(`${format.toUpperCase()} output is switched off in the render configuration`);
  const model = cardModel(c, memberById(mem(), c.memberId), mem(), state.render, true);
  const id = nextId("TDL", state.downloads);
  commit(audited({ ...state, downloads: [...state.downloads, { id, cardId, format, at: now(), by: uid, watermark: model.watermark?.text ?? "none" }] }, uid, "insurance_card", cardId, "test_download_generated", `${format.toUpperCase()} · ${id}`, "Test preview, not an issued card"));
  return { ...OK(id), model };
}

export function setWatermark(uid: string, w: Partial<RenderConfig["watermark"]>): Res {
  if (!can(uid, "insurance", "edit")) return NO(need("insurance", "Edit"));
  if (w.opacity != null && (w.opacity <= 0 || w.opacity > 1)) return NO("Opacity must be between 0 and 1");
  const prev = state.render.watermark;
  const next = { ...prev, ...w, status: w.text ? ("development_setting" as const) : ("not_set" as const) };
  if (next.text && (!next.position || next.opacity == null)) return NO("Set the watermark position and opacity with the text");
  commit(audited({ ...state, render: { ...state.render, watermark: next } }, uid, "render_config", "WATERMARK", "watermark_configuration_changed", wmText({ ...state.render, watermark: next }), "Development setting: final rules are open (OP-INS1)", null, wmText(state.render)));
  return OK(undefined, ["Recorded as a development setting, not a confirmed production rule"]);
}
export function setRenderFormats(uid: string, formats: RenderConfig["formats"]): Res {
  if (!can(uid, "insurance", "edit")) return NO(need("insurance", "Edit"));
  if (!formats.jpeg && !formats.pdf) return NO("Keep at least one output format for previews");
  commit(audited({ ...state, render: { ...state.render, formats } }, uid, "render_config", "FORMATS", "render_formats_changed", `${formats.jpeg ? "JPEG " : ""}${formats.pdf ? "PDF" : ""}`.trim(), "Production format stays Business Confirmation Required (OP-INS1)"));
  return OK();
}
export function setInsuranceSettings(uid: string, patch: Partial<Pick<GiftState["config"], "insuranceNumberRule" | "insurancePolicy">>): Res {
  if (!can(uid, "insurance", "edit")) return NO(need("insurance", "Edit"));
  commit(audited({ ...state, config: { ...state.config, ...patch } }, uid, "config", "INSURANCE", "insurance_settings_changed", JSON.stringify(patch), "Development setting (GD-03 / OP-INS1); applies to new uploads"));
  return OK();
}

/** Development control: record a member tier reference while the tier service does not expose member tiers. */
export function setDevTier(uid: string, memberId: string, tierId: string | null): Res {
  if (!can(uid, "gift-catalogue", "manage")) return NO(need("gift-catalogue", "Manage"));
  const m = memberById(mem(), memberId);
  if (!m) return NO("Member not found");
  if (tierId && !tiers().some((t) => t.id === tierId && t.programme === m.programme && t.status === "active")) return NO("Choose an active tier of the member's programme from the Tier master");
  const t = { ...state.config.tierAssignments };
  if (tierId) t[memberId] = tierId;
  else delete t[memberId];
  commit(audited({ ...state, config: { ...state.config, tierAssignments: t } }, uid, "config", memberId, "dev_tier_reference", tierId, "Development tier reference (tier service not connected)"));
  return OK(memberId);
}

/* ======================= Governance ======================= */

export function updateGiftDecision(uid: string, id: string, patch: { status: GiftState["decisions"][number]["status"]; answer: string }): Res {
  if (!can(uid, "gift-catalogue", "manage") && !can(uid, "insurance", "edit")) return NO("You need Gift catalogue: Manage or Insurance cards: Edit");
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if (patch.status === "confirmed" && !patch.answer.trim()) return NO("Record the confirmed answer");
  commit(audited({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, uid, "decision", id, patch.status, patch.answer, d.question, null, d.status));
  return OK(id);
}
export function recordGiftExport(uid: string, module: string, name: string, rows: number): Res {
  if (!can(uid, module, "export")) return NO(need(module, "Export"));
  commit(audited(state, uid, "export", name, "exported", `${rows} rows`, "CSV export"));
  return OK();
}

/** Balance shown on the backend redemption form (read from the wallet engine; never edited here). */
export const availablePoints = (memberId: string) => memberBalances(walletStore.get(), schemeStore.get(), mem(), memberId).available;
export const memberSegmentReasons = (giftId: string, memberId: string) => {
  const g = state.items.find((x) => x.id === giftId);
  const m = memberById(mem(), memberId);
  return g && m ? segmentReasons(g.segmentation, m, state.config.tierAssignments[m.id] ?? null) : [];
};

/* ======================= Execution handlers ======================= */

const approversOf = (r: ApprovalRequest) => r.stages.map((x) => x.decidedBy).filter(Boolean) as string[];
const notFound = (r: ApprovalRequest) => ({ ok: false, message: `Not executed: no Gift & Fulfilment record matches ${r.entityRef} (earlier demo request). Nothing changed` });

function execCatalogue(r: ApprovalRequest) {
  if (r.requestType === "gift_point_cost_change") {
    const c = state.costs.find((x) => x.id === r.entityRef);
    if (!c) return notFound(r);
    if (c.status === "active") return { ok: true, message: `${c.id} already active (idempotent)` };
    const errors = validateCostRule({ ...state, costs: state.costs.filter((x) => x.id !== c.id) }, { ...c, status: "draft" });
    if (errors.length) return { ok: false, message: `Not activated: ${errors.join("; ")}` };
    commit(activateCost(state, c.id, "SYSTEM", r.id));
    return { ok: true, message: `${c.id} active: ${c.points} points from ${c.effectiveFrom}` };
  }
  const [id] = r.entityRef.split(" v");
  const i = state.items.find((x) => x.id === id);
  if (!i) return notFound(r);
  if (i.status === "active" && !i.draft) return { ok: true, message: `${id} already published (idempotent)` };
  commit(publishItem(state, id, "SYSTEM", r.id));
  return { ok: true, message: `${id} published. Approved by ${approversOf(r).join(", ")}` };
}

function execRecovery(r: ApprovalRequest) {
  const rec = state.recoveries.find((x) => x.id === r.entityRef);
  if (!rec) return notFound(r);
  if (rec.status === "completed") return { ok: true, message: `${rec.id} already executed (idempotent)` };
  const v = state.vouchers.find((x) => x.id === rec.voucherId)!;
  let outcome: RecoveryOutcome = providerAnswer.get(rec.id) ?? "code_retrieved";
  if (voucherStatusAt(v, now()) === "expired") outcome = "expired";
  let s = state;
  let reissued: string | null = null;
  const detail: Record<string, string> = { code_retrieved: "Provider re-sent the existing code to the registered mobile (mock). No new voucher", reissued: "Provider issued a replacement; the original voucher is marked Replaced", failed: "Provider could not recover the code", provider_review: "Provider needs to review the request", not_recoverable: "Provider says the voucher cannot be recovered", expired: "Voucher expired before recovery" };
  if (outcome === "reissued") {
    const nv: VoucherRecord = { ...v, id: `VCH-${pad(s.vouchers.length + 1, 5)}`, codeMasked: maskCode(String(1000 + (parseInt(hashKey(rec.id).slice(0, 6), 16) % 8999))), vaultRef: `DEV-VAULT-${rec.id}`, issuedAt: now(), providerRef: `MOCK-VPR-${rec.id}`, delivery: { whatsapp: "pending", inapp: "pending", commId: `EVT-N09-${rec.id}-reissued` }, callbackIds: [], origin: "recovery_reissue" };
    reissued = nv.id;
    s = { ...s, vouchers: [...s.vouchers.map((x) => (x.id === v.id ? { ...x, status: "replaced" as const } : x)), nv] };
    s = audited(s, "SYSTEM", "voucher", nv.id, "voucher_reissued", nv.codeMasked, `Replaces ${v.id}`, r.id, null, nv.providerRef);
  }
  const success = outcome === "code_retrieved" || outcome === "reissued";
  if (success) outbox.push(n09(outcome === "reissued" ? `EVT-N09-${rec.id}-reissued` : `EVT-N09-${rec.id}-recovered`, "voucher.reissued", reissued ?? v.id, now(), rec.memberId, { gift_ref: reissued ?? v.id, gift_status: outcome === "reissued" ? "reissued" : "re-sent", expiry: v.expiresOn ?? "" }));
  s = { ...s, recoveries: s.recoveries.map((x) => (x.id === rec.id ? { ...x, status: "completed", outcome, outcomeDetail: detail[outcome], reissuedVoucherId: reissued, commId: success ? (outcome === "reissued" ? `EVT-N09-${rec.id}-reissued` : `EVT-N09-${rec.id}-recovered`) : null, events: [...x.events, { at: now(), event: outcome, detail: detail[outcome] }] } : x)) };
  s = audited(s, "SYSTEM", "voucher", v.id, success ? (outcome === "reissued" ? "voucher_reissued" : "voucher_code_resent") : "voucher_recovery_failed", outcome, detail[outcome], r.id);
  commit(s);
  flushN09();
  return { ok: success, message: detail[outcome] };
}

function execInsurance(r: ApprovalRequest) {
  if (r.requestType === "insurance_card_publish") {
    const p = state.publications.find((x) => x.id === r.entityRef);
    if (!p) return notFound(r);
    if (p.status === "published") return { ok: true, message: `${p.id} already published (idempotent)` };
    const today = day(now());
    let s: GiftState = { ...state, publications: state.publications.map((x) => (x.id === p.id ? { ...x, status: "published", publishedAt: now() } : x)), cards: state.cards.map((c) => (p.cardIds.includes(c.id) ? { ...c, active: c.validTo >= today, publication: { status: "published", ref: p.id, at: now(), approvalRequestId: r.id }, history: [...c.history, { at: now(), by: "SYSTEM", action: "card_published", detail: `${p.id} approved` }] } : c)) };
    s = audited(s, "SYSTEM", "insurance_card", p.id, "card_published", `${p.cardIds.length} card(s)`, "Available through the member application contract (not connected in this build)", r.id);
    commit(s);
    return { ok: true, message: `${p.cardIds.length} card(s) published and active (backend configuration; no app release)` };
  }
  const b = state.batches.find((x) => x.id === r.entityRef);
  if (!b) return notFound(r);
  if (b.status === "completed") return { ok: true, message: `${b.id} already processed (idempotent)` };
  const out = processBatch({ ...state, batches: state.batches.map((x) => (x.id === b.id ? { ...x, status: "approved" } : x)) }, b.id, r.id, approversOf(r).slice(-1)[0] ?? "");
  commit(audited(out.s, "SYSTEM", "insurance_batch", b.id, "upload_approved", approversOf(r).join(", "), "Approved in the Approval Engine", r.id));
  return { ok: out.ok, message: out.message };
}

registerExecutionHandler("gift-catalogue", execCatalogue);
registerExecutionHandler("vouchers", execRecovery);
registerExecutionHandler("insurance", execInsurance);

/** Keeps statuses in step with the approval engine (rejections, returns and withdrawals). */
function syncFromApprovals() {
  const reqs = approvalStore.get().requests;
  const st = (id: string | null) => reqs.find((r) => r.id === id)?.status;
  const back = (s: string | undefined) => s === "rejected" || s === "returned" || s === "withdrawn";
  let changed = false;
  const items = state.items.map((i) => {
    if (i.status === "pending_approval" && back(st(i.approvalRequestId))) {
      changed = true;
      return { ...i, status: st(i.approvalRequestId) === "rejected" ? ("rejected" as const) : ("draft" as const) };
    }
    if (i.draft?.status === "pending_approval" && back(st(i.draft.approvalRequestId))) {
      changed = true;
      return { ...i, draft: st(i.draft.approvalRequestId) === "rejected" ? null : { ...i.draft, status: "draft" as const } };
    }
    return i;
  });
  const costs = state.costs.map((c) => (c.status === "pending_approval" && back(st(c.approvalRequestId)) ? ((changed = true), { ...c, status: st(c.approvalRequestId) === "rejected" ? ("rejected" as const) : ("draft" as const) }) : c));
  const recoveries = state.recoveries.map((x) => (x.status === "pending_approval" && back(st(x.approvalRequestId)) ? ((changed = true), { ...x, status: "rejected" as const, outcome: "rejected" as const, events: [...x.events, { at: now(), event: "rejected", detail: `Request ${st(x.approvalRequestId)}` }] }) : x));
  const batches = state.batches.map((b) => (b.status === "pending_approval" && back(st(b.approvalRequestId)) ? ((changed = true), { ...b, status: st(b.approvalRequestId) === "rejected" ? ("rejected" as const) : ("validated" as const) }) : b));
  const rejectedPubs = state.publications.filter((p) => p.status === "pending_approval" && back(st(p.approvalRequestId))).map((p) => p.id);
  const publications = state.publications.map((p) => (rejectedPubs.includes(p.id) ? ((changed = true), { ...p, status: "rejected" as const }) : p));
  const cards = state.cards.map((c) => (c.publication.ref && rejectedPubs.includes(c.publication.ref) ? { ...c, publication: { status: "unpublished" as const, ref: null, at: null, approvalRequestId: null } } : c));
  if (changed) commit({ ...state, items, costs, recoveries, batches, publications, cards });
}

/** Fulfils every completed Phase 7 gift redemption that points at a Gift Catalogue item (idempotent). */
function syncFromWallet() {
  for (const g of walletStore.get().gifts) if (g.status === "completed" && g.catalogueRef.startsWith("GIF-") && !state.fulfilled.includes(g.id)) fulfilRedemption(g.id);
}

approvalStore.subscribe(syncFromApprovals);
syncFromApprovals();
walletStore.subscribe(syncFromWallet);
syncFromWallet();

/** Gifts History integration data for the member application contract (the app itself is not connected). */
export function giftsHistory(memberId: string) {
  const at = now();
  return [
    ...state.vouchers.filter((v) => v.memberId === memberId).map((v) => ({ ref: v.id, kind: "voucher" as const, giftId: v.giftId, partner: v.partnerId, status: voucherStatusAt(v, at), issuedAt: v.issuedAt, expiresOn: v.expiresOn, redemptionRef: v.redemptionRef })),
    ...state.orders.filter((o) => o.memberId === memberId).map((o) => ({ ref: o.id, kind: "order" as const, giftId: o.giftId, partner: o.partnerId, status: o.status, issuedAt: o.createdAt, expiresOn: null, redemptionRef: o.redemptionRef })),
  ];
}
