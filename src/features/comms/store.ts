/**
 * COMMUNICATION CENTRE STORE — in-browser mock repository (Phase 8).
 *
 * - Every communication instance belongs to a Notification Catalogue entry or an approved manual category.
 * - Rule-based messages come only from authoritative events read by the event bridge (Member, KYC,
 *   Wallet, Scheme stores). Event IDs are stable, so duplicates never dispatch twice.
 * - Approval follows the configurable policy per category and uses the central Approval Engine;
 *   approval never dispatches. Dispatch needs Communication: Execute or the scheduler.
 * - Providers are mock adapters: an accepted request is not a delivered message.
 * - Every action re-checks RBAC and writes an append-only audit event.
 */
import { useSyncExternalStore } from "react";
import { BOT_ACTION, DEEP_LINKS } from "@/config/commsCatalogue";
import { accessStore } from "@/features/access/store";
import { hasPermission, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow, withdrawRequest } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { geoOfMember, memberById } from "@/features/members/engine";
import { memberStore } from "@/features/members/store";
import { masterStore } from "@/features/masters/store";
import { schemeStore } from "@/features/schemes/store";
import { walletStore } from "@/features/wallet/store";
import { memberBalances } from "@/features/wallet/engine";
import type { ApprovalRequest } from "@/types/approval";
import type { ActionId } from "@/types/rbac";
import type { Member } from "@/types/members";
import type { AudienceDefinition, Banner, BotMenu, Channel, Communication, CommsState, Faq, HelpdeskQuery, HowToGuide, NotificationEntry, NotificationId, RichContent, SlaPolicy, SocialLink, Survey, TemplateTranslation } from "@/types/comms";
import { activeVersion, deepLinkOk, langOf, latestVersion, overallStatus, planAttempts, resolveAudience, validateComposition, validateMenu, validateTemplate, type Recipient } from "./engine";
import { collectEvents } from "./events";
import { botSpec, communicationSpec, contentSpec, surveySpec, templateSpec, type CommsSpec } from "./requests";
import { buildCommsSeed } from "./seed";

const STORAGE_KEY = "vg-rishta.comms-store.v1";
type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const now = () => demoNow();
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const nextId = (prefix: string, list: { id: string }[]) => `${prefix}-${pad(list.reduce((n, x) => Math.max(n, Number(x.id.split("-").pop()) || 0), 0) + 1)}`;

/* ---------------- Store plumbing ---------------- */

function linkApprovals(s: CommsState): CommsState {
  const reqs = approvalStore.get().requests;
  const find = (ref: string) => [...reqs].reverse().find((r) => r.entityRef === ref)?.id ?? null;
  return {
    ...s,
    communications: s.communications.map((c) => ({ ...c, approvalRequestId: c.approvalRequestId ?? find(c.id) })),
    templates: s.templates.map((t) => ({ ...t, versions: t.versions.map((v) => ({ ...v, approvalRequestId: v.approvalRequestId ?? (v.status === "pending_approval" ? find(`${t.id} v${v.version}`) : null) })) })),
    rich: s.rich.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
    surveys: s.surveys.map((x) => ({ ...x, approvalRequestId: x.approvalRequestId ?? find(x.id) })),
  };
}

let state: CommsState;
const listeners = new Set<() => void>();
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function commit(next: CommsState) {
  if (next === state) return;
  state = next;
  persist();
  listeners.forEach((l) => l());
}
function load(): CommsState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CommsState;
  } catch {
    /* seed */
  }
  return linkApprovals(buildCommsSeed());
}
state = load();
export const commsStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useCommsState = () => useSyncExternalStore(commsStore.subscribe, commsStore.get, commsStore.get);
export const resetCommsDemoData = () => {
  state = linkApprovals(buildCommsSeed());
  processEvents();
  persist();
  listeners.forEach((l) => l());
};

function audit(s: CommsState, actor: string, entity: string, entityId: string, action: string, after: string | null, reason: string, approvalRequestId: string | null = null, before: string | null = null): CommsState {
  return { ...s, audit: [...s.audit, { id: `CAE-${pad(s.audit.length + 1, 6)}`, at: now(), actor, entity, entityId, action, before, after, reason, approvalRequestId }] };
}

/** Programme + geography scope for member-level communication. */
const memberScope = (uid: string, module = "communication", action: ActionId = "view") => (m: Member) => hasPermission(acc(), uid, module, action, { programme: m.programme, geo: geoOfMember(m) }).allowed;
const can = (uid: string, module: string, action: ActionId, programme?: string) => hasPermission(acc(), uid, module, action, programme ? { programme } : {}).allowed;
const LABEL: Record<string, string> = { communication: "Communication centre", "comm-templates": "Notification catalogue & templates", content: "Content", banners: "Banners & scrollers", "comm-bot": "WhatsApp bot", tickets: "Tickets & support", surveys: "Surveys" };
const need = (m: string, a: string) => `You need ${LABEL[m] ?? m}: ${a}`;

function raise(uid: string, s: CommsSpec) {
  return createRequest(uid, { requestType: s.type, title: s.title, entityRef: s.entity, programme: s.programme, location: null, amount: null, fields: s.fields, purpose: s.purpose, reason: s.reason, justification: s.justification, attachments: [], impact: null }, true);
}

/* ======================= Dispatch ======================= */

function templateFor(c: Communication, ch: Channel) {
  const t = state.templates.find((x) => c.templateIds.includes(x.id) && x.channel === ch);
  return { id: t?.id ?? null, version: t?.activeVersion ?? null };
}

function dispatch(s: CommsState, c: Communication, recipients: Recipient[], entry: NotificationEntry | undefined, at: string): CommsState {
  const attempts = planAttempts(c.id, recipients, c.channels, (ch) => templateFor(c, ch), entry, at, s.seq);
  const status = overallStatus(attempts);
  return { ...s, seq: s.seq + attempts.length, attempts: [...s.attempts, ...attempts], communications: s.communications.map((x) => (x.id === c.id ? { ...x, status, dispatchedAt: at, audienceCount: recipients.filter((r) => r.kind === "member").length } : x)) };
}

/** Language per recipient: member preference if the template has it, else English, recorded as a fallback. */
function recipientsFor(c: Communication, members: Member[]): Recipient[] {
  return members.map((m) => {
    const pref = langOf(m);
    const okLang = c.languages.includes(pref) && c.templateIds.every((id) => { const t = state.templates.find((x) => x.id === id); const v = t && activeVersion(t); return !v || v.translations.some((tr) => tr.lang === pref && tr.status !== "missing"); });
    return { id: m.id, kind: "member" as const, member: m, lang: okLang ? pref : "en" };
  });
}

/* ======================= Event processing (rule-based, N01–N11) ======================= */

const STAFF_SR = (m: Member | undefined) => (m?.programme === "EP" && m.sr ? `SR:${m.sr}` : null);

/** Processes new authoritative events. Duplicates (same event ID) only increase the received count. */
export function processEvents(): { processed: number; duplicates: number } {
  const drafts = collectEvents({ mem: mem(), ws: walletStore.get(), ss: schemeStore.get(), ms: masterStore.get() }, state.subscriptionStart);
  return ingest(drafts);
}

