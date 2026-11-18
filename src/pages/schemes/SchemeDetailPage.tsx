import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Ban, CheckCircle2, Copy, Download, FileDown, Flag, FlaskConical, GitCompare, Pencil, Play, PlusCircle, Send, ShieldAlert, Timer } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Checkbox, MultiSelect, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { Drawer } from "@/components/ui/Overlay";
import { RankedBars } from "@/components/ui/DataBars";
import { useToast } from "@/context/ToastContext";
import { COMPONENT_LABEL, SCHEME_STATUS, TARGET_DIMENSIONS } from "@/config/schemeCatalogue";
import { findBranch } from "@/config/geography";
import { categoryById, skuById, subById } from "@/features/masters/engine";
import { activeComponents, branchesInScope, configDiff, displayVersion, eligiblePopulation, exclusivityConflicts, exposureOf, latestVersion, overlappingSchemes, projectedLiability, schemeById, settlementPreview, skuCategory, skusInScope, validateConfig, versionOf } from "@/features/schemes/engine";
import { activateScheme, activationChecks, createSettlementRequest, markReview, newVersion, postMockTransaction, recordLiabilitySignOff, requestBackdated, requestBudgetChange, requestClosure, requestDeactivation, requestExclusivity, requestExtension, runBackdated, runPeriodNow, setActivationFailureSimulation, submitScheme } from "@/features/schemes/store";
import { formatDateTime } from "@/lib/format";
import type { RewardAccrual, Scheme, SchemeAuditEvent, SchemeVersion, SettlementRequest } from "@/types/schemes";
import { ApprovalLink, branchOptions, ValidationList } from "@/pages/masters/shared";
import { AccessDenied, PolicyMessages, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { ConfigReview } from "./ConfigReview";
import { exportReport } from "./exports";
import { BASE, BlockerList, DecisionRef, KV, NoFinancial, RecordStatus, SchemeStatusBadge, pts, schemeLink, useSchemeView, userLabel, type SchemeView } from "./shared";

type Tab = "summary" | "validation" | "versions" | "performance" | "budget" | "settlement" | "extensions" | "concurrency" | "audit" | "ledger";
type Res = { ok: boolean; errors: string[]; warnings: string[]; id?: string } | null;

export function SchemeDetailPage() {
  const v = useSchemeView();
  const { schemeId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { notify } = useToast();
  const [result, setResult] = useState<Res>(null);
  const [dialog, setDialog] = useState<null | "deactivate" | "close" | "budget" | "backdated" | "extension" | "exclusivity">(null);
  const sc = schemeById(v.s, schemeId);
  const tab = (params.get("tab") as Tab) ?? "summary";
  if (!sc) return <Notice tone="warn">Scheme {schemeId} not found.</Notice>;
  if (!v.visible.some((x) => x.id === sc.id)) return <AccessDenied message="This scheme's programmes are outside your Scheme builder: View scope." />;
  const dv = displayVersion(sc);
  const c = dv.config;
  const latest = latestVersion(sc);
  const progs = c.basic.programmes;
  const approvedPending = [...sc.versions].reverse().find((x) => x.status === "approved");
  const run = (r: Res, ok?: string) => { setResult(r); if (r?.ok && ok) notify(ok, "positive"); return r ?? { ok: false, errors: [], warnings: [] }; };
  const can = (m: string, a: Parameters<SchemeView["canOn"]>[1]) => v.canOn(m, a, progs);
  const tabs: { id: Tab; label: string }[] = [
    { id: "summary", label: "Configuration" },
    { id: "validation", label: "Validation & liability" },
    { id: "versions", label: `Versions (${sc.versions.length})` },
    { id: "performance", label: "Performance" },
    { id: "budget", label: "Budget & exposure" },
    { id: "settlement", label: "Settlement" },
    { id: "extensions", label: "Extensions & backdated" },
    { id: "concurrency", label: "Concurrency" },
    { id: "audit", label: "Audit" },
    { id: "ledger", label: "Ledger & simulator" },
  ];

  return (
    <>
      <SectionTitle
        title={`${c.basic.name}`}
        description={<><span className="mono">{sc.id}</span> · {progs.join(", ")} · {c.duration.start} to {c.duration.end} · showing v{dv.version}{sc.activeVersion != null ? " (active version)" : ""}</>}
        actions={<SchemeStatusBadge status={sc.status} />}
      />
      <Notice tone={sc.status === "active" ? "ok" : "info"}>{SCHEME_STATUS[sc.status].meaning}.{sc.activeVersion != null && ` Active version v${sc.activeVersion} in the development engine (not a production activation).`}{latest.version !== dv.version && ` Latest version v${latest.version} is ${latest.status.replace(/_/g, " ")}.`}</Notice>
      <div className="btn-row action-bar">
        {latest.status === "draft" && can("schemes", "edit") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => nav(`${BASE}/scheme/${sc.id}/edit`)}><Pencil size={14} aria-hidden="true" />Edit draft v{latest.version}</button>}
        {latest.status === "draft" && ["draft", "business_confirmation_required"].includes(sc.status) && can("schemes", "edit") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(markReview(v.uid, sc.id), "Moved to Review")}>Move to review</button>}
        {latest.status === "draft" && can("schemes", "submit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitScheme(v.uid, sc.id), "Submitted for approval")}><Send size={14} aria-hidden="true" />Submit v{latest.version} for approval</button>}
        {["returned", "rejected"].includes(latest.status) && can("schemes", "edit") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const r = newVersion(v.uid, sc.id, "Correction after Checker review"); run(r); if (r.ok) nav(`${BASE}/scheme/${sc.id}/edit`); }}><Pencil size={14} aria-hidden="true" />Revise as v{latest.version + 1}</button>}
        {["active", "approved", "scheduled", "budget_exhausted", "activation_failed"].includes(sc.status) && !["draft", "submitted"].includes(latest.status) && can("schemes", "edit") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const r = newVersion(v.uid, sc.id, "Change to an approved scheme"); run(r); if (r.ok) nav(`${BASE}/scheme/${sc.id}/edit`); }}><Copy size={14} aria-hidden="true" />New version</button>}
        {approvedPending && can("schemes", "activate") && <button type="button" className="btn btn--dark btn--sm" onClick={() => run(activateScheme(v.uid, sc.id), "Activated in the development engine")}><Play size={14} aria-hidden="true" />Activate v{approvedPending.version}</button>}
        {["active", "scheduled", "approved", "budget_exhausted"].includes(sc.status) && can("schemes", "disable") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog("deactivate")}><Ban size={14} aria-hidden="true" />Deactivate</button>}
        {["completed", "deactivated", "budget_exhausted"].includes(sc.status) && can("schemes", "close") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog("close")}><Flag size={14} aria-hidden="true" />Close</button>}
        {["active", "budget_exhausted", "approved", "scheduled"].includes(sc.status) && can("scheme-budget", "edit") && !["draft", "submitted"].includes(latest.status) && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog("budget")}>Change budget</button>}
      </div>
      <PolicyMessages result={result} />
      <div className="sch-scroll"><Tabs label="Scheme sections" value={tab} onChange={(t) => setParams({ tab: t })} tabs={tabs} /></div>
      {tab === "summary" && <Panel level={3} title={`Configuration · v${dv.version}`}><ConfigReview c={c} s={v.s} ms={v.ms} mem={v.mem} financial={v.financial} /></Panel>}
      {tab === "validation" && <ValidationTab sc={sc} v={v} run={run} />}
      {tab === "versions" && <VersionsTab sc={sc} v={v} />}
      {tab === "performance" && <PerformanceTab sc={sc} v={v} />}
      {tab === "budget" && <BudgetTab sc={sc} v={v} />}
      {tab === "settlement" && <SchemeSettlementTab sc={sc} v={v} run={run} />}
      {tab === "extensions" && <ExtensionsTab sc={sc} v={v} run={run} open={setDialog} />}
      {tab === "concurrency" && <ConcurrencyTab sc={sc} v={v} open={setDialog} />}
      {tab === "audit" && <SchemeAuditTable rows={v.s.audit.filter((a) => a.entityId === sc.id || v.s.extensions.some((e) => e.schemeId === sc.id && e.id === a.entityId) || v.s.settlements.some((x) => x.schemeId === sc.id && x.id === a.entityId))} v={v} name={`${sc.id}-audit`} />}
      {tab === "ledger" && <LedgerTab sc={sc} v={v} run={run} />}

      <ReasonDialog open={dialog === "deactivate"} title={`Deactivate ${sc.id}`} confirmLabel="Submit for approval" tone="danger" body="Deactivation goes to the Approval Centre. Accruals stop when it is executed; versions, ledger and performance are kept." onClose={() => setDialog(null)} onConfirm={(r) => run(requestDeactivation(v.uid, sc.id, r), "Deactivation submitted")!} />
      <ReasonDialog open={dialog === "close"} title={`Close ${sc.id}`} confirmLabel="Submit for approval" body="Closure does not settle points. Unsettled scheme points need a separate settlement request with two-level approval." onClose={() => setDialog(null)} onConfirm={(r) => run(requestClosure(v.uid, sc.id, r), "Closure submitted")!} />
      <BudgetDrawer open={dialog === "budget"} sc={sc} v={v} onClose={() => setDialog(null)} run={run} />
      <ReasonDialog open={dialog === "backdated"} title={`Request backdated calculation · ${sc.id}`} confirmLabel="Submit for two-level approval" body={`Historical period ${c.backdated.historicalFrom} to ${c.backdated.historicalTo}. Approval authorises the run; it credits nothing by itself.`} onClose={() => setDialog(null)} onConfirm={(r) => run(requestBackdated(v.uid, sc.id, r), "Backdated calculation submitted")!} />
      <ExtensionDrawer open={dialog === "extension"} sc={sc} v={v} onClose={() => setDialog(null)} run={run} />
      <ExclusivityDrawer open={dialog === "exclusivity"} sc={sc} v={v} onClose={() => setDialog(null)} run={run} />
    </>
  );
}

