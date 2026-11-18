import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlusCircle, RefreshCw } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs, TextField } from "@/components/form/Form";
import { SelectField } from "@/components/ui/primitives";
import { useToast } from "@/context/ToastContext";
import { SCHEME_TYPE } from "@/config/schemeCatalogue";
import { displayVersion, exposureOf, latestVersion, settlementPreview, validateConfig } from "@/features/schemes/engine";
import { runLifecycleCheck } from "@/features/schemes/store";
import type { RewardAccrual, Scheme } from "@/types/schemes";
import { ApprovalLink } from "@/pages/masters/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { ReleasesTable, SettlementRequestsTable } from "./SchemeDetailPage";
import { BASE, KV, RecordStatus, SchemeStatusBadge, pts, schemeLink, useSchemeView, userLabel } from "./shared";

const FILTERS: Record<string, { label: string; match: (s: Scheme, today: string, near: boolean) => boolean }> = {
  all: { label: "All", match: () => true },
  draft: { label: "Draft", match: (s) => ["draft", "review", "business_confirmation_required", "returned"].includes(s.status) },
  pending_approval: { label: "Pending approval", match: (s) => s.status === "pending_approval" || s.versions.some((v) => v.status === "submitted") },
  approved: { label: "Approved", match: (s) => s.status === "approved" },
  scheduled: { label: "Scheduled", match: (s) => s.status === "scheduled" },
  active: { label: "Active", match: (s) => s.status === "active" },
  completed: { label: "Completed / closed", match: (s) => ["completed", "closed"].includes(s.status) },
  deactivated: { label: "Deactivated", match: (s) => s.status === "deactivated" },
  ending: { label: "Ending in 30 days", match: (s, today) => { const e = displayVersion(s).config.duration.end; const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 30); return s.status === "active" && e >= today && e <= d.toISOString().slice(0, 10); } },
  budget: { label: "Budget alert", match: (_s, _t, near) => near },
};

