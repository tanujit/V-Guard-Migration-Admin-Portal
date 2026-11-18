import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, Eye, FilePen, Hourglass, PackageCheck, Plus, RotateCcw, Send, Undo2, XCircle } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { Panel } from "@/components/ui/Panel";
import { KpiCard, type KpiTone, type KpiVariant } from "@/components/ui/KpiCard";
import { MultiSelect, SelectInput, TextArea, TextField } from "@/components/form/Form";
import { ScopeEditor } from "@/components/form/ScopeEditor";
import { ProgrammeTag } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { decideNomination, provisionNomination, saveNomination, startNominationReview, useAccessState, validateNomination, type NominationDraft } from "@/features/access/store";
import { canAssignRole, canNominate, canReviewNominations, describeScope, findDuplicates, fullName, getAccessibleGeography, getAccessibleProgrammes, orgById, TODAY, userName, type PolicyResult } from "@/features/access/engine";
import { MAKER_MODULES, moduleById } from "@/config/rbacCatalogue";
import { ROLE } from "@/data/mock/rbacSeed";
import { formatDateTime } from "@/lib/format";
import type { KpiMetric } from "@/types/dashboard";
import type { LucideIcon } from "lucide-react";
import type { AccessScope, MakerNomination, NominationStatus } from "@/types/rbac";
import { AccountStatusBadge, NOMINATION_STATUS, NominationStatusBadge, PolicyMessages, SectionTitle } from "./shared";

const KPIS: { id: NominationStatus | "all"; label: string; variant: KpiVariant; tone?: KpiTone; icon: LucideIcon; match: NominationStatus[] }[] = [
  { id: "all", label: "Total nominations", variant: "primary", icon: ClipboardList, match: [] },
  { id: "submitted", label: "Submitted", variant: "light", icon: Send, match: ["submitted"] },
  { id: "under_review", label: "Under review", variant: "status", tone: "warning", icon: Hourglass, match: ["under_review"] },
  { id: "approved", label: "Approved", variant: "dark", icon: CheckCircle2, match: ["approved"] },
  { id: "rejected", label: "Rejected", variant: "status", tone: "negative", icon: XCircle, match: ["rejected"] },
  { id: "returned", label: "Returned", variant: "status", tone: "warning", icon: Undo2, match: ["returned"] },
  { id: "provisioned", label: "Provisioned", variant: "status", tone: "positive", icon: PackageCheck, match: ["provisioned"] },
];

