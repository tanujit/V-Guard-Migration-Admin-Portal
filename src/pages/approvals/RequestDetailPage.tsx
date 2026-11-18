import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Check, CheckCircle2, Circle, Clock3, Eye, GitBranch, Lock, Paperclip, PencilLine, PlayCircle, RefreshCw, RotateCcw, Send, ShieldAlert, Undo2, UserCheck, X } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { ProgrammeTag, StatusBadge } from "@/components/ui/primitives";
import { TextArea } from "@/components/form/Form";
import { DECIDABLE, PENDING } from "@/config/approvalCatalogue";
import { useToast } from "@/context/ToastContext";
import type { PolicyResult } from "@/features/access/engine";
import { ageHours, canDecide, canOperateExecution, canViewRequest, currentRun, currentVersion, eligibleApprovers, fieldsChanged, formatAge, hoursBetween, isOverdue, policyFor, stageAgeHours, stageDef, wfById, type DecisionAction } from "@/features/approvals/engine";
import { ensureExecutionHandler, getAdapter } from "@/features/approvals/execution";
import { approvalStore, attemptOverride, decideRequest, markViewed, rerouteRequest, runExecution, submitRequest, withdrawRequest } from "@/features/approvals/store";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import type { ApprovalRequest, FieldChange, RequestVersion } from "@/types/approval";
import { AccessDenied, PolicyMessages, ReasonDialog } from "@/pages/users/shared";
import { ApprovalStatusBadge, BASE, ExecutionBadge, formatField, locationLabel, moduleLabel, Notice, orgLabel, PriorityTag, typeLabel, useApprovalView, userLabel, type ApprovalView } from "./shared";

