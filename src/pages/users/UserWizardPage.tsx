import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, Plus, Send, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Checkbox, MultiSelect, SelectInput, Stepper, TextField } from "@/components/form/Form";
import { ScopeEditor } from "@/components/form/ScopeEditor";
import { ProgrammeTag } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { createUser, useAccessState, validateNewUser, type NewUserInput } from "@/features/access/store";
import { canAssignRole, describeScope, findDuplicates, fullName, getAccessibleGeography, getAccessibleProgrammes, orgById, TODAY } from "@/features/access/engine";
import { CHECKER_MODULES, MAKER_MODULES, moduleById, ORG_TYPE_LABEL } from "@/config/rbacCatalogue";
import { ROLE } from "@/data/mock/rbacSeed";
import { AUTH_CONFIG, AUTH_METHOD_LABEL } from "@/services/auth";
import type { AccessScope, AuthMethod, GeoCeiling } from "@/types/rbac";
import { AccessDenied, PolicyMessages, RoleCategoryTag, SectionTitle } from "./shared";

const STEPS = ["Identity", "Organisation", "Business role", "Maker / Checker", "Programmes", "Geography", "Review"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** India mobile: 10 digits starting 6–9, optional +91 / 0 prefix. Rule set is configurable later. */
const MOBILE = /^(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}$/;

interface RoleRow {
  key: number;
  roleId: string;
  validFrom: string;
  validTo: string;
  ownScope: AccessScope | null;
}
interface ProfileRow {
  enabled: boolean;
  modules: string[];
  validTo: string;
  ownScope: AccessScope | null;
}

const RANK: Record<GeoCeiling, number> = { branch: 1, district: 2, state: 3, all: 4 };

export function UserWizardPage() {
  const s = useAccessState();
  const { user, can } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();

  const authority = useMemo(() => ({ programmes: getAccessibleProgrammes(s, actorId), geography: getAccessibleGeography(s, actorId) }), [s, actorId]);
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [touched, setTouched] = useState(false);
  const [identity, setIdentity] = useState({ firstName: "", lastName: "", email: "", mobile: "", employeeId: "", designation: "", department: "", reportingManagerId: "" });
  const [authMethod, setAuthMethod] = useState<AuthMethod>("mock");
  const [orgId, setOrgId] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [maker, setMaker] = useState<ProfileRow>({ enabled: false, modules: [], validTo: "", ownScope: null });
  const [checker, setChecker] = useState<ProfileRow>({ enabled: false, modules: [], validTo: "", ownScope: null });
  const [scope, setScope] = useState<AccessScope>({ programmes: authority.programmes === "all" ? "all" : authority.programmes, geography: authority.geography.mode === "all" ? { mode: "all" } : { mode: "selected", states: [], districts: [], branches: [] } });
  const [perAssignment, setPerAssignment] = useState(false);
  const [submitted, setSubmitted] = useState<ReturnType<typeof createUser> | null>(null);

  if (!can("users:create")) return <AccessDenied message="You need User & role management: Create to invite users." />;

  const org = orgById(s, orgId);
  const canProvisionProfiles = can("users:manage");
  const roleCeiling: GeoCeiling = roles.reduce<GeoCeiling>((c, r) => {
    const rc = s.roles.find((x) => x.id === r.roleId)?.scopeCeiling.geography ?? "all";
    return RANK[rc] < RANK[c] ? rc : c;
  }, "all");

  const input: NewUserInput = {
    identity: { ...identity, firstName: identity.firstName.trim(), lastName: identity.lastName.trim(), email: identity.email.trim().toLowerCase(), employeeId: identity.employeeId || null, reportingManagerId: identity.reportingManagerId || null },
    orgId,
    businessUnit: businessUnit || null,
    authMethod,
    assignments: [
      ...roles.map((r) => ({ roleId: r.roleId, moduleLimit: null, scope: (perAssignment && r.ownScope) || scope, validFrom: r.validFrom || TODAY, validTo: r.validTo || null })),
      ...(maker.enabled ? [{ roleId: ROLE.MAKER, moduleLimit: maker.modules, scope: (perAssignment && maker.ownScope) || scope, validFrom: TODAY, validTo: maker.validTo || null }] : []),
      ...(checker.enabled ? [{ roleId: ROLE.CHECKER, moduleLimit: checker.modules, scope: (perAssignment && checker.ownScope) || scope, validFrom: TODAY, validTo: checker.validTo || null }] : []),
    ],
  };

  // ---- Per-step validation ----
  const dups = findDuplicates(s, identity.email, identity.mobile);
  const idErrors: Record<string, string> = {};
  if (!identity.firstName.trim()) idErrors.firstName = "First name is required";
  if (!identity.lastName.trim()) idErrors.lastName = "Last name is required";
  if (!identity.email.trim() && !identity.mobile.trim()) idErrors.email = "Provide a business email or a mobile number";
  if (identity.email.trim() && !EMAIL.test(identity.email.trim())) idErrors.email = "Enter a valid email, e.g. name@company.com";
  if (identity.mobile.trim() && !MOBILE.test(identity.mobile.trim())) idErrors.mobile = "Enter a 10-digit Indian mobile number starting 6–9";
  if (authMethod === "mock" && !identity.email.trim() && AUTH_CONFIG.mode === "mock") idErrors.email = idErrors.email ?? "Development sign-in uses the email as the identifier";
  if (dups.length) idErrors.dup = `Already registered: ${dups.map((d) => `${fullName(d)} (${d.id})`).join(", ")}`;
  if (!identity.designation.trim()) idErrors.designation = "Designation is required";

  const stepErrors: string[][] = [
    Object.values(idErrors),
    !orgId ? ["Choose an organisation"] : org?.status !== "active" ? [`${org?.name} is deactivated`] : [],
    roles.some((r) => !r.roleId) ? ["Choose a role for each row or remove it"] : roles.some((r) => r.validTo && r.validTo < (r.validFrom || TODAY)) ? ["An end date is before its start date"] : [],
    [maker.enabled && !maker.modules.length ? "Choose Maker modules" : "", checker.enabled && !checker.modules.length ? "Choose Checker modules" : ""].filter(Boolean),
    scope.programmes !== "all" && !scope.programmes.length ? ["Choose at least one programme"] : [],
    [],
    [],
  ];
  const full = step === 6 ? validateNewUser(s, actorId, input) : null;

  const go = (i: number) => {
    if (i > step && stepErrors[step].length) {
      setTouched(true);
      return;
    }
    setTouched(false);
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
  };

  const assignable = s.roles
    .filter((r) => r.category !== "operational" && r.status === "active" && (!org || r.orgApplicability === "any" || r.orgApplicability.includes(org.id)))
    .map((r) => {
      const check = canAssignRole(s, actorId, { userId: "NEW", membershipId: "", roleId: r.id, scope, moduleLimit: null, validFrom: TODAY, validTo: null }, { forNewUser: true, skipSelfCheck: true });
      const blocking = check.errors.filter((e) => !e.startsWith("Choose the organisation") && !e.includes("can be scoped no wider"));
      return { r, blocked: blocking[0] ?? null };
    });

  if (submitted?.ok) {
    return (
      <Panel>
        <div className="placeholder success-state">
          <Send size={20} strokeWidth={1.75} aria-hidden="true" />
          <h2 className="placeholder__title">Invitation created for {fullName(input.identity)}</h2>
          <p className="placeholder__text">
            User <strong className="mono">{submitted.userId}</strong> is <strong>Invited</strong>. Invitation reference <strong className="mono">{submitted.inviteRef}</strong> was generated. No email was sent: the invitation service is not connected yet. Assignments stay <strong>Pending</strong> until the account is activated.
          </p>
          <div className="btn-row">
            <Link className="btn btn--primary" to={`/governance/users/user/${submitted.userId}`}>
              Open user
            </Link>
            <Link className="btn btn--secondary" to="/governance/users">
              Back to directory
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <SectionTitle
        title="Create user"
        description="Invite a person and provision exactly the access they need. Nothing is assumed from their organisation"
        actions={
          <Link to="/governance/users" className="btn btn--ghost btn--sm">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
            Cancel
          </Link>
        }
      />
      <Panel className="wizard">
        <Stepper steps={STEPS} current={step} onSelect={go} maxReached={maxReached} />
        <div className="wizard__body">
          {step === 0 && (
            <div className="form-grid">
              <TextField label="First name" required value={identity.firstName} onChange={(v) => setIdentity({ ...identity, firstName: v })} error={touched ? idErrors.firstName : undefined} autoComplete="off" />
              <TextField label="Last name" required value={identity.lastName} onChange={(v) => setIdentity({ ...identity, lastName: v })} error={touched ? idErrors.lastName : undefined} autoComplete="off" />
              <TextField label="Business email" type="email" inputMode="email" value={identity.email} onChange={(v) => setIdentity({ ...identity, email: v })} error={touched || identity.email ? idErrors.email : undefined} hint="Account identifier for sign-in" autoComplete="off" />
              <TextField label="Mobile number" type="tel" inputMode="tel" value={identity.mobile} onChange={(v) => setIdentity({ ...identity, mobile: v })} error={(touched || identity.mobile.length > 9) ? idErrors.mobile : undefined} hint="10-digit Indian mobile. Shown masked to users without View sensitive" autoComplete="off" />
              <TextField label="Employee ID" value={identity.employeeId} onChange={(v) => setIdentity({ ...identity, employeeId: v })} hint="Where applicable" />
              <TextField label="Designation" required value={identity.designation} onChange={(v) => setIdentity({ ...identity, designation: v })} error={touched ? idErrors.designation : undefined} />
              <TextField label="Department" value={identity.department} onChange={(v) => setIdentity({ ...identity, department: v })} />
              <SelectInput label="Reporting manager" value={identity.reportingManagerId} onChange={(v) => setIdentity({ ...identity, reportingManagerId: v })} options={[{ value: "", label: "None" }, ...s.users.filter((u) => u.accountStatus === "active").map((u) => ({ value: u.id, label: `${fullName(u)} · ${u.designation}` }))]} />
              <SelectInput label="Authentication method" value={authMethod} onChange={(v) => setAuthMethod(v as AuthMethod)} options={(Object.keys(AUTH_METHOD_LABEL) as AuthMethod[]).map((k) => ({ value: k, label: AUTH_METHOD_LABEL[k] }))} hint="SSO and OTP are configuration placeholders; they are not connected" />
              {dups.length > 0 && (
                <div className="span-all">
                  <PolicyMessages result={{ errors: [idErrors.dup], warnings: [] }} title="Duplicate account" />
                  <p className="small">
                    {dups.map((d) => (
                      <Link key={d.id} className="link-btn" to={`/governance/users/user/${d.id}`}>
                        Open {fullName(d)}
                      </Link>
                    ))}{" "}
                    to update their access instead.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="form-grid">
              <SelectInput label="Organisation" required value={orgId} onChange={(v) => { setOrgId(v); setRoles([]); }} options={[{ value: "", label: "Choose organisation" }, ...s.organisations.map((o) => ({ value: o.id, label: `${o.name}${o.status !== "active" ? " (inactive)" : ""}`, disabled: o.status !== "active" }))]} error={touched ? stepErrors[1][0] : undefined} />
              <TextField label="Business unit" value={businessUnit} onChange={setBusinessUnit} hint="If configured for the organisation" />
              <TextField label="Department" value={identity.department} onChange={(v) => setIdentity({ ...identity, department: v })} />
              <TextField label="Designation" value={identity.designation} onChange={(v) => setIdentity({ ...identity, designation: v })} />
              {org && (
                <div className="org-card span-all">
                  <p className="org-card__name">{org.name}</p>
                  <p className="small muted">
                    {ORG_TYPE_LABEL[org.type]} · {org.code} · {org.description}
                  </p>
                  <p className="callout callout--info">
                    <Info size={16} strokeWidth={2} aria-hidden="true" />
                    <span>Organisation does not grant any permission. Roles, Maker/Checker profiles and scopes are chosen in the next steps. Additional organisation memberships can be added from the user profile.</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="stack">
              <p className="small muted">Roles available to {org?.name ?? "this organisation"}. Roles beyond your delegation authority are shown but cannot be chosen.</p>
              {roles.map((r, i) => (
                <div key={r.key} className="assign-row">
                  <SelectInput label={`Role ${i + 1}`} value={r.roleId} onChange={(v) => setRoles(roles.map((x) => (x.key === r.key ? { ...x, roleId: v } : x)))} options={[{ value: "", label: "Choose role" }, ...assignable.map(({ r: role, blocked }) => ({ value: role.id, label: `${role.name}${blocked ? " — not available to you" : ""}`, disabled: !!blocked || roles.some((x) => x.roleId === role.id && x.key !== r.key) }))]} />
                  <TextField label="Starts" type="date" value={r.validFrom} onChange={(v) => setRoles(roles.map((x) => (x.key === r.key ? { ...x, validFrom: v } : x)))} hint="Defaults to today" />
                  <TextField label="Ends (optional)" type="date" value={r.validTo} onChange={(v) => setRoles(roles.map((x) => (x.key === r.key ? { ...x, validTo: v } : x)))} hint="For temporary access" />
                  <button type="button" className="icon-btn" onClick={() => setRoles(roles.filter((x) => x.key !== r.key))} aria-label={`Remove role ${i + 1}`}>
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setRoles([...roles, { key: Date.now(), roleId: "", validFrom: TODAY, validTo: "", ownScope: null }])}>
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                Add role
              </button>
              <div className="role-legend">
                {assignable.map(({ r, blocked }) => (
                  <div key={r.id} className={`role-legend__item ${blocked ? "is-blocked" : ""}`}>
                    <span className="role-legend__name">
                      {r.name} <RoleCategoryTag category={r.category} />
                    </span>
                    <span className="small muted">{blocked ?? r.description}</span>
                  </div>
                ))}
              </div>
              {touched && <PolicyMessages result={{ errors: stepErrors[2], warnings: [] }} />}
            </div>
          )}

          {step === 3 && (
            <div className="stack">
              {!canProvisionProfiles && (
                <div className="callout callout--info">
                  <Info size={16} strokeWidth={2} aria-hidden="true" />
                  <span>
                    Maker and Checker access is provisioned by Evolve. To request it, raise a <Link className="link-btn" to="/governance/users/nominations">Maker nomination</Link> after creating the user.
                  </span>
                </div>
              )}
              <p className="small muted">Operational profiles are independent of organisation and role. Nothing is preselected.</p>
              <div className="profile-pick">
                <Checkbox label="Maker" description="Create, edit and submit within the chosen modules. Cannot approve" checked={maker.enabled} onChange={(v) => setMaker({ ...maker, enabled: v })} disabled={!canProvisionProfiles} />
                {maker.enabled && <MultiSelect label="Maker modules" options={MAKER_MODULES.map((m) => ({ value: m, label: moduleById.get(m)!.label }))} value={maker.modules} onChange={(v) => setMaker({ ...maker, modules: v })} />}
                {maker.enabled && <TextField label="Maker access ends (optional)" type="date" value={maker.validTo} onChange={(v) => setMaker({ ...maker, validTo: v })} />}
              </div>
              <div className="profile-pick">
                <Checkbox label="Checker" description="Approve, reject or return requests within the chosen modules only" checked={checker.enabled} onChange={(v) => setChecker({ ...checker, enabled: v })} disabled={!canProvisionProfiles} />
                {checker.enabled && <MultiSelect label="Checker modules" options={CHECKER_MODULES.map((m) => ({ value: m, label: moduleById.get(m)!.label }))} value={checker.modules} onChange={(v) => setChecker({ ...checker, modules: v })} />}
                {checker.enabled && <TextField label="Checker access ends (optional)" type="date" value={checker.validTo} onChange={(v) => setChecker({ ...checker, validTo: v })} />}
              </div>
              {maker.enabled && checker.enabled && maker.modules.some((m) => checker.modules.includes(m)) && <PolicyMessages result={{ errors: [], warnings: ["Maker and Checker on the same module. Per-request separation of duties is enforced in the Maker-Checker phase"] }} />}
              {touched && <PolicyMessages result={{ errors: stepErrors[3], warnings: [] }} />}
            </div>
          )}

          {step === 4 && (
            <div className="stack">
              <p className="small muted">Programme access applies to every assignment unless you set a different scope for specific assignments in the next step.</p>
              <ScopeEditorPart part="programmes" value={scope} onChange={setScope} authority={authority} roleCeiling={roleCeiling} />
              {touched && <PolicyMessages result={{ errors: stepErrors[4], warnings: [] }} />}
            </div>
          )}

          {step === 5 && (
            <div className="stack">
              <ScopeEditorPart part="geography" value={scope} onChange={setScope} authority={authority} roleCeiling={roleCeiling} />
              <Checkbox label="Use a different scope for specific assignments" description="For example Regional Admin for Kerala and Finance for all states" checked={perAssignment} onChange={setPerAssignment} />
              {perAssignment && (
                <div className="stack">
                  {[...roles.map((r) => ({ key: `r${r.key}`, name: s.roles.find((x) => x.id === r.roleId)?.name ?? "Role", own: r.ownScope, set: (v: AccessScope) => setRoles(roles.map((x) => (x.key === r.key ? { ...x, ownScope: v } : x))), ceiling: s.roles.find((x) => x.id === r.roleId)?.scopeCeiling.geography ?? "all" })), ...(maker.enabled ? [{ key: "maker", name: "Maker", own: maker.ownScope, set: (v: AccessScope) => setMaker({ ...maker, ownScope: v }), ceiling: "all" as GeoCeiling }] : []), ...(checker.enabled ? [{ key: "checker", name: "Checker", own: checker.ownScope, set: (v: AccessScope) => setChecker({ ...checker, ownScope: v }), ceiling: "all" as GeoCeiling }] : [])].map((row) => (
                    <details key={row.key} className="scope-override">
                      <summary>
                        {row.name}: {row.own ? `${describeScope(row.own).programmes} · ${describeScope(row.own).geography}` : "uses the default scope"}
                      </summary>
                      <ScopeEditor idPrefix={row.key} value={row.own ?? scope} onChange={row.set} authority={authority} roleCeiling={row.ceiling} />
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 6 && full && (
            <div className="review">
              <dl className="review__grid">
                <ReviewItem label="Identity" value={`${fullName(input.identity)} · ${input.identity.designation}${input.identity.employeeId ? ` · ${input.identity.employeeId}` : ""}`} onEdit={() => go(0)} />
                <ReviewItem label="Contact" value={`${input.identity.email || "No email"} · ${input.identity.mobile || "No mobile"}`} onEdit={() => go(0)} />
                <ReviewItem label="Authentication" value={AUTH_METHOD_LABEL[authMethod]} onEdit={() => go(0)} />
                <ReviewItem label="Organisation" value={`${org?.name ?? "—"}${businessUnit ? ` · ${businessUnit}` : ""} · ${input.identity.department || "No department"}`} onEdit={() => go(1)} />
              </dl>
              <h3 className="review__h">Access to be created ({input.assignments.length})</h3>
              {input.assignments.length === 0 && <p className="muted">No access. The user will be able to sign in but see nothing.</p>}
              <ul className="review__list">
                {input.assignments.map((a, i) => {
                  const role = s.roles.find((r) => r.id === a.roleId)!;
                  const sc = describeScope(a.scope);
                  const res = full.perAssignment[i];
                  return (
                    <li key={`${a.roleId}-${i}`} className={`review__assign ${res?.ok ? "" : "is-error"}`}>
                      <span className="review__role">
                        {role.name} <RoleCategoryTag category={role.category} />
                      </span>
                      {a.moduleLimit && <span className="small">Modules: {a.moduleLimit.map((m) => moduleById.get(m)?.label).join(", ")}</span>}
                      <span className="small">
                        {a.scope.programmes === "all" ? "All programmes" : a.scope.programmes.map((p) => <ProgrammeTag key={p} code={p} size="sm" />)} · {sc.geography}
                      </span>
                      <span className="small muted">
                        {a.validFrom} → {a.validTo ?? "open-ended"} · {role.permissions.filter((k) => !a.moduleLimit || a.moduleLimit.includes(k.split(":")[0])).length} permissions · status Pending until activation
                      </span>
                    </li>
                  );
                })}
              </ul>
              <PolicyMessages result={full} />
              <p className="small muted">On confirmation the account is created as <strong>Invited</strong>, a mock invitation reference is generated and the event is written to the access history. No email is sent.</p>
            </div>
          )}
        </div>

        <div className="wizard__foot">
          <button type="button" className="btn btn--secondary" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            Back
          </button>
          {touched && stepErrors[step].length > 0 && <span className="neg small">Fix the highlighted fields to continue</span>}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn--primary" onClick={() => go(step + 1)}>
              Continue
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!full?.ok}
              onClick={() => {
                const r = createUser(actorId, input);
                setSubmitted(r);
                if (r.ok) notify(`${fullName(input.identity)} invited (${r.inviteRef})`, "positive");
              }}
            >
              <Send size={16} strokeWidth={2} aria-hidden="true" />
              Create and invite
            </button>
          )}
        </div>
        {submitted && !submitted.ok && <PolicyMessages result={submitted} />}
      </Panel>
    </>
  );
}

function ReviewItem({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="review__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <button type="button" className="link-btn" onClick={onEdit} aria-label={`Edit ${label}`}>
        Edit
      </button>
    </div>
  );
}

/** Shows only the programme or the geography half of the scope editor (wizard steps 5 and 6). */
function ScopeEditorPart({ part, ...props }: { part: "programmes" | "geography"; value: AccessScope; onChange: (s: AccessScope) => void; authority: { programmes: "all" | string[]; geography: AccessScope["geography"] }; roleCeiling: GeoCeiling }) {
  return <ScopeEditor idPrefix={`wiz-${part}`} parts={part} {...props} />;
}
