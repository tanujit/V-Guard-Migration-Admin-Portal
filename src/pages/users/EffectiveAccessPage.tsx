import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { SelectInput } from "@/components/form/Form";
import { ProgrammeTag, StatusBadge } from "@/components/ui/primitives";
import { useAccessState } from "@/features/access/store";
import { describeScope, fullName, getAccessibleGeography, getAccessibleProgrammes, getEffectiveAccess, hasPermission, membershipsOf, orgById, type AccessSource } from "@/features/access/engine";
import { ACTIONS, key, MODULE_CATEGORY_LABEL, MODULES } from "@/config/rbacCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { PROGRAMMES } from "@/config/programmes";
import type { ActionId, ModuleCategory } from "@/types/rbac";
import { AccountStatusBadge, AssignmentStatusBadge, PolicyMessages, ScopeText, SectionTitle } from "./shared";

const SOURCE_LABEL: Record<AccessSource["kind"], string> = { role: "Inherited from role", profile: "Granted through operational profile", direct: "Assigned directly" };
const SOURCE_SHORT: Record<AccessSource["kind"], string> = { role: "R", profile: "P", direct: "D" };

export function EffectiveAccessPage() {
  const s = useAccessState();
  const [params, setParams] = useSearchParams();
  const userId = params.get("user") ?? s.users[0].id;
  const access = useMemo(() => getEffectiveAccess(s, userId), [s, userId]);
  const u = access.user!;
  const programmes = getAccessibleProgrammes(s, userId, undefined, access);
  const geography = getAccessibleGeography(s, userId, undefined, access);
  const [test, setTest] = useState({ module: "schemes", action: "submit" as ActionId, programme: "", state: "", district: "", branch: "" });
  const stateDef = GEOGRAPHY.find((g) => g.code === test.state);
  const districtDef = stateDef?.districts.find((d) => d.code === test.district);
  const decision = hasPermission(s, userId, test.module, test.action, { programme: test.programme || undefined, geo: { state: test.branch || test.district ? undefined : test.state || undefined, district: test.branch ? undefined : test.district || undefined, branch: test.branch || undefined } }, access);
  const restricted = MODULES.flatMap((m) => m.actions.filter((a) => ACTIONS.find((x) => x.id === a)?.restricted && !access.grants.has(key(m.id, a))).map((a) => `${m.label}: ${ACTIONS.find((x) => x.id === a)?.label}`));

  return (
    <>
      <SectionTitle
        title="Effective access"
        description="What a person can do right now, and why. Computed by the same engine that guards every screen"
        actions={<SelectInput label="User" value={userId} onChange={(v) => setParams({ user: v })} options={s.users.map((x) => ({ value: x.id, label: `${fullName(x)} · ${x.id}` }))} />}
      />

      <div className="grid grid--12">
        <Panel span={5} title={fullName(u)} subtitle={<span className="mono">{u.id}</span>} actions={<Link className="btn btn--ghost btn--sm" to={`/governance/users/user/${u.id}`}>Open profile</Link>}>
          <dl className="kv kv--wide">
            <div className="kv__row"><dt>Account</dt><dd><AccountStatusBadge status={u.accountStatus} /></dd></div>
            <div className="kv__row"><dt>Organisations</dt><dd>{membershipsOf(s, u.id).map((m) => `${orgById(s, m.orgId)?.name}${m.status !== "active" ? " (inactive)" : ""}`).join(", ")}</dd></div>
            <div className="kv__row"><dt>Effective roles</dt><dd>{access.sources.filter((x) => x.effective && x.kind === "role").map((x) => x.title).join(", ") || "None"}</dd></div>
            <div className="kv__row"><dt>Operational profiles</dt><dd>{access.sources.filter((x) => x.effective && x.kind === "profile").map((x) => x.title).join("; ") || "None"}</dd></div>
            <div className="kv__row"><dt>Programmes</dt><dd>{programmes === "all" ? "All programmes" : programmes.length ? <span className="tag-row">{programmes.map((p) => <ProgrammeTag key={p} code={p} size="sm" />)}</span> : "None"}</dd></div>
            <div className="kv__row"><dt>Geography</dt><dd className="wrap">{describeScope({ programmes: "all", geography }).geography}</dd></div>
            <div className="kv__row"><dt>Modules accessible</dt><dd>{new Set([...access.grants.keys()].map((k) => k.split(":")[0])).size} of {MODULES.length}</dd></div>
          </dl>
          <PolicyMessages result={{ errors: [], warnings: access.warnings }} />
        </Panel>

        <Panel span={7} title="Test a decision" subtitle="Can this user perform an action on a record in a given programme and location?">
          <div className="form-grid form-grid--3">
            <SelectInput label="Module" value={test.module} onChange={(v) => setTest({ ...test, module: v, action: (MODULES.find((m) => m.id === v)?.actions[0] ?? "view") as ActionId })} options={MODULES.map((m) => ({ value: m.id, label: m.label }))} />
            <SelectInput label="Action" value={test.action} onChange={(v) => setTest({ ...test, action: v as ActionId })} options={(MODULES.find((m) => m.id === test.module)?.actions ?? []).map((a) => ({ value: a, label: ACTIONS.find((x) => x.id === a)!.label }))} />
            <SelectInput label="Programme" value={test.programme} onChange={(v) => setTest({ ...test, programme: v })} options={[{ value: "", label: "Any (module-level)" }, ...PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))]} />
            <SelectInput label="State" value={test.state} onChange={(v) => setTest({ ...test, state: v, district: "", branch: "" })} options={[{ value: "", label: "Any location" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} />
            <SelectInput label="District" value={test.district} onChange={(v) => setTest({ ...test, district: v, branch: "" })} disabled={!stateDef} options={[{ value: "", label: stateDef ? "Whole state" : "Choose a state" }, ...(stateDef?.districts.map((d) => ({ value: d.code, label: d.name })) ?? [])]} />
            <SelectInput label="Branch" value={test.branch} onChange={(v) => setTest({ ...test, branch: v })} disabled={!districtDef} options={[{ value: "", label: districtDef ? "Whole district" : "Choose a district" }, ...(districtDef?.branches.map((b) => ({ value: b.code, label: b.name })) ?? [])]} />
          </div>
          <div className={`decision ${decision.allowed ? "is-allowed" : "is-denied"}`} role="status">
            {decision.allowed ? <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" /> : <XCircle size={20} strokeWidth={2} aria-hidden="true" />}
            <div>
              <p className="decision__title">{decision.allowed ? "Allowed" : "Denied"}</p>
              <p className="decision__reason">{decision.reason}</p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Permissions by module and action" subtitle="R = inherited from role · P = operational profile · D = assigned directly · hover a cell for its source and scope" padded={false}>
        <div className="matrix__scroll" tabIndex={0} role="region" aria-label="Effective permission grid">
          <table className="matrix__table matrix__table--eff">
            <thead>
              <tr>
                <th scope="col" className="matrix__module-h">Module</th>
                {ACTIONS.map((a) => (
                  <th key={a.id} scope="col" className={a.restricted ? "is-restricted" : ""}>
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(MODULE_CATEGORY_LABEL) as ModuleCategory[]).map((c) => (
                <Fragment key={c}>
                  <tr className="matrix__group">
                    <th colSpan={ACTIONS.length + 1} scope="colgroup">{MODULE_CATEGORY_LABEL[c]}</th>
                  </tr>
                  {MODULES.filter((m) => m.category === c).map((m) => (
                    <tr key={m.id}>
                      <th scope="row" className="matrix__module">
                        <span className="matrix__module-name">{m.label}</span>
                      </th>
                      {ACTIONS.map((a) => {
                        if (!m.actions.includes(a.id)) return <td key={a.id} className="matrix__na">–</td>;
                        const grants = access.grants.get(key(m.id, a.id)) ?? [];
                        const blocked = access.sources.find((x) => !x.effective && x.keys.includes(key(m.id, a.id)));
                        const title = grants.length ? grants.map((g) => `${SOURCE_LABEL[g.source.kind]}: ${g.source.title} · ${describeScope(g.source.scope).programmes} · ${describeScope(g.source.scope).geography}`).join("\n") : blocked ? `Unavailable: ${blocked.title} — ${blocked.note}` : "Not granted";
                        return (
                          <td key={a.id} className={`eff-cell ${grants.length ? "is-on" : blocked ? "is-blocked" : ""}`} title={title} aria-label={`${m.label} ${a.label}: ${title}`}>
                            {grants.length ? Array.from(new Set(grants.map((g) => SOURCE_SHORT[g.source.kind]))).join("") : blocked ? "!" : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel__note matrix__foot">“!” marks a permission the user would have through an assignment that is not effective (expired, pending, suspended, or blocked by account or organisation status).</p>
      </Panel>

      <Panel title="Sources of access" subtitle="Every role, profile and grant, effective or not" padded={false}>
        <DataTable
          rows={access.sources}
          rowKey={(x) => x.id}
          caption="Sources of access"
          searchable={false}
          columns={[
            { key: "kind", header: "Source", value: (x) => SOURCE_LABEL[x.kind], render: (x) => <span className={`src-tag src-tag--${x.kind}`}>{SOURCE_LABEL[x.kind]}</span> },
            { key: "title", header: "Role / profile", value: (x) => x.title },
            { key: "org", header: "Organisation", value: (x) => (x.orgId ? (orgById(s, x.orgId)?.name ?? "") : "") },
            { key: "perm", header: "Permissions", value: (x) => x.keys.length, align: "right" },
            { key: "scope", header: "Scope", value: (x) => describeScope(x.scope).programmes, render: (x) => <ScopeText scope={x.scope} compact /> },
            { key: "dates", header: "Valid", value: (x) => x.validFrom, render: (x) => <span className="small num">{x.validFrom} → {x.validTo ?? "open"}</span> },
            { key: "status", header: "Status", value: (x) => x.status, render: (x) => <AssignmentStatusBadge status={x.status} validTo={x.validTo} /> },
            { key: "eff", header: "Effective", value: (x) => (x.effective ? "Yes" : "No"), render: (x) => (x.effective ? <StatusBadge tone="positive">Effective</StatusBadge> : <StatusBadge tone="neutral">Not effective</StatusBadge>) },
            { key: "note", header: "Why", value: (x) => x.note ?? "", render: (x) => <span className="small wrap">{x.note ?? (x.effective ? "Restricted by its scope only" : "")}</span> },
          ]}
        />
      </Panel>

      <Panel title="Restricted actions not held" subtitle="Approve, disable, execute, manage, assign access and view sensitive actions the user does not have">
        <p className="small wrap">{restricted.length ? restricted.join(" · ") : "None: the user holds every restricted action"}</p>
      </Panel>

      <Panel title="Precedence policy">
        <ol className="policy-list">
          <li>Deny by default: nothing is allowed unless an effective grant allows it.</li>
          <li>A grant is effective only when the account, organisation membership, organisation and role are active, the assignment is Active, and today is within its dates.</li>
          <li>Permissions combine across grants, but each grant keeps its own programme and geography scope. Grants never merge into a wider scope.</li>
          <li>There are no explicit deny rules; restrictions come from scope, status and validity.</li>
          <li>Approve, Reject and Return come only from the Checker profile, never from administrative roles.</li>
          <li>Administrators can grant only what they hold, within the scope they hold it. Nobody can change their own access.</li>
        </ol>
      </Panel>
    </>
  );
}
