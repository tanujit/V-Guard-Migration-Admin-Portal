import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleHelp, FlaskConical, Plus, Power, Send, ShieldAlert, Trash2, X } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, RadioCards, SelectInput, Stepper, TextArea, TextField } from "@/components/form/Form";
import { PROGRAMMES } from "@/config/programmes";
import { CONDITIONS, CONTEXT_LABEL, conditionDef, DAYS, RULE_TYPES, ruleTypeLabel } from "@/config/scanCatalogue";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { ALL_BRANCHES, allConditions, conditionText, emptyScope, outOfScope, outcomeText, relationsText, rescanText, ruleState, scopeText, simulate, skuLabel, timeText, validateRule, versionsOf, type SimContext, type SimNode } from "@/features/masters/engine";
import { saveRuleDraft, submitRule, type RuleDraft, type RuleHeader } from "@/features/masters/store";
import { formatDateTime } from "@/lib/format";
import type { ConditionKind, ParentChildRelation, RuleCondition, RuleGroup, RuleVersion, ScanRule } from "@/types/masters";
import { AccessDenied, PolicyMessages, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { MasterAuditTable } from "./OverviewPage";
import { ApprovalLink, branchOptions, ConfigBadge, useApprovalLookup, useMasterView, userName, ValidationList, VersionBadge } from "./shared";
import { useScanVisibility } from "./ScanningPage";

let idc = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${idc++}`;

/* ---------------- Visual AND/OR structure ---------------- */

export function RuleLogic({ group, relations, root = true }: { group: RuleGroup; relations: ParentChildRelation[]; root?: boolean }) {
  const { s } = useMasterView();
  return (
    <div className={`logic ${root ? "logic--root" : ""}`}>
      {root && <p className="logic__kw">IF</p>}
      <div className={`logic__group logic__group--${group.op.toLowerCase()}`}>
        {group.items.length === 0 && <p className="small neg">Empty group</p>}
        {group.items.map((item, i) => (
          <div key={item.id} className="logic__item">
            {i > 0 && <span className={`logic__op logic__op--${group.op.toLowerCase()}`}>{group.op}</span>}
            {item.type === "group" ? <RuleLogic group={item} relations={relations} root={false} /> : <span className="logic__cond">{conditionText(s, item, relations)}</span>}
          </div>
        ))}
      </div>
      {root && (
        <>
          <p className="logic__kw">THEN</p>
          <p className="logic__then small">Apply the configured scanning restriction outcome</p>
        </>
      )}
    </div>
  );
}

/* ---------------- Directory ---------------- */

export function RulesDirectoryPage() {
  const { rules, s, acc, can } = useScanVisibility();
  const lookup = useApprovalLookup();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [sku, setSku] = useState("all");
  const [product, setProduct] = useState("all");
  const [branchState, setBranchState] = useState("all");
  const [prog, setProg] = useState("all");
  const [appr, setAppr] = useState("all");
  const state = params.get("state") ?? "all";
  const latest = (r: ScanRule) => versionsOf(r.versions).active ?? versionsOf(r.versions).latest;
  const approvalOf = (r: ScanRule) => lookup(`${r.id} v${versionsOf(r.versions).latest.version}`);
  const rows = rules.filter((r) => {
    const v = latest(r);
    if (q && ![r.id, r.code, r.name].join(" ").toLowerCase().includes(q.toLowerCase())) return false;
    if (type !== "all" && r.ruleType !== type) return false;
    if (sku !== "all" && !v.scope.skuIds.includes(sku)) return false;
    if (product !== "all" && !v.scope.productIds.includes(product) && !v.scope.skuIds.some((k) => s.skus.find((x) => x.id === k)?.productId === product)) return false;
    if (branchState !== "all" && !v.scope.allBranches && !v.scope.branchCodes.some((b) => b.startsWith(`${branchState}-`))) return false;
    if (prog !== "all" && v.scope.programmes.length && !v.scope.programmes.includes(prog)) return false;
    if (state !== "all" && ruleState(r) !== state) return false;
    if (appr !== "all" && (approvalOf(r)?.status ?? "none") !== appr) return false;
    return true;
  });
  const cols: Column<ScanRule>[] = [
    { key: "id", header: "Rule ID", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
    { key: "name", header: "Rule name", value: (r) => r.name, render: (r) => <span className="cell-2"><span className="cell-2__main">{r.name}</span><span className="cell-2__sub mono">{r.code}</span></span> },
    { key: "type", header: "Rule type", value: (r) => ruleTypeLabel(r.ruleType), render: (r) => <span className="small">{ruleTypeLabel(r.ruleType)} · {CONTEXT_LABEL[r.context]}</span> },
    { key: "sku", header: "Product / SKU", value: (r) => latest(r).scope.skuIds.length, render: (r) => { const sc = latest(r).scope; return <span className="small">{sc.allSkus ? "All SKUs" : sc.skuIds.length ? `${sc.skuIds.length} SKU${sc.skuIds.length > 1 ? "s" : ""}` : sc.productIds.length ? `${sc.productIds.length} products` : "—"}</span>; } },
    { key: "sub", header: "Sub-category", value: (r) => latest(r).scope.subCategoryIds.length, render: (r) => <span className="small">{latest(r).scope.subCategoryIds.map((id) => s.subCategories.find((x) => x.id === id)?.name).join(", ") || "—"}</span> },
    { key: "branch", header: "Branch", value: (r) => latest(r).scope.branchCodes.length, render: (r) => { const sc = latest(r).scope; return <span className="small">{sc.allBranches ? "All branches" : `${sc.branchCodes.length} branches`}</span>; } },
    { key: "prog", header: "Programme", value: (r) => latest(r).scope.programmes.join(", "), render: (r) => <span className="small">{latest(r).scope.programmes.join(", ") || "Any"}</span> },
    { key: "cond", header: "Condition type", value: (r) => latest(r).conditions.op, render: (r) => { const v = latest(r); return <span className="small">{v.conditions.op} · {allConditions(v.conditions).length} conditions{v.conditions.items.some((i) => i.type === "group") ? " · nested" : ""}</span>; } },
    { key: "status", header: "Rule status", value: (r) => ruleState(r), render: (r) => <ConfigBadge state={ruleState(r)} /> },
    { key: "approval", header: "Approval status", value: (r) => approvalOf(r)?.status ?? "", render: (r) => <ApprovalLink request={approvalOf(r)} /> },
    { key: "by", header: "Created by", value: (r) => userName(acc, r.createdBy) },
    { key: "mod", header: "Last modified", value: (r) => versionsOf(r.versions).latest.updatedAt, render: (r) => <span className="small num">{formatDateTime(versionsOf(r.versions).latest.updatedAt)}</span> },
    { key: "act", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (r) => <Link to={`/masters/scanning/rules/${r.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>View</Link> },
  ];
  const ruleSkus = Array.from(new Set(rules.flatMap((r) => latest(r).scope.skuIds)));
  return (
    <>
      <SectionTitle title="Scan restriction rules" description="Branch, SKU, sub-category, time, re-scan and parent-child restrictions with AND/OR logic. Every change goes through the Approval Centre" actions={can("scan-config:create") && <Link to="/masters/scanning/rules/new" className="btn btn--primary"><Plus size={16} strokeWidth={2} aria-hidden="true" />Create rule</Link>} />
      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={q} onChange={setQ} placeholder="Rule ID, code or name" label="Search rules" />
          <SelectField label="Rule type" value={type} onChange={setType} options={[{ value: "all", label: "All types" }, ...RULE_TYPES.map((t) => ({ value: t.id, label: t.label }))]} active={type !== "all"} />
          <SelectField label="Product" value={product} onChange={setProduct} options={[{ value: "all", label: "Any product" }, ...s.products.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))]} active={product !== "all"} />
          <SelectField label="SKU" value={sku} onChange={setSku} options={[{ value: "all", label: "Any SKU" }, ...ruleSkus.map((k) => ({ value: k, label: skuLabel(s, k) }))]} active={sku !== "all"} />
          <SelectField label="Branch (state)" value={branchState} onChange={setBranchState} options={[{ value: "all", label: "Any" }, ...Array.from(new Set(ALL_BRANCHES.map((b) => b.state))).map((c) => ({ value: c, label: ALL_BRANCHES.find((b) => b.state === c)!.stateName }))]} active={branchState !== "all"} />
          <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "Any" }, ...PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))]} active={prog !== "all"} />
          <SelectField label="Status" value={state} onChange={(v) => setParams(v === "all" ? {} : { state: v })} options={[{ value: "all", label: "Any" }, { value: "active", label: "Active" }, { value: "pending", label: "Pending approval" }, { value: "draft", label: "Draft" }, { value: "inactive", label: "Inactive" }]} active={state !== "all"} />
          <SelectField label="Approval status" value={appr} onChange={setAppr} options={[{ value: "all", label: "Any" }, { value: "none", label: "Never submitted" }, { value: "pending_approval", label: "Pending approval" }, { value: "under_review", label: "Under review" }, { value: "returned", label: "Returned" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} active={appr !== "all"} />
        </div>
        <p className="filters-bar__count">{rows.length} of {rules.length} rules within your scope</p>
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} caption="Scan restriction rules" searchable={false} exportName={can("scan-config:export") ? "scan-restriction-rules" : undefined} onRowClick={(r) => navigate(`/masters/scanning/rules/${r.id}`)} rowActionLabel={(r) => `Open ${r.code}`} initialSort={{ key: "id", dir: "asc" }} emptyTitle="No rules in your scope" />
      </Panel>
    </>
  );
}