/* ---------------- Validation & liability ---------------- */

function ValidationTab({ sc, v, run }: { sc: Scheme; v: SchemeView; run: (r: Res, ok?: string) => unknown }) {
  const latest = latestVersion(sc);
  const val = validateConfig(v.s, v.ms, sc.id, latest.config, { today: v.today, members: v.mem });
  const pop = eligiblePopulation(v.mem, v.ms, latest.config);
  const liab = projectedLiability(v.s, sc, latest.version, pop.count, new Date().toISOString());
  const approved = [...sc.versions].reverse().find((x) => x.status === "approved");
  return (
    <>
      <div className="grid-2">
        <Panel level={3} title={`Validation · v${latest.version}`}>
          <ValidationList v={{ errors: val.errors, warnings: val.warnings, info: val.info }} />
          <BlockerList blockers={val.blockers} />
        </Panel>
        <Panel level={3} title="Projected liability service" subtitle="Interface present; formula pending (OP-SB-LIAB)">
          <KV rows={[["Status", <strong className="warn-text">Pending business formula</strong>], ["Formula", `${liab.formulaId} · version ${liab.formulaVersion ?? "none"}`], ["Data source", liab.dataSource], ["Calculation timestamp", "Not calculated"], ...liab.inputs.map((i) => [i.label, i.value] as [string, string]), ["Assumptions", "None: no formula"], ["Exposure output", "—"], ["Validation", liab.validation]]} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(recordLiabilitySignOff(v.uid, sc.id))}><ShieldAlert size={14} aria-hidden="true" />Record financial sign-off</button>
          <p className="small muted">Sign-off is refused and the attempt is audited while the formula is pending.</p>
        </Panel>
      </div>
      <div className="grid-2">
        <Panel level={3} title="Financial review measures">
          <KV rows={[["Estimated eligible members", pop.count != null ? String(pop.count) : `${pop.lowerBound}+ (not computable: ${pop.notComputable.join(", ")})`], ["Estimated participation", "Not available: no approved participation model"], ["Estimated exposure / projected liability", "Pending business formula"], ["Configured budget", v.financial ? `${pts(latest.config.budget.amount)} points` : "Restricted"], ["Remaining budget", v.financial ? `${pts(exposureOf(v.s, sc, v.today).remaining)} points` : "Restricted"], ["Expected points accrual", "Not calculable without the liability formula"], ["Unsettled points exposure", v.financial ? `${pts(exposureOf(v.s, sc, v.today).unsettled)} points (actual, mock ledger)` : "Restricted"]]} />
        </Panel>
        <Panel level={3} title="Activation checks" subtitle={approved ? `For approved v${approved.version}` : "No approved version waiting for activation"}>
          {approved ? <ul className="checks">{activationChecks(sc, approved).map((ch) => <li key={ch.label} className={ch.ok ? "is-ok" : "is-bad"}>{ch.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <ShieldAlert size={14} aria-hidden="true" />} <strong>{ch.label}</strong> · {ch.detail}</li>)}</ul> : <p className="muted small">Approval comes first. Activation never bypasses it.</p>}
          {sc.activations.length > 0 && <p className="small">Last attempt: {formatDateTime(sc.activations[sc.activations.length - 1].at)} · {sc.activations[sc.activations.length - 1].result} · {sc.activations[sc.activations.length - 1].message}</p>}
          {v.can("schemes:activate") && approved && <Checkbox label="Development only: make the mock adapter fail the next activation" checked={!!sc.simulateActivationFailure} onChange={(x) => run(setActivationFailureSimulation(v.uid, sc.id, x))} />}
        </Panel>
      </div>
    </>
  );
}

/* ---------------- Versions & change impact ---------------- */