export function SchemeDirectoryPage() {
  const v = useSchemeView();
  const nav = useNavigate();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<{ ok: boolean; errors: string[]; warnings: string[] } | null>(null);
  const status = params.get("status") ?? "all";
  const programme = params.get("programme") ?? "all";
  const near = (s: Scheme) => { const e = exposureOf(v.s, s, v.today); return ["active", "budget_exhausted"].includes(s.status) && (e.nearExhaustion || e.exhausted); };
  const rows = v.visible.filter((s) => (FILTERS[status] ?? FILTERS.all).match(s, v.today, near(s)) && (programme === "all" || displayVersion(s).config.basic.programmes.includes(programme)));
  const req = (id: string | null) => (id ? v.approvals.requests.find((r) => r.id === id) : undefined);
  const setQ = (k: string, val: string) => { const p = new URLSearchParams(params); if (val === "all") p.delete(k); else p.set(k, val); setParams(p); };
  return (
    <>
      <SectionTitle title="Schemes" description="Every scheme with its approval and activation state. Draft, review and pending schemes never generate rewards" actions={<div className="btn-row">{v.can("schemes:activate") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const r = runLifecycleCheck(v.uid); setResult(r); if (r.ok) notify(r.warnings.join("; "), "positive"); }}><RefreshCw size={14} aria-hidden="true" />Run lifecycle check</button>}{v.can("schemes:create") && <button type="button" className="btn btn--primary" onClick={() => nav(`${BASE}/new`)}><PlusCircle size={16} aria-hidden="true" />Create scheme</button>}</div>} />
      <PolicyMessages result={result} />
      <Tabs label="Status" value={FILTERS[status] ? status : "all"} onChange={(t) => setQ("status", t)} tabs={Object.entries(FILTERS).map(([id, f]) => ({ id, label: f.label, count: v.visible.filter((s) => f.match(s, v.today, near(s))).length }))} />
      <Panel level={3} padded={false}>
        <DataTable rows={rows} rowKey={(s) => s.id} caption="Schemes" initialSort={{ key: "id", dir: "desc" }} onRowClick={(s) => nav(`${BASE}/scheme/${s.id}`)} rowActionLabel={(s) => `Open ${s.id}`} exportName={v.can("schemes:export") ? "schemes" : undefined}
          toolbar={<SelectField label="Programme" value={programme} onChange={(x) => setQ("programme", x)} options={[{ value: "all", label: "All programmes" }, ...["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))]} active={programme !== "all"} />}
          columns={[
            { key: "id", header: "Scheme", value: (s) => s.id, render: (s) => <span><span className="mono small">{s.id}</span><br /><strong>{displayVersion(s).config.basic.name}</strong></span> },
            { key: "p", header: "Programmes", value: (s) => displayVersion(s).config.basic.programmes.join(", ") },
            { key: "t", header: "Type", value: (s) => SCHEME_TYPE[displayVersion(s).config.basic.type] },
            { key: "per", header: "Period", value: (s) => displayVersion(s).config.duration.start, render: (s) => <span className="small num">{displayVersion(s).config.duration.start} → {displayVersion(s).config.duration.end}</span> },
            { key: "st", header: "Status", value: (s) => s.status, render: (s) => <SchemeStatusBadge status={s.status} /> },
            { key: "v", header: "Version", value: (s) => latestVersion(s).version, render: (s) => <span className="small">{s.activeVersion != null ? `v${s.activeVersion} active` : "—"}{latestVersion(s).version !== s.activeVersion ? ` · v${latestVersion(s).version} ${latestVersion(s).status}` : ""}</span> },
            { key: "bcr", header: "Open decisions", value: (s) => validateConfig(v.s, v.ms, s.id, latestVersion(s).config, { today: v.today }).blockers.length, render: (s) => { const n = validateConfig(v.s, v.ms, s.id, latestVersion(s).config, { today: v.today }).blockers.length; return n ? <span className="warn-text small">{n} blocking</span> : <span className="muted small">None</span>; } },
            ...(v.financial ? [{ key: "u", header: "Budget used", align: "right" as const, value: (s: Scheme) => exposureOf(v.s, s, v.today).utilisation, render: (s: Scheme) => { const e = exposureOf(v.s, s, v.today); return <span className={`num ${e.exhausted ? "neg" : ""}`}>{e.budget ? `${Math.round(e.utilisation * 100)}%` : "—"}</span>; } }] : []),
            { key: "ap", header: "Latest approval", value: (s) => latestVersion(s).approvalRequestId ?? "", render: (s) => <ApprovalLink request={req(latestVersion(s).approvalRequestId)} /> },
          ] as Column<Scheme>[]}
        />
      </Panel>
    </>
  );
}

/* ======================= Settlement ======================= */

type SetTab = "rules" | "pending" | "approval" | "history" | "reconciliation";
export function SettlementPage() {
  const v = useSchemeView();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as SetTab) ?? "rules";
  const ids = new Set(v.visible.map((s) => s.id));
  const reqs = v.s.settlements.filter((r) => ids.has(r.schemeId));
  if (!v.can("scheme-settlement:view")) return <Notice tone="warn">Settlement needs Scheme settlement: View.</Notice>;
  const withConfig = v.visible.filter((s) => s.activeVersion != null);
  return (
    <>
      <SectionTitle title="Scheme settlement" description="Base Points are redeemable on credit. Scheme / milestone points stay unsettled until a two-level approved release posts a Settlement Release entry (SOW 5.2)" />
      <Tabs label="Settlement sections" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: "rules", label: "Settlement rules" }, { id: "pending", label: "Pending settlement", count: reqs.filter((r) => ["pending_approval", "partially_approved", "execution_failed"].includes(r.status)).length }, { id: "approval", label: "Approval status" }, { id: "history", label: "History" }, { id: "reconciliation", label: "Reconciliation" }]} />
      {tab === "rules" && (
        <Panel level={3} title="Settlement and partial-release configuration" subtitle="Configured per scheme version; percentages are explicit (the SOW's 70 / 30 is an example, not a default)" padded={false}>
          <DataTable rows={withConfig} rowKey={(s) => s.id} caption="Settlement rules" columns={[
            { key: "id", header: "Scheme", value: (s) => displayVersion(s).config.basic.name, render: (s) => schemeLink(s.id, displayVersion(s).config.basic.name) },
            { key: "st", header: "Scheme status", value: (s) => s.status, render: (s) => <SchemeStatusBadge status={s.status} /> },
            { key: "m", header: "Mode", value: (s) => displayVersion(s).config.settlement.mode.replace("_", " ") },
            { key: "t", header: "Tranches", value: (s) => displayVersion(s).config.settlement.tranches.map((t) => `${t.label} ${t.pct}% (${t.trigger.replace(/_/g, " ")})`).join("; "), render: (s) => <span className="small cell-wrap">{displayVersion(s).config.settlement.tranches.map((t) => `${t.label} ${t.pct}% · ${t.trigger.replace(/_/g, " ")}`).join(" | ")}</span> },
            { key: "u", header: "Unsettled", align: "right", value: (s) => exposureOf(v.s, s, v.today).unsettled, render: (s) => <span className="num">{v.financial ? pts(exposureOf(v.s, s, v.today).unsettled) : "•••"}</span> },
            { key: "ss", header: "Settlement status", value: (s) => s.settlementStatus, render: (s) => <RecordStatus status={s.settlementStatus} /> },
          ] as Column<Scheme>[]} />
        </Panel>
      )}
      {tab === "pending" && (
        <>
          <SettlementRequestsTable rows={reqs.filter((r) => ["pending_approval", "partially_approved", "execution_failed"].includes(r.status))} v={v} />
          <Panel level={3} title="Schemes holding unsettled points" padded={false}>
            <DataTable rows={withConfig.filter((s) => exposureOf(v.s, s, v.today).unsettled > 0)} rowKey={(s) => s.id} caption="Unsettled schemes" emptyTitle="No unsettled scheme points" columns={[
              { key: "id", header: "Scheme", value: (s) => s.id, render: (s) => schemeLink(s.id, displayVersion(s).config.basic.name) },
              { key: "st", header: "Status", value: (s) => s.status, render: (s) => <SchemeStatusBadge status={s.status} /> },
              { key: "u", header: "Unsettled", align: "right", value: (s) => exposureOf(v.s, s, v.today).unsettled, render: (s) => <span className="num">{v.financial ? pts(exposureOf(v.s, s, v.today).unsettled) : "•••"}</span> },
              { key: "f", header: "Final settlement ready", value: (s) => (settlementPreview(v.s, s, displayVersion(s).config.settlement.tranches[displayVersion(s).config.settlement.tranches.length - 1].id, displayVersion(s).config.duration.start, displayVersion(s).config.duration.end, v.today).ok ? "Yes" : "No"), render: (s) => { const p = settlementPreview(v.s, s, displayVersion(s).config.settlement.tranches[displayVersion(s).config.settlement.tranches.length - 1].id, displayVersion(s).config.duration.start, displayVersion(s).config.duration.end, v.today); return p.ok ? <span className="small">Ready</span> : <span className="small warn-text">{p.checks.filter((c) => !c.ok).map((c) => c.label).join(", ")}</span>; } },
            ] as Column<Scheme>[]} />
          </Panel>
        </>
      )}
      {tab === "approval" && (
        <Panel level={3} title="Two-level approval status" subtitle="Stage 1 V-Guard programme approval · Stage 2 Finance (WF-015). The Maker can approve neither stage" padded={false}>
          <DataTable rows={reqs} rowKey={(r) => r.id} caption="Settlement approval status" initialSort={{ key: "id", dir: "desc" }} columns={[
            { key: "id", header: "Request", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
            { key: "s", header: "Scheme", value: (r) => r.schemeId, render: (r) => schemeLink(r.schemeId) },
            { key: "s1", header: "Stage 1", value: (r) => stage(r.approvalRequestId, 0), render: (r) => <span className="small">{stage(r.approvalRequestId, 0)}</span> },
            { key: "s2", header: "Stage 2", value: (r) => stage(r.approvalRequestId, 1), render: (r) => <span className="small">{stage(r.approvalRequestId, 1)}</span> },
            { key: "ex", header: "Execution", value: (r) => v.approvals.requests.find((x) => x.id === r.approvalRequestId)?.execution.status ?? "", render: (r) => <span className="small">{(v.approvals.requests.find((x) => x.id === r.approvalRequestId)?.execution.status ?? "—").replace(/_/g, " ")}</span> },
            { key: "st", header: "Settlement", value: (r) => r.status, render: (r) => <RecordStatus status={r.status} /> },
            { key: "ap", header: "Open", value: (r) => r.approvalRequestId ?? "", render: (r) => <ApprovalLink request={v.approvals.requests.find((x) => x.id === r.approvalRequestId)} /> },
          ] as Column<(typeof reqs)[number]>[]} />
        </Panel>
      )}
      {tab === "history" && <ReleasesTable rows={v.s.releases.filter((r) => ids.has(r.schemeId))} v={v} />}
      {tab === "reconciliation" && <Reconciliation />}
    </>
  );
  function stage(id: string | null, i: number) {
    const r = v.approvals.requests.find((x) => x.id === id);
    const st = r?.stages[i];
    if (!st) return "—";
    return st.decidedBy ? `${st.decision} by ${userLabel(v.acc, st.decidedBy)}` : st.status === "active" ? `Awaiting ${st.name}` : st.status;
  }
}