export function ingest(drafts: ReturnType<typeof collectEvents>): { processed: number; duplicates: number } {
  let s = state;
  let processed = 0;
  let duplicates = 0;
  const known = new Map(s.events.map((e) => [e.id, e]));
  for (const d of drafts) {
    const prior = known.get(d.id);
    if (prior) {
      duplicates++;
      continue;
    }
    const entry = s.catalogue.find((e) => e.id === d.notificationId)!;
    const m = d.memberId ? memberById(mem(), d.memberId) : undefined;
    if (!entry.enabled) {
      const e = { ...d, status: "skipped_disabled" as const, commId: null, detail: `${entry.id} disabled in the catalogue`, receivedCount: 1 };
      s = { ...s, events: [...s.events, e] };
      known.set(d.id, e);
      continue;
    }
    if (!m || (m.status === "rejected" && entry.id !== "N01")) {
      const e = { ...d, status: "skipped_ineligible" as const, commId: null, detail: m ? "Member not eligible for this notification" : "Member not found", receivedCount: 1 };
      s = { ...s, events: [...s.events, e] };
      known.set(d.id, e);
      continue;
    }
    const commId = `RULE-${pad(s.communications.length + 1, 6)}`;
    const templateIds = s.templates.filter((t) => t.notificationId === entry.id && t.activeVersion != null).map((t) => t.id);
    const c: Communication = { id: commId, name: `${entry.id} · ${entry.name}`, description: d.type, mode: "rule", notificationId: entry.id, category: entry.inboxCategory, purpose: entry.name, priority: entry.policy === "critical" ? "high" : "normal", audience: { programmes: [], states: [], districts: [], branches: [], memberIds: [m.id], roles: [], statuses: [] }, audienceCount: 1, channels: entry.channels, languages: state.languages.map((l) => l.code), templateIds, deepLink: null, scheduledAt: null, justification: "", status: "queued", approvalRequestId: null, eventId: d.id, createdBy: "SYSTEM", createdAt: d.at, dispatchedAt: null, cancelledAt: null, manualContent: null, version: 1 };
    s = { ...s, communications: [...s.communications, c] };
    const prev = state;
    state = s;
    const recips = recipientsFor(c, [m]);
    const sr = (entry.id === "N01" || entry.id === "N02") ? STAFF_SR(m) : null;
    if (sr) recips.push({ id: sr, kind: "staff", member: null, lang: "en" });
    s = dispatch(s, c, recips, entry, d.at);
    state = prev;
    const e = { ...d, status: "processed" as const, commId, detail: `${recips.length} recipient(s) · ${entry.channels.join(", ")}`, receivedCount: 1 };
    s = { ...s, events: [...s.events, e] };
    known.set(d.id, e);
    processed++;
  }
  if (s !== state) commit(s);
  return { processed, duplicates };
}

/** Test / integration hook: the same source event delivered again is recorded as a duplicate, not re-sent. */
export function redeliverEvent(eventId: string): Res {
  const e = state.events.find((x) => x.id === eventId);
  if (!e) return NO("Event not found");
  commit({ ...state, events: state.events.map((x) => (x.id === eventId ? { ...x, receivedCount: x.receivedCount + 1 } : x)) });
  return OK(eventId, [`Duplicate delivery of ${eventId} recorded; no message dispatched (idempotent event reference)`]);
}

/* ======================= Communications ======================= */

export function saveCommunication(uid: string, input: Communication): Res {
  const isNew = !input.id || !state.communications.some((c) => c.id === input.id);
  if (!can(uid, "communication", isNew ? "create" : "edit")) return NO(need("communication", isNew ? "Create" : "Edit"));
  const prev = state.communications.find((c) => c.id === input.id);
  if (prev && !["draft", "returned", "rejected"].includes(prev.status) && prev.status !== "scheduled" && prev.status !== "approved") return NO(`A ${prev.status.replace(/_/g, " ")} communication cannot be edited`);
  const id = isNew ? nextId("COMM", state.communications.filter((c) => c.id.startsWith("COMM-"))) : input.id;
  const a = resolveAudience(mem(), input.audience, memberScope(uid), input.channels);
  // Editing a scheduled or approved communication returns it to draft: it must be approved again.
  const c: Communication = { ...input, id, mode: input.mode, status: "draft", audienceCount: a.included.length, createdBy: prev?.createdBy ?? uid, createdAt: prev?.createdAt ?? now(), version: (prev?.version ?? 0) + 1, approvalRequestId: null };
  let s = { ...state, communications: isNew ? [...state.communications, c] : state.communications.map((x) => (x.id === id ? c : x)) };
  s = audited(s, uid, "communication", id, isNew ? "created" : prev && prev.status !== "draft" ? "edited_after_schedule" : "edited", `${c.name} · ${a.included.length} recipients`, prev && prev.status !== "draft" ? "Edited after scheduling / approval: returned to draft for re-approval" : "Draft saved");
  commit(s);
  return OK(id);
}
function audited(s: CommsState, actor: string, entity: string, id: string, action: string, after: string | null, reason: string, apr: string | null = null, before: string | null = null) {
  return audit(s, actor, entity, id, action, after, reason, apr, before);
}

export function submitCommunication(uid: string, id: string): Res {
  const c = state.communications.find((x) => x.id === id);
  if (!c) return NO("Communication not found");
  if (!can(uid, "communication", "submit")) return NO(need("communication", "Submit"));
  if (c.status !== "draft") return NO(`Communication is ${c.status.replace(/_/g, " ")}`);
  const v = validateComposition(state, mem(), c, memberScope(uid), now());
  if (!v.ok) return { ...NO(...v.errors) };
  const policyKey = c.notificationId === "N04" ? "scheme" : c.category === "scheme_announcement" ? "scheme" : c.notificationId ? state.catalogue.find((e) => e.id === c.notificationId)!.policy : "manual";
  const policy = state.policies[policyKey];
  if (!policy.approval) {
    commit(audited({ ...state, communications: state.communications.map((x) => (x.id === id ? { ...x, status: c.scheduledAt ? "scheduled" : "approved", audienceCount: v.audience.included.length } : x)) }, uid, "communication", id, "submitted_no_approval", c.scheduledAt ?? "Ready to send", `Policy ${policyKey}: no approval required`));
    return OK(id, v.warnings);
  }
  const r = raise(uid, communicationSpec({ ...c, audienceCount: v.audience.included.length }));
  if (!r.ok) return r;
  commit(audited({ ...state, communications: state.communications.map((x) => (x.id === id ? { ...x, status: "pending_approval", approvalRequestId: r.id ?? null, audienceCount: v.audience.included.length } : x)) }, uid, "communication", id, "submitted", `${v.audience.included.length} recipients`, `Policy ${policyKey} requires approval`, r.id ?? null));
  return OK(id, v.warnings);
}

/** Send an approved communication now. Approval alone never dispatches. */
export function dispatchCommunication(uid: string, id: string): Res {
  const c = state.communications.find((x) => x.id === id);
  if (!c) return NO("Communication not found");
  if (!can(uid, "communication", "execute")) return NO(need("communication", "Execute (send)"));
  if (c.status !== "approved") return NO(c.status === "scheduled" ? "Scheduled communications are dispatched by the scheduler at the scheduled time" : `Only approved communications can be sent (now ${c.status.replace(/_/g, " ")})`);
  const v = validateComposition(state, mem(), { ...c, scheduledAt: null }, memberScope(uid), now());
  if (!v.ok) return NO(...v.errors.map((e) => `Re-validation at dispatch: ${e}`));
  const entry = c.notificationId ? state.catalogue.find((e) => e.id === c.notificationId) : undefined;
  let s = dispatch(state, c, recipientsFor(c, v.audience.included), entry, now());
  s = audited(s, uid, "communication", id, "dispatched", `${v.audience.included.length} recipients`, "Sent through mock provider adapters");
  commit(s);
  return OK(id, ["Simulated dispatch: no real WhatsApp, SMS, email or push message was sent"]);
}