function VersionsTab({ sc, v }: { sc: Scheme; v: SchemeView }) {
  const [a, setA] = useState(String(sc.versions[Math.max(0, sc.versions.length - 2)].version));
  const [b, setB] = useState(String(sc.versions[sc.versions.length - 1].version));
  const va = versionOf(sc, Number(a))!;
  const vb = versionOf(sc, Number(b))!;
  const diff = configDiff(v.s, v.ms, va.config, vb.config);
  const latest = latestVersion(sc);
  const active = versionOf(sc, sc.activeVersion);
  const req = (id: string | null) => (id ? v.approvals.requests.find((r) => r.id === id) : undefined);
  const exp = exposureOf(v.s, sc, v.today);
  const changed = active && latest.version !== active.version ? configDiff(v.s, v.ms, active.config, latest.config) : [];
  const acc = v.s.accruals.filter((x) => x.schemeId === sc.id && (x.result === "credited" || x.result === "accrued"));
  return (
    <>
      <Panel level={3} title="Version history" subtitle="Submitted versions are read-only; approved versions are preserved; transactions keep the version used" padded={false}>
        <DataTable rows={[...sc.versions].reverse()} rowKey={(x) => String(x.version)} caption="Scheme versions" searchable={false} columns={[
          { key: "v", header: "Version", value: (x) => x.version, render: (x) => <strong>v{x.version}</strong> },
          { key: "st", header: "Status", value: (x) => x.status, render: (x) => <RecordStatus status={x.status} /> },
          { key: "rule", header: "Rule version", value: (x) => x.ruleVersion, render: (x) => <span className="mono small">{x.ruleVersion}</span> },
          { key: "eff", header: "Effective", value: (x) => x.effectiveStart ?? "", render: (x) => <span className="small num">{x.effectiveStart ?? "—"} → {x.effectiveEnd ?? (x.effectiveStart ? "open" : "—")}</span> },
          { key: "by", header: "Created", value: (x) => x.createdAt, render: (x) => <span className="small">{userLabel(v.acc, x.createdBy)} · {formatDateTime(x.createdAt)}</span> },
          { key: "ap", header: "Approved", value: (x) => x.approvedAt ?? "", render: (x) => <span className="small">{x.approvedAt ? `${userLabel(v.acc, x.approvedBy)} · ${formatDateTime(x.approvedAt)}` : "—"}</span> },
          { key: "req", header: "Approval", value: (x) => x.approvalRequestId ?? "", render: (x) => <ApprovalLink request={req(x.approvalRequestId)} /> },
          { key: "acc", header: "Accruals", align: "right", value: (x) => acc.filter((y) => y.schemeVersion === x.version).length },
          { key: "f", header: "Formulas", value: (x) => Object.entries(x.formulaVersions).map(([k, val]) => `${k} v${val}`).join(", ") || "Explicit values only" },
        ] as Column<SchemeVersion>[]} />
      </Panel>
      {changed.length > 0 && (
        <Panel level={3} title={`Impact of v${latest.version} against active v${active!.version}`} subtitle="Shown before the change is approved">
          <KV rows={[["Fields changed", changed.map((f) => f.label).join(", ")], ["Active members (participating)", String(new Set(acc.map((x) => x.memberId)).size)], ["Qualified members (scheme points)", String(new Set(acc.filter((x) => x.bucket === "unsettled").map((x) => x.memberId)).size)], ["Points accrued so far", v.financial ? pts(exp.consumed) : "Restricted"], ["Unsettled points", v.financial ? pts(exp.unsettled) : "Restricted"], ["Budget", v.financial ? `${pts(active!.config.budget.amount)} → ${pts(latest.config.budget.amount)}` : "Restricted"], ["Settlement", JSON.stringify(active!.config.settlement) === JSON.stringify(latest.config.settlement) ? "Unchanged" : "Changed: applies to accruals calculated under the new version"], ["Historical calculations", "Unchanged: past accruals keep v" + active!.version + ". Recalculation needs an explicit approved backdated process"], ["Projected financial impact", "Not available / Business confirmation required (OP-SB-LIAB)"]]} />
        </Panel>
      )}
      <Panel level={3} title="Compare versions" actions={<GitCompare size={16} aria-hidden="true" />}>
        <div className="form-grid form-grid--2">
          <SelectInput label="From" value={a} onChange={setA} options={sc.versions.map((x) => ({ value: String(x.version), label: `v${x.version} · ${x.status}` }))} />
          <SelectInput label="To" value={b} onChange={setB} options={sc.versions.map((x) => ({ value: String(x.version), label: `v${x.version} · ${x.status}` }))} />
        </div>
        {diff.length ? (
          <table className="cfg-matrix"><thead><tr><th>Field</th><th>v{a}</th><th>v{b}</th></tr></thead><tbody>{diff.map((f) => <tr key={f.key} className={f.material ? "is-material" : ""}><td>{f.label}</td><td className="small">{String(f.before ?? "—")}</td><td className="small">{String(f.after ?? "—")}</td></tr>)}</tbody></table>
        ) : <p className="muted small">No differences.</p>}
      </Panel>
    </>
  );
}

/* ---------------- Performance scorecard ---------------- */

