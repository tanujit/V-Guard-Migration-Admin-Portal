/**
 * Client Demo service (Build Prompt 14A). Reads the ONE shared demo state — the module stores that
 * every screen already uses — and adds only what a demonstration needs:
 *  - metrics: counters over the shared stores, used to detect scenario steps;
 *  - the simulated scan pipeline, which chains the existing services (member eligibility, scan-point
 *    configuration, geo-fence, QR integrity, wallet ledger, scheme engine, scan records);
 *  - scenario snapshots, scenario reset and full demo reset (development data in this tab only).
 * Nothing here calls an external system or edits a balance directly.
 */
import { DEMO_SCENARIOS, type DemoMetric } from "@/config/demoScenarios";
import { IS_SIMULATION } from "@/config/environment";
import { accessStore } from "@/features/access/store";
import { approvalStore, demoNow } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { memberById, scanEligibility } from "@/features/members/engine";
import { masterStore } from "@/features/masters/store";
import { pointsState } from "@/features/masters/engine";
import { walletStore, ingestScanCredit } from "@/features/wallet/store";
import { schemeStore, ingestScanTransaction } from "@/features/schemes/store";
import { riskStore, geoFenceScan, scanQr } from "@/features/risk/store";
import { giftsStore } from "@/features/gifts/store";
import { commsStore } from "@/features/comms/store";
import { opsStore } from "@/features/ops/store";
import { analyticsStore, recordScan } from "@/features/analytics/store";
import { viewAsStore } from "@/features/platform/viewAsSession";
import { jobsStore } from "@/features/jobs/store";
import { SESSION_KEY, demoSessionStore, setSession, simClock } from "./session";

const PREFIX = "vg-rishta.";
const SNAPSHOT_KEY = "vg-rishta.demo-snapshot.v1";
const KEEP = new Set([SESSION_KEY, SNAPSHOT_KEY, "vg-rishta.mock-auth-user"]);

/* ======================= Metrics over the shared state ======================= */

export function metrics(): Record<DemoMetric, number> {
  const m = memberStore.get(), w = walletStore.get(), s = schemeStore.get(), r = riskStore.get(), g = giftsStore.get(), c = commsStore.get(), o = opsStore.get(), a = analyticsStore.get(), ap = approvalStore.get(), v = viewAsStore.get(), j = jobsStore.get();
  const n = <T>(xs: T[], f?: (x: T) => boolean) => (f ? xs.filter(f).length : xs.length);
  return {
    members: n(m.members), kycApproved: n(m.documents, (d) => d.status === "approved"), kycRejected: n(m.documents, (d) => d.status === "rejected"), memberEvents: n(m.events),
    restrictionsActive: n(m.restrictions, (x) => x.status !== "lifted"), restrictionsLifted: n(m.restrictions, (x) => x.status === "lifted"),
    scanCredits: n(w.ledger, (l) => l.type === "scan_credit"), scanRecords: n(a.scans), duplicateQr: n(r.duplicateQr), geoBlocked: n(r.geoFence, (x) => x.result !== "within" && x.override.status !== "approved"), scanRejected: n(a.scans, (x) => x.status === "failed"),
    schemes: n(s.schemes), schemesActive: n(s.schemes, (x) => x.status === "active"), schemeAccruals: n(s.accruals), settlements: n(s.settlements), settlementReleases: n(s.releases),
    requests: n(ap.requests), approved: n(ap.requests, (x) => x.status === "approved"), rejected: n(ap.requests, (x) => x.status === "rejected"), returned: n(ap.requests, (x) => x.status === "returned"), executed: n(ap.requests, (x) => x.execution.status === "executed"),
    adjustments: n(w.adjustments), reversals: n(w.reversals), transfers: n(w.transfers), redemptions: n(w.redemptions), payoutsSuccess: n(w.payouts, (p) => p.status === "success"), payoutsFailed: n(w.payouts, (p) => p.status === "failed"), redemptionReversals: n(w.ledger, (l) => l.type === "redemption_reversal"),
    giftItems: n(g.items), giftOrders: n(g.orders), giftDelivered: n(g.orders, (x) => x.status === "delivered"), vouchers: n(g.vouchers), insuranceBatches: n(g.batches),
    communications: n(c.communications), commEvents: n(c.events), queries: n(c.queries),
    riskEvents: n(r.events), riskCases: n(r.cases), riskCasesClosed: n(r.cases, (x) => /closed|cleared|resolved/.test(x.status)),
    opsRequests: n(o.requests), opsFailed: n(o.requests, (x) => x.status === "failed" || x.status === "timeout"), opsRetries: n(o.retries), incidents: n(o.incidents),
    viewAsSessions: n(v.sessions), viewAsRefused: n(v.attempts, (x) => x.result === "refused"), exports: n(a.exports),
    jobs: n(j.jobs), jobsConfirmed: n(j.jobs, (x) => x.status === "confirmed"), jobsRejected: n(j.jobs, (x) => x.status === "rejected"), jobTimeouts: n(j.submissions, (x) => x.result === "timeout"), jobRewardsSimulated: n(j.rewards, (x) => x.status === "simulated_credit"),
  };
}