/* ---------------- Detail ---------------- */

export function RuleDetailPage() {
  const { ruleId = "" } = useParams();
  const { rules, s, acc, can, uid } = useScanVisibility();
  const lookup = useApprovalLookup();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [deact, setDeact] = useState(false);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [ack, setAck] = useState(false);
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return <AccessDenied message={`Rule ${ruleId} does not exist or is outside your geographical scope.`} />;
  const vs = versionsOf(rule.versions);
  const shown = vs.draft ?? vs.pending ?? vs.active ?? vs.latest;
  const req = lookup(`${rule.id} v${shown.version}`);
  const validation = validateRule(s, rule.id, rule, shown);
  const canEdit = can("scan-config:edit") && (shown.scope.allBranches ? outOfScope(acc, uid, "scan-config", "create", ALL_BRANCHES.map((b) => b.code)).length === 0 : outOfScope(acc, uid, "scan-config", "create", shown.scope.branchCodes).length === 0);
  const locked = vs.pending && req && !["returned", "rejected", "withdrawn"].includes(req.status);
  const submittable = (vs.draft || (vs.pending && req?.status === "returned")) && can("scan-config:submit");
  const lastReturn = req?.status === "returned" ? [...req.stages].reverse().find((x) => x.decision === "returned") : undefined;
  return (
    <div className="req">
      <Link to="/masters/scanning/rules" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Scan restriction rules</Link>
      <section className="req-head panel">
        <div className="req-head__top">
          <div>
            <p className="req-head__id mono">{rule.id} · {rule.code}</p>
            <h2 className="req-head__title">{rule.name}</h2>
            <p className="req-head__type">{ruleTypeLabel(rule.ruleType)} · {CONTEXT_LABEL[rule.context]} · {rule.description}</p>
          </div>
          <div className="req-head__badges">
            <ConfigBadge state={ruleState(rule)} />
            {req && <ApprovalLink request={req} />}
            {canEdit && !locked && <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate(`/masters/scanning/rules/${rule.id}/edit`)}>{vs.draft ? "Edit draft" : req?.status === "returned" ? "Correct returned version" : "Propose change"}</button>}
            {canEdit && !locked && vs.active && !vs.active.deactivate && !vs.draft && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDeact(true)}><Power size={14} strokeWidth={2} aria-hidden="true" />Propose deactivation</button>}
            <Link to={`/masters/scanning/simulator?rule=${rule.id}`} className="btn btn--ghost btn--sm"><FlaskConical size={14} strokeWidth={2} aria-hidden="true" />Simulate</Link>
          </div>
        </div>
      </section>
      {lastReturn && <Notice tone="warn"><strong>Returned by the Checker:</strong> {lastReturn.remarks}</Notice>}
      {locked && <Notice tone="info">Version {vs.pending!.version} is with the Approval Centre ({req!.id}). {vs.active ? `Version ${vs.active.version} stays active until it is approved and executed.` : "Nothing is active yet."} Editing is locked until the Checker decides.</Notice>}
      <div className="grid-2">
        <Panel level={3} title={`Version ${shown.version} · ${shown.deactivate ? "deactivation" : "rule"}`} subtitle={<VersionBadge status={shown.status} />}>
          <dl className="kv kv--tight">
            <div className="kv__row"><dt>Applicability</dt><dd className="small">{scopeText(s, shown.scope)}</dd></div>
            <div className="kv__row"><dt>Time restriction</dt><dd className="small">{timeText(shown)}</dd></div>
            <div className="kv__row"><dt>Re-scan restriction</dt><dd className="small">{rescanText(shown)}</dd></div>
            <div className="kv__row"><dt>Parent-child</dt><dd className="small">{relationsText(s, shown)}</dd></div>
            <div className="kv__row"><dt>Outcome</dt><dd className="small">{outcomeText(s, shown)}</dd></div>
            <div className="kv__row"><dt>Justification</dt><dd className="small">{shown.justification || "—"}</dd></div>
          </dl>
        </Panel>
        <Panel level={3} title="Rule evaluation structure">
          <RuleLogic group={shown.conditions} relations={shown.relations} />
        </Panel>
      </div>
      {vs.active && shown !== vs.active && (
        <Panel level={3} title={`Currently active: version ${vs.active.version}`}>
          <p className="small">{scopeText(s, vs.active.scope)}</p>
          <RuleLogic group={vs.active.conditions} relations={vs.active.relations} />
        </Panel>
      )}
      <Panel level={3} title="Validation and conflicts" subtitle="Errors must be resolved; warnings must be acknowledged before submission">
        <ValidationList v={validation} />
        {submittable && (
          <>
            {validation.warnings.length > 0 && <Checkbox label="I have reviewed the warnings" checked={ack} onChange={setAck} />}
            <PolicyMessages result={res} title="Not submitted" />
            <div className="btn-row"><button type="button" className="btn btn--primary" onClick={() => { const out = submitRule(uid, rule.id, ack); setRes(out); if (out.ok) notify(`Submitted for approval as ${out.id}`, "positive"); }}><Send size={16} strokeWidth={2} aria-hidden="true" />{req?.status === "returned" ? "Resubmit for approval" : "Submit for approval"}</button></div>
          </>
        )}
      </Panel>
      <Panel level={3} title="Version history" subtitle="Changes create new versions; earlier versions stay read-only" padded={false}>
        <DataTable rows={[...rule.versions].reverse()} rowKey={(v) => String(v.version)} caption="Rule versions" searchable={false} columns={[
          { key: "v", header: "Version", value: (v) => v.version, render: (v) => <span className="num">v{v.version}{v.deactivate ? " · deactivation" : ""}</span> },
          { key: "status", header: "Status", value: (v) => v.status, render: (v) => <VersionBadge status={v.status} /> },
          { key: "scope", header: "Applicability", value: (v) => scopeText(s, v.scope), render: (v) => <span className="small cell-wrap">{scopeText(s, v.scope)}</span> },
          { key: "by", header: "Created", value: (v) => v.createdAt, render: (v) => <span className="small">{userName(acc, v.createdBy)} · {formatDateTime(v.createdAt)}</span> },
          { key: "approval", header: "Approval", value: () => null, sortable: false, render: (v) => <ApprovalLink request={lookup(`${rule.id} v${v.version}`)} /> },
          { key: "act", header: "Activated", value: (v) => v.activatedAt ?? "", render: (v) => <span className="small num">{v.activatedAt ? formatDateTime(v.activatedAt) : "—"}</span> },
        ] as Column<RuleVersion>[]} />
      </Panel>
      <MasterAuditTable events={s.audit.filter((e) => e.entityId === rule.id)} title="Change history" />
      <ReasonDialog open={deact} title={`Propose deactivation of ${rule.code}`} confirmLabel="Submit for approval" tone="danger" body="A deactivation version is submitted to the Approval Centre. The rule stays active until it is approved and executed." onClose={() => setDeact(false)} onConfirm={(reason) => {
        const a = vs.active!;
        const draft: RuleDraft = { scope: a.scope, conditions: a.conditions, time: a.time, rescan: a.rescan, relations: a.relations, outcome: a.outcome, justification: reason, deactivate: true };
        const out = saveRuleDraft(uid, rule.id, rule, draft);
        if (!out.ok) return out;
        const sub = submitRule(uid, rule.id, true);
        if (sub.ok) notify(`Deactivation submitted as ${sub.id}`, "positive");
        return sub;
      }} />
    </div>
  );
}

