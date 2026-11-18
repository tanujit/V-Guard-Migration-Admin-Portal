import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Checkbox, MultiSelect, SelectInput, Stepper, Tabs, TextArea, TextField, type MultiOption } from "@/components/form/Form";
import { Segmented } from "@/components/ui/primitives";
import { useToast } from "@/context/ToastContext";
import { BASIS_LABEL, BUILDER_COMPONENTS, COMPONENT_LABEL, CONTRIBUTION_LABEL, DURATION_LABEL, EVALUATION_LABEL, SCHEME_TYPE, TARGET_DIMENSIONS, TARGET_EVENTS } from "@/config/schemeCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { ALL_BRANCHES } from "@/features/masters/engine";
import { baseOverlaps, branchesInScope, eligiblePopulation, emptyConfig, latestVersion, rowSkus, schemeById, skusInScope, versionOf } from "@/features/schemes/engine";
import { saveSchemeDraft, submitScheme } from "@/features/schemes/store";
import type { AchievementBasis, BasePointsRow, BranchScope, ComponentKey, DurationType, EvaluationType, MilestoneContribution, ProductScope, RewardDef, SchemeConfig, SchemeLevel, SchemeType, Slab, TargetDimension, TargetingCondition } from "@/types/schemes";
import { branchOptions, stateOptions } from "@/pages/masters/shared";
import { AccessDenied, PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { ConfigReview, ValidationPanel } from "./ConfigReview";
import { BASE, DecisionRef, useSchemeView, type SchemeView } from "./shared";

const PROGRAMMES = ["EP", "ST", "CS", "Retailer", "DD"];
const STEPS = ["Basics", "Applicability", "Eligibility", "Base Points", "Advanced earning", "Combined rules", "Budget & settlement", "Review"];
const num = (v: number | null) => (v == null ? "" : String(v));
const toNum = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function NumField({ label, value, onChange, hint, disabled, suffix }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string; disabled?: boolean; suffix?: string }) {
  return <TextField label={suffix ? `${label} (${suffix})` : label} value={num(value)} onChange={(s) => onChange(toNum(s))} inputMode="numeric" hint={hint ?? "No default: leave blank until confirmed"} disabled={disabled} />;
}

function RewardEditor({ label, value, onChange, v, kinds = ["fixed_points", "points_per_unit", "business_formula"] }: { label: string; value: RewardDef; onChange: (r: RewardDef) => void; v: SchemeView; kinds?: RewardDef["kind"][] }) {
  const KIND: Record<RewardDef["kind"], string> = { fixed_points: "Fixed points (explicit value)", points_per_unit: "Points per unit (explicit value)", business_formula: "Business formula (registry)" };
  return (
    <div className="form-grid form-grid--2">
      <SelectInput label={`${label}: method`} value={value.kind} onChange={(k) => onChange({ kind: k as RewardDef["kind"], value: k === "business_formula" ? null : value.value, formulaId: k === "business_formula" ? value.formulaId ?? v.s.formulas[0].id : null })} options={kinds.map((k) => ({ value: k, label: KIND[k] }))} />
      {value.kind === "business_formula" ? (
        <SelectInput label="Formula" value={value.formulaId ?? ""} onChange={(f) => onChange({ ...value, formulaId: f })} options={v.s.formulas.map((f) => ({ value: f.id, label: `${f.id} · ${f.name} · ${f.status === "confirmed" ? `v${f.version}` : "pending"}` }))} hint="A pending formula blocks activation" />
      ) : (
        <NumField label={`${label}: points`} value={value.value} onChange={(x) => onChange({ ...value, value: x })} />
      )}
    </div>
  );
}

function ProductScopeEditor({ value, onChange, v }: { value: ProductScope; onChange: (p: ProductScope) => void; v: SchemeView }) {
  const catOpts: MultiOption[] = v.ms.categories.map((c) => ({ value: c.id, label: `${c.name}${c.status !== "active" ? " (inactive)" : ""}`, disabled: c.status !== "active" }));
  const subOpts: MultiOption[] = v.ms.subCategories.map((c) => ({ value: c.id, label: c.name, group: v.ms.categories.find((x) => x.id === c.categoryId)?.name, disabled: c.status !== "active" }));
  const skuOpts: MultiOption[] = v.ms.skus.map((k) => ({ value: k.id, label: `${k.code} · ${k.name}${k.status !== "active" ? ` (${k.status})` : ""}`, group: v.ms.categories.find((c) => c.id === v.ms.products.find((p) => p.id === k.productId)?.categoryId)?.name, disabled: k.status !== "active" }));
  return (
    <div className="form-grid">
      <Checkbox label="Select all products" checked={value.allProducts} onChange={(x) => onChange({ ...value, allProducts: x })} description="Every SKU in the Product & SKU master, including future SKUs" />
      {!value.allProducts && (
        <div className="form-grid form-grid--3">
          <MultiSelect label="Categories" options={catOpts} value={value.categoryIds} onChange={(x) => onChange({ ...value, categoryIds: x })} />
          <MultiSelect label="Sub-categories" options={subOpts} value={value.subCategoryIds} onChange={(x) => onChange({ ...value, subCategoryIds: x })} hint="Covers every SKU beneath it" />
          <MultiSelect label="SKUs" options={skuOpts} value={value.skuIds} onChange={(x) => onChange({ ...value, skuIds: x })} />
        </div>
      )}
    </div>
  );
}

export function BranchScopeEditor({ value, onChange }: { value: BranchScope; onChange: (b: BranchScope) => void }) {
  const districts: MultiOption[] = GEOGRAPHY.flatMap((g) => g.districts.map((d) => ({ value: d.code, label: d.name, group: g.name })));
  return (
    <div className="form-grid">
      <Checkbox label="All branches" checked={value.allBranches} onChange={(x) => onChange({ ...value, allBranches: x })} />
      {!value.allBranches && (
        <div className="form-grid form-grid--3">
          <MultiSelect label="States" options={stateOptions()} value={value.stateCodes} onChange={(x) => onChange({ ...value, stateCodes: x })} />
          <MultiSelect label="Districts" options={districts} value={value.districtCodes} onChange={(x) => onChange({ ...value, districtCodes: x })} />
          <MultiSelect label="Branches" options={branchOptions()} value={value.branchCodes} onChange={(x) => onChange({ ...value, branchCodes: x })} />
        </div>
      )}
    </div>
  );
}

