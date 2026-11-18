import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, Boxes, CircleHelp, ClipboardCheck, FolderTree, GitBranch, History, LayoutGrid, Layers, MapPinned, PackageX, ScanLine, ShieldAlert, Tags } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, TextArea } from "@/components/form/Form";
import { PENDING } from "@/config/approvalCatalogue";
import { useToast } from "@/context/ToastContext";
import { hoursBetween } from "@/features/approvals/engine";
import { demoNow } from "@/features/approvals/store";
import { pointsState, ruleState } from "@/features/masters/engine";
import { updateMasterDecision } from "@/features/masters/store";
import { formatDateTime } from "@/lib/format";
import type { PolicyResult } from "@/features/access/engine";
import type { MasterAuditEvent, MasterDecision } from "@/types/masters";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { ApprovalLink, KpiGrid, MastersLayout, useApprovalLookup, useMasterView, userName, type Kpi } from "./shared";

export function MastersOverviewLayout() {
  return (
    <MastersLayout
      title="Master data overview"
      description="Products, SKUs, categories, the branch hierarchy and scanning configuration in one place"
      permission="products:view"
      tabs={[
        { to: "/masters", end: true, label: "Overview", icon: LayoutGrid },
        { to: "/masters/decisions", label: "Decision register", icon: CircleHelp },
        { to: "/masters/audit", label: "Audit log", icon: History },
      ]}
    />
  );
}

const MASTER_MODULES = ["products", "categories", "scan-config", "branches"];

export function MastersOverviewPage() {
  const { s, approvals } = useMasterView();
  const navigate = useNavigate();
  const now = demoNow();
  const pendingApprovals = approvals.requests.filter((r) => MASTER_MODULES.includes(r.module) && [...PENDING, "returned"].includes(r.status));
  const recent = s.audit.filter((e) => hoursBetween(e.at, now) <= 24 * 7);
  const kpis: Kpi[] = [
    { id: "products", label: "Total products", value: s.products.length, desc: "Every product record", variant: "dark", icon: Boxes, onSelect: () => navigate("/masters/products") },
    { id: "active-products", label: "Active products", value: s.products.filter((p) => p.status === "active").length, desc: "Status Active", variant: "status", tone: "positive", icon: Boxes, onSelect: () => navigate("/masters/products?status=active") },
    { id: "skus", label: "Total SKUs", value: s.skus.length, desc: "Across all products", variant: "light", icon: Layers, onSelect: () => navigate("/masters/products") },
    { id: "active-skus", label: "Active SKUs", value: s.skus.filter((k) => k.status === "active").length, desc: "Status Active", variant: "status", tone: "positive", icon: Layers, onSelect: () => navigate("/masters/products?status=active") },
    { id: "categories", label: "Total categories", value: s.categories.length, desc: `${s.categories.filter((c) => c.status === "active").length} active`, variant: "light", icon: FolderTree, onSelect: () => navigate("/masters/categories") },
    { id: "subs", label: "Total sub-categories", value: s.subCategories.length, desc: `${s.subCategories.filter((c) => c.status === "active").length} active`, variant: "light", icon: Tags, onSelect: () => navigate("/masters/categories/sub") },
    { id: "mappings", label: "Branch mappings", value: s.mappings.filter((m) => m.status === "active").length, desc: "Active product-to-branch mappings", variant: "light", icon: MapPinned, onSelect: () => navigate("/masters/branches") },
    { id: "points", label: "Scan-In/Out mappings", value: s.scanPoints.filter((c) => pointsState(c) === "active").length, desc: "Active scan point configurations", variant: "primary", icon: ScanLine, onSelect: () => navigate("/masters/scanning/points") },
    { id: "rules", label: "Active scan restrictions", value: s.rules.filter((r) => ruleState(r) === "active").length, desc: "Restriction rules in force", variant: "light", icon: ShieldAlert, onSelect: () => navigate("/masters/scanning/rules?state=active") },
    { id: "pending", label: "Pending configuration approvals", value: pendingApprovals.length, desc: "Pending or returned in the Approval Centre", variant: "status", tone: "warning", icon: ClipboardCheck, onSelect: () => navigate("/governance/approvals/all?status=pending") },
    { id: "inactive", label: "Inactive product/SKU records", value: s.products.filter((p) => p.status !== "active").length + s.skus.filter((k) => k.status !== "active").length, desc: "Inactive or draft", variant: "status", tone: "negative", icon: PackageX, onSelect: () => navigate("/masters/products?status=inactive") },
    { id: "changes", label: "Recent master data changes", value: recent.length, desc: "Audit events in the last 7 days", variant: "light", icon: Activity, onSelect: () => navigate("/masters/audit") },
  ];
  return (
    <>
      <SectionTitle title="Overview" description="Counts are from development data. Select a card to open the filtered list" />
      <KpiGrid items={kpis} cols={4} />
      <div className="quick-links">
        {[
          { to: "/masters/products", label: "Product & SKU master", icon: Boxes },
          { to: "/masters/categories", label: "Category & sub-category", icon: FolderTree },
          { to: "/masters/branches", label: "Branch & hierarchy", icon: GitBranch },
          { to: "/masters/scanning", label: "Scanning configuration", icon: ScanLine },
        ].map((l) => (
          <Link key={l.to} to={l.to} className="quick-link">
            <l.icon size={18} strokeWidth={2} aria-hidden="true" />
            {l.label}
          </Link>
        ))}
      </div>
      <RecentActivity events={s.audit} />
    </>
  );
}