interface Line { key: string; label: string; accruals: number; members: number; points: number }
function PerformanceTab({ sc, v }: { sc: Scheme; v: SchemeView }) {
  const c = displayVersion(sc).config;
  const [from, setFrom] = useState(c.duration.start);
  const [to, setTo] = useState(c.duration.end < v.today ? c.duration.end : v.today);
  const [prog, setProg] = useState("all");
  const [branch, setBranch] = useState<string[]>([]);
  const [cat, setCat] = useState("all");
  const [comp, setComp] = useState("all");
  const [member, setMember] = useState("");
  const memberAllowed = v.can("members:view");
  const all = v.s.accruals.filter((a) => a.schemeId === sc.id);
  const rows = all.filter((a) => a.effectiveDate >= from && a.effectiveDate <= to && (prog === "all" || a.programme === prog) && (!branch.length || branch.includes(a.branchCode)) && (cat === "all" || a.categoryId === cat) && (comp === "all" || a.component === comp) && (!member || (memberAllowed && a.memberId === member)));
  const posted = rows.filter((a) => a.result === "credited" || a.result === "accrued");
  const pop = eligiblePopulation(v.mem, v.ms, c);
  const scope = skusInScope(v.ms, c.products);
  const brs = branchesInScope(c.eligibility.branchScope);
  const participating = new Set(v.s.txns.filter((t) => t.date >= from && t.date <= to && scope.has(t.skuId) && c.basic.programmes.includes(t.programme) && brs.has(t.branchCode)).map((t) => t.memberId));
  const qualified = new Set(posted.map((a) => a.memberId));
  const exp = exposureOf(v.s, sc, v.today);
  const group = (keyOf: (a: RewardAccrual) => string | null, label: (k: string) => string): Line[] => {
    const m = new Map<string, RewardAccrual[]>();
    posted.forEach((a) => { const k = keyOf(a) ?? "—"; m.set(k, [...(m.get(k) ?? []), a]); });
    return [...m.entries()].map(([k, xs]) => ({ key: k, label: k === "—" ? "Period rewards (not attributed to a SKU)" : label(k), accruals: xs.length, members: new Set(xs.map((x) => x.memberId)).size, points: xs.reduce((n, x) => n + x.points, 0) })).sort((a, b) => b.points - a.points);
  };
  const byComp = group((a) => a.component, (k) => COMPONENT_LABEL[k as keyof typeof COMPONENT_LABEL]);
  const byCat = group((a) => a.categoryId, (k) => categoryById(v.ms, k)?.name ?? k);
  const bySub = group((a) => (a.skuId ? skuCategory(v.ms, a.skuId).subCategoryId : null), (k) => subById(v.ms, k)?.name ?? k);
  const bySku = group((a) => a.skuId, (k) => skuById(v.ms, k)?.code ?? k);
  const byBranch = group((a) => a.branchCode, (k) => findBranch(k)?.branch.name ?? k);
  const byProg = group((a) => a.programme, (k) => k);
  const bySlab = group((a) => (a.component === "slab" || a.component === "milestone" ? `${a.component}:${a.ruleId}` : null), (k) => { const [cmp, id] = k.split(":"); return cmp === "slab" ? `Slab ${c.slab.slabs.find((x) => x.id === id)?.name ?? id}` : (c.milestone.levels.find((x) => x.id === id)?.name ?? `Milestone ${id}`); }).filter((x) => x.key !== "—");
  const canExport = v.canOn("schemes", "export", c.basic.programmes);
  const cols = [{ header: "Dimension", value: (l: Line & { dim: string }) => l.dim }, { header: "Item", value: (l: Line & { dim: string }) => l.label }, { header: "Reward calculations", value: (l: Line & { dim: string }) => l.accruals }, { header: "Members", value: (l: Line & { dim: string }) => l.members }, ...(v.financial ? [{ header: "Points", value: (l: Line & { dim: string }) => l.points }] : [])];
  const exportRows = [...byComp.map((l) => ({ ...l, dim: "Component" })), ...bySlab.map((l) => ({ ...l, dim: "Slab / milestone" })), ...byCat.map((l) => ({ ...l, dim: "Category" })), ...bySub.map((l) => ({ ...l, dim: "Sub-category" })), ...bySku.map((l) => ({ ...l, dim: "SKU" })), ...byBranch.map((l) => ({ ...l, dim: "Branch" })), ...byProg.map((l) => ({ ...l, dim: "Programme" }))];
  const lineCols = (title: string): Column<Line>[] => [
    { key: "l", header: title, value: (l) => l.label },
    { key: "a", header: "Calculations", align: "right", value: (l) => l.accruals },
    { key: "m", header: "Members", align: "right", value: (l) => l.members },
    ...(v.financial ? [{ key: "p", header: "Points", align: "right" as const, value: (l: Line) => l.points, render: (l: Line) => <span className="num">{pts(l.points)}</span> }] : []),
  ];
  return (
    <>
      <Panel level={3} title="Filters" actions={canExport ? <div className="btn-row">{(["csv", "xls", "pdf"] as const).map((f) => <button key={f} type="button" className="btn btn--secondary btn--xs" onClick={() => exportReport(f, `${sc.id}-scorecard`, `${c.basic.name} · scorecard ${from} to ${to}`, cols, exportRows)}>{f === "pdf" ? <FileDown size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}{f === "csv" ? "CSV" : f === "xls" ? "Excel" : "PDF"}</button>)}</div> : <span className="small muted">Export needs Scheme builder: Export</span>}>
        <div className="form-grid form-grid--4">
          <TextField label="From" type="date" value={from} onChange={setFrom} />
          <TextField label="To" type="date" value={to} onChange={setTo} />
          <SelectInput label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All" }, ...c.basic.programmes.map((p) => ({ value: p, label: p }))]} />
          <SelectInput label="Component" value={comp} onChange={setComp} options={[{ value: "all", label: "All" }, ...activeComponents(c).map((k) => ({ value: k, label: COMPONENT_LABEL[k] }))]} />
          <SelectInput label="Category" value={cat} onChange={setCat} options={[{ value: "all", label: "All" }, ...c.products.categoryIds.map((k) => ({ value: k, label: categoryById(v.ms, k)?.name ?? k }))]} />
          <MultiSelect label="Branches" options={branchOptions((b) => brs.has(b))} value={branch} onChange={setBranch} />
          <TextField label="Member ID" value={member} onChange={(x) => setMember(x.trim().toUpperCase())} disabled={!memberAllowed} hint={memberAllowed ? "Exact Member ID" : "Needs Member management: View"} />
        </div>
        <p className="small muted">Exports contain only rows in your scope; point columns appear only with View financial exposure.</p>
      </Panel>
      <div className="grid-3">
        <Panel level={3} title="Participation">
          <KV rows={[["Eligible members", pop.count != null ? String(pop.count) : `${pop.lowerBound}+ (partly not computable)`], ["Participating members", `${participating.size} (scanned in scope)`], ["Qualified members", `${qualified.size} (earned a reward)`]]} />
          <p className="small muted">Eligible, participating and qualified are separate measures.</p>
        </Panel>
        <Panel level={3} title="Rewards">
          {v.financial ? <KV rows={[["Reward accrued", `${pts(posted.reduce((n, a) => n + a.points, 0))} points`], ["Reward credited (redeemable)", `${pts(posted.filter((a) => a.bucket === "redeemable").reduce((n, a) => n + a.points, 0) + exp.released)} points`], ["Reward settled (released)", `${pts(exp.released)} points`], ["Unsettled scheme points", `${pts(exp.unsettled)} points`], ["Duplicates refused", String(rows.filter((a) => a.result === "rejected_duplicate").length)], ["Budget refusals / exclusions", `${rows.filter((a) => a.result === "rejected_budget").length} / ${rows.filter((a) => a.result === "excluded").length}`]]} /> : <NoFinancial />}
        </Panel>
        <Panel level={3} title="Financial performance">
          {v.financial ? <KV rows={[["Budget", `${pts(exp.budget)} points`], ["Exposure (consumed)", `${pts(exp.consumed)} points`], ["Projected liability", <span>Pending formula · <DecisionRef id="OP-SB-LIAB" /></span>], ["Actual liability", `${pts(exp.consumed)} points · rupee valuation not configured`], ["Burn rate", `${pts(exp.burnRatePerDay)} points / day`], ["Remaining exposure", `${pts(exp.remaining)} points`]]} /> : <NoFinancial />}
        </Panel>
      </div>
      <div className="grid-2">
        <Panel level={3} title="By scheme component" padded={false}><DataTable rows={byComp} rowKey={(l) => l.key} caption="Component performance" searchable={false} columns={lineCols("Component")} emptyTitle="No rewards in this filter" /></Panel>
        <Panel level={3} title="By slab and milestone" padded={false}><DataTable rows={bySlab} rowKey={(l) => l.key} caption="Slab and milestone performance" searchable={false} columns={lineCols("Slab / milestone")} emptyTitle="No slab or milestone rewards" /></Panel>
      </div>
      <div className="grid-3">
        <Panel level={3} title="By category"><RankedBars items={byCat.map((l) => ({ key: l.key, label: l.label, value: v.financial ? l.points : l.accruals }))} /></Panel>
        <Panel level={3} title="By programme"><RankedBars items={byProg.map((l) => ({ key: l.key, label: l.label, value: v.financial ? l.points : l.accruals }))} /></Panel>
        <Panel level={3} title="By branch"><RankedBars items={byBranch.slice(0, 8).map((l) => ({ key: l.key, label: l.label, value: v.financial ? l.points : l.accruals }))} /></Panel>
      </div>
      <div className="grid-2">
        <Panel level={3} title="By sub-category" padded={false}><DataTable rows={bySub} rowKey={(l) => l.key} caption="Sub-category performance" searchable={false} pageSize={6} columns={lineCols("Sub-category")} /></Panel>
        <Panel level={3} title="By SKU" padded={false}><DataTable rows={bySku} rowKey={(l) => l.key} caption="SKU performance" searchable={false} pageSize={6} columns={lineCols("SKU")} /></Panel>
      </div>
      <Panel level={3} title="Baseline comparison">
        {c.growth.enabled ? <Notice tone="warn">Baseline {c.growth.baselineFrom} to {c.growth.baselineTo} vs comparison {c.growth.comparisonFrom} to {c.growth.comparisonTo}. Growth calculation is pending <DecisionRef id="OP-01" />; no growth figure is shown.</Notice> : <p className="muted small">No baseline period is configured for this scheme, so no baseline comparison is shown.</p>}
      </Panel>
    </>
  );
}

/* ---------------- Budget & exposure ---------------- */