/** Scheduler tick: dispatches approved scheduled communications that are due. */
export function runScheduler(at = now()): number {
  let n = 0;
  for (const c of state.communications.filter((x) => x.status === "scheduled" && x.scheduledAt && x.scheduledAt <= at)) {
    const a = resolveAudience(mem(), c.audience, () => true, c.channels);
    commit(audited(dispatch(state, c, recipientsFor(c, a.included), c.notificationId ? state.catalogue.find((e) => e.id === c.notificationId) : undefined, at), "SYSTEM", "communication", c.id, "dispatched_by_scheduler", `${a.included.length} recipients`, `Scheduled for ${c.scheduledAt}`));
    n++;
  }
  return n;
}

export function cancelCommunication(uid: string, id: string, reason: string): Res {
  const c = state.communications.find((x) => x.id === id);
  if (!c) return NO("Communication not found");
  if (!can(uid, "communication", "cancel")) return NO(need("communication", "Cancel"));
  if (!["draft", "pending_approval", "approved", "scheduled"].includes(c.status)) return NO("Only communications not yet dispatched can be cancelled");
  if (!reason.trim()) return NO("Give a reason");
  if (c.status === "pending_approval" && c.approvalRequestId) withdrawRequest(c.createdBy, c.approvalRequestId, `Cancelled: ${reason}`);
  commit(audited({ ...state, communications: state.communications.map((x) => (x.id === id ? { ...x, status: "cancelled", cancelledAt: now() } : x)) }, uid, "communication", id, "cancelled", null, reason, c.approvalRequestId, c.status));
  return OK(id);
}

/** Mock provider callback. A callback for a final attempt, or a repeated callback ID, is ignored. */
export function providerCallback(uid: string, attemptId: string, status: "delivered" | "failed", callbackId: string): Res {
  if (!can(uid, "communication", "view")) return NO(need("communication", "View"));
  const a = state.attempts.find((x) => x.id === attemptId);
  if (!a) return NO("Delivery attempt not found");
  const final = a.status === "delivered" || a.status === "failed" || a.status === "published" || a.status === "provider_error";
  const dup = final || a.callbacks.some((x) => x.id === callbackId);
  const attempts = state.attempts.map((x) => (x.id === attemptId ? { ...x, status: dup ? x.status : status, updatedAt: now(), error: !dup && status === "failed" ? "Provider reported a delivery failure" : x.error, callbacks: [...x.callbacks, { id: callbackId, at: now(), status, duplicate: dup }] } : x));
  const commAtt = attempts.filter((x) => x.commId === a.commId);
  let s: CommsState = { ...state, attempts, communications: state.communications.map((c) => (c.id === a.commId ? { ...c, status: overallStatus(commAtt) } : c)) };
  s = audited(s, "SYSTEM", "delivery", attemptId, dup ? "duplicate_callback_ignored" : `callback_${status}`, status, dup ? `Callback ${callbackId} ignored: attempt already ${a.status}` : "Mock provider callback");
  commit(s);
  return dup ? OK(attemptId, ["Duplicate or late callback ignored; delivery status unchanged"]) : OK(attemptId);
}

/** Manual retry of a failed attempt. Only once a retry policy is recorded (CD-07); never beyond it. */
export function retryAttempt(uid: string, attemptId: string): Res {
  if (!can(uid, "communication", "execute")) return NO(need("communication", "Execute"));
  const a = state.attempts.find((x) => x.id === attemptId);
  if (!a) return NO("Attempt not found");
  if (a.status !== "failed" && a.status !== "provider_error") return NO("Only failed attempts can be retried; a delivered message is never sent again");
  if (state.retry.maxAttempts == null) return NO("No retry policy is configured (CD-07). Retries are not invented");
  const tries = state.attempts.filter((x) => x.commId === a.commId && x.recipientId === a.recipientId && x.channel === a.channel).length;
  if (tries >= state.retry.maxAttempts) return NO(`Retry limit of ${state.retry.maxAttempts} reached`);
  const id = `DLV-${pad(state.seq + 1, 7)}`;
  const st: "dispatched" | "provider_error" = a.error?.includes("no contact") || a.error?.includes("No ") ? "provider_error" : "dispatched";
  commit(audited({ ...state, seq: state.seq + 1, attempts: [...state.attempts, { ...a, id, attempt: tries + 1, idempotencyKey: `${a.commId}|${a.recipientId}|${a.channel}|${tries + 1}`, status: st, providerResponse: "Retry accepted by mock provider", at: now(), updatedAt: now(), callbacks: [] }] }, uid, "delivery", id, "retried", st, `Retry ${tries + 1} of ${state.retry.maxAttempts}`));
  return OK(id);
}

export function setRetryPolicy(uid: string, maxAttempts: number): Res {
  if (!can(uid, "communication", "manage")) return NO(need("communication", "Manage"));
  if (state.decisions.find((d) => d.id === "CD-07")?.status !== "confirmed") return NO("Record the confirmed retry policy in the decision register (CD-07) first");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) return NO("Enter a whole number of attempts");
  commit(audited({ ...state, retry: { maxAttempts, status: "confirmed" } }, uid, "config", "RETRY", "retry_policy_set", String(maxAttempts), "Confirmed under CD-07"));
  return OK();
}

export function saveAudience(uid: string, d: Omit<AudienceDefinition, "id" | "createdBy" | "updatedAt"> & { id?: string }): Res {
  if (!can(uid, "communication", "manage")) return NO(need("communication", "Manage audiences"));
  if (!d.name.trim()) return NO("Name the audience");
  const id = d.id ?? nextId("AUD", state.audiences);
  const def: AudienceDefinition = { id, name: d.name.trim(), filter: d.filter, createdBy: uid, updatedAt: now() };
  commit(audited({ ...state, audiences: state.audiences.some((a) => a.id === id) ? state.audiences.map((a) => (a.id === id ? def : a)) : [...state.audiences, def] }, uid, "audience", id, "saved", def.name, "Audience definition"));
  return OK(id);
}

/* ======================= Catalogue and templates ======================= */

export function setEntryEnabled(uid: string, id: NotificationId, enabled: boolean, reason: string): Res {
  if (!can(uid, "comm-templates", "disable")) return NO(need("comm-templates", "Enable / disable"));
  if (!reason.trim()) return NO("Give a reason");
  const e = state.catalogue.find((x) => x.id === id)!;
  commit(audited({ ...state, catalogue: state.catalogue.map((x) => (x.id === id ? { ...x, enabled, version: x.version + 1, updatedBy: uid, updatedAt: now() } : x)) }, uid, "catalogue", id, enabled ? "enabled" : "disabled", String(enabled), reason, null, String(e.enabled)));
  return OK(id);
}

