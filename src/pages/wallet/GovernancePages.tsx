import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertOctagon, CheckCircle2, Download, Scale } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { FIN_EVENTS, FIN_PERMISSIONS, LEDGER_TYPE, PROGRAMMES, RECON_TYPE, TDS_MODEL, WALLET_SERVICES, fy } from "@/config/walletCatalogue";
import { displayVersion, schemeById } from "@/features/schemes/engine";
import { memberById } from "@/features/members/engine";
import { balancesFrom, linesOf, reconcile, type ReconRow } from "@/features/wallet/engine";
import { raiseException, recordExport, recordReversalWindow, updateException, updateFinDecision } from "@/features/wallet/store";
import type { FinDecision, FinancialException, ReconType } from "@/types/wallet";
import { Notice } from "@/pages/approvals/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { BcrTag, FinKpiGrid, approvalLink, dt, inr, memberLink, memberName, pts, useParam, useRun, useWalletView, userName, type WalletView } from "./shared";

/* ======================= Financial reports (SOW 5.7 / 24) ======================= */

type Col<T> = { header: string; value: (r: T) => string | number | null };

export function ReportsPage() {
  const v = useWalletView();
  const [rep, setRep] = useParam("report", "balance");
  const [prog, setProg] = useState("all");
  const [fyF, setFy] = useState("all");
  const { result, run } = useRun();
  const memberOk = (id: string) => v.inScope(id) && (prog === "all" || memberById(v.mem, id)?.programme === prog);
  const lines = v.lines.filter((l) => memberOk(l.memberId) && (fyF === "all" || fy(l.at) === fyF));
  const reds = v.ws.redemptions.filter((r) => memberOk(r.memberId) && (fyF === "all" || fy(r.createdAt) === fyF));
  const reports = useMemo(() => {
    const out: Record<string, { title: string; module: string; cols: Col<Record<string, string | number | null>>[]; rows: Record<string, string | number | null>[] }> = {};
    const mk = (title: string, module: string, rows: Record<string, string | number | null>[]) => ({ title, module, rows, cols: Object.keys(rows[0] ?? { "No data": "" }).map((k) => ({ header: k, value: (r: Record<string, string | number | null>) => r[k] ?? "" })) });
    out.balance = mk("A. Wallet balance report", "wallet", v.ws.wallets.filter((w) => memberOk(w.memberId) && w.status === "active").map((w) => { const b = balancesFrom(linesOf(lines, w.memberId), reds.filter((r) => r.memberId === w.memberId)); const prg = w.programme; return { "Member ID": w.memberId, Programme: prg, Lifetime: b.lifetime, Available: b.available, Redeemed: b.redeemed, "Scheme (unsettled)": b.scheme, Pending: b.pending, "GST locked": prg === "Retailer" ? b.gstLocked : "n/a", "TDS model": TDS_MODEL[prg].label, "TDS Kitty": prg === "EP" ? b.tdsKitty : "n/a", "TDS paid": prg === "EP" ? b.tdsPaid : "n/a", "Redemption TDS (₹)": prg === "EP" || prg === "DD" ? "n/a" : b.tdsDeductedInr }; }));
    out.earned = mk("B. Points earned report", "points-ledger", lines.filter((l) => LEDGER_TYPE[l.type].earning && l.points > 0).map((l) => ({ "Earned date": l.at.slice(0, 10), Member: l.memberId, Programme: l.programme, "Product category": l.categoryId ?? "", SKU: l.skuCode ?? "", Source: l.source, Classification: l.type === "scheme_accrual" ? "Scheme" : "Base", Points: l.gross ?? l.points })));
    out.adjust = mk("C. Points adjustment report", "points-adjustment", v.ws.adjustments.filter((a) => memberOk(a.memberId)).map((a) => { const r = v.approvals.requests.find((x) => x.id === a.approvalRequestId); return { Reference: a.id, Member: a.memberId, Type: a.direction, Category: a.category, Points: a.points, Reason: `${a.reasonCode}: ${a.remarks}`, Maker: userName(v.acc, a.createdBy), Checker: r ? r.stages.map((s) => (s.decidedBy ? userName(v.acc, s.decidedBy) : "")).filter(Boolean).join(", ") : "", Status: a.status }; }));
    out.redemption = mk("D. Redemption report", "redemption", reds.map((r) => ({ "Redemption ID": r.id, Member: r.memberId, Programme: r.programme, Method: r.method, "Gross value (₹)": r.grossInr, "Points used": r.points, "TDS (₹)": r.tds.status === "recorded" ? r.tds.amountInr : r.tds.status === "bcr" ? "Business confirmation required" : "n/a", "Net payout (₹)": r.netInr, Status: r.track, UTR: r.utr ?? "" })));
    out.tds = mk("E. TDS report", "tds", v.ws.wallets.filter((w) => memberOk(w.memberId) && w.status === "active").map((w) => { const b = balancesFrom(linesOf(lines, w.memberId), reds.filter((r) => r.memberId === w.memberId)); const rec = v.ws.tdsFy.filter((r) => r.memberId === w.memberId).pop(); return { Member: w.memberId, Programme: w.programme, FY: fyF === "all" ? "All" : fyF, "TDS model": TDS_MODEL[w.programme].label, "PAN status": "See member KYC", "TDS rate": w.programme === "EP" ? "10% / 20% provisional (SOW)" : w.programme === "DD" ? "Not configured" : "Not confirmed (OP-TDS1)", "TDS deducted": w.programme === "EP" ? `${b.tdsDeductedPoints} pts` : `₹${b.tdsDeductedInr}`, "TDS Kitty": w.programme === "EP" ? b.tdsKitty : "n/a", "TDS paid": w.programme === "EP" ? b.tdsPaid : "n/a", "Reconciliation status": rec?.status ?? (w.programme === "EP" ? "Not initiated" : "n/a") }; }));
    out.settlement = mk("I. Settlement report", "scheme-settlement", v.ss.settlements.map((s) => { const rel = v.ss.releases.find((r) => r.requestId === s.id); return { Scheme: `${s.schemeId} · ${displayVersion(schemeById(v.ss, s.schemeId)!).config.basic.name}`, "Settlement period": `${s.earnedFrom} – ${s.earnedTo}`, "Unsettled points": s.unsettledPoints, "Released points": rel?.releasedPoints ?? 0, "Held points": rel?.heldPoints ?? s.heldPoints, "Approval reference": s.approvalRequestId ?? "", "Ledger reference": rel?.ledgerRef ?? "", "Execution status": s.status }; }));
    return out;
  }, [v.ws, v.ss, v.approvals, v.acc, lines, reds, fyF, prog]);
  const LIST = [
    ["balance", "A. Wallet balance"], ["earned", "B. Points earned"], ["adjust", "C. Points adjustments"], ["redemption", "D. Redemptions"], ["tds", "E. TDS"], ["quarter", "F. Quarterly TDS statement"], ["26q", "G. 26Q back-office"], ["schemetds", "H. Scheme-wise TDS"], ["settlement", "I. Settlement"],
  ];
  const r = reports[rep];
  return (
    <>
      <SectionTitle title="Finance & TDS reporting" description="Reports read the mock ledger and recorded tax values. Exports are permission-checked, audited and labelled development data" />
      <PolicyMessages result={result} />
      <div className="filters-bar">
        <SelectField label="Report" value={rep} onChange={setRep} options={LIST.map(([value, label]) => ({ value, label }))} />
        <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All" }, ...PROGRAMMES.map((p) => ({ value: p, label: p }))]} />
        <SelectField label="Financial year" value={fyF} onChange={setFy} options={[{ value: "all", label: "All" }, { value: "FY 2025-26", label: "FY 2025-26" }, { value: "FY 2026-27", label: "FY 2026-27" }]} />
      </div>
      {r ? (
        <Panel
          title={r.title}
          subtitle={`${r.rows.length} rows`}
          actions={v.can(`${r.module}:export`) ? <button type="button" className="btn btn--secondary btn--sm" onClick={() => { if (run(recordExport(v.uid, r.module, rep, r.rows.length), "Export recorded in the financial audit log").ok) downloadCsv(`${rep}-report.csv`, r.cols, r.rows, "Development data"); }}><Download size={14} aria-hidden="true" />Export CSV</button> : <span className="small muted">Export restricted ({r.module}: Export)</span>}
        >
          <DataTable rows={r.rows} rowKey={(x) => `${rep}-${r.rows.indexOf(x)}`} caption={r.title} columns={r.cols.map((c, i) => ({ key: String(i), header: c.header, value: c.value }))} pageSize={12} />
        </Panel>
      ) : (
        <Panel title={LIST.find(([k]) => k === rep)?.[1] ?? "Report"}>
          <Notice tone="info">The quarterly statement, 26Q back-office report and scheme-wise TDS are in TDS management → TDS reports, where scan-time and redemption-time TDS are kept apart.</Notice>
          <a className="btn btn--secondary btn--sm" href="/wallet/tds?tab=reports">Open TDS reports</a>
        </Panel>
      )}
    </>
  );
}