function BudgetTab({ sc, v }: { sc: Scheme; v: SchemeView }) {
  if (!v.financial && !v.canOn("scheme-budget", "view", displayVersion(sc).config.basic.programmes)) return <NoFinancial />;
  const e = exposureOf(v.s, sc, v.today);
  const c = displayVersion(sc).config;
  return (
    <>
      <div className="grid-2">
        <Panel level={3} title="Financial exposure and budget" subtitle="Each measure is shown separately; none is merged into one number">
          <KV rows={[
            ["1 · Configured budget", `${pts(e.budget)} points${c.budget.autoStop ? " · auto-stop on" : ""}`],
            ["2 · Projected liability", <span>Pending business formula · <DecisionRef id="OP-SB-LIAB" /></span>],
            ["3 · Actual accrued reward liability", `${pts(e.consumed)} points`],
            ["4 · Actual points credited (redeemable)", `${pts(e.baseCredited + e.released)} points`],
            ["5 · Unsettled scheme points", `${pts(e.unsettled)} points`],
            ["6 · Points released", `${pts(e.released)} points`],
            ["7 · Remaining budget", `${pts(e.remaining)} points`],
            ["8 · Budget burn rate", `${pts(e.burnRatePerDay)} points / day`],
            ["9 · Exposure from backdated calculation", `${pts(e.backdatedExposure)} points`],
            ["10 · Exposure from special-member extensions", `${pts(e.extensionExposure)} points`],
            ["Utilisation", `${Math.round(e.utilisation * 100)}%${e.exhausted ? " · exhausted" : e.nearExhaustion ? " · at alert level" : ""}`],
            ["Reversed (pending formula)", `${v.s.accruals.filter((a) => a.schemeId === sc.id && a.result === "reversal_pending").length} linked reversal(s) pending`],
          ]} />
          <p className="small muted">Points only; rupee valuation is a financial configuration outside this module. The mock engine's budget control is not production-safe concurrent enforcement.</p>
        </Panel>
        <div>
          <Panel level={3} title="11 · Exposure by programme"><RankedBars items={e.byProgramme.map((x) => ({ key: x.key, label: x.key, value: x.value }))} /></Panel>
          <Panel level={3} title="13 · Exposure by reward component"><RankedBars items={e.byComponent.map((x) => ({ key: x.key, label: COMPONENT_LABEL[x.key as keyof typeof COMPONENT_LABEL] ?? x.key, value: x.value }))} /></Panel>
        </div>
      </div>
      <Panel level={3} title="12 · Exposure by branch"><RankedBars items={e.byBranch.slice(0, 12).map((x) => ({ key: x.key, label: findBranch(x.key)?.branch.name ?? x.key, value: x.value }))} /></Panel>
    </>
  );
}

function BudgetDrawer({ open, sc, v, onClose, run }: { open: boolean; sc: Scheme; v: SchemeView; onClose: () => void; run: (r: Res, ok?: string) => unknown }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Drawer open={open} onClose={onClose} title={`Change budget · ${sc.id}`} subtitle="Creates a new version routed to WF-014 (V-Guard, then Finance). The new budget applies after approval and activation" footer={<button type="button" className="btn btn--primary" onClick={() => { const r = requestBudgetChange(v.uid, sc.id, amount ? Number(amount) : null, reason); run(r, "Budget change submitted"); if (r.ok) onClose(); }}>Submit budget change</button>}>
      <p className="small">Current budget: {v.financial ? pts(displayVersion(sc).config.budget.amount) : "Restricted"} points</p>
      <TextField label="New budget (points)" value={amount} onChange={setAmount} inputMode="numeric" />
      <TextArea label="Reason" value={reason} onChange={setReason} />
    </Drawer>
  );
}

/* ---------------- Scheme settlement ---------------- */

function SchemeSettlementTab({ sc, v, run }: { sc: Scheme; v: SchemeView; run: (r: Res, ok?: string) => unknown }) {
  const c = displayVersion(sc).config;
  const [tranche, setTranche] = useState(c.settlement.tranches[0].id);
  const [from, setFrom] = useState(c.duration.start);
  const [to, setTo] = useState(c.duration.end < v.today ? c.duration.end : v.today);
  const [fail, setFail] = useState(false);
  const p = settlementPreview(v.s, sc, tranche, from, to, v.today);
  const reqs = v.s.settlements.filter((x) => x.schemeId === sc.id);
  const rel = v.s.releases.filter((x) => x.schemeId === sc.id);
  return (
    <>
      <Notice tone="info">Base Points are credited redeemable and are not part of settlement. Scheme / milestone points stay unsettled until a settlement request passes its checks and two-level approval. Settlement status: <strong>{sc.settlementStatus.replace(/_/g, " ")}</strong>.</Notice>
      <div className="grid-2">
        <Panel level={3} title="Settlement configuration">
          <KV rows={c.settlement.tranches.map((t) => [t.label, `${t.pct}% · ${t.trigger.replace(/_/g, " ")} · ${t.conditions || "—"}`])} />
        </Panel>
        <Panel level={3} title="Request a settlement release">
          <div className="form-grid form-grid--3">
            <SelectInput label="Tranche" value={tranche} onChange={setTranche} options={c.settlement.tranches.map((t) => ({ value: t.id, label: `${t.label} (${t.pct}%)` }))} />
            <TextField label="Earned from" type="date" value={from} onChange={setFrom} />
            <TextField label="Earned to" type="date" value={to} onChange={setTo} />
          </div>
          <ul className="checks">{p.checks.map((ch) => <li key={ch.label} className={ch.ok ? "is-ok" : "is-bad"}>{ch.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <ShieldAlert size={14} aria-hidden="true" />} <strong>{ch.label}</strong> · {ch.detail}</li>)}</ul>
          {v.financial && <p className="small">Release {pts(p.releasePoints)} of {pts(p.unsettled)} unsettled ({p.releasePct}%); held {pts(p.heldPoints)}{p.residual ? ` incl. ${p.residual} fractional points held (rounding not configured, SCH-Q3)` : ""}.</p>}
          {v.canOn("scheme-settlement", "create", c.basic.programmes) ? (
            <>
              <Checkbox label="Development only: make the mock ledger adapter fail the first execution" checked={fail} onChange={setFail} />
              <button type="button" className="btn btn--primary btn--sm" onClick={() => run(createSettlementRequest(v.uid, sc.id, tranche, from, to, fail), "Settlement request submitted for two-level approval")}>Submit settlement request</button>
            </>
          ) : <p className="small muted">Needs Scheme settlement: Create and Submit.</p>}
        </Panel>
      </div>
      <SettlementRequestsTable rows={reqs} v={v} />
      <ReleasesTable rows={rel} v={v} />
    </>
  );
}

