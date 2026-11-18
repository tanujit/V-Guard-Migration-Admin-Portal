import { useState } from "react";
import { FolderTree, Pencil, Plus, Power, PowerOff, Tags } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Drawer } from "@/components/ui/Overlay";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SelectField } from "@/components/ui/primitives";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { categoryById, categoryImpact } from "@/features/masters/engine";
import { saveCategory, saveSubCategory, setCategoryStatus } from "@/features/masters/store";
import { formatDateTime } from "@/lib/format";
import type { Category, SubCategory } from "@/types/masters";
import { PolicyMessages, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { MastersLayout, RecordBadge, useMasterView } from "./shared";

export function CategoriesLayout() {
  return (
    <MastersLayout
      title="Category & sub-category"
      description="The central product classification used by products, SKUs and scan rules"
      permission="categories:view"
      tabs={[
        { to: "/masters/categories", end: true, label: "Categories", icon: FolderTree },
        { to: "/masters/categories/sub", label: "Sub-categories", icon: Tags },
      ]}
    />
  );
}

type Target = { kind: "category" | "sub_category"; rec: Category | SubCategory; to: "active" | "inactive" };

function ImpactBody({ target }: { target: Target }) {
  const { s } = useMasterView();
  const imp = categoryImpact(s, target.kind === "category" ? { categoryId: target.rec.id } : { subCategoryId: target.rec.id });
  if (target.to === "active") return <p>{target.rec.name} becomes available for new products again.</p>;
  const blocking = imp.activeProducts.length || imp.activeSkus || imp.configs.length || imp.rules.length || imp.subCategories.length;
  return (
    <div className="impact-box">
      <dl className="impact">
        <div className="impact__item"><dt>Products</dt><dd>{imp.products.length} ({imp.activeProducts.length} active)</dd></div>
        <div className="impact__item"><dt>SKUs</dt><dd>{imp.skuCount} ({imp.activeSkus} active)</dd></div>
        <div className="impact__item"><dt>Active scan point configurations</dt><dd>{imp.configs.length}</dd></div>
        <div className="impact__item"><dt>Live scan rules</dt><dd>{imp.rules.length ? imp.rules.map((r) => r.code).join(", ") : 0}</dd></div>
        {target.kind === "category" && <div className="impact__item"><dt>Active sub-categories</dt><dd>{imp.subCategories.length}</dd></div>}
      </dl>
      {blocking ? <Notice tone="danger">Deactivation will be refused: business records still depend on {target.rec.name}. Products are never deleted or remapped automatically, and scan rules are not changed silently.</Notice> : <Notice tone="info">Nothing active depends on {target.rec.name}. A reason is still required.</Notice>}
    </div>
  );
}

export function CategoryDirectoryPage() {
  const { s, can, uid } = useMasterView();
  const { notify } = useToast();
  const [status, setStatus] = useState("all");
  const [edit, setEdit] = useState<{ id: string | null; name: string; code: string; description: string } | null>(null);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const rows = s.categories.filter((c) => status === "all" || c.status === status);
  const cols: Column<Category>[] = [
    { key: "id", header: "Category ID", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> },
    { key: "code", header: "Code", value: (c) => c.code, render: (c) => <span className="mono small">{c.code}</span> },
    { key: "name", header: "Category name", value: (c) => c.name },
    { key: "desc", header: "Description", value: (c) => c.description, render: (c) => <span className="small cell-wrap">{c.description || "—"}</span> },
    { key: "subs", header: "Sub-categories", value: (c) => s.subCategories.filter((x) => x.categoryId === c.id).length, align: "right" },
    { key: "products", header: "Products / SKUs", value: (c) => s.products.filter((p) => p.categoryId === c.id).length, align: "right", render: (c) => { const ps = s.products.filter((p) => p.categoryId === c.id); return <span className="num">{ps.length} / {s.skus.filter((k) => ps.some((p) => p.id === k.productId)).length}</span>; } },
    { key: "status", header: "Status", value: (c) => c.status, render: (c) => <RecordBadge status={c.status} /> },
    { key: "created", header: "Created on", value: (c) => c.createdAt, render: (c) => <span className="small num">{formatDateTime(c.createdAt)}</span> },
    { key: "mod", header: "Last modified", value: (c) => c.updatedAt, render: (c) => <span className="small num">{formatDateTime(c.updatedAt)}</span> },
    { key: "actions", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (c) => (
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        {can("categories:edit") && <button type="button" className="icon-btn icon-btn--sm" aria-label={`Edit ${c.name}`} title="Edit" onClick={() => { setEdit({ id: c.id, name: c.name, code: c.code, description: c.description }); setRes(null); }}><Pencil size={15} strokeWidth={2} /></button>}
        {c.status === "active" ? can("categories:disable") && <button type="button" className="icon-btn icon-btn--sm" aria-label={`Deactivate ${c.name}`} title="Deactivate" onClick={() => setTarget({ kind: "category", rec: c, to: "inactive" })}><PowerOff size={15} strokeWidth={2} /></button> : can("categories:edit") && <button type="button" className="icon-btn icon-btn--sm" aria-label={`Activate ${c.name}`} title="Activate" onClick={() => setTarget({ kind: "category", rec: c, to: "active" })}><Power size={15} strokeWidth={2} /></button>}
      </span>
    ) },
  ];
  return (
    <>
      <SectionTitle title="Categories" description="Product categories are maintained only here; product screens pick from this list" actions={can("categories:create") && <button type="button" className="btn btn--primary" onClick={() => { setEdit({ id: null, name: "", code: "", description: "" }); setRes(null); }}><Plus size={16} strokeWidth={2} aria-hidden="true" />Create category</button>} />
      <Panel padded={false}>
        <DataTable rows={rows} columns={cols} rowKey={(c) => c.id} caption="Categories" searchPlaceholder="Search categories" exportName="categories" toolbar={<SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} active={status !== "all"} />} initialSort={{ key: "id", dir: "asc" }} />
      </Panel>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : "Create category"} width={480} footer={<><button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn btn--primary" onClick={() => { const out = saveCategory(uid, edit!.id, { name: edit!.name, code: edit!.code, description: edit!.description }); setRes(out); if (out.ok) { notify("Category saved", "positive"); setEdit(null); } }}>Save</button></>}>
        {edit && (
          <div className="form-grid">
            <TextField label="Category name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} hint="Unique, case-insensitive" />
            <TextField label="Category code" required value={edit.code} onChange={(v) => setEdit({ ...edit, code: v.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} hint="Capitals, digits and _" />
            <TextArea label="Description" value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} rows={2} />
            <p className="small muted">New categories start Active.</p>
            <PolicyMessages result={res} title="Not saved" />
          </div>
        )}
      </Drawer>
      <StatusDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function StatusDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const { uid } = useMasterView();
  const { notify } = useToast();
  return (
    <ReasonDialog
      open={!!target}
      title={target ? `${target.to === "inactive" ? "Deactivate" : "Activate"} ${target.rec.name}` : ""}
      confirmLabel={target?.to === "inactive" ? "Deactivate" : "Activate"}
      tone={target?.to === "inactive" ? "danger" : "default"}
      body={target && <ImpactBody target={target} />}
      onClose={onClose}
      onConfirm={(reason) => {
        const out = setCategoryStatus(uid, target!.kind, target!.rec.id, target!.to, reason);
        if (out.ok) notify(`${target!.rec.name} ${target!.to === "inactive" ? "deactivated" : "activated"}`, "positive");
        return out;
      }}
    />
  );
}

export function SubCategoryDirectoryPage() {
  const { s, can, uid } = useMasterView();
  const { notify } = useToast();
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [edit, setEdit] = useState<{ id: string | null; name: string; code: string; description: string; categoryId: string } | null>(null);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const rows = s.subCategories.filter((x) => (cat === "all" || x.categoryId === cat) && (status === "all" || x.status === status));
  const cols: Column<SubCategory>[] = [
    { key: "id", header: "Sub-category ID", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> },
    { key: "name", header: "Sub-category name", value: (c) => c.name },
    { key: "parent", header: "Parent category", value: (c) => categoryById(s, c.categoryId)?.name ?? "" },
    { key: "desc", header: "Description", value: (c) => c.description, render: (c) => <span className="small cell-wrap">{c.description || "—"}</span> },
    { key: "products", header: "Products / SKUs", value: (c) => s.products.filter((p) => p.subCategoryId === c.id).length, align: "right", render: (c) => { const ps = s.products.filter((p) => p.subCategoryId === c.id); return <span className="num">{ps.length} / {s.skus.filter((k) => ps.some((p) => p.id === k.productId)).length}</span>; } },
    { key: "status", header: "Status", value: (c) => c.status, render: (c) => <RecordBadge status={c.status} /> },
    { key: "actions", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (c) => (
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        {can("categories:edit") && <button type="button" className="icon-btn icon-btn--sm" aria-label={`Edit ${c.name}`} title="Edit" onClick={() => { setEdit({ id: c.id, name: c.name, code: c.code, description: c.description, categoryId: c.categoryId }); setRes(null); }}><Pencil size={15} strokeWidth={2} /></button>}
        {c.status === "active" ? can("categories:disable") && <button type="button" className="icon-btn icon-btn--sm" aria-label={`Deactivate ${c.name}`} title="Deactivate" onClick={() => setTarget({ kind: "sub_category", rec: c, to: "inactive" })}><PowerOff size={15} strokeWidth={2} /></button> : can("categories:edit") && <button type="button" className="icon-btn icon-btn--sm" aria-label={`Activate ${c.name}`} title="Activate" onClick={() => setTarget({ kind: "sub_category", rec: c, to: "active" })}><Power size={15} strokeWidth={2} /></button>}
      </span>
    ) },
  ];
  return (
    <>
      <SectionTitle title="Sub-categories" description="Each sub-category belongs to exactly one active parent category" actions={can("categories:create") && <button type="button" className="btn btn--primary" onClick={() => { setEdit({ id: null, name: "", code: "", description: "", categoryId: "" }); setRes(null); }}><Plus size={16} strokeWidth={2} aria-hidden="true" />Create sub-category</button>} />
      <Panel padded={false}>
        <DataTable rows={rows} columns={cols} rowKey={(c) => c.id} caption="Sub-categories" searchPlaceholder="Search sub-categories" exportName="sub-categories" toolbar={<><SelectField label="Category" value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...s.categories.map((c) => ({ value: c.id, label: c.name }))]} active={cat !== "all"} /><SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} active={status !== "all"} /></>} initialSort={{ key: "id", dir: "asc" }} />
      </Panel>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : "Create sub-category"} width={480} footer={<><button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn btn--primary" onClick={() => { const out = saveSubCategory(uid, edit!.id, edit!); setRes(out); if (out.ok) { notify("Sub-category saved", "positive"); setEdit(null); } }}>Save</button></>}>
        {edit && (
          <div className="form-grid">
            <SelectInput label="Parent category" required value={edit.categoryId} onChange={(v) => setEdit({ ...edit, categoryId: v })} options={[{ value: "", label: "Choose" }, ...s.categories.map((c) => ({ value: c.id, label: `${c.name}${c.status !== "active" ? " (inactive)" : ""}`, disabled: c.status !== "active" }))]} />
            <TextField label="Sub-category name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} hint="Unique within the parent category" />
            <TextField label="Sub-category code" required value={edit.code} onChange={(v) => setEdit({ ...edit, code: v.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
            <TextArea label="Description" value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} rows={2} />
            <PolicyMessages result={res} title="Not saved" />
          </div>
        )}
      </Drawer>
      <StatusDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