/* ======================= Financial reconciliation (SOW 25) ======================= */

export function ReconciliationPage() {
  const v = useWalletView("fin-reconciliation");
  const { result, run } = useRun();
  const [type, setType] = useParam("type", "all");
  const [only, setOnly] = useState("difference");
  const rows = useMemo(() => reconcile(v.ws, v.ss, v.mem, v.approvals.requests, `To ${v.today}`), [v.ws, v.ss, v.mem, v.approvals.requests, v.today]);
  const shown = rows.filter((r) => (type === "all" || r.type === type) && (only === "all" || r.status === "difference") && (!r.memberId || v.inScope(r.memberId)));
  const manage = v.can("fin-reconciliation:manage");
  const excFor = (r: ReconRow) => v.ws.exceptions.find((e) => e.ref === r.ref && e.reconType === r.type);
  const cols: Column<ReconRow>[] = [
    { key: "id", header: "Reconciliation ID", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
    { key: "period", header: "Period", value: (r) => r.period },
    { key: "src", header: "Source", value: (r) => RECON_TYPE[r.type].source },
    { key: "tgt", header: "Target", value: (r) => RECON_TYPE[r.type].target },
    { key: "exp", header: "Expected", value: (r) => r.expected, align: "right" },
    { key: "act", header: "Actual", value: (r) => r.actual, align: "right" },
    { key: "diff", header: "Difference", value: (r) => r.difference, render: (r) => <span className={`num ${r.difference ? "neg" : ""}`}>{r.difference}</span>, align: "right" },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "matched" ? "positive" : "negative"}>{r.status === "matched" ? "Matched" : "Difference"}</StatusBadge> },
    { key: "exc", header: "Exception type", value: (r) => r.exception },
    { key: "owner", header: "Owner / resolution", value: (r) => excFor(r)?.status ?? "", render: (r) => { const e = excFor(r); return e ? <span className="small">{e.id} · {userName(v.acc, e.owner)} · {e.status.replace(/_/g, " ")}</span> : r.status === "difference" && manage ? <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(raiseException(v.uid, r, v.uid), "Exception raised")}>Raise exception</button> : <span className="small muted">—</span>; } },
  ];
  return (
    <>
      <SectionTitle title="Financial reconciliation" description="Differences are shown, never corrected silently. A correction must go through an approved adjustment or reversal and is then linked to the exception" />
      <PolicyMessages result={result} />
      <div className="recon-grid">
        {(Object.keys(RECON_TYPE) as ReconType[]).map((t) => {
          const list = rows.filter((r) => r.type === t);
          const diff = list.filter((r) => r.status === "difference").length;
          return (
            <button key={t} type="button" className={`recon-card ${diff ? "recon-card--diff" : ""} ${type === t ? "is-active" : ""}`} onClick={() => setType(type === t ? "all" : t)}>
              {diff ? <AlertOctagon size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
              <span className="recon-card__label">{RECON_TYPE[t].label}</span>
              <span className="recon-card__n num">{diff} / {list.length}</span>
            </button>
          );
        })}
      </div>
      <Panel title="Reconciliation items" subtitle={type === "all" ? "All views" : RECON_TYPE[type as ReconType].label} actions={<SelectField label="Show" value={only} onChange={setOnly} options={[{ value: "difference", label: "Differences only" }, { value: "all", label: "All items" }]} />}>
        <DataTable rows={shown} columns={cols} rowKey={(r) => r.id} caption="Reconciliation" exportName={v.can("fin-reconciliation:export") ? "financial-reconciliation" : undefined} />
      </Panel>
      <ExceptionsPanel v={v} />
    </>
  );
}