export function updateEntry(uid: string, id: NotificationId, patch: Partial<Pick<NotificationEntry, "channels" | "smsFallback" | "audienceRule" | "cadenceDays">>, reason: string): Res {
  if (!can(uid, "comm-templates", "edit")) return NO(need("comm-templates", "Edit"));
  if (!reason.trim()) return NO("Give a reason");
  if (patch.channels && !patch.channels.length) return NO("At least one channel is required");
  if (patch.cadenceDays !== undefined && id === "N10") {
    if (state.decisions.find((d) => d.id === "CD-08")?.status !== "confirmed") return NO("The N10 cadence is open (CD-08). Record the confirmed cadence in the decision register first");
    if (patch.cadenceDays == null || patch.cadenceDays < 1) return NO("Enter the cadence in days");
  }
  const e = state.catalogue.find((x) => x.id === id)!;
  commit(audited({ ...state, catalogue: state.catalogue.map((x) => (x.id === id ? { ...x, ...patch, version: x.version + 1, updatedBy: uid, updatedAt: now() } : x)) }, uid, "catalogue", id, "configuration_changed", JSON.stringify(patch), reason, null, JSON.stringify({ channels: e.channels, smsFallback: e.smsFallback, cadenceDays: e.cadenceDays })));
  return OK(id);
}

/** Saves a new draft version. The active version is never overwritten. */
export function saveTemplateDraft(uid: string, templateId: string, translations: TemplateTranslation[], deepLink: string | null, reason: string): Res {
  if (!can(uid, "comm-templates", "edit")) return NO(need("comm-templates", "Edit"));
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return NO("Template not found");
  if (!reason.trim()) return NO("Give a reason for the change");
  if (t.versions.some((v) => v.status === "pending_approval")) return NO("A version is already awaiting approval");
  const last = latestVersion(t);
  const draft = { version: last.status === "draft" ? last.version : last.version + 1, translations, deepLink, status: "draft" as const, providerApproval: t.channel === "whatsapp" ? ("pending" as const) : ("not_required" as const), changedBy: uid, changedAt: now(), reason, approvalRequestId: null };
  const versions = last.status === "draft" ? [...t.versions.slice(0, -1), draft] : [...t.versions, draft];
  commit(audited({ ...state, templates: state.templates.map((x) => (x.id === templateId ? { ...x, versions, updatedAt: now() } : x)) }, uid, "template", `${templateId} v${draft.version}`, "draft_saved", null, reason));
  return OK(`${templateId} v${draft.version}`);
}

/** Development control: record the provider's WhatsApp template approval for a draft. */
export function setProviderApproval(uid: string, templateId: string, outcome: "approved" | "rejected"): Res {
  if (!can(uid, "comm-templates", "edit")) return NO(need("comm-templates", "Edit"));
  const t = state.templates.find((x) => x.id === templateId);
  if (!t || t.channel !== "whatsapp") return NO("Not a WhatsApp template");
  const last = latestVersion(t);
  commit(audited({ ...state, templates: state.templates.map((x) => (x.id === templateId ? { ...x, versions: x.versions.map((v) => (v.version === last.version ? { ...v, providerApproval: outcome } : v)) } : x)) }, uid, "template", `${templateId} v${last.version}`, `provider_${outcome}`, outcome, "Mock WhatsApp provider template review"));
  return OK();
}

export function submitTemplate(uid: string, templateId: string): Res {
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return NO("Template not found");
  const v = latestVersion(t);
  if (v.status !== "draft") return NO("No draft version to submit");
  if (!can(uid, "comm-templates", "submit")) return NO(need("comm-templates", "Submit"));
  const chk = validateTemplate(t, v, ["en"]);
  if (!chk.ok) return NO(...chk.errors);
  const entry = t.notificationId ? state.catalogue.find((e) => e.id === t.notificationId) : undefined;
  const policy = state.policies[entry?.policy ?? "manual"];
  if (!policy.approval) {
    if (!can(uid, "comm-templates", "publish")) return NO(need("comm-templates", "Publish"));
    commit(activateTemplate(state, templateId, v.version, uid, null));
    return OK(`${templateId} v${v.version}`, chk.warnings);
  }
  const r = raise(uid, templateSpec(t, v, activeVersion(t)));
  if (!r.ok) return r;
  commit(audited({ ...state, templates: state.templates.map((x) => (x.id === templateId ? { ...x, versions: x.versions.map((y) => (y.version === v.version ? { ...y, status: "pending_approval", approvalRequestId: r.id ?? null } : y)) } : x)) }, uid, "template", `${templateId} v${v.version}`, "submitted", null, v.reason, r.id ?? null));
  return OK(`${templateId} v${v.version}`, chk.warnings);
}

function activateTemplate(s: CommsState, templateId: string, version: number, actor: string, apr: string | null): CommsState {
  const next = { ...s, templates: s.templates.map((t) => (t.id === templateId ? { ...t, activeVersion: version, updatedAt: now(), versions: t.versions.map((v) => (v.version === version ? { ...v, status: "active" as const } : v.status === "active" ? { ...v, status: "superseded" as const } : v)) } : t)) };
  return audited(next, actor, "template", `${templateId} v${version}`, "activated", `v${version}`, "Previous active version superseded and kept", apr);
}

/* ======================= WhatsApp bot ======================= */

export function saveBotMenu(uid: string, menu: BotMenu): Res {
  if (!can(uid, "comm-bot", "edit", menu.programme)) return NO(need("comm-bot", "Edit"));
  const chk = validateMenu(menu, state.menus.map((m) => m.id));
  if (!chk.ok) return NO(...chk.errors);
  const active = state.menus.find((m) => m.id === menu.id && m.status === "active");
  if (state.menus.some((m) => m.id === menu.id && m.status === "pending_approval")) return NO("A change to this menu is already awaiting approval");
  const draft: BotMenu = { ...menu, status: "draft", version: (active?.version ?? 0) + 1, approvalRequestId: null, updatedBy: uid, updatedAt: now() };
  commit(audited({ ...state, menus: [...state.menus.filter((m) => !(m.id === menu.id && m.status === "draft")), draft] }, uid, "bot_menu", `${menu.id} v${draft.version}`, "draft_saved", draft.items.map((i) => i.label).join(", "), "Bot menu change"));
  return OK(`${menu.id} v${draft.version}`);
}

export function submitBotMenu(uid: string, menuId: string): Res {
  const d = state.menus.find((m) => m.id === menuId && m.status === "draft");
  if (!d) return NO("No draft for this menu");
  if (!can(uid, "comm-bot", "submit", d.programme)) return NO(need("comm-bot", "Submit"));
  const chk = validateMenu(d, state.menus.map((m) => m.id));
  if (!chk.ok) return NO(...chk.errors);
  const r = raise(uid, botSpec(d, state.menus.find((m) => m.id === menuId && m.status === "active")));
  if (!r.ok) return r;
  commit(audited({ ...state, menus: state.menus.map((m) => (m === d ? { ...m, status: "pending_approval", approvalRequestId: r.id ?? null } : m)) }, uid, "bot_menu", `${menuId} v${d.version}`, "submitted", null, "Bot menu publication", r.id ?? null));
  return OK(menuId);
}