export function NominationsPage() {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const [params, setParams] = useSearchParams();
  const filter = (params.get("status") ?? "all") as NominationStatus | "all";
  const [edit, setEdit] = useState<MakerNomination | "new" | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const nominate = canNominate(s, actorId).ok;
  const reviewer = canReviewNominations(s, actorId).ok;

  // Drafts are private to their author; everyone else sees submitted nominations onward.
  const visible = useMemo(() => s.nominations.filter((n) => n.status !== "draft" || n.nominatedBy === actorId), [s.nominations, actorId]);
  const rows = visible.filter((n) => filter === "all" || n.status === filter);

  const metric = (k: (typeof KPIS)[number]): KpiMetric => ({ id: k.id, label: k.label, value: k.id === "all" ? visible.length : visible.filter((n) => k.match.includes(n.status)).length, format: "count", description: k.id === "all" ? "All nominations you can see" : NOMINATION_STATUS[k.id as NominationStatus].label, goodDirection: "neutral", reference: filter === k.id ? "Filter applied" : "Select to filter", drill: { module: "users", title: k.label } });

  return (
    <>
      <SectionTitle
        title="Maker access nominations"
        description="V-Guard nominates people for Maker access; Evolve reviews and provisions. A nomination never grants access by itself"
        actions={
          nominate && (
            <button type="button" className="btn btn--primary" onClick={() => setEdit("new")}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Nominate for Maker access
            </button>
          )
        }
      />
      <div className="kpi-grid kpi-grid--7">
        {KPIS.map((k) => (
          <div key={k.id} className={filter === k.id && k.id !== "all" ? "kpi-selected" : ""}>
            <KpiCard metric={metric(k)} onSelect={() => setParams(filter === k.id || k.id === "all" ? {} : { status: k.id })} variant={k.variant} tone={k.tone} icon={k.icon} compact />
          </div>
        ))}
      </div>
      <Panel padded={false}>
        <DataTable
          rows={rows}
          rowKey={(n) => n.id}
          caption="Maker nominations"
          searchPlaceholder="Search reference, candidate or email"
          onRowClick={(n) => setReview(n.id)}
          rowActionLabel={(n) => `Open nomination ${n.ref}`}
          initialSort={{ key: "submitted", dir: "desc" }}
          exportName="maker-nominations"
          emptyTitle="No nominations"
          columns={[
            { key: "ref", header: "Reference", value: (n) => n.ref, render: (n) => <span className="mono small">{n.ref}</span> },
            { key: "cand", header: "Candidate", value: (n) => `${n.candidate.name} ${n.candidate.email}`, render: (n) => <span className="cell-2"><span className="cell-2__main">{n.candidate.name}{n.candidate.existingUserId && <span className="more-chip" title="Existing portal user">Existing user</span>}</span><span className="cell-2__sub">{n.candidate.email}</span></span> },
            { key: "org", header: "Organisation", value: (n) => orgById(s, n.candidate.orgId)?.name ?? "" },
            { key: "mods", header: "Modules", value: (n) => n.modules.map((m) => moduleById.get(m)?.label).join(", "), render: (n) => <span className="small wrap">{n.modules.map((m) => moduleById.get(m)?.label).join(", ")}</span> },
            { key: "prog", header: "Programmes", value: (n) => describeScope(n.scope).programmes, render: (n) => (n.scope.programmes === "all" ? "All" : <span className="tag-row">{n.scope.programmes.map((p) => <ProgrammeTag key={p} code={p} size="sm" />)}</span>) },
            { key: "geo", header: "Geography", value: (n) => describeScope(n.scope).geography, render: (n) => <span className="small">{n.scope.geography.mode === "all" ? "All" : describeScope(n.scope).geography.split(" (")[0]}</span> },
            { key: "status", header: "Status", value: (n) => NOMINATION_STATUS[n.status].label, render: (n) => <NominationStatusBadge status={n.status} /> },
            { key: "by", header: "Nominated by", value: (n) => userName(s, n.nominatedBy) },
            { key: "submitted", header: "Submitted", value: (n) => n.submittedAt ?? "", render: (n) => <span className="small num">{n.submittedAt ? formatDateTime(n.submittedAt) : "Not submitted"}</span> },
            {
              key: "x",
              header: "",
              value: () => null,
              sortable: false,
              render: (n) => (
                <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="icon-btn icon-btn--sm" aria-label={`Open ${n.ref}`} title={reviewer && ["submitted", "under_review", "approved"].includes(n.status) ? "Review" : "View"} onClick={() => setReview(n.id)}>
                    <Eye size={15} strokeWidth={2} />
                  </button>
                  {nominate && ["draft", "returned"].includes(n.status) && n.nominatedBy === actorId && (
                    <button type="button" className="icon-btn icon-btn--sm" aria-label={`Edit ${n.ref}`} title="Edit and resubmit" onClick={() => setEdit(n)}>
                      <FilePen size={15} strokeWidth={2} />
                    </button>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Panel>
      <NominationEditor key={edit === "new" ? "new" : edit ? edit.id : "none"} open={!!edit} nomination={edit === "new" ? null : edit} onClose={() => setEdit(null)} />
      <NominationReview key={review ?? "none"} id={review} onClose={() => setReview(null)} />
    </>
  );
}

/* ---------------- Create / edit ---------------- */

function NominationEditor({ open, nomination, onClose }: { open: boolean; nomination: MakerNomination | null; onClose: () => void }) {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();
  const authority = { programmes: getAccessibleProgrammes(s, actorId), geography: getAccessibleGeography(s, actorId) };
  const [d, setD] = useState<NominationDraft>(() =>
    nomination
      ? { candidate: nomination.candidate, modules: nomination.modules, scope: nomination.scope, startDate: nomination.startDate, endDate: nomination.endDate, justification: nomination.justification }
      : { candidate: { name: "", email: "", mobile: "", orgId: "", designation: "", department: "", existingUserId: null }, modules: [], scope: { programmes: "all", geography: { mode: "all" } }, startDate: TODAY, endDate: null, justification: "" },
  );
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [existingId, setExistingId] = useState(nomination?.candidate.existingUserId ?? "");
  const match = findDuplicates(s, d.candidate.email, d.candidate.mobile)[0];

  // Choosing an existing user fills the candidate from their record.
  useEffect(() => {
    const u = s.users.find((x) => x.id === existingId);
    if (!u) return;
    const m = s.memberships.find((x) => x.userId === u.id && x.status === "active");
    setD((prev) => ({ ...prev, candidate: { name: fullName(u), email: u.email, mobile: u.mobile, orgId: m?.orgId ?? prev.candidate.orgId, designation: u.designation, department: u.department, existingUserId: u.id } }));
  }, [existingId, s.users, s.memberships]);

  const submit = (doSubmit: boolean) => {
    const r = saveNomination(actorId, d, doSubmit, nomination?.id);
    setRes(r);
    if (r.ok) {
      notify(doSubmit ? "Nomination submitted to Evolve for review" : "Draft saved", "positive");
      onClose();
    }
  };
  const errors = validateNomination(s, d);
  const c = d.candidate;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={640}
      title={nomination ? `Edit ${nomination.ref}` : "Nominate for Maker access"}
      subtitle={nomination?.status === "returned" && nomination.review ? `Returned: ${nomination.review.remarks}` : undefined}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={() => submit(false)}>
            Save draft
          </button>
          <button type="button" className="btn btn--primary" onClick={() => submit(true)} disabled={errors.length > 0}>
            <Send size={16} strokeWidth={2} aria-hidden="true" />
            Submit for Evolve review
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">The nomination is a request. Evolve reviews it against the permission policy and provisions only the approved scope.</p>
        <SelectInput label="Existing portal user (optional)" value={existingId} onChange={setExistingId} options={[{ value: "", label: "New person (not yet a portal user)" }, ...s.users.filter((u) => u.accountStatus !== "deactivated").map((u) => ({ value: u.id, label: `${fullName(u)} · ${u.id}` }))]} hint="Existing users are updated, never duplicated" />
        <div className="form-grid">
          <TextField label="Candidate name" required value={c.name} onChange={(v) => setD({ ...d, candidate: { ...c, name: v } })} />
          <TextField label="Business email" required type="email" value={c.email} onChange={(v) => setD({ ...d, candidate: { ...c, email: v } })} />
          <TextField label="Mobile" type="tel" value={c.mobile} onChange={(v) => setD({ ...d, candidate: { ...c, mobile: v } })} />
          <SelectInput label="Organisation" required value={c.orgId} onChange={(v) => setD({ ...d, candidate: { ...c, orgId: v } })} options={[{ value: "", label: "Choose organisation" }, ...s.organisations.filter((o) => o.status === "active").map((o) => ({ value: o.id, label: o.name }))]} />
          <TextField label="Designation" value={c.designation} onChange={(v) => setD({ ...d, candidate: { ...c, designation: v } })} />
          <TextField label="Department" value={c.department} onChange={(v) => setD({ ...d, candidate: { ...c, department: v } })} />
        </div>
        {match && match.id !== existingId && <PolicyMessages result={{ errors: match.accountStatus === "deactivated" ? [`${fullName(match)} (${match.id}) is deactivated. Reactivate the account before nominating`] : [], warnings: match.accountStatus === "deactivated" ? [] : [`Matches existing user ${fullName(match)} (${match.id}). Provisioning will update that account`] }} />}
        <MultiSelect label="Requested modules" options={MAKER_MODULES.map((m) => ({ value: m, label: moduleById.get(m)!.label }))} value={d.modules} onChange={(v) => setD({ ...d, modules: v })} hint="Maker can create, edit and submit in these modules only" />
        <ScopeEditor idPrefix="nom" value={d.scope} onChange={(v) => setD({ ...d, scope: v })} authority={authority} />
        <div className="form-grid">
          <TextField label="Access start" type="date" value={d.startDate} onChange={(v) => setD({ ...d, startDate: v })} />
          <TextField label="Access end (optional)" type="date" value={d.endDate ?? ""} onChange={(v) => setD({ ...d, endDate: v || null })} />
        </div>
        <TextArea label="Business justification" required value={d.justification} onChange={(v) => setD({ ...d, justification: v })} rows={3} />
        <PolicyMessages result={res ?? (errors.length ? { errors, warnings: [] } : null)} title={res ? undefined : "Needed before submitting"} />
      </div>
    </Drawer>
  );
}

/* ---------------- Review (Evolve) ---------------- */

function NominationReview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const s = useAccessState();
  const { user } = useSession();
  const actorId = user!.id;
  const { notify } = useToast();
  const n = s.nominations.find((x) => x.id === id);
  const reviewer = canReviewNominations(s, actorId).ok;
  const [modules, setModules] = useState<string[]>(n?.modules ?? []);
  const [scope, setScope] = useState<AccessScope>(n?.scope ?? { programmes: "all", geography: { mode: "all" } });
  const [remarks, setRemarks] = useState("");
  const [res, setRes] = useState<PolicyResult | null>(null);

  useEffect(() => {
    // Opening a submitted nomination as a reviewer moves it to "Under Evolve review" (once).
    if (n && reviewer && n.status === "submitted" && n.nominatedBy !== actorId) startNominationReview(actorId, n.id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!n) return null;
  const decidable = reviewer && ["submitted", "under_review"].includes(n.status) && n.nominatedBy !== actorId;
  const existing = n.candidate.existingUserId ? s.users.find((u) => u.id === n.candidate.existingUserId) : findDuplicates(s, n.candidate.email, n.candidate.mobile)[0];
  const membership = existing ? s.memberships.find((m) => m.userId === existing.id && m.orgId === n.candidate.orgId && m.status === "active") : undefined;
  const policy = existing && membership ? canAssignRole(s, actorId, { userId: existing.id, membershipId: membership.id, roleId: ROLE.MAKER, moduleLimit: modules, scope, validFrom: n.startDate < TODAY ? TODAY : n.startDate, validTo: n.endDate }) : null;
  const narrowed = modules.length !== n.modules.length || JSON.stringify(scope) !== JSON.stringify(n.scope);

  const decide = (decision: "approved" | "rejected" | "returned") => {
    const r = decideNomination(actorId, n.id, decision, remarks, decision === "approved" ? { modules, scope, endDate: n.endDate } : undefined);
    setRes(r);
    if (r.ok) notify(`${n.ref} ${decision}`, "positive");
  };

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width={720}
      title={`${n.ref} · ${n.candidate.name}`}
      subtitle={<NominationStatusBadge status={n.status} />}
      footer={
        decidable ? (
          <>
            <button type="button" className="btn btn--danger" onClick={() => decide("rejected")}>
              Reject
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => decide("returned")}>
              <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
              Return for clarification
            </button>
            <button type="button" className="btn btn--primary" onClick={() => decide("approved")} disabled={!!policy && !policy.ok}>
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
              Approve{narrowed ? " narrowed scope" : ""}
            </button>
          </>
        ) : reviewer && n.status === "approved" ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const r = provisionNomination(actorId, n.id);
              setRes(r);
              if (r.ok) notify(`Maker access provisioned · ${r.accessRef}`, "positive");
            }}
          >
            <PackageCheck size={16} strokeWidth={2} aria-hidden="true" />
            Provision Maker access
          </button>
        ) : (
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <div className="stack">
        <div className="grid grid--12">
          <div className="span-6">
            <h3 className="drill__h">Candidate</h3>
            <dl className="kv">
              <div className="kv__row"><dt>Name</dt><dd>{n.candidate.name}</dd></div>
              <div className="kv__row"><dt>Email</dt><dd>{n.candidate.email}</dd></div>
              <div className="kv__row"><dt>Organisation</dt><dd>{orgById(s, n.candidate.orgId)?.name}</dd></div>
              <div className="kv__row"><dt>Designation</dt><dd>{n.candidate.designation || "—"} · {n.candidate.department || "—"}</dd></div>
              <div className="kv__row"><dt>Portal account</dt><dd>{existing ? <><Link className="link-btn" to={`/governance/users/user/${existing.id}`}>{existing.id}</Link> <AccountStatusBadge status={existing.accountStatus} /></> : "None: an invited account will be created"}</dd></div>
            </dl>
          </div>
          <div className="span-6">
            <h3 className="drill__h">Request</h3>
            <dl className="kv">
              <div className="kv__row"><dt>Profile</dt><dd>Maker</dd></div>
              <div className="kv__row"><dt>Modules</dt><dd>{n.modules.map((m) => moduleById.get(m)?.label).join(", ")}</dd></div>
              <div className="kv__row"><dt>Scope</dt><dd>{describeScope(n.scope).programmes} · {describeScope(n.scope).geography}</dd></div>
              <div className="kv__row"><dt>Period</dt><dd>{n.startDate} → {n.endDate ?? "open-ended"}</dd></div>
              <div className="kv__row"><dt>Nominated by</dt><dd>{userName(s, n.nominatedBy)} · {n.submittedAt ? formatDateTime(n.submittedAt) : "draft"}</dd></div>
            </dl>
          </div>
        </div>
        <div className="quote">
          <p className="quote__label">Business justification</p>
          <p>{n.justification || "—"}</p>
        </div>

        {decidable && (
          <>
            <h3 className="drill__h">Approved access (you may narrow the request)</h3>
            <MultiSelect label="Approved modules" options={n.modules.map((m) => ({ value: m, label: moduleById.get(m)!.label }))} value={modules} onChange={setModules} />
            <ScopeEditor idPrefix="rev" value={scope} onChange={setScope} authority={{ programmes: n.scope.programmes, geography: n.scope.geography }} />
            <h3 className="drill__h">Policy check</h3>
            {policy ? <PolicyMessages result={policy.ok && !policy.warnings.length ? { errors: [], warnings: ["Within policy: no conflicts found"] } : policy} /> : <p className="small muted">{existing ? `${existing.id} has no active membership in ${orgById(s, n.candidate.orgId)?.name}; one will be added on provisioning.` : "New person: the account is created as Invited; Maker access stays Pending until activation."}</p>}
            {existing?.accountStatus === "deactivated" && <PolicyMessages result={{ errors: ["Candidate account is deactivated. Reject or ask V-Guard to request reactivation first"], warnings: [] }} />}
            <TextArea label="Remarks" value={remarks} onChange={setRemarks} hint="Mandatory to reject or return; recorded in the access history" />
          </>
        )}

        {n.provisioned && (
          <PolicyMessages result={{ errors: [], warnings: [`Provisioned ${formatDateTime(n.provisioned.at)} to ${n.provisioned.userId} as ${n.provisioned.assignmentId} · access reference ${n.provisioned.accessRef}`] }} />
        )}
        <PolicyMessages result={res} />

        <h3 className="drill__h">History</h3>
        <ol className="timeline">
          {n.history.map((h, i) => (
            <li key={i}>
              <span className="timeline__dot" aria-hidden="true" />
              <span className="timeline__body">
                <NominationStatusBadge status={h.status} /> <span className="small num">{formatDateTime(h.at)}</span> · {userName(s, h.by)}
                {h.remarks && <span className="timeline__remark">{h.remarks}</span>}
              </span>
            </li>
          ))}
          {!n.history.length && <li className="muted small">Not submitted yet</li>}
        </ol>
      </div>
    </Drawer>
  );
}