/* ---------------- Builder ---------------- */

const BSTEPS = ["Basics", "Applicability", "Conditions", "Time", "Re-scan", "Parent-child", "Evaluation", "Outcome", "Review & submit"];

function GroupEditor({ g, onChange, onRemove, depth, options }: { g: RuleGroup; onChange: (g: RuleGroup) => void; onRemove?: () => void; depth: number; options: Record<string, { value: string; label: string; group?: string }[]> }) {
  const setItem = (i: number, item: RuleGroup["items"][number]) => onChange({ ...g, items: g.items.map((x, j) => (j === i ? item : x)) });
  const remove = (i: number) => onChange({ ...g, items: g.items.filter((_, j) => j !== i) });
  return (
    <div className={`gedit gedit--${g.op.toLowerCase()}`}>
      <div className="gedit__head">
        <div className="version-pick" role="group" aria-label="Group logic">
          {(["AND", "OR"] as const).map((op) => <button key={op} type="button" className={`version-pick__btn ${g.op === op ? "is-on" : ""}`} aria-pressed={g.op === op} onClick={() => onChange({ ...g, op })}>{op}</button>)}
        </div>
        <span className="small muted">{g.op === "AND" ? "All conditions must be met" : "At least one condition must be met"}</span>
        {onRemove && <button type="button" className="icon-btn icon-btn--sm" aria-label="Remove group" onClick={onRemove}><Trash2 size={14} strokeWidth={2} /></button>}
      </div>
      {g.items.map((item, i) => (
        <div key={item.id} className="gedit__item">
          {i > 0 && <span className={`logic__op logic__op--${g.op.toLowerCase()}`}>{g.op}</span>}
          {item.type === "group" ? (
            <GroupEditor g={item} depth={depth + 1} options={options} onChange={(x) => setItem(i, x)} onRemove={() => remove(i)} />
          ) : (
            <ConditionEditor c={item} options={options} onChange={(x) => setItem(i, x)} onRemove={() => remove(i)} />
          )}
        </div>
      ))}
      <div className="btn-row">
        <button type="button" className="btn btn--secondary btn--xs" onClick={() => onChange({ ...g, items: [...g.items, { id: nid("C"), type: "condition", kind: "branch", operator: "in", values: [] }] })}><Plus size={12} strokeWidth={2} aria-hidden="true" />Condition</button>
        {depth < 3 && <button type="button" className="btn btn--ghost btn--xs" onClick={() => onChange({ ...g, items: [...g.items, { id: nid("G"), type: "group", op: g.op === "AND" ? "OR" : "AND", items: [] }] })}><Plus size={12} strokeWidth={2} aria-hidden="true" />Group</button>}
      </div>
    </div>
  );
}

