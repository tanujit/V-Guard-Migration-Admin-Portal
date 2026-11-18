/**
 * Integration operations seed — DEVELOPMENT / DEMO DATA ONLY (Phase 11).
 *
 * Derived from the authoritative modules (no duplicate business data):
 *   SFDC ← member registrations, Phase 4 SFDC sync runs, wallet GST records, member restrictions
 *   eSeal ← scheme scan transactions + Product & SKU master + scan points
 *   RazorPay ← Phase 7 payouts and reconciliation       DigiLocker / Signzy ← KYC documents
 *   WhatsApp / SMS ← Communication Centre attempts       Google Maps ← member addresses, geo-fence checks
 *   Logistics ← gift order tracking events               Authentication ← device logins (Phase 10)
 * Mock telemetry adapters (labelled simulated) supply what no module records: request latency, service
 * telemetry, crashes, infrastructure metrics, queues, deployments, schema changes and feature flags.
 * Siebel has no upstream module, so its lookups are a mock adapter log.
 */
import { CHANNEL_CHECK, OPS_DECISIONS, SOW_INTEGRATIONS, SOW_REJECTIONS } from "@/config/opsCatalogue";
import { hash01, pick } from "@/data/mock/random";
import type { MasterState } from "@/features/masters/engine";
import type { MemberState } from "@/features/members/engine";
import type { CommsState } from "@/types/comms";
import type { GiftState } from "@/types/gifts";
import type { RiskState } from "@/types/risk";
import type { SchemeState } from "@/types/schemes";
import type { WalletState } from "@/types/wallet";
import type { AuthEvent, ChangeEvent, CrashRecord, EsealLookup, IntegrationException, IntegrationRequest, Job, JobRun, MetricSeries, OpsAlert, OpsState, QueueSnapshot, ServiceHealth, SfdcCallback, SfdcRecord, SyncBatch } from "@/types/ops";
import { effectiveDate, hoursBefore } from "./engine";

export interface OpsSources {
  mem: MemberState;
  ws: WalletState;
  ss: SchemeState;
  ms: MasterState;
  cs: CommsState;
  gs: GiftState;
  rs: RiskState;
  now: string;
}
const pad = (n: number, w = 5) => String(n).padStart(w, "0");
const addMin = (at: string, m: number) => new Date(Date.parse(`${at.slice(0, 16)}:00Z`) + m * 60_000).toISOString().slice(0, 16);
const ms = (seed: string, lo: number, hi: number) => Math.round(lo + hash01(seed) * (hi - lo));
const maskTail = (v: string, keep = 4) => `${"•".repeat(4)}${v.replace(/\D/g, "").slice(-keep)}`;

