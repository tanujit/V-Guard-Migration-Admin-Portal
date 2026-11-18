import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertOctagon, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock, FileClock, FlaskConical, Hourglass, LayoutDashboard, PauseCircle, PenLine, ScanLine, Send, ShieldAlert, SquareStack } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { DonutChart } from "@/components/charts/Charts";
import { RankedBars } from "@/components/ui/DataBars";
import { EmptyState, SelectField } from "@/components/ui/primitives";
import { MultiSelect, SelectInput, Stepper, TextArea, TextField } from "@/components/form/Form";
import { APPROVAL_STATUS, PENDING } from "@/config/approvalCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { CHART } from "@/lib/chartColors";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { hoursBetween } from "@/features/approvals/engine";
import { demoNow } from "@/features/approvals/store";
import { branchByCode, categoryById, describeBranches, outOfScope, pointsState, productOfSku, ruleState, skuById, subById, validateScanPoints, versionsOf, visibleByBranches, type ScanPointDraft } from "@/features/masters/engine";
import { saveScanPointDraft, submitScanPoints } from "@/features/masters/store";
import { formatDateTime } from "@/lib/format";
import type { ScanPointConfig } from "@/types/masters";
import { AccessDenied, PolicyMessages, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { MasterAuditTable } from "./OverviewPage";
import { ApprovalLink, branchOptions, ConfigBadge, KpiGrid, MastersLayout, useApprovalLookup, useMasterView, userName, ValidationList, VersionBadge } from "./shared";

export function ScanningLayout() {
  return (
    <MastersLayout
      title="Scanning configuration"
      description="Scan-In and Scan-Out points by SKU and branch, scan restriction rules and exception settings. Changes are activated only after approval"
      permission="scan-config:view"
      meta="Configuration only: the mobile QR scanning engine is not connected, and nothing here changes live scan behaviour"
      tabs={[
        { to: "/masters/scanning", end: true, label: "Dashboard", icon: LayoutDashboard },
        { to: "/masters/scanning/points", label: "Scan-In / Scan-Out points", icon: ScanLine },
        { to: "/masters/scanning/rules", label: "Restriction rules", icon: ShieldAlert },
        { to: "/masters/scanning/simulator", label: "Rule simulator", icon: FlaskConical },
        { to: "/masters/scanning/exceptions", label: "Error & exception settings", icon: AlertOctagon },
      ]}
    />
  );
}

/** Configurations and rules the signed-in user may see, by geographical scope. */
export function useScanVisibility() {
  const v = useMasterView();
  const points = v.s.scanPoints.filter((c) => visibleByBranches(v.acc, v.uid, "scan-config", c.branchCodes));
  const rules = v.s.rules.filter((r) => { const x = versionsOf(r.versions).latest; return visibleByBranches(v.acc, v.uid, "scan-config", x.scope.branchCodes, x.scope.allBranches); });
  return { ...v, points, rules };
}

export function ScanningDashboard() {
  const { points, rules, approvals } = useScanVisibility();
  const navigate = useNavigate();
  const now = demoNow();
  const states = [...points.map(pointsState), ...rules.map(ruleState)];
  const scanRequests = approvals.requests.filter((r) => r.module === "scan-config");
  const pendingReqs = scanRequests.filter((r) => [...PENDING, "returned"].includes(r.status));
  const activePoints = points.filter((c) => pointsState(c) === "active");
  const recent = [...points.map((c) => versionsOf(c.versions).latest.updatedAt), ...rules.map((r) => versionsOf(r.versions).latest.updatedAt)].filter((t) => hoursBetween(t, now) <= 24 * 7).length;
  const inOut = activePoints.reduce((acc, c) => { const a = versionsOf(c.versions).active!; const i = a.scanIn !== null && a.scanIn > 0; const o = a.scanOut !== null && a.scanOut > 0; acc[i && o ? "both" : i ? "in" : o ? "out" : "zero"]++; return acc; }, { both: 0, in: 0, out: 0, zero: 0 });
  const byProgramme = new Map<string, number>();
  activePoints.forEach((c) => c.programmes.forEach((p) => byProgramme.set(p, (byProgramme.get(p) ?? 0) + 1)));
  const byState = new Map<string, Set<string>>();
  activePoints.forEach((c) => c.branchCodes.forEach((b) => { const st = branchByCode.get(b)?.stateName ?? "?"; const set = byState.get(st) ?? new Set(); set.add(b); byState.set(st, set); }));
  return (
    <>
      <SectionTitle title="Scanning configuration dashboard" description="Scan point configurations and restriction rules within your geographical scope" />
      <KpiGrid items={[
        { id: "total", label: "Total scan configurations", value: states.length, desc: `${points.length} point configs · ${rules.length} rules`, variant: "dark", icon: SquareStack, onSelect: () => navigate("/masters/scanning/points") },
        { id: "active", label: "Active configurations", value: states.filter((x) => x === "active").length, desc: "In force", variant: "status", tone: "positive", icon: CheckCircle2, onSelect: () => navigate("/masters/scanning/points?state=active") },
        { id: "draft", label: "Draft configurations", value: states.filter((x) => x === "draft").length, desc: "Not yet submitted", variant: "light", icon: PenLine, onSelect: () => navigate("/masters/scanning/points?state=draft") },
        { id: "pending", label: "Pending approval", value: pendingReqs.length, desc: "Pending or returned in the Approval Centre", variant: "status", tone: "warning", icon: Hourglass, onSelect: () => navigate("/governance/approvals/all?status=pending") },
        { id: "approved", label: "Approved configurations", value: scanRequests.filter((r) => r.status === "approved").length, desc: "Approval requests approved", variant: "light", icon: ClipboardCheck, onSelect: () => navigate("/governance/approvals/approved") },
        { id: "inactive", label: "Inactive configurations", value: states.filter((x) => x === "inactive").length, desc: "Retired or deactivated", variant: "status", tone: "negative", icon: PauseCircle, onSelect: () => navigate("/masters/scanning/rules?state=inactive") },
        { id: "in", label: "Scan-In mappings", value: activePoints.filter((c) => versionsOf(c.versions).active!.scanIn !== null).length, desc: "Active configs with Scan-In points", variant: "primary", icon: ScanLine, onSelect: () => navigate("/masters/scanning/points?state=active") },
        { id: "out", label: "Scan-Out mappings", value: activePoints.filter((c) => versionsOf(c.versions).active!.scanOut !== null).length, desc: "Active configs with Scan-Out points", variant: "light", icon: ScanLine, onSelect: () => navigate("/masters/scanning/points?state=active") },
        { id: "rules", label: "Active restriction rules", value: rules.filter((r) => ruleState(r) === "active").length, desc: "Rules in force", variant: "light", icon: ShieldAlert, onSelect: () => navigate("/masters/scanning/rules?state=active") },
        { id: "recent", label: "Modified recently", value: recent, desc: "Changed in the last 7 days", variant: "light", icon: Clock, onSelect: () => navigate("/masters/audit") },
      ]} />
      <div className="grid-3">
        <Panel title="Configuration status" level={3}>
          <DonutChart items={(["active", "pending", "draft", "inactive"] as const).map((k) => ({ key: k, label: k === "pending" ? "Pending approval" : k[0].toUpperCase() + k.slice(1), value: states.filter((x) => x === k).length, color: { active: CHART.positive, pending: CHART.warning, draft: CHART.info, inactive: CHART.neutral }[k] })).filter((x) => x.value)} centerLabel="configs" ariaLabel="Configuration status" height={190} />
        </Panel>
        <Panel title="Scan-In versus Scan-Out" subtitle="Active point configurations with a value above zero" level={3}>
          <RankedBars items={[{ key: "both", label: "Scan-In and Scan-Out", value: inOut.both }, { key: "in", label: "Scan-In only", value: inOut.in }, { key: "out", label: "Scan-Out only", value: inOut.out }, { key: "zero", label: "Neither above zero", value: inOut.zero }]} />
        </Panel>
        <Panel title="By programme" subtitle="Active point configurations" level={3}>
          <RankedBars items={Array.from(byProgramme.entries()).map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value)} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Branch coverage by state" subtitle="Branches covered by an active point configuration" level={3}>
          <RankedBars items={Array.from(byState.entries()).map(([k, v]) => ({ key: k, label: k, value: v.size })).sort((a, b) => b.value - a.value)} />
        </Panel>
        <Panel title="Pending configuration approvals" level={3} padded={false}>
          {pendingReqs.length ? (
            <ul className="ref-list ref-list--pad">
              {pendingReqs.map((r) => <li key={r.id}><Link to={`/governance/approvals/request/${r.id}`} className="mono small">{r.id}</Link> · {r.title} · <span className="small">{APPROVAL_STATUS[r.status].label}</span></li>)}
            </ul>
          ) : <EmptyState title="Nothing pending" compact />}
        </Panel>
      </div>
    </>
  );
}