function ConditionEditor({ c, onChange, onRemove, options }: { c: RuleCondition; onChange: (c: RuleCondition) => void; onRemove: () => void; options: Record<string, { value: string; label: string; group?: string }[]> }) {
  const def = conditionDef(c.kind);
  return (
    <div className="cond-row cond-row--rule">
      <SelectInput label="Condition" value={c.kind} onChange={(k) => { const d = conditionDef(k as ConditionKind); onChange({ ...c, kind: k as ConditionKind, operator: d.operators[0].id, values: [] }); }} options={CONDITIONS.map((x) => ({ value: x.kind, label: x.label }))} />
      <SelectInput label="Operator" value={c.operator} onChange={(o) => onChange({ ...c, operator: o })} options={def.operators.map((o) => ({ value: o.id, label: o.label }))} />
      {def.valueSource === "config" ? <p className="small muted cond-row__note">{def.help}</p> : <MultiSelect label="Values" value={c.values} onChange={(v) => onChange({ ...c, values: v })} options={options[def.valueSource] ?? []} placeholder="Choose" emptyText={def.valueSource === "relations" ? "Define a relationship in the Parent-child step" : "No options"} />}
      <button type="button" className="icon-btn" aria-label="Remove condition" onClick={onRemove}><X size={16} strokeWidth={2} /></button>
    </div>
  );
}

const blankDraft = (): RuleDraft => ({ scope: emptyScope(), conditions: { id: "G1", type: "group", op: "AND", items: [] }, time: null, rescan: null, relations: [], outcome: { kind: "unconfigured", exceptionId: null, note: "" }, justification: "", deactivate: false });