export interface BotReply {
  text: string;
  escalated: boolean;
  refused: boolean;
}
/** Bot preview / simulation: safe actions only; read-only balance from the wallet engine. */
export function botRespond(uid: string, memberId: string, itemId: string): BotReply {
  const m = memberById(mem(), memberId);
  const menu = state.menus.find((x) => x.programme === m?.programme && x.status === "active");
  const it = menu?.items.find((i) => i.id === itemId);
  if (!m || !menu || !it) return { text: "Menu option not available for this member", escalated: false, refused: true };
  if (!BOT_ACTION[it.action].safe) return { text: "This action is not available on WhatsApp. Please use the Rishta app.", escalated: false, refused: true };
  void uid;
  switch (it.action) {
    case "check_balance": {
      const b = memberBalances(walletStore.get(), schemeStore.get(), mem(), m.id);
      return { text: `Available points: ${b.available.toLocaleString("en-IN")} (read-only; scheme points ${b.scheme.toLocaleString("en-IN")} unsettled)`, escalated: false, refused: false };
    }
    case "view_schemes": return { text: "Schemes you are eligible for are listed in the app (deep link)", escalated: false, refused: false };
    case "kyc_prompt": return { text: `Complete your KYC in the app: ${it.deepLink ?? DEEP_LINKS[1].id}`, escalated: false, refused: false };
    case "bank_update_prompt": return { text: "Update bank details securely in the app", escalated: false, refused: false };
    case "faq": return { text: "Here is the relevant FAQ from Self-Service content", escalated: false, refused: false };
    default: return { text: "Connecting you to an agent", escalated: true, refused: false };
  }
}
/** A member request the bot refuses (for example "redeem"). */
export function botRefuseFreeText(text: string): BotReply {
  return /redeem|redemption|transfer|withdraw/i.test(text) ? { text: "Redemption and point transfers are not available on WhatsApp. Please use the Rishta app.", escalated: false, refused: true } : { text: "I could not understand. Type 0 for the menu or 'agent' for a person.", escalated: false, refused: false };
}

/** Escalates an unresolved bot conversation to the human-agent queue. */
export function escalateToAgent(uid: string, memberId: string, category: string, text: string, conversationId?: string): Res {
  const m = memberById(mem(), memberId);
  if (!m) return NO("Member not found");
  if (!can(uid, "tickets", "create", m.programme) && uid !== "SYSTEM") return NO(need("tickets", "Create"));
  const id = nextId("HDQ", state.queries);
  const convId = conversationId ?? nextId("CONV", state.conversations);
  const at = now();
  const q: HelpdeskQuery = { id, memberId, programme: m.programme, sourceChannel: "whatsapp", category, receivedAt: at, agentId: null, priority: "medium", status: "escalated", conversationId: convId, escalationReason: "Bot could not resolve", relatedRef: null, remarks: [], resolution: null, resolvedAt: null, firstResponseAt: null };
  const conv = state.conversations.find((c) => c.id === convId);
  const conversations = conv ? state.conversations.map((c) => (c.id === convId ? { ...c, status: "escalated" as const, escalationQueryId: id, step: "Escalated", lastMessage: text } : c)) : [...state.conversations, { id: convId, memberId, programme: m.programme, startedAt: at, status: "escalated" as const, lastMessage: text, step: "Escalated", escalationQueryId: id, messages: [{ at, from: "member" as const, text }, { at, from: "bot" as const, text: "Connecting you to an agent" }], fallbacks: 1 }];
  commit(audited({ ...state, queries: [...state.queries, q], conversations }, uid, "query", id, "escalated", category, text));
  return OK(id);
}

/* ======================= Helpdesk ======================= */

function updQuery(uid: string, id: string, action: ActionId, patch: (q: HelpdeskQuery) => HelpdeskQuery, what: string, reason: string): Res {
  const q = state.queries.find((x) => x.id === id);
  if (!q) return NO("Query not found");
  if (!can(uid, "tickets", action, q.programme)) return NO(need("tickets", action === "manage" ? "Manage" : "Edit"));
  const next = patch(q);
  commit(audited({ ...state, queries: state.queries.map((x) => (x.id === id ? next : x)) }, uid, "query", id, what, next.status, reason, null, q.status));
  return OK(id);
}
export function assignQuery(uid: string, id: string, agentId: string): Res {
  if (!agentId) return NO("Choose an agent");
  const prior = q0(id)?.agentId;
  return updQuery(uid, id, "manage", (q) => ({ ...q, agentId, status: q.status === "resolved" ? q.status : "assigned" }), prior ? "reassigned" : "assigned", `Agent ${agentId}`);
}
const q0 = (id: string) => state.queries.find((x) => x.id === id);
export function addRemark(uid: string, id: string, text: string, internal: boolean): Res {
  if (!text.trim()) return NO("Write the remark");
  return updQuery(uid, id, "edit", (q) => ({ ...q, remarks: [...q.remarks, { at: now(), by: uid, text: text.trim(), internal }], firstResponseAt: q.firstResponseAt ?? (internal ? null : now()), status: internal ? q.status : "awaiting_member" }), internal ? "internal_remark" : "member_communication", text);
}
export function resolveQuery(uid: string, id: string, resolution: string): Res {
  if (!resolution.trim()) return NO("Record the resolution");
  return updQuery(uid, id, "edit", (q) => ({ ...q, status: "resolved", resolution, resolvedAt: now(), firstResponseAt: q.firstResponseAt ?? now() }), "resolved", resolution);
}
export function reopenQuery(uid: string, id: string, reason: string): Res {
  if (!reason.trim()) return NO("Give a reason");
  if (q0(id)?.status !== "resolved") return NO("Only resolved queries can be reopened");
  return updQuery(uid, id, "manage", (q) => ({ ...q, status: "reopened", resolvedAt: null }), "reopened", reason);
}
export function saveSla(uid: string, p: SlaPolicy): Res {
  if (!can(uid, "tickets", "manage")) return NO(need("tickets", "Manage (SLA configuration)"));
  if (p.responseHours != null && p.responseHours <= 0) return NO("Response time must be positive");
  const confirmed = state.decisions.find((d) => d.id === "CD-06")?.status === "confirmed";
  const next = { ...p, status: confirmed ? ("confirmed" as const) : ("development_example" as const) };
  commit(audited({ ...state, sla: state.sla.some((x) => x.id === p.id) ? state.sla.map((x) => (x.id === p.id ? next : x)) : [...state.sla, next] }, uid, "sla", p.id, "saved", `${p.category}: ${p.responseHours ?? "—"} h / ${p.resolutionHours ?? "—"} h`, confirmed ? "Confirmed under CD-06" : "Development example (CD-06 open)"));
  return OK(p.id);
}

/* ======================= Content ======================= */

const URL_OK = (u: string) => /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(u.trim());