/** Demo Centre dashboard figures, all read from the shared stores. */
export function demoOverview() {
  const mt = metrics();
  const ap = approvalStore.get();
  const PENDING = ["submitted", "pending_assignment", "pending_approval", "under_review", "resubmitted", "partially_approved", "escalated"];
  return {
    members: mt.members, transactions: walletStore.get().ledger.length + schemeStore.get().accruals.length, pendingApprovals: ap.requests.filter((r) => PENDING.includes(r.status)).length,
    openExceptions: opsStore.get().exceptions.filter((x) => x.status !== "resolved").length + riskStore.get().events.filter((e) => /new|open|queued/.test(String((e as { status?: string }).status))).length + walletStore.get().exceptions.filter((x) => (x as { status?: string }).status !== "resolved").length,
    integrationEvents: mt.opsRequests, completedWorkflows: mt.executed, users: accessStore.get().users.length,
  };
}

/** Seed inventory for the handover: counts per record type in the shared dataset. */
export function seedInventory() {
  const m = memberStore.get(), w = walletStore.get(), s = schemeStore.get(), g = giftsStore.get(), ms = masterStore.get();
  const byProg = (p: string) => m.members.filter((x) => x.programme === p).length;
  return [
    { area: "Members", count: m.members.length, detail: `EP ${byProg("EP")} · ST ${byProg("ST")} · CS ${byProg("CS")} · Retailer ${byProg("Retailer")} · DD ${byProg("DD")}; ${m.restrictions.filter((x) => x.status !== "lifted").length} active restrictions` },
    { area: "KYC documents", count: m.documents.length, detail: `${m.documents.filter((d) => d.status === "approved").length} approved · ${m.documents.filter((d) => d.status === "rejected").length} rejected · masked references only` },
    { area: "Products / SKUs", count: ms.skus.length, detail: `${ms.products.length} products · ${ms.scanPoints.length} scan-point configurations · ${ms.rules.length} scan rules` },
    { area: "Schemes", count: s.schemes.length, detail: [...new Set(s.schemes.map((x) => x.status))].map((st) => `${st} ${s.schemes.filter((x) => x.status === st).length}`).join(" · ") },
    { area: "Wallet ledger lines", count: w.ledger.length, detail: `${w.adjustments.length} adjustments · ${w.reversals.length} reversals · ${w.transfers.length} transfers · ${w.redemptions.length} redemptions` },
    { area: "Gifts", count: g.items.length, detail: `${g.orders.length} orders · ${g.vouchers.length} vouchers · ${g.cards.length} insurance cards` },
    { area: "Communications", count: commsStore.get().communications.length, detail: `${commsStore.get().events.length} notification events · ${commsStore.get().queries.length} helpdesk queries` },
    { area: "Fraud & risk", count: riskStore.get().events.length, detail: `${riskStore.get().cases.length} cases · ${riskStore.get().devices.length} devices` },
    { area: "Integration requests", count: opsStore.get().requests.length, detail: `${opsStore.get().incidents.length} incidents · ${opsStore.get().retries.length} retries` },
    { area: "Approval requests", count: approvalStore.get().requests.length, detail: `${approvalStore.get().workflows.length} workflows` },
    { area: "Users (personas)", count: accessStore.get().users.length, detail: `${accessStore.get().roles.length} roles` },
  ];
}

/* ======================= Simulated scan pipeline ======================= */

export interface ScanInput { memberId: string; skuId: string; type: "scan_in" | "scan_out"; qrRef: string; gps: "granted" | "denied"; distanceM: number | null }
export interface ScanStep { check: string; ok: boolean; detail: string }
export interface ScanResult { accepted: boolean; message: string; steps: ScanStep[]; scanId: string; points: number; ledgerRef: string | null }
let scanSeq = 0;
/**
 * One simulated scan from the member app, through the existing services in order. A rejection at any
 * step stops the scan with the member-facing message; nothing is credited for a rejected scan.
 */