function Reconciliation() {
  const v = useSchemeView();
  const [q, setQ] = useState("");
  const ids = new Set(v.visible.map((s) => s.id));
  const lookup = q.trim().toUpperCase();
  const hit: RewardAccrual | undefined = lookup ? v.s.accruals.find((a) => ids.has(a.schemeId) && (a.id === lookup || a.ledgerRef === lookup || a.sourceRef === lookup)) : undefined;
  const sc = hit ? v.s.schemes.find((s) => s.id === hit.schemeId) : undefined;
  const ver = sc?.versions.find((x) => x.version === hit!.schemeVersion);
  const txn = hit ? v.s.txns.find((t) => t.id === hit.sourceRef) : undefined;
  const release = hit ? v.s.releases.find((r) => v.s.settlements.find((s) => s.id === r.requestId)?.accrualIds.includes(hit.id)) : undefined;
  const reversals = hit ? v.s.accruals.filter((a) => a.reversalOf === hit.id) : [];
  return (
    <>
      <Panel level={3} title="Trace a reward" subtitle="Calculation ID (ACR-…), ledger reference (LDG-…) or source transaction (TXN-…)">
        <TextField label="Reference" value={q} onChange={setQ} />
        {lookup && !hit && <p className="muted small">No reward calculation in your scope matches.</p>}
        {hit && sc && ver && (
          <ol className="trace-chain">
            <li><strong>Qualifying transaction</strong> · {txn ? `${txn.id} · ${txn.kind} · ${txn.qty} × ${v.ms.skus.find((k) => k.id === txn.skuId)?.code} on ${txn.date} at ${txn.branchCode}` : `${hit.sourceRef} (period evaluation)`}</li>
            <li><strong>Scheme configuration</strong> · {schemeLink(sc.id, displayVersion(sc).config.basic.name)} version v{ver.version}, rule version {hit.ruleVersion}, approved by {userLabel(v.acc, ver.approvedBy)} ({ver.approvalRequestId ?? "—"})</li>
            <li><strong>Rule</strong> · {hit.component} {hit.ruleId} · {hit.note}</li>
            <li><strong>Reward calculation</strong> · {hit.id} · {hit.result} · {v.financial ? `${pts(hit.points)} points` : "points restricted"} · {hit.bucket} · calculated {hit.calculatedAt} · key <span className="mono small">{hit.idempotencyKey}</span></li>
            <li><strong>Ledger</strong> · {hit.ledgerRef ?? "Not posted"}</li>
            <li><strong>Settlement</strong> · {hit.bucket === "redeemable" ? "Not applicable: Base Points are redeemable on credit" : release ? `${release.id} · ${release.ledgerRef} · ${hit.releasedPoints} released` : hit.releasedPoints ? `${hit.releasedPoints} released` : "Unsettled"}</li>
            <li><strong>Reversals</strong> · {reversals.length ? reversals.map((r) => `${r.id} ${r.reversalRef} (${r.result})`).join(", ") : "None"}</li>
          </ol>
        )}
      </Panel>
      <Panel level={3} title="Scheme reconciliation" subtitle="Configuration → version → qualifying transactions → rewards → ledger → settlement → reversals → budget" padded={false}>
        <DataTable rows={v.visible.filter((s) => s.activeVersion != null)} rowKey={(s) => s.id} caption="Reconciliation" exportName={v.can("scheme-settlement:export") ? "scheme-reconciliation" : undefined} columns={[
          { key: "id", header: "Scheme", value: (s) => s.id, render: (s) => schemeLink(s.id) },
          { key: "ver", header: "Versions used", value: (s) => Array.from(new Set(v.s.accruals.filter((a) => a.schemeId === s.id).map((a) => `v${a.schemeVersion}`))).join(", ") },
          { key: "tx", header: "Transactions", align: "right", value: (s) => new Set(v.s.accruals.filter((a) => a.schemeId === s.id && a.sourceRef.startsWith("TXN")).map((a) => a.sourceRef)).size },
          { key: "acc", header: "Rewards posted", align: "right", value: (s) => v.s.accruals.filter((a) => a.schemeId === s.id && (a.result === "credited" || a.result === "accrued")).length },
          ...(v.financial ? [
            { key: "pts", header: "Points posted", align: "right" as const, value: (s: Scheme) => exposureOf(v.s, s, v.today).consumed, render: (s: Scheme) => <span className="num">{pts(exposureOf(v.s, s, v.today).consumed)}</span> },
            { key: "rel", header: "Released", align: "right" as const, value: (s: Scheme) => exposureOf(v.s, s, v.today).released, render: (s: Scheme) => <span className="num">{pts(exposureOf(v.s, s, v.today).released)}</span> },
            { key: "un", header: "Unsettled", align: "right" as const, value: (s: Scheme) => exposureOf(v.s, s, v.today).unsettled, render: (s: Scheme) => <span className="num">{pts(exposureOf(v.s, s, v.today).unsettled)}</span> },
            { key: "bud", header: "Budget consumed", align: "right" as const, value: (s: Scheme) => exposureOf(v.s, s, v.today).utilisation, render: (s: Scheme) => <span className="num">{Math.round(exposureOf(v.s, s, v.today).utilisation * 100)}%</span> },
          ] : []),
          { key: "dup", header: "Duplicates refused", align: "right", value: (s) => exposureOf(v.s, s, v.today).duplicatesRefused },
          { key: "rv", header: "Reversals pending", align: "right", value: (s) => v.s.accruals.filter((a) => a.schemeId === s.id && a.result === "reversal_pending").length },
        ] as Column<Scheme>[]} />
      </Panel>
      <KV rows={[["Ledger", "Mock wallet/ledger adapter in this browser tab. No independent financial ledger is built; the authoritative ledger service contract is prepared, not connected"]]} />
    </>
  );
}