function TargetingEditor({ value, onChange, v, programmes }: { value: TargetingCondition[]; onChange: (t: TargetingCondition[]) => void; v: SchemeView; programmes: string[] }) {
  const optionsFor = (d: TargetDimension): MultiOption[] | null => {
    if (d === "programme") return programmes.map((p) => ({ value: p, label: p }));
    if (d === "state") return stateOptions();
    if (d === "district") return GEOGRAPHY.flatMap((g) => g.districts.map((x) => ({ value: x.code, label: x.name, group: g.name })));
    if (d === "branch") return branchOptions();
    if (d === "event") return TARGET_EVENTS;
    if (d === "product_category") return v.ms.categories.filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name }));
    if (d === "sub_category") return v.ms.subCategories.map((c) => ({ value: c.id, label: c.name }));
    if (d === "member_ids") return v.mem.members.filter((m) => programmes.includes(m.programme)).map((m) => ({ value: m.id, label: `${m.id} · ${m.programme}`, group: m.programme }));
    if (d === "role") return Array.from(new Set(v.mem.members.map((m) => m.memberType))).map((x) => ({ value: x, label: x }));
    return null;
  };
  const put = (i: number, p: Partial<TargetingCondition>) => onChange(value.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const groups = Array.from(new Set(Object.values(TARGET_DIMENSIONS).map((d) => d.group)));
  return (
    <div className="form-grid">
      {value.map((t, i) => {
        const def = TARGET_DIMENSIONS[t.dimension];
        const opts = optionsFor(t.dimension);
        return (
          <div key={t.id} className="cond-row">
            <SelectInput label="Dimension" value={t.dimension} onChange={(d) => put(i, { dimension: d as TargetDimension, values: [], days: null, pct: null })} options={groups.flatMap((g) => (Object.keys(TARGET_DIMENSIONS) as TargetDimension[]).filter((k) => TARGET_DIMENSIONS[k].group === g).map((k) => ({ value: k, label: `${g} · ${TARGET_DIMENSIONS[k].label}` })))} />
            {!def.needsDays && <SelectInput label="Operator" value={t.operator} onChange={(o) => put(i, { operator: o as TargetingCondition["operator"] })} options={[{ value: "in", label: "In" }, { value: "not_in", label: "Not in" }]} />}
            {!def.needsDays && (opts ? <MultiSelect label="Values" options={opts} value={t.values} onChange={(x) => put(i, { values: x })} /> : <TextField label="Values (comma separated)" value={t.values.join(", ")} onChange={(x) => put(i, { values: csv(x) })} hint={def.source} />)}
            {def.needsDays && <NumField label="X days" value={t.days} onChange={(x) => put(i, { days: x })} />}
            {def.needsPct && <NumField label="Y %" value={t.pct} onChange={(x) => put(i, { pct: x })} />}
            <p className={`small ${def.available ? "muted" : "warn-text"}`}>Source: {def.source}</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove condition"><Trash2 size={14} aria-hidden="true" />Remove</button>
          </div>
        );
      })}
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => onChange([...value, { id: `T${Date.now() % 100000}`, dimension: "branch", operator: "in", values: [], days: null, pct: null }])}><Plus size={14} aria-hidden="true" />Add targeting condition</button>
      <p className="small muted">All conditions must hold (AND). Dimensions whose source is not connected can be configured; their population is not computed and the mock engine does not credit on them.</p>
    </div>
  );
}

/** Remounts per scheme so one scheme's unsaved form state never carries into another. */
export function SchemeBuilderPage() {
  const { schemeId } = useParams();
  return <SchemeBuilder key={schemeId ?? "new"} />;
}