function ExceptionsPanel({ v }: { v: WalletView }) {
  const { result, run } = useRun();
  const [edit, setEdit] = useState<FinancialException | null>(null);
  const [f, setF] = useState({ status: "investigating" as FinancialException["status"], ref: "", note: "" });
  return (
    <Panel title="Financial exceptions" subtitle="Owner, status and resolution. Resolution by correction needs a completed ADJ- or REV- reference">
      <PolicyMessages result={result} />
      <DataTable
        rows={[...v.ws.exceptions].reverse()}
        rowKey={(e) => e.id}
        caption="Financial exceptions"
        onRowClick={(e) => { setEdit(e); setF({ status: e.status, ref: e.resolutionRef ?? "", note: "" }); }}
        columns={[
          { key: "id", header: "Exception", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
          { key: "t", header: "Reconciliation", value: (e) => RECON_TYPE[e.reconType].label },
          { key: "ref", header: "Reference", value: (e) => e.ref },
          { key: "m", header: "Member", value: (e) => e.memberId ?? "", render: (e) => (e.memberId ? memberLink(e.memberId) : "—") },
          { key: "d", header: "Detail", value: (e) => e.detail },
          { key: "o", header: "Owner", value: (e) => userName(v.acc, e.owner) },
          { key: "s", header: "Status", value: (e) => e.status, render: (e) => <StatusBadge tone={e.status === "open" ? "negative" : e.status === "investigating" ? "warning" : "positive"}>{e.status.replace(/_/g, " ")}</StatusBadge> },
          { key: "r", header: "Resolution", value: (e) => e.resolutionRef ?? "" },
          { key: "u", header: "Updated", value: (e) => e.updatedAt, render: (e) => <span className="num small">{dt(e.updatedAt)}</span> },
        ]}
      />
      {edit && v.can("fin-reconciliation:manage") && (
        <div className="form-inline">
          <h4 className="cfg-sub">Update {edit.id}</h4>
          <div className="form-grid form-grid--3">
            <SelectInput label="Status" value={f.status} onChange={(x) => setF({ ...f, status: x as FinancialException["status"] })} options={[{ value: "open", label: "Open" }, { value: "investigating", label: "Investigating" }, { value: "resolved_by_correction", label: "Resolved by correction" }, { value: "accepted", label: "Accepted (no correction)" }]} />
            <TextField label="Resolution reference (ADJ- / REV-)" value={f.ref} onChange={(x) => setF({ ...f, ref: x })} />
            <TextField label="Note" value={f.note} onChange={(x) => setF({ ...f, note: x })} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(updateException(v.uid, edit.id, f.status, f.ref, f.note), "Exception updated"); if (r.ok) setEdit(null); }}>Save</button>
        </div>
      )}
    </Panel>
  );
}