export function saveFaq(uid: string, f: Faq): Res {
  if (!can(uid, "content", f.id ? "edit" : "create")) return NO(need("content", "Edit"));
  if (!f.section) return NO("Choose the app section");
  if (!f.translations.find((t) => t.lang === "en")?.question.trim()) return NO("English question is required");
  const id = f.id || nextId("FAQ", state.faqs);
  const next = { ...f, id, status: f.status === "published" ? ("draft" as const) : f.status, updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, faqs: state.faqs.some((x) => x.id === id) ? state.faqs.map((x) => (x.id === id ? next : x)) : [...state.faqs, next] }, uid, "faq", id, "saved", f.section, "FAQ edited: returns to draft until published"));
  return OK(id);
}
export function publishContent(uid: string, kind: "faq" | "guide", id: string, publish: boolean): Res {
  if (!can(uid, "content", publish ? "publish" : "disable")) return NO(need("content", publish ? "Publish" : "Deactivate"));
  if (kind === "faq") {
    const f = state.faqs.find((x) => x.id === id);
    if (!f) return NO("FAQ not found");
    const missing = state.languages.filter((l) => !f.translations.some((t) => t.lang === l.code));
    commit(audited({ ...state, faqs: state.faqs.map((x) => (x.id === id ? { ...x, status: publish ? "published" : "inactive", publishedAt: publish ? now() : x.publishedAt } : x)) }, uid, "faq", id, publish ? "published" : "deactivated", null, ""));
    return OK(id, publish && missing.length ? [`Missing language versions: ${missing.map((l) => l.code).join(", ")}`] : []);
  }
  const g = state.guides.find((x) => x.id === id);
  if (!g) return NO("Guide not found");
  if (publish && g.steps.length < 1) return NO("A guide needs at least one step");
  if (publish && g.steps.some((s) => s.deepLink && !deepLinkOk(s.deepLink))) return NO("A step uses an unapproved deep link");
  commit(audited({ ...state, guides: state.guides.map((x) => (x.id === id ? { ...x, status: publish ? "published" : "inactive", updatedAt: now() } : x)) }, uid, "guide", id, publish ? "published" : "deactivated", null, ""));
  return OK(id);
}
export function saveGuide(uid: string, g: HowToGuide): Res {
  if (!can(uid, "content", "edit")) return NO(need("content", "Edit"));
  if (!g.name.trim() || !g.steps.length) return NO("Name and at least one step are required");
  const id = g.id || nextId("HOW", state.guides);
  const next = { ...g, id, status: "draft" as const, updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, guides: state.guides.some((x) => x.id === id) ? state.guides.map((x) => (x.id === id ? next : x)) : [...state.guides, next] }, uid, "guide", id, "saved", `${g.steps.length} steps`, "How-To guide"));
  return OK(id);
}

export function saveRich(uid: string, r: RichContent): Res {
  if (!can(uid, "content", r.id ? "edit" : "create")) return NO(need("content", "Edit"));
  if (!r.name.trim()) return NO("Name is required");
  if (r.deepLink && !deepLinkOk(r.deepLink)) return NO("Deep link is not approved");
  if (r.mediaId && !state.media.some((m) => m.id === r.mediaId)) return NO("Media asset not found");
  const id = r.id || nextId(r.kind === "tutorial" ? "TUT" : r.kind === "testimonial" ? "TST" : "LBC", state.rich.filter((x) => x.kind === r.kind));
  const next = { ...r, id, status: "draft" as const, approvalRequestId: null, updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, rich: state.rich.some((x) => x.id === id) ? state.rich.map((x) => (x.id === id ? next : x)) : [...state.rich, next] }, uid, r.kind, id, "saved", r.name, "Content saved as draft"));
  return OK(id);
}
export function publishRich(uid: string, id: string): Res {
  const r = state.rich.find((x) => x.id === id);
  if (!r) return NO("Content not found");
  if (r.status !== "draft") return NO(`Content is ${r.status.replace("_", " ")}`);
  if (r.kind === "testimonial") {
    if (!r.contributor?.consentConfirmed || !r.contributor.consentRef) return NO("Testimonials need a recorded consent reference before publication");
    if (!can(uid, "content", "submit", r.programmes[0])) return NO(need("content", "Submit"));
    if (state.policies.testimonial.approval) {
      const q = raise(uid, contentSpec(r));
      if (!q.ok) return q;
      commit(audited({ ...state, rich: state.rich.map((x) => (x.id === id ? { ...x, status: "pending_approval", approvalRequestId: q.id ?? null } : x)) }, uid, "testimonial", id, "submitted", null, "Testimonial publication", q.id ?? null));
      return OK(id);
    }
  }
  if (!can(uid, "content", "publish")) return NO(need("content", "Publish"));
  commit(audited({ ...state, rich: state.rich.map((x) => (x.id === id ? { ...x, status: "published" } : x)) }, uid, r.kind, id, "published", null, ""));
  return OK(id);
}

export function registerMedia(uid: string, file: { name: string; type: string; sizeKb: number; width?: number | null; height?: number | null }): Res {
  if (!can(uid, "content", "create") && !can(uid, "banners", "create")) return NO(need("content", "Create"));
  const kind = /\.(jpe?g|png|webp)$/i.test(file.name) ? "image" : /\.gif$/i.test(file.name) ? "gif" : /\.(mp4|webm)$/i.test(file.name) ? "video" : null;
  if (!kind) return NO("Unsupported file type: images (JPG, PNG, WEBP), GIF or video (MP4, WEBM)");
  const limit = kind === "video" ? 20480 : 2048;
  if (file.sizeKb > limit) return NO(`File is ${file.sizeKb} KB; the development limit for ${kind} is ${limit} KB (media service limits to confirm)`);
  const id = nextId("MED", state.media);
  commit(audited({ ...state, media: [...state.media, { id, name: file.name, type: kind, sizeKb: file.sizeKb, width: file.width ?? null, height: file.height ?? null, storage: "mock_reference" }] }, uid, "media", id, "registered", file.name, "Metadata only: no storage connected"));
  return OK(id);
}

/* ======================= Banners (named HO Admin publishers) ======================= */

export function saveBanner(uid: string, b: Banner): Res {
  if (!can(uid, "banners", b.id ? "edit" : "create")) return NO(need("banners", "Edit"));
  const errors: string[] = [];
  if (!b.name.trim()) errors.push("Name is required");
  if (!state.media.some((m) => m.id === b.mediaId)) errors.push("Choose a media asset");
  if (!b.startDate || !b.endDate || b.endDate < b.startDate) errors.push("End date must be on or after the start date");
  if (b.deepLink && !deepLinkOk(b.deepLink)) errors.push("Deep link is not approved");
  if (!b.programmes.length) errors.push("Choose at least one programme");
  if (errors.length) return NO(...errors);
  const id = b.id || nextId("BNR", state.banners);
  const media = state.media.find((m) => m.id === b.mediaId)!;
  const next: Banner = { ...b, id, mediaType: media.type, status: "draft", publishedBy: null, publishedAt: null, updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, banners: state.banners.some((x) => x.id === id) ? state.banners.map((x) => (x.id === id ? next : x)) : [...state.banners, next] }, uid, "banner", id, "saved", b.name, "Edited banners return to draft until republished"));
  return OK(id);
}
/** Publishing needs the explicit Banners: Publish permission (named HO Admin), not just edit rights. */
export function publishBanner(uid: string, id: string): Res {
  const b = state.banners.find((x) => x.id === id);
  if (!b) return NO("Banner not found");
  if (!b.programmes.every((p) => can(uid, "banners", "publish", p))) return NO("Only named HO Admin publishers (Banners: Publish) can publish or republish banners and home scrollers");
  if (b.endDate < now().slice(0, 10)) return NO("The banner's end date has passed");
  commit(audited({ ...state, banners: state.banners.map((x) => (x.id === id ? { ...x, status: "published", publishedBy: uid, publishedAt: now() } : x)) }, uid, "banner", id, b.publishedAt ? "republished" : "published", uid, "Named publisher"));
  return OK(id);
}
export function deactivateBanner(uid: string, id: string): Res {
  if (!can(uid, "banners", "disable") && !can(uid, "banners", "publish")) return NO(need("banners", "Deactivate"));
  commit(audited({ ...state, banners: state.banners.map((x) => (x.id === id ? { ...x, status: "inactive" } : x)) }, uid, "banner", id, "deactivated", null, ""));
  return OK(id);
}

