import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Eye, Pencil, Plus, Power, RotateCcw } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { Panel } from "@/components/ui/Panel";
import { FigureRow } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { organisationImpact, saveOrganisation, setOrganisationStatus, useAccessState, type OrgDraft } from "@/features/access/store";
import { canManageOrganisations, fullName, membershipsOf, orgById, roleById, type PolicyResult } from "@/features/access/engine";
import { ORG_TYPE_LABEL } from "@/config/rbacCatalogue";
import { formatDateTime } from "@/lib/format";
import type { Organisation, OrgTypeId } from "@/types/rbac";
import { AccountStatusBadge, PolicyMessages, ReasonDialog, SectionTitle } from "./shared";

export function OrganisationsPage() {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();
  const manage = canManageOrganisations(s, actorId).ok;
  const [edit, setEdit] = useState<Organisation | "new" | null>(null);
  const [view, setView] = useState<Organisation | null>(null);
  const [status, setStatus] = useState<{ org: Organisation; to: "active" | "inactive" } | null>(null);

  const myOrgs = new Set(membershipsOf(s, actorId).map((m) => m.orgId));
  const rows = useMemo(
    () =>
      s.organisations
        .filter((o) => manage || myOrgs.has(o.id))
        .map((o) => {
          const mems = s.memberships.filter((m) => m.orgId === o.id);
          const users = mems.map((m) => s.users.find((u) => u.id === m.userId)!).filter(Boolean);
          return { o, users: users.length, active: users.filter((u) => u.accountStatus === "active").length };
        }),
    [s, manage, myOrgs],
  );

  return (
    <>
      <SectionTitle
        title="Organisations"
        description={manage ? "Organisations allowed to access the portal. Type describes the organisation, never a user's permissions" : "Your organisation. Only Evolve platform administrators can create or change organisations"}
        actions={
          manage && (
            <button type="button" className="btn btn--primary" onClick={() => setEdit("new")}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Create organisation
            </button>
          )
        }
      />
      <Panel padded={false}>
        <FigureRow
          items={[
            { label: "Organisations", value: String(rows.length) },
            { label: "Active", value: String(rows.filter((r) => r.o.status === "active").length) },
            { label: "Users across organisations", value: String(rows.reduce((n, r) => n + r.users, 0)), sub: "A person in two organisations counts twice" },
            { label: "Types in use", value: String(new Set(rows.map((r) => r.o.type)).size) },
          ]}
        />
      </Panel>
      <Panel padded={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.o.id}
          caption="Organisations"
          searchPlaceholder="Search organisations"
          onRowClick={(r) => setView(r.o)}
          rowActionLabel={(r) => `Open ${r.o.name}`}
          exportName={manage ? "organisations" : undefined}
          columns={[
            { key: "id", header: "Organisation ID", value: (r) => r.o.id, render: (r) => <span className="mono small">{r.o.id}</span> },
            { key: "name", header: "Name", value: (r) => r.o.name, render: (r) => <span className="cell-2"><span className="cell-2__main">{r.o.name}</span><span className="cell-2__sub">{r.o.description}</span></span> },
            { key: "type", header: "Type", value: (r) => ORG_TYPE_LABEL[r.o.type], render: (r) => <span className={`org-type org-type--${r.o.type}`}>{ORG_TYPE_LABEL[r.o.type]}</span> },
            { key: "code", header: "Code", value: (r) => r.o.code, render: (r) => <span className="mono small">{r.o.code}</span> },
            { key: "users", header: "Users", value: (r) => r.users, align: "right" },
            { key: "active", header: "Active users", value: (r) => r.active, align: "right" },
            { key: "status", header: "Status", value: (r) => r.o.status, render: (r) => <StatusBadge tone={r.o.status === "active" ? "positive" : "neutral"}>{r.o.status === "active" ? "Active" : "Inactive"}</StatusBadge> },
            { key: "created", header: "Created", value: (r) => r.o.createdAt, render: (r) => <span className="small num">{formatDateTime(r.o.createdAt).split(",")[0]}</span> },
            {
              key: "x",
              header: "Actions",
              value: () => null,
              sortable: false,
              render: (r) => (
                <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="icon-btn icon-btn--sm" aria-label={`View ${r.o.name}`} title="View" onClick={() => setView(r.o)}>
                    <Eye size={15} strokeWidth={2} />
                  </button>
                  {manage && (
                    <>
                      <button type="button" className="icon-btn icon-btn--sm" aria-label={`Edit ${r.o.name}`} title="Edit" onClick={() => setEdit(r.o)}>
                        <Pencil size={15} strokeWidth={2} />
                      </button>
                      <button type="button" className="icon-btn icon-btn--sm" aria-label={r.o.status === "active" ? `Deactivate ${r.o.name}` : `Reactivate ${r.o.name}`} title={r.o.status === "active" ? "Deactivate" : "Reactivate"} onClick={() => setStatus({ org: r.o, to: r.o.status === "active" ? "inactive" : "active" })}>
                        {r.o.status === "active" ? <Power size={15} strokeWidth={2} /> : <RotateCcw size={15} strokeWidth={2} />}
                      </button>
                    </>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <OrgEditor key={edit === "new" ? "new" : (edit?.id ?? "none")} open={!!edit} org={edit === "new" ? null : edit} onClose={() => setEdit(null)} />

      <Drawer open={!!view} onClose={() => setView(null)} title={view?.name ?? ""} subtitle={view && <span className="mono">{view.id} · {view.code}</span>} width={600}>
        {view && <OrgDetail org={view} />}
      </Drawer>

      <ReasonDialog
        open={!!status}
        title={status?.to === "inactive" ? `Deactivate ${status.org.name}` : `Reactivate ${status?.org.name ?? ""}`}
        tone={status?.to === "inactive" ? "danger" : "default"}
        confirmLabel={status?.to === "inactive" ? "Deactivate organisation" : "Reactivate"}
        body={status && (status.to === "inactive" ? <OrgImpact orgId={status.org.id} /> : <p>Users and assignments in this organisation become effective again if they are otherwise valid.</p>)}
        onClose={() => setStatus(null)}
        onConfirm={(reason) => {
          const r = setOrganisationStatus(actorId, status!.org.id, status!.to, reason);
          if (r.ok) notify(`${status!.org.name} ${status!.to === "inactive" ? "deactivated" : "reactivated"}`, "positive");
          return r;
        }}
      />
    </>
  );
}

function OrgImpact({ orgId }: { orgId: string }) {
  const s = useAccessState();
  const { users, assignments } = organisationImpact(s, orgId);
  return (
    <div className="impact">
      <p>
        Access held through this organisation stops: <strong>{users.length}</strong> user{users.length === 1 ? "" : "s"} and <strong>{assignments.length}</strong> active or pending assignment{assignments.length === 1 ? "" : "s"}. Users with memberships in other organisations keep that access.
      </p>
      {users.length > 0 && (
        <ul>
          {users.slice(0, 8).map((u) => (
            <li key={u.id}>
              {fullName(u)} <span className="mono small">{u.id}</span>
            </li>
          ))}
          {users.length > 8 && <li>and {users.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}

function OrgDetail({ org }: { org: Organisation }) {
  const s = useAccessState();
  const mems = s.memberships.filter((m) => m.orgId === org.id);
  const asg = s.assignments.filter((a) => mems.some((m) => m.id === a.membershipId) && a.status !== "revoked");
  const byRole = new Map<string, number>();
  asg.forEach((a) => byRole.set(a.roleId, (byRole.get(a.roleId) ?? 0) + 1));
  return (
    <div className="stack">
      <dl className="kv kv--wide">
        <div className="kv__row"><dt>Type</dt><dd>{ORG_TYPE_LABEL[org.type]}</dd></div>
        <div className="kv__row"><dt>Status</dt><dd>{org.status}</dd></div>
        <div className="kv__row"><dt>Description</dt><dd>{org.description}</dd></div>
        <div className="kv__row"><dt>Primary contact</dt><dd>{org.primaryContact.name} · {org.primaryContact.email}</dd></div>
        <div className="kv__row"><dt>Parent organisation</dt><dd>{org.parentId ? orgById(s, org.parentId)?.name : "None"}</dd></div>
        <div className="kv__row"><dt>Created</dt><dd>{formatDateTime(org.createdAt)}</dd></div>
      </dl>
      <h3 className="drill__h">Role assignments in this organisation</h3>
      <ul className="plain-list">
        {[...byRole.entries()].map(([rid, n]) => (
          <li key={rid}>
            {roleById(s, rid)?.name} · <span className="num">{n}</span>
          </li>
        ))}
        {!byRole.size && <li className="muted">None</li>}
      </ul>
      <h3 className="drill__h">Users ({mems.length})</h3>
      <ul className="plain-list">
        {mems.map((m) => {
          const u = s.users.find((x) => x.id === m.userId)!;
          return (
            <li key={m.id} className="user-line">
              <Link className="link-btn" to={`/governance/users/user/${u.id}`}>
                {fullName(u)}
              </Link>
              <span className="small muted">{m.designation}</span>
              <AccountStatusBadge status={u.accountStatus} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OrgEditor({ open, org, onClose }: { open: boolean; org: Organisation | null; onClose: () => void }) {
  const s = useAccessState();
  const { user } = useSession();
  const { notify } = useToast();
  const [d, setD] = useState<OrgDraft>(() => (org ? { name: org.name, code: org.code, type: org.type, description: org.description, primaryContact: org.primaryContact, status: org.status, parentId: org.parentId } : { name: "", code: "", type: "external_partner", description: "", primaryContact: { name: "", email: "" }, status: "active", parentId: null }));
  const [res, setRes] = useState<PolicyResult | null>(null);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={org ? `Edit ${org.name}` : "Create organisation"}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const r = saveOrganisation(user!.id, d, org?.id);
              setRes(r);
              if (r.ok) {
                notify(org ? "Organisation updated" : `${d.name} created`, "positive");
                onClose();
              }
            }}
          >
            <Building2 size={16} strokeWidth={2} aria-hidden="true" />
            {org ? "Save changes" : "Create"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label="Organisation name" required value={d.name} onChange={(v) => setD({ ...d, name: v })} />
        <TextField label="Organisation code" required value={d.code} onChange={(v) => setD({ ...d, code: v.toUpperCase() })} hint="2–16 capitals, digits, - or _" />
        <SelectInput label="Organisation type" value={d.type} onChange={(v) => setD({ ...d, type: v as OrgTypeId })} options={(Object.keys(ORG_TYPE_LABEL) as OrgTypeId[]).map((k) => ({ value: k, label: ORG_TYPE_LABEL[k] }))} hint="Describes the organisation; it never grants permissions" />
        <SelectInput label="Parent organisation" value={d.parentId ?? ""} onChange={(v) => setD({ ...d, parentId: v || null })} options={[{ value: "", label: "None" }, ...s.organisations.filter((o) => o.id !== org?.id).map((o) => ({ value: o.id, label: o.name }))]} />
        <TextField label="Primary contact name" value={d.primaryContact.name} onChange={(v) => setD({ ...d, primaryContact: { ...d.primaryContact, name: v } })} />
        <TextField label="Primary contact email" type="email" value={d.primaryContact.email} onChange={(v) => setD({ ...d, primaryContact: { ...d.primaryContact, email: v } })} />
        <div className="span-all">
          <TextArea label="Description" value={d.description} onChange={(v) => setD({ ...d, description: v })} />
        </div>
        {org && <p className="small muted span-all">Status is changed with Deactivate / Reactivate so affected users are reviewed first.</p>}
      </div>
      <PolicyMessages result={res} />
    </Drawer>
  );
}
