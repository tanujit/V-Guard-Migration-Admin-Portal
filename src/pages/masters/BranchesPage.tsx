import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, ChevronDown, ChevronRight, CircleCheck, CircleX, Database, GitBranch, Layers, Map, MapPinned, Network, RefreshCw, ScanLine, ShieldCheck, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { FigureRow } from "@/components/ui/DataBars";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { SelectInput, TextField } from "@/components/form/Form";
import { CONFLICT_LABEL, OWNERSHIP, SYNC_STATUS } from "@/config/scanCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { useToast } from "@/context/ToastContext";
import { ALL_BRANCHES, branchByCode, hierarchyOf, ownershipOf, pointsState, productById, ruleState, skuById, versionsOf } from "@/features/masters/engine";
import { reviewConflict, runMockSync, setOwnership, updateBranchRecord } from "@/features/masters/store";
import { formatDateTime } from "@/lib/format";
import type { HierarchyRecord, Ownership, SyncConflict, SyncRun, SyncStatus } from "@/types/masters";
import { AccessDenied, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { MasterAuditTable } from "./OverviewPage";
import { KpiGrid, MastersLayout, OwnershipBadge, RecordBadge, SyncBadge, useMasterView } from "./shared";

export function BranchesLayout() {
  return (
    <MastersLayout
      title="Branch & hierarchy"
      description="State → district → branch hierarchy, pincode mapping and SFDC synchronisation status"
      permission="branches:view"
      meta="SFDC synchronisation shown here is a mock: no SFDC connection exists and nothing is written back"
      tabs={[
        { to: "/masters/branches", end: true, label: "Hierarchy explorer", icon: Network },
        { to: "/masters/branches/directory", label: "Branch directory", icon: Building2 },
        { to: "/masters/branches/sync", label: "SFDC synchronisation", icon: RefreshCw },
        { to: "/masters/branches/ownership", label: "Data ownership", icon: ShieldCheck },
      ]}
    />
  );
}

const lastSuccess = (runs: SyncRun[]) => [...runs].reverse().find((r) => r.status === "completed" || r.status === "partial");

export function HierarchyPage() {
  const { s } = useMasterView();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["KL"]));
  const branches = s.hierarchy.filter((h) => h.level === "branch");
  const mapped = new Set(s.mappings.filter((m) => m.status === "active").map((m) => m.branchCode));
  const scanned = new Set(s.scanPoints.filter((c) => pointsState(c) === "active").flatMap((c) => c.branchCodes));
  const last = lastSuccess(s.syncRuns);
  const term = q.trim().toLowerCase();
  const toggle = (code: string) => setOpen((o) => { const n = new Set(o); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const tree = useMemo(() => GEOGRAPHY.map((st) => {
    const sMatch = !term || st.name.toLowerCase().includes(term) || st.code.toLowerCase() === term;
    const districts = st.districts.map((d) => {
      const dMatch = sMatch || d.name.toLowerCase().includes(term);
      const bs = d.branches.filter((b) => dMatch || b.name.toLowerCase().includes(term) || b.code.toLowerCase().includes(term));
      return { d, bs, show: dMatch || bs.length > 0 };
    }).filter((x) => x.show);
    return { st, districts, show: sMatch || districts.length > 0 };
  }).filter((x) => x.show), [term]);
  const isOpen = (code: string) => !!term || open.has(code);

  return (
    <>
      <SectionTitle title="Hierarchy overview" description="Names and codes mirror SFDC. Counts are development data" />
      <KpiGrid cols={4} items={[
        { id: "states", label: "Total states", value: GEOGRAPHY.length, desc: "Top level of the hierarchy", variant: "dark", icon: Map, onSelect: () => navigate("/masters/branches/directory") },
        { id: "districts", label: "Total districts", value: s.hierarchy.filter((h) => h.level === "district").length, desc: "Second level", variant: "light", icon: Layers, onSelect: () => navigate("/masters/branches/directory") },
        { id: "branches", label: "Total branches", value: branches.length, desc: "Third level", variant: "light", icon: Building2, onSelect: () => navigate("/masters/branches/directory") },
        { id: "active", label: "Active branches", value: branches.filter((b) => b.status === "active").length, desc: "Status Active", variant: "status", tone: "positive", icon: CircleCheck, onSelect: () => navigate("/masters/branches/directory?status=active") },
        { id: "inactive", label: "Inactive branches", value: branches.filter((b) => b.status !== "active").length, desc: "Status Inactive", variant: "status", tone: "negative", icon: CircleX, onSelect: () => navigate("/masters/branches/directory?status=inactive") },
        { id: "mapped", label: "Branches with product mappings", value: mapped.size, desc: "At least one active product", variant: "light", icon: MapPinned, onSelect: () => navigate("/masters/branches/directory") },
        { id: "scan", label: "Branches with scan configurations", value: scanned.size, desc: "Covered by an active scan point configuration", variant: "primary", icon: ScanLine, onSelect: () => navigate("/masters/scanning/points") },
        { id: "pending", label: "Pending hierarchy sync records", value: s.hierarchy.filter((h) => h.syncStatus !== "synced").length, desc: "Failed, in conflict or awaiting sync", variant: "status", tone: "warning", icon: TriangleAlert, onSelect: () => navigate("/masters/branches/sync") },
      ]} />
      <Panel level={3}>
        <FigureRow items={[{ label: "Last successful sync", value: last?.completedAt ? formatDateTime(last.completedAt) : "Never", sub: last ? `${last.id} · ${last.status === "partial" ? "with failures" : "complete"} (mock)` : undefined, onSelect: () => navigate("/masters/branches/sync") }, { label: "Hierarchy ownership", value: OWNERSHIP[ownershipOf(s, "hierarchy").ownership].label }, { label: "Pincode ownership", value: OWNERSHIP[ownershipOf(s, "pincode").ownership].label }]} />
      </Panel>
      <Panel level={3} title="Hierarchy explorer" subtitle="State → district → branch. Search expands matching levels" actions={<SearchInput value={q} onChange={setQ} placeholder="Search state, district or branch" label="Search hierarchy" />}>
        <ul className="tree" role="tree" aria-label="Geographical hierarchy">
          {tree.map(({ st, districts }) => {
            const sr = hierarchyOf(s, st.code);
            return (
              <li key={st.code} role="treeitem" aria-expanded={isOpen(st.code)} className="tree__node">
                <button type="button" className="tree__row tree__row--state" onClick={() => toggle(st.code)}>
                  {isOpen(st.code) ? <ChevronDown size={16} strokeWidth={2} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />}
                  <span className="tree__name">{st.name}</span>
                  <span className="mono small muted">{st.code}</span>
                  <span className="tree__meta small muted">{st.districts.length} districts · {st.districts.reduce((n, d) => n + d.branches.length, 0)} branches</span>
                  {sr && sr.syncStatus !== "synced" && <SyncBadge status={sr.syncStatus} />}
                </button>
                {isOpen(st.code) && (
                  <ul role="group" className="tree__children">
                    {districts.map(({ d, bs }) => (
                      <li key={d.code} role="treeitem" aria-expanded={isOpen(d.code)} className="tree__node">
                        <button type="button" className="tree__row" onClick={() => toggle(d.code)}>
                          {isOpen(d.code) ? <ChevronDown size={16} strokeWidth={2} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />}
                          <span className="tree__name">{d.name}</span>
                          <span className="mono small muted">{d.code}</span>
                          <span className="tree__meta small muted">Parent: {st.name} · {d.branches.length} branches</span>
                        </button>
                        {isOpen(d.code) && (
                          <ul role="group" className="tree__children">
                            {bs.map((b) => {
                              const r = hierarchyOf(s, b.code);
                              return (
                                <li key={b.code} role="treeitem" className="tree__node">
                                  <Link to={`/masters/branches/branch/${b.code}`} className="tree__row tree__row--leaf">
                                    <GitBranch size={14} strokeWidth={2} aria-hidden="true" />
                                    <span className="tree__name">{b.name}</span>
                                    <span className="mono small muted">{b.code}</span>
                                    <span className="tree__meta small muted">{r?.pincodes.join(", ")}</span>
                                    {r && <SyncBadge status={r.syncStatus} />}
                                    {r?.status !== "active" && <RecordBadge status="inactive" />}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {!tree.length && <p className="muted small">Nothing matches “{q}”.</p>}
      </Panel>
    </>
  );
}

interface BranchRow {
  r: HierarchyRecord;
  b: (typeof ALL_BRANCHES)[number];
}

export function BranchDirectoryPage() {
  const { s, can } = useMasterView();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [st, setSt] = useState("all");
  const [district, setDistrict] = useState("all");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [sync, setSync] = useState("all");
  const showSource = can("branches:manage");
  const rows: BranchRow[] = s.hierarchy.filter((h) => h.level === "branch").map((r) => ({ r, b: branchByCode.get(r.code)! })).filter(({ r, b }) => (st === "all" || b.state === st) && (district === "all" || b.district === district) && (status === "all" || r.status === status) && (sync === "all" || r.syncStatus === sync));
  const cols: Column<BranchRow>[] = [
    { key: "id", header: "Branch ID", value: (x) => x.r.id, render: (x) => <span className="mono small">{x.r.id}</span> },
    { key: "code", header: "Branch code", value: (x) => x.r.code, render: (x) => <span className="mono small">{x.r.code}</span> },
    { key: "name", header: "Branch name", value: (x) => x.b.name },
    { key: "state", header: "State", value: (x) => x.b.stateName },
    { key: "district", header: "District", value: (x) => x.b.districtName },
    { key: "pin", header: "Pincode", value: (x) => x.r.pincodes.join(", "), render: (x) => <span className="mono small">{x.r.pincodes.join(", ") || "—"}</span> },
    { key: "source", header: "Source", value: () => "SFDC", render: () => <span className="small">SFDC (mock)</span> },
    { key: "sync", header: "Sync status", value: (x) => SYNC_STATUS[x.r.syncStatus].label, render: (x) => <SyncBadge status={x.r.syncStatus} /> },
    { key: "status", header: "Status", value: (x) => x.r.status, render: (x) => <RecordBadge status={x.r.status} /> },
    { key: "synced", header: "Last synced", value: (x) => x.r.lastSyncedAt ?? "", render: (x) => <span className="small num">{x.r.lastSyncedAt ? formatDateTime(x.r.lastSyncedAt) : "Never"}</span> },
    { key: "actions", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (x) => <Link to={`/masters/branches/branch/${x.r.code}`} className="btn btn--secondary btn--xs" onClick={(e) => e.stopPropagation()}>View</Link> },
  ];
  return (
    <>
      <SectionTitle title="Branch directory" description={showSource ? "All branches with source and synchronisation state" : "All branches. SFDC record identifiers are shown only to hierarchy administrators"} />
      <Panel padded={false}>
        <DataTable rows={rows} columns={cols} rowKey={(x) => x.r.code} caption="Branch directory" searchPlaceholder="Search branch name, code or pincode" exportName={can("branches:export") ? "branches" : undefined} onRowClick={(x) => navigate(`/masters/branches/branch/${x.r.code}`)} rowActionLabel={(x) => `Open ${x.b.name}`} initialSort={{ key: "code", dir: "asc" }} toolbar={<>
          <SelectField label="State" value={st} onChange={(v) => { setSt(v); setDistrict("all"); }} options={[{ value: "all", label: "All states" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} active={st !== "all"} />
          <SelectField label="District" value={district} onChange={setDistrict} options={[{ value: "all", label: "All districts" }, ...GEOGRAPHY.filter((g) => st === "all" || g.code === st).flatMap((g) => g.districts.map((d) => ({ value: d.code, label: d.name })))]} active={district !== "all"} />
          <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} active={status !== "all"} />
          <SelectField label="Sync status" value={sync} onChange={setSync} options={[{ value: "all", label: "Any" }, ...Object.entries(SYNC_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} active={sync !== "all"} />
        </>} />
      </Panel>
    </>
  );
}

export function BranchDetailPage() {
  const { code = "" } = useParams();
  const { s, can, uid } = useMasterView();
  const { notify } = useToast();
  const [edit, setEdit] = useState(false);
  const [pins, setPins] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const r = hierarchyOf(s, code);
  const b = branchByCode.get(code);
  if (!r || !b) return <AccessDenied message={`Branch ${code} was not found.`} />;
  const admin = can("branches:manage");
  const mappings = s.mappings.filter((m) => m.branchCode === code && m.status === "active");
  const configs = s.scanPoints.filter((c) => c.branchCodes.includes(code));
  const rules = s.rules.filter((x) => { const v = versionsOf(x.versions).active ?? versionsOf(x.versions).pending; return v && (v.scope.allBranches || v.scope.branchCodes.includes(code)); });
  const history = s.audit.filter((e) => e.entityId === code);
  const syncHistory = s.syncRuns.filter((run) => run.errors.some((e) => e.recordCode === code));
  const hierEditable = ownershipOf(s, "hierarchy").ownership === "portal_managed";
  const pinEditable = ownershipOf(s, "pincode").ownership === "portal_managed";
  return (
    <div className="req">
      <Link to="/masters/branches/directory" className="back-link"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />Branch directory</Link>
      <section className="req-head panel">
        <div className="req-head__top">
          <div>
            <p className="req-head__id mono">{r.id} · {r.code}</p>
            <h2 className="req-head__title">{b.name}</h2>
            <p className="req-head__type">{b.stateName} › {b.districtName}</p>
          </div>
          <div className="req-head__badges">
            <RecordBadge status={r.status} />
            <SyncBadge status={r.syncStatus} />
            <OwnershipBadge o={ownershipOf(s, "hierarchy").ownership} />
            {can("branches:edit") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setPins(r.pincodes.join(", ")); setStatus(r.status); setEdit(true); }}>Edit branch</button>}
          </div>
        </div>
      </section>
      <div className="grid-2">
        <Panel level={3} title="Branch">
          <dl className="kv kv--tight">
            {[["Branch ID", r.id], ["Branch code", r.code], ["Branch name", b.name], ["State", `${b.stateName} (${b.state})`], ["District", `${b.districtName} (${b.district})`], ["Pincodes", r.pincodes.join(", ") || "—"]].map(([k, v]) => <div key={k} className="kv__row"><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Panel>
        <Panel level={3} title="Source and synchronisation">
          <dl className="kv kv--tight">
            <div className="kv__row"><dt>Source system</dt><dd>SFDC (mock)</dd></div>
            <div className="kv__row"><dt>Source record ID</dt><dd className="mono small">{admin ? r.sourceRecordId : "Visible to hierarchy administrators"}</dd></div>
            <div className="kv__row"><dt>Sync status</dt><dd><SyncBadge status={r.syncStatus} /></dd></div>
            <div className="kv__row"><dt>Last synced</dt><dd>{r.lastSyncedAt ? formatDateTime(r.lastSyncedAt) : "Never"}</dd></div>
            <div className="kv__row"><dt>Last sync error</dt><dd className={r.lastSyncError ? "neg small" : ""}>{r.lastSyncError ? (admin ? r.lastSyncError : "An error is recorded; details are visible to hierarchy administrators") : "None"}</dd></div>
            <div className="kv__row"><dt>Editability</dt><dd className="small">Hierarchy: {OWNERSHIP[ownershipOf(s, "hierarchy").ownership].label} · Pincode: {OWNERSHIP[ownershipOf(s, "pincode").ownership].label}</dd></div>
          </dl>
        </Panel>
      </div>
      <Panel level={3} title="Product and SKU mappings" subtitle={`${mappings.length} products mapped to this branch`} padded={false}>
        <DataTable rows={mappings} rowKey={(m) => m.id} caption="Products mapped to the branch" searchPlaceholder="Search products" pageSize={8} columns={[
          { key: "code", header: "Product", value: (m) => productById(s, m.productId)?.code ?? "", render: (m) => <Link to={`/masters/products/${m.productId}`} className="mono small" onClick={(e) => e.stopPropagation()}>{productById(s, m.productId)?.code}</Link> },
          { key: "name", header: "Name", value: (m) => productById(s, m.productId)?.name ?? "" },
          { key: "since", header: "Mapped on", value: (m) => m.createdAt, render: (m) => <span className="small num">{formatDateTime(m.createdAt)}</span> },
        ] as Column<(typeof mappings)[number]>[]} emptyTitle="No product is mapped to this branch" />
      </Panel>
      <Panel level={3} title="Scanning configuration references">
        {configs.length + rules.length === 0 ? <p className="muted small">No scan configuration references this branch.</p> : (
          <ul className="ref-list">
            {configs.map((c) => <li key={c.id}><Link to={`/masters/scanning/points/${c.id}`} className="mono small">{c.id}</Link> · scan points for {skuById(s, c.skuId)?.code} · {pointsState(c)}</li>)}
            {rules.map((x) => <li key={x.id}><Link to={`/masters/scanning/rules/${x.id}`} className="mono small">{x.code}</Link> · {x.name} · {ruleState(x)}</li>)}
          </ul>
        )}
      </Panel>
      {syncHistory.length > 0 && (
        <Panel level={3} title="Synchronisation events for this branch">
          <ul className="ref-list">{syncHistory.map((run) => <li key={run.id} className="small"><span className="mono">{run.id}</span> · {formatDateTime(run.startedAt)} · {admin ? run.errors.find((e) => e.recordCode === code)?.error : "Error recorded"}</li>)}</ul>
        </Panel>
      )}
      <MasterAuditTable events={history} title="Change history" />
      <ReasonDialog
        open={edit}
        title={`Edit ${b.name}`}
        confirmLabel="Save"
        body={!hierEditable || !pinEditable ? <Notice tone="warn" icon={<Database size={16} strokeWidth={2} aria-hidden="true" />}>Hierarchy is {OWNERSHIP[ownershipOf(s, "hierarchy").ownership].label.toLowerCase()} and pincode mapping is {OWNERSHIP[ownershipOf(s, "pincode").ownership].label.toLowerCase()}. The portal will refuse changes to read-only data; they must be made in SFDC.</Notice> : "Changes are audited."}
        onClose={() => setEdit(false)}
        onConfirm={(reason) => {
          const pinList = pins.split(",").map((p) => p.trim()).filter(Boolean);
          const patch: { pincodes?: string[]; status?: "active" | "inactive" } = {};
          if (pinList.join(",") !== r.pincodes.join(",")) patch.pincodes = pinList;
          if (status !== r.status) patch.status = status;
          if (!Object.keys(patch).length) return { ok: false, errors: ["Nothing changed"], warnings: [] };
          const out = updateBranchRecord(uid, code, patch, reason);
          if (out.ok) notify("Branch updated", "positive");
          return out;
        }}
      >
        <TextField label="Pincodes (comma-separated)" value={pins} onChange={setPins} />
        <SelectInput label="Status" value={status} onChange={(v) => setStatus(v as "active" | "inactive")} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
      </ReasonDialog>
    </div>
  );
}

export function SyncPage() {
  const { s, can, uid } = useMasterView();
  const { notify } = useToast();
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const [cStatus, setCStatus] = useState<SyncConflict["status"]>("under_review");
  const [recFilter, setRecFilter] = useState<SyncStatus | "all">("failed");
  const admin = can("branches:manage");
  const last = s.syncRuns[s.syncRuns.length - 1];
  const runCols: Column<SyncRun>[] = [
    { key: "id", header: "Sync reference", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
    { key: "source", header: "Source", value: (r) => r.source },
    { key: "start", header: "Started", value: (r) => r.startedAt, render: (r) => <span className="small num">{formatDateTime(r.startedAt)}</span> },
    { key: "end", header: "Completed", value: (r) => r.completedAt ?? "", render: (r) => <span className="small num">{r.completedAt ? formatDateTime(r.completedAt) : "—"}</span> },
    { key: "total", header: "Total", value: (r) => r.total, align: "right" },
    { key: "ok", header: "Successful", value: (r) => r.succeeded, align: "right" },
    { key: "failed", header: "Failed", value: (r) => r.failed, align: "right", render: (r) => <span className={`num ${r.failed ? "neg" : ""}`}>{r.failed}</span> },
    { key: "skipped", header: "Skipped", value: (r) => r.skipped, align: "right" },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "completed" ? "positive" : r.status === "partial" ? "warning" : "negative"}>{r.status}</StatusBadge> },
    { key: "errors", header: "Error details", value: (r) => r.errors.map((e) => `${e.recordCode}: ${e.error}`).join("; "), render: (r) => <span className="small cell-wrap" title={admin ? r.errors.map((e) => `${e.recordCode}: ${e.error}`).join("; ") : undefined}>{r.errors.length ? (admin ? `${r.errors.length}: ${r.errors.map((e) => e.recordCode).join(", ")}` : `${r.errors.length} error(s)`) : "—"}</span> },
  ];
  const recs = s.hierarchy.filter((h) => recFilter === "all" || h.syncStatus === recFilter);
  const recCols: Column<HierarchyRecord>[] = [
    { key: "src", header: "Source record ID", value: (h) => (admin ? h.sourceRecordId ?? "" : ""), render: (h) => <span className="mono small">{admin ? h.sourceRecordId : "Restricted"}</span> },
    { key: "id", header: "Internal record ID", value: (h) => h.id, render: (h) => <span className="mono small">{h.id}</span> },
    { key: "code", header: "Record", value: (h) => h.code, render: (h) => (h.level === "branch" ? <Link to={`/masters/branches/branch/${h.code}`} className="mono small" onClick={(e) => e.stopPropagation()}>{h.code}</Link> : <span className="mono small">{h.code}</span>) },
    { key: "level", header: "Level", value: (h) => h.level },
    { key: "synced", header: "Last synced", value: (h) => h.lastSyncedAt ?? "", render: (h) => <span className="small num">{h.lastSyncedAt ? formatDateTime(h.lastSyncedAt) : "Never"}</span> },
    { key: "status", header: "Sync status", value: (h) => h.syncStatus, render: (h) => <SyncBadge status={h.syncStatus} /> },
    { key: "err", header: "Last sync error", value: (h) => h.lastSyncError ?? "", render: (h) => <span className="small cell-wrap">{h.lastSyncError ? (admin ? h.lastSyncError : "Recorded") : "—"}</span> },
  ];
  const conflictCols: Column<SyncConflict>[] = [
    { key: "id", header: "Conflict", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> },
    { key: "kind", header: "Type", value: (c) => CONFLICT_LABEL[c.kind] },
    { key: "rec", header: "Record", value: (c) => c.recordCode, render: (c) => <Link to={`/masters/branches/branch/${c.recordCode}`} className="mono small" onClick={(e) => e.stopPropagation()}>{c.recordCode}</Link> },
    { key: "portal", header: "Portal value", value: (c) => c.portalValue, render: (c) => <span className="small">{c.portalValue}</span> },
    { key: "source", header: "Source value", value: (c) => c.sourceValue, render: (c) => <span className="small">{c.sourceValue}</span> },
    { key: "at", header: "Detected", value: (c) => c.detectedAt, render: (c) => <span className="small num">{formatDateTime(c.detectedAt)} · {c.syncRunId}</span> },
    { key: "status", header: "Status", value: (c) => c.status, render: (c) => <StatusBadge tone={c.status === "open" ? "warning" : c.status === "under_review" ? "info" : "positive"}>{c.status.replace(/_/g, " ")}</StatusBadge> },
    { key: "note", header: "Note", value: (c) => c.note, render: (c) => <span className="small cell-wrap">{c.note || "—"}</span> },
    { key: "act", header: "Actions", value: () => null, sortable: false, noSearch: true, render: (c) => admin && c.status !== "resolved_by_source" && <button type="button" className="btn btn--secondary btn--xs" onClick={(e) => { e.stopPropagation(); setConflict(c); setCStatus("under_review"); }}>Review</button> },
  ];
  return (
    <>
      <SectionTitle title="SFDC synchronisation" description="Mock synchronisation status and history. No SFDC API is connected" actions={admin && <button type="button" className="btn btn--dark" onClick={() => { const out = runMockSync(uid); notify(out.ok ? `Mock sync ${out.id}: ${out.run?.succeeded} ok, ${out.run?.failed} failed, ${out.run?.skipped} skipped` : out.errors[0], out.ok ? (out.run?.failed ? "info" : "positive") : "negative"); }}><RefreshCw size={16} strokeWidth={2} aria-hidden="true" />Run mock sync</button>} />
      <Panel level={3} title="Latest synchronisation">
        <dl className="kv kv--tight">
          <div className="kv__row"><dt>Source system</dt><dd>{last.source} (mock) · {last.id}</dd></div>
          <div className="kv__row"><dt>Last sync started</dt><dd>{formatDateTime(last.startedAt)}</dd></div>
          <div className="kv__row"><dt>Last sync completed</dt><dd>{last.completedAt ? formatDateTime(last.completedAt) : "—"}</dd></div>
          <div className="kv__row"><dt>Sync status</dt><dd><StatusBadge tone={last.status === "completed" ? "positive" : last.status === "partial" ? "warning" : "negative"}>{last.status}</StatusBadge></dd></div>
        </dl>
        <FigureRow items={[{ label: "Records received", value: String(last.total) }, { label: "Successful", value: String(last.succeeded), tone: "positive" }, { label: "Failed", value: String(last.failed), tone: last.failed ? "negative" : undefined }, { label: "Skipped", value: String(last.skipped) }]} />
        <p className="small"><strong>Error summary:</strong> {last.errors.length ? `${last.errors.length} record(s); ${admin ? Array.from(new Set(last.errors.map((e) => e.recordCode))).join(", ") : "details visible to hierarchy administrators"}` : "none"}.</p>
        <Notice tone="info">Failed and conflicting records are never applied over existing data. A conflict is reviewed here and corrected at the source (SFDC); the next synchronisation brings the fix.</Notice>
      </Panel>
      <Panel level={3} title="Synchronisation history" padded={false}>
        <DataTable rows={s.syncRuns} columns={runCols} rowKey={(r) => r.id} caption="Synchronisation history" searchable={false} initialSort={{ key: "start", dir: "desc" }} />
      </Panel>
      <Panel level={3} title="Data conflicts" subtitle="Detected differences between SFDC and portal records" padded={false}>
        <DataTable rows={s.conflicts} columns={conflictCols} rowKey={(c) => c.id} caption="Data conflicts" searchable={false} />
      </Panel>
      <Panel level={3} title="Record-level sync status" padded={false}>
        <DataTable rows={recs} columns={recCols} rowKey={(h) => h.id} caption="Record-level sync status" searchPlaceholder="Search records" pageSize={10} toolbar={<SelectField label="Sync status" value={recFilter} onChange={(v) => setRecFilter(v as SyncStatus | "all")} options={[{ value: "all", label: "All records" }, ...Object.entries(SYNC_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} active={recFilter !== "all"} />} />
      </Panel>
      <ReasonDialog
        open={!!conflict}
        title={conflict ? `Review ${conflict.id} · ${CONFLICT_LABEL[conflict.kind]}` : ""}
        confirmLabel="Save review"
        body={conflict && <p className="small">Portal: <strong>{conflict.portalValue}</strong> · Source: <strong>{conflict.sourceValue}</strong>. Reviewing never overwrites the portal record.</p>}
        onClose={() => setConflict(null)}
        onConfirm={(note) => { const out = reviewConflict(uid, conflict!.id, cStatus, note); if (out.ok) { notify("Conflict review saved", "positive"); out.warnings.forEach((w) => notify(w, "info")); } return out; }}
      >
        <SelectInput label="Review status" value={cStatus} onChange={(v) => setCStatus(v as SyncConflict["status"])} options={[{ value: "under_review", label: "Under review" }, { value: "resolved_by_source", label: "To be corrected in SFDC" }, { value: "open", label: "Open" }]} />
      </ReasonDialog>
    </>
  );
}

export function OwnershipPage() {
  const { s, can, uid } = useMasterView();
  const { notify } = useToast();
  const [edit, setEdit] = useState<{ type: "hierarchy" | "pincode"; o: Ownership } | null>(null);
  const decision = s.decisions.find((d) => d.id === "MDR-01");
  return (
    <>
      <SectionTitle title="Data ownership" description="Who may change hierarchy and pincode data. Defaults keep SFDC-controlled data read-only" />
      <Notice tone="warn">Open point <strong>{decision?.ref}</strong> is <strong>{decision?.status.replace("_", " ")}</strong>: {decision?.question} “Portal managed” cannot be selected until it is confirmed in the decision register.</Notice>
      <Panel padded={false}>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Data ownership</caption>
            <thead><tr><th scope="col">Data</th><th scope="col">Ownership</th><th scope="col">Meaning</th><th scope="col">Decision</th><th scope="col">Last changed</th>{can("branches:manage") && <th scope="col">Actions</th>}</tr></thead>
            <tbody>
              {s.ownership.map((o) => (
                <tr key={o.dataType}>
                  <td>{o.label}</td>
                  <td><OwnershipBadge o={o.ownership} /></td>
                  <td className="small">{OWNERSHIP[o.ownership].meaning}</td>
                  <td className="mono small">{o.decisionRef}</td>
                  <td className="small num">{formatDateTime(o.updatedAt)}</td>
                  {can("branches:manage") && <td><button type="button" className="btn btn--secondary btn--xs" onClick={() => setEdit({ type: o.dataType, o: o.ownership })}>Change</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <ReasonDialog
        open={!!edit}
        title="Change data ownership"
        confirmLabel="Save"
        body="Ownership controls editability only. It never pushes data to SFDC."
        onClose={() => setEdit(null)}
        onConfirm={(reason) => { const out = setOwnership(uid, edit!.type, edit!.o, reason); if (out.ok) notify("Ownership updated", "positive"); return out; }}
      >
        {edit && <SelectInput label="Ownership" value={edit.o} onChange={(v) => setEdit({ ...edit, o: v as Ownership })} options={(Object.keys(OWNERSHIP) as Ownership[]).map((k) => ({ value: k, label: OWNERSHIP[k].label }))} />}
      </ReasonDialog>
    </>
  );
}
