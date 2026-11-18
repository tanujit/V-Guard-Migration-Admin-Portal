import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Copy, Eye, KeyRound, Lock, Pencil, Plus, Save, ShieldAlert } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { Panel } from "@/components/ui/Panel";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { MultiSelect, SelectInput, Stepper, Tabs, TextArea, TextField } from "@/components/form/Form";
import { PermissionDiff, PermissionMatrix } from "@/components/rbac/PermissionMatrix";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { roleImpact, saveRole, useAccessState, type RoleDraft } from "@/features/access/store";
import { canManageRoles, fullName, orgById, userName, type PolicyResult } from "@/features/access/engine";
import { ACTIONS, parseKey, ROLE_CATEGORY_LABEL } from "@/config/rbacCatalogue";
import { PROGRAMMES } from "@/config/programmes";
import { formatDateTime } from "@/lib/format";
import type { GeoCeiling, PermissionKey, Role, RoleCategory } from "@/types/rbac";
import { AccessDenied, PolicyMessages, RoleCategoryTag, SectionTitle } from "./shared";

const GEO_CEILING_LABEL: Record<GeoCeiling, string> = { all: "Any geography", state: "States or narrower", district: "Districts or narrower", branch: "Branches only" };

/* =====================================================================
   Role directory
   ===================================================================== */

