import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Overlay";
import { DataTable } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/Panel";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useAccessState } from "@/features/access/store";
import { orgById, userName } from "@/features/access/engine";
import { formatDateTime } from "@/lib/format";
import type { AuditAction, AuditEvent } from "@/types/rbac";
import { SectionTitle } from "./shared";

export const AUDIT_LABEL: Record<AuditAction, string> = {
  "user.created": "User created",
  "user.updated": "User updated",
  "user.invited": "Invitation issued",
  "user.suspended": "Account suspended",
  "user.reactivated": "Account reactivated",
  "user.deactivated": "Account deactivated",
  "user.access_revoked": "Access revoked",
  "user.credential_reset_requested": "Credential reset requested",
  "membership.added": "Organisation membership added",
  "membership.changed": "Organisation membership changed",
  "role.assigned": "Role assigned / changed",
  "role.removed": "Role removed",
  "role.expired": "Access expired",
  "permission.added": "Permission added",
  "permission.removed": "Permission removed",
  "scope.programme_changed": "Programme access changed",
  "scope.geography_changed": "Geography access changed",
  "maker.nominated": "Maker nominated",
  "maker.nomination_returned": "Nomination returned",
  "maker.nomination_approved": "Nomination approved",
  "maker.nomination_rejected": "Nomination rejected",
  "maker.provisioned": "Maker access provisioned",
  "checker.assigned": "Checker access assigned",
  "checker.revoked": "Checker access revoked",
  "role_template.created": "Role template created",
  "role_template.changed": "Role template changed",
  "role_template.cloned": "Role template cloned",
  "organisation.created": "Organisation created",
  "organisation.changed": "Organisation changed",
  "organisation.deactivated": "Organisation deactivated",
  "admin.override": "Administrative override",
  "access.denied": "Blocked attempt",
};

const GROUPS: { value: string; label: string; match: (a: AuditAction) => boolean }[] = [
  { value: "all", label: "All events", match: () => true },
  { value: "user", label: "Accounts", match: (a) => a.startsWith("user.") || a.startsWith("membership.") },
  { value: "access", label: "Roles, permissions & scope", match: (a) => a.startsWith("role.") || a.startsWith("permission.") || a.startsWith("scope.") },
  { value: "maker", label: "Maker & Checker", match: (a) => a.startsWith("maker.") || a.startsWith("checker.") },
  { value: "templates", label: "Role templates", match: (a) => a.startsWith("role_template.") },
  { value: "org", label: "Organisations", match: (a) => a.startsWith("organisation.") },
  { value: "blocked", label: "Blocked attempts & overrides", match: (a) => a === "access.denied" || a === "admin.override" },
];

/** Read-only audit list. There is deliberately no edit or delete action for audit records. */
export function AuditTable({ events, caption, pageSize = 12 }: { events: AuditEvent[]; caption: string; pageSize?: number }) {
  const s = useAccessState();
  const { can } = useSession();
  const [open, setOpen] = useState<AuditEvent | null>(null);
  return (
    <>
      <Panel padded={false}>
        <DataTable
          rows={events}
          rowKey={(e) => e.id}
          caption={caption}
          searchPlaceholder="Search action, person, reference or value"
          pageSize={pageSize}
          exportName={can("audit:export") || can("users:export") ? "access-history" : undefined}
          onRowClick={setOpen}
          rowActionLabel={(e) => `Open audit event ${e.id}`}
          initialSort={{ key: "at", dir: "desc" }}
          emptyTitle="No access events"
          columns={[
            { key: "at", header: "When", value: (e) => e.at, render: (e) => <span className="small num">{formatDateTime(e.at)}</span> },
            { key: "action", header: "Action", value: (e) => AUDIT_LABEL[e.action], render: (e) => <span className={e.status === "blocked" ? "neg" : ""}>{AUDIT_LABEL[e.action]}</span> },
            { key: "target", header: "Target", value: (e) => e.targetLabel, render: (e) => <span className="cell-2"><span className="cell-2__main">{e.targetLabel}</span><span className="cell-2__sub mono">{e.targetId}</span></span> },
            { key: "by", header: "Performed by", value: (e) => userName(s, e.actorUserId), render: (e) => <span className="cell-2"><span className="cell-2__main small">{userName(s, e.actorUserId)}</span><span className="cell-2__sub">{e.actorOrgId ? orgById(s, e.actorOrgId)?.name : "Platform"}</span></span> },
            { key: "change", header: "Change", value: (e) => `${e.previous ?? ""} ${e.next ?? ""}`, render: (e) => <span className="change"><span className="change__prev">{e.previous ?? "—"}</span><span className="change__next">{e.next ?? "—"}</span></span> },
            { key: "reason", header: "Reason", value: (e) => e.reason, render: (e) => <span className="small wrap">{e.reason || "—"}</span> },
            { key: "ref", header: "Reference", value: (e) => e.ref, render: (e) => <span className="mono small">{e.ref}</span> },
            { key: "status", header: "Status", value: (e) => e.status, render: (e) => <StatusBadge tone={e.status === "blocked" ? "negative" : "positive"}>{e.status === "blocked" ? "Blocked" : "Recorded"}</StatusBadge> },
          ]}
        />
      </Panel>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? AUDIT_LABEL[open.action] : ""} subtitle={<span className="mono">{open?.id}</span>}>
        {open && (
          <dl className="kv kv--wide">
            {[
              ["Audit ID", open.id],
              ["Timestamp", formatDateTime(open.at)],
              ["Actor", `${userName(s, open.actorUserId)} (${open.actorUserId})`],
              ["Actor organisation", open.actorOrgId ? (orgById(s, open.actorOrgId)?.name ?? open.actorOrgId) : "Platform / system"],
              ["Target", `${open.targetLabel} (${open.targetType} ${open.targetId})`],
              ["Action type", open.action],
              ["Module", open.module],
              ["Previous state", open.previous ?? "—"],
              ["New state", open.next ?? "—"],
              ["Reason / remarks", open.reason || "—"],
              ["Reference", open.ref],
              ["Status", open.status],
            ].map(([k, v]) => (
              <div key={k} className="kv__row">
                <dt>{k}</dt>
                <dd className="wrap">{v}</dd>
              </div>
            ))}
            <p className="panel__note">Audit records are immutable. The full Audit Trail module will add retention and tamper-evidence controls.</p>
          </dl>
        )}
      </Drawer>
    </>
  );
}

export function AccessAuditPage() {
  const s = useAccessState();
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const events = useMemo(() => {
    const g = GROUPS.find((x) => x.value === group)!;
    return s.audit.filter((e) => g.match(e.action) && (status === "all" || e.status === status));
  }, [s.audit, group, status]);
  return (
    <>
      <SectionTitle
        title="Access history"
        description="Every user, role, permission, scope, organisation and nomination change, including blocked attempts"
        actions={
          <>
            <SelectField label="Event type" value={group} onChange={setGroup} options={GROUPS.map((g) => ({ value: g.value, label: g.label }))} active={group !== "all"} />
            <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "success", label: "Recorded" }, { value: "blocked", label: "Blocked" }]} active={status !== "all"} />
          </>
        }
      />
      <AuditTable events={events} caption="Access history" pageSize={15} />
    </>
  );
}
