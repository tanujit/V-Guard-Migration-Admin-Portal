import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Overlay";
import { MultiSelect, SelectInput, TextArea, TextField } from "@/components/form/Form";
import { ScopeEditor } from "@/components/form/ScopeEditor";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { assignRole, changeAssignmentScope, useAccessState } from "@/features/access/store";
import { canAssignRole, canChangeAssignment, fullName, getAccessibleGeography, getAccessibleProgrammes, membershipsOf, orgById, TODAY, type PolicyResult } from "@/features/access/engine";
import { CHECKER_MODULES, MAKER_MODULES, moduleById } from "@/config/rbacCatalogue";
import { ROLE } from "@/data/mock/rbacSeed";
import type { AccessScope } from "@/types/rbac";
import { PolicyMessages, RoleCategoryTag } from "./shared";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selected user (detail page) or chosen in the drawer (Checker page). */
  userId?: string;
  /** Restrict to one role, e.g. Checker. */
  fixedRoleId?: string;
  /** Edit the scope/end date of an existing assignment instead of creating one. */
  editAssignmentId?: string;
  title?: string;
}

/**
 * Grants a role or operational profile, or changes an existing assignment's scope.
 * Validation runs live through the access engine; the store re-checks on save.
 */
export function AssignmentDrawer({ open, onClose, userId: fixedUser, fixedRoleId, editAssignmentId, title }: Props) {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();
  const editing = editAssignmentId ? s.assignments.find((a) => a.id === editAssignmentId) : undefined;
  const authority = useMemo(() => ({ programmes: getAccessibleProgrammes(s, actorId), geography: getAccessibleGeography(s, actorId) }), [s, actorId]);

  const [userId, setUserId] = useState(fixedUser ?? "");
  const [membershipId, setMembershipId] = useState("");
  const [roleId, setRoleId] = useState(fixedRoleId ?? "");
  const [modules, setModules] = useState<string[]>([]);
  const [scope, setScope] = useState<AccessScope>({ programmes: "all", geography: { mode: "all" } });
  const [validFrom, setValidFrom] = useState(TODAY);
  const [validTo, setValidTo] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<PolicyResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setReason("");
    if (editing) {
      setUserId(editing.userId);
      setMembershipId(editing.membershipId);
      setRoleId(editing.roleId);
      setModules(editing.moduleLimit ?? []);
      setScope(editing.scope);
      setValidFrom(editing.validFrom);
      setValidTo(editing.validTo ?? "");
    } else {
      setUserId(fixedUser ?? "");
      setRoleId(fixedRoleId ?? "");
      setModules([]);
      setScope({ programmes: authority.programmes === "all" ? "all" : authority.programmes, geography: authority.geography.mode === "all" ? { mode: "all" } : { mode: "selected", states: [], districts: [], branches: [] } });
      setValidFrom(TODAY);
      setValidTo("");
    }
  }, [open, editing, fixedUser, fixedRoleId, authority]);

  const memberships = userId ? membershipsOf(s, userId).filter((m) => m.status === "active") : [];
  useEffect(() => {
    if (!editing && memberships.length && !memberships.some((m) => m.id === membershipId)) setMembershipId(memberships[0].id);
  }, [memberships, membershipId, editing]);

  const role = s.roles.find((r) => r.id === roleId);

  // Roles limited to state/district/branch level cannot start from "all geography".
  useEffect(() => {
    if (!editing && role && role.scopeCeiling.geography !== "all" && scope.geography.mode === "all") setScope((sc) => ({ ...sc, geography: { mode: "selected", states: [], districts: [], branches: [] } }));
  }, [role, editing, scope.geography.mode]);
  const moduleOptions = roleId === ROLE.MAKER ? MAKER_MODULES : roleId === ROLE.CHECKER ? CHECKER_MODULES : [];
  const draft = { userId, membershipId, roleId, scope, moduleLimit: role?.category === "operational" ? modules : null, validFrom, validTo: validTo || null };
  const live = userId && roleId ? (editing ? mergeResults(canChangeAssignment(s, actorId, editing.id), canAssignRole(s, actorId, draft, { excludeAssignmentId: editing.id })) : canAssignRole(s, actorId, draft)) : null;

  const save = () => {
    const r = editing ? changeAssignmentScope(actorId, editing.id, scope, validTo || null, reason) : assignRole(actorId, draft, reason);
    setResult(r);
    if (r.ok) {
      notify(editing ? "Access updated" : `${role?.name} assigned to ${fullName(s.users.find((u) => u.id === userId))}`, "positive");
      onClose();
    }
  };

  const roleOptions = s.roles.filter((r) => r.status === "active" && (!fixedRoleId || r.id === fixedRoleId));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title={title ?? (editing ? "Change access scope" : "Assign access")}
      subtitle={editing ? <span className="mono">{editing.id}</span> : undefined}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={!live || !live.ok}>
            {editing ? "Save changes" : "Assign"}
          </button>
        </>
      }
    >
      <div className="stack">
        {!fixedUser && !editing && (
          <SelectInput label="User" required value={userId} onChange={setUserId} options={[{ value: "", label: "Choose user" }, ...s.users.filter((u) => u.id !== actorId && u.accountStatus !== "deactivated").map((u) => ({ value: u.id, label: `${fullName(u)} · ${u.id}` }))]} />
        )}
        {userId && (
          <SelectInput
            label="Organisation membership"
            required
            value={membershipId}
            onChange={setMembershipId}
            disabled={!!editing}
            options={memberships.length ? memberships.map((m) => ({ value: m.id, label: `${orgById(s, m.orgId)?.name} · ${m.designation}` })) : [{ value: "", label: "No active membership" }]}
            hint="Access always belongs to one organisation membership"
          />
        )}
        {!fixedRoleId && !editing ? (
          <SelectInput label="Role or profile" required value={roleId} onChange={(v) => { setRoleId(v); setModules([]); }} options={[{ value: "", label: "Choose role" }, ...roleOptions.map((r) => ({ value: r.id, label: `${r.name} (${r.category === "operational" ? "operational profile" : r.category})` }))]} />
        ) : (
          role && (
            <p className="drill__text">
              <strong>{role.name}</strong> <RoleCategoryTag category={role.category} />
            </p>
          )
        )}
        {role?.category === "operational" && (
          <MultiSelect label={`${role.name} modules`} options={moduleOptions.map((m) => ({ value: m, label: moduleById.get(m)!.label }))} value={modules} onChange={setModules} disabled={!!editing} hint={editing ? "Change modules by revoking and assigning again" : `Only these modules get ${role.name} actions`} />
        )}
        {role && <ScopeEditor idPrefix="asg" value={scope} onChange={setScope} authority={authority} roleCeiling={role.scopeCeiling.geography} />}
        <div className="form-grid">
          <TextField label="Starts" type="date" value={validFrom} onChange={setValidFrom} disabled={!!editing} />
          <TextField label="Ends (optional)" type="date" value={validTo} onChange={setValidTo} hint="Temporary access expires on this date" />
        </div>
        <TextArea label="Reason" required value={reason} onChange={setReason} hint="Recorded in the access history" />
        <PolicyMessages result={result && !result.ok ? result : live} />
      </div>
    </Drawer>
  );
}

function mergeResults(a: PolicyResult, b: PolicyResult): PolicyResult {
  const errors = Array.from(new Set([...a.errors, ...b.errors]));
  return { ok: errors.length === 0, errors, warnings: Array.from(new Set([...a.warnings, ...b.warnings])) };
}