export function buildOpsSeed(src: OpsSources): OpsState {
  const { mem, ws, ss, cs, gs, rs, now } = src;
  const reqs: IntegrationRequest[] = [];
  const req = (integrationId: string, p: Partial<IntegrationRequest> & Pick<IntegrationRequest, "operation" | "messageType" | "businessRef" | "at" | "status" | "source">): IntegrationRequest => {
    const id = `REQ-${pad(reqs.length + 1, 6)}`;
    const failed = p.status === "failed" || p.status === "timeout";
    const durationMs = p.status === "pending" ? null : p.durationMs ?? (p.status === "timeout" ? 30000 : ms(id + integrationId, 120, failed ? 2400 : 1400));
    const r: IntegrationRequest = { id, integrationId, memberId: null, respondedAt: p.status === "pending" ? null : addMin(p.at, Math.max(1, Math.round((durationMs ?? 0) / 60000))), httpStatus: p.status === "success" ? 200 : p.status === "timeout" ? null : p.status === "pending" ? null : p.httpStatus ?? 500, durationMs, errorCategory: failed ? p.errorCategory ?? (p.status === "timeout" ? "timeout" : "http_5xx") : null, error: failed ? p.error ?? "Provider error (mock adapter)" : null, retryCount: 0, traceId: `TRC-${integrationId.slice(4)}-${pad(reqs.length + 1, 6)}`, payload: {}, sensitivePayload: false, financial: false, ...p };
    reqs.push(r);
    return r;
  };
  const byId = new Map(mem.members.map((m) => [m.id, m]));

  /* ---------------- SFDC (11.2) ---------------- */
  const sfdcRecords: SfdcRecord[] = [];
  const callbacks: SfdcCallback[] = [];
  const batches: SyncBatch[] = [];
  const sfdcMembers = mem.members.filter((m) => m.registration.source === "sfdc_invite" || m.registration.source === "sfdc_provisioned");
  for (const m of sfdcMembers) {
    const type = m.programme === "ST" ? "st_invitation" : m.programme === "CS" ? "cs_invitation" : m.programme === "Retailer" ? "retailer" : "dd";
    const processing = m.registration.sfdcSync === "synced" ? "synced" : m.registration.sfdcSync === "conflict" ? "held" : m.status === "invited" ? "pending" : "failed";
    const cbId = `SCB-${pad(callbacks.length + 1)}`;
    sfdcRecords.push({ id: `SFR-${pad(sfdcRecords.length + 1)}`, externalRef: m.registration.sfdcRef ?? m.invite?.ref ?? `SFDC-${m.id}`, recordType: type, programme: m.programme, memberId: m.id, receivedAt: (m.invite?.receivedAt ?? m.registration.submittedAt).slice(0, 16), batchId: "SFDC-INVITATIONS (historic)", validation: processing === "held" ? "conflict" : "valid", processing, callbackId: processing === "pending" ? null : cbId, error: m.registration.sfdcMessage });
    if (processing === "pending") continue;
    const rejected = processing !== "synced";
    const fail = m.registration.sfdcSync === "failed";
    const at = (m.registration.stage1?.at ?? m.registration.submittedAt).slice(0, 16);
    callbacks.push({ id: cbId, memberRef: m.id, kind: "registration_result", result: rejected ? "Rejected" : "Successful registration", reasonCode: rejected ? "REJ-VALIDATION" : null, messageRef: `MSG-${cbId}`, submittedAt: fail ? "2026-11-02T10:00" : at, respondedAt: fail ? null : addMin(at, 1), delivery: fail ? "failed" : m.registration.sfdcSync === "conflict" ? "pending" : "acknowledged", retries: fail ? [{ at: "2026-11-02T11:00", outcome: "failed" }, { at: "2026-11-03T10:00", outcome: "failed" }] : [], lastError: fail ? m.registration.sfdcMessage : null, owner: null, approval: null });
  }
  // Invitations received in the current hour that the sync has not processed yet (member not found).
  const pendingInv = [{ ref: "INV-SFDC-990101", prog: "ST" as const }, { ref: "INV-SFDC-990102", prog: "CS" as const }];
  for (const p of pendingInv) sfdcRecords.push({ id: `SFR-${pad(sfdcRecords.length + 1)}`, externalRef: p.ref, recordType: p.prog === "ST" ? "st_invitation" : "cs_invitation", programme: p.prog, memberId: null, receivedAt: hoursBefore(now, 0.4), batchId: "pending", validation: "valid", processing: "pending", callbackId: null, error: null });
  // Blank member name (SFDC must validate at source, SOW 11.5) — the Phase 10 validation exception.
  const blank = rs.validationExceptions.find((x) => x.errorType === "missing_mandatory");
  if (blank) sfdcRecords.push({ id: `SFR-${pad(sfdcRecords.length + 1)}`, externalRef: blank.entityId, recordType: "retailer", programme: "Retailer", memberId: null, receivedAt: blank.detectedAt, batchId: blank.batchId ?? "", validation: "missing_mandatory", processing: "failed", callbackId: `SCB-${pad(callbacks.length + 1)}`, error: "Member name missing: rejected; SFDC owns this validation (SOW 11.5)" });
  if (blank) callbacks.push({ id: `SCB-${pad(callbacks.length + 1)}`, memberRef: blank.entityId, kind: "registration_result", result: "Rejected", reasonCode: "REJ-VALIDATION", messageRef: `MSG-BLANK-${blank.id}`, submittedAt: addMin(blank.detectedAt, 5), respondedAt: addMin(blank.detectedAt, 6), delivery: "acknowledged", retries: [], lastError: null, owner: null, approval: null });
  // Status updates for member restrictions (keeping SFDC and Rishta aligned).
  for (const r of mem.restrictions) for (const id of r.memberIds.filter((x) => sfdcMembers.some((m) => m.id === x))) {
    const cid = `SCB-${pad(callbacks.length + 1)}`;
    callbacks.push({ id: cid, memberRef: id, kind: "status_update", result: `${byId.get(id)!.status.replace(/_/g, " ")} → ${r.type === "program_block" ? "Program Block" : "Temporary Hold"}`, reasonCode: null, messageRef: `MSG-${cid}`, submittedAt: addMin(r.appliedAt, 2), respondedAt: r.type === "program_block" ? addMin(r.appliedAt, 3) : null, delivery: r.type === "program_block" ? "acknowledged" : "pending", retries: [], lastError: null, owner: null, approval: null });
  }
  // GST certificate updates from Rishta go to SFDC for approval.
  for (const g of ws.gst.filter((x) => x.verification !== "verified").slice(0, 3)) {
    const cid = `SCB-${pad(callbacks.length + 1)}`;
    callbacks.push({ id: cid, memberRef: g.memberId, kind: "gst_certificate", result: "GST certificate submitted for SFDC approval", reasonCode: null, messageRef: `MSG-${cid}`, submittedAt: hoursBefore(now, 30 + callbacks.length), respondedAt: hoursBefore(now, 29 + callbacks.length), delivery: "acknowledged", retries: [], lastError: null, owner: null, approval: "Awaiting SFDC approval (not confirmed by SFDC)" });
  }
  for (const c of callbacks) req("INT-SFDC", { operation: c.kind === "registration_result" ? "Registration result callback" : c.kind === "status_update" ? "Profile status update" : "GST certificate update", messageType: "member", businessRef: c.memberRef, memberId: c.memberRef.startsWith("MBR-") ? c.memberRef : null, at: c.submittedAt, status: c.delivery === "acknowledged" ? "success" : c.delivery === "pending" ? "pending" : "failed", errorCategory: "provider_rejected", httpStatus: 422, error: c.lastError, retryCount: c.retries.length, source: "SFDC callback adapter (mock)", payload: { messageRef: c.messageRef, resultType: c.result, reasonCode: c.reasonCode } });
  // Retailer and DD master records synchronised from SFDC (SOW 11.2): field presence only, values masked in transit.
  const activeCats = src.ms.categories.filter((c) => c.status === "active").map((c) => c.name);
  for (const r of sfdcRecords.filter((x) => x.memberId && (x.recordType === "retailer" || x.recordType === "dd"))) {
    req("INT-SFDC", { operation: r.recordType === "retailer" ? "Retailer record sync" : "DD record sync", messageType: "member", businessRef: r.externalRef, memberId: r.memberId, at: r.receivedAt, status: r.processing === "failed" ? "failed" : "success", errorCategory: r.processing === "failed" ? "validation" : null, httpStatus: r.processing === "failed" ? 422 : 200, error: r.processing === "failed" ? r.error : null, source: "SFDC sync adapter (mock)", sensitivePayload: r.recordType === "retailer", payload: r.recordType === "retailer" ? { pan: "Received (masked in transit)", gstin: "Received (masked in transit)", geoLocation: "Received" } : { activeProductCategories: activeCats.slice(0, 4).join(", ") || "None received" } });
  }
  // Hourly invitation sync over the last 24 hours (approximately hourly today, OP-SYNC1).
  for (let h = 23; h >= 0; h--) {
    const at = `${hoursBefore(now, h).slice(0, 13)}:00`;
    const id = `SYN-INV-${at.slice(0, 13).replace(/\D/g, "")}`;
    const missed = at.endsWith("11:00") && at.startsWith(now.slice(0, 10));
    const delayed = at.endsWith("06:00") && at.startsWith(now.slice(0, 10));
    const running = h === 0;
    const n = Math.floor(hash01(id) * 4);
    batches.push({ id, integrationId: "INT-SFDC", kind: "invitation_sync", startedAt: missed ? at : delayed ? addMin(at, 41) : at, completedAt: missed || running ? null : addMin(at, delayed ? 48 : 6), total: running ? pendingInv.length : missed ? 0 : n, succeeded: running || missed ? 0 : n, failed: 0, rejected: 0, retried: 0, status: missed ? "missed" : delayed ? "delayed" : running ? "completed" : "completed", source: "SFDC invitation sync (mock adapter)" });
    if (!missed) req("INT-SFDC", { operation: "Invitation sync", messageType: "member", businessRef: id, at: delayed ? addMin(at, 41) : at, status: running ? "pending" : "success", source: "SFDC sync adapter (mock)", payload: { records: running ? pendingInv.length : n } });
  }
  for (const r of src.ms.syncRuns) {
    batches.push({ id: r.id, integrationId: "INT-SFDC", kind: "hierarchy_sync", startedAt: r.startedAt, completedAt: r.completedAt, total: r.total, succeeded: r.succeeded, failed: r.failed, rejected: r.skipped, retried: 0, status: r.status === "running" ? "completed" : r.status, source: "Phase 4 SFDC hierarchy sync (mock)" });
    req("INT-SFDC", { operation: "Hierarchy sync", messageType: "hierarchy", businessRef: r.id, at: r.startedAt, status: r.status === "failed" ? "failed" : "success", error: r.errors[0]?.error ?? null, errorCategory: "validation", source: "Phase 4 masters", payload: { records: r.total, failed: r.failed } });
  }

  /* ---------------- eSeal (11.3) ---------------- */
  const eseal: EsealLookup[] = [];
  const scans = ss.txns.filter((t) => t.kind === "scan").slice(-70);
  for (const t of scans) {
    const sku = src.ms.skus.find((k) => k.id === t.skuId);
    const prod = sku ? src.ms.products.find((p) => p.id === sku.productId) : undefined;
    const cat = prod ? src.ms.categories.find((c) => c.id === prod.categoryId) : undefined;
    const sub = prod ? src.ms.subCategories.find((c) => c.id === prod.subCategoryId) : undefined;
    const pts = src.ms.scanPoints.find((p) => p.skuId === t.skuId)?.versions.find((v) => v.status === "active")?.scanIn ?? ss.accruals.find((a) => a.sourceRef === t.id && a.component === "base")?.points ?? null;
    const at = `${t.date}T${pad(8 + Math.floor(hash01(t.id) * 11), 2)}:${pad(Math.floor(hash01(t.id + "m") * 60), 2)}`;
    const h = hash01(`${t.id}eseal`);
    const status = h < 0.04 ? "timeout" : h < 0.07 ? "failed" : "success";
    const r = req("INT-ESEAL", { operation: "Product lookup", messageType: "scan", businessRef: t.id, memberId: t.memberId, at, status, errorCategory: status === "timeout" ? "timeout" : "not_found", httpStatus: status === "failed" ? 404 : undefined, error: status === "timeout" ? "eSeal did not respond within the adapter timeout (mock)" : status === "failed" ? "Coupon not found in eSeal (mock)" : null, source: "eSeal adapter (mock)", payload: { qr: `QR ••••${t.id.slice(-4)}`, sku: sku?.code ?? null } });
    const billedBlank = hash01(`${t.id}bill`) < 0.12;
    const stockOut = hash01(`${t.id}so`) < 0.06;
    const mismatch = hash01(`${t.id}mm`) < 0.05;
    const e = status === "success" && sku ? { sku: sku.code, category: cat?.name ?? "—", subCategory: sub?.name ?? "—", points: pts == null ? null : mismatch ? pts + 5 : pts, pinRequired: hash01(`${t.id}pin`) < 0.3, billedDate: billedBlank ? null : t.date, manufacturingDate: (prod?.createdAt ?? "2025-04-01").slice(0, 10), stockOut, parentSku: t.programme === "Retailer" && hash01(`${t.id}pk`) < 0.4 ? `${sku.code}-PACK` : null } : null;
    const eff = e ? effectiveDate(e) : { date: null, reason: "No eSeal response" };
    eseal.push({ id: `ESL-${pad(eseal.length + 1)}`, requestId: r.id, qrMasked: `QR ••••${t.id.slice(-4)}`, scanRef: t.id, memberId: t.memberId, skuId: t.skuId, eseal: e, platform: { sku: sku?.code ?? null, category: cat?.name ?? null, subCategory: sub?.name ?? null, points: pts }, effectiveDate: eff.date, dateReason: eff.reason, validation: !e ? "failed" : mismatch ? "mismatch" : "valid" });
  }
  const retailSkus = src.ms.skus.filter((k) => k.status === "active" && k.programmes.includes("Retailer")).slice(0, 4);
  const packs = retailSkus.map((k, i) => ({ id: `PCK-${pad(i + 1, 3)}`, parentSku: `${k.code}-PACK`, childSku: k.code, ref: `ESEAL-PACK-${pad(i + 1, 4)}`, source: "eSeal (mapping source not confirmed: OP-32 / OP-44)", lastReceived: hoursBefore(now, 20 + i), status: (i === 3 ? "missing_child" : "source_unconfirmed") as "missing_child", lastValidation: hoursBefore(now, 19 + i) }));

  /* ---------------- Siebel (mock adapter log; no upstream module) ---------------- */
  for (let i = 0; i < 18; i++) {
    const m = mem.members[(i * 7) % mem.members.length];
    const p = src.ms.products[(i * 3) % src.ms.products.length];
    const at = hoursBefore(now, 2 + i * 7);
    const h = hash01(`siebel${i}`);
    req("INT-SIEBEL", { operation: i % 2 ? "Warranty lookup" : "Customer lookup", messageType: "ticket", businessRef: i % 2 ? `WRT-DEV-${pad(i, 4)}` : `CUS-DEV-${pad(i, 4)}`, memberId: m.id, at, status: h < 0.1 ? "timeout" : h < 0.16 ? "failed" : "success", errorCategory: h < 0.1 ? "timeout" : "not_found", httpStatus: h >= 0.1 && h < 0.16 ? 404 : undefined, error: h < 0.1 ? "Siebel did not respond (mock)" : h < 0.16 ? "Customer not found in Siebel (mock)" : null, source: "Siebel adapter (mock log)", payload: { customerRef: `CUS-DEV-${pad(i, 4)}`, warranty: i % 2 ? `${p.name}: ${p.warranty.value ?? "—"} ${p.warranty.unit}` : null } });
  }

  /* ---------------- RazorPay ← Phase 7 payouts ---------------- */
  for (const p of ws.payouts) {
    const red = ws.redemptions.find((r) => r.id === p.redemptionId);
    req("INT-RZP", { operation: red?.method === "upi" ? "UPI payout" : "Bank transfer payout", messageType: "redemption", businessRef: p.id, memberId: red?.memberId ?? null, at: p.initiatedAt, status: p.status === "success" ? "success" : p.status === "failed" ? "failed" : "pending", errorCategory: "provider_rejected", httpStatus: 400, error: p.failureReason, financial: true, source: "Phase 7 payout record", payload: { redemption: p.redemptionId, amountInr: p.amountInr, utr: p.utr ? maskTail(p.utr, 4) : null, reconciliation: p.reconciliation } });
  }
  req("INT-RZP", { operation: "Card payout", messageType: "redemption", businessRef: "RZP-CARD-ADAPTER-TEST", at: hoursBefore(now, 26), status: "success", financial: true, source: "Adapter contract test (no Phase 7 redemption uses card)", payload: { method: "card", amountInr: 1, utr: null } });

  /* ---------------- DigiLocker / Signzy ← KYC documents ---------------- */
  for (const d of mem.documents.filter((x) => x.submittedAt && ["aadhaar", "pan", "bank"].includes(x.type))) {
    const failed = d.status === "verification_failed";
    const integrationId = d.type === "aadhaar" ? "INT-DIGI" : "INT-SIGNZY";
    req(integrationId, { operation: d.type === "aadhaar" ? "Aadhaar verification" : d.type === "pan" ? "PAN check" : "Penny-less bank verification", messageType: "kyc", businessRef: d.id, memberId: d.memberId, at: d.submittedAt!.slice(0, 16), status: failed ? (hash01(d.id) < 0.5 ? "timeout" : "failed") : d.status === "approved" ? "success" : "pending", errorCategory: "provider_rejected", httpStatus: 422, error: failed ? d.exception ?? d.rejectionReason ?? "Verification failed at the provider (mock)" : null, sensitivePayload: true, source: "KYC module record", payload: { identity: d.maskedId ?? "Not captured", consent: d.type === "aadhaar" ? "Captured (see Member Management)" : null } });
  }

  /* ---------------- WhatsApp / SMS ← Communication Centre attempts ---------------- */
  for (const a of cs.attempts.filter((x) => x.channel === "whatsapp" || x.channel === "sms")) {
    const st = a.status === "provider_error" ? "failed" : a.status === "failed" ? "failed" : "success";
    req(a.channel === "whatsapp" ? "INT-WA" : "INT-SMS", { operation: a.channel === "whatsapp" ? "WhatsApp message" : "SMS", messageType: "communication", businessRef: a.id, memberId: a.recipientKind === "member" ? a.recipientId : null, at: a.at, status: st, errorCategory: a.status === "provider_error" ? "dependency" : "provider_rejected", httpStatus: a.status === "provider_error" ? 503 : 200, error: a.error, source: "Communication Centre attempt", payload: { commId: a.commId, template: a.templateId, recipient: a.recipientKind === "member" ? `${a.recipientId.slice(0, 7)}••` : "staff", delivery: a.status } });
  }

  /* ---------------- Google Maps ← geo-fence checks and address verification ---------------- */
  for (const g of rs.geoFence) req("INT-MAPS", { operation: "Reverse geocoding", messageType: "location", businessRef: g.id, memberId: g.memberId, at: g.scan.at, status: g.result === "gps_denied" ? "failed" : "success", errorCategory: "validation", httpStatus: 400, error: g.result === "gps_denied" ? "No coordinates (GPS permission denied)" : null, sensitivePayload: true, source: "Geo-validation check (Phase 10)", payload: { coordinates: "Restricted", territory: g.result === "within" ? "Within territory" : "Outside / not validated" } });
  // Territory validation of member addresses: the result is whatever Member Management recorded for the address.
  for (const m of [...mem.members.filter((x) => x.addresses.working?.verification === "territory_mismatch" || x.addresses.home?.verification === "territory_mismatch").slice(0, 4), ...mem.members.filter((x) => x.addresses.working?.verification === "geo_validated").slice(0, 4)]) req("INT-MAPS", { operation: "Territory validation", messageType: "location", businessRef: m.id, memberId: m.id, at: hoursBefore(now, 40), status: "success", source: "Member Management address", payload: { territory: m.addresses.working?.verification === "territory_mismatch" || m.addresses.home?.verification === "territory_mismatch" ? "Territory mismatch" : "Within mapped territory" } });
  req("INT-MAPS", { operation: "Address lookup", messageType: "location", businessRef: "GEO-LOOKUP-TIMEOUT", at: hoursBefore(now, 5), status: "timeout", source: "Maps adapter (mock)" });

  /* ---------------- Logistics ← gift order tracking ---------------- */
  for (const o of gs.orders) {
    for (const t of o.tracking.filter((x) => x.source === "partner_adapter" && !x.duplicate)) req("INT-LOGI", { operation: "Tracking poll", messageType: "logistics", businessRef: o.id, memberId: o.memberId, at: t.at, status: "success", source: "Gift & Fulfilment tracking event", payload: { shipment: o.shipmentRef, status: t.partnerStatus } });
    for (const e of o.exceptions.filter((x) => x.kind === "tracking_unavailable" || x.kind === "partner_update_missing")) req("INT-LOGI", { operation: "Tracking poll", messageType: "logistics", businessRef: o.id, memberId: o.memberId, at: e.at, status: "failed", errorCategory: "dependency", error: e.detail, source: "Gift & Fulfilment exception", payload: { shipment: o.shipmentRef } });
  }

  /* ---------------- Jobs and queues ---------------- */
  const run = (jobId: string, n: number, p: Partial<JobRun> & Pick<JobRun, "scheduledFor" | "status">): JobRun => ({ id: `${jobId}-R${pad(n, 3)}`, jobId, startedAt: p.status === "missed" ? null : p.scheduledFor, completedAt: p.status === "missed" || p.status === "running" ? null : addMin(p.scheduledFor, 8), received: 0, processed: 0, failed: 0, skipped: 0, error: null, retries: [], ...p });
  const jobs: Job[] = [
    { id: "JOB-SFDC-INV", name: "SFDC invitation sync", integrationId: "INT-SFDC", type: "scheduled", frequency: "Approximately hourly today (target not confirmed: OP-SYNC1)", frequencyStatus: "business_confirmation_required", source: "SFDC sync adapter (mock)", runs: batches.filter((b) => b.kind === "invitation_sync").map((b, n) => run("JOB-SFDC-INV", n + 1, { scheduledFor: b.id.length ? `${b.startedAt.slice(0, 13)}:00` : b.startedAt, startedAt: b.status === "missed" ? null : b.startedAt, completedAt: b.completedAt, status: b.status === "missed" ? "missed" : b.status === "delayed" ? "delayed" : b.completedAt ? "success" : "running", received: b.total, processed: b.succeeded, error: b.status === "missed" ? "No run recorded for the scheduled hour" : b.status === "delayed" ? "Started 41 minutes late" : null })) },
    { id: "JOB-SFDC-HIER", name: "SFDC hierarchy sync", integrationId: "INT-SFDC", type: "scheduled", frequency: "Daily (Phase 4 sync runs)", frequencyStatus: "sow", source: "Phase 4 masters", runs: src.ms.syncRuns.map((r, n) => run("JOB-SFDC-HIER", n + 1, { scheduledFor: r.startedAt, completedAt: r.completedAt, status: r.status === "failed" ? "failed" : "success", received: r.total, processed: r.succeeded, failed: r.failed, skipped: r.skipped, error: r.errors[0]?.error ?? null })) },
    { id: "JOB-SFDC-CB", name: "SFDC callback processing", integrationId: "INT-SFDC", type: "callback_processing", frequency: "Real time (event-driven)", frequencyStatus: "sow", source: "SFDC callback adapter (mock)", runs: callbacks.filter((c) => c.submittedAt >= hoursBefore(now, 168)).map((c, n) => run("JOB-SFDC-CB", n + 1, { scheduledFor: c.submittedAt, status: c.delivery === "failed" ? "failed" : c.delivery === "pending" ? "delayed" : "success", received: 1, processed: c.delivery === "acknowledged" ? 1 : 0, failed: c.delivery === "failed" ? 1 : 0, error: c.delivery === "pending" ? "Callback not acknowledged by SFDC" : c.lastError, retries: c.retries.map((x) => `${x.at} ${x.outcome}`) })) },
    { id: "JOB-DEDUP", name: "Nightly identity de-duplication (Aadhaar / PAN / bank)", integrationId: "INT-SIGNZY", type: "batch", frequency: "Nightly at midnight (SOW 9.1)", frequencyStatus: "sow", source: "Identity registry batch (Phase 10)", runs: rs.dedupBatches.map((b, n) => run("JOB-DEDUP", n + 1, { scheduledFor: b.runAt, status: b.status === "completed" ? "success" : "failed", received: b.scanned, processed: b.scanned, error: null })) },
    { id: "JOB-RZP-RECON", name: "Daily RazorPay payout reconciliation", integrationId: "INT-RZP", type: "batch", frequency: "Daily (SOW 11.4)", frequencyStatus: "sow", source: "Phase 7 reconciliation", runs: [3, 2, 1, 0].map((d, n) => run("JOB-RZP-RECON", n + 1, { scheduledFor: `${hoursBefore(now, d * 24 + 6).slice(0, 10)}T06:00`, status: d === 0 ? "success" : "success", received: ws.payouts.length, processed: ws.payouts.length, failed: d === 0 ? ws.payouts.filter((p) => p.reconciliation !== "matched" && p.reconciliation !== "pending").length : 0, error: d === 0 ? "Differences found (see reconciliation)" : null })) },
    { id: "JOB-LOGI-POLL", name: "Logistics tracking poll", integrationId: "INT-LOGI", type: "polling", frequency: "Regular polling (interval not confirmed)", frequencyStatus: "business_confirmation_required", source: "Gift & Fulfilment tracking adapter (mock)", runs: Array.from({ length: 12 }, (_, k) => run("JOB-LOGI-POLL", k + 1, { scheduledFor: `${hoursBefore(now, (11 - k) * 2).slice(0, 13)}:00`, status: k === 9 ? "failed" : k === 11 ? "running" : "success", received: gs.orders.length, processed: k === 9 ? 0 : gs.orders.filter((o) => o.partnerOrderRef).length, failed: k === 9 ? 1 : 0, error: k === 9 ? "Tracking provider unavailable (mock)" : null })) },
  ];
  const series = (seed: string, base: number, spikeAt: number, spike: number) => Array.from({ length: 24 }, (_, k) => ({ at: `${hoursBefore(now, 23 - k).slice(0, 13)}:00`, pending: Math.round(base + hash01(seed + k) * base * 0.6 + (k === spikeAt ? spike : 0)), lagSeconds: Math.round(2 + hash01(seed + "l" + k) * 8 + (k === spikeAt ? spike / 4 : 0)) }));
  const q = (id: string, alias: string, integrationId: string, base: number, spikeAt: number, spike: number): QueueSnapshot => {
    const s = series(id, base, spikeAt, spike);
    const last = s[s.length - 1];
    return { id, alias, integrationId, pending: last.pending, processing: Math.round(base / 3), lagSeconds: last.lagSeconds, oldestAgeSeconds: last.lagSeconds * 6, deadLetter: null, ratePerMin: Math.round(base * 2), consumer: spikeAt >= 22 ? "degraded" : "healthy", at: now, series: s };
  };
  const queues: QueueSnapshot[] = [q("QUE-01", "Inbound SFDC messages (alias)", "INT-SFDC", 6, 9, 40), q("QUE-02", "Outbound notifications (alias)", "INT-WA", 30, 23, 420), q("QUE-03", "Payout callbacks (alias)", "INT-RZP", 4, 12, 20)];

  /* ---------------- SOW 11.5 integration exceptions ---------------- */
  const exceptions: IntegrationException[] = [];
  const ex = (kind: IntegrationException["kind"], p: Partial<IntegrationException> & { detail: IntegrationException["detail"]; sourceRef: string; detectedAt: string }) => exceptions.push({ id: `IEX-${pad(exceptions.length + 1, 4)}`, kind, externalRef: null, memberId: null, programme: null, callbackStatus: "not_applicable", status: "open", decisionRef: null, ...p });
  for (const p of sfdcRecords.filter((r) => r.processing === "pending")) ex("member_not_synced", { externalRef: p.externalRef, memberId: p.memberId, programme: p.programme, detectedAt: p.receivedAt, detail: { invitationReceived: p.receivedAt, expectedSync: "Next hourly run (OP-SYNC1)", actualSync: "Not yet", memberCreation: p.memberId ? "Created, not synced" : "Not created", loyalty: "Switched off until the sync completes", workaround: "Temporary: member logs out and back in after about an hour (not a permanent fix)" }, sourceRef: p.id, decisionRef: "OP-SYNC1" });
  for (const m of rs.identityMatches.filter((x) => x.identifier === "mobile")) ex("mobile_already_registered", { memberId: m.originalMemberId, programme: byId.get(m.originalMemberId)?.programme ?? null, detectedAt: m.detectedAt, detail: { mobile: m.masked, existingStatus: byId.get(m.originalMemberId)?.status.replace(/_/g, " ") ?? "—", newRegistration: m.matchingMemberId, conflict: "Mobile already registered", resolution: "Not defined (OP-19)" }, sourceRef: m.id, decisionRef: "OP-18" });
  for (const m of mem.members.filter((x) => x.registration.source === "sfdc_invite").slice(2, 4)) ex("mobile_mismatch", { memberId: m.id, programme: m.programme, externalRef: m.registration.sfdcRef, detectedAt: hoursBefore(now, 50), detail: { sfdcMobile: `+91 ${maskTail("98" + m.id.replace(/\D/g, "").padStart(8, "1"), 3)} (SFDC, mock)`, rishtaMobile: `+91 ${maskTail(m.mobile, 3)}`, sourceUpdated: hoursBefore(now, 52), internalUpdated: m.updatedAt, resolution: "Source of truth not defined (OP-18)" }, sourceRef: m.id, decisionRef: "OP-18" });
  for (const m of rs.identityMatches.filter((x) => x.identifier === "pan")) ex("pan_gst_in_use", { memberId: m.matchingMemberId, programme: byId.get(m.matchingMemberId)?.programme ?? null, detectedAt: m.detectedAt, detail: { identifier: "PAN", masked: m.masked, conflicting: `${m.originalMemberId.slice(0, 7)}••`, validation: "Already mapped to another profile", source: "Identity registry" }, sourceRef: m.id });
  const rt3 = mem.members.find((m) => m.registration.sfdcSync === "conflict");
  if (rt3) ex("pan_gst_in_use", { memberId: rt3.id, programme: rt3.programme, externalRef: rt3.registration.sfdcRef, detectedAt: "2026-11-08T02:10", detail: { identifier: "PAN / GST", masked: "Not received (PAN missing in payload)", conflicting: "—", validation: rt3.registration.sfdcMessage, source: "SFDC sync" }, callbackStatus: "pending", sourceRef: rt3.id });
  for (const i of mem.identities.filter((x) => x.memberIds.length > 1)) {
    const ms2 = i.memberIds.map((id) => byId.get(id)!);
    const retailer = ms2.some((m) => m.programme === "Retailer");
    const block = mem.restrictions.find((r) => r.identityId === i.id && r.status !== "lifted");
    ex("other_programme", { memberId: ms2[ms2.length - 1].id, programme: ms2[ms2.length - 1].programme, detectedAt: block?.appliedAt ?? "2025-11-20T10:00", detail: { identity: i.id, current: ms2[0].programme, existing: ms2.map((m) => `${m.id} (${m.programme})`).join(", "), incoming: ms2[ms2.length - 1].programme, conflict: "Member belongs to another programme", blockOutcome: retailer ? "Retailer exception: old account not blocked (SOW 11.5)" : block ? `${block.id} ${block.type.replace("_", " ")}` : "Not blocked", history: "Preserved" }, sourceRef: i.id });
  }
  if (blank) ex("blank_name", { externalRef: blank.entityId, programme: "Retailer", detectedAt: blank.detectedAt, detail: { field: "Member name", sourceValidation: "Missing at SFDC (SFDC owns this validation)", processing: "Rejected, not inserted", correction: "Awaiting SFDC correction" }, callbackStatus: "sent", sourceRef: blank.id, decisionRef: "OP-18" });
  for (const m of rs.identityMatches.filter((x) => x.identifier === "bank")) ex("duplicate_bank", { memberId: m.matchingMemberId, programme: byId.get(m.matchingMemberId)?.programme ?? null, detectedAt: m.detectedAt, detail: { bank: m.masked, verification: "Penny-less verification passed (provider)", duplicateCheck: `Nightly batch ${m.batchRef ?? "—"}: matches ${m.originalMemberId}`, review: m.status.replace(/_/g, " ") }, sourceRef: m.id });

  /* ---------------- Service telemetry (src/services contracts; simulated) ---------------- */
  const svc = (id: string, name: string, group: string, contract: string, spike: { at: number; kind: "latency" | "5xx" | "db" | "dependency" } | null, deps: string[]): ServiceHealth => {
    const s = Array.from({ length: 24 }, (_, k) => {
      const at = `${hoursBefore(now, 23 - k).slice(0, 13)}:00`;
      const requests = Math.round(220 + hash01(id + k) * 520);
      const hot = spike && k === spike.at;
      const avg = Math.round(160 + hash01(id + "a" + k) * 260 + (hot && spike!.kind === "latency" ? 1200 : 0));
      return { at, requests, failures: Math.round(requests * (0.002 + hash01(id + "f" + k) * 0.006)) + (hot && spike!.kind !== "latency" ? 38 : 0), avgMs: avg, p95Ms: Math.round(avg * (2.1 + hash01(id + "p" + k) * 0.9)) };
    });
    const cat = spike?.kind === "5xx" ? "http_5xx" : spike?.kind === "db" ? "database" : spike?.kind === "dependency" ? "dependency" : "timeout";
    const failures = Array.from({ length: 4 }, (_, k) => ({ id: `${id}-F${k + 1}`, correlationId: `COR-${id.slice(4)}-${pad(k + 1, 4)}`, at: addMin(s[spike?.at ?? 20].at, k * 7), durationMs: cat === "timeout" ? 30000 : ms(id + k, 400, 3200), http: cat === "http_5xx" ? 503 : cat === "database" ? 500 : cat === "dependency" ? 502 : null, category: cat as "timeout", dependency: cat === "dependency" ? deps[0] ?? null : cat === "database" ? "PostgreSQL (development)" : null, stackRef: `STK-${id.slice(4)}-${k + 1}`, retries: k % 2, resolution: (k === 0 ? "resolved" : "open") as "open", memberId: k === 1 ? mem.members[3].id : null }));
    return { id, name, group, contract, series: s, errors: { [cat]: failures.length, timeout: 2 }, lastSuccess: hoursBefore(now, 0.1), dependencies: deps.map((d, k) => ({ name: d, status: spike?.kind === "dependency" && k === 0 ? "degraded" : "healthy" })), failures };
  };
  const services: ServiceHealth[] = [
    svc("SVC-ACCESS", "Access API", "Identity & access", "src/services/accessApi.ts", null, ["PostgreSQL (development)"]),
    svc("SVC-APPROVAL", "Approval API", "Governance", "src/services/approvalApi.ts", null, ["PostgreSQL (development)"]),
    svc("SVC-COMMS", "Communication API", "Engagement", "src/services/commsApi.ts", { at: 23, kind: "dependency" }, ["WhatsApp Business API", "SMS Gateway"]),
    svc("SVC-MASTER", "Master data API", "Configuration", "src/services/masterDataApi.ts", null, ["SFDC", "PostgreSQL (development)"]),
    svc("SVC-MEMBER", "Member API", "Members", "src/services/memberApi.ts", { at: 18, kind: "5xx" }, ["DigiLocker / UIDAI", "Signzy / NSDL"]),
    svc("SVC-SCHEME", "Scheme API", "Schemes", "src/services/schemeApi.ts", { at: 21, kind: "db" }, ["PostgreSQL (development)", "eSeal"]),
    svc("SVC-WALLET", "Wallet API", "Finance", "src/services/walletApi.ts", { at: 19, kind: "latency" }, ["RazorPay", "PostgreSQL (development)"]),
  ];

  /* ---------------- Crash and non-fatal errors (telemetry adapter; provider not confirmed) ---------------- */
  const DEV = ["Model A (dev)", "Model B (dev)", "Model C (dev)"];
  const OS = ["Android 12", "Android 13", "Android 14"];
  const crash = (n: number, app: string, version: string, module: string, kind: CrashRecord["kind"], errorType: string, count: number, related: string[] = []): CrashRecord => ({ id: `CRH-${pad(n, 4)}`, app, version, module, deviceModel: DEV[n % 3], os: OS[(n + 1) % 3], kind, errorType, message: `${errorType} in ${module} (development telemetry)`, stackRef: `STK-APP-${pad(n, 4)}`, stack: `${errorType}\n  at ${module.replace(/\s/g, "")}Screen.render (mock frame)\n  at Bridge.dispatch (mock frame)\n  … development stack trace`, count, affectedDevices: Math.max(1, Math.round(count / 3)), firstSeen: hoursBefore(now, 120 + n * 5), lastSeen: hoursBefore(now, n), reproduce: count > 20 ? "Every session on the affected version" : count > 5 ? "Intermittent" : "Rare", status: n === 1 ? "investigating" : n > 6 ? "resolved" : "new", relatedFailures: related, incidentId: null });
  const crashes: CrashRecord[] = [
    crash(1, "Rishta Influencer app", "4.2.0 (mock)", "Wallet", "crash", "NullPointerException", 46, [services.find((s) => s.id === "SVC-WALLET")!.failures[0].id]),
    crash(2, "Rishta Influencer app", "4.2.0 (mock)", "Scan", "crash", "CameraAccessException", 12),
    crash(3, "Rishta Retailer app", "3.9.1 (mock)", "Redemption", "crash", "IllegalStateException", 7),
    crash(4, "Rishta Influencer app", "4.1.5 (mock)", "KYC", "non_fatal", "SocketTimeoutException", 31, [services.find((s) => s.id === "SVC-MEMBER")!.failures[0].id]),
    crash(5, "Rishta Influencer app", "4.2.0 (mock)", "Gifts", "non_fatal", "JsonParseException", 9),
    crash(6, "Rishta Retailer app", "3.9.1 (mock)", "Login", "non_fatal", "SSLHandshakeException", 4),
    crash(7, "Rishta Influencer app", "4.1.5 (mock)", "Scan", "crash", "OutOfMemoryError", 3),
    crash(8, "Rishta Retailer app", "3.9.0 (mock)", "Schemes", "non_fatal", "IndexOutOfBoundsException", 2),
  ];

  /* ---------------- Infrastructure metrics (adapter; no AWS resource assumed) ---------------- */
  const metric = (key: MetricSeries["key"], label: string, unit: string, base: number, spread: number, spikeAt: number, spike: number): MetricSeries => ({ key, label, unit, source: "Infrastructure metrics adapter (simulated; no resource names assumed)", points: Array.from({ length: 24 }, (_, k) => ({ at: `${hoursBefore(now, 23 - k).slice(0, 13)}:00`, v: Math.round((base + hash01(key + k) * spread + (k === spikeAt ? spike : k === spikeAt + 1 ? spike / 2 : 0)) * 10) / 10 })) });
  const metrics: MetricSeries[] = [
    metric("cpu", "CPU utilisation", "%", 34, 18, 19, 30),
    metric("memory", "Memory utilisation", "%", 52, 10, 19, 14),
    metric("disk", "Disk utilisation", "%", 61, 2, 0, 0),
    metric("net_in", "Network inbound", "MB/s", 12, 8, 19, 20),
    metric("net_out", "Network outbound", "MB/s", 9, 6, 23, 14),
    metric("db_pool", "DB connection pool", "%", 41, 14, 21, 46),
    metric("queue_lag", "Queue lag", "s", 4, 6, 23, 48),
  ];
  const autoscaling = [{ id: "ASG-EVT-01", at: addMin(`${hoursBefore(now, 4).slice(0, 13)}:00`, 5), action: "scale_out" as const, from: 2, to: 3, reason: "CPU above 70% (reported by the scaling adapter, simulated)" }, { id: "ASG-EVT-02", at: addMin(`${hoursBefore(now, 2).slice(0, 13)}:00`, 20), action: "scale_in" as const, from: 3, to: 2, reason: "Load normalised (simulated)" }];

  /* ---------------- Changes and feature flags ---------------- */
  const wspike = services.find((s) => s.id === "SVC-WALLET")!.series[19].at;
  const changes: ChangeEvent[] = [
    { id: "CHG-DEP-01", kind: "deployment", at: addMin(wspike, -35), title: "Wallet service 4.18.2 (development build)", ref: "DEP-2611-09-01", detail: "Release pipeline record (mock)", by: "Release pipeline", before: "4.18.1", after: "4.18.2", services: ["Wallet API"], endAt: null },
    { id: "CHG-SCH-01", kind: "schema", at: addMin(wspike, -30), title: "Payout index migration", ref: "MIG-2026-11-09-001", detail: "Deployment DEP-2611-09-01 (mock)", by: "Release pipeline", before: null, after: null, services: ["Wallet API"], endAt: null },
    { id: "CHG-FLG-01", kind: "feature_flag", at: addMin(wspike, -20), title: "redemption.instant-upi enabled", ref: "FLG-0003", detail: "Feature flag service (mock)", by: "USR-1003", before: "false", after: "true", services: ["Wallet API"], endAt: null },
    { id: "CHG-VEN-01", kind: "vendor_outage", at: `${hoursBefore(now, 1).slice(0, 13)}:00`, title: "WhatsApp provider degraded", ref: "VND-WA-2611-09", detail: "Derived from Communication Centre provider errors (mock)", by: null, before: null, after: null, services: ["Communication API"], endAt: null },
  ];
  const flags = [{ key: "scan.offline-queue", state: true, changedBy: "USR-1003", changedAt: hoursBefore(now, 200), ref: "FLG-0001" }, { key: "kyc.digilocker-v2", state: false, changedBy: "USR-1003", changedAt: hoursBefore(now, 90), ref: "FLG-0002" }, { key: "redemption.instant-upi", state: true, changedBy: "USR-1003", changedAt: addMin(wspike, -20), ref: "FLG-0003" }];

  /* ---------------- Authentication events ← device logins (Phase 10) ---------------- */
  const auth: AuthEvent[] = [];
  for (const d of rs.devices) for (const l of d.logins) {
    const m = byId.get(l.memberId);
    // Member Management is authoritative for first login: a member it records as never logged in gets no login event.
    if (!m || !m.registration.firstLoginAt) continue;
    auth.push({ id: `AUE-${pad(auth.length + 1, 6)}`, memberId: m.id, programme: m.programme, branchCode: m.branchCode, at: l.at, result: l.outcome === "success" ? "success" : "failure", reason: l.outcome === "success" ? null : "device_blacklisted", appVersion: l.appVersion ?? "Unknown", deviceModel: pick(d.id, DEV), os: pick(d.id + "os", OS), deviceId: d.id, deviceStatus: d.status === "blocked" ? "blocked" : "active", sessionRef: l.sessionRef });
  }
  const restricted = mem.restrictions.filter((r) => r.status !== "lifted").flatMap((r) => r.memberIds);
  const fail = (m: string, reason: AuthEvent["reason"], at: string, deviceId: string | null) => { const x = byId.get(m)!; const d = deviceId ? rs.devices.find((y) => y.id === deviceId) : undefined; auth.push({ id: `AUE-${pad(auth.length + 1, 6)}`, memberId: x.id, programme: x.programme, branchCode: x.branchCode, at, result: "failure", reason, appVersion: "4.2.0 (mock)", deviceModel: pick(deviceId ?? m, DEV), os: pick((deviceId ?? m) + "os", OS), deviceId, deviceStatus: d ? (d.status === "blocked" ? "blocked" : "active") : "unknown", sessionRef: null }); };
  for (let k = 0; k < 3; k++) fail(mem.members[12].id, "wrong_mpin", hoursBefore(now, 6 - k), null);
  for (const m of restricted.slice(0, 2)) fail(m, "blocked_user", hoursBefore(now, 9), null);
  const blockedDev = rs.devices.find((d) => d.status === "blocked");
  if (blockedDev) fail(blockedDev.associations[0].memberId, "device_blacklisted", hoursBefore(now, 3), blockedDev.id);

  /* ---------------- Redemption float (finance float service not connected) ---------------- */
  const snapshots = Array.from({ length: 14 }, (_, k) => {
    const date = hoursBefore(now, (13 - k) * 24).slice(0, 10);
    const payouts = ws.payouts.filter((p) => p.initiatedAt.startsWith(date) && p.status === "success").reduce((n, p) => n + p.amountInr, 0);
    return { date, payouts, incoming: k % 5 === 0 ? 500000 : 0 };
  });
  let opening = 2500000;
  const floatSnaps = snapshots.map((s, k) => { const closing = opening + s.incoming - s.payouts; const row = { date: s.date, opening, incoming: s.incoming, payouts: s.payouts, closing, reconciliation: (k === 13 ? "pending" : "matched") as "matched", ref: `FLT-${s.date.replace(/-/g, "")}` }; opening = closing; return row; });

  /* ---------------- Alerts (sent through the Communication Centre by the store) ---------------- */
  const alerts: OpsAlert[] = [];
  const alert = (type: OpsAlert["type"], p: Partial<OpsAlert> & Pick<OpsAlert, "trigger" | "detectedAt" | "expected" | "actual">) => alerts.push({ id: `OAL-${pad(alerts.length + 1, 4)}`, type, integrationId: null, service: null, triggerValue: null, threshold: null, severity: null, owner: null, status: "created", escalation: 0, incidentId: null, traceRef: null, commId: null, history: [{ at: p.detectedAt, by: "SYSTEM", status: "created", remarks: "Raised by the monitoring adapter" }], resolution: null, ...p });
  const missed = batches.find((b) => b.status === "missed");
  if (missed) alert("sync_missed", { integrationId: "INT-SFDC", trigger: `${missed.id}: no run for the scheduled hour`, detectedAt: addMin(missed.startedAt, 30), expected: "Hourly invitation sync (current behaviour; OP-SYNC1)", actual: "No run recorded", traceRef: missed.id });
  const failedCb = callbacks.find((c) => c.delivery === "failed");
  if (failedCb) alert("callback_failure", { integrationId: "INT-SFDC", trigger: `${failedCb.id} rejected by SFDC`, detectedAt: failedCb.submittedAt, expected: "Callback acknowledged", actual: failedCb.lastError ?? "Failed", traceRef: failedCb.memberRef, status: "acknowledged", owner: "USR-1003" });
  const waFail = reqs.filter((r) => r.integrationId === "INT-WA" && r.status === "failed");
  if (waFail.length) alert("bot_notification_failed", { integrationId: "INT-WA", trigger: `${waFail.length} WhatsApp message(s) failed`, detectedAt: waFail[waFail.length - 1].at, expected: "Messages accepted and delivered", actual: `${waFail.length} failed`, triggerValue: String(waFail.length) });
  alert("queue_backlog", { integrationId: "INT-WA", trigger: "Outbound notifications queue backlog", detectedAt: queues[1].at, expected: "Backlog threshold not configured (OP-MON1)", actual: `${queues[1].pending} pending`, triggerValue: String(queues[1].pending) });
  const rzpDiff = ws.payouts.filter((p) => p.reconciliation === "missing_utr" || p.reconciliation === "unmatched_external");
  if (rzpDiff.length) alert("reconciliation_difference", { integrationId: "INT-RZP", trigger: `${rzpDiff.length} payout(s) differ between sent and paid`, detectedAt: `${now.slice(0, 10)}T06:10`, expected: "Daily reconciliation matched", actual: `${rzpDiff.length} difference(s)`, traceRef: rzpDiff[0].id });
  alert("high_latency", { service: "Wallet API", trigger: "Wallet API p95 above the SOW 2 s reference (simulated telemetry)", detectedAt: wspike, expected: "p95 below 2 seconds (SOW)", actual: `${services.find((s) => s.id === "SVC-WALLET")!.series[19].p95Ms} ms`, threshold: "2000 ms (SOW target)", triggerValue: String(services.find((s) => s.id === "SVC-WALLET")!.series[19].p95Ms) });
  alert("api_5xx", { service: "Member API", trigger: "Member API 5xx spike (simulated telemetry)", detectedAt: services.find((s) => s.id === "SVC-MEMBER")!.series[18].at, expected: "Threshold not configured (OP-MON1)", actual: `${services.find((s) => s.id === "SVC-MEMBER")!.series[18].failures} failures in the hour` });
  alert("db_error", { service: "Scheme API", trigger: "Scheme API database timeouts (simulated telemetry)", detectedAt: services.find((s) => s.id === "SVC-SCHEME")!.series[21].at, expected: "No database errors", actual: "Database timeouts" });
  alert("crash_spike", { service: "Rishta Influencer app 4.2.0", trigger: "Crash count rising on 4.2.0 (development telemetry)", detectedAt: crashes[0].lastSeen, expected: "Threshold not configured (OP-MON1)", actual: `${crashes[0].count} crashes` });

  const rules = [...SOW_INTEGRATIONS, CHANNEL_CHECK].map((i, k) => ({ id: `MRL-${pad(k + 1, 3)}`, integrationId: i.id, expectedFrequency: i.id === "INT-SFDC" ? "About hourly (OP-SYNC1)" : i.connection === "placeholder" ? null : i.frequency, window: null, failureCondition: null, delayCondition: null, severity: null, escalationGroup: null, channel: "email" as const, active: i.connection !== "placeholder", status: "business_confirmation_required" as const }));

  return {
    integrations: [...structuredClone(SOW_INTEGRATIONS), structuredClone(CHANNEL_CHECK)],
    requests: reqs,
    sfdcRecords,
    callbacks,
    batches,
    eseal,
    packs,
    jobs,
    queues,
    retries: [],
    exceptions,
    alerts,
    rules,
    services,
    crashes,
    metrics,
    autoscaling,
    changes,
    flags,
    incidents: [{ id: "INC-0001", title: "Wallet API latency spike after 4.18.2", status: "investigating", owner: "USR-1003", severity: null, window: { from: addMin(wspike, -60), to: addMin(wspike, 60) }, services: ["Wallet API"], traces: [], changes: ["CHG-DEP-01", "CHG-SCH-01", "CHG-FLG-01"], alerts: [], notes: [{ at: addMin(wspike, 20), by: "USR-1003", text: "Latency rose shortly after the deployment and flag change: correlation under review, cause not established" }], history: [{ at: addMin(wspike, 10), by: "USR-1003", status: "open", remarks: "Opened from the latency alert" }, { at: addMin(wspike, 15), by: "USR-1003", status: "investigating", remarks: "" }], createdBy: "USR-1003", createdAt: addMin(wspike, 10), resolvedAt: null }],
    auth,
    float: { snapshots: floatSnaps, source: "Finance float service not connected: opening balance and top-ups are development values; payouts are the Phase 7 payout records", lowThreshold: null, thresholdStatus: "business_confirmation_required", recipients: ["USR-2003"] },
    config: { dormancyDays: null, dormancyStatus: "business_confirmation_required", rejectionCodes: structuredClone(SOW_REJECTIONS) },
    pendingConfig: [],
    decisions: structuredClone(OPS_DECISIONS),
    audit: [],
  };
}