export function simulateScan(i: ScanInput): ScanResult {
  const steps: ScanStep[] = [];
  const scanId = `SCN-SIM-${String(analyticsStore.get().scans.length + ++scanSeq).padStart(6, "0")}`;
  const done = (accepted: boolean, message: string, points = 0, ledgerRef: string | null = null): ScanResult => {
    const m = memberById(memberStore.get(), i.memberId);
    const sku = masterStore.get().skus.find((k) => k.id === i.skuId);
    const prod = sku ? masterStore.get().products.find((p) => p.id === sku.productId) : undefined;
    if (m) recordScan({ id: scanId, claimId: `CLM-SIM-${scanId.slice(-6)}`, qrMasked: `QR ••••${i.qrRef.slice(-4)}`, memberId: m.id, programme: m.programme, scannedBy: m.id, skuCode: sku?.code ?? "UNKNOWN", skuId: sku?.id ?? null, categoryId: prod?.categoryId ?? null, subCategoryId: prod?.subCategoryId ?? null, type: i.type, at: demoNow(), branchCode: m.branchCode, location: { lat: null, lng: null, label: "Simulated scan", source: "Client Demo" }, salesperson: m.sr, channel: "app", status: accepted ? "success" : "failed", failureReason: accepted ? null : message, points, ledgerRef, schemeRef: null, source: "Simulated scan service (Client Demo)" });
    return { accepted, message, steps, scanId, points, ledgerRef };
  };
  if (!IS_SIMULATION) return done(false, "Scan simulation is only available in the simulation environment");
  const m = memberById(memberStore.get(), i.memberId);
  if (!m) return done(false, "Member not found");
  const el = scanEligibility(memberStore.get(), m);
  steps.push({ check: "Member status and restrictions", ok: el.allowed, detail: el.reason });
  if (!el.allowed) return done(false, `Scan not allowed: ${el.reason}`);
  const sku = masterStore.get().skus.find((k) => k.id === i.skuId);
  const skuOk = !!sku && sku.status === "active";
  steps.push({ check: "Product lookup (mock eSeal)", ok: skuOk, detail: sku ? `${sku.code} · ${sku.status}` : "Not found" });
  if (!skuOk) return done(false, "Invalid product: this QR is not recognised");
  const cfg = masterStore.get().scanPoints.find((c) => c.skuId === sku!.id && pointsState(c) === "active");
  const ver = cfg?.versions.find((v) => v.status === "active");
  const applies = !!cfg && (!cfg.programmes.length || cfg.programmes.includes(m.programme)) && (!cfg.branchCodes.length || cfg.branchCodes.includes(m.branchCode));
  steps.push({ check: "Scan-point configuration (programme and branch applicability)", ok: applies, detail: cfg ? (applies ? `Active v${ver?.version} · Scan-In ${ver?.scanIn ?? "—"} · Scan-Out ${ver?.scanOut ?? "—"}` : `Not applicable to ${m.programme} / ${m.branchCode}`) : "No approved configuration for this SKU" });
  if (!applies) return done(false, "This product is not enabled for scanning in your programme or branch");
  const geo = geoFenceScan(m.id, { distanceM: i.distanceM, accuracyM: 10, gps: i.gps });
  steps.push({ check: "Geo-validation", ok: geo.allowed !== false, detail: geo.banner ?? geo.warnings[0] ?? "Within the registered location" });
  if (geo.allowed === false) return done(false, geo.banner ?? "Scan blocked by geo-validation");
  const qr = scanQr(i.qrRef, m.id);
  steps.push({ check: "QR integrity (duplicate check)", ok: !!qr.accepted, detail: qr.message ?? "" });
  if (!qr.accepted) return done(false, qr.message ?? "QR already scanned");
  // Scan-In credits only Scan-In points; Scan-Out only Scan-Out points. Never the other.
  const pts = i.type === "scan_out" ? ver?.scanOut ?? 0 : ver?.scanIn ?? 0;
  let ledgerRef: string | null = null;
  if (pts > 0) {
    const c = ingestScanCredit({ ref: scanId, memberId: m.id, skuCode: sku!.code, gross: pts });
    steps.push({ check: "Wallet ledger credit", ok: c.ok, detail: c.ok ? `${c.net} points posted${c.kitty ? ` · ${c.kitty} to TDS Kitty` : ""} (${c.id})` : c.errors.join("; ") });
    if (!c.ok) return done(false, c.errors[0]);
    ledgerRef = c.id ?? null;
  } else steps.push({ check: "Wallet ledger credit", ok: true, detail: `No ${i.type === "scan_out" ? "Scan-Out" : "Scan-In"} points configured: scan recorded without credit` });
  if (i.type === "scan_out") {
    const s = ingestScanTransaction({ id: scanId, memberId: m.id, skuId: sku!.id, date: demoNow().slice(0, 10) });
    steps.push({ check: "Scheme engine (active schemes)", ok: s.ok, detail: s.ok ? `${s.posted ?? 0} scheme accrual(s), ${s.points ?? 0} points` : s.errors.join("; ") });
  }
  return done(true, pts > 0 ? `Scan successful: ${pts} points` : "Scan successful", pts, ledgerRef);
}