export function RequestDetailPage() {
  const { requestId = "" } = useParams();
  const view = useApprovalView();
  const { s, acc, uid } = view;
  const r = s.requests.find((x) => x.id === requestId);
  const [openedSeq, setOpenedSeq] = useState<number | null>(null);

  // Opening the request counts as "viewed" for an assigned approver; the concurrency token is taken after that.
  useEffect(() => {
    if (!r) return;
    markViewed(uid, r.id);
    setOpenedSeq(approvalStore.get().requests.find((x) => x.id === r.id)?.seq ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, uid]);

  if (!r) return <AccessDenied message={`Request ${requestId} does not exist or is not visible to you.`} />;
  const vis = canViewRequest(s, acc, uid, r);
  if (!vis.ok) return <AccessDenied message={vis.errors[0]} />;

  return (
    <div className="req">
      <Link to={BASE} className="back-link">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
        Approval inbox
      </Link>
      <RequestHeader r={r} view={view} />
      <div className="req__grid">
        <div className="req__main">
          <Summary r={r} view={view} />
          <Comparison r={r} />
          <Impact r={r} />
          <Attachments r={r} view={view} />
          <HistoryPanel r={r} view={view} />
        </div>
        <aside className="req__side">
          <DecisionPanel r={r} view={view} openedSeq={openedSeq} onReload={() => setOpenedSeq(r.seq)} />
          <MakerPanel r={r} view={view} />
          <RoutingPanel r={r} view={view} />
          <ExecutionPanel r={r} view={view} />
          <AdminPanel r={r} view={view} />
        </aside>
      </div>
    </div>
  );
}

/* ---------------- A. Header and stage timeline ---------------- */

function RequestHeader({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const { acc, now } = view;
  const run = currentRun(r);
  const over = isOverdue(r, now);
  const steps: { label: string; sub: string; state: "done" | "current" | "todo" | "bad" }[] = [
    { label: "Submitted", sub: r.submittedAt ? formatDateTime(r.submittedAt) : "Draft", state: r.submittedAt ? "done" : "current" },
    ...r.stages.map((st, i) => ({
      label: st.name,
      sub: st.decidedBy ? `${st.decision === "approved" ? "Approved" : st.decision === "rejected" ? "Rejected" : "Returned"} by ${userLabel(acc, st.decidedBy)}` : st.status === "active" ? (r.status === "pending_assignment" ? "No eligible approver" : `With ${st.assignedTo.length} approver${st.assignedTo.length === 1 ? "" : "s"}`) : `Stage ${i + 1}`,
      state: st.decision === "approved" ? ("done" as const) : st.decision === "rejected" || st.decision === "returned" ? ("bad" as const) : st.status === "active" ? ("current" as const) : ("todo" as const),
    })),
    { label: "Approved", sub: r.status === "approved" ? formatDateTime(r.completedAt!) : r.status === "rejected" ? "Rejected" : r.status === "withdrawn" ? "Withdrawn" : "Pending", state: r.status === "approved" ? "done" : ["rejected", "withdrawn"].includes(r.status) ? "bad" : "todo" },
    { label: "Executed", sub: r.execution.status === "executed" ? "Applied (mock)" : r.execution.status === "failed" ? "Failed" : r.status === "approved" ? "Awaiting" : "—", state: r.execution.status === "executed" ? "done" : r.execution.status === "failed" ? "bad" : r.status === "approved" ? "current" : "todo" },
  ];
  if (!r.stages.length && r.status !== "draft") steps.splice(1, 0, { label: "Routing", sub: r.routingIssue ? "Exception" : "—", state: r.routingIssue ? "bad" : "todo" });
  return (
    <section className="req-head panel" aria-labelledby="req-title">
      <div className="req-head__top">
        <div>
          <p className="req-head__id mono">{r.id} · v{currentVersion(r).version}</p>
          <h2 id="req-title" className="req-head__title">{r.title}</h2>
          <p className="req-head__type">
            {typeLabel(r.requestType)} · {moduleLabel(r.module)} · {r.operation === "transaction" ? "Transaction" : r.operation === "create" ? "Create" : "Modify"}
          </p>
        </div>
        <div className="req-head__badges">
          <ApprovalStatusBadge status={r.status} />
          {r.execution.status !== "not_applicable" && <ExecutionBadge status={r.execution.status} />}
          <PriorityTag priority={r.priority} />
          {over && <StatusBadge tone="negative">Overdue</StatusBadge>}
        </div>
      </div>
      <dl className="req-head__facts">
        <div>
          <dt>Programme</dt>
          <dd>{r.programme ? <ProgrammeTag code={r.programme} size="sm" /> : "All programmes"}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{locationLabel(r.location)}</dd>
        </div>
        <div>
          <dt>Maker</dt>
          <dd>
            {userLabel(acc, r.makerId)} <span className="muted small">· {orgLabel(acc, r.makerOrgId)}</span>
          </dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd className="num">{r.submittedAt ? formatDateTime(r.submittedAt) : "Not submitted"}</dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd className="num">{r.submittedAt ? formatAge(ageHours(r, now)) : "—"}</dd>
        </div>
        <div>
          <dt>Current stage</dt>
          <dd>{run && PENDING.includes(r.status) ? `${run.name} (${r.currentStage + 1}/${r.stages.length})` : "—"}</dd>
        </div>
        <div>
          <dt>At this stage</dt>
          <dd className="num">{run?.activatedAt && PENDING.includes(r.status) ? formatAge(stageAgeHours(r, now)) : "—"}</dd>
        </div>
        <div>
          <dt>{!PENDING.includes(r.status) && r.completedAt ? "Total turnaround" : over ? "Overdue by" : "SLA remaining"}</dt>
          <dd className={`num ${over ? "neg" : ""}`} title={run?.dueAt ? `Due ${formatDateTime(run.dueAt)}` : undefined}>
            {run?.dueAt && PENDING.includes(r.status) ? (hoursBetween(now, run.dueAt) >= 0 ? `${formatAge(hoursBetween(now, run.dueAt))} · due ${formatDateTime(run.dueAt)}` : formatAge(hoursBetween(run.dueAt, now))) : r.completedAt && r.submittedAt ? formatAge(ageHours(r, now)) : "No SLA configured"}
          </dd>
        </div>
      </dl>
      <ol className="timeline" aria-label="Approval progress">
        {steps.map((st, i) => (
          <li key={`${st.label}-${i}`} className={`timeline__step timeline__step--${st.state}`} aria-current={st.state === "current" ? "step" : undefined}>
            <span className="timeline__dot" aria-hidden="true">
              {st.state === "done" ? <Check size={12} strokeWidth={3} /> : st.state === "bad" ? <X size={12} strokeWidth={3} /> : st.state === "current" ? <Clock3 size={12} strokeWidth={2.5} /> : <Circle size={8} strokeWidth={3} />}
            </span>
            <span className="timeline__label">{st.label}</span>
            <span className="timeline__sub">{st.sub}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------- B. Summary ---------------- */

function Summary({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const v = currentVersion(r);
  const policy = policyFor(view.s, r.requestType);
  return (
    <Panel title="Request summary" level={3} subtitle={`Version ${v.version}${v.locked ? ` · submitted ${v.submittedAt ? formatDateTime(v.submittedAt) : ""}` : " · working copy, not yet submitted"}`}>
      <dl className="kv kv--wide">
        <div className="kv__row">
          <dt>Description</dt>
          <dd>{r.title}</dd>
        </div>
        <div className="kv__row">
          <dt>Impacted record</dt>
          <dd className="mono small">{r.entityRef}</dd>
        </div>
        <div className="kv__row">
          <dt>Requesting programme</dt>
          <dd>{r.programme ?? "Not programme-specific"}</dd>
        </div>
        <div className="kv__row">
          <dt>Geographical scope</dt>
          <dd>{locationLabel(r.location)}</dd>
        </div>
        <div className="kv__row">
          <dt>Business purpose</dt>
          <dd>{v.purpose || <span className="muted">Not given</span>}</dd>
        </div>
        <div className="kv__row">
          <dt>Reason</dt>
          <dd>{v.reason || <span className="muted">Not given</span>}</dd>
        </div>
        <div className="kv__row">
          <dt>Justification</dt>
          <dd>{v.justification || <span className="muted">None</span>}</dd>
        </div>
        {r.amount !== null && (
          <div className="kv__row">
            <dt>Amount</dt>
            <dd className="num">{formatCount(r.amount)} {["wallet", "redemption", "points-adjustment", "points-reversal", "points-transfer", "gift-redemption", "tds"].includes(r.module) ? "pts" : ""}</dd>
          </div>
        )}
        <div className="kv__row">
          <dt>Approval policy</dt>
          <dd>
            {policy ? (
              <>
                <StatusBadge tone={policy.requirement === "required" ? "positive" : policy.requirement === "confirmation_required" ? "warning" : "neutral"}>
                  {policy.requirement === "required" ? "Approval required" : policy.requirement === "confirmation_required" ? "Business confirmation required" : "Approval not required"}
                </StatusBadge>{" "}
                <span className="muted small">{policy.note}</span>
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/* ---------------- C. Before / after comparison, with version comparison ---------------- */

function Comparison({ r }: { r: ApprovalRequest }) {
  const versions = r.versions;
  const [sel, setSel] = useState(versions.length);
  useEffect(() => setSel(versions.length), [versions.length]);
  const v: RequestVersion = versions[sel - 1] ?? versions[versions.length - 1];
  const prev = sel > 1 ? versions[sel - 2] : null;
  const changedSincePrev = prev ? new Set(fieldsChanged(prev.fields, v.fields)) : new Set<string>();
  const [showAll, setShowAll] = useState(false);
  const changed = v.fields.filter((f) => f.before !== f.after);
  const shown = showAll ? v.fields : changed;
  return (
    <Panel
      title="Proposed change"
      level={3}
      subtitle={r.operation === "create" ? "New record: there is no current value" : "Current value against the proposed value"}
      actions={
        versions.length > 1 && (
          <div className="version-pick" role="group" aria-label="Version">
            {versions.map((x) => (
              <button key={x.version} type="button" className={`version-pick__btn ${x.version === sel ? "is-on" : ""}`} onClick={() => setSel(x.version)} aria-pressed={x.version === sel}>
                v{x.version}
                {!x.locked && <span className="sr-only"> working copy</span>}
              </button>
            ))}
          </div>
        )
      }
    >
      {prev && changedSincePrev.size > 0 && (
        <p className="small muted compare-note">
          <RefreshCw size={12} strokeWidth={2} aria-hidden="true" /> {changedSincePrev.size} field{changedSincePrev.size > 1 ? "s" : ""} changed since version {prev.version}
          {JSON.stringify(prev.attachments) !== JSON.stringify(v.attachments) ? ", attachments updated" : ""}
          {prev.justification !== v.justification ? ", justification updated" : ""}
        </p>
      )}
      <div className="table-wrap">
        <table className="table compare">
          <caption className="sr-only">Before and after values, version {v.version}</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Current</th>
              <th scope="col">Proposed</th>
              <th scope="col" className="ta-r">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <CompareRow key={f.key} f={f} changedSincePrev={changedSincePrev.has(f.key)} prevAfter={prev?.fields.find((p) => p.key === f.key)?.after} />
            ))}
          </tbody>
        </table>
      </div>
      {v.fields.length > changed.length && (
        <button type="button" className="btn btn--ghost btn--sm compare-toggle" onClick={() => setShowAll((x) => !x)} aria-expanded={showAll}>
          {showAll ? `Show changed fields only (${changed.length})` : `Show all fields (${v.fields.length - changed.length} unchanged)`}
        </button>
      )}
    </Panel>
  );
}

function CompareRow({ f, changedSincePrev, prevAfter }: { f: FieldChange; changedSincePrev: boolean; prevAfter?: string | number | null }) {
  const changed = f.before !== f.after;
  const delta = typeof f.before === "number" && typeof f.after === "number" ? f.after - f.before : null;
  const kind = !changed ? null : f.before === null || f.before === "" ? "Added" : f.after === null || f.after === "" ? "Removed" : "Modified";
  return (
    <tr className={`${changed ? "is-changed" : ""} ${f.material && changed ? "is-material" : ""}`}>
      <th scope="row">
        {f.label}
        {kind && <span className={`change-kind change-kind--${kind.toLowerCase()}`}>{kind}</span>}
        {f.material && changed && <span className="material-tag">Material</span>}
      </th>
      <td className="compare__before">{formatField(f, f.before)}</td>
      <td className="compare__after">
        {formatField(f, f.after)}
        {changedSincePrev && <span className="compare__was">was {formatField(f, prevAfter ?? null)} in the previous version</span>}
      </td>
      <td className="ta-r num">
        {!changed ? <span className="muted small">Unchanged</span> : delta !== null ? <span className={delta < 0 ? "neg" : "pos"}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{f.kind === "currency" ? formatInr(Math.abs(delta)) : formatCount(Math.abs(Math.round(delta * 100) / 100))}</span> : <span className="small">Changed</span>}
      </td>
    </tr>
  );
}

/* ---------------- D. Business impact ---------------- */

function Impact({ r }: { r: ApprovalRequest }) {
  const i = r.impact;
  const rows: [string, string][] = i
    ? ([
        ["Members affected", i.affectedMembers !== undefined ? formatCount(i.affectedMembers) : ""],
        ["Programmes", i.affectedProgrammes?.join(", ") ?? ""],
        ["Branches", i.affectedBranches?.join(", ") ?? ""],
        ["Points impact", i.pointsImpact !== undefined ? `${i.pointsImpact > 0 ? "+" : i.pointsImpact < 0 ? "−" : ""}${formatCount(Math.abs(i.pointsImpact))} pts` : ""],
        ["Financial impact", i.financialImpactInr !== undefined ? `${i.financialImpactInr < 0 ? "−" : ""}${formatInr(Math.abs(i.financialImpactInr))}` : ""],
        ["Scheme impact", i.schemeImpact ?? ""],
        ["Operational impact", i.operationalImpact ?? ""],
        ["Effective date", i.effectiveDate ? formatDateTime(i.effectiveDate) : ""],
        ["Dependencies", i.dependencies?.join(", ") ?? ""],
      ].filter(([, v]) => v) as [string, string][])
    : [];
  return (
    <Panel title="Business impact" level={3} subtitle="Supplied by the originating module (development estimates)">
      {rows.length === 0 ? (
        <p className="muted">Not available for this request. The originating module did not supply an impact summary.</p>
      ) : (
        <dl className="impact">
          {rows.map(([k, v]) => (
            <div key={k} className="impact__item">
              <dt>{k}</dt>
              <dd className={k.includes("impact") && v.startsWith("−") ? "neg" : ""}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

/* ---------------- E. Attachments ---------------- */

function Attachments({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const all = r.versions.flatMap((v) => v.attachments.map((a) => ({ ...a, version: v.version })));
  const unique = all.filter((a, i) => all.findIndex((x) => x.id === a.id) === i);
  return (
    <Panel title="Attachments" level={3} subtitle="Metadata only. Mock attachments have no stored file, so preview and download are unavailable">
      {unique.length === 0 ? (
        <p className="muted">No attachments.</p>
      ) : (
        <ul className="attach-list">
          {unique.map((a) => (
            <li key={a.id} className="attach">
              <Paperclip size={16} strokeWidth={2} aria-hidden="true" />
              <span className="attach__name">{a.name}</span>
              <span className="attach__meta small muted num">
                {a.type} · {a.sizeKb} KB · v{a.version} · {userLabel(view.acc, a.uploadedBy)} · {formatDateTime(a.uploadedAt)}
              </span>
              <span className="attach__state small muted">
                <Lock size={12} strokeWidth={2} aria-hidden="true" /> No file stored
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------- F. History and audit ---------------- */

function HistoryPanel({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const [tab, setTab] = useState<"history" | "audit">("history");
  const audit = view.s.audit.filter((e) => e.requestId === r.id);
  return (
    <Panel
      title="History"
      level={3}
      subtitle="Append-only. Entries cannot be edited or deleted"
      actions={
        <div className="version-pick" role="group" aria-label="History view">
          <button type="button" className={`version-pick__btn ${tab === "history" ? "is-on" : ""}`} aria-pressed={tab === "history"} onClick={() => setTab("history")}>
            Timeline
          </button>
          <button type="button" className={`version-pick__btn ${tab === "audit" ? "is-on" : ""}`} aria-pressed={tab === "audit"} onClick={() => setTab("audit")}>
            Audit events · {audit.length}
          </button>
        </div>
      }
    >
      {tab === "history" ? (
        <ol className="hist">
          {[...r.history].reverse().map((h) => (
            <li key={h.id} className="hist__item">
              <span className="hist__time small num muted">{formatDateTime(h.at)}</span>
              <span className="hist__body">
                <span className="hist__action">{h.action}</span>
                <span className="small muted">
                  {userLabel(view.acc, h.userId)}
                  {h.orgId ? ` · ${orgLabel(view.acc, h.orgId)}` : ""} · v{h.version}
                  {h.stage ? ` · ${h.stage}` : ""}
                </span>
                {h.remarks && <span className="hist__remark">{h.remarks}</span>}
              </span>
              <span className="mono small muted hist__ref">{h.ref}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="table-wrap">
          <table className="table audit-mini">
            <caption className="sr-only">Audit events for {r.id}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Event</th>
                <th scope="col">Actor</th>
                <th scope="col">Status</th>
                <th scope="col">Details</th>
                <th scope="col">Ref</th>
              </tr>
            </thead>
            <tbody>
              {[...audit].reverse().map((e) => (
                <tr key={e.id} className={e.action === "decision.blocked" || e.override ? "is-blocked" : ""}>
                  <td className="num small">{formatDateTime(e.at)}</td>
                  <td className="mono small">{e.action}</td>
                  <td className="small">
                    {userLabel(view.acc, e.actorUserId)}
                    <span className="cell-2__sub">{e.actorProfile}</span>
                  </td>
                  <td className="small">{e.previousStatus || e.newStatus ? `${e.previousStatus ?? "—"} → ${e.newStatus ?? "—"}` : "—"}</td>
                  <td className="small">{[e.stage, e.newValue, e.remarks].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="mono small muted">{e.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- G. Decision ---------------- */

const ACTION_COPY: Record<DecisionAction, { label: string; verb: string; tone: "default" | "danger"; icon: typeof Check }> = {
  approve: { label: "Approve", verb: "Approve", tone: "default", icon: CheckCircle2 },
  return: { label: "Return for correction", verb: "Return", tone: "default", icon: Undo2 },
  reject: { label: "Reject", verb: "Reject", tone: "danger", icon: Ban },
};

function DecisionPanel({ r, view, openedSeq, onReload }: { r: ApprovalRequest; view: ApprovalView; openedSeq: number | null; onReload: () => void }) {
  const { s, acc, uid, now } = view;
  const { notify } = useToast();
  const [remarks, setRemarks] = useState("");
  const [confirm, setConfirm] = useState<DecisionAction | null>(null);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const may = useMemo(() => canDecide(s, acc, uid, r, "approve", now), [s, acc, uid, r, now]);
  const wf = wfById(s, r.workflowId);
  const def = stageDef(s, r);
  useEffect(() => {
    setRemarks("");
    setRes(null);
  }, [r.id, uid]);

  if (!DECIDABLE.includes(r.status)) return null;
  const isMaker = r.makerId === uid;
  if (!may.ok) {
    return (
      <Panel title="Decision" level={3}>
        <p className="apr-decision__locked">
          <Eye size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            You can view this request. {isMaker ? "You submitted it, so you cannot approve, reject or return it." : may.errors[0]}
          </span>
        </p>
      </Panel>
    );
  }
  const stale = openedSeq !== null && openedSeq !== r.seq;
  const doDecide = async (action: DecisionAction) => {
    // Load the originating module's store first so its execution handler runs on final approval.
    await ensureExecutionHandler(r.module);
    const out = decideRequest(uid, r.id, action, remarks, openedSeq ?? r.seq);
    setConfirm(null);
    if (!out.ok) {
      setRes(out);
      return;
    }
    notify(`${r.id} ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned to the Maker"}`, action === "reject" ? "negative" : "positive");
    setRes(out.warnings.length ? out : null);
    setRemarks("");
    onReload();
  };
  return (
    <Panel title="Your decision" level={3} subtitle={`${def?.name ?? "Current stage"} · stage ${r.currentStage + 1} of ${r.stages.length}`} className="apr-decision">
      {stale && (
        <Notice tone="warn" action={<button type="button" className="btn btn--secondary btn--sm" onClick={onReload}>Reload</button>}>
          This request changed after you opened it. Review the latest version before deciding.
        </Notice>
      )}
      <p className="small muted apr-decision__basis">
        <UserCheck size={14} strokeWidth={2} aria-hidden="true" /> Eligible through your Checker profile with Approve on {moduleLabel(r.module)}
        {wf ? ` · workflow ${wf.code}` : ""}
      </p>
      <TextArea label="Remarks" value={remarks} onChange={setRemarks} rows={4} required={def?.remarksOnApprove === "required"} hint={`Required to reject or return${def?.remarksOnApprove === "required" ? ", and to approve at this stage" : ""}. Recorded against version ${currentVersion(r).version}`} />
      <PolicyMessages result={res} title="Decision not recorded" warnTitle="Recorded, note" />
      <div className="apr-decision__actions">
        {(["approve", "return", "reject"] as DecisionAction[]).filter((a) => a !== "return" || wf?.policy.allowReturn).map((a) => {
          const c = ACTION_COPY[a];
          return (
            <button key={a} type="button" className={`btn ${a === "approve" ? "btn--primary" : a === "reject" ? "btn--danger" : "btn--secondary"}`} onClick={() => setConfirm(a)} disabled={stale}>
              <c.icon size={16} strokeWidth={2} aria-hidden="true" />
              {c.label}
            </button>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!confirm}
        title={confirm ? `${ACTION_COPY[confirm].verb} ${r.id}?` : ""}
        tone={confirm ? ACTION_COPY[confirm].tone : "default"}
        confirmLabel={confirm ? ACTION_COPY[confirm].label : ""}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && doDecide(confirm)}
        body={
          confirm && (
            <div className="reason-dialog">
              <p>
                {confirm === "approve"
                  ? r.currentStage + 1 < r.stages.length
                    ? `This approves ${def?.name}. The request then moves to stage ${r.currentStage + 2}: ${r.stages[r.currentStage + 1]?.name}.`
                    : "This is the final required stage. The request becomes Approved and is handed to execution. Approval does not mean it has been applied."
                  : confirm === "reject"
                    ? "Rejection is final. The request will not be executed. The Maker can raise a new request if the workflow allows it."
                    : `The request goes back to ${userLabel(acc, r.makerId)}, who edits a new version and resubmits. The submitted version stays read-only.`}
              </p>
              <p className="small">
                <strong>Remarks:</strong> {remarks.trim() || <span className="muted">none</span>}
              </p>
            </div>
          )
        }
      />
    </Panel>
  );
}

/* ---------------- Maker actions ---------------- */

function MakerPanel({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const { uid, admin } = view;
  const { notify } = useToast();
  const navigate = useNavigate();
  const [withdraw, setWithdraw] = useState(false);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const isMaker = r.makerId === uid;
  if (!isMaker && !admin) return null;
  const decisionStarted = r.stages.some((x) => x.decision === "approved") || ["under_review", "partially_approved"].includes(r.status);
  const canWithdraw = ["pending_assignment", "pending_approval", "returned", "escalated"].includes(r.status) && !decisionStarted;
  const returned = r.status === "returned";
  const draft = r.status === "draft";
  if (!isMaker && !canWithdraw) return null;
  if (isMaker && !draft && !returned && !canWithdraw) return null;
  const lastReturn = [...r.stages].reverse().find((x) => x.decision === "returned");
  return (
    <Panel title={isMaker ? "Your request" : "Administrator actions"} level={3}>
      {returned && lastReturn && isMaker && (
        <Notice tone="warn" icon={<Undo2 size={16} strokeWidth={2} aria-hidden="true" />}>
          <strong>Returned by {userLabel(view.acc, lastReturn.decidedBy)}:</strong> {lastReturn.remarks}
        </Notice>
      )}
      <PolicyMessages result={res} />
      <div className="btn-col">
        {isMaker && (draft || returned) && (
          <Link to={`${BASE}/request/${r.id}/edit`} className="btn btn--primary">
            <PencilLine size={16} strokeWidth={2} aria-hidden="true" />
            {returned ? `Edit version ${currentVersion(r).version} and resubmit` : "Edit draft"}
          </Link>
        )}
        {isMaker && draft && (
          <button
            type="button"
            className="btn btn--dark"
            onClick={() => {
              const out = submitRequest(uid, r.id);
              setRes(out.ok && !out.warnings.length ? null : out);
              if (out.ok) notify(`${r.id} submitted`, "positive");
            }}
          >
            <Send size={16} strokeWidth={2} aria-hidden="true" />
            Submit for approval
          </button>
        )}
        {canWithdraw && (
          <button type="button" className="btn btn--secondary" onClick={() => setWithdraw(true)}>
            <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
            Withdraw request
          </button>
        )}
      </div>
      {!canWithdraw && decisionStarted && isMaker && <p className="small muted">A Checker decision has started, so the request can no longer be withdrawn.</p>}
      <ReasonDialog
        open={withdraw}
        title={`Withdraw ${r.id}`}
        confirmLabel="Withdraw"
        tone="danger"
        body="Withdrawn requests are closed and never executed. The history is kept."
        onClose={() => setWithdraw(false)}
        onConfirm={(reason) => {
          const out = withdrawRequest(uid, r.id, reason);
          if (out.ok) {
            notify(`${r.id} withdrawn`, "positive");
            navigate(`${BASE}/request/${r.id}`);
          }
          return out;
        }}
      />
    </Panel>
  );
}

/* ---------------- Routing (workflow, eligible and excluded approvers) ---------------- */

function RoutingPanel({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const { s, acc, admin, now } = view;
  const wf = wfById(s, r.workflowId);
  if (r.status === "draft") return null;
  return (
    <Panel title="Routing" level={3} subtitle={wf ? `${wf.code} · ${wf.name}` : "No workflow selected"}>
      {r.routingIssue && (
        <Notice tone="danger" icon={<ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />}>
          <strong>{r.routingIssue.kind === "no_eligible_approver" ? "No eligible approver" : r.routingIssue.kind === "workflow_not_approved" ? "Workflow not approved for use" : r.routingIssue.kind === "multiple_workflows" ? "Ambiguous workflow" : "No workflow"}.</strong> {r.routingIssue.message}
        </Notice>
      )}
      {wf && (
        <ol className="route">
          {wf.stages.map((def, i) => {
            const run = r.stages[i];
            const live = run?.status === "active" && DECIDABLE.concat(["pending_assignment"]).includes(r.status) ? eligibleApprovers(s, acc, r, def, i, now) : null;
            return (
              <li key={def.id} className={`route__stage route__stage--${run?.status ?? "waiting"}`}>
                <p className="route__name">
                  <GitBranch size={14} strokeWidth={2} aria-hidden="true" /> {i + 1}. {def.name}
                  <span className="route__status small">{run?.decision ? `${run.decision === "approved" ? "Approved" : run.decision === "rejected" ? "Rejected" : "Returned"} by ${userLabel(acc, run.decidedBy)}${run.activatedAt && run.decidedAt ? ` · ${formatAge(hoursBetween(run.activatedAt, run.decidedAt))}` : ""}` : run?.status === "active" ? `Active${run.activatedAt ? ` · ${formatAge(hoursBetween(run.activatedAt, now))}` : ""}` : "Waiting"}</span>
                </p>
                {run?.remarks && <p className="small route__remark">“{run.remarks}”</p>}
                {live && (
                  <>
                    <p className="small muted">Eligible now: {live.eligible.length ? live.eligible.map((e) => userLabel(acc, e.userId)).join(", ") : "nobody"}</p>
                    {admin && live.excluded.length > 0 && (
                      <details className="route__excluded">
                        <summary className="small">{live.excluded.length} excluded</summary>
                        <ul>
                          {live.excluded.map((e) => (
                            <li key={e.userId} className="small">
                              <strong>{userLabel(acc, e.userId)}</strong> · {e.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {wf?.separation.distinctApproverPerStage && wf.stages.length > 1 && <p className="small muted">Each stage needs a different approver. The Maker is always excluded.</p>}
    </Panel>
  );
}

/* ---------------- Execution ---------------- */

function ExecutionPanel({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const { acc, uid } = view;
  const { notify } = useToast();
  const [res, setRes] = useState<PolicyResult | null>(null);
  if (r.status !== "approved") return null;
  const e = r.execution;
  const operator = canOperateExecution(acc, uid, r.module).ok;
  const runnable = (e.status === "awaiting" || e.status === "failed" || e.status === "retry_pending") && e.attempts.length < e.maxAttempts;
  return (
    <Panel title="Execution" level={3} subtitle="Separate from approval. A failed execution does not change the approval decision">
      <dl className="kv kv--tight">
        <div className="kv__row">
          <dt>Status</dt>
          <dd>
            <ExecutionBadge status={e.status} />
          </dd>
        </div>
        <div className="kv__row">
          <dt>Idempotency key</dt>
          <dd className="mono small">{e.ref ?? "—"}</dd>
        </div>
        <div className="kv__row">
          <dt>Attempts</dt>
          <dd className="num">
            {e.attempts.length} of {e.maxAttempts}
          </dd>
        </div>
        <div className="kv__row">
          <dt>Adapter</dt>
          <dd className="small">{getAdapter(r.module).intent} (mock)</dd>
        </div>
      </dl>
      {e.attempts.length > 0 && (
        <ul className="exec-attempts">
          {e.attempts.map((a, i) => (
            <li key={i} className={`small exec-attempt exec-attempt--${a.result}`}>
              <span className="num">{formatDateTime(a.at)}</span> · {a.result === "success" ? "Succeeded" : "Failed"} · {a.message}
            </li>
          ))}
        </ul>
      )}
      <PolicyMessages result={res} title="Execution did not complete" />
      {runnable &&
        (operator ? (
          <button
            type="button"
            className="btn btn--dark"
            onClick={async () => {
              await ensureExecutionHandler(r.module);
              const out = runExecution(uid, r.id);
              setRes(out.ok ? null : out);
              notify(out.ok ? `${r.id} executed (mock)` : `${r.id} execution failed`, out.ok ? "positive" : "negative");
            }}
          >
            <PlayCircle size={16} strokeWidth={2} aria-hidden="true" />
            {e.status === "awaiting" ? "Run execution (mock)" : "Retry execution (mock)"}
          </button>
        ) : (
          <p className="small muted">Execution is run by the originating module or by operators with Execute on {moduleLabel(r.module)}.</p>
        ))}
      {e.attempts.length >= e.maxAttempts && e.status === "failed" && <p className="small neg">Retry limit reached. Investigate the failure; a changed payload needs a new approval request.</p>}
    </Panel>
  );
}

/* ---------------- Administration ---------------- */

function AdminPanel({ r, view }: { r: ApprovalRequest; view: ApprovalView }) {
  const { admin, uid } = view;
  const { notify } = useToast();
  const [override, setOverride] = useState(false);
  const [res, setRes] = useState<PolicyResult | null>(null);
  if (!admin || ["approved", "rejected", "withdrawn", "cancelled", "draft"].includes(r.status)) return null;
  return (
    <Panel title="Workflow administration" level={3} subtitle="Platform administrators can re-run routing. They cannot approve or skip a stage">
      <PolicyMessages result={res} title="Still waiting" />
      <div className="btn-col">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            const out = rerouteRequest(uid, r.id);
            setRes(out.ok ? null : out);
            notify(out.ok ? `${r.id} re-routed` : `${r.id} still has no route`, out.ok ? "positive" : "negative");
          }}
        >
          <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          Re-run routing
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOverride(true)}>
          <ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />
          Request administrative override
        </button>
      </div>
      <ReasonDialog
        open={override}
        title="Administrative override"
        confirmLabel="Attempt override"
        tone="danger"
        body="Maker-Checker cannot be bypassed by any administrative role, including Evolve Super Admin. The attempt and its reason are recorded."
        onClose={() => setOverride(false)}
        onConfirm={(reason) => {
          const out = attemptOverride(uid, r.id, reason);
          return out;
        }}
      />
    </Panel>
  );
}