export function RolesPage() {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const navigate = useNavigate();
  const [cat, setCat] = useState<RoleCategory | "all">("all");
  const [view, setView] = useState<Role | null>(null);
  const manage = canManageRoles(s, actorId).ok;

  const rows = useMemo(() => s.roles.filter((r) => cat === "all" || r.category === cat).map((r) => ({ r, ...roleImpact(s, r.id) })), [s, cat]);

  return (
    <>
      <SectionTitle
        title="Roles"
        description="Reusable role templates. Platform roles administer the portal, business roles describe responsibilities, operational profiles are Maker and Checker"
        actions={
          manage && (
            <Link className="btn btn--primary" to="/governance/users/roles/new">
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Create role
            </Link>
          )
        }
      />
      <Tabs<RoleCategory | "all">
        label="Role category"
        value={cat}
        onChange={setCat}
        tabs={[
          { id: "all", label: "All roles", count: s.roles.length },
          { id: "platform", label: "Platform roles", count: s.roles.filter((r) => r.category === "platform").length },
          { id: "business", label: "Business roles", count: s.roles.filter((r) => r.category === "business").length },
          { id: "operational", label: "Operational profiles", count: s.roles.filter((r) => r.category === "operational").length },
        ]}
      />
      <Panel padded={false}>
        <DataTable
          rows={rows}
          rowKey={(x) => x.r.id}
          caption="Roles"
          searchPlaceholder="Search roles"
          onRowClick={(x) => setView(x.r)}
          rowActionLabel={(x) => `Open ${x.r.name}`}
          exportName="roles"
          columns={[
            { key: "id", header: "Role ID", value: (x) => x.r.id, render: (x) => <span className="mono small">{x.r.id}</span> },
            { key: "name", header: "Role", value: (x) => x.r.name, render: (x) => <span className="cell-2"><span className="cell-2__main">{x.r.name}{x.r.protected && <Lock size={12} strokeWidth={2.5} className="lock-ico" aria-label="Protected" />}</span><span className="cell-2__sub">{x.r.legacyNames.length ? `SOW: ${x.r.legacyNames.join(", ")}` : x.r.code}</span></span> },
            { key: "cat", header: "Category", value: (x) => ROLE_CATEGORY_LABEL[x.r.category], render: (x) => <RoleCategoryTag category={x.r.category} /> },
            { key: "org", header: "Organisations", value: (x) => (x.r.orgApplicability === "any" ? "Any" : x.r.orgApplicability.map((o) => orgById(s, o)?.name).join(", ")) },
            { key: "users", header: "Users", value: (x) => x.users.length, align: "right" },
            { key: "perms", header: "Permissions", value: (x) => x.r.permissions.length, align: "right" },
            { key: "modules", header: "Modules", value: (x) => new Set(x.r.permissions.map((k) => parseKey(k).module)).size, align: "right" },
            { key: "type", header: "Type", value: (x) => (x.r.system ? "System" : "Custom"), render: (x) => <span className={`kind kind--${x.r.system ? "system" : "custom"}`}>{x.r.system ? "System" : "Custom"}</span> },
            { key: "status", header: "Status", value: (x) => x.r.status, render: (x) => <StatusBadge tone={x.r.status === "active" ? "positive" : "neutral"}>{x.r.status === "active" ? "Active" : "Inactive"}</StatusBadge> },
            { key: "mod", header: "Last modified", value: (x) => x.r.updatedAt, render: (x) => <span className="small num">{formatDateTime(x.r.updatedAt).split(",")[0]}</span> },
            {
              key: "x",
              header: "Actions",
              value: () => null,
              sortable: false,
              render: (x) => {
                const canEdit = canManageRoles(s, actorId, x.r).ok;
                return (
                  <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="icon-btn icon-btn--sm" title="View" aria-label={`View ${x.r.name}`} onClick={() => setView(x.r)}>
                      <Eye size={15} strokeWidth={2} />
                    </button>
                    <Link className="icon-btn icon-btn--sm" title="Permission matrix" aria-label={`Permission matrix for ${x.r.name}`} to={`/governance/users/permissions?role=${x.r.id}`}>
                      <KeyRound size={15} strokeWidth={2} />
                    </Link>
                    {canEdit && (
                      <Link className="icon-btn icon-btn--sm" title="Edit" aria-label={`Edit ${x.r.name}`} to={`/governance/users/roles/${x.r.id}/edit`}>
                        <Pencil size={15} strokeWidth={2} />
                      </Link>
                    )}
                    {manage && (
                      <Link className="icon-btn icon-btn--sm" title="Clone" aria-label={`Clone ${x.r.name}`} to={`/governance/users/roles/${x.r.id}/clone`}>
                        <Copy size={15} strokeWidth={2} />
                      </Link>
                    )}
                  </span>
                );
              },
            },
          ]}
        />
      </Panel>
      <Drawer open={!!view} onClose={() => setView(null)} title={view?.name ?? ""} subtitle={view && <><RoleCategoryTag category={view.category} /> <span className="mono">{view.code}</span></>} width={760} footer={view && <><button type="button" className="btn btn--secondary" onClick={() => setView(null)}>Close</button>{canManageRoles(s, actorId, view).ok && <button type="button" className="btn btn--primary" onClick={() => navigate(`/governance/users/roles/${view.id}/edit`)}>Edit role</button>}</>}>
        {view && (
          <div className="stack">
            <p className="drill__text">{view.description}</p>
            <dl className="kv kv--wide">
              <div className="kv__row"><dt>Applies to</dt><dd>{view.orgApplicability === "any" ? "Any authorised organisation" : view.orgApplicability.map((o) => orgById(s, o)?.name).join(", ")}</dd></div>
              <div className="kv__row"><dt>Programme ceiling</dt><dd>{view.scopeCeiling.programmes === "all" ? "Any programme" : view.scopeCeiling.programmes.join(", ")}</dd></div>
              <div className="kv__row"><dt>Geography ceiling</dt><dd>{GEO_CEILING_LABEL[view.scopeCeiling.geography]}</dd></div>
              <div className="kv__row"><dt>Legacy SOW names</dt><dd>{view.legacyNames.join(", ") || "—"}</dd></div>
              <div className="kv__row"><dt>Users assigned</dt><dd>{roleImpact(s, view.id).users.map((u) => userName(s, u)).join(", ") || "None"}</dd></div>
              <div className="kv__row"><dt>Last modified</dt><dd>{formatDateTime(view.updatedAt)} by {userName(s, view.updatedBy)}</dd></div>
            </dl>
            <PermissionMatrix value={view.permissions} readOnly roleCategory={view.category} />
          </div>
        )}
      </Drawer>
    </>
  );
}

/* =====================================================================
   Create / edit / clone wizard
   ===================================================================== */

const ROLE_STEPS = ["Basic details", "Permissions", "Scope rules", "Review"];

