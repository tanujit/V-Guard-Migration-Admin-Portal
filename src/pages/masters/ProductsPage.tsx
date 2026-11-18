import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Boxes, ChevronLeft, ChevronRight, FileUp, History, Pencil, Plus, Power, PowerOff, RotateCcw, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Drawer } from "@/components/ui/Overlay";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { EmptyState, ProgrammeTag, SelectField } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, RadioCards, SelectInput, Stepper, Tabs, TextArea, TextField } from "@/components/form/Form";
import { PROGRAMMES } from "@/config/programmes";
import { GEOGRAPHY } from "@/config/geography";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { ALL_BRANCHES, branchByCode, categoryById, pointsState, productById, skuDependencies, skusOfProduct, subById, validateProduct, validateSkus, versionsOf, type ProductDraft, type SkuDraft } from "@/features/masters/engine";
import { createProduct, saveSku, setProductMappings, setProductStatus, updateProduct } from "@/features/masters/store";
import { formatDateTime } from "@/lib/format";
import type { Product, Sku } from "@/types/masters";
import { AccessDenied, PolicyMessages, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { MasterAuditTable } from "./OverviewPage";
import { ApprovalLink, branchOptions, ConfigBadge, FieldError, MastersLayout, RecordBadge, useApprovalLookup, useMasterView, userName } from "./shared";

export function ProductsLayout() {
  return (
    <MastersLayout
      title="Product & SKU master"
      description="Products, their SKUs, category placement, branch mapping, warranty and installation"
      permission="products:view"
      tabs={[
        { to: "/masters/products", label: "Directory", icon: Boxes },
        { to: "/masters/products/import", label: "Bulk import", icon: FileUp, perm: "products:create" },
        { to: "/masters/products/imports", label: "Import history", icon: History },
      ]}
    />
  );
}

interface Row {
  p: Product;
  k: Sku | null;
}

const warrantyText = (p: Product) => (p.warranty.value === null ? "Not set" : `${p.warranty.value} ${p.warranty.unit}`);

export function ProductDirectoryPage() {
  const { s, can } = useMasterView();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sub, setSub] = useState("all");
  const [prog, setProg] = useState("all");
  const [region, setRegion] = useState("all");
  const [scan, setScan] = useState("all");
  const [warranty, setWarranty] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const status = params.get("status") ?? "all";

  const rows: Row[] = useMemo(() => s.products.flatMap((p): Row[] => { const ks = skusOfProduct(s, p.id); return ks.length ? ks.map((k) => ({ p, k })) : [{ p, k: null }]; }), [s]);
  const mappedStates = useMemo(() => {
    const m = new Map<string, Set<string>>();
    s.mappings.filter((x) => x.status === "active").forEach((x) => { const set = m.get(x.productId) ?? new Set(); set.add(branchByCode.get(x.branchCode)?.state ?? ""); m.set(x.productId, set); });
    return m;
  }, [s.mappings]);
  const mappedCount = (pid: string) => s.mappings.filter((m) => m.productId === pid && m.status === "active").length;
  const scanCfg = (k: Sku | null, side: "scanIn" | "scanOut") => {
    if (!k) return "none";
    const cs = s.scanPoints.filter((c) => c.skuId === k.id && !c.retired);
    if (cs.some((c) => pointsState(c) === "active" && versionsOf(c.versions).active?.[side] !== null)) return "configured";
    if (cs.some((c) => ["pending", "draft"].includes(pointsState(c)))) return "in_progress";
    return "none";
  };
  const filtered = rows.filter(({ p, k }) => {
    const t = q.trim().toLowerCase();
    if (t && ![p.name, p.code, k?.code ?? "", k?.name ?? ""].join(" ").toLowerCase().includes(t)) return false;
    if (cat !== "all" && p.categoryId !== cat) return false;
    if (sub !== "all" && p.subCategoryId !== sub) return false;
    if (prog !== "all" && !k?.programmes.includes(prog)) return false;
    if (region !== "all" && !mappedStates.get(p.id)?.has(region)) return false;
    const st = k?.status ?? p.status;
    if (status === "inactive" ? st === "active" : status !== "all" && st !== status) return false;
    if (scan === "configured" && scanCfg(k, "scanIn") !== "configured" && scanCfg(k, "scanOut") !== "configured") return false;
    if (scan === "none" && (scanCfg(k, "scanIn") !== "none" || scanCfg(k, "scanOut") !== "none")) return false;
    if (warranty === "set" && p.warranty.value === null) return false;
    if (warranty === "none" && p.warranty.value !== null) return false;
    return true;
  });
  const any = q || cat !== "all" || sub !== "all" || prog !== "all" || region !== "all" || status !== "all" || scan !== "all" || warranty !== "all";
  const clear = () => { setQ(""); setCat("all"); setSub("all"); setProg("all"); setRegion("all"); setScan("all"); setWarranty("all"); setParams({}); };
  const cfgLabel = (x: string) => (x === "configured" ? <span className="pos small">Configured</span> : x === "in_progress" ? <span className="small warn-text">In progress</span> : <span className="muted small">Not configured</span>);

  const columns: Column<Row>[] = [
    { key: "pid", header: "Product ID", value: (r) => r.p.id, render: (r) => <span className="mono small">{r.p.id}</span> },
    { key: "name", header: "Product name", value: (r) => r.p.name, render: (r) => <span className="cell-wrap">{r.p.name}</span> },
    { key: "pcode", header: "Product code", value: (r) => r.p.code, render: (r) => <span className="mono small">{r.p.code}</span> },
    { key: "sid", header: "SKU ID", value: (r) => r.k?.id ?? "", render: (r) => <span className="mono small">{r.k?.id ?? "—"}</span> },
    { key: "scode", header: "SKU code", value: (r) => r.k?.code ?? "", render: (r) => (r.k ? <span className="mono small">{r.k.code}</span> : <span className="muted small">No SKU</span>) },
    { key: "cat", header: "Category", value: (r) => categoryById(s, r.p.categoryId)?.name ?? "", render: (r) => <span className="small">{categoryById(s, r.p.categoryId)?.name}</span> },
    { key: "sub", header: "Sub-category", value: (r) => subById(s, r.p.subCategoryId)?.name ?? "", render: (r) => <span className="small">{subById(s, r.p.subCategoryId)?.name}</span> },
    { key: "prog", header: "Programmes", value: (r) => r.k?.programmes.join(", ") ?? "", render: (r) => (r.k?.programmes.length ? <span className="tag-row">{r.k.programmes.map((x) => <ProgrammeTag key={x} code={x} size="sm" />)}</span> : <span className="muted small">Not set</span>) },
    { key: "map", header: "Branch / region", value: (r) => mappedCount(r.p.id), render: (r) => <span className="small">{mappedCount(r.p.id)} branches · {mappedStates.get(r.p.id)?.size ?? 0} states</span> },
    { key: "in", header: "Scan-In", value: (r) => scanCfg(r.k, "scanIn"), render: (r) => cfgLabel(scanCfg(r.k, "scanIn")) },
    { key: "out", header: "Scan-Out", value: (r) => scanCfg(r.k, "scanOut"), render: (r) => cfgLabel(scanCfg(r.k, "scanOut")) },
    { key: "warranty", header: "Warranty", value: (r) => warrantyText(r.p), render: (r) => <span className="small">{warrantyText(r.p)}</span> },
    { key: "install", header: "Installation", value: (r) => (r.p.installationRequired ? "Yes" : "No") },
    { key: "status", header: "Status", value: (r) => r.k?.status ?? r.p.status, render: (r) => <RecordBadge status={r.k?.status ?? r.p.status} /> },
    { key: "modified", header: "Last modified", value: (r) => (r.k && r.k.updatedAt > r.p.updatedAt ? r.k.updatedAt : r.p.updatedAt), render: (r) => <span className="small num">{formatDateTime(r.k && r.k.updatedAt > r.p.updatedAt ? r.k.updatedAt : r.p.updatedAt)}</span> },
    { key: "actions", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (r) => <Link to={`/masters/products/${r.p.id}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>{can("products:edit") ? "View / edit" : "View"}</Link> },
  ];

  return (
    <>
      <SectionTitle
        title="Product & SKU directory"
        description="One row per SKU. Products without a SKU yet show a single row"
        actions={can("products:create") && (
          <Link to="/masters/products/new" className="btn btn--primary">
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Create product
          </Link>
        )}
      />
      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={q} onChange={setQ} placeholder="Product name, product code or SKU code" label="Search products" />
          <SelectField label="Category" value={cat} onChange={(v) => { setCat(v); setSub("all"); }} options={[{ value: "all", label: "All categories" }, ...s.categories.map((c) => ({ value: c.id, label: c.name }))]} active={cat !== "all"} />
          <SelectField label="Sub-category" value={sub} onChange={setSub} options={[{ value: "all", label: "All sub-categories" }, ...s.subCategories.filter((x) => cat === "all" || x.categoryId === cat).map((c) => ({ value: c.id, label: c.name }))]} active={sub !== "all"} />
          <SelectField label="Programme" value={prog} onChange={setProg} options={[{ value: "all", label: "All programmes" }, ...PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))]} active={prog !== "all"} />
          <SelectField label="Branch / region" value={region} onChange={setRegion} options={[{ value: "all", label: "Any region" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} active={region !== "all"} />
          <SelectField label="Status" value={status} onChange={(v) => setParams(v === "all" ? {} : { status: v })} options={[{ value: "all", label: "Any status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive or draft" }, { value: "draft", label: "Draft" }]} active={status !== "all"} />
          <SelectField label="Scan configuration" value={scan} onChange={setScan} options={[{ value: "all", label: "Any" }, { value: "configured", label: "Configured" }, { value: "none", label: "Not configured" }]} active={scan !== "all"} />
          <SelectField label="Warranty" value={warranty} onChange={setWarranty} options={[{ value: "all", label: "Any" }, { value: "set", label: "Warranty set" }, { value: "none", label: "No warranty set" }]} active={warranty !== "all"} />
          <div className="filters-bar__end">
            <SelectField label="Rows per page" value={String(pageSize)} onChange={(v) => setPageSize(Number(v))} options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={clear} disabled={!any}>
              <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
              Clear all
            </button>
          </div>
        </div>
        <p className="filters-bar__count" aria-live="polite">{filtered.length} of {rows.length} SKU rows</p>
        <DataTable key={pageSize} rows={filtered} columns={columns} rowKey={(r) => r.k?.id ?? r.p.id} caption="Product and SKU directory" searchable={false} pageSize={pageSize} exportName={can("products:export") ? "product-sku-directory" : undefined} onRowClick={(r) => navigate(`/masters/products/${r.p.id}`)} rowActionLabel={(r) => `Open ${r.p.name}`} initialSort={{ key: "pid", dir: "asc" }} emptyTitle="No products match these filters" />
      </Panel>
    </>
  );
}

/* ---------------- Create product wizard ---------------- */

const STEPS = ["Basic details", "SKUs", "Category", "Warranty & installation", "Review & save"];
const emptyProduct = (): ProductDraft => ({ code: "", name: "", description: "", categoryId: "", subCategoryId: "", status: "active", warranty: { value: null, unit: "years" }, installationRequired: false });
const emptySku = (): SkuDraft => ({ code: "", name: "", status: "active", programmes: [] });

export function ProductWizardPage() {
  const { s, can, uid } = useMasterView();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [d, setD] = useState<ProductDraft>(emptyProduct);
  const [skus, setSkus] = useState<SkuDraft[]>([emptySku()]);
  const [step, setStep] = useState(0);
  const [max, setMax] = useState(0);
  const [res, setRes] = useState<PolicyResult | null>(null);
  if (!can("products:create")) return <AccessDenied message="Creating products needs Product & SKU master: Create." />;
  const errs = validateProduct(s, d);
  const skuErrs = validateSkus(s, skus);
  const stepErrors = [
    [errs.name, errs.code].filter(Boolean),
    skuErrs,
    [errs.categoryId, errs.subCategoryId].filter(Boolean),
    [errs.warranty].filter(Boolean),
    [],
  ][step] as string[];
  const set = (patch: Partial<ProductDraft>) => setD((x) => ({ ...x, ...patch }));
  const go = (i: number) => { setStep(i); setMax((m) => Math.max(m, i)); };
  const save = (asDraft: boolean) => {
    const out = createProduct(uid, { ...d, status: asDraft ? "draft" : d.status }, skus.filter((k) => k.code.trim()).map((k) => (asDraft ? { ...k, status: "draft" } : k)));
    setRes(out);
    if (out.ok) {
      notify(`${d.code} ${asDraft ? "saved as draft" : "created"}`, "positive");
      navigate(`/masters/products/${out.id}`);
    }
  };
  const cat = categoryById(s, d.categoryId);
  return (
    <div className="wizard">
      <Link to="/masters/products" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Product directory</Link>
      <SectionTitle title="Create product" description="Product creation is a direct, audited change: no approval policy covers it yet (decision MDR-06)" />
      <Stepper steps={STEPS} current={step} onSelect={go} maxReached={max} />
      <Panel level={3} title={STEPS[step]}>
        {step === 0 && (
          <div className="form-grid form-grid--2">
            <div><TextField label="Product name" required value={d.name} onChange={(v) => set({ name: v })} /><FieldError msg={d.name ? undefined : undefined} /></div>
            <div><TextField label="Product code" required value={d.code} onChange={(v) => set({ code: v })} hint="Unique, case-insensitive. The official code format is not defined yet (MDR-08)" error={d.code ? errs.code : undefined} /></div>
            <TextArea label="Description" value={d.description} onChange={(v) => set({ description: v })} rows={2} />
            <SelectInput label="Status" value={d.status} onChange={(v) => set({ status: v as Product["status"] })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} hint="Use “Save as draft” on the last step for a draft" />
          </div>
        )}
        {step === 1 && (
          <>
            <p className="small muted">A product can have one or more SKUs. SKUs are not mapped to any branch automatically.</p>
            {skus.map((k, i) => (
              <div key={i} className="stage-edit">
                <div className="stage-edit__head">
                  <strong>SKU {i + 1}</strong>
                  <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove SKU ${i + 1}`} onClick={() => setSkus(skus.filter((_, j) => j !== i))} disabled={skus.length === 1}><Trash2 size={14} strokeWidth={2} /></button>
                </div>
                <div className="form-grid form-grid--2">
                  <TextField label="SKU code" required value={k.code} onChange={(v) => setSkus(skus.map((x, j) => (j === i ? { ...x, code: v } : x)))} />
                  <TextField label="SKU name or description" value={k.name} onChange={(v) => setSkus(skus.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
                  <SelectInput label="SKU status" value={k.status} onChange={(v) => setSkus(skus.map((x, j) => (j === i ? { ...x, status: v as Sku["status"] } : x)))} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
                  <MultiSelect label="Applicable programmes" value={k.programmes} onChange={(v) => setSkus(skus.map((x, j) => (j === i ? { ...x, programmes: v } : x)))} options={PROGRAMMES.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))} placeholder="None yet" hint="Empty means not yet eligible for any programme" />
                </div>
              </div>
            ))}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSkus([...skus, emptySku()])}><Plus size={14} strokeWidth={2} aria-hidden="true" />Add SKU</button>
          </>
        )}
        {step === 2 && (
          <div className="form-grid form-grid--2">
            <SelectInput label="Category" required value={d.categoryId} onChange={(v) => set({ categoryId: v, subCategoryId: "" })} options={[{ value: "", label: "Choose" }, ...s.categories.map((c) => ({ value: c.id, label: c.name, disabled: c.status !== "active" }))]} hint="From the central Category & Sub-Category master" />
            <SelectInput label="Sub-category" required value={d.subCategoryId} onChange={(v) => set({ subCategoryId: v })} options={[{ value: "", label: d.categoryId ? "Choose" : "Choose a category first" }, ...s.subCategories.filter((x) => x.categoryId === d.categoryId).map((c) => ({ value: c.id, label: c.name, disabled: c.status !== "active" }))]} disabled={!d.categoryId} />
            {cat && (
              <div className="hierarchy-preview">
                <p className="small muted">Hierarchy</p>
                <p><strong>{cat.name}</strong></p>
                <ul>{s.subCategories.filter((x) => x.categoryId === cat.id).map((x) => <li key={x.id} className={x.id === d.subCategoryId ? "is-on" : ""}>{x.name}{x.status !== "active" ? " (inactive)" : ""}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="form-grid form-grid--2">
            <TextField label="Warranty duration" type="number" value={d.warranty.value?.toString() ?? ""} onChange={(v) => set({ warranty: { ...d.warranty, value: v === "" ? null : Number(v) } })} hint="Leave empty if not defined; it is not treated as 0" />
            <SelectInput label="Warranty unit" value={d.warranty.unit} onChange={(v) => set({ warranty: { ...d.warranty, unit: v as "months" | "years" } })} options={[{ value: "months", label: "Months" }, { value: "years", label: "Years" }]} />
            <RadioCards name="install" label="Installation required" value={d.installationRequired ? "yes" : "no"} onChange={(v) => set({ installationRequired: v === "yes" })} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
            <p className="small muted">No installation workflow fields are captured in this phase; the source model defines only the Yes/No flag.</p>
          </div>
        )}
        {step === 4 && (
          <>
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Product</dt><dd>{d.code || "—"} · {d.name || "—"}</dd></div>
              <div className="kv__row"><dt>Description</dt><dd>{d.description || "—"}</dd></div>
              <div className="kv__row"><dt>Category</dt><dd>{cat?.name ?? "—"} › {subById(s, d.subCategoryId)?.name ?? "—"}</dd></div>
              <div className="kv__row"><dt>SKUs</dt><dd>{skus.filter((k) => k.code).map((k) => `${k.code} (${k.status}${k.programmes.length ? `, ${k.programmes.join("/")}` : ""})`).join("; ") || "None"}</dd></div>
              <div className="kv__row"><dt>Warranty</dt><dd>{d.warranty.value === null ? "Not set" : `${d.warranty.value} ${d.warranty.unit}`}</dd></div>
              <div className="kv__row"><dt>Installation required</dt><dd>{d.installationRequired ? "Yes" : "No"}</dd></div>
              <div className="kv__row"><dt>Status</dt><dd>{d.status}</dd></div>
            </dl>
            <PolicyMessages result={{ errors: [...Object.values(errs), ...skuErrs], warnings: [] }} title="Resolve before saving" />
            <PolicyMessages result={res} title="Not saved" />
            <div className="btn-row">
              <button type="button" className="btn btn--ghost" onClick={() => navigate("/masters/products")}>Cancel</button>
              <button type="button" className="btn btn--secondary" onClick={() => save(true)}>Save as draft</button>
              <button type="button" className="btn btn--primary" onClick={() => save(false)} disabled={Object.keys(errs).length > 0 || skuErrs.length > 0}>Create product</button>
            </div>
          </>
        )}
        {step < 4 && stepErrors.length > 0 && (step !== 0 || d.name || d.code) && <PolicyMessages result={{ errors: stepErrors, warnings: [] }} title="Check this step" />}
      </Panel>
      <div className="wizard__nav">
        <button type="button" className="btn btn--ghost" onClick={() => go(step - 1)} disabled={step === 0}><ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />Back</button>
        {step < 4 && <button type="button" className="btn btn--dark" onClick={() => go(step + 1)}>Next<ChevronRight size={16} strokeWidth={2} aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

/* ---------------- Product detail ---------------- */

type Tab = "overview" | "skus" | "mapping" | "scan" | "warranty" | "history";

export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const { s, acc, can, uid } = useMasterView();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "overview";
  const { notify } = useToast();
  const lookup = useApprovalLookup();
  const p = productById(s, productId);
  const [edit, setEdit] = useState<ProductDraft | null>(null);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [statusDialog, setStatusDialog] = useState<Product["status"] | null>(null);
  const [skuEdit, setSkuEdit] = useState<{ id: string | null; d: SkuDraft } | null>(null);
  const [mapEdit, setMapEdit] = useState<string[] | null>(null);
  if (!p) return <AccessDenied message={`Product ${productId} was not found.`} />;
  const skus = skusOfProduct(s, p.id);
  const mappings = s.mappings.filter((m) => m.productId === p.id);
  const configs = s.scanPoints.filter((c) => skus.some((k) => k.id === c.skuId));
  const history = s.audit.filter((e) => e.entityId === p.id || skus.some((k) => k.id === e.entityId) || configs.some((c) => c.id === e.entityId));
  const toDraft = (x: Product): ProductDraft => ({ code: x.code, name: x.name, description: x.description, categoryId: x.categoryId, subCategoryId: x.subCategoryId, status: x.status, warranty: x.warranty, installationRequired: x.installationRequired });
  const editErrs = edit ? validateProduct(s, edit, p.id) : {};

  return (
    <div className="req">
      <Link to="/masters/products" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Product directory</Link>
      <section className="req-head panel">
        <div className="req-head__top">
          <div>
            <p className="req-head__id mono">{p.id} · {p.code}</p>
            <h2 className="req-head__title">{p.name}</h2>
            <p className="req-head__type">{categoryById(s, p.categoryId)?.name} › {subById(s, p.subCategoryId)?.name} · {skus.length} SKU{skus.length === 1 ? "" : "s"}</p>
          </div>
          <div className="req-head__badges">
            <RecordBadge status={p.status} />
            {can("products:edit") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setEdit(toDraft(p)); setReason(""); setRes(null); }}><Pencil size={14} strokeWidth={2} aria-hidden="true" />Edit product</button>}
            {p.status === "active" ? can("products:disable") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStatusDialog("inactive")}><PowerOff size={14} strokeWidth={2} aria-hidden="true" />Deactivate</button> : can("products:edit") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStatusDialog("active")}><Power size={14} strokeWidth={2} aria-hidden="true" />Activate</button>}
          </div>
        </div>
      </section>
      <Tabs<Tab> label="Product sections" value={tab} onChange={(t) => setParams(t === "overview" ? {} : { tab: t })} tabs={[{ id: "overview", label: "Overview" }, { id: "skus", label: "SKUs", count: skus.length }, { id: "mapping", label: "Branch & region", count: mappings.filter((m) => m.status === "active").length }, { id: "scan", label: "Scan points", count: configs.length }, { id: "warranty", label: "Warranty & installation" }, { id: "history", label: "History", count: history.length }]} />

      {tab === "overview" && (
        <Panel level={3} title="Overview">
          <dl className="kv kv--wide">
            {[["Product ID", p.id], ["Product name", p.name], ["Product code", p.code], ["Description", p.description || "—"], ["Category", categoryById(s, p.categoryId)?.name], ["Sub-category", subById(s, p.subCategoryId)?.name], ["Associated SKUs", skus.map((k) => k.code).join(", ") || "None"], ["Status", p.status], ["Created by", `${userName(acc, p.createdBy)} · ${p.source === "bulk_import" ? "bulk import" : p.source}`], ["Created on", formatDateTime(p.createdAt)], ["Last modified", `${formatDateTime(p.updatedAt)} by ${userName(acc, p.updatedBy)}`]].map(([k, v]) => (
              <div key={k} className="kv__row"><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </Panel>
      )}

      {tab === "skus" && (
        <Panel level={3} title="SKU details" actions={can("products:create") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setSkuEdit({ id: null, d: emptySku() }); setReason(""); setRes(null); }}><Plus size={14} strokeWidth={2} aria-hidden="true" />Add SKU</button>} padded={false}>
          <DataTable rows={skus} rowKey={(k) => k.id} caption="SKUs" searchable={false} columns={[
            { key: "id", header: "SKU ID", value: (k) => k.id, render: (k) => <span className="mono small">{k.id}</span> },
            { key: "code", header: "SKU code", value: (k) => k.code, render: (k) => <span className="mono small">{k.code}</span> },
            { key: "name", header: "SKU name", value: (k) => k.name },
            { key: "product", header: "Product", value: () => p.code, render: () => <span className="mono small">{p.code}</span> },
            { key: "prog", header: "Programmes", value: (k) => k.programmes.join(", "), render: (k) => (k.programmes.length ? <span className="tag-row">{k.programmes.map((x) => <ProgrammeTag key={x} code={x} size="sm" />)}</span> : <span className="muted small">Not set</span>) },
            { key: "deps", header: "Used by", value: (k) => { const d = skuDependencies(s, k.id); return d.configs.length + d.rules.length; }, render: (k) => { const d = skuDependencies(s, k.id); return d.configs.length + d.rules.length ? <span className="small">{[...d.configs.map((c) => c.id), ...d.rules.map((r) => r.code)].join(", ")}</span> : <span className="muted small">—</span>; } },
            { key: "status", header: "Status", value: (k) => k.status, render: (k) => <RecordBadge status={k.status} /> },
            { key: "edit", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (k) => can("products:edit") && <button type="button" className="btn btn--secondary btn--xs" onClick={() => { setSkuEdit({ id: k.id, d: { code: k.code, name: k.name, status: k.status, programmes: k.programmes } }); setReason(""); setRes(null); }}>Edit</button> },
          ] as Column<Sku>[]} emptyTitle="No SKUs yet" />
        </Panel>
      )}

      {tab === "mapping" && (
        <Panel level={3} title="Branch and region mapping" subtitle="Where the product is available. Portal-maintained; the hierarchy itself comes from SFDC" actions={can("products:edit") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setMapEdit(mappings.filter((m) => m.status === "active").map((m) => m.branchCode)); setReason(""); setRes(null); }}><Pencil size={14} strokeWidth={2} aria-hidden="true" />Edit mapping</button>} padded={false}>
          <DataTable rows={mappings} rowKey={(m) => m.id} caption="Branch mapping" searchPlaceholder="Search branches" columns={[
            { key: "region", header: "Region (state)", value: (m) => branchByCode.get(m.branchCode)?.stateName ?? "" },
            { key: "district", header: "District", value: (m) => branchByCode.get(m.branchCode)?.districtName ?? "" },
            { key: "branch", header: "Branch", value: (m) => branchByCode.get(m.branchCode)?.name ?? m.branchCode, render: (m) => <Link to={`/masters/branches/branch/${m.branchCode}`} onClick={(e) => e.stopPropagation()}>{branchByCode.get(m.branchCode)?.name ?? m.branchCode}</Link> },
            { key: "status", header: "Mapping status", value: (m) => m.status, render: (m) => <RecordBadge status={m.status} /> },
            { key: "since", header: "Mapped on", value: (m) => m.createdAt, render: (m) => <span className="small num">{formatDateTime(m.createdAt)}</span> },
          ] as Column<(typeof mappings)[number]>[]} emptyTitle="Not mapped to any branch" />
        </Panel>
      )}

      {tab === "scan" && (
        <Panel level={3} title="Scan point configuration" subtitle="Scan-In and Scan-Out points per SKU and branch set. Changes go through Scanning configuration and the Approval Centre" padded={false} actions={can("scan-config:create") && <Link to="/masters/scanning/points/new" className="btn btn--secondary btn--sm"><Plus size={14} strokeWidth={2} aria-hidden="true" />New configuration</Link>}>
          <DataTable rows={configs} rowKey={(c) => c.id} caption="Scan point configurations" searchable={false} columns={[
            { key: "id", header: "Configuration", value: (c) => c.id, render: (c) => <Link to={`/masters/scanning/points/${c.id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{c.id}</Link> },
            { key: "sku", header: "SKU", value: (c) => skus.find((k) => k.id === c.skuId)?.code ?? "", render: (c) => <span className="mono small">{skus.find((k) => k.id === c.skuId)?.code}</span> },
            { key: "branches", header: "Branches", value: (c) => c.branchCodes.length, render: (c) => <span className="small">{c.branchCodes.length} branches</span> },
            { key: "in", header: "Scan-In", value: (c) => versionsOf(c.versions).active?.scanIn ?? -1, align: "right", render: (c) => <span className="num">{versionsOf(c.versions).active?.scanIn ?? "—"}</span> },
            { key: "out", header: "Scan-Out", value: (c) => versionsOf(c.versions).active?.scanOut ?? -1, align: "right", render: (c) => <span className="num">{versionsOf(c.versions).active?.scanOut ?? "—"}</span> },
            { key: "state", header: "Status", value: (c) => pointsState(c), render: (c) => <ConfigBadge state={pointsState(c)} /> },
            { key: "eff", header: "Effective", value: (c) => versionsOf(c.versions).latest.effectiveFrom ?? "", render: (c) => <span className="small">{versionsOf(c.versions).latest.effectiveFrom ?? "On activation"}</span> },
            { key: "approval", header: "Approval", value: () => null, sortable: false, render: (c) => { const l = versionsOf(c.versions).latest; return <ApprovalLink request={lookup(`${c.id} v${l.version}`)} />; } },
            { key: "mod", header: "Last modified", value: (c) => versionsOf(c.versions).latest.updatedAt, render: (c) => <span className="small num">{formatDateTime(versionsOf(c.versions).latest.updatedAt)}</span> },
          ] as Column<(typeof configs)[number]>[]} emptyTitle="No scan point configuration for this product" />
        </Panel>
      )}

      {tab === "warranty" && (
        <Panel level={3} title="Warranty and installation">
          <dl className="kv kv--wide">
            <div className="kv__row"><dt>Warranty duration</dt><dd>{warrantyText(p)}</dd></div>
            <div className="kv__row"><dt>Installation required</dt><dd>{p.installationRequired ? "Yes" : "No"}</dd></div>
            <div className="kv__row"><dt>Other attributes</dt><dd className="muted">None in the source model for this phase</dd></div>
          </dl>
        </Panel>
      )}

      {tab === "history" && <MasterAuditTable events={history} title="Audit and change history" />}

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={`Edit ${p.code}`} width={560} footer={<><button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn btn--primary" onClick={() => { const out = updateProduct(uid, p.id, edit!, reason); setRes(out); if (out.ok) { notify(`${p.code} updated`, "positive"); out.warnings.forEach((w) => notify(w, "info")); setEdit(null); } }}>Save changes</button></>}>
        {edit && (
          <div className="form-grid">
            <TextField label="Product name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} error={editErrs.name} />
            <TextField label="Product code" required value={edit.code} onChange={(v) => setEdit({ ...edit, code: v })} error={editErrs.code} />
            <TextArea label="Description" value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} rows={2} />
            <SelectInput label="Category" value={edit.categoryId} onChange={(v) => setEdit({ ...edit, categoryId: v, subCategoryId: "" })} options={s.categories.map((c) => ({ value: c.id, label: c.name, disabled: c.status !== "active" }))} error={editErrs.categoryId} />
            <SelectInput label="Sub-category" value={edit.subCategoryId} onChange={(v) => setEdit({ ...edit, subCategoryId: v })} options={[{ value: "", label: "Choose" }, ...s.subCategories.filter((x) => x.categoryId === edit.categoryId).map((c) => ({ value: c.id, label: c.name, disabled: c.status !== "active" }))]} error={editErrs.subCategoryId} />
            <div className="form-grid form-grid--2">
              <TextField label="Warranty" type="number" value={edit.warranty.value?.toString() ?? ""} onChange={(v) => setEdit({ ...edit, warranty: { ...edit.warranty, value: v === "" ? null : Number(v) } })} error={editErrs.warranty} />
              <SelectInput label="Unit" value={edit.warranty.unit} onChange={(v) => setEdit({ ...edit, warranty: { ...edit.warranty, unit: v as "months" | "years" } })} options={[{ value: "months", label: "Months" }, { value: "years", label: "Years" }]} />
            </div>
            <Checkbox label="Installation required" checked={edit.installationRequired} onChange={(v) => setEdit({ ...edit, installationRequired: v })} />
            {(edit.categoryId !== p.categoryId || edit.subCategoryId !== p.subCategoryId) && <Notice tone="warn">Changing the category can change which scan rules apply to this product's SKUs. Existing rules are not changed automatically.</Notice>}
            <TextArea label="Reason" value={reason} onChange={setReason} rows={2} hint="Recorded in the audit history; required for a category change" />
            <PolicyMessages result={res} title="Not saved" />
          </div>
        )}
      </Drawer>

      <Drawer open={!!skuEdit} onClose={() => setSkuEdit(null)} title={skuEdit?.id ? `Edit ${skus.find((k) => k.id === skuEdit.id)?.code}` : `Add SKU to ${p.code}`} width={520} footer={<><button type="button" className="btn btn--ghost" onClick={() => setSkuEdit(null)}>Cancel</button><button type="button" className="btn btn--primary" onClick={() => { const out = saveSku(uid, p.id, skuEdit!.id, skuEdit!.d, reason); setRes(out); if (out.ok) { notify("SKU saved", "positive"); out.warnings.forEach((w) => notify(w, "info")); setSkuEdit(null); } }}>Save SKU</button></>}>
        {skuEdit && (
          <div className="form-grid">
            {skuEdit.id && (() => { const d = skuDependencies(s, skuEdit.id); return d.configs.length + d.rules.length ? <Notice tone="warn">Referenced by {[...d.configs.map((c) => c.id), ...d.rules.map((r) => r.code)].join(", ")}. The code cannot change and the SKU cannot be deactivated while they are live.</Notice> : null; })()}
            <TextField label="SKU code" required value={skuEdit.d.code} onChange={(v) => setSkuEdit({ ...skuEdit, d: { ...skuEdit.d, code: v } })} />
            <TextField label="SKU name" value={skuEdit.d.name} onChange={(v) => setSkuEdit({ ...skuEdit, d: { ...skuEdit.d, name: v } })} />
            <SelectInput label="Status" value={skuEdit.d.status} onChange={(v) => setSkuEdit({ ...skuEdit, d: { ...skuEdit.d, status: v as Sku["status"] } })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "draft", label: "Draft" }]} />
            <MultiSelect label="Applicable programmes" value={skuEdit.d.programmes} onChange={(v) => setSkuEdit({ ...skuEdit, d: { ...skuEdit.d, programmes: v } })} options={PROGRAMMES.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} placeholder="None yet" />
            <TextArea label="Reason" value={reason} onChange={setReason} rows={2} hint="Required for a status change" />
            <PolicyMessages result={res} title="Not saved" />
          </div>
        )}
      </Drawer>

      <Drawer open={!!mapEdit} onClose={() => setMapEdit(null)} title={`Branch mapping · ${p.code}`} width={560} footer={<><button type="button" className="btn btn--ghost" onClick={() => setMapEdit(null)}>Cancel</button><button type="button" className="btn btn--primary" onClick={() => { const out = setProductMappings(uid, p.id, mapEdit!, reason); setRes(out); if (out.ok) { notify("Branch mapping updated", "positive"); setMapEdit(null); } }}>Save mapping</button></>}>
        {mapEdit && (
          <div className="form-grid">
            <MultiSelect label="Mapped branches" value={mapEdit} onChange={setMapEdit} options={branchOptions(undefined, new Set(s.hierarchy.filter((h) => h.level === "branch" && h.status !== "active").map((h) => h.code)))} placeholder="No branches" hint={`${mapEdit.length} of ${ALL_BRANCHES.length} branches. Only branches within your geographical scope can be added or removed`} />
            <TextArea label="Reason" required value={reason} onChange={setReason} rows={2} />
            <PolicyMessages result={res} title="Not saved" />
          </div>
        )}
      </Drawer>

      <ReasonDialog
        open={!!statusDialog}
        title={`${statusDialog === "inactive" ? "Deactivate" : "Activate"} ${p.code}`}
        confirmLabel={statusDialog === "inactive" ? "Deactivate" : "Activate"}
        tone={statusDialog === "inactive" ? "danger" : "default"}
        body={statusDialog === "inactive" ? `Products are never deleted. Deactivation is refused while any SKU is active (${skus.filter((k) => k.status === "active").length} now).` : "The product becomes available for new SKUs and configurations."}
        onClose={() => setStatusDialog(null)}
        onConfirm={(r) => { const out = setProductStatus(uid, p.id, statusDialog!, r); if (out.ok) notify(`${p.code} ${statusDialog === "inactive" ? "deactivated" : "activated"}`, "positive"); return out; }}
      />
      {skus.length === 0 && tab === "overview" && <EmptyState title="No SKU yet">Add a SKU before configuring scan points.</EmptyState>}
    </div>
  );
}