/* ---------------- Scan point configurations ---------------- */

export function ScanPointsPage() {
  const { points, s, can } = useScanVisibility();
  const lookup = useApprovalLookup();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const state = params.get("state") ?? "all";
  const rows = points.filter((c) => {
    const sku = skuById(s, c.skuId);
    const p = productOfSku(s, c.skuId);
    if (q && ![c.id, sku?.code, p?.name].join(" ").toLowerCase().includes(q.toLowerCase())) return false;
    if (st !== "all" && !c.branchCodes.some((b) => branchByCode.get(b)?.state === st)) return false;
    if (state !== "all" && pointsState(c) !== state) return false;
    return true;
  });
  const single = (c: ScanPointConfig, f: (b: (typeof branchByCode extends Map<string, infer V> ? V : never)) => string) => { const vals = Array.from(new Set(c.branchCodes.map((b) => f(branchByCode.get(b)!)))); return vals.length === 1 ? vals[0] : `${vals.length} ${f === stateOf ? "states" : "districts"}`; };
  const stateOf = (b: { stateName: string }) => b.stateName;
  const districtOf = (b: { districtName: string }) => b.districtName;
  const cols: Column<ScanPointConfig>[] = [
    { key: "id", header: "Configuration ID", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> },
    { key: "product", header: "Product", value: (c) => productOfSku(s, c.skuId)?.name ?? "", render: (c) => <span className="cell-wrap small">{productOfSku(s, c.skuId)?.name}</span> },
    { key: "sku", header: "SKU", value: (c) => skuById(s, c.skuId)?.code ?? "", render: (c) => <span className="mono small">{skuById(s, c.skuId)?.code}</span> },
    { key: "cat", header: "Category", value: (c) => categoryById(s, productOfSku(s, c.skuId)?.categoryId ?? "")?.name ?? "", render: (c) => <span className="small">{categoryById(s, productOfSku(s, c.skuId)?.categoryId ?? "")?.name}</span> },
    { key: "sub", header: "Sub-category", value: (c) => subById(s, productOfSku(s, c.skuId)?.subCategoryId ?? "")?.name ?? "", render: (c) => <span className="small">{subById(s, productOfSku(s, c.skuId)?.subCategoryId ?? "")?.name}</span> },
    { key: "prog", header: "Programme", value: (c) => c.programmes.join(", "), render: (c) => <span className="small">{c.programmes.join(", ") || "—"}</span> },
    { key: "state", header: "State", value: (c) => single(c, stateOf), render: (c) => <span className="small">{single(c, stateOf)}</span> },
    { key: "district", header: "District", value: (c) => single(c, districtOf), render: (c) => <span className="small">{single(c, districtOf)}</span> },
    { key: "branch", header: "Branch", value: (c) => c.branchCodes.length, render: (c) => <span className="small" title={describeBranches(c.branchCodes)}>{c.branchCodes.length === 1 ? branchByCode.get(c.branchCodes[0])?.name : `${c.branchCodes.length} branches`}</span> },
    { key: "in", header: "Scan-In", value: (c) => versionsOf(c.versions).active?.scanIn ?? -1, align: "right", render: (c) => <PointsCell c={c} side="scanIn" /> },
    { key: "out", header: "Scan-Out", value: (c) => versionsOf(c.versions).active?.scanOut ?? -1, align: "right", render: (c) => <PointsCell c={c} side="scanOut" /> },
    { key: "status", header: "Configuration status", value: (c) => pointsState(c), render: (c) => <ConfigBadge state={pointsState(c)} /> },
    { key: "approval", header: "Approval status", value: () => null, sortable: false, render: (c) => <ApprovalLink request={lookup(`${c.id} v${versionsOf(c.versions).latest.version}`)} /> },
    { key: "eff", header: "Effective date", value: (c) => versionsOf(c.versions).latest.effectiveFrom ?? "", render: (c) => <span className="small">{versionsOf(c.versions).latest.effectiveFrom ? formatDateTime(versionsOf(c.versions).latest.effectiveFrom!) : "On activation"}</span> },
    { key: "mod", header: "Last modified", value: (c) => versionsOf(c.versions).latest.updatedAt, render: (c) => <span className="small num">{formatDateTime(versionsOf(c.versions).latest.updatedAt)}</span> },
    { key: "actions", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (c) => <Link to={`/masters/scanning/points/${c.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>{can("scan-config:edit") ? "View / edit" : "View"}</Link> },
  ];
  return (
    <>
      <SectionTitle title="Scan-In / Scan-Out point configuration" description="Points per SKU and branch set. Values are never assumed equal across SKUs or branches" actions={can("scan-config:create") && <Link to="/masters/scanning/points/new" className="btn btn--primary"><ScanLine size={16} strokeWidth={2} aria-hidden="true" />New configuration</Link>} />
      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={q} onChange={setQ} placeholder="Configuration, SKU or product" label="Search configurations" />
          <SelectField label="State" value={st} onChange={setSt} options={[{ value: "all", label: "Any state" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} active={st !== "all"} />
          <SelectField label="Configuration status" value={state} onChange={(v) => setParams(v === "all" ? {} : { state: v })} options={[{ value: "all", label: "Any" }, { value: "active", label: "Active" }, { value: "pending", label: "Pending approval" }, { value: "draft", label: "Draft" }, { value: "inactive", label: "Inactive" }]} active={state !== "all"} />
        </div>
        <p className="filters-bar__count">{rows.length} of {points.length} configurations within your scope</p>
        <DataTable rows={rows} columns={cols} rowKey={(c) => c.id} caption="Scan point configurations" searchable={false} exportName={can("scan-config:export") ? "scan-point-configurations" : undefined} onRowClick={(c) => navigate(`/masters/scanning/points/${c.id}`)} rowActionLabel={(c) => `Open ${c.id}`} initialSort={{ key: "id", dir: "asc" }} emptyTitle="No configurations in your scope" />
      </Panel>
    </>
  );
}

function PointsCell({ c, side }: { c: ScanPointConfig; side: "scanIn" | "scanOut" }) {
  const { active, pending, draft } = versionsOf(c.versions);
  const proposed = pending ?? draft;
  const cur = active?.[side];
  return (
    <span className="age">
      <span className="num">{cur === undefined || cur === null ? "—" : cur}</span>
      {proposed && proposed[side] !== cur && <span className="age__stage">→ {proposed[side] ?? "—"} proposed</span>}
    </span>
  );
}

const WSTEPS = ["Product & SKU", "Applicability", "Points", "Status & validity", "Review", "Save or submit"];

export function ScanPointWizardPage() {
  const { s, acc, can, uid } = useMasterView();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [step, setStep] = useState(0);
  const [max, setMax] = useState(0);
  const [d, setD] = useState<ScanPointDraft>({ skuId: "", programmes: [], branchCodes: [], scanIn: null, scanOut: null, effectiveFrom: null, effectiveTo: null, remarks: "" });
  const [res, setRes] = useState<PolicyResult | null>(null);
  const allowed = useMemo(() => new Set(branchOptions().map((o) => o.value).filter((code) => outOfScope(acc, uid, "scan-config", "create", [code]).length === 0)), [acc, uid]);
  if (!can("scan-config:create")) return <AccessDenied message="Creating scan point configurations needs Scanning configuration: Create." />;
  const sku = skuById(s, d.skuId);
  const product = sku ? productOfSku(s, sku.id) : undefined;
  const v = validateScanPoints(s, d);
  const set = (patch: Partial<ScanPointDraft>) => setD((x) => ({ ...x, ...patch }));
  const go = (i: number) => { setStep(i); setMax((m) => Math.max(m, i)); };
  const inactive = new Set(s.hierarchy.filter((h) => h.level === "branch" && h.status !== "active").map((h) => h.code));
  const save = (submit: boolean) => {
    const out = saveScanPointDraft(uid, null, d);
    if (!out.ok) return setRes(out);
    if (!submit) { notify(`${out.id} saved as draft`, "positive"); return navigate(`/masters/scanning/points/${out.id}`); }
    const sub = submitScanPoints(uid, out.id!);
    if (!sub.ok) { setRes(sub); notify(`${out.id} saved as draft; not submitted`, "info"); return navigate(`/masters/scanning/points/${out.id}`); }
    notify(`${out.id} submitted for approval as ${sub.id}`, "positive");
    navigate(`/masters/scanning/points/${out.id}`);
  };
  const num = (x: string) => (x === "" ? null : Number(x));
  return (
    <div className="wizard">
      <Link to="/masters/scanning/points" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Scan point configurations</Link>
      <SectionTitle title="New scan point configuration" description="Saved as a draft, then submitted to the Approval Centre. Nothing is active before approval" />
      <Stepper steps={WSTEPS} current={step} onSelect={go} maxReached={max} />
      <Panel level={3} title={WSTEPS[step]}>
        {step === 0 && (
          <div className="form-grid form-grid--2">
            <SelectInput label="SKU" required value={d.skuId} onChange={(x) => set({ skuId: x, programmes: [] })} options={[{ value: "", label: "Choose a SKU" }, ...s.skus.map((k) => ({ value: k.id, label: `${k.code} · ${k.name}${k.status !== "active" ? ` (${k.status})` : ""}`, disabled: k.status !== "active" }))]} hint="Inactive and draft SKUs cannot be configured" />
            {sku && product ? (
              <dl className="kv kv--tight">
                <div className="kv__row"><dt>Product</dt><dd>{product.name} <span className="mono small">({product.id})</span></dd></div>
                <div className="kv__row"><dt>SKU code</dt><dd className="mono small">{sku.code}</dd></div>
                <div className="kv__row"><dt>Category</dt><dd>{categoryById(s, product.categoryId)?.name} › {subById(s, product.subCategoryId)?.name}</dd></div>
                <div className="kv__row"><dt>Product status</dt><dd>{product.status}</dd></div>
              </dl>
            ) : <p className="muted small">Pick a SKU to see its product.</p>}
          </div>
        )}
        {step === 1 && (
          <div className="form-grid">
            <MultiSelect label="Programmes" value={d.programmes} onChange={(x) => set({ programmes: x })} options={(sku?.programmes ?? []).map((p) => ({ value: p, label: p }))} placeholder="Choose programmes" hint={sku ? `Limited to the SKU's programmes: ${sku.programmes.join(", ") || "none configured"}` : "Choose a SKU first"} />
            <MultiSelect label="Branches" value={d.branchCodes} onChange={(x) => set({ branchCodes: x })} options={branchOptions((c) => allowed.has(c), inactive)} placeholder="No branches selected" hint={`Only branches within your geographical scope are offered (${allowed.size} of ${branchOptions().length}). Nothing is selected by default`} />
            {d.branchCodes.length > 0 && <p className="small">{describeBranches(d.branchCodes)}</p>}
          </div>
        )}
        {step === 2 && (
          <div className="form-grid form-grid--2">
            <TextField label="Scan-In points" type="number" value={d.scanIn?.toString() ?? ""} onChange={(x) => set({ scanIn: num(x) })} hint="0 or more, up to 2 decimals. Leave empty if not configured" />
            <TextField label="Scan-Out points" type="number" value={d.scanOut?.toString() ?? ""} onChange={(x) => set({ scanOut: num(x) })} hint="An empty value stays unconfigured; it is never replaced with 0" />
          </div>
        )}
        {step === 3 && (
          <div className="form-grid form-grid--2">
            <TextField label="Effective from" type="date" value={d.effectiveFrom ?? ""} onChange={(x) => set({ effectiveFrom: x || null })} hint="Optional. Empty means from activation after approval" />
            <TextField label="Effective to" type="date" value={d.effectiveTo ?? ""} onChange={(x) => set({ effectiveTo: x || null })} />
            <TextArea label="Remarks" required value={d.remarks} onChange={(x) => set({ remarks: x })} rows={3} hint="Shown to the Checker as the reason for the change" />
            <p className="small muted">The configuration starts as a Draft. It becomes Active only after approval and successful execution.</p>
          </div>
        )}
        {step >= 4 && (
          <>
            <div className="table-wrap">
              <table className="table compare">
                <caption className="sr-only">Proposed configuration</caption>
                <thead><tr><th scope="col">Field</th><th scope="col">Current</th><th scope="col">Proposed</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Product and SKU</th><td>—</td><td>{product?.name} · <span className="mono small">{sku?.code}</span></td></tr>
                  <tr><th scope="row">Programmes</th><td>—</td><td>{d.programmes.join(", ") || "None"}</td></tr>
                  <tr><th scope="row">Branches</th><td>—</td><td>{describeBranches(d.branchCodes)}</td></tr>
                  <tr className="is-material"><th scope="row">Scan-In points</th><td>—</td><td>{d.scanIn ?? "Not configured"}</td></tr>
                  <tr className="is-material"><th scope="row">Scan-Out points</th><td>—</td><td>{d.scanOut ?? "Not configured"}</td></tr>
                  <tr><th scope="row">Validity</th><td>—</td><td>{d.effectiveFrom ?? "From activation"} → {d.effectiveTo ?? "open-ended"}</td></tr>
                </tbody>
              </table>
            </div>
            <ValidationList v={v} />
            {step === 5 && (
              <>
                <PolicyMessages result={res} title="Not saved" />
                <div className="btn-row">
                  <button type="button" className="btn btn--secondary" onClick={() => save(false)}>Save as draft</button>
                  <button type="button" className="btn btn--primary" onClick={() => save(true)} disabled={v.errors.length > 0}><Send size={16} strokeWidth={2} aria-hidden="true" />Save and submit for approval</button>
                </div>
              </>
            )}
          </>
        )}
      </Panel>
      <div className="wizard__nav">
        <button type="button" className="btn btn--ghost" onClick={() => go(step - 1)} disabled={step === 0}><ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />Back</button>
        {step < 5 && <button type="button" className="btn btn--dark" onClick={() => go(step + 1)}>Next<ChevronRight size={16} strokeWidth={2} aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

export function ScanPointDetailPage() {
  const { configId = "" } = useParams();
  const { s, acc, can, uid } = useMasterView();
  const lookup = useApprovalLookup();
  const { notify } = useToast();
  const c = s.scanPoints.find((x) => x.id === configId);
  const [form, setForm] = useState<{ scanIn: string; scanOut: string; from: string; to: string; remarks: string } | null>(null);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [retire, setRetire] = useState(false);
  if (!c || !visibleByBranches(acc, uid, "scan-config", c.branchCodes)) return <AccessDenied message={`Configuration ${configId} does not exist or is outside your geographical scope.`} />;
  const sku = skuById(s, c.skuId);
  const vs = versionsOf(c.versions);
  const pendingReq = vs.pending ? lookup(`${c.id} v${vs.pending.version}`) : undefined;
  const editable = can("scan-config:edit") && outOfScope(acc, uid, "scan-config", "create", c.branchCodes).length === 0;
  const working = vs.draft ?? (pendingReq?.status === "returned" ? vs.pending : undefined);
  const start = () => { const base = working ?? vs.active; setForm({ scanIn: base?.scanIn?.toString() ?? "", scanOut: base?.scanOut?.toString() ?? "", from: base?.effectiveFrom ?? "", to: base?.effectiveTo ?? "", remarks: working?.remarks ?? "" }); setRes(null); };
  const draftOf = (): ScanPointDraft => ({ skuId: c.skuId, programmes: c.programmes, branchCodes: c.branchCodes, scanIn: form!.scanIn === "" ? null : Number(form!.scanIn), scanOut: form!.scanOut === "" ? null : Number(form!.scanOut), effectiveFrom: form!.from || null, effectiveTo: form!.to || null, remarks: form!.remarks });
  const lastReturn = pendingReq?.status === "returned" ? [...pendingReq.stages].reverse().find((x) => x.decision === "returned") : undefined;
  return (
    <div className="req">
      <Link to="/masters/scanning/points" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Scan point configurations</Link>
      <section className="req-head panel">
        <div className="req-head__top">
          <div>
            <p className="req-head__id mono">{c.id}</p>
            <h2 className="req-head__title">{productOfSku(s, c.skuId)?.name} · {sku?.code}</h2>
            <p className="req-head__type">{describeBranches(c.branchCodes)} · {c.programmes.join(", ") || "No programme"}</p>
          </div>
          <div className="req-head__badges">
            <ConfigBadge state={pointsState(c)} />
            {pendingReq && <ApprovalLink request={pendingReq} />}
            {editable && !c.retired && (!vs.pending || pendingReq?.status === "returned" || ["rejected", "withdrawn"].includes(pendingReq?.status ?? "")) && <button type="button" className="btn btn--primary btn--sm" onClick={start}>{working ? "Edit draft" : "Propose change"}</button>}
            {editable && vs.active && !vs.pending && !c.retired && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRetire(true)}>Propose retirement</button>}
            {working && editable && <button type="button" className="btn btn--dark btn--sm" onClick={() => { const out = submitScanPoints(uid, c.id); setRes(out); if (out.ok) notify(`Submitted as ${out.id}`, "positive"); }}><Send size={14} strokeWidth={2} aria-hidden="true" />{pendingReq?.status === "returned" ? "Resubmit" : "Submit for approval"}</button>}
          </div>
        </div>
      </section>
      {lastReturn && <Notice tone="warn"><strong>Returned by the Checker:</strong> {lastReturn.remarks}</Notice>}
      {vs.pending && pendingReq && pendingReq.status !== "returned" && <Notice tone="info" icon={<FileClock size={16} strokeWidth={2} aria-hidden="true" />}>Version {vs.pending.version} is with the Approval Centre ({pendingReq.id}). {vs.active ? `Version ${vs.active.version} stays active until it is approved and executed.` : "Nothing is active yet."}</Notice>}
      <PolicyMessages result={res} title="Not saved" />
      {form && (
        <Panel level={3} title={working ? `Edit version ${working.version}` : `Propose version ${c.versions.length + 1}`} subtitle="A new version never overwrites the active one">
          <div className="form-grid form-grid--2">
            <TextField label="Scan-In points" type="number" value={form.scanIn} onChange={(x) => setForm({ ...form, scanIn: x })} hint={`Active: ${vs.active?.scanIn ?? "—"}`} />
            <TextField label="Scan-Out points" type="number" value={form.scanOut} onChange={(x) => setForm({ ...form, scanOut: x })} hint={`Active: ${vs.active?.scanOut ?? "—"}`} />
            <TextField label="Effective from" type="date" value={form.from} onChange={(x) => setForm({ ...form, from: x })} />
            <TextField label="Effective to" type="date" value={form.to} onChange={(x) => setForm({ ...form, to: x })} />
            <TextArea label="Remarks" required value={form.remarks} onChange={(x) => setForm({ ...form, remarks: x })} rows={2} />
          </div>
          <ValidationList v={validateScanPoints(s, draftOf(), c.id)} />
          <div className="btn-row">
            <button type="button" className="btn btn--ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="button" className="btn btn--secondary" onClick={() => { const out = saveScanPointDraft(uid, c.id, draftOf()); setRes(out); if (out.ok) { notify("Draft saved", "positive"); setForm(null); } }}>Save draft</button>
            <button type="button" className="btn btn--primary" onClick={() => { const out = saveScanPointDraft(uid, c.id, draftOf()); if (!out.ok) return setRes(out); const sub = submitScanPoints(uid, c.id); setRes(sub); if (sub.ok) { notify(`Submitted as ${sub.id}`, "positive"); setForm(null); } }}><Send size={14} strokeWidth={2} aria-hidden="true" />Save and submit</button>
          </div>
        </Panel>
      )}
      <Panel level={3} title="Version history" subtitle="Approved, active and historical versions. Historical versions are read-only" padded={false}>
        <DataTable rows={[...c.versions].reverse()} rowKey={(v) => String(v.version)} caption="Versions" searchable={false} columns={[
          { key: "v", header: "Version", value: (v) => v.version, render: (v) => <span className="num">v{v.version}{v.retire ? " · retirement" : ""}</span> },
          { key: "status", header: "Status", value: (v) => v.status, render: (v) => <VersionBadge status={v.status} /> },
          { key: "in", header: "Scan-In", value: (v) => v.scanIn ?? -1, align: "right", render: (v) => <span className="num">{v.scanIn ?? "—"}</span> },
          { key: "out", header: "Scan-Out", value: (v) => v.scanOut ?? -1, align: "right", render: (v) => <span className="num">{v.scanOut ?? "—"}</span> },
          { key: "eff", header: "Effective", value: (v) => v.effectiveFrom ?? "", render: (v) => <span className="small">{v.effectiveFrom ?? "On activation"}{v.effectiveTo ? ` → ${v.effectiveTo}` : ""}</span> },
          { key: "by", header: "Created", value: (v) => v.createdAt, render: (v) => <span className="small">{userName(acc, v.createdBy)} · {formatDateTime(v.createdAt)}</span> },
          { key: "approval", header: "Approval", value: () => null, sortable: false, render: (v) => <ApprovalLink request={lookup(`${c.id} v${v.version}`)} /> },
          { key: "act", header: "Activated", value: (v) => v.activatedAt ?? "", render: (v) => <span className="small num">{v.activatedAt ? formatDateTime(v.activatedAt) : "—"}</span> },
          { key: "remarks", header: "Remarks", value: (v) => v.remarks, render: (v) => <span className="small cell-wrap">{v.remarks || "—"}</span> },
        ] as Column<ScanPointConfig["versions"][number]>[]} />
      </Panel>
      <MasterAuditTable events={s.audit.filter((e) => e.entityId === c.id)} title="Change history" />
      <ReasonDialog open={retire} title={`Propose retirement of ${c.id}`} confirmLabel="Submit for approval" tone="danger" body="The configuration stays active until the retirement is approved and executed." onClose={() => setRetire(false)} onConfirm={(reason) => {
        const out = saveScanPointDraft(uid, c.id, { skuId: c.skuId, programmes: c.programmes, branchCodes: c.branchCodes, scanIn: vs.active?.scanIn ?? null, scanOut: vs.active?.scanOut ?? null, effectiveFrom: null, effectiveTo: null, remarks: reason }, true);
        if (!out.ok) return out;
        const sub = submitScanPoints(uid, c.id);
        if (sub.ok) notify(`Retirement submitted as ${sub.id}`, "positive");
        return sub;
      }} />
    </div>
  );
}

export function ExceptionSettingsPage() {
  const { s } = useMasterView();
  const unconfigured = s.rules.filter((r) => versionsOf(r.versions).latest.outcome.kind === "unconfigured");
  return (
    <>
      <SectionTitle title="Scan error & exception settings" description="Source-defined error and exception catalogue for scanning" />
      <Notice tone="warn" icon={<AlertOctagon size={16} strokeWidth={2} aria-hidden="true" />}>
        No source error/exception catalogue has been supplied, so this list is empty. Codes, messages and blocking behaviour are not invented (decision MDR-05: <Link to="/masters/decisions">Business confirmation required</Link>). Nothing here changes production scan behaviour.
      </Notice>
      <Panel padded={false}>
        <DataTable rows={s.exceptions} rowKey={(e) => e.id} caption="Error and exception catalogue" searchPlaceholder="Search exceptions" columns={[
          { key: "id", header: "Error/exception ID", value: (e) => e.id },
          { key: "code", header: "Code", value: (e) => e.code },
          { key: "desc", header: "Description", value: (e) => e.description },
          { key: "rel", header: "Related configuration", value: (e) => e.relatedConfig },
          { key: "status", header: "Status", value: (e) => e.status },
          { key: "mod", header: "Last modified", value: (e) => e.updatedAt },
        ] as Column<(typeof s.exceptions)[number]>[]} emptyTitle="No source-defined exceptions loaded" />
      </Panel>
      <Panel level={3} title="Configurations waiting for an exception outcome" subtitle="Rules whose outcome stays “not configured” until the catalogue is confirmed">
        {unconfigured.length ? <ul className="ref-list">{unconfigured.map((r) => <li key={r.id}><Link to={`/masters/scanning/rules/${r.id}`} className="mono small">{r.code}</Link> · {r.name}</li>)}</ul> : <p className="muted small">None.</p>}
      </Panel>
    </>
  );
}

