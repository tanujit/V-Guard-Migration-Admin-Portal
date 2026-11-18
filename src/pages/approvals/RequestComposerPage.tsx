import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GitBranch, Paperclip, Save, Send, Trash2, Wrench } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { PRIORITY, REQUEST_TYPES, requestTypeById } from "@/config/approvalCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { PROGRAMMES } from "@/config/programmes";
import { useToast } from "@/context/ToastContext";
import { geoCovers, getEffectiveAccess, type PolicyResult } from "@/features/access/engine";
import { canMake, currentVersion, eligibleApprovers, lastSubmittedVersion, resolveWorkflow, type RequestInput } from "@/features/approvals/engine";
import { createRequest, resubmitRequest, submitRequest, updateWorkingVersion } from "@/features/approvals/store";
import { fieldsFor } from "@/features/approvals/scenarios";
import { formatDateTime } from "@/lib/format";
import { ROLE } from "@/data/mock/rbacSeed";
import type { ApprovalRequest, Attachment, FieldChange, ImpactSummary, Priority } from "@/types/approval";
import { AccessDenied, PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { BASE, formatField, moduleLabel, Notice, useApprovalView, userLabel } from "./shared";

type Draft = {
  requestType: string;
  title: string;
  entityRef: string;
  programme: string;
  state: string;
  priority: Priority;
  fields: FieldChange[];
  purpose: string;
  reason: string;
  justification: string;
  attachments: Attachment[];
  impact: { members: string; points: string; inr: string; effective: string; operational: string };
};

const NUMERIC = new Set(["number", "points", "currency", "percent"]);

function impactOf(d: Draft["impact"]): ImpactSummary | null {
  const i: ImpactSummary = {};
  if (d.members) i.affectedMembers = Number(d.members);
  if (d.points) i.pointsImpact = Number(d.points);
  if (d.inr) i.financialImpactInr = Number(d.inr);
  if (d.effective) i.effectiveDate = d.effective;
  if (d.operational.trim()) i.operationalImpact = d.operational.trim();
  return Object.keys(i).length ? i : null;
}

function fromRequest(r: ApprovalRequest): Draft {
  const v = currentVersion(r);
  const i = r.impact ?? {};
  return {
    requestType: r.requestType,
    title: r.title,
    entityRef: r.entityRef,
    programme: r.programme ?? "",
    state: r.location?.state ?? "",
    priority: r.priority,
    fields: v.fields,
    purpose: v.purpose,
    reason: v.reason,
    justification: v.justification,
    attachments: v.attachments,
    impact: { members: i.affectedMembers?.toString() ?? "", points: i.pointsImpact?.toString() ?? "", inr: i.financialImpactInr?.toString() ?? "", effective: i.effectiveDate ?? "", operational: i.operationalImpact ?? "" },
  };
}

/**
 * Development request composer. The operational modules that will raise these requests are not
 * built yet; this screen calls the same engine entry point (submitChangeRequest) they will use.
 */
export function RequestComposerPage({ mode }: { mode: "new" | "edit" }) {
  const { requestId } = useParams();
  const view = useApprovalView();
  const { s, acc, uid, now } = view;
  const navigate = useNavigate();
  const { notify } = useToast();
  const existing = mode === "edit" ? s.requests.find((r) => r.id === requestId) : undefined;
  const makerTypes = REQUEST_TYPES.filter((t) => canMake(acc, uid, t.module, { programme: null, location: null }).ok);
  const [d, setD] = useState<Draft>(() =>
    existing
      ? fromRequest(existing)
      : { requestType: "", title: "", entityRef: "", programme: "", state: "", priority: "medium", fields: [], purpose: "", reason: "", justification: "", attachments: [], impact: { members: "", points: "", inr: "", effective: "", operational: "" } },
  );
  const location = useLocation();
  // A submission that failed after the draft was saved arrives here with its errors.
  const [res, setRes] = useState<PolicyResult | null>(() => (location.state as { result?: PolicyResult } | null)?.result ?? null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const type = requestTypeById.get(d.requestType);

  // Programmes and states the Maker profile covers for this module.
  const scope = useMemo(() => {
    if (!type) return { programmes: [] as string[], states: [] as string[] };
    const srcs = getEffectiveAccess(acc, uid).sources.filter((x) => x.effective && x.roleId === ROLE.MAKER && x.keys.includes(`${type.module}:submit`));
    const programmes = srcs.some((x) => x.scope.programmes === "all") ? PROGRAMMES.map((p) => p.code) : Array.from(new Set(srcs.flatMap((x) => (x.scope.programmes === "all" ? [] : x.scope.programmes))));
    const states = GEOGRAPHY.filter((g) => srcs.some((x) => geoCovers(x.scope.geography, { state: g.code }))).map((g) => g.code);
    return { programmes, states };
  }, [acc, uid, type]);

  const input = (): RequestInput => ({
    requestType: d.requestType,
    title: d.title.trim(),
    entityRef: d.entityRef.trim(),
    programme: d.programme || null,
    location: d.state ? { state: d.state } : null,
    amount: (() => {
      const f = d.fields.find((x) => x.material && (x.kind === "points" || x.kind === "currency") && typeof x.after === "number");
      return f && typeof f.after === "number" ? f.after - (typeof f.before === "number" ? f.before : 0) : null;
    })(),
    fields: d.fields,
    purpose: d.purpose.trim(),
    reason: d.reason.trim(),
    justification: d.justification.trim(),
    attachments: d.attachments,
    impact: impactOf(d.impact),
    priority: d.priority,
  });

  // Routing preview from the same engine the submission uses.
  const preview = useMemo(() => {
    if (!type) return null;
    const probe: ApprovalRequest = {
      ...(existing ?? ({} as ApprovalRequest)),
      id: existing?.id ?? "PREVIEW",
      requestType: type.id,
      module: type.module,
      programme: d.programme || null,
      location: d.state ? { state: d.state } : null,
      amount: null,
      makerId: uid,
      makerOrgId: acc.memberships.find((m) => m.userId === uid && m.status === "active")?.orgId ?? "",
      versions: existing?.versions ?? [{ version: 1, fields: [], purpose: "", reason: "", justification: "", attachments: [], submittedAt: null, submittedBy: uid, locked: false }],
      stages: [],
      currentStage: 0,
    } as ApprovalRequest;
    const { workflow, issue } = resolveWorkflow(s, acc, probe);
    const first = workflow?.stages[0];
    const el = first ? eligibleApprovers(s, acc, { ...probe, workflowId: workflow!.id }, first, 0, now) : null;
    return { workflow, issue, first, el };
  }, [type, d.programme, d.state, s, acc, uid, now, existing]);

  const chooseType = (id: string) => {
    const t = requestTypeById.get(id);
    if (!t) return set({ requestType: "", fields: [] });
    const values = Object.fromEntries(t.fields.map((f) => [f.key, [t.operation === "create" ? null : "", ""] as [string | null, string]]));
    set({ requestType: id, fields: fieldsFor(id, values), programme: "", state: "" });
  };
  const setField = (key: string, side: "before" | "after", raw: string) => {
    set({
      fields: d.fields.map((f) => {
        if (f.key !== key) return f;
        const value = raw === "" ? (side === "before" && type?.operation === "create" ? null : "") : NUMERIC.has(f.kind) && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
        return { ...f, [side]: value };
      }),
    });
  };
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const added: Attachment[] = Array.from(files).map((f, i) => ({ id: `ATT-${Date.now().toString(36)}-${i}`, name: f.name, type: (f.name.split(".").pop() ?? "file").toUpperCase(), sizeKb: Math.max(1, Math.round(f.size / 1024)), uploadedBy: uid, uploadedAt: now }));
    set({ attachments: [...d.attachments, ...added] });
  };

  const save = (submit: boolean) => {
    if (!type) {
      setRes({ ok: false, errors: ["Choose a request type"], warnings: [] });
      return;
    }
    if (!existing) {
      const out = createRequest(uid, input(), submit);
      if (out.id && (out.ok || submit)) {
        notify(out.ok ? (submit ? `${out.id} submitted` : `${out.id} saved as draft`) : `${out.id} saved as draft; not submitted`, out.ok ? "positive" : "info");
        if (out.ok) navigate(`${BASE}/request/${out.id}`);
        else navigate(`${BASE}/request/${out.id}/edit`, { replace: true, state: { result: out } });
        return;
      }
      setRes(out);
      return;
    }
    const i = input();
    const up = updateWorkingVersion(uid, existing.id, { title: i.title, fields: i.fields, purpose: i.purpose, reason: i.reason, justification: i.justification, attachments: i.attachments, amount: i.amount, impact: i.impact });
    if (!up.ok) return setRes(up);
    if (!submit) {
      notify(`${existing.id} saved`, "positive");
      setRes(null);
      return;
    }
    const out = existing.status === "returned" ? resubmitRequest(uid, existing.id) : submitRequest(uid, existing.id);
    if (!out.ok) return setRes(out);
    notify(`${existing.id} ${existing.status === "returned" ? "resubmitted" : "submitted"}`, "positive");
    navigate(`${BASE}/request/${existing.id}`);
  };

  if (mode === "edit" && !existing) return <AccessDenied message={`Request ${requestId} was not found.`} />;
  if (existing && (existing.makerId !== uid || !["draft", "returned"].includes(existing.status))) return <AccessDenied message="Only the Maker can edit a draft or a request returned for correction. Submitted versions are read-only." />;
  if (mode === "new" && makerTypes.length === 0) return <AccessDenied message="Raising requests needs an active Maker profile with Submit on at least one module. Ask your administrator to nominate you as a Maker." />;

  const prev = existing?.status === "returned" ? lastSubmittedVersion(existing) : null;
  const lastReturn = existing ? [...existing.stages].reverse().find((x) => x.decision === "returned") : undefined;

  return (
    <div className="composer">
      <Link to={existing ? `${BASE}/request/${existing.id}` : BASE} className="back-link">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
        {existing ? existing.id : "Approval inbox"}
      </Link>
      <SectionTitle
        title={existing ? (existing.status === "returned" ? `Correct and resubmit ${existing.id}` : `Edit draft ${existing.id}`) : "New approval request"}
        description={existing?.status === "returned" ? `You are editing version ${currentVersion(existing).version}. Version ${prev?.version} stays read-only in the history` : "Development composer: calls the same submission entry point the operational modules will use"}
      />
      <Notice tone="info" icon={<Wrench size={16} strokeWidth={2} aria-hidden="true" />}>
        The Wallet, Scheme Builder, Member and other modules are not built yet. Values entered here are demo data; approving them changes nothing in any V-Guard system.
      </Notice>
      {lastReturn && existing?.status === "returned" && (
        <Notice tone="warn">
          <strong>Returned by {userLabel(acc, lastReturn.decidedBy)} on {lastReturn.decidedAt ? formatDateTime(lastReturn.decidedAt) : ""}:</strong> {lastReturn.remarks}
        </Notice>
      )}

      <div className="req__grid">
        <div className="req__main">
          <Panel title="Request" level={3}>
            <div className="form-grid form-grid--2">
              <SelectInput label="Request type" required value={d.requestType} onChange={chooseType} disabled={!!existing} options={[{ value: "", label: "Choose a type" }, ...makerTypes.map((t) => ({ value: t.id, label: `${t.label} · ${moduleLabel(t.module)}` }))]} hint={existing ? "Fixed after creation" : "Only modules where you hold a Maker profile"} />
              <SelectInput label="Priority" value={d.priority} onChange={(v) => set({ priority: v as Priority })} options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label }))} />
              <TextField label="Title" required value={d.title} onChange={(v) => set({ title: v })} placeholder="What changes, in a few words" />
              <TextField label="Record reference" required value={d.entityRef} onChange={(v) => set({ entityRef: v })} disabled={!!existing} placeholder="e.g. SCH-EP-KA-0412" hint="Masked where it identifies a member" />
              <SelectInput label="Programme" value={d.programme} onChange={(v) => set({ programme: v })} disabled={!type || !!existing} options={[{ value: "", label: "Not programme-specific" }, ...scope.programmes.map((p) => ({ value: p, label: p }))]} hint="Limited to your Maker scope" />
              <SelectInput label="State" value={d.state} onChange={(v) => set({ state: v })} disabled={!type || !!existing} options={[{ value: "", label: "Not location-bound" }, ...scope.states.map((c) => ({ value: c, label: GEOGRAPHY.find((g) => g.code === c)?.name ?? c }))]} />
            </div>
          </Panel>

          {type && (
            <Panel title="Proposed change" level={3} subtitle={type.operation === "create" ? "New record: current values are empty" : "Enter the current value from the record and the proposed value"}>
              <div className="table-wrap">
                <table className="table compare compare--edit">
                  <caption className="sr-only">Field values</caption>
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Current</th>
                      <th scope="col">Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.fields.map((f) => {
                      const was = prev?.fields.find((p) => p.key === f.key);
                      return (
                        <tr key={f.key} className={f.material ? "is-material" : ""}>
                          <th scope="row">
                            {f.label}
                            {f.material && <span className="material-tag">Material</span>}
                          </th>
                          <td>
                            <input className="input" aria-label={`${f.label}, current value`} type={NUMERIC.has(f.kind) ? "number" : f.kind === "date" ? "date" : "text"} value={f.before ?? ""} disabled={type.operation === "create" || !!existing} onChange={(e) => setField(f.key, "before", e.target.value)} />
                          </td>
                          <td>
                            <input className="input" aria-label={`${f.label}, proposed value`} type={NUMERIC.has(f.kind) ? "number" : f.kind === "date" ? "date" : "text"} value={f.after ?? ""} onChange={(e) => setField(f.key, "after", e.target.value)} />
                            {was && was.after !== f.after && <span className="compare__was">v{prev!.version}: {formatField(f, was.after)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel title="Reason and evidence" level={3}>
            <div className="form-grid">
              <TextArea label="Business purpose" required value={d.purpose} onChange={(v) => set({ purpose: v })} rows={2} />
              <TextArea label="Reason" required value={d.reason} onChange={(v) => set({ reason: v })} rows={2} hint="Mandatory for financial and member-status requests. Shown to the Checker and kept in the audit" />
              <TextArea label="Supporting justification" value={d.justification} onChange={(v) => set({ justification: v })} rows={2} />
              <div className="field">
                <span className="field__label">Attachments</span>
                <label className="btn btn--secondary btn--sm file-btn">
                  <Paperclip size={14} strokeWidth={2} aria-hidden="true" />
                  Add file
                  <input type="file" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
                </label>
                <span className="field__hint">Only the file name and size are recorded. No file content is stored or uploaded in this phase</span>
                {d.attachments.length > 0 && (
                  <ul className="attach-list">
                    {d.attachments.map((a) => (
                      <li key={a.id} className="attach">
                        <Paperclip size={14} strokeWidth={2} aria-hidden="true" />
                        <span className="attach__name">{a.name}</span>
                        <span className="small muted num">{a.sizeKb} KB</span>
                        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove ${a.name}`} onClick={() => set({ attachments: d.attachments.filter((x) => x.id !== a.id) })}>
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Business impact" level={3} subtitle="Optional. Leave blank when not known; the Checker sees “Not available”">
            <div className="form-grid form-grid--3">
              <TextField label="Members affected" type="number" value={d.impact.members} onChange={(v) => set({ impact: { ...d.impact, members: v } })} />
              <TextField label="Points impact" type="number" value={d.impact.points} onChange={(v) => set({ impact: { ...d.impact, points: v } })} />
              <TextField label="Financial impact (₹)" type="number" value={d.impact.inr} onChange={(v) => set({ impact: { ...d.impact, inr: v } })} />
              <TextField label="Effective date" type="date" value={d.impact.effective} onChange={(v) => set({ impact: { ...d.impact, effective: v } })} />
              <TextField label="Operational impact" value={d.impact.operational} onChange={(v) => set({ impact: { ...d.impact, operational: v } })} />
            </div>
          </Panel>
        </div>

        <aside className="req__side">
          <Panel title="Routing preview" level={3} subtitle="Evaluated live from workflows and Checker access">
            {!preview ? (
              <p className="muted small">Choose a request type to see where it will go.</p>
            ) : preview.workflow ? (
              <>
                <p className="route__name">
                  <GitBranch size={14} strokeWidth={2} aria-hidden="true" /> {preview.workflow.code} · {preview.workflow.stages.length} stage{preview.workflow.stages.length > 1 ? "s" : ""}
                </p>
                <ol className="route">
                  {preview.workflow.stages.map((st, i) => (
                    <li key={st.id} className="route__stage">
                      <p className="small">
                        {i + 1}. {st.name}
                      </p>
                      {i === 0 && preview.el && <p className="small muted">Eligible: {preview.el.eligible.length ? preview.el.eligible.map((e) => userLabel(acc, e.userId)).join(", ") : "nobody — the request will wait in Pending assignment"}</p>}
                    </li>
                  ))}
                </ol>
                <p className="small muted">You are always excluded from approving your own request.</p>
              </>
            ) : (
              <Notice tone="warn">{preview.issue?.message}. If you submit, the request waits in Pending assignment and nothing is approved.</Notice>
            )}
          </Panel>
          <Panel title={existing?.status === "returned" ? "Resubmit" : "Submit"} level={3}>
            <PolicyMessages result={res} title="Not submitted" warnTitle="Submitted, note" />
            <div className="btn-col">
              <button type="button" className="btn btn--primary" onClick={() => save(true)}>
                <Send size={16} strokeWidth={2} aria-hidden="true" />
                {existing?.status === "returned" ? `Resubmit version ${currentVersion(existing).version}` : "Submit for approval"}
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => save(false)}>
                <Save size={16} strokeWidth={2} aria-hidden="true" />
                {existing ? "Save changes" : "Save as draft"}
              </button>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