function SchemeBuilder() {
  const v = useSchemeView();
  const nav = useNavigate();
  const { notify } = useToast();
  const { schemeId } = useParams();
  const existing = schemeId ? schemeById(v.s, schemeId) : undefined;
  const initial = useMemo<SchemeConfig>(() => {
    if (!existing) return emptyConfig();
    const last = latestVersion(existing);
    return structuredClone(last.status === "draft" ? last.config : (versionOf(existing, existing.activeVersion) ?? last).config);
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [c, setC] = useState<SchemeConfig>(initial);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(existing ? STEPS.length - 1 : 0);
  const [reason, setReason] = useState("");
  const [adv, setAdv] = useState<"rider" | "crossSell" | "quantity" | "milestone" | "slab" | "growth">("rider");
  const [result, setResult] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(schemeId ?? null);

  if (!v.can(existing ? "schemes:edit" : "schemes:create")) return <AccessDenied message="Creating or editing schemes needs Scheme builder: Create / Edit." />;
  if (existing && ["pending_approval", "closed", "deactivated"].includes(existing.status) && latestVersion(existing).status !== "draft") return <Notice tone="warn">{existing.id} is {existing.status.replace(/_/g, " ")}: its configuration is read-only.</Notice>;

  const set = <K extends keyof SchemeConfig>(k: K, p: Partial<SchemeConfig[K]>) => setC((x) => ({ ...x, [k]: Array.isArray(x[k]) ? p : { ...(x[k] as object), ...(p as object) } }));
  const budgetLocked = !v.canOn("scheme-budget", "edit", c.basic.programmes);
  const settleLocked = !v.canOn("scheme-settlement", "edit", c.basic.programmes) && !!existing;
  const go = (i: number) => { setStep(i); setReached((r) => Math.max(r, i)); };

  const save = (andSubmit: boolean) => {
    const r = saveSchemeDraft(v.uid, savedId, c, reason || (existing ? "Configuration update" : "Initial configuration"));
    if (!r.ok) { setResult(r); return; }
    setSavedId(r.id!);
    if (!andSubmit) { setResult(r); notify(`Draft saved (${r.id})`, "positive"); return; }
    const sub = submitScheme(v.uid, r.id!, reason);
    setResult(sub);
    if (sub.ok) { notify(`Submitted for approval (${sub.id})`, "positive"); nav(`${BASE}/scheme/${r.id}`); }
  };

  const rowsOptions = (level: BasePointsRow["level"]) => (level === "category" ? v.ms.categories.filter((x) => x.status === "active").map((x) => ({ value: x.id, label: x.name })) : level === "sub_category" ? v.ms.subCategories.map((x) => ({ value: x.id, label: x.name })) : v.ms.skus.filter((k) => k.status === "active").map((k) => ({ value: k.id, label: `${k.code} · ${k.name}` })));
  const putRow = (i: number, p: Partial<BasePointsRow>) => set("base", { rows: c.base.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const overlaps = baseOverlaps(v.ms, c.base.rows);
  const scopeSkus = skusInScope(v.ms, c.products);
  const scopeBranches = branchesInScope(c.eligibility.branchScope);
  const pop = eligiblePopulation(v.mem, v.ms, c);

  const putSlab = (i: number, p: Partial<Slab>) => set("slab", { slabs: c.slab.slabs.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const comps: ComponentKey[] = ["base", "rider", "crossSell", "quantity", "category", "milestone", "slab", "growth"];

  const body: Record<number, ReactNode> = {
    0: (
      <Panel level={3} title="Basic scheme configuration" subtitle="Component 1 and 11">
        <div className="form-grid form-grid--2">
          <TextField label="Scheme name" required value={c.basic.name} onChange={(x) => set("basic", { name: x })} />
          <TextField label="Scheme code" value={c.basic.code} onChange={(x) => set("basic", { code: x.toUpperCase() })} hint="Optional; must be unique" />
        </div>
        <TextArea label="Description" value={c.basic.description} onChange={(x) => set("basic", { description: x })} />
        <div className="form-grid form-grid--3">
          <SelectInput label="Scheme type" value={c.basic.type} onChange={(x) => set("basic", { type: x as SchemeType })} options={(Object.keys(SCHEME_TYPE) as SchemeType[]).map((k) => ({ value: k, label: SCHEME_TYPE[k] }))} />
          <SelectInput label="Scheme level" value={c.basic.level ?? ""} onChange={(x) => set("basic", { level: (x || null) as SchemeLevel | null })} options={[{ value: "", label: "Not selected" }, { value: "L0", label: "Level 0 (meaning pending)" }, { value: "L1", label: "Level 1 (meaning pending)" }]} hint="OP-SB-LVL: no behavioural difference is applied" />
          <MultiSelect label="Programmes" options={PROGRAMMES.map((p) => ({ value: p, label: p }))} value={c.basic.programmes} onChange={(x) => set("basic", { programmes: x })} />
        </div>
        <Checkbox label="A calculation in this scheme depends on the Level 0 / 1 meaning" checked={c.basic.levelUsedInCalculation} onChange={(x) => set("basic", { levelUsedInCalculation: x })} description="Blocks submission and activation until OP-SB-LVL is confirmed" />
        <div className="form-grid form-grid--3">
          <TextField label="Start date" type="date" value={c.duration.start} onChange={(x) => set("duration", { start: x })} />
          <TextField label="End date" type="date" value={c.duration.end} onChange={(x) => set("duration", { end: x })} />
          <SelectInput label="Duration type" value={c.duration.type} onChange={(x) => set("duration", { type: x as DurationType })} options={(Object.keys(DURATION_LABEL) as DurationType[]).map((k) => ({ value: k, label: DURATION_LABEL[k] }))} />
        </div>
        <Segmented<EvaluationType> label="Evaluation" value={c.duration.evaluation} onChange={(x) => set("duration", { evaluation: x })} options={(Object.keys(EVALUATION_LABEL) as EvaluationType[]).map((k) => ({ value: k, label: EVALUATION_LABEL[k].label }))} />
        <p className="small muted">{EVALUATION_LABEL[c.duration.evaluation].meaning}. Financial-year windows follow the platform's April–March definition.</p>
      </Panel>
    ),
    1: (
      <>
        <Panel level={3} title="Product applicability" subtitle="Component 6 and 13 · Branch → Category → Sub-category → SKU from the Phase 4 masters">
          <ProductScopeEditor value={c.products} onChange={(p) => set("products", p)} v={v} />
        </Panel>
        <Panel level={3} title="Branch applicability">
          <BranchScopeEditor value={c.eligibility.branchScope} onChange={(b) => set("eligibility", { branchScope: b })} />
        </Panel>
        <Panel level={3} title="Mapping preview">
          <p>{scopeSkus.size} SKU(s) × {scopeBranches.size} branch(es). Inactive master records cannot be selected; inactive branches inside a state are ignored.</p>
          {c.basic.programmes.map((p) => <p key={p} className="small">{p}: {[...scopeSkus].filter((k) => v.ms.skus.find((x) => x.id === k)?.programmes.includes(p)).length} SKU(s) eligible in the SKU master</p>)}
        </Panel>
      </>
    ),
    2: (
      <>
        <Panel level={3} title="Retailer / member eligibility" subtitle="Component 12 · programme-appropriate member scope">
          <div className="form-grid form-grid--3">
            <TextField label="Groups (comma separated)" value={c.eligibility.groups.join(", ")} onChange={(x) => set("eligibility", { groups: csv(x) })} hint="SFDC retailer master: not connected" />
            <TextField label="Segments (comma separated)" value={c.eligibility.segments.join(", ")} onChange={(x) => set("eligibility", { segments: csv(x) })} hint="SFDC retailer master: not connected" />
            <SelectInput label="Elite classification" value={c.eligibility.elite} onChange={(x) => set("eligibility", { elite: x as SchemeConfig["eligibility"]["elite"] })} options={[{ value: "any", label: "Any" }, { value: "elite_only", label: "Elite only" }, { value: "exclude_elite", label: "Exclude Elite" }]} hint="Retailer only; Elite rule itself is not invented" />
          </div>
          <MultiSelect label="Selected members / Rishta IDs" options={v.mem.members.filter((m) => c.basic.programmes.includes(m.programme)).map((m) => ({ value: m.id, label: `${m.id} · ${m.name}`, group: m.programme }))} value={c.eligibility.selectedMemberIds} onChange={(x) => set("eligibility", { selectedMemberIds: x })} hint="Leave empty for everyone in scope" />
        </Panel>
        <Panel level={3} title="Targeting dimensions" subtitle="Component 14 · profile, geography, user selection, product, billed-to party, date/event, RFM, segmentation, inactivity and declining business">
          <TargetingEditor value={c.targeting} onChange={(t) => setC((x) => ({ ...x, targeting: t }))} v={v} programmes={c.basic.programmes} />
        </Panel>
        <Panel level={3} title="Resulting eligible population">
          <p>{pop.count != null ? <><strong>{pop.count}</strong> member(s)</> : <><strong>{pop.lowerBound}+</strong> counted on available attributes; not computable for {pop.notComputable.join(", ")}</>} · {pop.source}</p>
          <p className="small muted">{pop.byProgramme.map((x) => `${x.programme}: ${x.count}`).join(" · ")}</p>
        </Panel>
      </>
    ),
    3: (
      <Panel level={3} title="Base Points matrix" subtitle="Component 2 · one row per hierarchy level × programme × branches. Values are typed by the Maker; nothing is defaulted">
        <Checkbox label="Base Points enabled" checked={c.base.enabled} onChange={(x) => set("base", { enabled: x })} />
        {c.base.enabled && (
          <>
            <div className="table-scroll">
              <table className="cfg-matrix cfg-matrix--edit">
                <thead><tr><th>Level</th><th>Category / sub-category / SKU</th><th>Programme</th><th>Branches</th><th>Points per unit</th><th>Resolves to</th><th /></tr></thead>
                <tbody>
                  {c.base.rows.map((r, i) => (
                    <tr key={r.id} className={overlaps.some((o) => o.a.id === r.id || o.b.id === r.id) ? "is-conflict" : ""}>
                      <td><SelectInput label="Level" value={r.level} onChange={(x) => putRow(i, { level: x as BasePointsRow["level"], refId: rowsOptions(x as BasePointsRow["level"])[0]?.value ?? "" })} options={[{ value: "category", label: "Category" }, { value: "sub_category", label: "Sub-category" }, { value: "sku", label: "SKU" }]} /></td>
                      <td><SelectInput label="Item" value={r.refId} onChange={(x) => putRow(i, { refId: x })} options={rowsOptions(r.level)} /></td>
                      <td><SelectInput label="Programme" value={r.programme} onChange={(x) => putRow(i, { programme: x })} options={c.basic.programmes.map((p) => ({ value: p, label: p }))} /></td>
                      <td><MultiSelect label="Branches" options={[{ value: "__all", label: "All branches in scope" }, ...branchOptions((b) => scopeBranches.has(b))]} value={r.branchCodes === "all" ? ["__all"] : r.branchCodes} onChange={(x) => putRow(i, { branchCodes: x.includes("__all") ? "all" : x })} /></td>
                      <td><NumField label="Points" value={r.points} onChange={(x) => putRow(i, { points: x })} hint=" " /></td>
                      <td className="small">{rowSkus(v.ms, r).length} SKU × {r.branchCodes === "all" ? scopeBranches.size : r.branchCodes.length} br.</td>
                      <td><button type="button" className="btn btn--ghost btn--xs" onClick={() => set("base", { rows: c.base.rows.filter((_, j) => j !== i) })} aria-label="Remove row"><Trash2 size={14} aria-hidden="true" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn--secondary btn--sm" disabled={!c.basic.programmes.length} onClick={() => set("base", { rows: [...c.base.rows, { id: `BP-${c.base.rows.length + 1}-${Date.now() % 1000}`, level: "category", refId: c.products.categoryIds[0] ?? v.ms.categories[0].id, programme: c.basic.programmes[0], branchCodes: "all", points: null, qualifying: "Per unit scanned" }] })}><Plus size={14} aria-hidden="true" />Add row</button>
            {overlaps.length > 0 && <Notice tone="danger">{overlaps.length} SKU × branch combination(s) are covered by more than one row. Precedence between levels is not defined (<DecisionRef id="SCH-Q1" />): keep one row per SKU and branch.</Notice>}
            <TextField label="Qualifying criteria" value={c.base.qualifyingCriteria} onChange={(x) => set("base", { qualifyingCriteria: x })} />
            <p className="small muted">Base Points are credited redeemable, subject to KYC and redemption eligibility, and are never merged with scheme points.</p>
          </>
        )}
      </Panel>
    ),
    4: (
      <Panel level={3} title="Advanced earning constructs" subtitle="Components 3, 4, 5, 8, 9 and 10">
        <Tabs label="Constructs" value={adv} onChange={setAdv} tabs={[{ id: "rider", label: "Rider" }, { id: "crossSell", label: "Cross-sell" }, { id: "quantity", label: "Quantity" }, { id: "milestone", label: "Milestone" }, { id: "slab", label: "Slabs" }, { id: "growth", label: "Growth" }]} />
        {adv === "rider" && (
          <div className="form-grid">
            <Notice tone="warn">Rider Points activation logic and formula are open (<DecisionRef id="OP-SB-RIDER" />). The full configuration is captured; a scheme using it cannot be submitted or activated.</Notice>
            <Checkbox label="Include Rider Points" checked={c.rider.enabled} onChange={(x) => set("rider", { enabled: x })} />
            {c.rider.enabled && (<>
              <div className="form-grid form-grid--2">
                <SelectInput label="Associated Base Points condition" value={c.rider.baseCondition ?? ""} onChange={(x) => set("rider", { baseCondition: (x || null) as SchemeConfig["rider"]["baseCondition"] })} options={[{ value: "", label: "Not selected" }, { value: "base_points_threshold", label: "Base Points reach a threshold" }, { value: "base_quantity_threshold", label: "Base quantity reaches a threshold" }]} />
                <NumField label="Base threshold" value={c.rider.baseThreshold} onChange={(x) => set("rider", { baseThreshold: x })} />
              </div>
              <TextField label="Rider eligibility condition" value={c.rider.eligibility} onChange={(x) => set("rider", { eligibility: x })} />
              <TextField label="Rider activation condition" value={c.rider.activationCondition} onChange={(x) => set("rider", { activationCondition: x })} />
              <RewardEditor label="Rider reward" value={c.rider.reward} onChange={(r) => set("rider", { reward: r })} v={v} />
              <TextField label="Applicable segments (comma separated)" value={c.rider.segments.join(", ")} onChange={(x) => set("rider", { segments: csv(x) })} />
              <Checkbox label="Rider contributes to milestone calculations (eligible Elite retailers)" checked={c.rider.contributesToMilestone} onChange={(x) => set("rider", { contributesToMilestone: x })} />
            </>)}
          </div>
        )}
        {adv === "crossSell" && (
          <div className="form-grid">
            <Checkbox label="Include Cross-selling" checked={c.crossSell.enabled} onChange={(x) => set("crossSell", { enabled: x })} />
            {c.crossSell.enabled && (<>
              <MultiSelect label="Participating categories" options={v.ms.categories.filter((x) => x.status === "active").map((x) => ({ value: x.id, label: x.name }))} value={c.crossSell.categories.map((x) => x.categoryId)} onChange={(ids) => set("crossSell", { categories: ids.map((id) => c.crossSell.categories.find((x) => x.categoryId === id) ?? { categoryId: id, basis: "quantity" as AchievementBasis, minimum: null }) })} />
              {c.crossSell.categories.map((x, i) => (
                <div key={x.categoryId} className="form-grid form-grid--3">
                  <p className="small"><strong>{v.ms.categories.find((k) => k.id === x.categoryId)?.name}</strong></p>
                  <SelectInput label="Basis" value={x.basis} onChange={(b) => set("crossSell", { categories: c.crossSell.categories.map((y, j) => (j === i ? { ...y, basis: b as AchievementBasis } : y)) })} options={(Object.keys(BASIS_LABEL) as AchievementBasis[]).map((k) => ({ value: k, label: BASIS_LABEL[k] }))} />
                  <NumField label="Minimum" value={x.minimum} onChange={(m) => set("crossSell", { categories: c.crossSell.categories.map((y, j) => (j === i ? { ...y, minimum: m } : y)) })} />
                </div>
              ))}
              <NumField label="Number of categories that must qualify" value={c.crossSell.requiredCategoryCount} onChange={(x) => set("crossSell", { requiredCategoryCount: x })} />
              <RewardEditor label="Cross-sell bonus" value={c.crossSell.reward} onChange={(r) => set("crossSell", { reward: r })} v={v} kinds={["fixed_points", "business_formula"]} />
              <Checkbox label="Combine with Base Points" checked={c.crossSell.combineWithBase} onChange={(x) => set("crossSell", { combineWithBase: x })} />
              <Checkbox label="Counts toward milestones" checked={c.crossSell.contributesToMilestone} onChange={(x) => set("crossSell", { contributesToMilestone: x })} />
            </>)}
          </div>
        )}
        {adv === "quantity" && (
          <div className="form-grid">
            <Checkbox label="Include Quantity-based rewards" checked={c.quantity.enabled} onChange={(x) => set("quantity", { enabled: x })} />
            {c.quantity.enabled && (<>
              <div className="form-grid form-grid--3">
                <SelectInput label="Basis" value={c.quantity.basis} onChange={(x) => set("quantity", { basis: x as "quantity" | "scan_count" })} options={[{ value: "quantity", label: "Target quantity" }, { value: "scan_count", label: "Scan count" }]} />
                <NumField label="Qualifying threshold" value={c.quantity.threshold} onChange={(x) => set("quantity", { threshold: x })} />
                <NumField label="Target" value={c.quantity.target} onChange={(x) => set("quantity", { target: x })} />
              </div>
              <SelectInput label="Period" value={c.quantity.period} onChange={(x) => set("quantity", { period: x as SchemeConfig["quantity"]["period"] })} options={[{ value: "scheme_period", label: "Scheme period" }, ...(Object.keys(DURATION_LABEL) as DurationType[]).map((k) => ({ value: k, label: DURATION_LABEL[k] }))]} />
              <Checkbox label="Reward from quantity slabs (Slab component)" checked={c.quantity.useSlabs} onChange={(x) => set("quantity", { useSlabs: x })} />
              {!c.quantity.useSlabs && <RewardEditor label="Quantity reward" value={c.quantity.reward} onChange={(r) => set("quantity", { reward: r })} v={v} />}
            </>)}
          </div>
        )}
        {adv === "milestone" && (
          <div className="form-grid">
            <Checkbox label="Include Milestones" checked={c.milestone.enabled} onChange={(x) => set("milestone", { enabled: x })} />
            {c.milestone.enabled && (<>
              <div className="form-grid form-grid--2">
                <SelectInput label="Contributing components" value={c.milestone.contribution} onChange={(x) => set("milestone", { contribution: x as MilestoneContribution })} options={(Object.keys(CONTRIBUTION_LABEL) as MilestoneContribution[]).map((k) => ({ value: k, label: CONTRIBUTION_LABEL[k] }))} />
                <SelectInput label="Measure" value={c.milestone.measure} onChange={(x) => set("milestone", { measure: x as AchievementBasis })} options={(Object.keys(BASIS_LABEL) as AchievementBasis[]).map((k) => ({ value: k, label: BASIS_LABEL[k] }))} />
              </div>
              {c.milestone.levels.map((l, i) => (
                <div key={l.id} className="level-row">
                  <TextField label={`Level ${i + 1} name`} value={l.name} onChange={(x) => set("milestone", { levels: c.milestone.levels.map((y, j) => (j === i ? { ...y, name: x } : y)) })} />
                  <NumField label="Threshold" value={l.threshold} onChange={(x) => set("milestone", { levels: c.milestone.levels.map((y, j) => (j === i ? { ...y, threshold: x } : y)) })} />
                  <RewardEditor label="Reward" value={l.reward} onChange={(r) => set("milestone", { levels: c.milestone.levels.map((y, j) => (j === i ? { ...y, reward: r } : y)) })} v={v} kinds={["fixed_points", "business_formula"]} />
                  <button type="button" className="btn btn--ghost btn--xs" onClick={() => set("milestone", { levels: c.milestone.levels.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => set("milestone", { levels: [...c.milestone.levels, { id: `M${c.milestone.levels.length + 1}`, name: `Milestone ${c.milestone.levels.length + 1}`, threshold: null, reward: { kind: "fixed_points", value: null, formulaId: null } }] })}><Plus size={14} aria-hidden="true" />Add level</button>
              <Checkbox label="Share progress with the member app (integration contract)" checked={c.milestone.memberProgress} onChange={(x) => set("milestone", { memberProgress: x })} />
              <p className="small muted">How rewards across levels combine is open (<DecisionRef id="SCH-Q12" />).</p>
            </>)}
          </div>
        )}
        {adv === "slab" && (
          <div className="form-grid">
            <Checkbox label="Include Slabs" checked={c.slab.enabled} onChange={(x) => set("slab", { enabled: x })} />
            {c.slab.enabled && (<>
              {c.slab.slabs.map((x, i) => (
                <div key={x.id} className="slab-row">
                  <TextField label="Slab name" value={x.name} onChange={(n) => putSlab(i, { name: n })} />
                  <NumField label="Minimum" value={x.min} onChange={(n) => putSlab(i, { min: n })} hint=" " />
                  <NumField label="Maximum" value={x.max} onChange={(n) => putSlab(i, { max: n })} hint="Blank = no upper limit" />
                  <SelectInput label="Achievement" value={x.achievement} onChange={(n) => putSlab(i, { achievement: n as AchievementBasis })} options={(Object.keys(BASIS_LABEL) as AchievementBasis[]).map((k) => ({ value: k, label: BASIS_LABEL[k] }))} />
                  <NumField label="Priority" value={x.priority} onChange={(n) => putSlab(i, { priority: n ?? 0 })} hint="Lower wins on overlap" />
                  <RewardEditor label="Reward" value={x.reward} onChange={(r) => putSlab(i, { reward: r })} v={v} />
                  <TextField label="Qualification rule" value={x.qualificationRule} onChange={(n) => putSlab(i, { qualificationRule: n })} />
                  <button type="button" className="btn btn--ghost btn--xs" onClick={() => set("slab", { slabs: c.slab.slabs.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => set("slab", { slabs: [...c.slab.slabs, { id: `S${c.slab.slabs.length + 1}`, name: `Slab ${c.slab.slabs.length + 1}`, min: null, max: null, achievement: "quantity", reward: { kind: "fixed_points", value: null, formulaId: null }, qualificationRule: "", priority: c.slab.slabs.length + 1 }] })}><Plus size={14} aria-hidden="true" />Add slab</button>
              <h4 className="cfg-sub">Downgrade and reversal</h4>
              <div className="form-grid form-grid--2">
                <SelectInput label="Reversal eligibility" value={c.slab.reversal.eligible == null ? "" : String(c.slab.reversal.eligible)} onChange={(x) => set("slab", { reversal: { ...c.slab.reversal, eligible: x === "" ? null : x === "true", reductionHandling: x === "true" ? "re_evaluate_net_activity" : null, adjustmentFormulaId: x === "true" ? "FRM-REVERSAL" : null } })} options={[{ value: "", label: "Not configured" }, { value: "true", label: "Reductions (e.g. sales return) re-evaluate the slab" }, { value: "false", label: "Not eligible for reversal" }]} />
                <TextField label="Downgrade outcome" value={c.slab.reversal.downgradeOutcome} onChange={(x) => set("slab", { reversal: { ...c.slab.reversal, downgradeOutcome: x } })} />
              </div>
              <p className="small muted">Corrections are linked to the original ledger entry and recorded as pending; the formula is open (<DecisionRef id="SCH-Q7" />). The original reward is never deleted.</p>
            </>)}
          </div>
        )}
        {adv === "growth" && (
          <div className="form-grid">
            <Notice tone="warn">Growth calculation basis, reward mechanics and programme applicability are open (<DecisionRef id="OP-01" />). Configurable; not activatable.</Notice>
            <Checkbox label="Include Growth-based" checked={c.growth.enabled} onChange={(x) => set("growth", { enabled: x })} />
            {c.growth.enabled && (<>
              <div className="form-grid form-grid--2">
                <TextField label="Baseline from" type="date" value={c.growth.baselineFrom} onChange={(x) => set("growth", { baselineFrom: x })} />
                <TextField label="Baseline to" type="date" value={c.growth.baselineTo} onChange={(x) => set("growth", { baselineTo: x })} />
                <TextField label="Comparison from" type="date" value={c.growth.comparisonFrom} onChange={(x) => set("growth", { comparisonFrom: x })} />
                <TextField label="Comparison to" type="date" value={c.growth.comparisonTo} onChange={(x) => set("growth", { comparisonTo: x })} />
              </div>
              <div className="form-grid form-grid--3">
                <NumField label="Required growth" suffix="%" value={c.growth.requiredGrowthPct} onChange={(x) => set("growth", { requiredGrowthPct: x })} />
                <SelectInput label="Calculation basis" value={c.growth.basis ?? ""} onChange={(x) => set("growth", { basis: (x || null) as AchievementBasis | null })} options={[{ value: "", label: "Not selected" }, ...(Object.keys(BASIS_LABEL) as AchievementBasis[]).map((k) => ({ value: k, label: BASIS_LABEL[k] }))]} />
                <MultiSelect label="Programme applicability" options={PROGRAMMES.map((p) => ({ value: p, label: p }))} value={c.growth.programmeApplicability} onChange={(x) => set("growth", { programmeApplicability: x })} hint="Not preselected (OP-01)" />
              </div>
              <Checkbox label="Optional Rider activation" checked={c.growth.riderActivation} onChange={(x) => set("growth", { riderActivation: x })} />
              <Checkbox label="Contributes to milestones" checked={c.growth.milestoneContribution} onChange={(x) => set("growth", { milestoneContribution: x })} />
            </>)}
          </div>
        )}
      </Panel>
    ),
    5: (
      <Panel level={3} title="Combined rules" subtitle="Component 7 · SOW examples: Base + Rider; Base + Cross-sell + Milestone; Quantity + Slab; Category + Quantity + Milestone">
        <Checkbox label="Evaluate components together" checked={c.combined.enabled} onChange={(x) => set("combined", { enabled: x })} />
        {c.combined.enabled && (
          <div className="form-grid">
            <MultiSelect label="Participating components" options={comps.map((k) => ({ value: k, label: COMPONENT_LABEL[k] }))} value={c.combined.components} onChange={(x) => set("combined", { components: x as ComponentKey[] })} />
            <Segmented label="Relationship" value={c.combined.relation} onChange={(x) => set("combined", { relation: x })} options={[{ value: "all_of", label: "All must qualify" }, { value: "any_of", label: "Any qualifies" }]} />
            {c.combined.dependencies.map((d, i) => (
              <div key={i} className="form-grid form-grid--3">
                <SelectInput label="Component" value={d.component} onChange={(x) => set("combined", { dependencies: c.combined.dependencies.map((y, j) => (j === i ? { ...y, component: x as ComponentKey } : y)) })} options={c.combined.components.map((k) => ({ value: k, label: COMPONENT_LABEL[k] }))} />
                <SelectInput label="Depends on" value={d.dependsOn} onChange={(x) => set("combined", { dependencies: c.combined.dependencies.map((y, j) => (j === i ? { ...y, dependsOn: x as ComponentKey } : y)) })} options={comps.map((k) => ({ value: k, label: COMPONENT_LABEL[k] }))} />
                <button type="button" className="btn btn--ghost btn--xs" onClick={() => set("combined", { dependencies: c.combined.dependencies.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn btn--secondary btn--sm" disabled={c.combined.components.length < 2} onClick={() => set("combined", { dependencies: [...c.combined.dependencies, { component: c.combined.components[1], dependsOn: c.combined.components[0] }] })}><Plus size={14} aria-hidden="true" />Add dependency</button>
            <p className="rule-readout"><strong>Effective rule:</strong> {c.combined.relation === "all_of" ? "All of" : "Any of"} [{c.combined.components.map((k) => COMPONENT_LABEL[k]).join(", ")}]{c.combined.dependencies.length ? `, where ${c.combined.dependencies.map((d) => `${COMPONENT_LABEL[d.component]} requires ${COMPONENT_LABEL[d.dependsOn]}`).join(" and ")}` : ""}. Execution order is not assumed (<DecisionRef id="SCH-Q4" />).</p>
          </div>
        )}
      </Panel>
    ),
    6: (
      <>
        <Panel level={3} title="Backdated calculation" subtitle="Component 15 · e.g. announced 15 June, effective 1 May">
          <Checkbox label="This scheme is announced after its effective start date" checked={c.backdated.enabled} onChange={(x) => set("backdated", { enabled: x })} />
          {c.backdated.enabled && (
            <div className="form-grid form-grid--3">
              <TextField label="Announcement date" type="date" value={c.backdated.announcementDate} onChange={(x) => set("backdated", { announcementDate: x })} />
              <TextField label="Historical from" type="date" value={c.backdated.historicalFrom} onChange={(x) => set("backdated", { historicalFrom: x })} />
              <TextField label="Historical to" type="date" value={c.backdated.historicalTo} onChange={(x) => set("backdated", { historicalTo: x })} />
            </div>
          )}
          <p className="small muted">The historical run is never triggered by approval of the scheme or from the browser. It is a separate request with two-level approval, run by the engine operator and idempotent per transaction.</p>
        </Panel>
        <Panel level={3} title="Budget & exposure control" subtitle={budgetLocked ? "Read-only: needs Scheme budget & exposure: Edit" : "Unit: points"}>
          <div className="form-grid form-grid--3">
            <NumField label="Budget cap" suffix="points" value={c.budget.amount} onChange={(x) => set("budget", { amount: x })} disabled={budgetLocked} />
            <NumField label="Alert at" suffix="% utilisation" value={c.budget.alertPct} onChange={(x) => set("budget", { alertPct: x })} disabled={budgetLocked} />
            <Checkbox label="Auto-stop when the cap is reached" checked={c.budget.autoStop} onChange={(x) => set("budget", { autoStop: x })} disabled={budgetLocked} />
          </div>
          <p className="small muted">Rupee valuation of points is a financial configuration and is not set here. Auto-stop is enforced by the mock engine only; production enforcement needs the backend engine.</p>
        </Panel>
        <Panel level={3} title="Settlement configuration" subtitle={settleLocked ? "Read-only: needs Scheme settlement: Edit" : "Module 5.2 · Base Points are never part of settlement"}>
          <Segmented label="Settlement mode" value={c.settlement.mode} onChange={(x) => !settleLocked && set("settlement", { mode: x, tranches: x === "at_closure" ? [{ id: "T1", label: "Final settlement", pct: 100, trigger: "final_settlement", conditions: "After closure and validation" }] : [{ id: "T1", label: "Release during the scheme", pct: null, trigger: "during_scheme", conditions: "" }, { id: "T2", label: "Final settlement", pct: null, trigger: "final_settlement", conditions: "After closure and validation" }] })} options={[{ value: "at_closure", label: "At closure" }, { value: "partial_release", label: "Partial release" }]} />
          {c.settlement.tranches.map((t, i) => (
            <div key={t.id} className="form-grid form-grid--4">
              <TextField label="Tranche" value={t.label} onChange={(x) => set("settlement", { tranches: c.settlement.tranches.map((y, j) => (j === i ? { ...y, label: x } : y)) })} disabled={settleLocked} />
              <NumField label="Release" suffix="%" value={t.pct} onChange={(x) => set("settlement", { tranches: c.settlement.tranches.map((y, j) => (j === i ? { ...y, pct: x } : y)) })} disabled={settleLocked || c.settlement.mode === "at_closure"} hint="Explicit; no default split" />
              <SelectInput label="Trigger" value={t.trigger} onChange={(x) => set("settlement", { tranches: c.settlement.tranches.map((y, j) => (j === i ? { ...y, trigger: x as typeof t.trigger } : y)) })} options={[{ value: "during_scheme", label: "During the scheme" }, { value: "month_end", label: "Month end" }, { value: "final_settlement", label: "Final settlement" }]} disabled={settleLocked} />
              <TextField label="Release conditions" value={t.conditions} onChange={(x) => set("settlement", { tranches: c.settlement.tranches.map((y, j) => (j === i ? { ...y, conditions: x } : y)) })} disabled={settleLocked} />
            </div>
          ))}
          {c.settlement.mode === "partial_release" && !settleLocked && <button type="button" className="btn btn--secondary btn--sm" onClick={() => set("settlement", { tranches: [...c.settlement.tranches.slice(0, -1), { id: `T${c.settlement.tranches.length + 1}`, label: "Additional release", pct: null, trigger: "month_end", conditions: "" }, c.settlement.tranches[c.settlement.tranches.length - 1]] })}><Plus size={14} aria-hidden="true" />Add tranche</button>}
          <p className="small">Total: <strong>{c.settlement.tranches.reduce((n, t) => n + (t.pct ?? 0), 0)}%</strong> (must be exactly 100%; residuals are never rounded or discarded). The SOW's 70 / 30 split is an example, not a default.</p>
        </Panel>
      </>
    ),
    7: (
      <>
        <Panel level={3} title="Projected liability" subtitle="Component 17 · OP-SB-LIAB">
          <Notice tone="warn">Projected Liability: <strong>Pending business formula</strong>. No estimate is calculated or shown. The approval request records that no liability figure was available, and production activation stays blocked until V-Guard approves the formula.</Notice>
        </Panel>
        <ValidationPanel c={c} s={v.s} ms={v.ms} mem={v.mem} schemeId={savedId} today={v.today} />
        <Panel level={3} title="Complete configuration">
          <ConfigReview c={c} s={v.s} ms={v.ms} mem={v.mem} financial={v.financial || v.canOn("scheme-budget", "view", c.basic.programmes)} />
        </Panel>
        <Panel level={3} title="Change note">
          <TextArea label="Reason for this configuration / change" value={reason} onChange={setReason} hint="Shown to the Checker and written to the audit trail" />
        </Panel>
      </>
    ),
  };

  return (
    <>
      <SectionTitle title={existing ? `Edit ${existing.id} · ${latestVersion(existing).status === "draft" ? `draft v${latestVersion(existing).version}` : `new version v${latestVersion(existing).version + 1}`}` : "Create scheme"} description="A draft generates no rewards. Submitted versions are read-only; changes after approval create a new version" />
      <div className="sch-stepper"><Stepper steps={STEPS} current={step} onSelect={go} maxReached={reached} /></div>
      <div className="builder-grid">
        <div className="builder-main">{body[step]}</div>
        <aside className="builder-side">
          <Panel level={4} title="Components in this step">
            <ul className="comp-list">
              {BUILDER_COMPONENTS.filter((b) => ({ 0: [1, 11], 1: [6, 13], 2: [12, 14], 3: [2], 4: [3, 4, 5, 8, 9, 10], 5: [7], 6: [15], 7: [16, 17, 18, 19, 20, 21] } as Record<number, number[]>)[step].includes(b.n)).map((b) => <li key={b.n}><span className="comp-list__n">{b.n}</span>{b.name}{b.decision && <> · <DecisionRef id={b.decision} /></>}</li>)}
            </ul>
            {step === 7 && <p className="small muted">16 Concurrency, 18 Lifecycle, 19 Performance and 20 Audit continue on the scheme page after saving. 21 is in Governance.</p>}
          </Panel>
        </aside>
      </div>
      <PolicyMessages result={result} />
      <div className="btn-row wizard-actions">
        <button type="button" className="btn btn--ghost" disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
        {step < STEPS.length - 1 && <button type="button" className="btn btn--secondary" onClick={() => go(step + 1)}>Next</button>}
        <button type="button" className="btn btn--secondary" onClick={() => save(false)}><Save size={16} aria-hidden="true" />Save draft</button>
        {step === STEPS.length - 1 && v.canOn("schemes", "submit", c.basic.programmes) && <button type="button" className="btn btn--primary" onClick={() => save(true)}><Send size={16} aria-hidden="true" />Save and submit for approval</button>}
        {savedId && <button type="button" className="btn btn--ghost" onClick={() => nav(`${BASE}/scheme/${savedId}`)}>Open scheme</button>}
      </div>
      <p className="small muted">Branches in the hierarchy: {ALL_BRANCHES.length}. Values typed here are configuration, not V-Guard production values.</p>
    </>
  );
}
