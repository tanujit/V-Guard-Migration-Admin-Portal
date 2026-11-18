import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Ban, Eye, KeyRound, MailCheck, Pencil, Plus, RotateCcw, ShieldOff, Trash2, UserMinus, UserX } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Drawer } from "@/components/ui/Overlay";
import { DataTable } from "@/components/ui/DataTable";
import { Checkbox, MultiSelect, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { ScopeEditor } from "@/components/form/ScopeEditor";
import { DemoBadge, ProgrammeTag, StatusBadge } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import {
  addDirectGrant,
  addMembership,
  deactivateUser,
  reactivateUser,
  requestCredentialReset,
  revokeAllAccess,
  revokeAssignment,
  revokeDirectGrant,
  setAssignmentSuspended,
  simulateInvitationAccepted,
  suspendUser,
  updateUser,
  useAccessState,
} from "@/features/access/store";
import {
  canChangeAccountStatus,
  canChangeAssignment,
  canManageUser,
  describeScope,
  fullName,
  getAccessibleGeography,
  getAccessibleProgrammes,
  getEffectiveAccess,
  membershipsOf,
  orgById,
  roleById,
  userName,
  type PolicyResult,
} from "@/features/access/engine";
import { ACTIONS, key, MODULE_CATEGORY_LABEL, MODULES, moduleById } from "@/config/rbacCatalogue";
import { AUTH_CONFIG, AUTH_METHOD_LABEL } from "@/services/auth";
import { formatDateTime } from "@/lib/format";
import type { AccessScope, ActionId } from "@/types/rbac";
import { AccessDenied, AccountStatusBadge, AssignmentStatusBadge, maskMobile, PolicyMessages, ReasonDialog, RoleCategoryTag, ScopeText } from "./shared";
import { AssignmentDrawer } from "./AssignmentDrawer";
import { SuspendImpact } from "./UserDirectoryPage";
import { AuditTable } from "./AccessAuditPage";

type Tab = "overview" | "roles" | "permissions" | "scope" | "security" | "audit";

export function UserDetailPage() {
  const { userId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const s = useAccessState();
  const { user: me, can } = useSession();
  const actorId = me!.id;
  const { notify } = useToast();
  const tab = (params.get("tab") as Tab) ?? "overview";
  const setTab = (t: Tab) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  const u = s.users.find((x) => x.id === userId);
  const access = useMemo(() => (u ? getEffectiveAccess(s, u.id) : null), [s, u]);
  const [dialog, setDialog] = useState<null | "suspend" | "reactivate" | "deactivate" | "revoke_all" | { revoke: string } | { suspendAsg: string; suspend: boolean } | { revokeGrant: string }>(null);
  const [drawer, setDrawer] = useState<null | "assign" | "profile" | "membership" | "grant" | { edit: string }>(null);
  const [restore, setRestore] = useState<string[]>([]);

  if (!can("users:view")) return <AccessDenied message="You need User & role management: View." />;
  if (!u || !access) return <AccessDenied message={`No user with ID ${userId}.`} />;

  const manage = canManageUser(s, actorId, u.id, "edit");
  const statusCheck = (to: Parameters<typeof canChangeAccountStatus>[3]) => canChangeAccountStatus(s, actorId, u.id, to);
  const canSeeMobile = can("users:view_sensitive");
  const memberships = membershipsOf(s, u.id);
  const assignments = s.assignments.filter((a) => a.userId === u.id);
  const grants = s.directGrants.filter((g) => g.userId === u.id);
  const events = s.audit.filter((e) => e.targetId === u.id || (e.targetType === "nomination" && s.nominations.find((n) => n.id === e.targetId)?.candidate.existingUserId === u.id)).slice().reverse();
  const isSelf = u.id === actorId;
  const effective = getEffectivePermissionsTable(access);

  const notifyResult = (r: PolicyResult, ok: string) => {
    if (r.ok) notify(ok, "positive");
    return r;
  };

  return (
    <>
      <Panel className="user-hero">
        <div className="user-hero__main">
          <span className="avatar avatar--xl" aria-hidden="true">
            {u.firstName[0]}
            {u.lastName[0]}
          </span>
          <div>
            <h2 className="user-hero__name">
              {fullName(u)} <AccountStatusBadge status={u.accountStatus} />
            </h2>
            <p className="user-hero__meta">
              <span className="mono">{u.id}</span> · {u.designation} · {memberships.map((m) => orgById(s, m.orgId)?.name).join(" + ")}
            </p>
            {isSelf && <p className="small muted">This is your own account. You can view it, but changes to your own access must be made by another administrator.</p>}
          </div>
        </div>
        <div className="user-hero__actions">
          <Link to={`/governance/users/effective?user=${u.id}`} className="btn btn--secondary btn--sm">
            <Eye size={14} strokeWidth={2} aria-hidden="true" />
            Effective access
          </Link>
          {manage.ok && (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDrawer("profile")}>
              <Pencil size={14} strokeWidth={2} aria-hidden="true" />
              Edit profile
            </button>
          )}
          {["invited", "pending_activation"].includes(u.accountStatus) && manage.ok && (
            <button type="button" className="btn btn--tertiary btn--sm" onClick={() => notifyResult(simulateInvitationAccepted(actorId, u.id), "Marked as activated (mock)")} title="Development only: simulates the user accepting the invitation">
              <MailCheck size={14} strokeWidth={2} aria-hidden="true" />
              Simulate activation
            </button>
          )}
          {u.accountStatus !== "suspended" && u.accountStatus !== "deactivated" && statusCheck("suspended").ok && (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDialog("suspend")}>
              <UserX size={14} strokeWidth={2} aria-hidden="true" />
              Suspend
            </button>
          )}
          {["suspended", "locked", "deactivated"].includes(u.accountStatus) && statusCheck("active").ok && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { setRestore([]); setDialog("reactivate"); }}>
              <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
              Reactivate
            </button>
          )}
        </div>
      </Panel>

      {access.warnings.length > 0 && <PolicyMessages result={{ errors: [], warnings: access.warnings }} warnTitle="Access notes" />}

      <Tabs<Tab>
        label="User sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "roles", label: "Organisations & roles", count: assignments.filter((a) => a.status !== "revoked").length },
          { id: "permissions", label: "Module permissions", count: effective.length },
          { id: "scope", label: "Programme & geography" },
          { id: "security", label: "Security & status" },
          { id: "audit", label: "Access history", count: events.length },
        ]}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tab-panel">
        {tab === "overview" && (
          <div className="grid grid--12">
            <Panel span={7} title="Profile">
              <dl className="kv kv--wide">
                <KV k="Full name" v={fullName(u)} />
                <KV k="User ID" v={<span className="mono">{u.id}</span>} />
                <KV k="Business email" v={u.email} />
                <KV k="Mobile" v={<span className="mono">{maskMobile(u.mobile, canSeeMobile)}</span>} note={canSeeMobile ? undefined : "Masked: needs View sensitive"} />
                <KV k="Employee ID" v={u.employeeId ?? "—"} />
                <KV k="Designation" v={u.designation} />
                <KV k="Department" v={u.department || "—"} />
                <KV k="Reporting manager" v={u.reportingManagerId ? <Link className="link-btn" to={`/governance/users/user/${u.reportingManagerId}`}>{userName(s, u.reportingManagerId)}</Link> : "—"} />
              </dl>
            </Panel>
            <Panel span={5} title="Account">
              <dl className="kv kv--wide">
                <KV k="Status" v={<AccountStatusBadge status={u.accountStatus} />} />
                <KV k="Created" v={`${formatDateTime(u.createdAt)} by ${userName(s, u.createdBy)}`} />
                <KV k="Last login" v={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"} />
                <KV k="Invitation" v={u.invitation ? `${u.invitation.ref} · ${u.invitation.status}` : "—"} note={u.invitation?.status === "pending" ? "No email is sent in this build" : undefined} />
                <KV k="Organisations" v={memberships.map((m) => orgById(s, m.orgId)?.name).join(", ")} />
                <KV k="Active roles" v={access.sources.filter((x) => x.effective).map((x) => x.title).join(", ") || "None"} />
              </dl>
            </Panel>
          </div>
        )}

        {tab === "roles" && (
          <div className="stack">
            <Panel title="Organisation memberships" padded={false} actions={can("users:manage") && !isSelf && <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDrawer("membership")}><Plus size={14} strokeWidth={2} aria-hidden="true" />Add membership</button>}>
              <DataTable
                rows={memberships}
                rowKey={(m) => m.id}
                caption="Organisation memberships"
                searchable={false}
                columns={[
                  { key: "org", header: "Organisation", value: (m) => orgById(s, m.orgId)?.name ?? m.orgId, render: (m) => <span>{orgById(s, m.orgId)?.name} {orgById(s, m.orgId)?.status === "inactive" && <StatusBadge tone="negative">Organisation inactive</StatusBadge>}</span> },
                  { key: "dept", header: "Department", value: (m) => m.department },
                  { key: "des", header: "Designation", value: (m) => m.designation },
                  { key: "since", header: "Since", value: (m) => m.since },
                  { key: "status", header: "Status", value: (m) => m.status, render: (m) => <StatusBadge tone={m.status === "active" ? "positive" : "neutral"}>{m.status === "active" ? "Active" : "Inactive"}</StatusBadge> },
                ]}
              />
            </Panel>
            <Panel title="Role and profile assignments" subtitle="Each assignment has its own organisation, scope, dates and status" padded={false} actions={can("users:assign_access") && !isSelf && <button type="button" className="btn btn--primary btn--sm" onClick={() => setDrawer("assign")}><Plus size={14} strokeWidth={2} aria-hidden="true" />Assign access</button>}>
              <DataTable
                rows={assignments}
                rowKey={(a) => a.id}
                caption="Role assignments"
                searchable={false}
                initialSort={{ key: "status", dir: "asc" }}
                emptyTitle="No roles assigned"
                columns={[
                  { key: "role", header: "Role / profile", value: (a) => roleById(s, a.roleId)?.name ?? a.roleId, render: (a) => { const r = roleById(s, a.roleId); return <span className="cell-2"><span className="cell-2__main">{r?.name} {a.moduleLimit && <span className="small muted">· {a.moduleLimit.map((m) => moduleById.get(m)?.label).join(", ")}</span>}</span><span className="cell-2__sub"><RoleCategoryTag category={r?.category ?? "business"} /> <span className="mono">{a.accessRef}</span></span></span>; } },
                  { key: "org", header: "Organisation", value: (a) => orgById(s, memberships.find((m) => m.id === a.membershipId)?.orgId ?? "")?.name ?? "—" },
                  { key: "scope", header: "Scope", value: (a) => describeScope(a.scope).programmes, render: (a) => <ScopeText scope={a.scope} compact /> },
                  { key: "dates", header: "Valid", value: (a) => a.validFrom, render: (a) => <span className="small num">{a.validFrom} → {a.validTo ?? "open"}</span> },
                  { key: "by", header: "Assigned by", value: (a) => userName(s, a.assignedBy), render: (a) => <span className="cell-2"><span className="cell-2__main small">{userName(s, a.assignedBy)}</span><span className="cell-2__sub">{formatDateTime(a.assignedAt)}</span></span> },
                  { key: "status", header: "Status", value: (a) => a.status, render: (a) => <AssignmentStatusBadge status={a.status} validTo={a.validTo} /> },
                  {
                    key: "actions",
                    header: "",
                    value: () => null,
                    sortable: false,
                    render: (a) => {
                      const ch = canChangeAssignment(s, actorId, a.id);
                      if (!ch.ok || ["revoked", "expired"].includes(a.status)) return <span className="muted small" title={ch.errors.join("; ")}>{["revoked", "expired"].includes(a.status) ? "" : "No access"}</span>;
                      const op = roleById(s, a.roleId)?.category === "operational";
                      return (
                        <span className="row-actions">
                          <button type="button" className="icon-btn icon-btn--sm" title="Change scope or end date" aria-label="Change scope" onClick={() => setDrawer({ edit: a.id })}>
                            <Pencil size={15} strokeWidth={2} />
                          </button>
                          {op && (a.status === "active" || a.status === "suspended") && (
                            <button type="button" className="icon-btn icon-btn--sm" title={a.status === "active" ? "Suspend this profile" : "Restore this profile"} aria-label={a.status === "active" ? "Suspend profile" : "Restore profile"} onClick={() => setDialog({ suspendAsg: a.id, suspend: a.status === "active" })}>
                              {a.status === "active" ? <Ban size={15} strokeWidth={2} /> : <RotateCcw size={15} strokeWidth={2} />}
                            </button>
                          )}
                          <button type="button" className="icon-btn icon-btn--sm" title="Revoke" aria-label="Revoke assignment" onClick={() => setDialog({ revoke: a.id })}>
                            <Trash2 size={15} strokeWidth={2} />
                          </button>
                        </span>
                      );
                    },
                  },
                ]}
              />
            </Panel>
          </div>
        )}

        {tab === "permissions" && (
          <div className="stack">
            <Panel title="Effective module permissions" subtitle="Computed by the access engine from effective roles, profiles and direct grants" padded={false} actions={<Link className="btn btn--ghost btn--sm" to={`/governance/users/effective?user=${u.id}`}>Explain sources</Link>}>
              <DataTable
                rows={effective}
                rowKey={(r) => r.module}
                caption="Effective module permissions"
                searchPlaceholder="Search modules"
                pageSize={30}
                emptyTitle="No effective permissions"
                columns={[
                  { key: "module", header: "Module", value: (r) => moduleById.get(r.module)?.label ?? r.module, render: (r) => <span className="cell-2"><span className="cell-2__main">{moduleById.get(r.module)?.label}</span><span className="cell-2__sub">{MODULE_CATEGORY_LABEL[moduleById.get(r.module)!.category]}</span></span> },
                  { key: "actions", header: "Allowed actions", value: (r) => r.actions.join(", "), sortable: false, render: (r) => <span className="action-chips">{r.actions.map((a) => <span key={a} className={`action-chip ${ACTIONS.find((x) => x.id === a)?.restricted ? "is-restricted" : ""}`}>{ACTIONS.find((x) => x.id === a)?.label}</span>)}</span> },
                  { key: "src", header: "From", value: (r) => r.sources.join(", "), render: (r) => <span className="small">{r.sources.join(", ")}</span> },
                ]}
              />
            </Panel>
            <Panel title="Direct permission grants" subtitle="Permissions granted outside a role. Keep these rare, scoped and time-bound" padded={false} actions={can("users:assign_access") && !isSelf && <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDrawer("grant")}><Plus size={14} strokeWidth={2} aria-hidden="true" />Grant permission</button>}>
              <DataTable
                rows={grants}
                rowKey={(g) => g.id}
                caption="Direct grants"
                searchable={false}
                emptyTitle="No direct grants"
                columns={[
                  { key: "p", header: "Permissions", value: (g) => g.permissions.join(", "), render: (g) => <span className="action-chips">{g.permissions.map((k) => <span key={k} className="action-chip">{moduleById.get(k.split(":")[0])?.label}: {ACTIONS.find((a) => a.id === k.split(":")[1])?.label}</span>)}</span> },
                  { key: "scope", header: "Scope", value: (g) => describeScope(g.scope).programmes, render: (g) => <ScopeText scope={g.scope} compact /> },
                  { key: "dates", header: "Valid", value: (g) => g.validFrom, render: (g) => <span className="small num">{g.validFrom} → {g.validTo ?? "open"}</span> },
                  { key: "status", header: "Status", value: (g) => g.status, render: (g) => <AssignmentStatusBadge status={g.status} validTo={g.validTo} /> },
                  { key: "x", header: "", value: () => null, sortable: false, render: (g) => g.status === "active" && can("users:assign_access") && !isSelf ? <button type="button" className="icon-btn icon-btn--sm" aria-label="Revoke grant" title="Revoke" onClick={() => setDialog({ revokeGrant: g.id })}><Trash2 size={15} strokeWidth={2} /></button> : null },
                ]}
              />
            </Panel>
          </div>
        )}

        {tab === "scope" && (
          <div className="grid grid--12">
            <Panel span={5} title="Effective scope" subtitle="Union across effective assignments; each permission still applies only within its own assignment's scope">
              <dl className="kv kv--wide">
                <KV k="Programmes" v={(() => { const p = getAccessibleProgrammes(s, u.id); return p === "all" ? "All programmes" : p.length ? <span className="tag-row">{p.map((c) => <ProgrammeTag key={c} code={c} size="sm" />)}</span> : "None"; })()} />
                <KV k="Geography" v={describeScope({ programmes: "all", geography: getAccessibleGeography(s, u.id) }).geography} />
              </dl>
            </Panel>
            <Panel span={7} title="Scope per assignment" padded={false}>
              <DataTable
                rows={assignments.filter((a) => a.status !== "revoked")}
                rowKey={(a) => a.id}
                caption="Scope per assignment"
                searchable={false}
                columns={[
                  { key: "role", header: "Assignment", value: (a) => roleById(s, a.roleId)?.name ?? "" },
                  { key: "p", header: "Programmes", value: (a) => describeScope(a.scope).programmes },
                  { key: "g", header: "Geography", value: (a) => describeScope(a.scope).geography, render: (a) => <span className="small wrap">{describeScope(a.scope).geography}</span> },
                  { key: "v", header: "Valid", value: (a) => a.validTo ?? "", render: (a) => <span className="small num">{a.validFrom} → {a.validTo ?? "open"}</span> },
                  { key: "st", header: "Status", value: (a) => a.status, render: (a) => <AssignmentStatusBadge status={a.status} validTo={a.validTo} /> },
                  { key: "e", header: "", value: () => null, sortable: false, render: (a) => (canChangeAssignment(s, actorId, a.id).ok && a.status !== "expired" ? <button type="button" className="icon-btn icon-btn--sm" aria-label="Edit scope" title="Edit scope" onClick={() => setDrawer({ edit: a.id })}><Pencil size={15} strokeWidth={2} /></button> : null) },
                ]}
              />
            </Panel>
          </div>
        )}

        {tab === "security" && (
          <div className="grid grid--12">
            <Panel span={7} title="Authentication and account security">
              <dl className="kv kv--wide">
                <KV k="Account status" v={<AccountStatusBadge status={u.accountStatus} />} />
                <KV k="Authentication method" v={AUTH_METHOD_LABEL[u.authMethod]} />
                <KV k="Last successful login" v={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"} />
                <KV k="Failed sign-in attempts" v={String(u.security.failedLogins)} />
                <KV k="Last credential reset request" v={u.security.lastCredentialReset ? formatDateTime(u.security.lastCredentialReset) : "None recorded"} />
                <KV k="Multi-factor authentication" v="Not available until the identity provider is connected" />
                <KV k="Active sessions" v="Not available: supplied only by the authentication service" />
              </dl>
              <h4 className="panel__h4">Lock history</h4>
              {u.security.lockHistory.length ? (
                <ul className="plain-list">
                  {u.security.lockHistory.map((l) => (
                    <li key={l.at}>
                      <span className="num small">{formatDateTime(l.at)}</span> · {l.reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">No locks recorded</p>
              )}
              <p className="panel__note">No passwords, secrets or session tokens are held or shown by the portal.</p>
            </Panel>
            <Panel span={5} title="Account actions">
              <div className="action-list">
                <ActionButton icon={UserX} label="Suspend account" hint="All access stops until reactivated" check={u.accountStatus === "suspended" || u.accountStatus === "deactivated" ? { ok: false, errors: ["Account is not active"], warnings: [] } : statusCheck("suspended")} onClick={() => setDialog("suspend")} />
                <ActionButton icon={RotateCcw} label="Reactivate account" hint="Revoked access is not restored" check={["suspended", "locked", "deactivated"].includes(u.accountStatus) ? statusCheck("active") : { ok: false, errors: ["Account is already active or awaiting activation"], warnings: [] }} onClick={() => { setRestore([]); setDialog("reactivate"); }} />
                <ActionButton icon={ShieldOff} label="Revoke all access" hint="Keeps the account; revokes every role, profile and grant" check={statusCheck("revoke_all")} onClick={() => setDialog("revoke_all")} danger />
                <ActionButton icon={UserMinus} label="Deactivate account" hint="Withdraws open nominations" check={u.accountStatus === "deactivated" ? { ok: false, errors: ["Already deactivated"], warnings: [] } : statusCheck("deactivated")} onClick={() => setDialog("deactivate")} danger />
                <ActionButton icon={KeyRound} label="Request credential reset" hint={AUTH_CONFIG.capabilities.credentialReset ? "" : "Recorded only; identity provider not connected"} check={manage} onClick={() => notifyResult(requestCredentialReset(actorId, u.id), "Credential reset request recorded (mock)")} />
                <ActionButton icon={Ban} label="Revoke sessions" hint="Needs the authentication service" check={{ ok: false, errors: ["Session revocation is not available until the authentication service is connected"], warnings: [] }} onClick={() => undefined} />
              </div>
            </Panel>
          </div>
        )}

        {tab === "audit" && <AuditTable events={events} caption={`Access history for ${fullName(u)}`} />}
      </div>

      {/* ---------------- Dialogs ---------------- */}
      <ReasonDialog open={dialog === "suspend"} title={`Suspend ${fullName(u)}`} tone="danger" confirmLabel="Suspend account" body={<SuspendImpact userId={u.id} />} onClose={() => setDialog(null)} onConfirm={(r) => notifyResult(suspendUser(actorId, u.id, r), "Account suspended")} />
      <ReasonDialog
        open={dialog === "reactivate"}
        title={`Reactivate ${fullName(u)}`}
        confirmLabel="Reactivate"
        withDate
        body={<p>Reactivation does not silently restore access. Revoked access stays revoked; choose any suspended profiles to restore after revalidating them.</p>}
        onClose={() => setDialog(null)}
        onConfirm={(r, d) => notifyResult(reactivateUser(actorId, u.id, r, d, restore), "Account reactivated")}
      >
        {assignments.filter((a) => a.status === "suspended").length > 0 && (
          <div className="stack">
            <p className="impact__h">Suspended access to restore (optional)</p>
            {assignments
              .filter((a) => a.status === "suspended")
              .map((a) => (
                <Checkbox key={a.id} label={roleById(s, a.roleId)?.name} description={<ScopeText scope={a.scope} compact />} checked={restore.includes(a.id)} onChange={(v) => setRestore(v ? [...restore, a.id] : restore.filter((x) => x !== a.id))} />
              ))}
          </div>
        )}
      </ReasonDialog>
      <ReasonDialog open={dialog === "deactivate"} title={`Deactivate ${fullName(u)}`} tone="danger" confirmLabel="Deactivate" body={<><p>The account can no longer sign in and no access is effective. Assignments are kept for history.</p><PolicyMessages result={{ errors: [], warnings: statusCheck("deactivated").warnings }} /></>} onClose={() => setDialog(null)} onConfirm={(r) => notifyResult(deactivateUser(actorId, u.id, r), "Account deactivated")} />
      <ReasonDialog open={dialog === "revoke_all"} title={`Revoke all access for ${fullName(u)}`} tone="danger" confirmLabel="Revoke everything" body={<p>Every role, operational profile and direct grant is revoked. The account itself stays {u.accountStatus}.</p>} onClose={() => setDialog(null)} onConfirm={(r) => notifyResult(revokeAllAccess(actorId, u.id, r), "All access revoked")} />
      <ReasonDialog open={!!dialog && typeof dialog === "object" && "revoke" in dialog} title="Revoke assignment" tone="danger" confirmLabel="Revoke" body={dialog && typeof dialog === "object" && "revoke" in dialog ? <p>Revoke <strong>{roleById(s, s.assignments.find((a) => a.id === dialog.revoke)?.roleId ?? "")?.name}</strong>? Other assignments stay in place; the account is not deactivated.</p> : null} onClose={() => setDialog(null)} onConfirm={(r) => notifyResult(revokeAssignment(actorId, (dialog as { revoke: string }).revoke, r), "Assignment revoked")} />
      <ReasonDialog open={!!dialog && typeof dialog === "object" && "suspendAsg" in dialog} title={dialog && typeof dialog === "object" && "suspendAsg" in dialog && dialog.suspend ? "Suspend operational profile" : "Restore operational profile"} confirmLabel={dialog && typeof dialog === "object" && "suspendAsg" in dialog && dialog.suspend ? "Suspend" : "Restore"} body={<p>The account stays active; only this profile is affected.</p>} onClose={() => setDialog(null)} onConfirm={(r) => { const d = dialog as { suspendAsg: string; suspend: boolean }; return notifyResult(setAssignmentSuspended(actorId, d.suspendAsg, d.suspend, r), d.suspend ? "Profile suspended" : "Profile restored"); }} />
      <ReasonDialog open={!!dialog && typeof dialog === "object" && "revokeGrant" in dialog} title="Revoke direct grant" tone="danger" confirmLabel="Revoke" body={<p>The permissions in this grant stop immediately unless another assignment provides them.</p>} onClose={() => setDialog(null)} onConfirm={(r) => notifyResult(revokeDirectGrant(actorId, (dialog as { revokeGrant: string }).revokeGrant, r), "Grant revoked")} />

      {/* ---------------- Drawers ---------------- */}
      <AssignmentDrawer open={drawer === "assign"} onClose={() => setDrawer(null)} userId={u.id} />
      <AssignmentDrawer open={!!drawer && typeof drawer === "object"} onClose={() => setDrawer(null)} editAssignmentId={drawer && typeof drawer === "object" ? drawer.edit : undefined} />
      {/* Keyed so each opening starts from fresh values. */}
      <ProfileDrawer key={`p-${drawer === "profile"}`} open={drawer === "profile"} onClose={() => setDrawer(null)} userId={u.id} />
      <MembershipDrawer key={`m-${drawer === "membership"}`} open={drawer === "membership"} onClose={() => setDrawer(null)} userId={u.id} />
      <GrantDrawer key={`g-${drawer === "grant"}`} open={drawer === "grant"} onClose={() => setDrawer(null)} userId={u.id} />
    </>
  );
}

/* ---------------- Helpers & sub-components ---------------- */

function getEffectivePermissionsTable(access: ReturnType<typeof getEffectiveAccess>) {
  const rows = new Map<string, { module: string; actions: ActionId[]; sources: Set<string> }>();
  for (const [k, gs] of access.grants) {
    const [m, a] = [k.slice(0, k.lastIndexOf(":")), k.slice(k.lastIndexOf(":") + 1) as ActionId];
    const row = rows.get(m) ?? { module: m, actions: [], sources: new Set<string>() };
    row.actions.push(a);
    gs.forEach((g) => row.sources.add(g.source.kind === "direct" ? "Direct grant" : g.source.title));
    rows.set(m, row);
  }
  const order = MODULES.map((m) => m.id);
  return [...rows.values()].sort((a, b) => order.indexOf(a.module) - order.indexOf(b.module)).map((r) => ({ ...r, actions: ACTIONS.map((a) => a.id).filter((a) => r.actions.includes(a)), sources: [...r.sources] }));
}

function KV({ k, v, note }: { k: string; v: ReactNode; note?: string }) {
  return (
    <div className="kv__row">
      <dt>{k}</dt>
      <dd>
        {v}
        {note && <span className="kv__note">{note}</span>}
      </dd>
    </div>
  );
}

function ActionButton({ icon: Icon, label, hint, check, onClick, danger }: { icon: typeof Ban; label: string; hint: string; check: PolicyResult; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`action-item ${danger ? "action-item--danger" : ""}`} onClick={onClick} disabled={!check.ok} title={check.ok ? hint : check.errors.join("; ")}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
      <span className="action-item__text">
        <span className="action-item__label">{label}</span>
        <span className="action-item__hint">{check.ok ? hint : check.errors[0]}</span>
      </span>
    </button>
  );
}

function ProfileDrawer({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const s = useAccessState();
  const { user } = useSession();
  const { notify } = useToast();
  const u = s.users.find((x) => x.id === userId)!;
  const [form, setForm] = useState(() => ({ firstName: u.firstName, lastName: u.lastName, email: u.email, mobile: u.mobile, employeeId: u.employeeId ?? "", designation: u.designation, department: u.department }));
  const [res, setRes] = useState<PolicyResult | null>(null);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit profile"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const r = updateUser(user!.id, userId, { ...form, employeeId: form.employeeId || null });
              setRes(r);
              if (r.ok) {
                notify("Profile updated", "positive");
                onClose();
              }
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label="First name" required value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
        <TextField label="Last name" required value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
        <TextField label="Business email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <TextField label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
        <TextField label="Employee ID" value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })} />
        <TextField label="Designation" value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} />
        <TextField label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
      </div>
      <PolicyMessages result={res} />
    </Drawer>
  );
}