const ENTITY_LINK: Record<string, (id: string) => string> = {
  product: (id) => `/masters/products/${id}`,
  scan_rule: (id) => `/masters/scanning/rules/${id}`,
  scan_points: (id) => `/masters/scanning/points/${id}`,
  branch: (id) => `/masters/branches/branch/${id}`,
  category: () => "/masters/categories",
  sub_category: () => "/masters/categories/sub",
};

function RecentActivity({ events }: { events: MasterAuditEvent[] }) {
  const { s, acc } = useMasterView();
  const lookup = useApprovalLookup();
  const navigate = useNavigate();
  const rows = [...events].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
  const subject = (e: MasterAuditEvent) => {
    if (e.entityType === "product") return s.products.find((p) => p.id === e.entityId)?.code ?? e.entityId;
    if (e.entityType === "sku") return s.skus.find((k) => k.id === e.entityId)?.code ?? e.entityId;
    if (e.entityType === "scan_points") return s.skus.find((k) => k.id === s.scanPoints.find((c) => c.id === e.entityId)?.skuId)?.code ?? "—";
    return "—";
  };
  const lookupLatest = (entityId: string) => {
    for (let v = 9; v >= 1; v--) {
      const r = lookup(`${entityId} v${v}`);
      if (r) return r;
    }
    return undefined;
  };
  const columns: Column<MasterAuditEvent>[] = [
    { key: "at", header: "Date and time", value: (e) => e.at, render: (e) => <span className="small num">{formatDateTime(e.at)}</span> },
    { key: "action", header: "Activity", value: (e) => e.action, render: (e) => <span className="mono small">{e.action}</span> },
    { key: "ref", header: "Reference", value: (e) => e.entityId, render: (e) => <span className="mono small">{e.entityId}</span> },
    { key: "module", header: "Module", value: (e) => e.module, render: (e) => <span className="small">{MODULE_LABEL[e.module] ?? e.module}</span> },
    { key: "subject", header: "Product / SKU", value: subject, render: (e) => <span className="mono small">{subject(e)}</span> },
    { key: "branch", header: "Branch", value: (e) => (e.entityType === "branch" ? e.entityId : ""), render: (e) => <span className="small">{e.entityType === "branch" ? e.entityId : "—"}</span> },
    { key: "by", header: "Initiated by", value: (e) => userName(acc, e.actorUserId) },
    { key: "value", header: "Current status", value: (e) => e.newValue ?? "", render: (e) => <span className="small cell-wrap">{e.newValue ?? "—"}</span> },
    { key: "approval", header: "Approval", value: () => null, sortable: false, noSearch: true, render: (e) => { const r = e.entityType === "scan_rule" || e.entityType === "scan_points" ? lookupLatest(e.entityId) : undefined; return <ApprovalLink request={r} />; } },
    { key: "open", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (e) => (ENTITY_LINK[e.entityType] ? <Link className="btn btn--secondary btn--xs" to={ENTITY_LINK[e.entityType](e.entityId)} onClick={(x) => x.stopPropagation()}>Open</Link> : null) },
  ];
  return (
    <Panel title="Recent master data activity" subtitle="Creations, updates, mapping changes, scan configuration submissions, approvals and activations" level={3} padded={false}>
      <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} caption="Recent master data activity" searchPlaceholder="Search activity" pageSize={8} initialSort={{ key: "at", dir: "desc" }} onRowClick={(e) => ENTITY_LINK[e.entityType] && navigate(ENTITY_LINK[e.entityType](e.entityId))} rowActionLabel={(e) => `Open ${e.entityId}`} />
    </Panel>
  );
}