/* ======================= Financial configuration and governance ======================= */

export function ConfigPage() {
  const v = useWalletView();
  const [tab, setTab] = useParam("tab", "config");
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [hash, tab]);
  const c = v.ws.config;
  return (
    <>
      <SectionTitle title="Financial configuration & governance" description="SOW-stated values, unresolved values marked Business confirmation required, the decision register, service contracts, permissions, notifications and the financial audit trail" />
      <Tabs label="Configuration sections" value={tab} onChange={setTab} tabs={[{ id: "config", label: "Configuration" }, { id: "decisions", label: "Business confirmation register", count: v.ws.decisions.filter((d) => d.status === "open" || d.status === "under_review").length }, { id: "services", label: "Service contracts" }, { id: "permissions", label: "Permissions" }, { id: "notifications", label: "Notifications", count: v.ws.notifications.length }, { id: "audit", label: "Audit trail", count: v.ws.audit.length }]} />
      {tab === "config" && (
        <div className="grid-2">
          <Panel title="TDS (SOW 5.4)">
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>EP/IMP provisional rate with PAN</dt><dd>{c.ep.panRatePct}% <span className="small muted">SOW value</span></dd></div>
              <div className="kv__row"><dt>EP/IMP provisional rate without PAN</dt><dd>{c.ep.noPanRatePct}% <span className="small muted">SOW value</span></dd></div>
              <div className="kv__row"><dt>FY threshold per member</dt><dd>{inr(c.ep.fyThresholdInr)} <span className="small muted">SOW value</span></dd></div>
              <div className="kv__row"><dt>Post-threshold slab</dt><dd><BcrTag /> <a href="#FD-01" onClick={() => setTab("decisions")}>OP-TDS1</a></dd></div>
              <div className="kv__row"><dt>Retailer / ST / CS redemption slab</dt><dd><BcrTag /> OP-TDS1</dd></div>
              <div className="kv__row"><dt>DD</dt><dd><BcrTag>Not configured</BcrTag> FD-11</dd></div>
            </dl>
          </Panel>
          <Panel title="GST gate and Retailer reserve (SOW 5.5, 5.4.2)">
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>GST threshold (unverified GSTIN)</dt><dd>{inr(c.gst.thresholdInr)} <span className="small muted">SOW value, admin-configurable</span></dd></div>
              <div className="kv__row"><dt>Exception scheme classes</dt><dd>{c.gst.exceptionCategories.join(", ").toUpperCase()}</dd></div>
              <div className="kv__row"><dt>Default Retailer TDS reserve</dt><dd>{inr(c.retailerReserveDefaultInr)} <span className="small muted">SOW value</span></dd></div>
            </dl>
          </Panel>
          <Panel title="Wallet service and operations">
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Point value (₹ per point)</dt><dd>{c.pointValueInr} <span className="small warn-text">development conversion only · FD-07</span></dd></div>
              <div className="kv__row"><dt>Expiring-soon window</dt><dd>{c.expiringSoonDays} days <span className="small warn-text">display setting · FD-10</span></dd></div>
              <div className="kv__row"><dt>Bulk adjustment batch policy</dt><dd>{c.batchPolicy === "atomic" ? "Atomic (all valid rows or none)" : "Row-level"}</dd></div>
              <div className="kv__row"><dt>Wallet service (simulation)</dt><dd>{v.ws.service.mode}</dd></div>
            </dl>
          </Panel>
          <ReversalWindowPanel v={v} />
          <Panel title="EMI via points (SOW 5.6)">
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Financing partner</dt><dd>{c.emi.partner ?? <BcrTag>Not set · OP-FIN1</BcrTag>}</dd></div>
              <div className="kv__row"><dt>Eligibility, limits, reversals</dt><dd><BcrTag>OP-FIN1</BcrTag></dd></div>
              <div className="kv__row"><dt>Status</dt><dd>{c.emi.enabled ? "Enabled" : "Disabled (not activated without confirmation)"}</dd></div>
            </dl>
          </Panel>
        </div>
      )}
      {tab === "decisions" && <DecisionRegister v={v} />}
      {tab === "services" && (
        <Panel title="Service contracts" subtitle="Backend-facing interfaces (src/services/walletApi.ts). No production endpoints are invented">
          <table className="table table--compact"><thead><tr><th>Service</th><th>Responsibility</th><th>Idempotency</th><th>Status</th></tr></thead><tbody>{WALLET_SERVICES.map((s) => <tr key={s.service}><th scope="row">{s.service}</th><td className="small">{s.responsibility}</td><td className="small mono">{s.idempotency}</td><td className="small">{s.status}</td></tr>)}</tbody></table>
        </Panel>
      )}
      {tab === "permissions" && (
        <Panel title="Phase 7 permissions" subtitle="Granted through roles and Maker / Checker profiles in User & role management. A Finance role alone does not grant approval or cancellation">
          <table className="table table--compact"><thead><tr><th>Permission</th><th>Catalogue key</th><th>You</th><th>Note</th></tr></thead><tbody>{FIN_PERMISSIONS.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td className="mono small">{p.key}</td><td>{v.can(p.key) ? <span className="pos small">Yes</span> : <span className="muted small">No</span>}</td><td className="small">{p.note ?? ""}</td></tr>)}</tbody></table>
        </Panel>
      )}
      {tab === "notifications" && (
        <Panel title="Financial notifications (mock)" subtitle={`Recorded, never sent. Events: ${FIN_EVENTS.length}`}>
          <DataTable rows={[...v.ws.notifications].reverse()} rowKey={(n) => n.id} caption="Financial notifications" columns={[{ key: "at", header: "At", value: (n) => n.at, render: (n) => <span className="num small">{dt(n.at)}</span> }, { key: "e", header: "Event", value: (n) => n.event }, { key: "ref", header: "Reference", value: (n) => n.ref }, { key: "m", header: "Member", value: (n) => n.memberId ?? "" }, { key: "msg", header: "Message", value: (n) => n.message }, { key: "d", header: "Delivery", value: () => "Mock: recorded only" }]} />
        </Panel>
      )}
      {tab === "audit" && (
        <Panel title="Financial audit trail" subtitle="Append-only">
          <DataTable rows={[...v.ws.audit].reverse()} rowKey={(a) => a.id} caption="Financial audit" exportName={v.can("wallet:export") ? "financial-audit" : undefined} columns={[{ key: "at", header: "At", value: (a) => a.at, render: (a) => <span className="num small">{dt(a.at)}</span> }, { key: "actor", header: "Actor", value: (a) => userName(v.acc, a.actor) }, { key: "entity", header: "Entity", value: (a) => `${a.entity} ${a.entityId}` }, { key: "action", header: "Action", value: (a) => a.action.replace(/_/g, " ") }, { key: "before", header: "Before", value: (a) => a.before ?? "" }, { key: "after", header: "After", value: (a) => a.after ?? "" }, { key: "reason", header: "Reason", value: (a) => a.reason }, { key: "apr", header: "Approval", value: (a) => a.approvalRequestId ?? "", render: (a) => approvalLink(a.approvalRequestId) }]} />
        </Panel>
      )}
    </>
  );
}

