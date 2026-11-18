import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/Panel";
import { FigureRow } from "@/components/ui/DataBars";
import { SelectField } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { revokeAssignment, useAccessState } from "@/features/access/store";
import { canChangeAssignment, fullName, orgById, userName } from "@/features/access/engine";
import { moduleById } from "@/config/rbacCatalogue";
import { ROLE } from "@/data/mock/rbacSeed";
import { formatDateTime } from "@/lib/format";
import { ASSIGNMENT_STATUS, AssignmentStatusBadge, ReasonDialog, ScopeText, SectionTitle } from "./shared";
import { AssignmentDrawer } from "./AssignmentDrawer";

/** Checker access: explicit, module-limited, scoped assignments of the Checker operational profile. */
export function CheckerAccessPage() {
  const s = useAccessState();
  const { user, can } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();
  const [status, setStatus] = useState("live");
  const [assignOpen, setAssignOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const canAssign = can("users:manage") && can("users:assign_access");

  const all = useMemo(() => s.assignments.filter((a) => a.roleId === ROLE.CHECKER), [s.assignments]);
  const rows = all.filter((a) => (status === "live" ? ["active", "pending", "suspended"].includes(a.status) : status === "all" || a.status === status));

  return (
    <>
      <SectionTitle
        title="Checker access"
        description="Checker access is assigned explicitly, per module and scope. No organisation or job title implies it"
        actions={
          <>
            <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "live", label: "Current (active, pending, suspended)" }, { value: "all", label: "All" }, ...Object.entries(ASSIGNMENT_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
            {canAssign && (
              <button type="button" className="btn btn--primary" onClick={() => setAssignOpen(true)}>
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Assign Checker access
              </button>
            )}
          </>
        }
      />
      <div className="callout callout--info">
        <Info size={16} strokeWidth={2} aria-hidden="true" />
        <span>
          A Checker can approve, reject or return only in the modules listed on their assignment and only within its programmes and locations. The per-request rule that a Checker cannot approve their own submission is enforced in the Maker-Checker phase. Use the <Link className="link-btn" to="/governance/users/permissions?role=ROLE-0009">permission matrix</Link> to see exactly which actions the Checker profile carries.
        </span>
      </div>
      <Panel padded={false}>
        <FigureRow
          items={[
            { label: "Active Checker assignments", value: String(all.filter((a) => a.status === "active").length) },
            { label: "People with Checker access", value: String(new Set(all.filter((a) => a.status === "active").map((a) => a.userId)).size) },
            { label: "Modules covered", value: String(new Set(all.filter((a) => a.status === "active").flatMap((a) => a.moduleLimit ?? [])).size) },
            { label: "Revoked or expired", value: String(all.filter((a) => ["revoked", "expired"].includes(a.status)).length) },
          ]}
        />
      </Panel>
      <Panel padded={false}>
        <DataTable
          rows={rows}
          rowKey={(a) => a.id}
          caption="Checker assignments"
          searchPlaceholder="Search user or module"
          exportName="checker-access"
          emptyTitle="No Checker assignments"
          columns={[
            { key: "user", header: "User", value: (a) => userName(s, a.userId), render: (a) => <Link className="link-btn" to={`/governance/users/user/${a.userId}`}>{fullName(s.users.find((u) => u.id === a.userId))}</Link> },
            { key: "org", header: "Organisation", value: (a) => orgById(s, s.memberships.find((m) => m.id === a.membershipId)?.orgId ?? "")?.name ?? "" },
            { key: "mods", header: "Permitted modules", value: (a) => (a.moduleLimit ?? []).map((m) => moduleById.get(m)?.label).join(", "), render: (a) => <span className="small wrap">{(a.moduleLimit ?? []).map((m) => moduleById.get(m)?.label).join(", ")}</span> },
            { key: "scope", header: "Scope", value: (a) => JSON.stringify(a.scope), render: (a) => <ScopeText scope={a.scope} compact /> },
            { key: "dates", header: "Valid", value: (a) => a.validFrom, render: (a) => <span className="small num">{a.validFrom} → {a.validTo ?? "open"}</span> },
            { key: "reason", header: "Reason", value: (a) => a.reason, render: (a) => <span className="small wrap">{a.reason}</span> },
            { key: "by", header: "Assigned by", value: (a) => userName(s, a.assignedBy), render: (a) => <span className="cell-2"><span className="cell-2__main small">{userName(s, a.assignedBy)}</span><span className="cell-2__sub">{formatDateTime(a.assignedAt)}</span></span> },
            { key: "status", header: "Status", value: (a) => a.status, render: (a) => <AssignmentStatusBadge status={a.status} validTo={a.validTo} /> },
            {
              key: "x",
              header: "",
              value: () => null,
              sortable: false,
              render: (a) =>
                canChangeAssignment(s, actorId, a.id).ok && !["revoked", "expired"].includes(a.status) ? (
                  <span className="row-actions">
                    <button type="button" className="icon-btn icon-btn--sm" aria-label="Change scope" title="Change scope or end date" onClick={() => setEdit(a.id)}>
                      <Pencil size={15} strokeWidth={2} />
                    </button>
                    <button type="button" className="icon-btn icon-btn--sm" aria-label="Revoke Checker access" title="Revoke" onClick={() => setRevoke(a.id)}>
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </span>
                ) : null,
            },
          ]}
        />
      </Panel>
      <AssignmentDrawer open={assignOpen} onClose={() => setAssignOpen(false)} fixedRoleId={ROLE.CHECKER} title="Assign Checker access" />
      <AssignmentDrawer open={!!edit} onClose={() => setEdit(null)} editAssignmentId={edit ?? undefined} />
      <ReasonDialog open={!!revoke} title="Revoke Checker access" tone="danger" confirmLabel="Revoke" body={<p>The user keeps every other role and profile.</p>} onClose={() => setRevoke(null)} onConfirm={(r) => { const res = revokeAssignment(actorId, revoke!, r); if (res.ok) notify("Checker access revoked", "positive"); return res; }} />
    </>
  );
}