export function RoleEditorPage({ mode }: { mode: "new" | "edit" | "clone" }) {
  const { roleId } = useParams();
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const navigate = useNavigate();
  const { notify } = useToast();
  const source = roleId ? s.roles.find((r) => r.id === roleId) : undefined;

  const [d, setD] = useState<RoleDraft>(() => {
    if (source && mode === "edit") return { name: source.name, code: source.code, description: source.description, category: source.category, orgApplicability: source.orgApplicability, status: source.status, permissions: source.permissions, scopeCeiling: source.scopeCeiling, legacyNames: source.legacyNames };
    if (source && mode === "clone") return { name: `${source.name} (copy)`, code: `${source.code}_COPY`.slice(0, 40), description: source.description, category: source.category === "platform" ? "business" : source.category, orgApplicability: source.orgApplicability, status: "active", permissions: [...source.permissions], scopeCeiling: source.scopeCeiling, legacyNames: [], clonedFrom: source.id };
    return { name: "", code: "", description: "", category: "business", orgApplicability: "any", status: "active", permissions: [], scopeCeiling: { programmes: "all", geography: "all" }, legacyNames: [] };
  });
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);

  const guard = canManageRoles(s, actorId, mode === "edit" ? source : undefined);
  if (!guard.ok) return <AccessDenied message={guard.errors.join(" ")} />;
  if ((mode !== "new" && !source)) return <AccessDenied message="Role not found." />;

  const impact = mode === "edit" && source ? roleImpact(s, source.id) : null;
  const basicErrors = [!d.name.trim() && "Role name is required", !/^[A-Z0-9_]{3,40}$/.test(d.code) && "Role code: 3–40 capitals, digits or _", s.roles.some((r) => r.code === d.code && r.id !== (mode === "edit" ? source?.id : undefined)) && "Role code already used"].filter(Boolean) as string[];
  const permErrors = d.permissions.length ? [] : ["Select at least one permission"];
  const stepErr = [basicErrors, permErrors, [], []];

  const save = () => {
    const r = saveRole(actorId, d, mode === "edit" ? source!.id : undefined, reason);
    setRes(r);
    if (r.ok) {
      notify(mode === "edit" ? `${d.name} updated` : `${d.name} created`, "positive");
      navigate("/governance/users/roles");
    }
  };

  return (
    <>
      <SectionTitle
        title={mode === "edit" ? `Edit ${source!.name}` : mode === "clone" ? `Clone ${source!.name}` : "Create role"}
        description={mode === "clone" ? "The original role is not changed. The copy is saved as a new custom role" : "Define what the role may do. Scope is assigned per user, within the ceiling set here"}
        actions={
          <Link to="/governance/users/roles" className="btn btn--ghost btn--sm">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
            Cancel
          </Link>
        }
      />
      {mode === "edit" && source && (source.protected || source.system) && (
        <div className="callout callout--info">
          <ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>{source.name}</strong> is a {source.protected ? "protected" : "system"} role. Changes apply immediately to <strong>{impact?.users.length ?? 0}</strong> user{impact?.users.length === 1 ? "" : "s"} and need a reason.
          </span>
        </div>
      )}
      <Panel className="wizard">
        <Stepper steps={ROLE_STEPS} current={step} onSelect={(i) => (i < step || !stepErr[step].length) && setStep(i)} maxReached={step} />
        <div className="wizard__body">
          {step === 0 && (
            <div className="form-grid">
              <TextField label="Role name" required value={d.name} onChange={(v) => setD({ ...d, name: v })} error={basicErrors.find((e) => e.startsWith("Role name"))} />
              <TextField label="Role code" required value={d.code} onChange={(v) => setD({ ...d, code: v.toUpperCase().replace(/\s+/g, "_") })} error={basicErrors.find((e) => e.startsWith("Role code"))} disabled={mode === "edit" && source?.system} />
              <SelectInput
                label="Role category"
                value={d.category}
                onChange={(v) => setD({ ...d, category: v as RoleCategory })}
                disabled={mode === "edit"}
                options={[
                  { value: "business", label: "Business / organisational role" },
                  { value: "operational", label: "Operational access profile" },
                  { value: "platform", label: "Platform-level role", disabled: mode !== "edit" },
                ]}
                hint={mode === "edit" ? "Category cannot change after creation" : "New platform-level roles are not created from the UI"}
              />
              <SelectInput label="Status" value={d.status} onChange={(v) => setD({ ...d, status: v as Role["status"] })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
              <MultiSelect label="Applicable organisations" options={s.organisations.map((o) => ({ value: o.id, label: o.name }))} value={d.orgApplicability === "any" ? [] : d.orgApplicability} onChange={(v) => setD({ ...d, orgApplicability: v.length ? v : "any" })} placeholder="Any authorised organisation" />
              <TextField label="Legacy SOW names" value={d.legacyNames.join(", ")} onChange={(v) => setD({ ...d, legacyNames: v.split(",").map((x) => x.trim()).filter(Boolean) })} hint="For migration mapping only, comma separated" />
              <div className="span-all">
                <TextArea label="Description" value={d.description} onChange={(v) => setD({ ...d, description: v })} />
              </div>
            </div>
          )}
          {step === 1 && <PermissionMatrix value={d.permissions} onChange={(v) => setD({ ...d, permissions: v })} baseline={mode === "new" ? undefined : source?.permissions} roleCategory={d.category} />}
          {step === 2 && (
            <div className="form-grid">
              <MultiSelect label="Programme ceiling" options={PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))} value={d.scopeCeiling.programmes === "all" ? [] : d.scopeCeiling.programmes} onChange={(v) => setD({ ...d, scopeCeiling: { ...d.scopeCeiling, programmes: v.length ? v : "all" } })} placeholder="Any programme" hint="Users can be given this role only for these programmes" />
              <SelectInput label="Geography ceiling" value={d.scopeCeiling.geography} onChange={(v) => setD({ ...d, scopeCeiling: { ...d.scopeCeiling, geography: v as GeoCeiling } })} options={(Object.keys(GEO_CEILING_LABEL) as GeoCeiling[]).map((g) => ({ value: g, label: GEO_CEILING_LABEL[g] }))} hint="The broadest geography an assignment of this role may cover" />
              <p className="small muted span-all">Actual programmes and locations are chosen when the role is assigned to a user, within these ceilings and the administrator's own authority.</p>
            </div>
          )}
          {step === 3 && (
            <div className="stack">
              <dl className="kv kv--wide">
                <div className="kv__row"><dt>Role</dt><dd>{d.name} · <span className="mono">{d.code}</span> · {ROLE_CATEGORY_LABEL[d.category]} · {d.status}</dd></div>
                <div className="kv__row"><dt>Organisations</dt><dd>{d.orgApplicability === "any" ? "Any" : d.orgApplicability.map((o) => orgById(s, o)?.name).join(", ")}</dd></div>
                <div className="kv__row"><dt>Scope ceiling</dt><dd>{d.scopeCeiling.programmes === "all" ? "Any programme" : d.scopeCeiling.programmes.join(", ")} · {GEO_CEILING_LABEL[d.scopeCeiling.geography]}</dd></div>
                <div className="kv__row"><dt>Permissions</dt><dd>{d.permissions.length} across {new Set(d.permissions.map((k) => parseKey(k).module)).size} modules · {d.permissions.filter((k) => ACTIONS.find((a) => a.id === parseKey(k).action)?.restricted).length} restricted</dd></div>
              </dl>
              {mode !== "new" && source && (
                <>
                  <h3 className="review__h">{mode === "edit" ? "Before and after" : `Compared with ${source.name}`}</h3>
                  <PermissionDiff before={source.permissions} after={d.permissions} />
                </>
              )}
              {impact && impact.users.length > 0 && (
                <div className="callout callout--info">
                  <ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />
                  <span>
                    Saving changes access immediately for {impact.users.length} user{impact.users.length > 1 ? "s" : ""}: {impact.users.slice(0, 6).map((u) => fullName(s.users.find((x) => x.id === u))).join(", ")}
                    {impact.users.length > 6 ? " …" : ""}. The change and its impact are recorded in the access history.
                  </span>
                </div>
              )}
              <TextArea label="Reason for change" required={mode === "edit" && !!(source?.system || source?.protected)} value={reason} onChange={setReason} />
              <PolicyMessages result={res} />
            </div>
          )}
        </div>
        <div className="wizard__foot">
          <button type="button" className="btn btn--secondary" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            Back
          </button>
          {stepErr[step].length > 0 && <span className="neg small">{stepErr[step][0]}</span>}
          {step < ROLE_STEPS.length - 1 ? (
            <button type="button" className="btn btn--primary" disabled={stepErr[step].length > 0} onClick={() => setStep(step + 1)}>
              Continue
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={save}>
              <Save size={16} strokeWidth={2} aria-hidden="true" />
              {mode === "edit" ? "Save role" : "Create role"}
            </button>
          )}
        </div>
      </Panel>
    </>
  );
}