/* ======================= Social links ======================= */

export function saveLink(uid: string, l: SocialLink): Res {
  if (!can(uid, "content", "manage")) return NO(need("content", "Manage social links"));
  if (!URL_OK(l.url)) return NO("Enter a valid https:// URL");
  if (!l.display.trim()) return NO("Display name is required");
  const id = l.id || nextId("LNK", state.links);
  const next = { ...l, id, url: l.url.trim(), updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, links: state.links.some((x) => x.id === id) ? state.links.map((x) => (x.id === id ? next : x)) : [...state.links, next] }, uid, "social_link", id, "saved", `${l.type}: ${l.url}`, "Social / contact link"));
  return OK(id);
}

/* ======================= Surveys (N06) ======================= */

export function saveSurvey(uid: string, s: Survey): Res {
  if (!can(uid, "surveys", s.id ? "edit" : "create")) return NO(need("surveys", s.id ? "Edit" : "Create"));
  if (!s.name.trim()) return NO("Name is required");
  if (s.geofence.enabled) return NO("Geofence-triggered surveys stay disabled until OP-SURV1 is confirmed");
  if (s.source !== "portal" && (!s.link || !URL_OK(s.link))) return NO("External surveys need a valid https:// link");
  if (s.source === "portal" && !s.questions.length) return NO("Add at least one question");
  if (s.endDate < s.startDate) return NO("End date must be after the start date");
  const id = s.id || nextId("SRV", state.surveys);
  const next = { ...s, id, link: s.source === "portal" ? `rishta://survey/${id}` : s.link, status: "draft" as const, approvalRequestId: null, updatedAt: now(), updatedBy: uid };
  commit(audited({ ...state, surveys: state.surveys.some((x) => x.id === id) ? state.surveys.map((x) => (x.id === id ? next : x)) : [...state.surveys, next] }, uid, "survey", id, "saved", s.name, `Source ${s.source}`));
  return OK(id);
}
export function submitSurvey(uid: string, id: string): Res {
  const s = state.surveys.find((x) => x.id === id);
  if (!s) return NO("Survey not found");
  if (!can(uid, "surveys", "submit")) return NO(need("surveys", "Submit"));
  if (s.status !== "draft") return NO(`Survey is ${s.status.replace("_", " ")}`);
  if (s.trigger === "geofence") return NO("Geofence trigger is disabled until OP-SURV1 is confirmed");
  const q = raise(uid, surveySpec(s));
  if (!q.ok) return q;
  commit(audited({ ...state, surveys: state.surveys.map((x) => (x.id === id ? { ...x, status: "pending_approval", approvalRequestId: q.id ?? null } : x)) }, uid, "survey", id, "submitted", null, "Survey publication", q.id ?? null));
  return OK(id);
}
/** Sends N06 invitations for an active survey. Never without a valid survey reference. */
export function dispatchSurvey(uid: string, id: string): Res {
  const s = state.surveys.find((x) => x.id === id);
  if (!s) return NO("Survey not found");
  if (!can(uid, "communication", "execute")) return NO(need("communication", "Execute"));
  if (s.status !== "active") return NO("Only an approved, active survey can be sent");
  if (!s.link) return NO("N06 needs a valid survey reference or link");
  const entry = state.catalogue.find((e) => e.id === "N06")!;
  if (!entry.enabled) return NO("N06 is disabled in the Notification Catalogue");
  const a = resolveAudience(mem(), s.audience, memberScope(uid), entry.channels);
  if (!a.included.length) return NO("The survey audience is empty within your scope");
  const commId = nextId("COMM", state.communications.filter((c) => c.id.startsWith("COMM-")));
  const c: Communication = { id: commId, name: `N06 · ${s.name}`, description: "Survey invitation", mode: "manual", notificationId: "N06", category: "alerts", purpose: `Survey ${s.id}`, priority: "normal", audience: s.audience, audienceCount: a.included.length, channels: entry.channels, languages: ["en"], templateIds: state.templates.filter((t) => t.notificationId === "N06").map((t) => t.id), deepLink: s.source === "portal" ? "rishta://survey/{survey_id}" : null, scheduledAt: null, justification: `Approved survey ${s.id}`, status: "approved", approvalRequestId: s.approvalRequestId, eventId: null, createdBy: uid, createdAt: now(), dispatchedAt: null, cancelledAt: null, manualContent: null, version: 1 };
  let st: CommsState = { ...state, communications: [...state.communications, c] };
  const prev = state;
  state = st;
  st = dispatch(st, c, recipientsFor(c, a.included), entry, now());
  state = prev;
  st = { ...st, surveys: st.surveys.map((x) => (x.id === id ? { ...x, dispatchCommId: commId } : x)) };
  commit(audited(st, uid, "survey", id, "invitations_sent", `${a.included.length} recipients via N06`, "Simulated dispatch", s.approvalRequestId));
  return OK(commId, ["Simulated dispatch through mock providers"]);
}
/** Records a mock response; a second response from the same respondent is rejected as a duplicate. */
export function recordSurveyResponse(surveyId: string, respondentId: string, answers: Record<string, string>): Res {
  const s = state.surveys.find((x) => x.id === surveyId);
  if (!s) return NO("Survey not found");
  const m = memberById(mem(), respondentId);
  if (!m) return NO("Unknown respondent");
  const dup = state.responses.some((r) => r.surveyId === surveyId && r.respondentId === respondentId && r.status !== "duplicate_rejected");
  const id = nextId("SRR", state.responses);
  const eligible = resolveAudience(mem(), s.audience, () => true).included.some((x) => x.id === m.id);
  if (!eligible) return NO("Respondent is not in the survey audience");
  commit({ ...state, responses: [...state.responses, { id, surveyId, respondentId, programme: m.programme, submittedAt: now(), status: dup ? "duplicate_rejected" : "complete", answers, origin: "mock_development" }] });
  return dup ? { ...NO("Duplicate response: this member already responded"), id } : OK(id);
}

/* ======================= Governance ======================= */

