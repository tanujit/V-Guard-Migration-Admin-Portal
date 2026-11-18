import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BadgeIndianRupee, CheckCircle2, ClipboardCheck, FileText, Hourglass, Landmark, Lock, LockOpen, PiggyBank, ReceiptIndianRupee, Send, ShieldCheck, Users, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { RadioCards, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { GST_OVERRIDE_REASONS, GST_SCHEME_CLASS, PROGRAMMES, TDS_MODEL, fy, quarterOf } from "@/config/walletCatalogue";
import { displayVersion, schemeById, settlementPreview } from "@/features/schemes/engine";
import { memberById } from "@/features/members/engine";
import { balancesFrom, fyAssessment, gstGate, linesOf, panVerified, redeemableAfterReserve, reserveFor } from "@/features/wallet/engine";
import { initiateFyReconciliation, recordExport, submitGstOverride, submitReserve } from "@/features/wallet/store";
import type { GstOverrideRequest, RedemptionRequest } from "@/types/wallet";
import { Notice } from "@/pages/approvals/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { BcrTag, DecisionRef, FinKpiGrid, OpBadge, approvalLink, dt, inr, ledgerLink, memberLink, memberName, pts, redemptionLink, stateOf, useParam, useRun, useWalletView, userName, type WalletView } from "./shared";

/* ======================= Scheme settlement operations (SOW 5.2) ======================= */

export function SettlementOpsPage() {
  const v = useWalletView("scheme-settlement");
  const [tab, setTab] = useParam("tab", "queue");
  const reqOf = (id: string | null) => v.approvals.requests.find((r) => r.id === id);
  const stageOf = (id: string | null) => {
    const r = reqOf(id);
    if (!r) return "—";
    if (["pending_approval", "under_review", "escalated", "partially_approved"].includes(r.status)) return r.currentStage === 0 ? "Awaiting stage 1 (V-Guard)" : "Awaiting stage 2 (Finance)";
    return r.status.replace(/_/g, " ");
  };
  const unsettled = v.lines.filter((l) => l.bucket === "scheme_unsettled").reduce((n, l) => n + l.points, 0);
  const eligible = useMemo(() => {
    let n = 0;
    for (const sc of v.ss.schemes) {
      const cfg = displayVersion(sc).config;
      const best = Math.max(0, ...cfg.settlement.tranches.map((t) => {
        const p = settlementPreview(v.ss, sc, t.id, cfg.duration.start, cfg.duration.end < v.today ? cfg.duration.end : v.today, v.today);
        return p.checks.every((c) => c.ok) ? p.releasePoints : 0;
      }));
      n += best;
    }
    return n;
  }, [v.ss, v.today]);
  const sets = [...v.ss.settlements].reverse();
  const pending = sets.filter((s) => ["pending_approval", "partially_approved"].includes(s.status));
  const s1 = pending.filter((s) => (reqOf(s.approvalRequestId)?.currentStage ?? 0) === 0).length;
  const held = v.ss.releases.reduce((n, r) => n + r.heldPoints, 0);
  /** SOW 5.5 integration check: Retailer scheme points of members without a verified GSTIN must stay locked. */
  const gstCheck = (accrualIds: string[]) => {
    const accs = v.ss.accruals.filter((a) => accrualIds.includes(a.id) && a.programme === "Retailer");
    const gated = accs.filter((a) => {
      const g = gstGate(v.ws, v.ss, v.mem, a.memberId, v.today);
      const exc = ["du", "battery", "wssg"].includes(GST_SCHEME_CLASS[a.schemeId]?.cls ?? "");
      return g.status === "gated" && !exc;
    });
    return { members: new Set(gated.map((a) => a.memberId)).size, points: gated.reduce((n, a) => n + a.points - a.releasedPoints, 0) };
  };
  return (
    <>
      <SectionTitle title="Scheme settlement operations" description="Wallet / Finance view of the Phase 6 settlement. Requests are created and calculated by the Scheme Builder's settlement service; there is no second settlement engine. Two approval stages (WF-015) are required before any release" actions={v.canOn("scheme-settlement", "create") && <Link to="/schemes/settlement" className="btn btn--primary btn--sm">Initiate settlement (Scheme Builder)</Link>} />
      <FinKpiGrid
        items={[
          { id: "u", label: "Total unsettled scheme points", value: unsettled, desc: "Scheme bucket across all members", accent: "scheme", icon: Hourglass, onSelect: () => setTab("queue") },
          { id: "e", label: "Eligible for settlement", value: eligible, desc: "Release the Phase 6 settlement preview allows today (best tranche per scheme, all checks passing)", accent: "lead", icon: Landmark, onSelect: () => setTab("review") },
          { id: "p", label: "Pending settlement requests", value: pending.length, desc: "Awaiting approval", accent: "pending", icon: ClipboardCheck, onSelect: () => setTab("queue") },
          { id: "s1", label: "Awaiting stage 1", value: s1, desc: "V-Guard programme approval", accent: "pending", icon: Hourglass, onSelect: () => setTab("queue") },
          { id: "s2", label: "Awaiting stage 2", value: pending.length - s1, desc: "Finance approval", accent: "pending", icon: Hourglass, onSelect: () => setTab("queue") },
          { id: "ok", label: "Successfully settled", value: sets.filter((s) => s.status === "executed").length, desc: "Released to Available", accent: "available", icon: CheckCircle2, onSelect: () => setTab("history") },
          { id: "f", label: "Settlement failed", value: sets.filter((s) => s.status === "execution_failed").length, desc: "Refused or failed at execution", accent: "failed", icon: XCircle, onSelect: () => setTab("queue") },
          { id: "h", label: "Held points remaining", value: held, desc: "Held share recorded on releases", accent: "scheme", icon: Lock, onSelect: () => setTab("history") },
        ]}
      />
      <Tabs label="Settlement sections" value={tab} onChange={setTab} tabs={[{ id: "queue", label: "Settlement queue", count: sets.length }, { id: "review", label: "Settlement review" }, { id: "history", label: "Settlement history", count: v.ss.releases.length }]} />
      {tab === "queue" && (
        <Panel title="Settlement queue">
          <DataTable
            rows={sets}
            rowKey={(s) => s.id}
            caption="Settlement queue"
            exportName={v.can("scheme-settlement:export") ? "settlement-queue" : undefined}
            columns={[
              { key: "id", header: "Settlement reference", value: (s) => s.id, render: (s) => <span className="mono small">{s.id}</span> },
              { key: "scheme", header: "Scheme", value: (s) => s.schemeId, render: (s) => <Link to={`/schemes/scheme/${s.schemeId}`} className="mono small">{s.schemeId}</Link> },
              { key: "name", header: "Scheme name", value: (s) => displayVersion(schemeById(v.ss, s.schemeId)!).config.basic.name },
              { key: "ver", header: "Version", value: (s) => s.schemeVersion, align: "right" },
              { key: "prog", header: "Programme", value: (s) => displayVersion(schemeById(v.ss, s.schemeId)!).config.basic.programmes.join(", ") },
              { key: "range", header: "Earned date range", value: (s) => `${s.earnedFrom} – ${s.earnedTo}` },
              { key: "uns", header: "Unsettled", value: (s) => s.unsettledPoints, align: "right" },
              { key: "rel", header: "Eligible release", value: (s) => s.releasePoints, align: "right" },
              { key: "held", header: "Held", value: (s) => s.heldPoints, align: "right" },
              { key: "pct", header: "Release %", value: (s) => s.releasePct, render: (s) => `${s.releasePct}% (configured)`, align: "right" },
              { key: "status", header: "Settlement status", value: (s) => s.status, render: (s) => <StatusBadge tone={s.status === "executed" ? "positive" : s.status === "execution_failed" ? "negative" : "warning"}>{s.status.replace(/_/g, " ")}</StatusBadge> },
              { key: "apr", header: "Approval", value: (s) => stageOf(s.approvalRequestId), render: (s) => <span className="small">{approvalLink(s.approvalRequestId)} {stageOf(s.approvalRequestId)}</span> },
            ]}
          />
        </Panel>
      )}
      {tab === "review" && (
        <Panel title="Settlement review" subtitle="Checks recorded by the Phase 6 settlement service, plus wallet-side integration checks">
          {sets.map((s) => {
            const g = gstCheck(s.accrualIds);
            const members = new Set(v.ss.accruals.filter((a) => s.accrualIds.includes(a.id)).map((a) => a.memberId)).size;
            const rel = v.ss.releases.find((r) => r.requestId === s.id);
            const posted = v.lines.filter((l) => l.settlementRef === s.id && l.bucket === "available").reduce((n, l) => n + l.points, 0);
            return (
              <details key={s.id} className="review-card">
                <summary><span className="mono">{s.id}</span> · {displayVersion(schemeById(v.ss, s.schemeId)!).config.basic.name} · {s.trancheLabel} · {s.status.replace(/_/g, " ")}</summary>
                <ul className="check-list small">
                  {s.checks.map((c) => <li key={c.label} className={c.ok ? "pos" : "neg"}>{c.ok ? "✓" : "✗"} {c.label}: {c.detail}</li>)}
                  <li>Affected members: {members} · Unsettled {pts(s.unsettledPoints)} · Release {pts(s.releasePoints)} · Held {pts(s.heldPoints)}</li>
                  <li className={g.points ? "warn-text" : "pos"}>{g.points ? `⚠ GST gate: ${pts(g.points)} points belong to ${g.members} Retailer(s) without a verified GSTIN. SOW 5.5 keeps these locked and not settled; raise a financial exception if this release includes them` : "✓ GST gate: no locked Retailer scheme points in this request"}</li>
                  {rel && <li className={posted === rel.releasedPoints ? "pos" : "warn-text"}>{posted === rel.releasedPoints ? "✓" : "⚠"} Ledger reconciliation: release {pts(rel.releasedPoints)} · settlement lines {pts(posted)} {posted !== rel.releasedPoints && "(later releases on the same accruals are reported cumulatively)"}</li>}
                </ul>
              </details>
            );
          })}
        </Panel>
      )}
      {tab === "history" && (
        <Panel title="Settlement history" subtitle="Distinct Settlement Release ledger entries with scheme reference, earned range, settlement date, approvers and approval reference">
          <DataTable
            rows={[...v.ss.releases].reverse()}
            rowKey={(r) => r.id}
            caption="Settlement releases"
            columns={[
              { key: "id", header: "Release", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
              { key: "req", header: "Settlement", value: (r) => r.requestId },
              { key: "scheme", header: "Scheme / version", value: (r) => `${r.schemeId} v${r.schemeVersion}` },
              { key: "range", header: "Earned range", value: (r) => `${r.earnedFrom} – ${r.earnedTo}` },
              { key: "at", header: "Settlement date", value: (r) => r.settledAt, render: (r) => <span className="num small">{dt(r.settledAt)}</span> },
              { key: "rel", header: "Released", value: (r) => r.releasedPoints, align: "right" },
              { key: "held", header: "Held", value: (r) => r.heldPoints, align: "right" },
              { key: "by", header: "Approvers", value: (r) => r.approvers.map((u) => userName(v.acc, u)).join(", ") },
              { key: "apr", header: "Approval reference", value: (r) => r.approvalRef, render: (r) => approvalLink(r.approvalRef) },
              { key: "ledger", header: "Ledger reference", value: (r) => r.ledgerRef, render: (r) => <span className="mono small">{r.ledgerRef}</span> },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

/* ======================= TDS management (SOW 5.4) ======================= */

export function TdsPage() {
  const v = useWalletView("tds");
  const [tab, setTab] = useParam("tab", "dashboard");
  const [fyF, setFy] = useState("all");
  const [prog, setProg] = useState("all");
  const [state, setState] = useState("all");
  const { result, run } = useRun();
  const memberOk = (id: string) => {
    const m = memberById(v.mem, id);
    return !!m && v.inScope(id) && (prog === "all" || m.programme === prog) && (state === "all" || stateOf(m.branchCode) === state);
  };
  const lines = v.lines.filter((l) => memberOk(l.memberId) && (fyF === "all" || fy(l.at) === fyF));
  const kittyDed = lines.filter((l) => l.type === "tds_kitty_deduction").reduce((n, l) => n + l.points, 0);
  const kittyBal = lines.filter((l) => l.bucket === "tds_kitty").reduce((n, l) => n + l.points, 0);
  const paid = lines.filter((l) => l.bucket === "tds_paid").reduce((n, l) => n + l.points, 0);
  const refunds = lines.filter((l) => l.type === "tds_kitty_refund" && l.bucket === "available").reduce((n, l) => n + l.points, 0);
  const reds = v.ws.redemptions.filter((r) => memberOk(r.memberId) && TDS_MODEL[r.programme].model === "on_redemption" && (fyF === "all" || fy(r.createdAt) === fyF));
  const redTds = reds.filter((r) => r.tds.status === "recorded").reduce((n, r) => n + (r.tds.amountInr ?? 0), 0);
  const fyRecs = v.ws.tdsFy.filter((r) => memberOk(r.memberId));
  const epMembers = v.mem.members.filter((m) => m.programme === "EP" && memberOk(m.id) && v.ws.wallets.some((w) => w.memberId === m.id && w.status === "active"));
  const closedFys = ["FY 2025-26"];
  return (
    <>
      <SectionTitle title="TDS management" description="Two independent models: EP/IMP at scan into the TDS Kitty; Retailer, ST and CS at redemption. DD is not established. TDS Kitty is never combined with TDS paid" />
      <PolicyMessages result={result} />
      <div className="filters-bar">
        <SelectField label="Financial year" value={fyF} onChange={setFy} options={[{ value: "all", label: "All" }, { value: "FY 2025-26", label: "FY 2025-26" }, { value: "FY 2026-27", label: "FY 2026-27" }]} />
        <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
        <SelectField label="State" value={state} onChange={setState} options={[{ value: "all", label: "All" }, ...Array.from(new Set(v.mem.members.map((m) => stateOf(m.branchCode)))).map((s) => ({ value: s, label: s }))]} />
      </div>
      <Tabs label="TDS sections" value={tab} onChange={setTab} tabs={[{ id: "dashboard", label: "Dashboard" }, { id: "kitty", label: "EP/IMP TDS Kitty" }, { id: "fy", label: "FY reconciliation" }, { id: "redemption", label: "Redemption TDS" }, { id: "reserve", label: "Retailer reserve" }, { id: "reports", label: "TDS reports" }]} />
      {tab === "dashboard" && (
        <>
          <FinKpiGrid
            items={[
              { id: "ded", label: "TDS deducted · Kitty (points)", value: kittyDed, desc: "EP/IMP scan-time provisional TDS (10% PAN / 20% no PAN)", accent: "kitty", icon: ReceiptIndianRupee, onSelect: () => setTab("kitty") },
              { id: "kitty", label: "Total EP/IMP TDS Kitty", value: kittyBal, desc: "Held, not redeemable, not paid", accent: "kitty", icon: PiggyBank, onSelect: () => setTab("kitty") },
              { id: "paid", label: "Total TDS paid", value: paid, desc: "Kitty moved to TDS Paid after an above-threshold FY outcome. None until OP-TDS1 is confirmed", accent: "paid", icon: Landmark, onSelect: () => setTab("fy") },
              { id: "ref", label: "TDS refunds / credits", value: refunds, desc: "Kitty credited back to wallets at FY end (≤ ₹20,000)", accent: "available", icon: CheckCircle2, onSelect: () => setTab("fy") },
              { id: "pfy", label: "Pending FY reconciliation", value: fyRecs.filter((r) => ["pending_approval", "approved", "business_confirmation_required"].includes(r.status)).length + epMembers.filter((m) => closedFys.some((f) => !fyRecs.some((r) => r.memberId === m.id && r.fy === f) && fyAssessment(v.ws, v.ss, v.mem, m.id, f).kittyPoints > 0)).length, desc: "Not initiated, awaiting approval, or blocked pending confirmation", accent: "pending", icon: Hourglass, onSelect: () => setTab("fy") },
              { id: "cfy", label: "Completed FY reconciliation", value: fyRecs.filter((r) => r.status === "completed").length, desc: "Refund executed", accent: "available", icon: CheckCircle2, onSelect: () => setTab("fy") },
              { id: "red", label: "Retailer / ST / CS TDS on redemption", value: redTds, format: "inr", desc: "Recorded on legacy redemption records. New calculation blocked (OP-TDS1)", accent: "kitty", icon: BadgeIndianRupee, onSelect: () => setTab("redemption") },
              { id: "exc", label: "Pending TDS exceptions", value: fyRecs.filter((r) => r.status === "business_confirmation_required").length + reds.filter((r) => r.tds.status === "bcr").length, desc: "Business confirmation required (FY above threshold, redemption slab)", accent: "failed", icon: AlertTriangle, onSelect: () => setTab("fy") },
              { id: "q", label: "Quarterly reporting status", value: 0, desc: "No statement generated: source values must come from the authoritative tax records", accent: "neutral", icon: FileText, onSelect: () => setTab("reports"), reference: "Layout ready · not filed" },
              { id: "26q", label: "26Q reporting status", value: 0, desc: "Report layout and extraction prepared; not statutory-ready without finance validation", accent: "neutral", icon: FileText, onSelect: () => setTab("reports"), reference: "Layout ready · not filed" },
            ]}
            cols={5}
          />
          <Panel title="Programme TDS matrix" subtitle="SOW 5.4">
            <table className="table table--compact">
              <thead><tr><th>Programme</th><th>TDS treatment</th><th>Detail</th></tr></thead>
              <tbody>{PROGRAMMES.map((p) => <tr key={p}><th scope="row">{p}</th><td>{TDS_MODEL[p].model === "not_configured" ? <BcrTag /> : TDS_MODEL[p].label}</td><td className="small">{TDS_MODEL[p].detail}</td></tr>)}</tbody>
            </table>
          </Panel>
        </>
      )}
      {tab === "kitty" && (
        <Panel title="EP/IMP TDS Kitty" subtitle="Member-level view. Calculation is the TDS adapter's (mock); the portal does not post TDS">
          <DataTable
            rows={epMembers.map((m) => {
              const ml = linesOf(lines, m.id);
              const b = balancesFrom(ml);
              const rec = fyRecs.filter((r) => r.memberId === m.id).pop();
              return { m, earned: ml.filter((l) => l.type === "scan_credit" || l.type === "base_credit").reduce((n, l) => n + (l.gross ?? l.points), 0), ded: b.tdsDeductedPoints, kitty: b.tdsKitty, pan: panVerified(v.mem, m.id), rec, last: ml.filter((l) => l.bucket === "tds_kitty").pop()?.at ?? null };
            })}
            rowKey={(r) => r.m.id}
            caption="TDS Kitty by member"
            exportName={v.can("tds:export") ? "tds-kitty" : undefined}
            columns={[
              { key: "id", header: "Member ID", value: (r) => r.m.id, render: (r) => memberLink(r.m.id) },
              { key: "name", header: "Member name", value: (r) => r.m.name },
              { key: "fy", header: "Financial year", value: () => (fyF === "all" ? "All" : fyF) },
              { key: "earned", header: "Points earned (gross)", value: (r) => r.earned, align: "right" },
              { key: "pan", header: "PAN status", value: (r) => (r.pan ? "Verified" : "Not verified") },
              { key: "rate", header: "Provisional rate", value: (r) => (r.pan ? v.ws.config.ep.panRatePct : v.ws.config.ep.noPanRatePct), render: (r) => `${r.pan ? v.ws.config.ep.panRatePct : v.ws.config.ep.noPanRatePct}%`, align: "right" },
              { key: "ded", header: "TDS deducted at scan", value: (r) => r.ded, align: "right" },
              { key: "kitty", header: "Current TDS Kitty", value: (r) => r.kitty, align: "right" },
              { key: "rec", header: "Reconciliation status", value: (r) => r.rec?.status ?? "not_initiated", render: (r) => (r.rec ? <OpBadge status={r.rec.status} /> : <span className="small muted">Not initiated</span>) },
              { key: "last", header: "Last update", value: (r) => r.last ?? "", render: (r) => <span className="num small">{dt(r.last)}</span> },
            ]}
          />
        </Panel>
      )}
      {tab === "fy" && (
        <Panel title="TDS Kitty reconciliation queue" subtitle="FY-end per member: ≤ ₹20,000 → Kitty credited back; above → TDS at the applicable slab, moved to TDS Paid. The slab is not confirmed (OP-TDS1), so above-threshold outcomes stay blocked">
          <Notice tone="warn">Above-threshold computation is not invented. Records show <strong>TDS calculation — Business Confirmation Required</strong> until the slab is configured. <DecisionRef id="FD-01" label="OP-TDS1" /> · compared quantity <DecisionRef id="FD-09" /></Notice>
          <DataTable
            rows={epMembers.flatMap((m) => closedFys.map((f) => ({ m, f, a: fyAssessment(v.ws, v.ss, v.mem, m.id, f), rec: fyRecs.find((r) => r.memberId === m.id && r.fy === f) }))).filter((r) => r.a.kittyPoints > 0 || r.rec)}
            rowKey={(r) => `${r.m.id}-${r.f}`}
            caption="FY reconciliation queue"
            columns={[
              { key: "m", header: "Member", value: (r) => r.m.id, render: (r) => memberLink(r.m.id) },
              { key: "fy", header: "Financial year", value: (r) => r.f },
              { key: "kitty", header: "TDS Kitty balance", value: (r) => r.rec?.kittyPoints ?? r.a.kittyPoints, align: "right" },
              { key: "tds", header: "Total TDS for FY (₹)", value: (r) => r.a.deductedInr, render: (r) => inr(r.a.deductedInr), align: "right" },
              { key: "cmp", header: "Threshold comparison", value: (r) => r.a.outcome, render: (r) => (r.a.outcome === "refund_kitty" ? <span className="pos small">≤ {inr(r.a.thresholdInr)}</span> : <span className="neg small">&gt; {inr(r.a.thresholdInr)}</span>) },
              { key: "out", header: "Proposed outcome", value: (r) => r.a.outcome, render: (r) => (r.a.outcome === "refund_kitty" ? "Credit Kitty back" : "TDS Paid at slab") },
              { key: "calc", header: "Calculation status", value: (r) => r.a.calculation, render: (r) => (r.a.calculation === "ready" ? <span className="small pos">Ready</span> : <BcrTag>TDS calculation · BCR</BcrTag>) },
              { key: "slab", header: "Slab reference", value: (r) => r.rec?.slabRef ?? "", render: (r) => r.rec?.slabRef ?? <span className="muted small">Not configured</span> },
              { key: "apr", header: "Approval", value: (r) => r.rec?.approvalRequestId ?? "", render: (r) => approvalLink(r.rec?.approvalRequestId) },
              { key: "exec", header: "Execution", value: (r) => r.rec?.status ?? "not_initiated", render: (r) => (r.rec ? <>{<OpBadge status={r.rec.status} />} {r.rec.ledgerIds[0] && ledgerLink(r.rec.ledgerIds[0])}</> : v.canOn("tds", "submit", r.m.id) ? <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(initiateFyReconciliation(v.uid, r.m.id, r.f), "FY reconciliation initiated")}>Initiate</button> : <span className="small muted">Not initiated</span>) },
            ]}
          />
        </Panel>
      )}
      {tab === "redemption" && <RedemptionTds v={v} reds={reds} />}
      {tab === "reserve" && <ReservePanel v={v} />}
      {tab === "reports" && <TdsReports v={v} lines={lines} reds={reds} />}
    </>
  );
}

function RedemptionTds({ v, reds }: { v: WalletView; reds: RedemptionRequest[] }) {
  return (
    <Panel title="Redemption TDS summary · Retailer / ST / CS" subtitle="No scan-time TDS and no Kitty for these programmes. Rates are not inferred from the EP/IMP model">
      <Notice tone="info">Values come only from recorded tax results. Legacy records carry the amount recorded by the source system; new redemptions show Business confirmation required until the redemption slab and PAN treatment are confirmed (<DecisionRef id="FD-01" label="OP-TDS1" />).</Notice>
      <DataTable
        rows={reds}
        rowKey={(r) => r.id}
        caption="Redemption TDS"
        exportName={v.can("tds:export") ? "redemption-tds" : undefined}
        columns={[
          { key: "m", header: "Member", value: (r) => r.memberId, render: (r) => memberLink(r.memberId) },
          { key: "p", header: "Programme", value: (r) => r.programme },
          { key: "pan", header: "PAN status", value: (r) => r.tds.panStatus },
          { key: "src", header: "PAN verification source", value: (r) => r.tds.panSource },
          { key: "ref", header: "Redemption reference", value: (r) => r.id, render: (r) => redemptionLink(r.id) },
          { key: "gross", header: "Gross redemption", value: (r) => r.grossInr, render: (r) => inr(r.grossInr), align: "right" },
          { key: "rate", header: "TDS rate", value: (r) => r.tds.ratePct ?? "", render: (r) => (r.tds.ratePct != null ? `${r.tds.ratePct}%` : r.tds.status === "recorded" ? <span className="small muted">Held by source system</span> : "—") },
          { key: "tds", header: "TDS amount", value: (r) => r.tds.amountInr ?? "", render: (r) => (r.tds.status === "recorded" ? inr(r.tds.amountInr) : <BcrTag>BCR</BcrTag>), align: "right" },
          { key: "net", header: "Net payout", value: (r) => r.netInr ?? "", render: (r) => inr(r.netInr), align: "right" },
          { key: "date", header: "Date", value: (r) => r.createdAt, render: (r) => <span className="num small">{dt(r.createdAt)}</span> },
          { key: "fy", header: "Financial year", value: (r) => fy(r.createdAt) },
        ]}
      />
    </Panel>
  );
}

function ReservePanel({ v }: { v: WalletView }) {
  const { result, run } = useRun();
  const [f, setF] = useState({ memberId: "", reserveInr: "", reason: "", effectiveFrom: v.today });
  const retailers = v.mem.members.filter((m) => m.programme === "Retailer" && v.inScope(m.id) && v.ws.wallets.some((w) => w.memberId === m.id && w.status === "active"));
  return (
    <>
      <Panel title="Retailer minimum TDS reserve" subtitle={`SOW 5.4.2: default ${inr(v.ws.config.retailerReserveDefaultInr)} non-redeemable reserve covering TDS on gifts up to ₹20,000. Not applied to EP, ST or CS`}>
        <p className="small muted">SOW example only: reserve ₹2,000 and balance ₹2,900 leave ₹900 redeemable. ₹ equivalents use the mock conversion (<DecisionRef id="FD-07" />).</p>
        <DataTable
          rows={retailers.map((m) => {
            const r = reserveFor(v.ws, m.id, m.programme);
            const own = v.ws.reserves.filter((x) => x.memberId === m.id);
            const avail = balancesFrom(linesOf(v.lines, m.id)).available * v.ws.config.pointValueInr;
            return { m, r, own, avail };
          })}
          rowKey={(x) => x.m.id}
          caption="Retailer reserves"
          columns={[
            { key: "m", header: "Retailer", value: (x) => x.m.id, render: (x) => memberLink(x.m.id) },
            { key: "name", header: "Name", value: (x) => x.m.name },
            { key: "res", header: "Reserve", value: (x) => x.r.reserveInr, render: (x) => inr(x.r.reserveInr), align: "right" },
            { key: "src", header: "Source", value: (x) => x.r.source },
            { key: "avail", header: "Available (₹)", value: (x) => x.avail, render: (x) => inr(x.avail), align: "right" },
            { key: "red", header: "Redeemable after reserve", value: (x) => redeemableAfterReserve(x.avail, x.r.reserveInr), render: (x) => inr(redeemableAfterReserve(x.avail, x.r.reserveInr)), align: "right" },
            { key: "pending", header: "Change", value: (x) => x.own.map((o) => o.status).join(", "), render: (x) => x.own.length ? x.own.map((o) => <span key={o.id} className="small">{o.id} ₹{o.reserveInr.toLocaleString("en-IN")} · {o.status.replace("_", " ")} {approvalLink(o.approvalRequestId)} · eff. {o.effectiveFrom} · by {userName(v.acc, o.updatedBy)}<br /></span>) : <span className="small muted">Default</span> },
          ]}
        />
      </Panel>
      {v.can("redemption-limits:edit") && (
        <Panel title="Request a Retailer-specific reserve" subtitle="For Retailers eligible for higher gifts. Approved through WF-023">
          <PolicyMessages result={result} />
          <div className="form-grid form-grid--4">
            <SelectInput label="Retailer" value={f.memberId} onChange={(x) => setF({ ...f, memberId: x })} options={[{ value: "", label: "Choose" }, ...retailers.map((m) => ({ value: m.id, label: `${m.id} · ${m.name}` }))]} />
            <TextField label="Reserve (₹)" value={f.reserveInr} onChange={(x) => setF({ ...f, reserveInr: x })} inputMode="numeric" />
            <TextField label="Effective from" type="date" value={f.effectiveFrom} onChange={(x) => setF({ ...f, effectiveFrom: x })} />
            <TextField label="Reason" value={f.reason} onChange={(x) => setF({ ...f, reason: x })} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitReserve(v.uid, { ...f, reserveInr: Number(f.reserveInr) }), "Reserve change submitted for approval")}><Send size={14} aria-hidden="true" />Submit for approval</button>
        </Panel>
      )}
    </>
  );
}

function TdsReports({ v, lines, reds }: { v: WalletView; lines: WalletView["lines"]; reds: RedemptionRequest[] }) {
  const [rep, setRep] = useState("member");
  const { result, run } = useRun();
  const canExport = v.can("tds:export");
  const members = Array.from(new Set(lines.filter((l) => l.bucket === "tds_kitty").map((l) => l.memberId).concat(reds.map((r) => r.memberId))));
  const memberRows = members.map((id) => {
    const ml = linesOf(lines, id);
    const b = balancesFrom(ml, reds.filter((r) => r.memberId === id));
    const m = memberById(v.mem, id)!;
    return { id, name: m.name, programme: m.programme, model: TDS_MODEL[m.programme].label, pan: panVerified(v.mem, id) ? "Verified" : "Not verified", kittyDed: b.tdsDeductedPoints, kitty: b.tdsKitty, paid: b.tdsPaid, redTds: b.tdsDeductedInr };
  });
  const quarterRows = ["FY 2025-26", "FY 2026-27"].flatMap((f) => ["Q1", "Q2", "Q3", "Q4"].map((q) => ({ fy: f, q, kitty: lines.filter((l) => l.type === "tds_kitty_deduction" && fy(l.at) === f && quarterOf(l.at) === q).reduce((n, l) => n + l.points, 0), redTds: reds.filter((r) => r.tds.status === "recorded" && fy(r.createdAt) === f && quarterOf(r.createdAt) === q).reduce((n, r) => n + (r.tds.amountInr ?? 0), 0), records: reds.filter((r) => fy(r.createdAt) === f && quarterOf(r.createdAt) === q).length })));
  const q26 = reds.filter((r) => r.tds.status === "recorded").map((r) => ({ ref: r.id, deductee: r.memberId, name: memberName(v.mem, r.memberId), pan: r.tds.panStatus === "verified" ? "PAN on file (masked)" : "PAN not available", paid: r.grossInr, date: r.createdAt.slice(0, 10), tds: r.tds.amountInr ?? 0, section: "Not confirmed" }));
  const schemeRows = Array.from(new Set(lines.filter((l) => l.type === "tds_kitty_deduction" && l.schemeId).map((l) => l.schemeId!))).map((sid) => ({ sid, kitty: lines.filter((l) => l.type === "tds_kitty_deduction" && l.schemeId === sid).reduce((n, l) => n + l.points, 0), refs: lines.filter((l) => l.type === "tds_kitty_deduction" && l.schemeId === sid).length }));
  const exp = <T,>(name: string, cols: { header: string; value: (r: T) => string | number | null }[], rows: T[]) => {
    if (!run(recordExport(v.uid, "tds", name, rows.length), "Export recorded").ok) return;
    downloadCsv(`${name}.csv`, cols, rows, "Development data. Not a statutory filing");
  };
  return (
    <Panel title="TDS reports" subtitle="Built only from recorded tax values. Not statutory filing output" actions={<SelectField label="Report" value={rep} onChange={setRep} options={[{ value: "member", label: "Member-wise TDS" }, { value: "quarter", label: "Quarterly statement" }, { value: "26q", label: "26Q back-office report" }, { value: "scheme", label: "Scheme-wise TDS" }, { value: "fy", label: "FY summary" }]} />}>
      <PolicyMessages result={result} />
      {!canExport && <p className="small muted">Exports need TDS management: Export.</p>}
      {rep === "member" && (
        <>
          {canExport && <button type="button" className="btn btn--secondary btn--sm" onClick={() => exp("tds-member-wise", Object.keys(memberRows[0] ?? {}).map((k) => ({ header: k, value: (r: (typeof memberRows)[number]) => r[k as keyof typeof r] as string | number })), memberRows)}>Export CSV</button>}
          <DataTable rows={memberRows} rowKey={(r) => r.id} caption="Member-wise TDS" columns={[{ key: "id", header: "Member", value: (r) => r.id, render: (r) => memberLink(r.id) }, { key: "p", header: "Programme", value: (r) => r.programme }, { key: "model", header: "TDS model", value: (r) => r.model }, { key: "pan", header: "PAN", value: (r) => r.pan }, { key: "kd", header: "Scan-time Kitty TDS (pts)", value: (r) => r.kittyDed, align: "right" }, { key: "k", header: "Kitty", value: (r) => r.kitty, align: "right" }, { key: "paid", header: "TDS paid", value: (r) => r.paid, align: "right" }, { key: "rt", header: "Redemption-time TDS (₹)", value: (r) => r.redTds, render: (r) => inr(r.redTds), align: "right" }]} />
        </>
      )}
      {rep === "quarter" && (
        <table className="table table--compact">
          <thead><tr><th>FY</th><th>Quarter</th><th className="num">Scan-time Kitty TDS (pts)</th><th className="num">Redemption-time TDS recorded (₹)</th><th className="num">Redemption records</th><th>Status</th></tr></thead>
          <tbody>{quarterRows.map((r) => <tr key={r.fy + r.q}><td>{r.fy}</td><td>{r.q}</td><td className="num">{pts(r.kitty)}</td><td className="num">{inr(r.redTds)}</td><td className="num">{r.records}</td><td className="small muted">Not filed · needs finance validation</td></tr>)}</tbody>
        </table>
      )}
      {rep === "26q" && (
        <>
          <Notice tone="warn">Layout and extraction only. Section codes, challan details and deductee PAN are not populated with invented values; this is not statutory-ready.</Notice>
          {canExport && <button type="button" className="btn btn--secondary btn--sm" onClick={() => exp("26q-back-office", [{ header: "Reference", value: (r: (typeof q26)[number]) => r.ref }, { header: "Deductee", value: (r) => r.deductee }, { header: "Name", value: (r) => r.name }, { header: "PAN", value: (r) => r.pan }, { header: "Amount paid / credited (₹)", value: (r) => r.paid }, { header: "Date", value: (r) => r.date }, { header: "TDS (₹)", value: (r) => r.tds }, { header: "Section", value: (r) => r.section }, { header: "Challan", value: () => "Not available" }], q26)}>Export 26Q extract</button>}
          <DataTable rows={q26} rowKey={(r) => r.ref} caption="26Q extract" columns={[{ key: "ref", header: "Reference", value: (r) => r.ref }, { key: "d", header: "Deductee", value: (r) => r.deductee }, { key: "pan", header: "PAN", value: (r) => r.pan }, { key: "paid", header: "Amount paid (₹)", value: (r) => r.paid, align: "right" }, { key: "date", header: "Date", value: (r) => r.date }, { key: "tds", header: "TDS (₹)", value: (r) => r.tds, align: "right" }, { key: "sec", header: "Section", value: (r) => r.section }]} />
        </>
      )}
      {rep === "scheme" && (
        <>
          <p className="small muted">Scan-time TDS (EP/IMP Kitty) on scheme Base Points, by scheme. Redemption-time TDS is not linked to schemes and is reported separately.</p>
          <table className="table table--compact"><thead><tr><th>Scheme</th><th className="num">Scan-time Kitty TDS (pts)</th><th className="num">Transactions</th></tr></thead><tbody>{schemeRows.map((r) => <tr key={r.sid}><td><Link to={`/schemes/scheme/${r.sid}`} className="mono">{r.sid}</Link></td><td className="num">{pts(r.kitty)}</td><td className="num">{r.refs}</td></tr>)}</tbody></table>
        </>
      )}
      {rep === "fy" && (
        <table className="table table--compact">
          <thead><tr><th>FY</th><th className="num">Kitty deducted</th><th className="num">Kitty refunded</th><th className="num">TDS paid</th><th className="num">Redemption TDS (₹)</th></tr></thead>
          <tbody>{["FY 2025-26", "FY 2026-27"].map((f) => <tr key={f}><td>{f}</td><td className="num">{pts(lines.filter((l) => l.type === "tds_kitty_deduction" && fy(l.at) === f).reduce((n, l) => n + l.points, 0))}</td><td className="num">{pts(lines.filter((l) => l.type === "tds_kitty_refund" && l.bucket === "available" && fy(l.at) === f).reduce((n, l) => n + l.points, 0))}</td><td className="num">{pts(lines.filter((l) => l.bucket === "tds_paid" && fy(l.at) === f).reduce((n, l) => n + l.points, 0))}</td><td className="num">{inr(reds.filter((r) => r.tds.status === "recorded" && fy(r.createdAt) === f).reduce((n, r) => n + (r.tds.amountInr ?? 0), 0))}</td></tr>)}</tbody>
        </table>
      )}
    </Panel>
  );
}

/* ======================= Retailer GST gate (SOW 5.5) ======================= */

export function GstPage() {
  const v = useWalletView("gst-gate");
  const [member, setMember] = useParam("member", "");
  const [tab, setTab] = useParam("tab", "retailers");
  const rows = v.ws.gst.filter((g) => v.inScope(g.memberId) || v.canOn("gst-gate", "view", g.memberId)).map((g) => ({ g, m: memberById(v.mem, g.memberId)!, gate: gstGate(v.ws, v.ss, v.mem, g.memberId, v.today), b: balancesFrom(linesOf(v.lines, g.memberId)) }));
  type Row = (typeof rows)[number];
  const open = rows.find((r) => r.m.id === member);
  const cols: Column<Row>[] = [
    { key: "id", header: "Member ID", value: (r) => r.m.id, render: (r) => memberLink(r.m.id) },
    { key: "name", header: "Retailer", value: (r) => r.m.name },
    { key: "gstin", header: "GSTIN", value: (r) => r.g.gstinMasked ?? "", render: (r) => <span className="mono small">{r.g.gstinMasked ?? "Not captured"}</span> },
    { key: "ver", header: "Verification", value: (r) => r.g.verification, render: (r) => <StatusBadge tone={r.g.verification === "verified" ? "positive" : r.g.verification === "pending" ? "warning" : "negative"}>{r.g.verification.replace("_", " ")}</StatusBadge> },
    { key: "src", header: "Source", value: (r) => r.g.source },
    { key: "thr", header: "Threshold", value: (r) => r.gate.thresholdInr, render: (r) => inr(r.gate.thresholdInr), align: "right" },
    { key: "elig", header: "Eligible base (₹)", value: (r) => r.gate.eligibleBaseInr, render: (r) => inr(r.gate.eligibleBaseInr), align: "right" },
    { key: "lb", header: "Locked base (pts)", value: (r) => r.b.gstLocked, align: "right" },
    { key: "ls", header: "Locked scheme (pts)", value: (r) => r.gate.lockedSchemePoints, align: "right" },
    { key: "ex", header: "Exception schemes (pts)", value: (r) => r.gate.exceptionSchemePoints, align: "right" },
    { key: "upd", header: "Last updated", value: (r) => r.g.updatedAt, render: (r) => <span className="num small">{dt(r.g.updatedAt)}</span> },
    { key: "verified", header: "Last verified", value: (r) => r.g.lastVerifiedAt ?? "", render: (r) => <span className="num small">{dt(r.g.lastVerifiedAt)}</span> },
    { key: "status", header: "Eligibility status", value: (r) => r.gate.status, render: (r) => <StatusBadge tone={r.gate.status === "verified" ? "positive" : r.gate.status === "override" ? "accent" : "warning"}>{r.gate.status === "gated" ? "Gated" : r.gate.status === "override" ? "Override (unverified)" : "Verified"}</StatusBadge> },
  ];
  const ov = [...v.ws.gstOverrides].reverse();
  return (
    <>
      <SectionTitle title="Retailer GST eligibility gate" description="Without a verified GSTIN: Base Points redeemable up to ₹19,999 equivalent (configurable); Base above it, milestone, cross-category and One VG points locked. DU, Battery and WSSG schemes are exceptions (from the scheme classification table)" />
      <FinKpiGrid
        items={[
          { id: "t", label: "Total Retailers", value: rows.length, desc: "Retailer wallets in scope", accent: "lead", icon: Users, onSelect: () => setTab("retailers") },
          { id: "v", label: "Verified GSTIN", value: rows.filter((r) => r.g.verification === "verified").length, desc: "Verified through SFDC", accent: "available", icon: ShieldCheck, onSelect: () => setTab("retailers") },
          { id: "nv", label: "Without verified GSTIN", value: rows.filter((r) => r.g.verification !== "verified").length, desc: "Missing, not verified or pending", accent: "gst", icon: AlertTriangle, onSelect: () => setTab("retailers") },
          { id: "p", label: "Pending GST verification", value: rows.filter((r) => r.g.verification === "pending").length, desc: "Verification in progress", accent: "pending", icon: Hourglass, onSelect: () => setTab("retailers") },
          { id: "r", label: "With GST-restricted balances", value: rows.filter((r) => r.b.gstLocked > 0 || r.gate.lockedSchemePoints > 0).length, desc: "Locked base or scheme points", accent: "gst", icon: Lock, onSelect: () => setTab("retailers") },
          { id: "o", label: "With GST overrides", value: rows.filter((r) => r.g.override).length, desc: "Administrative unlock in force (GSTIN still unverified)", accent: "neutral", icon: LockOpen, onSelect: () => setTab("overrides") },
          { id: "op", label: "Overrides pending approval", value: ov.filter((o) => o.status === "pending_approval").length, desc: "Awaiting V-Guard governance (WF-022)", accent: "pending", icon: Hourglass, onSelect: () => setTab("overrides") },
        ]}
      />
      <Notice tone="info">GST source and SFDC write-back are configurable status fields; the Retailer app journey and SFDC write-back flow are open (<DecisionRef id="FD-02" label="OP-RET1" />). No SFDC call is made.</Notice>
      <Tabs label="GST sections" value={tab} onChange={setTab} tabs={[{ id: "retailers", label: "Retailers", count: rows.length }, { id: "overrides", label: "Overrides", count: ov.length }]} />
      {tab === "retailers" ? (
        <Panel title="GST eligibility by Retailer" subtitle="Select a row for detail and override">
          <DataTable rows={rows} columns={cols} rowKey={(r) => r.m.id} caption="GST eligibility" onRowClick={(r) => setMember(r.m.id)} exportName={v.can("gst-gate:export") ? "gst-eligibility" : undefined} />
        </Panel>
      ) : (
        <Panel title="GST overrides" subtitle="Recorded separately from verification. An override never marks a GSTIN as verified">
          <DataTable
            rows={ov}
            rowKey={(o) => o.id}
            caption="GST overrides"
            columns={[
              { key: "id", header: "Override", value: (o) => o.id, render: (o) => <span className="mono small">{o.id}</span> },
              { key: "m", header: "Retailer", value: (o) => o.memberId, render: (o) => memberLink(o.memberId) },
              { key: "gst", header: "GSTIN status", value: (o) => o.gstStatus },
              { key: "req", header: "Requested", value: (o) => (o.requested === "unlock_until" ? `Unlock until ${o.until}` : "Unlock until GSTIN verified") },
              { key: "reason", header: "Reason", value: (o) => o.reasonCode },
              { key: "by", header: "Requested by", value: (o) => userName(v.acc, o.createdBy) },
              { key: "at", header: "Requested", value: (o) => o.createdAt, render: (o) => <span className="num small">{dt(o.createdAt)}</span> },
              { key: "apr", header: "Approval", value: (o) => o.approvalRequestId ?? "", render: (o) => approvalLink(o.approvalRequestId) },
              { key: "status", header: "Status", value: (o) => o.status, render: (o) => <OpBadge status={o.status} /> },
            ]}
          />
        </Panel>
      )}
      {open && <GstDrawer v={v} row={open} onClose={() => setMember("")} />}
    </>
  );
}

function GstDrawer({ v, row, onClose }: { v: WalletView; row: { g: (typeof v.ws.gst)[number]; m: NonNullable<ReturnType<typeof memberById>>; gate: ReturnType<typeof gstGate>; b: ReturnType<typeof balancesFrom> }; onClose: () => void }) {
  const { result, run } = useRun();
  const [f, setF] = useState({ requested: "unlock_until" as GstOverrideRequest["requested"], until: "", reasonCode: "", remarks: "" });
  const [evidence, setEvidence] = useState<string[]>([]);
  const { g, m, gate, b } = row;
  const can = v.canOn("gst-gate", "create", m.id);
  return (
    <Drawer open onClose={onClose} width={640} title={`${m.name} · ${m.id}`} subtitle="Retailer GST eligibility detail">
      <dl className="kv kv--tight">
        <div className="kv__row"><dt>Masked GSTIN</dt><dd className="mono">{g.gstinMasked ?? "Not captured"}</dd></div>
        <div className="kv__row"><dt>GST verification</dt><dd>{g.verification.replace("_", " ")}</dd></div>
        <div className="kv__row"><dt>Source system / write-back</dt><dd>{g.source} · {g.writeBack.replace("_", " ")}</dd></div>
        <div className="kv__row"><dt>GST threshold</dt><dd className="num">{inr(gate.thresholdInr)}</dd></div>
        <div className="kv__row"><dt>Eligible Base Points (₹)</dt><dd className="num">{inr(gate.eligibleBaseInr)}</dd></div>
        <div className="kv__row"><dt>Locked Base Points</dt><dd className="num">{pts(b.gstLocked)}</dd></div>
        <div className="kv__row"><dt>Locked scheme points</dt><dd className="num">{pts(gate.lockedSchemePoints)}</dd></div>
        <div className="kv__row"><dt>Exception scheme points</dt><dd className="num">{pts(gate.exceptionSchemePoints)}</dd></div>
        <div className="kv__row"><dt>Override</dt><dd>{g.override ? `In force until ${g.override.until ?? "GSTIN verified"} (${g.override.requestId || "seed"})` : "None"}</dd></div>
        <div className="kv__row"><dt>Eligibility status</dt><dd>{gate.message}</dd></div>
      </dl>
      {gate.bySchemes.length > 0 && (
        <table className="table table--compact">
          <thead><tr><th>Scheme</th><th>Classification</th><th className="num">Unsettled</th><th>Gate</th></tr></thead>
          <tbody>{gate.bySchemes.map((s) => <tr key={s.schemeId}><td className="mono small">{s.schemeId}</td><td className="small">{s.cls}{GST_SCHEME_CLASS[s.schemeId] ? "" : " (not in table: treated as locked)"}</td><td className="num">{pts(s.points)}</td><td>{s.locked ? <span className="warn-text small">Locked</span> : <span className="pos small">Not affected</span>}</td></tr>)}</tbody>
        </table>
      )}
      {gate.status === "gated" && can && (
        <>
          <h4 className="cfg-sub">Request GST override / unlock</h4>
          <PolicyMessages result={result} />
          <RadioCards name="ovr" label="Requested override" value={f.requested} onChange={(x) => setF({ ...f, requested: x })} options={[{ value: "unlock_until", label: "Unlock until a date", description: "Time-bound exceptional unlock" }, { value: "unlock_permanent_until_verified", label: "Unlock until GSTIN verified", description: "Ends when SFDC verifies the GSTIN" }]} />
          <div className="form-grid form-grid--2">
            {f.requested === "unlock_until" && <TextField label="Unlock until" type="date" value={f.until} onChange={(x) => setF({ ...f, until: x })} />}
            <SelectInput label="Reason code" value={f.reasonCode} onChange={(x) => setF({ ...f, reasonCode: x })} options={[{ value: "", label: "Choose" }, ...GST_OVERRIDE_REASONS.map((r) => ({ value: r.code, label: r.label }))]} />
          </div>
          <TextArea label="Mandatory remarks" value={f.remarks} onChange={(x) => setF({ ...f, remarks: x })} required />
          <div className="field"><label className="field__label">Supporting evidence</label><input type="file" multiple onChange={(e) => setEvidence(Array.from(e.target.files ?? []).map((x) => x.name))} /><p className="field__hint">{evidence.join(", ") || "File names only in this build"}</p></div>
          <button type="button" className="btn btn--primary" onClick={() => { const r = run(submitGstOverride(v.uid, { memberId: m.id, ...f, until: f.until || null, evidence }), "GST override submitted for V-Guard approval"); if (r.ok) onClose(); }}><Send size={14} aria-hidden="true" />Submit for approval</button>
        </>
      )}
    </Drawer>
  );
}

export type { RedemptionRequest };
export { ledgerLink };