/* ======================= Scenarios, snapshots and resets ======================= */

const store = () => (typeof window !== "undefined" ? window.sessionStorage : null);
function demoKeys(ss: Storage) {
  const out: string[] = [];
  for (let k = 0; k < ss.length; k++) {
    const key = ss.key(k);
    if (key && key.startsWith(PREFIX) && !KEEP.has(key)) out.push(key);
  }
  return out;
}
export function startScenario(id: string): { ok: boolean; message: string } {
  const sc = DEMO_SCENARIOS.find((x) => x.id === id);
  if (!sc) return { ok: false, message: "Scenario not found" };
  const ss = store();
  let snapshotOk = true;
  if (ss) {
    try {
      const snap: Record<string, string> = {};
      demoKeys(ss).forEach((k) => (snap[k] = ss.getItem(k)!));
      ss.setItem(SNAPSHOT_KEY, JSON.stringify({ scenarioId: id, at: simClock(), keys: snap }));
    } catch {
      snapshotOk = false;
    }
  }
  const st = demoSessionStore.get();
  setSession({ ...st, active: true, startedAt: st.startedAt ?? simClock(), scenarioId: id, scenarioStartedAt: simClock(), baseline: metrics(), manualDone: [], currentStep: 0, panelOpen: true, history: [...st.history.map((h) => (h.endedAt ? h : { ...h, endedAt: simClock() })), { scenarioId: id, startedAt: simClock(), endedAt: null, completed: 0, total: sc.steps.length, reset: false }] });
  return { ok: true, message: snapshotOk ? `${sc.name} started from the current demo state` : "Started; the browser had no room for a scenario snapshot, so use Full reset to repeat it" };
}
export function scenarioProgress() {
  const st = demoSessionStore.get();
  const sc = DEMO_SCENARIOS.find((x) => x.id === st.scenarioId);
  if (!sc || !st.baseline) return null;
  const now = metrics();
  const steps = sc.steps.map((s, i) => {
    const auto = s.detect ? now[s.detect] > (st.baseline![s.detect] ?? 0) : false;
    return { ...s, index: i, auto, done: auto || st.manualDone.includes(i) };
  });
  return { scenario: sc, steps, completed: steps.filter((x) => x.done).length };
}
export function clearScenario() {
  const st = demoSessionStore.get();
  const p = scenarioProgress();
  setSession({ ...st, scenarioId: null, baseline: null, manualDone: [], currentStep: 0, history: st.history.map((h, i) => (i === st.history.length - 1 && !h.endedAt ? { ...h, endedAt: simClock(), completed: p?.completed ?? 0 } : h)) });
}
export const hasSnapshot = () => {
  try {
    return !!store()?.getItem(SNAPSHOT_KEY);
  } catch {
    return false;
  }
};
/** Restores the shared demo state to the start of the loaded scenario. The page reloads afterwards. */
export function resetScenario(): { ok: boolean; message: string } {
  const ss = store();
  if (!ss) return { ok: false, message: "No browser storage" };
  const raw = ss.getItem(SNAPSHOT_KEY);
  if (!raw) return { ok: false, message: "No scenario snapshot: start a scenario first" };
  const snap = JSON.parse(raw) as { scenarioId: string; keys: Record<string, string> };
  demoKeys(ss).forEach((k) => ss.removeItem(k));
  Object.entries(snap.keys).forEach(([k, v]) => ss.setItem(k, v));
  const st = demoSessionStore.get();
  setSession({ ...st, manualDone: [], currentStep: 0, baseline: null, history: st.history.map((h, i) => (i === st.history.length - 1 ? { ...h, endedAt: simClock(), reset: true } : h)), scenarioId: snap.scenarioId });
  return { ok: true, message: "Scenario data restored" };
}
/** Removes every demo record key so each module reseeds; keys outside the demo prefix are untouched. */
export function fullReset(): { ok: boolean; removed: number } {
  const ss = store();
  if (!ss) return { ok: false, removed: 0 };
  const keys = demoKeys(ss);
  keys.forEach((k) => ss.removeItem(k));
  ss.removeItem(SNAPSHOT_KEY);
  const st = demoSessionStore.get();
  setSession({ ...st, scenarioId: null, baseline: null, manualDone: [], currentStep: 0, lastResetAt: simClock(), history: st.history.map((h) => (h.endedAt ? h : { ...h, endedAt: simClock(), reset: true })) });
  return { ok: true, removed: keys.length };
}
/** After a reset the module stores reseed on load; the baseline is recomputed after reload. */
export function rebaseline() {
  const st = demoSessionStore.get();
  if (st.scenarioId && !st.baseline) setSession({ ...st, baseline: metrics() });
}