export function updateCommDecision(uid: string, id: string, patch: { status: CommsState["decisions"][number]["status"]; answer: string }): Res {
  if (!can(uid, "comm-templates", "edit") && !can(uid, "communication", "manage")) return NO("You need Notification catalogue: Edit or Communication: Manage");
  const d = state.decisions.find((x) => x.id === id);
  if (!d) return NO("Decision not found");
  if (patch.status === "confirmed" && !patch.answer.trim()) return NO("Record the confirmed answer");
  commit(audited({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, uid, "decision", id, patch.status, patch.answer, d.question, null, d.status));
  return OK(id);
}
export function setPolicy(uid: string, key: keyof CommsState["policies"], approval: boolean, reason: string): Res {
  if (!can(uid, "communication", "manage")) return NO(need("communication", "Manage"));
  if (!reason.trim()) return NO("Give a reason");
  commit(audited({ ...state, policies: { ...state.policies, [key]: { ...state.policies[key], approval } } }, uid, "policy", key, "changed", String(approval), reason, null, String(state.policies[key].approval)));
  return OK();
}
export function recordExport(uid: string, module: string, name: string, rows: number): Res {
  if (!can(uid, module, "export")) return NO(need(module, "Export"));
  commit(audited(state, uid, "export", name, "exported", `${rows} rows`, "CSV export"));
  return OK();
}

/* ======================= Execution handlers ======================= */

const approversOf = (r: ApprovalRequest) => r.stages.map((x) => x.decidedBy).filter(Boolean) as string[];
const notFound = (r: ApprovalRequest) => ({ ok: false, message: `Not executed: no Communication Centre record matches ${r.entityRef} (earlier demo request). Nothing was dispatched` });

function execCommunication(r: ApprovalRequest) {
  const c = state.communications.find((x) => x.id === r.entityRef);
  if (!c) return notFound(r);
  const status = c.scheduledAt ? "scheduled" : "approved";
  commit(audited({ ...state, communications: state.communications.map((x) => (x.id === c.id ? { ...x, status } : x)) }, "SYSTEM", "communication", c.id, "approved", status, `Approved by ${approversOf(r).join(", ")}. Approval does not dispatch`, r.id));
  return { ok: true, message: status === "scheduled" ? `Approved and scheduled for ${c.scheduledAt}; the scheduler dispatches it` : "Approved. Not dispatched: an operator with Communication: Execute sends it" };
}
function execTemplate(r: ApprovalRequest) {
  const [tid, ver] = r.entityRef.split(" v");
  const t = state.templates.find((x) => x.id === tid);
  const v = t?.versions.find((x) => String(x.version) === ver);
  if (!t || !v) return notFound(r);
  if (t.channel === "whatsapp" && v.providerApproval !== "approved") {
    commit(audited(state, "SYSTEM", "template", r.entityRef, "activation_refused", null, "WhatsApp provider approval missing", r.id));
    return { ok: false, message: "Not activated: the WhatsApp provider has not approved this template version. The previous version stays active" };
  }
  commit(activateTemplate(state, tid, v.version, "SYSTEM", r.id));
  return { ok: true, message: `${tid} v${v.version} active; previous version superseded and kept` };
}
function execContent(r: ApprovalRequest) {
  const c = state.rich.find((x) => x.id === r.entityRef);
  if (!c) return notFound(r);
  commit(audited({ ...state, rich: state.rich.map((x) => (x.id === c.id ? { ...x, status: "published" } : x)) }, "SYSTEM", c.kind, c.id, "published", null, "Approved", r.id));
  return { ok: true, message: `${c.id} published (mock content service)` };
}
function execSurvey(r: ApprovalRequest) {
  const s = state.surveys.find((x) => x.id === r.entityRef);
  if (!s) return notFound(r);
  const status = s.startDate > now().slice(0, 10) ? "scheduled" : "active";
  commit(audited({ ...state, surveys: state.surveys.map((x) => (x.id === s.id ? { ...x, status } : x)) }, "SYSTEM", "survey", s.id, "approved", status, "Approved; invitations are sent separately through N06", r.id));
  return { ok: true, message: `Survey ${status}. Invitations not sent yet` };
}
function execBot(r: ApprovalRequest) {
  const [mid, ver] = r.entityRef.split(" v");
  const d = state.menus.find((m) => m.id === mid && String(m.version) === ver);
  if (!d) return notFound(r);
  const chk = validateMenu(d, state.menus.map((m) => m.id));
  if (!chk.ok) return { ok: false, message: chk.errors.join("; ") };
  commit(audited({ ...state, menus: state.menus.map((m) => (m === d ? { ...m, status: "active" } : m.id === mid && m.status === "active" ? { ...m, status: "superseded" } : m)) }, "SYSTEM", "bot_menu", r.entityRef, "published", null, "Approved", r.id));
  return { ok: true, message: `${mid} v${ver} active (configuration only: the WhatsApp bot is not connected)` };
}

registerExecutionHandler("communication", execCommunication);
registerExecutionHandler("comm-templates", execTemplate);
registerExecutionHandler("content", execContent);
registerExecutionHandler("surveys", execSurvey);
registerExecutionHandler("comm-bot", execBot);

/** Keeps statuses in step with the approval engine (rejections and returns). */
function syncFromApprovals() {
  const reqs = approvalStore.get().requests;
  const st = (id: string | null) => reqs.find((r) => r.id === id)?.status;
  let changed = false;
  const communications = state.communications.map((c) => {
    if (c.status !== "pending_approval") return c;
    const s = st(c.approvalRequestId);
    if (s === "rejected" || s === "returned" || s === "withdrawn") {
      changed = true;
      return { ...c, status: s === "rejected" ? ("rejected" as const) : s === "withdrawn" ? ("cancelled" as const) : ("draft" as const) };
    }
    return c;
  });
  const templates = state.templates.map((t) => ({ ...t, versions: t.versions.map((v) => {
    if (v.status !== "pending_approval") return v;
    const s = st(v.approvalRequestId);
    if (s === "rejected" || s === "returned" || s === "withdrawn") {
      changed = true;
      return { ...v, status: s === "rejected" ? ("rejected" as const) : ("draft" as const) };
    }
    return v;
  }) }));
  if (changed) commit({ ...state, communications, templates });
}

// Start-up: catch up on events and due schedules, then listen to the source modules.
processEvents();
runScheduler();
approvalStore.subscribe(syncFromApprovals);
syncFromApprovals();
for (const src of [memberStore, walletStore, schemeStore]) src.subscribe(() => processEvents());

/* ======================= Staff alerts (Phase 10 risk warnings) ======================= */

/**
 * Internal staff alert (for example a redemption blocked by a risk rule). Sent by email to portal
 * users through the same mock providers. The alert ID is stable: a redelivered alert is not sent again.
 */
export function sendStaffAlert(a: { id: string; title: string; body: string; recipients: string[]; sourceModule: string; sourceRef: string; at?: string }): { commId: string; duplicate: boolean } {
  const prior = state.communications.find((c) => c.eventId === a.id);
  if (prior) return { commId: prior.id, duplicate: true };
  const at = a.at ?? now();
  const commId = `ALERT-${pad(state.communications.filter((c) => c.id.startsWith("ALERT-")).length + 1, 6)}`;
  const c: Communication = { id: commId, name: a.title, description: a.body, mode: "rule", notificationId: null, category: "alerts", purpose: `${a.sourceModule} staff alert`, priority: "high", audience: { programmes: [], states: [], districts: [], branches: [], memberIds: [], roles: [], statuses: [] }, audienceCount: 0, channels: ["email"], languages: ["en"], templateIds: [], deepLink: null, scheduledAt: null, justification: a.sourceRef, status: "queued", approvalRequestId: null, eventId: a.id, createdBy: "SYSTEM", createdAt: at, dispatchedAt: null, cancelledAt: null, manualContent: { subject: a.title, title: a.title, body: a.body }, version: 1 };
  let s: CommsState = { ...state, communications: [...state.communications, c] };
  s = dispatch(s, c, a.recipients.map((id) => ({ id, kind: "staff" as const, member: null, lang: "en" })), undefined, at);
  s = audited(s, "SYSTEM", "staff_alert", commId, "dispatched", `${a.recipients.length} staff recipient(s) · email`, `${a.sourceModule} ${a.sourceRef}. Mock email provider: nothing is sent`);
  commit(s);
  return { commId, duplicate: false };
}