function ReversalWindowPanel({ v }: { v: WalletView }) {
  const { result, run } = useRun();
  const [h, setH] = useState("");
  const w = v.ws.config.autoReversal;
  return (
    <Panel title="Failed redemption auto-reversal (SOW 5.3)">
      <PolicyMessages result={result} />
      <p className="small">Window: {w.windowHours == null ? <BcrTag>Not configured · FD-05</BcrTag> : `${w.windowHours} hours (confirmed)`}</p>
      <p className="small muted">No default is invented. Once FD-05 is confirmed in the register, an authorised user records the confirmed window here.</p>
      {v.can("redemption-limits:edit") && (
        <div className="btn-row">
          <TextField label="Confirmed window (hours)" value={h} onChange={setH} inputMode="numeric" />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(recordReversalWindow(v.uid, Number(h)), "Reversal window recorded")}>Record window</button>
        </div>
      )}
    </Panel>
  );
}

function DecisionRegister({ v }: { v: WalletView }) {
  const { result, run } = useRun();
  const [edit, setEdit] = useState<FinDecision | null>(null);
  const [f, setF] = useState({ status: "open" as FinDecision["status"], answer: "" });
  return (
    <Panel title="Business confirmation register" subtitle="Open decisions stay visible even where the screens are built">
      <PolicyMessages result={result} />
      <table className="table">
        <thead><tr><th>ID</th><th>SOW ref.</th><th>Open question</th><th>Implementation treatment</th><th>Status</th><th /></tr></thead>
        <tbody>
          {v.ws.decisions.map((d) => (
            <tr key={d.id} id={d.id}>
              <td className="mono small">{d.id}</td>
              <td className="small">{d.ref}</td>
              <td className="small">{d.question}{d.answer && <p className="small pos">Answer: {d.answer}</p>}</td>
              <td className="small">{d.treatment}</td>
              <td><StatusBadge tone={d.status === "confirmed" ? "positive" : d.status === "open" ? "warning" : "neutral"}>{d.status.replace(/_/g, " ")}</StatusBadge></td>
              <td>{v.can("financial:edit") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => { setEdit(d); setF({ status: d.status, answer: d.answer }); }}>Update</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <div className="form-inline">
          <h4 className="cfg-sub">{edit.id} · {edit.ref}</h4>
          <div className="form-grid form-grid--2">
            <SelectInput label="Status" value={f.status} onChange={(x) => setF({ ...f, status: x as FinDecision["status"] })} options={["open", "under_review", "confirmed", "deferred", "out_of_scope"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />
            <TextArea label="Answer" value={f.answer} onChange={(x) => setF({ ...f, answer: x })} rows={2} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(updateFinDecision(v.uid, edit.id, f), "Decision updated"); if (r.ok) setEdit(null); }}>Save</button>
        </div>
      )}
    </Panel>
  );
}

export { Scale, pts, memberName, FinKpiGrid };