export const MODULE_LABEL: Record<string, string> = { products: "Product & SKU", categories: "Categories", branches: "Branch & hierarchy", "scan-config": "Scanning configuration" };

/** Audit table, reused on every detail page. Read-only by design. */
export function MasterAuditTable({ events, title = "Change history", pageSize = 10 }: { events: MasterAuditEvent[]; title?: string; pageSize?: number }) {
  const { acc } = useMasterView();
  const columns: Column<MasterAuditEvent>[] = [
    { key: "at", header: "Time", value: (e) => e.at, render: (e) => <span className="small num">{formatDateTime(e.at)}</span> },
    { key: "id", header: "Audit ID", value: (e) => e.id, render: (e) => <span className="mono small muted">{e.id}</span> },
    { key: "action", header: "Action", value: (e) => e.action, render: (e) => <span className="mono small">{e.action}</span> },
    { key: "entity", header: "Entity", value: (e) => `${e.entityType} ${e.entityId}`, render: (e) => <span className="small">{e.entityType.replace("_", " ")} <span className="mono">{e.entityId}</span></span> },
    { key: "actor", header: "Actor", value: (e) => userName(acc, e.actorUserId), render: (e) => <span className="cell-2"><span className="cell-2__main small">{userName(acc, e.actorUserId)}</span><span className="cell-2__sub">{acc.organisations.find((o) => o.id === e.actorOrgId)?.name ?? "—"}</span></span> },
    { key: "change", header: "Previous → new", value: (e) => `${e.previousValue ?? ""} ${e.newValue ?? ""}`, render: (e) => <span className="small cell-wrap">{e.previousValue ? `${e.previousValue} → ` : ""}{e.newValue ?? "—"}</span> },
    { key: "remarks", header: "Reason / remarks", value: (e) => e.remarks, render: (e) => <span className="small cell-wrap">{e.remarks || "—"}</span> },
    { key: "approval", header: "Approval request", value: (e) => e.approvalRequestId ?? "", render: (e) => (e.approvalRequestId ? <Link to={`/governance/approvals/request/${e.approvalRequestId}`} className="mono small">{e.approvalRequestId}</Link> : <span className="muted small">—</span>) },
    { key: "ref", header: "Ref", value: (e) => e.ref, render: (e) => <span className="mono small muted">{e.ref}</span> },
  ];
  return (
    <Panel title={title} subtitle="Append-only. Events cannot be edited or deleted" level={3} padded={false}>
      <DataTable rows={events} columns={columns} rowKey={(e) => e.id} caption={title} searchPlaceholder="Search history" exportName="master-data-audit" pageSize={pageSize} initialSort={{ key: "at", dir: "desc" }} emptyTitle="No history yet" />
    </Panel>
  );
}