/* =====================================================================
   Permission matrix page
   ===================================================================== */

export function PermissionMatrixPage() {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const roleId = params.get("role") ?? s.roles[0]?.id;
  const role = s.roles.find((r) => r.id === roleId) ?? s.roles[0];
  const [draft, setDraft] = useState<{ roleId: string; perms: PermissionKey[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);
  const editable = canManageRoles(s, actorId, role).ok;
  const current = draft?.roleId === role.id ? draft.perms : role.permissions;
  const dirty = draft?.roleId === role.id && (draft.perms.length !== role.permissions.length || draft.perms.some((k) => !role.permissions.includes(k)));
  const impact = roleImpact(s, role.id);

  const switchRole = (id: string) => {
    if (dirty && !window.confirm("Discard unsaved permission changes?")) return;
    setDraft(null);
    setParams({ role: id });
  };

  return (
    <>
      <SectionTitle
        title="Permission matrix"
        description="Module and action permissions for a role template. Programme and geography are applied per user assignment"
        actions={<SelectField label="Role" value={role.id} onChange={switchRole} options={s.roles.map((r) => ({ value: r.id, label: `${r.name} · ${ROLE_CATEGORY_LABEL[r.category]}` }))} />}
      />
      <Panel>
        <div className="matrix-head">
          <div>
            <p className="matrix-head__name">
              {role.name} <RoleCategoryTag category={role.category} /> {role.protected && <span className="kind kind--system"><Lock size={11} strokeWidth={2.5} aria-hidden="true" /> Protected</span>}
            </p>
            <p className="small muted">
              {impact.users.length} user{impact.users.length === 1 ? "" : "s"} assigned · last modified {formatDateTime(role.updatedAt)} by {userName(s, role.updatedBy)}
            </p>
          </div>
          {!editable && <span className="small muted">Read only: {canManageRoles(s, actorId, role).errors[0]}</span>}
        </div>
        <PermissionMatrix value={current} onChange={(v) => setDraft({ roleId: role.id, perms: v })} readOnly={!editable} baseline={dirty ? role.permissions : undefined} roleCategory={role.category} />
      </Panel>
      {dirty && (
        <div className="unsaved-bar" role="region" aria-label="Unsaved changes">
          <span>
            <strong>Unsaved changes</strong> · {current.filter((k) => !role.permissions.includes(k)).length} added, {role.permissions.filter((k) => !current.includes(k)).length} removed · affects {impact.users.length} user{impact.users.length === 1 ? "" : "s"}
          </span>
          <span className="btn-row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft(null)}>
              Reset
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { setRes(null); setReason(""); setConfirm(true); }}>
              Review and save
            </button>
          </span>
        </div>
      )}
      <Drawer
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Save permissions for ${role.name}`}
        width={620}
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const r = saveRole(actorId, { name: role.name, code: role.code, description: role.description, category: role.category, orgApplicability: role.orgApplicability, status: role.status, permissions: current, scopeCeiling: role.scopeCeiling, legacyNames: role.legacyNames }, role.id, reason);
                setRes(r);
                if (r.ok) {
                  notify(`${role.name} permissions saved`, "positive");
                  setDraft(null);
                  setConfirm(false);
                }
              }}
            >
              Confirm and save
            </button>
          </>
        }
      >
        <div className="stack">
          {(role.protected || role.system) && (
            <div className="callout callout--info">
              <ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />
              <span>This is a {role.protected ? "protected" : "system"} role. The change applies immediately to {impact.users.length} user(s) and is recorded with your reason.</span>
            </div>
          )}
          <PermissionDiff before={role.permissions} after={current} />
          {impact.users.length > 0 && (
            <p className="small">
              <strong>Affected users:</strong> {impact.users.map((u) => fullName(s.users.find((x) => x.id === u))).join(", ")}
            </p>
          )}
          <TextArea label="Reason" required={role.system || role.protected} value={reason} onChange={setReason} />
          <PolicyMessages result={res} />
        </div>
      </Drawer>
    </>
  );
}