export function SettlementRequestsTable({ rows, v }: { rows: SettlementRequest[]; v: SchemeView }) {
  const req = (id: string | null) => (id ? v.approvals.requests.find((r) => r.id === id) : undefined);
  return (
    <Panel level={3} title="Settlement requests" padded={false}>
      <DataTable rows={rows} rowKey={(r) => r.id} caption="Settlement requests" initialSort={{ key: "at", dir: "desc" }} emptyTitle="No settlement requests" columns={[
        { key: "id", header: "Request", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
        { key: "s", header: "Scheme", value: (r) => r.schemeId, render: (r) => schemeLink(r.schemeId) },
        { key: "t", header: "Tranche", value: (r) => r.trancheLabel },
        { key: "range", header: "Earned range", value: (r) => r.earnedFrom, render: (r) => <span className="small num">{r.earnedFrom} → {r.earnedTo}</span> },
        { key: "rel", header: "Release", align: "right", value: (r) => r.releasePoints, render: (r) => <span className="num">{v.financial ? `${pts(r.releasePoints)} (${r.releasePct}%)` : "•••"}</span> },
        { key: "held", header: "Held", align: "right", value: (r) => r.heldPoints, render: (r) => <span className="num">{v.financial ? pts(r.heldPoints) : "•••"}</span> },
        { key: "st", header: "Status", value: (r) => r.status, render: (r) => <RecordStatus status={r.status} /> },
        { key: "ap", header: "Two-level approval", value: (r) => r.approvalRequestId ?? "", render: (r) => <ApprovalLink request={req(r.approvalRequestId)} /> },
        { key: "at", header: "Requested", value: (r) => r.createdAt, render: (r) => <span className="small">{formatDateTime(r.createdAt)}</span> },
      ] as Column<SettlementRequest>[]} />
    </Panel>
  );
}

export function ReleasesTable({ rows, v }: { rows: SchemeView["s"]["releases"]; v: SchemeView }) {
  return (
    <Panel level={3} title="Settlement history" subtitle="Each release is a distinct Settlement Release ledger / passbook entry" padded={false}>
      <DataTable rows={rows} rowKey={(r) => r.id} caption="Settlement releases" initialSort={{ key: "at", dir: "desc" }} emptyTitle="Nothing released yet" exportName={v.can("scheme-settlement:export") ? "settlement-history" : undefined} columns={[
        { key: "id", header: "Release", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
        { key: "s", header: "Scheme", value: (r) => r.schemeId, render: (r) => schemeLink(r.schemeId) },
        { key: "range", header: "Earned range", value: (r) => `${r.earnedFrom} → ${r.earnedTo}` },
        { key: "at", header: "Settled", value: (r) => r.settledAt, render: (r) => <span className="small">{formatDateTime(r.settledAt)}</span> },
        { key: "rel", header: "Released", align: "right", value: (r) => r.releasedPoints, render: (r) => <span className="num">{v.financial ? pts(r.releasedPoints) : "•••"}</span> },
        { key: "held", header: "Held", align: "right", value: (r) => r.heldPoints, render: (r) => <span className="num">{v.financial ? pts(r.heldPoints) : "•••"}</span> },
        { key: "ap", header: "Approvers", value: (r) => r.approvers.map((a) => userLabel(v.acc, a)).join(" → ") },
        { key: "ref", header: "Approval", value: (r) => r.approvalRef, render: (r) => r.approvalRef ? <Link to={`/governance/approvals/request/${r.approvalRef}`} className="mono small">{r.approvalRef}</Link> : "—" },
        { key: "l", header: "Ledger", value: (r) => r.ledgerRef, render: (r) => <span className="mono small">{r.ledgerRef}</span> },
        { key: "pb", header: "Passbook entry", value: (r) => r.passbookLabel, render: (r) => <span className="small cell-wrap">{r.passbookLabel}</span> },
      ] as Column<SchemeView["s"]["releases"][number]>[]} />
    </Panel>
  );
}

/* ---------------- Extensions & backdated ---------------- */

function ExtensionsTab({ sc, v, run, open }: { sc: Scheme; v: SchemeView; run: (r: Res, ok?: string) => unknown; open: (d: "backdated" | "extension") => void }) {
  const c = displayVersion(sc).config;
  const ext = v.s.extensions.filter((e) => e.schemeId === sc.id);
  const req = (id: string | null) => (id ? v.approvals.requests.find((r) => r.id === id) : undefined);
  return (
    <>
      <Panel level={3} title="Backdated calculation" subtitle="Component 15 · announced after the effective date">
        {c.backdated.enabled ? (
          <>
            <KV rows={[["Announcement date", c.backdated.announcementDate], ["Effective start / end", `${c.duration.start} / ${c.duration.end}`], ["Eligible historical period", `${c.backdated.historicalFrom} to ${c.backdated.historicalTo}`], ["Historical data availability", sc.backdated.dataAvailability.replace("_", " ")], ["Status", <RecordStatus status={sc.backdated.status} />], ["Estimated exposure", "Not available: OP-SB-LIAB"], ["Approval reference", <ApprovalLink request={req(sc.backdated.requestId)} />], ["Executions", sc.backdated.runs.length ? sc.backdated.runs.map((r) => `${formatDateTime(r.at)}: ${r.processed} evaluated, ${r.credited} credited (${pts(r.points)} pts), ${r.duplicates} duplicates refused`).join(" · ") : "None"]]} />
            <div className="btn-row">
              {["not_requested", "rejected"].includes(sc.backdated.status) && v.canOn("scheme-budget", "submit", c.basic.programmes) && <button type="button" className="btn btn--secondary btn--sm" onClick={() => open("backdated")}><Timer size={14} aria-hidden="true" />Request backdated calculation</button>}
              {["approved", "completed"].includes(sc.backdated.status) && v.can("schemes:activate") && <button type="button" className="btn btn--dark btn--sm" onClick={() => run(runBackdated(v.uid, sc.id), "Backdated run completed")}><Play size={14} aria-hidden="true" />{sc.backdated.status === "completed" ? "Re-run (idempotent)" : "Run approved calculation"}</button>}
            </div>
          </>
        ) : <p className="muted small">This scheme version has no backdated calculation.</p>}
      </Panel>
      <Panel level={3} title="Special-member extensions" subtitle="Separate, approved changes; the scheme configuration version is not modified" actions={["active", "approved", "scheduled"].includes(sc.status) && v.canOn("schemes", "submit", c.basic.programmes) && <button type="button" className="btn btn--secondary btn--sm" onClick={() => open("extension")}><PlusCircle size={14} aria-hidden="true" />Request extension</button>} padded={false}>
        <DataTable rows={ext} rowKey={(e) => e.id} caption="Extensions" searchable={false} emptyTitle="No extensions" columns={[
          { key: "id", header: "Extension", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
          { key: "k", header: "Kind", value: (e) => e.kind },
          { key: "t", header: "Members / branches", value: (e) => [...e.memberIds, ...e.branchCodes].join(", "), render: (e) => <span className="small">{[...e.memberIds, ...e.branchCodes.map((b) => findBranch(b)?.branch.name ?? b)].join(", ")}</span> },
          { key: "v", header: "Base version", value: (e) => e.baseVersion, render: (e) => `v${e.baseVersion}` },
          { key: "f", header: "From", value: (e) => e.effectiveFrom },
          { key: "r", header: "Reason", value: (e) => e.reason, render: (e) => <span className="small cell-wrap">{e.reason}</span> },
          { key: "st", header: "Status", value: (e) => e.status, render: (e) => <RecordStatus status={e.status} /> },
          { key: "ap", header: "Approval", value: (e) => e.approvalRequestId ?? "", render: (e) => <ApprovalLink request={req(e.approvalRequestId)} /> },
        ] as Column<(typeof ext)[number]>[]} />
      </Panel>
      <p className="small muted">Extensions reach the member app through the integration contract (GET /members/&#123;id&#125;/scheme-progress, prepared, not connected).</p>
    </>
  );
}

function ExtensionDrawer({ open, sc, v, onClose, run }: { open: boolean; sc: Scheme; v: SchemeView; onClose: () => void; run: (r: Res, ok?: string) => unknown }) {
  const c = displayVersion(sc).config;
  const [kind, setKind] = useState<"member" | "members" | "branch">("member");
  const [members, setMembers] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState(v.today);
  const submit = () => { const r = requestExtension(v.uid, sc.id, { kind, memberIds: kind === "branch" ? [] : members, branchCodes: kind === "branch" ? branches : [], reason, effectiveFrom: from }); run(r, "Extension submitted"); if (r.ok) onClose(); };
  return (
    <Drawer open={open} onClose={onClose} title={`Special-member extension · ${sc.id}`} subtitle="Routed to the Approval Centre (WF-002)" footer={<button type="button" className="btn btn--primary" onClick={submit}>Submit extension</button>}>
      <SelectInput label="Extend to" value={kind} onChange={(x) => setKind(x as typeof kind)} options={[{ value: "member", label: "One selected member" }, { value: "members", label: "Multiple selected members" }, { value: "branch", label: "A selected branch" }]} />
      {kind === "branch" ? <MultiSelect label="Branch" options={branchOptions()} value={branches} onChange={setBranches} /> : <MultiSelect label={kind === "member" ? "Member" : "Members"} options={v.mem.members.filter((m) => c.basic.programmes.includes(m.programme)).map((m) => ({ value: m.id, label: `${m.id} · ${m.name}`, group: m.programme }))} value={members} onChange={(x) => setMembers(kind === "member" ? x.slice(-1) : x)} />}
      <TextField label="Effective from" type="date" value={from} onChange={setFrom} />
      <TextArea label="Reason" value={reason} onChange={setReason} />
    </Drawer>
  );
}

/* ---------------- Concurrency & exclusivity ---------------- */

function ConcurrencyTab({ sc, v, open }: { sc: Scheme; v: SchemeView; open: (d: "exclusivity") => void }) {
  const c = displayVersion(sc).config;
  const ov = overlappingSchemes(v.s, v.ms, sc.id, c);
  const rules = v.s.exclusivity.filter((r) => r.schemeA === sc.id || r.schemeB === sc.id);
  const conflicts = exclusivityConflicts(v.s).filter((x) => x.schemes.includes(sc.id));
  const req = (id: string | null) => (id ? v.approvals.requests.find((r) => r.id === id) : undefined);
  return (
    <>
      <Notice tone="info">Schemes are <strong>inclusive by default</strong>: a member can qualify for several schemes unless an approved exclusivity rule says otherwise. No scheme is made exclusive silently.</Notice>
      {conflicts.map((x) => <Notice key={x.message} tone="danger">Unresolved exclusivity conflict: {x.message}</Notice>)}
      <Panel level={3} title="Overlapping schemes" subtitle="Same programme, period, products and branches" padded={false}>
        <DataTable rows={ov} rowKey={(o) => o.id} caption="Overlapping schemes" searchable={false} emptyTitle="No overlapping scheme" columns={[
          { key: "id", header: "Scheme", value: (o) => o.name, render: (o) => schemeLink(o.id, o.name) },
          { key: "st", header: "Status", value: (o) => o.status, render: (o) => <SchemeStatusBadge status={o.status} /> },
          { key: "rel", header: "Relationship", value: (o) => o.relation, render: (o) => <strong className={o.exclusivityId ? "warn-text" : ""}>{o.relation}</strong> },
        ] as Column<(typeof ov)[number]>[]} />
      </Panel>
      <Panel level={3} title="Exclusivity rules" actions={v.canOn("schemes", "submit", c.basic.programmes) && <button type="button" className="btn btn--secondary btn--sm" onClick={() => open("exclusivity")}><PlusCircle size={14} aria-hidden="true" />Add exclusivity rule</button>} padded={false}>
        <DataTable rows={rules} rowKey={(r) => r.id} caption="Exclusivity rules" searchable={false} emptyTitle="No exclusivity rule: inclusive" columns={[
          { key: "id", header: "Rule", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "a", header: "Scheme A", value: (r) => r.schemeA, render: (r) => schemeLink(r.schemeA) },
          { key: "b", header: "Scheme B", value: (r) => r.schemeB, render: (r) => schemeLink(r.schemeB) },
          { key: "p", header: "Programme", value: (r) => r.programmes.join(", ") || "All" },
          { key: "per", header: "Effective", value: (r) => `${r.from} → ${r.to}` },
          { key: "d", header: "Conflict prevented", value: (r) => r.description, render: (r) => <span className="small cell-wrap">{r.description}</span> },
          { key: "st", header: "Status", value: (r) => r.status, render: (r) => <RecordStatus status={r.status} /> },
          { key: "ap", header: "Approval", value: (r) => r.approvalRequestId ?? "", render: (r) => <ApprovalLink request={req(r.approvalRequestId)} /> },
        ] as Column<(typeof rules)[number]>[]} />
      </Panel>
    </>
  );
}

function ExclusivityDrawer({ open, sc, v, onClose, run }: { open: boolean; sc: Scheme; v: SchemeView; onClose: () => void; run: (r: Res, ok?: string) => unknown }) {
  const c = displayVersion(sc).config;
  const [other, setOther] = useState("");
  const [from, setFrom] = useState(c.duration.start);
  const [to, setTo] = useState(c.duration.end);
  const [desc, setDesc] = useState("");
  const options = v.visible.filter((x) => x.id !== sc.id && ["active", "approved", "scheduled", "pending_approval"].includes(x.status)).map((x) => ({ value: x.id, label: `${x.id} · ${displayVersion(x).config.basic.name}` }));
  return (
    <Drawer open={open} onClose={onClose} title={`Exclusivity rule · ${sc.id}`} subtitle="Routed to the Approval Centre; inclusive until approved" footer={<button type="button" className="btn btn--primary" onClick={() => { const r = requestExclusivity(v.uid, { schemeA: sc.id, schemeB: other, programmes: c.basic.programmes, from, to, description: desc }); run(r, "Exclusivity rule submitted"); if (r.ok) onClose(); }}>Submit rule</button>}>
      <SelectInput label="Mutually exclusive with" value={other} onChange={setOther} options={[{ value: "", label: "Select a scheme" }, ...options]} />
      <TextField label="From" type="date" value={from} onChange={setFrom} />
      <TextField label="To" type="date" value={to} onChange={setTo} />
      <TextArea label="Conflict this rule prevents" value={desc} onChange={setDesc} />
    </Drawer>
  );
}

/* ---------------- Audit ---------------- */

export function SchemeAuditTable({ rows, v, name }: { rows: SchemeAuditEvent[]; v: SchemeView; name: string }) {
  const req = (id: string | null) => (id ? v.approvals.requests.find((r) => r.id === id) : undefined);
  return (
    <Panel level={3} title="Audit trail" subtitle="Append-only; not editable through any portal action" padded={false}>
      <DataTable rows={rows} rowKey={(e) => e.id} caption="Scheme audit" initialSort={{ key: "at", dir: "desc" }} exportName={v.can("schemes:export") ? name : undefined} pageSize={15} columns={[
        { key: "ref", header: "Reference", value: (e) => e.ref, render: (e) => <span className="mono small">{e.ref}</span> },
        { key: "ent", header: "Record", value: (e) => `${e.entity} ${e.entityId}`, render: (e) => <span className="small">{e.entity} · <span className="mono">{e.entityId}</span>{e.schemeVersion != null ? ` v${e.schemeVersion}` : ""}</span> },
        { key: "f", header: "Field", value: (e) => e.field },
        { key: "o", header: "Old value", value: (e) => e.oldValue, render: (e) => <span className="small cell-wrap">{e.oldValue ?? "—"}</span> },
        { key: "n", header: "New value", value: (e) => e.newValue, render: (e) => <span className="small cell-wrap">{e.newValue ?? "—"}</span> },
        { key: "by", header: "Changed by", value: (e) => userLabel(v.acc, e.by), render: (e) => <span className="small">{userLabel(v.acc, e.by)}{e.orgId ? ` · ${v.acc.organisations.find((o) => o.id === e.orgId)?.code ?? ""}` : ""}</span> },
        { key: "at", header: "Time", value: (e) => e.at, render: (e) => <span className="small num">{formatDateTime(e.at)}</span> },
        { key: "t", header: "Change type", value: (e) => e.changeType, render: (e) => <span className="small">{e.changeType.replace(/_/g, " ")}</span> },
        { key: "r", header: "Reason", value: (e) => e.reason, render: (e) => <span className="small cell-wrap">{e.reason || "—"}</span> },
        { key: "ap", header: "Approval", value: (e) => e.approvalRequestId ?? "", render: (e) => <ApprovalLink request={req(e.approvalRequestId)} /> },
      ] as Column<SchemeAuditEvent>[]} />
    </Panel>
  );
}

/* ---------------- Ledger & simulator ---------------- */

function LedgerTab({ sc, v, run }: { sc: Scheme; v: SchemeView; run: (r: Res, ok?: string) => unknown }) {
  const c = displayVersion(sc).config;
  const scope = useMemo(() => [...skusInScope(v.ms, c.products)], [v.ms, c.products]);
  const members = v.mem.members.filter((m) => c.basic.programmes.includes(m.programme));
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [skuId, setSkuId] = useState(scope[0] ?? "");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(v.today);
  const [txnId, setTxnId] = useState("");
  const [kind, setKind] = useState<"scan" | "sales_return">("scan");
  const [orig, setOrig] = useState("");
  const [trace, setTrace] = useState<{ schemeId: string; result: string }[] | null>(null);
  const rows = v.s.accruals.filter((a) => a.schemeId === sc.id);
  const operator = v.can("schemes:activate");
  return (
    <>
      <Notice tone="warn">Development mock engine. Production calculation belongs to the backend scheme engine; nothing here posts to a V-Guard wallet or ledger.</Notice>
      {operator && (
        <Panel level={3} title="Rule evaluation simulator" subtitle="Feeds one transaction through the mock adapter (all active schemes are evaluated; inclusive unless exclusive)" actions={<button type="button" className="btn btn--ghost btn--sm" onClick={() => run(runPeriodNow(v.uid, sc.id), "Period evaluation run")}><FlaskConical size={14} aria-hidden="true" />Run period evaluation now</button>}>
          <div className="form-grid form-grid--4">
            <SelectInput label="Member" value={memberId} onChange={setMemberId} options={members.map((m) => ({ value: m.id, label: `${m.id} · ${findBranch(m.branchCode)?.branch.name ?? m.branchCode}` }))} />
            <SelectInput label="SKU" value={skuId} onChange={setSkuId} options={v.ms.skus.filter((k) => k.status === "active").map((k) => ({ value: k.id, label: `${k.code}${scope.includes(k.id) ? "" : " (outside scope)"}` }))} />
            <TextField label="Quantity" value={qty} onChange={setQty} inputMode="numeric" />
            <TextField label="Date" type="date" value={date} onChange={setDate} />
            <SelectInput label="Kind" value={kind} onChange={(x) => setKind(x as typeof kind)} options={[{ value: "scan", label: "Scan (qualifying)" }, { value: "sales_return", label: "Sales return" }]} />
            {kind === "sales_return" && <TextField label="Original transaction ID" value={orig} onChange={setOrig} />}
            <TextField label="Transaction ID (optional)" value={txnId} onChange={setTxnId} hint="Reuse an ID to simulate a duplicate submission" />
          </div>
          <button type="button" className="btn btn--dark btn--sm" onClick={() => { const r = postMockTransaction(v.uid, { id: txnId.trim() || undefined, memberId, skuId, qty: Number(qty), date, kind, originalTxnId: orig || null }); run(r, `Evaluated ${r.id}`); setTrace(r.trace ?? null); }}><Play size={14} aria-hidden="true" />Evaluate transaction</button>
          {trace && <ul className="trace">{trace.map((t) => <li key={t.schemeId}><span className="mono small">{t.schemeId}</span> · {t.result}</li>)}</ul>}
        </Panel>
      )}
      <Panel level={3} title="Reward calculations (traceable)" subtitle="Every row carries rule, rule version, scheme version, source transaction and ledger reference" padded={false}>
        <DataTable rows={rows} rowKey={(a) => a.id} caption="Scheme ledger" initialSort={{ key: "calc", dir: "desc" }} pageSize={12} exportName={v.can("schemes:export") ? `${sc.id}-ledger` : undefined} columns={[
          { key: "id", header: "Calculation", value: (a) => a.id, render: (a) => <span className="mono small">{a.id}</span> },
          { key: "src", header: "Source", value: (a) => a.sourceRef, render: (a) => <span className="mono small">{a.sourceRef}</span> },
          { key: "m", header: "Member", value: (a) => a.memberId, render: (a) => <span className="mono small">{a.memberId}</span> },
          { key: "c", header: "Component · rule", value: (a) => `${a.component} ${a.ruleId}`, render: (a) => <span className="small">{COMPONENT_LABEL[a.component]} · {a.ruleId}</span> },
          { key: "v", header: "Version", value: (a) => `v${a.schemeVersion} ${a.ruleVersion}`, render: (a) => <span className="small mono">v{a.schemeVersion} · {a.ruleVersion}</span> },
          { key: "sku", header: "SKU · branch", value: (a) => `${a.skuId ?? ""} ${a.branchCode}`, render: (a) => <span className="small">{a.skuId ? skuById(v.ms, a.skuId)?.code : "—"} · {findBranch(a.branchCode)?.branch.name ?? a.branchCode}</span> },
          { key: "eff", header: "Effective", value: (a) => a.effectiveDate, render: (a) => <span className="small num">{a.effectiveDate}</span> },
          { key: "calc", header: "Calculated", value: (a) => a.calculatedAt, render: (a) => <span className="small num">{formatDateTime(a.calculatedAt)}</span> },
          { key: "r", header: "Result", value: (a) => a.result, render: (a) => <RecordStatus status={a.result} /> },
          { key: "p", header: "Points", align: "right", value: (a) => a.points, render: (a) => <span className="num">{v.financial ? pts(a.points) : "•••"}</span> },
          { key: "b", header: "Bucket", value: (a) => a.bucket },
          { key: "l", header: "Ledger · reversal", value: (a) => `${a.ledgerRef ?? ""} ${a.reversalRef ?? ""}`, render: (a) => <span className="mono small">{a.ledgerRef ?? "—"}{a.reversalOf ? ` · reverses ${a.reversalOf} (${a.reversalRef})` : ""}</span> },
          { key: "n", header: "Explanation", value: (a) => a.note, render: (a) => <span className="small cell-wrap">{a.note}</span> },
        ] as Column<RewardAccrual>[]} />
      </Panel>
      <p className="small muted">Targeting on {c.targeting.filter((t) => !TARGET_DIMENSIONS[t.dimension].available).map((t) => TARGET_DIMENSIONS[t.dimension].label).join(", ") || "no unconnected dimension"} cannot be evaluated by the mock engine.</p>
    </>
  );
}

export type { SchemeVersion };