export function MastersAuditPage() {
  const { s } = useMasterView();
  const [mod, setMod] = useState("all");
  const events = useMemo(() => s.audit.filter((e) => mod === "all" || e.module === mod), [s.audit, mod]);
  return (
    <>
      <SectionTitle title="Master data audit log" description="Every material master-data and configuration event, with actor, organisation, previous and new value, reason and approval reference" actions={<SelectInput label="Module" value={mod} onChange={setMod} options={[{ value: "all", label: "All modules" }, ...Object.entries(MODULE_LABEL).map(([k, v]) => ({ value: k, label: v }))]} />} />
      <MasterAuditTable events={events} title="Audit events" pageSize={15} />
    </>
  );
}

const DECISION_STATUS: Record<MasterDecision["status"], { label: string; tone: "warning" | "info" | "positive" | "neutral" }> = {
  open: { label: "Open", tone: "warning" },
  under_review: { label: "Under review", tone: "info" },
  confirmed: { label: "Confirmed", tone: "positive" },
  deferred: { label: "Deferred", tone: "neutral" },
  out_of_scope: { label: "Out of scope", tone: "neutral" },
};

export function MasterDecisionsPage() {
  const { s, can, uid } = useMasterView();
  const { notify } = useToast();
  const [edit, setEdit] = useState<MasterDecision | null>(null);
  const [status, setStatus] = useState<MasterDecision["status"]>("open");
  const [answer, setAnswer] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  const admin = can("users:manage");
  return (
    <>
      <SectionTitle title="Business confirmation register" description="Unresolved SOW points for master data and scanning. None of these is turned into an assumed rule" />
      <Notice tone="info" icon={<CircleHelp size={16} strokeWidth={2} aria-hidden="true" />}>
        Recording an answer here does not change any configuration. For example, confirming OP-51 / OP-10 only unlocks the option to switch data ownership in Branch & hierarchy.
      </Notice>
      <Panel padded={false}>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Business confirmation register</caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Open question</th>
                <th scope="col">Implementation treatment</th>
                <th scope="col">Owner</th>
                <th scope="col">Status</th>
                {admin && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {s.decisions.map((d) => (
                <tr key={d.id}>
                  <td className="mono small">{d.ref}</td>
                  <td className="small cell-wrap">{d.question}{d.answer && <span className="cell-2__sub">Answer: {d.answer}</span>}</td>
                  <td className="small cell-wrap">{d.treatment}</td>
                  <td className="small">{d.owner}</td>
                  <td><StatusBadge tone={DECISION_STATUS[d.status].tone}>{DECISION_STATUS[d.status].label}</StatusBadge></td>
                  {admin && (
                    <td>
                      <button type="button" className="btn btn--secondary btn--xs" onClick={() => { setEdit(d); setStatus(d.status); setAnswer(d.answer); setRes(null); }}>Update</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <ConfirmDialog
        open={!!edit}
        title={edit ? `${edit.ref} · update status` : ""}
        confirmLabel="Save"
        onCancel={() => setEdit(null)}
        onConfirm={() => {
          const out = updateMasterDecision(uid, edit!.id, { status, answer });
          if (!out.ok) return setRes(out);
          notify(`${edit!.ref} updated`, "positive");
          out.warnings.forEach((w) => notify(w, "info"));
          setEdit(null);
        }}
        body={
          edit && (
            <div className="reason-dialog">
              <p className="small">{edit.question}</p>
              <SelectInput label="Status" value={status} onChange={(v) => setStatus(v as MasterDecision["status"])} options={Object.entries(DECISION_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
              <TextArea label="Answer, and who confirmed it" value={answer} onChange={setAnswer} rows={3} />
              <PolicyMessages result={res} />
            </div>
          )
        }
      />
    </>
  );
}