export function RuleBuilderPage({ mode }: { mode: "new" | "edit" }) {
  const { ruleId } = useParams();
  const { s, acc, can, uid } = useMasterView();
  const navigate = useNavigate();
  const { notify } = useToast();
  const lookup = useApprovalLookup();
  const rule = ruleId ? s.rules.find((r) => r.id === ruleId) : undefined;
  const base = rule ? (versionsOf(rule.versions).draft ?? (lookup(`${rule.id} v${versionsOf(rule.versions).pending?.version}`)?.status === "returned" ? versionsOf(rule.versions).pending : undefined) ?? versionsOf(rule.versions).active ?? versionsOf(rule.versions).latest) : undefined;
  const [header, setHeader] = useState<RuleHeader>(() => (rule ? { name: rule.name, code: rule.code, description: rule.description, ruleType: rule.ruleType, context: rule.context } : { name: "", code: "", description: "", ruleType: "composite", context: "scan_in" }));
  const [d, setD] = useState<RuleDraft>(() => (base ? { scope: base.scope, conditions: base.conditions, time: base.time, rescan: base.rescan, relations: base.relations, outcome: base.outcome, justification: base.version === versionsOf(rule!.versions).active?.version ? "" : base.justification, deactivate: false } : blankDraft()));
  const [step, setStep] = useState(0);
  const [max, setMax] = useState(mode === "edit" ? BSTEPS.length - 1 : 0);
  const [ack, setAck] = useState(false);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const allowedBranches = useMemo(() => new Set(ALL_BRANCHES.map((b) => b.code).filter((c) => outOfScope(acc, uid, "scan-config", "create", [c]).length === 0)), [acc, uid]);
  const inactive = new Set(s.hierarchy.filter((h) => h.level === "branch" && h.status !== "active").map((h) => h.code));
  const options = useMemo(() => ({
    branches: branchOptions((c) => d.scope.allBranches || d.scope.branchCodes.includes(c), inactive),
    skus: s.skus.map((k) => ({ value: k.id, label: `${k.code} · ${k.name}${k.status !== "active" ? ` (${k.status})` : ""}` })),
    sub_categories: s.subCategories.map((x) => ({ value: x.id, label: x.name, group: s.categories.find((c) => c.id === x.categoryId)?.name })),
    relations: d.relations.map((r) => ({ value: r.id, label: `${skuLabel(s, r.parentSkuId)} → ${r.childSkuIds.map((c) => skuLabel(s, c)).join(", ")}` })),
  }), [s, d.scope, d.relations]);
  if (!can(mode === "new" ? "scan-config:create" : "scan-config:edit")) return <AccessDenied message="Building scan rules needs Scanning configuration: Create / Edit. View-only users cannot change rules." />;
  if (mode === "edit" && !rule) return <AccessDenied message={`Rule ${ruleId} was not found.`} />;
  const version: RuleVersion = { ...d, version: 0, status: "draft", approvalRequestId: null, createdBy: uid, createdAt: "", updatedAt: "", activatedAt: null };
  const validation = validateRule(s, rule?.id ?? null, header, version);
  const go = (i: number) => { setStep(i); setMax((m) => Math.max(m, i)); };
  const setScope = (patch: Partial<RuleDraft["scope"]>) => setD((x) => ({ ...x, scope: { ...x.scope, ...patch } }));
  const save = (submit: boolean) => {
    const out = saveRuleDraft(uid, rule?.id ?? null, header, d);
    if (!out.ok) return setRes(out);
    if (!submit) { notify(`Draft saved (${out.id})`, "positive"); return navigate(`/masters/scanning/rules/${out.id}`); }
    const sub = submitRule(uid, out.id!, ack);
    if (!sub.ok) { setRes(sub); notify("Draft saved; not submitted", "info"); return; }
    notify(`Submitted for approval as ${sub.id}`, "positive");
    navigate(`/masters/scanning/rules/${out.id}`);
  };
  const usesTime = allConditions(d.conditions).some((c) => c.kind === "time");
  const usesRescan = allConditions(d.conditions).some((c) => c.kind === "rescan");
  return (
    <div className="wizard">
      <Link to={rule ? `/masters/scanning/rules/${rule.id}` : "/masters/scanning/rules"} className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />{rule ? rule.code : "Scan restriction rules"}</Link>
      <SectionTitle title={rule ? `Change ${rule.code}` : "Create scan restriction rule"} description={rule && versionsOf(rule.versions).active ? `Builds a new version. Version ${versionsOf(rule.versions).active!.version} stays active until the change is approved and executed` : "Saved as a draft and submitted to the Approval Centre. Nothing is active before approval"} />
      <Stepper steps={BSTEPS} current={step} onSelect={go} maxReached={max} />
      <Panel level={3} title={BSTEPS[step]}>
        {step === 0 && (
          <div className="form-grid form-grid--2">
            <TextField label="Rule name" required value={header.name} onChange={(v) => setHeader({ ...header, name: v })} />
            <TextField label="Rule code" required value={header.code} onChange={(v) => setHeader({ ...header, code: v.toUpperCase() })} hint="3–32 capitals, digits, - or _. Fixed once the rule is active" />
            <TextArea label="Description" value={header.description} onChange={(v) => setHeader({ ...header, description: v })} rows={2} />
            <SelectInput label="Rule type" value={header.ruleType} onChange={(v) => setHeader({ ...header, ruleType: v as RuleHeader["ruleType"] })} options={RULE_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
            <SelectInput label="Applies to" value={header.context} onChange={(v) => setHeader({ ...header, context: v as RuleHeader["context"] })} options={Object.entries(CONTEXT_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
            <TextArea label="Business justification" required value={d.justification} onChange={(v) => setD({ ...d, justification: v })} rows={2} hint="Shown to the Checker as the reason" />
            <p className="small muted">Status: Draft until approved. Activation happens only through the Approval Centre.</p>
          </div>
        )}
        {step === 1 && (
          <div className="form-grid form-grid--2">
            <MultiSelect label="Products" value={d.scope.productIds} onChange={(v) => setScope({ productIds: v })} options={s.products.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}${p.status !== "active" ? ` (${p.status})` : ""}` }))} placeholder="None" />
            <MultiSelect label="SKUs" value={d.scope.skuIds} onChange={(v) => setScope({ skuIds: v })} options={options.skus} placeholder="None" />
            <MultiSelect label="Categories" value={d.scope.categoryIds} onChange={(v) => setScope({ categoryIds: v })} options={s.categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="None" />
            <MultiSelect label="Sub-categories" value={d.scope.subCategoryIds} onChange={(v) => setScope({ subCategoryIds: v })} options={options.sub_categories} placeholder="None" />
            <MultiSelect label="Branches" value={d.scope.branchCodes} onChange={(v) => setScope({ branchCodes: v })} options={branchOptions((c) => allowedBranches.has(c), inactive)} placeholder="None selected" hint={`Only branches within your scope are offered (${allowedBranches.size})`} />
            <MultiSelect label="Programmes" value={d.scope.programmes} onChange={(v) => setScope({ programmes: v })} options={PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))} placeholder="Not programme-specific" />
            <Checkbox label="Applies to all SKUs" checked={d.scope.allSkus} onChange={(v) => setScope({ allSkus: v })} description="Explicit choice. An empty product selection never means all SKUs" />
            <Checkbox label="Applies at all branches" checked={d.scope.allBranches} onChange={(v) => setScope({ allBranches: v })} description="Explicit choice. Needs nationwide scanning-configuration scope" />
            <p className="small">{scopeText(s, d.scope)}</p>
          </div>
        )}
        {step === 2 && (
          <>
            <p className="small muted">Build the condition tree. Values are picked from the masters; nothing is hardcoded in this screen.</p>
            <GroupEditor g={d.conditions} depth={1} options={options} onChange={(g) => setD({ ...d, conditions: g })} />
          </>
        )}
        {step === 3 && (
          <div className="form-grid form-grid--2">
            <Checkbox label="This rule uses a time restriction" checked={!!d.time} onChange={(v) => setD({ ...d, time: v ? { windowStart: null, windowEnd: null, days: [], note: "" } : null })} description={usesTime ? "A Time condition is in the rule" : "Add a Time condition to use it"} />
            {d.time && (
              <>
                <TextField label="Window start" type="time" value={d.time.windowStart ?? ""} onChange={(v) => setD({ ...d, time: { ...d.time!, windowStart: v || null } })} hint="No default. Leave empty until the business confirms it" />
                <TextField label="Window end" type="time" value={d.time.windowEnd ?? ""} onChange={(v) => setD({ ...d, time: { ...d.time!, windowEnd: v || null } })} />
                <MultiSelect label="Days" value={d.time.days} onChange={(v) => setD({ ...d, time: { ...d.time!, days: v } })} options={DAYS.map((x) => ({ value: x, label: x }))} placeholder="Every day" />
                <TextField label="Note" value={d.time.note} onChange={(v) => setD({ ...d, time: { ...d.time!, note: v } })} hint="E.g. which decision the values come from" />
                {!d.time.windowStart && <Notice tone="warn" icon={<CircleHelp size={16} strokeWidth={2} aria-hidden="true" />}>Business confirmation required (MDR-02): no time window is assumed.</Notice>}
              </>
            )}
          </div>
        )}
        {step === 4 && (
          <div className="form-grid form-grid--2">
            <Checkbox label="This rule uses re-scan restrictions" checked={!!d.rescan} onChange={(v) => setD({ ...d, rescan: v ? { eligible: null, minIntervalHours: null, maxCount: null, note: "" } : null })} description={usesRescan ? "A Re-scan condition is in the rule" : "Add a Re-scan condition to use it"} />
            {d.rescan && (
              <>
                <SelectInput label="Re-scan eligibility" value={d.rescan.eligible ?? ""} onChange={(v) => setD({ ...d, rescan: { ...d.rescan!, eligible: (v || null) as "allowed" | "not_allowed" | null } })} options={[{ value: "", label: "Not set (business confirmation required)" }, { value: "allowed", label: "Re-scan allowed" }, { value: "not_allowed", label: "Re-scan not allowed" }]} />
                <TextField label="Minimum hours between scans" type="number" value={d.rescan.minIntervalHours?.toString() ?? ""} onChange={(v) => setD({ ...d, rescan: { ...d.rescan!, minIntervalHours: v === "" ? null : Number(v) } })} hint="No default" />
                <TextField label="Maximum re-scans" type="number" value={d.rescan.maxCount?.toString() ?? ""} onChange={(v) => setD({ ...d, rescan: { ...d.rescan!, maxCount: v === "" ? null : Number(v) } })} hint="No default" />
                <TextField label="Note" value={d.rescan.note} onChange={(v) => setD({ ...d, rescan: { ...d.rescan!, note: v } })} />
                <p className="small muted">Applies to the SKUs and branches in the rule's applicability.</p>
              </>
            )}
          </div>
        )}
        {step === 5 && (
          <>
            <Notice tone="info">The SOW requires parent-child scan logic but does not define the relationship's meaning or outcome (MDR-03). Record what the business describes; nothing is inferred.</Notice>
            {d.relations.map((r, i) => (
              <div key={r.id} className="stage-edit">
                <div className="stage-edit__head"><strong>Relationship {i + 1}</strong><button type="button" className="icon-btn icon-btn--sm" aria-label="Remove relationship" onClick={() => setD({ ...d, relations: d.relations.filter((x) => x.id !== r.id) })}><Trash2 size={14} strokeWidth={2} /></button></div>
                <div className="form-grid form-grid--2">
                  <SelectInput label="Parent SKU" value={r.parentSkuId} onChange={(v) => setD({ ...d, relations: d.relations.map((x) => (x.id === r.id ? { ...x, parentSkuId: v } : x)) })} options={[{ value: "", label: "Choose" }, ...options.skus]} />
                  <MultiSelect label="Child SKUs" value={r.childSkuIds} onChange={(v) => setD({ ...d, relations: d.relations.map((x) => (x.id === r.id ? { ...x, childSkuIds: v } : x)) })} options={options.skus.filter((o) => o.value !== r.parentSkuId)} placeholder="None" />
                  <TextArea label="Relationship as described by the business" value={r.description} onChange={(v) => setD({ ...d, relations: d.relations.map((x) => (x.id === r.id ? { ...x, description: v } : x)) })} rows={2} />
                  <p className="small muted">Meaning confirmed: {r.confirmed ? "yes" : "no (business confirmation required)"}</p>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setD({ ...d, relations: [...d.relations, { id: `REL-${d.relations.length + 1}`, parentSkuId: "", childSkuIds: [], description: "", confirmed: false }] })}><Plus size={14} strokeWidth={2} aria-hidden="true" />Add relationship</button>
          </>
        )}
        {step === 6 && (
          <>
            <RuleLogic group={d.conditions} relations={d.relations} />
            <p className="small muted">This shows the structure only. It is not a predefined V-Guard business rule.</p>
          </>
        )}
        {step === 7 && (
          <div className="form-grid">
            <RadioCards name="outcome" label="Rule outcome" value={d.outcome.kind} onChange={(v) => setD({ ...d, outcome: { ...d.outcome, kind: v as "unconfigured" | "source_defined" } })} options={[{ value: "unconfigured", label: "Not configured (business confirmation required)", description: "The rule records its conditions; the scan outcome is decided once the source catalogue is confirmed" }, { value: "source_defined", label: "Source-defined exception", description: s.exceptions.length ? "Link an exception from the catalogue" : "Unavailable: no source error/exception catalogue has been supplied", disabled: !s.exceptions.length }]} />
            <TextArea label="Exception information / note" value={d.outcome.note} onChange={(v) => setD({ ...d, outcome: { ...d.outcome, note: v } })} rows={2} />
            <p className="small muted">No error codes or mobile messages are invented, and no rule is assumed to be a hard rejection.</p>
          </div>
        )}
        {step === 8 && (
          <>
            <dl className="kv kv--wide">
              <div className="kv__row"><dt>Rule</dt><dd>{header.code || "—"} · {header.name || "—"} · {ruleTypeLabel(header.ruleType)} · {CONTEXT_LABEL[header.context]}</dd></div>
              <div className="kv__row"><dt>Applicability</dt><dd className="small">{scopeText(s, d.scope)}</dd></div>
              <div className="kv__row"><dt>Conditions</dt><dd><RuleLogic group={d.conditions} relations={d.relations} /></dd></div>
              <div className="kv__row"><dt>Time restriction</dt><dd className="small">{timeText(version)}</dd></div>
              <div className="kv__row"><dt>Re-scan</dt><dd className="small">{rescanText(version)}</dd></div>
              <div className="kv__row"><dt>Parent-child</dt><dd className="small">{relationsText(s, version)}</dd></div>
              <div className="kv__row"><dt>Outcome</dt><dd className="small">{outcomeText(s, version)}{d.outcome.note ? ` · ${d.outcome.note}` : ""}</dd></div>
              <div className="kv__row"><dt>Justification</dt><dd className="small">{d.justification || "—"}</dd></div>
            </dl>
            <ValidationList v={validation} />
            {validation.conflicts.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Overlapping rules</caption>
                  <thead><tr><th scope="col">Overlapping rule</th><th scope="col" className="is-right">SKUs</th><th scope="col" className="is-right">Branches</th><th scope="col">Effect</th></tr></thead>
                  <tbody>{validation.conflicts.map((c) => <tr key={c.ruleId}><td><Link to={`/masters/scanning/rules/${c.ruleId}`} className="mono small">{c.code}</Link></td><td className="is-right num">{c.skus}</td><td className="is-right num">{c.branches}</td><td className="small">{c.blocking ? <StatusBadge tone="negative">Blocks activation</StatusBadge> : <StatusBadge tone="warning">Review</StatusBadge>} {c.reason}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {validation.warnings.length > 0 && <Checkbox label="I have reviewed and acknowledge the warnings" checked={ack} onChange={setAck} />}
            <PolicyMessages result={res} title="Not saved or not submitted" />
            <div className="btn-row">
              <button type="button" className="btn btn--secondary" onClick={() => save(false)}>Save draft</button>
              <button type="button" className="btn btn--primary" onClick={() => save(true)} disabled={validation.errors.length > 0 || !can("scan-config:submit")}><Send size={16} strokeWidth={2} aria-hidden="true" />Save and submit for approval</button>
            </div>
          </>
        )}
      </Panel>
      <div className="wizard__nav">
        <button type="button" className="btn btn--ghost" onClick={() => go(step - 1)} disabled={step === 0}><ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />Back</button>
        {step < BSTEPS.length - 1 && <button type="button" className="btn btn--dark" onClick={() => go(step + 1)}>Next<ChevronRight size={16} strokeWidth={2} aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

/* ---------------- Simulator ---------------- */

function SimTree({ n }: { n: SimNode }) {
  const icon = n.result === true ? <Check size={12} strokeWidth={3} /> : n.result === false ? <X size={12} strokeWidth={3} /> : <CircleHelp size={12} strokeWidth={2.5} />;
  return (
    <div className="simnode">
      <p className={`simnode__row simnode__row--${n.result === "unknown" ? "unknown" : n.result ? "true" : "false"}`}>
        <span className="simnode__icon" aria-hidden="true">{icon}</span>
        <span>{n.label}</span>
        <span className="small muted">{n.result === "unknown" ? "unknown" : String(n.result)}{n.reason ? ` · ${n.reason}` : ""}</span>
      </p>
      {n.children && <div className="simnode__children">{n.children.map((c, i) => <SimTree key={i} n={c} />)}</div>}
    </div>
  );
}

export function SimulatorPage() {
  const { rules, s } = useScanVisibility();
  const [params] = useSearchParams();
  const preselect = params.get("rule");
  const [ctx, setCtx] = useState<SimContext>(() => {
    const r = rules.find((x) => x.id === preselect);
    const v = r ? versionsOf(r.versions).latest : undefined;
    return { skuId: v?.scope.skuIds[0] ?? s.skus[0].id, branchCode: v?.scope.branchCodes[0] ?? ALL_BRANCHES[0].code, programme: "", time: "", day: "", rescan: "", rescanCount: "", hoursSinceLast: "", parentScanned: "", childScanned: "" };
  });
  const [include, setInclude] = useState<string>(preselect ?? "");
  const candidates = rules.flatMap((r) => {
    const vs = versionsOf(r.versions);
    const list: { rule: ScanRule; version: RuleVersion }[] = [];
    if (vs.active && !vs.active.deactivate) list.push({ rule: r, version: vs.active });
    if (r.id === include) {
      const proposed = vs.draft ?? vs.pending;
      if (proposed && !proposed.deactivate) return [{ rule: r, version: proposed }];
    }
    return list;
  });
  const out = simulate(s, ctx, candidates);
  const set = (p: Partial<SimContext>) => setCtx((x) => ({ ...x, ...p }));
  const yn = [{ value: "", label: "Not specified" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }];
  return (
    <>
      <SectionTitle title="Rule simulator" description="Development preview of how configured rules would read a scan context" />
      <Notice tone="warn" icon={<FlaskConical size={16} strokeWidth={2} aria-hidden="true" />}>This is a mock evaluation in the browser. It does not reproduce the production mobile scanning engine and makes no claim about a real scan result. Where a value is unconfirmed it reports “Evaluation requires business configuration”.</Notice>
      <Panel level={3} title="Scan context">
        <div className="form-grid form-grid--3">
          <SelectInput label="SKU" value={ctx.skuId} onChange={(v) => set({ skuId: v })} options={s.skus.map((k) => ({ value: k.id, label: `${k.code} · ${k.name}` }))} />
          <SelectInput label="Branch" value={ctx.branchCode} onChange={(v) => set({ branchCode: v })} options={ALL_BRANCHES.map((b) => ({ value: b.code, label: `${b.name} · ${b.stateName}` }))} />
          <SelectInput label="Programme" value={ctx.programme} onChange={(v) => set({ programme: v })} options={[{ value: "", label: "Not specified" }, ...PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))]} />
          <TextField label="Scan time" type="time" value={ctx.time} onChange={(v) => set({ time: v })} />
          <SelectInput label="Day" value={ctx.day} onChange={(v) => set({ day: v })} options={[{ value: "", label: "Not specified" }, ...DAYS.map((x) => ({ value: x, label: x }))]} />
          <SelectInput label="Is this a re-scan?" value={ctx.rescan} onChange={(v) => set({ rescan: v as SimContext["rescan"] })} options={yn} />
          <TextField label="Re-scan count so far" type="number" value={ctx.rescanCount} onChange={(v) => set({ rescanCount: v })} />
          <TextField label="Hours since last scan" type="number" value={ctx.hoursSinceLast} onChange={(v) => set({ hoursSinceLast: v })} />
          <SelectInput label="Parent SKU already scanned?" value={ctx.parentScanned} onChange={(v) => set({ parentScanned: v as SimContext["parentScanned"] })} options={yn} />
          <SelectInput label="Child SKU already scanned?" value={ctx.childScanned} onChange={(v) => set({ childScanned: v as SimContext["childScanned"] })} options={yn} />
          <SelectInput label="Preview a proposed rule version" value={include} onChange={setInclude} options={[{ value: "", label: "Active rules only" }, ...rules.filter((r) => versionsOf(r.versions).draft || versionsOf(r.versions).pending).map((r) => ({ value: r.id, label: `${r.code} (proposed v${(versionsOf(r.versions).draft ?? versionsOf(r.versions).pending)!.version})` }))]} />
        </div>
      </Panel>
      {out.conflict && <Notice tone="danger" icon={<ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />}>More than one rule could apply to this context, and precedence between them is not confirmed (MDR-04). No combined outcome is shown.</Notice>}
      <div className="sim-results">
        {out.results.filter((r) => r.inScope).length === 0 && <Panel level={3}><p className="muted">No active rule covers this SKU, branch and programme.</p></Panel>}
        {out.results.filter((r) => r.inScope).map((r) => (
          <Panel key={`${r.rule.id}-${r.version.version}`} level={3} title={`${r.rule.code} · v${r.version.version}${r.version.status !== "active" ? " (proposed)" : ""}`} subtitle={r.rule.name}>
            {r.tree && <SimTree n={r.tree} />}
            <p className={`sim-outcome ${r.tree?.result === true ? "sim-outcome--met" : r.tree?.result === "unknown" ? "sim-outcome--unknown" : ""}`}>{r.outcome}</p>
          </Panel>
        ))}
        {out.results.some((r) => !r.inScope) && <p className="small muted">Not applicable here: {out.results.filter((r) => !r.inScope).map((r) => `${r.rule.code} (${r.scopeReason})`).join("; ")}</p>}
      </div>
    </>
  );
}