function MembershipDrawer({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const s = useAccessState();
  const { user } = useSession();
  const { notify } = useToast();
  const [orgId, setOrgId] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add organisation membership"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const r = addMembership(user!.id, userId, orgId, department, designation, reason);
              setRes(r);
              if (r.ok) {
                notify("Membership added", "positive");
                onClose();
              }
            }}
          >
            Add membership
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">A second membership lets the user hold separate roles and scopes in another organisation. It grants nothing by itself.</p>
        <SelectInput label="Organisation" required value={orgId} onChange={setOrgId} options={[{ value: "", label: "Choose organisation" }, ...s.organisations.filter((o) => o.status === "active").map((o) => ({ value: o.id, label: o.name }))]} />
        <TextField label="Designation in this organisation" value={designation} onChange={setDesignation} />
        <TextField label="Department" value={department} onChange={setDepartment} />
        <TextArea label="Reason" required value={reason} onChange={setReason} />
        <PolicyMessages result={res} />
      </div>
    </Drawer>
  );
}

function GrantDrawer({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();
  const memberships = membershipsOf(s, userId).filter((m) => m.status === "active");
  const [membershipId, setMembershipId] = useState(memberships[0]?.id ?? "");
  const [module, setModule] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [scope, setScope] = useState<AccessScope>({ programmes: "all", geography: { mode: "all" } });
  const [validTo, setValidTo] = useState("");
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  const def = moduleById.get(module);
  const authority = { programmes: getAccessibleProgrammes(s, actorId), geography: getAccessibleGeography(s, actorId) };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title="Grant permission directly"
      subtitle={<DemoBadge label="Use sparingly" />}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const r = addDirectGrant(actorId, userId, membershipId, actions.map((a) => key(module, a as ActionId)), scope, validTo || null, reason);
              setRes(r);
              if (r.ok) {
                notify("Permission granted", "positive");
                onClose();
              }
            }}
          >
            Grant
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">Prefer roles. Direct grants are for narrow, time-bound exceptions and appear as “Assigned directly” in the effective access view.</p>
        <SelectInput label="Organisation membership" value={membershipId} onChange={setMembershipId} options={memberships.map((m) => ({ value: m.id, label: orgById(s, m.orgId)?.name ?? m.orgId }))} />
        <SelectInput label="Module" required value={module} onChange={(v) => { setModule(v); setActions([]); }} options={[{ value: "", label: "Choose module" }, ...MODULES.map((m) => ({ value: m.id, label: m.label }))]} />
        {def && <MultiSelect label="Actions" options={def.actions.map((a) => ({ value: a, label: ACTIONS.find((x) => x.id === a)!.label }))} value={actions} onChange={setActions} />}
        <ScopeEditor idPrefix="grant" value={scope} onChange={setScope} authority={authority} />
        <TextField label="Ends" type="date" value={validTo} onChange={setValidTo} hint="Strongly recommended for direct grants" />
        <TextArea label="Reason" required value={reason} onChange={setReason} />
        <PolicyMessages result={res} />
      </div>
    </Drawer>
  );
}
