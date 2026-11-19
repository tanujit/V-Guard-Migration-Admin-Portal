import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { DIRECT_ORDER_ASSESSMENT, SALES_EXEC_ASSESSMENT, WORKSTREAMS } from "@/config/jobsCatalogue";
import { createQuotationDraft, createRetailerTag, electricians, issueQuotation, recordWorkLocationChange, retailerProximity, retailers, salesExecWorkspace, saveRadiusDraft, saveVisitSurveyRule, triggerVisitSurvey, updateModule12Decision, workLocationHistory, workLocationImpact } from "@/features/jobs/store";
import type { ProposedDecisionStatus } from "@/types/jobs";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { DecisionLink, DemoTag, Status, dt, label, memberLink, useJobsView, useRun } from "./shared";

/* ======================= ST Direct Order assessment (OP-63) ======================= */

export function DirectOrderPage() {
  const a = DIRECT_ORDER_ASSESSMENT;
  const none = <span className="muted small">None found</span>;
  return (
    <>
      <SectionTitle title="ST Direct Order assessment" description="SOW 12.8: the existing Direct Order & Direct Fulfilment build was reportedly about 90% tested but never went live. It is reviewed, not rebuilt" />
      <Notice tone="warn">No Direct Order implementation exists in this repository and the legacy build has not been supplied, so its readiness cannot be determined. Status, outstanding work and ownership are pending <DecisionLink id="OP-63" />.</Notice>
      <Panel title="Existing-build audit">
        <dl className="dl-grid small">
          <dt>Repository search</dt><dd>{a.repositorySearch}</dd>
          <dt>Existing components</dt><dd>{a.componentsFound.length ? a.componentsFound.join(", ") : none}</dd>
          <dt>Existing API contracts</dt><dd>{a.apiContracts.length ? a.apiContracts.join(", ") : none}</dd>
          <dt>Workflow steps implemented</dt><dd>{a.stepsImplemented.length ? a.stepsImplemented.join(", ") : "Unknown — legacy build not available"}</dd>
          <dt>Workflow steps missing</dt><dd>{a.stepsMissing.join("; ")}</dd>
          <dt>Test coverage</dt><dd>{a.tests}</dd>
          <dt>Known defects</dt><dd>{a.defects}</dd>
          <dt>Integration dependencies</dt><dd>{a.dependencies.join("; ")}</dd>
          <dt>Go-live readiness</dt><dd>{a.readiness}</dd>
          <dt>Integration / business / go-live owner</dt><dd>Not assigned (OP-63)</dd>
        </dl>
      </Panel>
      <Panel title="No-rebuild rule">
        <ul className="small"><li>No second Direct Order implementation is created in this portal.</li><li>When the legacy build is supplied: inventory its routes, components, APIs, data structures, workflows and tests, then fix only verified gaps that are authorised.</li><li>Existing order data and history are preserved.</li><li>Direct Order stays inactive until OP-63 is confirmed.</li></ul>
      </Panel>
    </>
  );
}

/* ======================= Quotations (OP-29) ======================= */

export function QuotationsPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const eps = electricians();
  const [q, setQ] = useState({ electricianId: eps[0]?.id ?? "", customerRef: "", description: "" });
  const sel = v.js.quotations.slice(-1)[0];
  return (
    <>
      <SectionTitle title="Electrician quotations" description="SOW 12.9 — a new feature, not in the baseline. Drafts carry a description only: no prices, calculations or tax" actions={<DemoTag />} />
      <Notice tone="warn">Approval, fields, calculations, tax treatment, output format (PDF or other) and sharing are pending <DecisionLink id="OP-29" />. Nothing is generated or sent.</Notice>
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title="New quotation draft">
          <div className="form-grid">
            <SelectInput label="Electrician (EP)" value={q.electricianId} onChange={(x) => setQ({ ...q, electricianId: x })} options={eps.slice(0, 40).map((m) => ({ value: m.id, label: `${m.id} ${m.name}` }))} />
            <TextField label="Customer reference" value={q.customerRef} onChange={(x) => setQ({ ...q, customerRef: x })} hint="A reference, not personal details" />
            <TextArea label="Product / service details" value={q.description} onChange={(x) => setQ({ ...q, description: x })} rows={2} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(createQuotationDraft(v.uid, q), "Draft saved")}>Save draft</button>
        </Panel>
        <Panel title="Template preview" subtitle="Framework only; output format pending OP-29">
          {sel ? (
            <div className="quote-preview">
              <div className="quote-preview__head"><strong>Quotation</strong><span className="mono small">{sel.id} · DRAFT</span></div>
              <p className="small">Electrician {sel.electricianId} · Customer {sel.customerRef} · {sel.date}</p>
              <p>{sel.description}</p>
              <p className="small muted">Prices, taxes and totals: not defined (OP-29)</p>
            </div>
          ) : <p className="muted small">Save a draft to preview it</p>}
        </Panel>
      </div>
      <Panel padded={false} title="Quotation drafts">
        <DataTable rows={v.js.quotations} rowKey={(x) => x.id} caption="Quotations" searchable={false} emptyTitle="No drafts" columns={[{ key: "id", header: "Quotation", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> }, { key: "e", header: "Electrician", value: (x) => x.electricianId, render: (x) => memberLink(x.electricianId) }, { key: "c", header: "Customer reference", value: (x) => x.customerRef }, { key: "d", header: "Details", value: (x) => x.description, render: (x) => <span className="small">{x.description}</span> }, { key: "dt", header: "Date", value: (x) => x.date }, { key: "s", header: "Status", value: (x) => x.status, render: (x) => <Status s={x.status} /> }, { key: "sh", header: "Shared", value: (x) => x.shared, render: (x) => <span className="btn-row"><span className="small">{label(x.shared)}</span><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(issueQuotation(v.uid, x.id), "")}>Issue</button></span> }]} />
      </Panel>
    </>
  );
}

/* ======================= Retailer tagging (OP-27) ======================= */

export function RetailerTaggingPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const eps = electricians().filter((m) => m.addresses.working);
  const rts = retailers();
  const [t, setT] = useState({ e: eps[0]?.id ?? "", r: rts[0]?.id ?? "", source: "pincode" as "pincode" | "address" });
  const [radius, setRadius] = useState(v.js.radius.radiusKm == null ? "" : String(v.js.radius.radiusKm));
  const prox = t.e ? retailerProximity(t.e) : null;
  return (
    <>
      <SectionTitle title="Retailer tagging" description="SOW 12.10 — tag retailers to electricians by pincode or address and show tagged retailers within a distance. Uses Member Management locations; no separate retailer master" actions={<DemoTag />} />
      <Notice tone="warn">Tagging rules, the default radius, whether it is configurable and the retailer location source are pending <DecisionLink id="OP-27" />. Tags are demo records; the radius stays inactive.</Notice>
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title="Tag a retailer (demo)">
          <div className="form-grid">
            <SelectInput label="Electrician" value={t.e} onChange={(x) => setT({ ...t, e: x })} options={eps.slice(0, 40).map((m) => ({ value: m.id, label: `${m.id} ${m.name}` }))} />
            <SelectInput label="Retailer" value={t.r} onChange={(x) => setT({ ...t, r: x })} options={rts.map((m) => ({ value: m.id, label: `${m.id} ${m.name}` }))} />
            <SelectInput label="Tagging source" value={t.source} onChange={(x) => setT({ ...t, source: x as "pincode" })} options={[{ value: "pincode", label: "Pincode" }, { value: "address", label: "Address" }]} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(createRetailerTag(v.uid, t.e, t.r, t.source), "Tag recorded (demo)")}>Tag</button>
        </Panel>
        <Panel title="Visibility radius" subtitle={`Status: ${label(v.js.radius.status)} · no default`}>
          <div className="form-grid"><TextField label="Radius (km) — draft" value={radius} onChange={setRadius} inputMode="numeric" hint="Leave blank: no default is assumed" /></div>
          {v.can("proposed-scope:manage") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(saveRadiusDraft(v.uid, radius.trim() ? Number(radius) : null), "Draft saved (inactive)")}>Save draft</button>}
        </Panel>
      </div>
      <Panel padded={false} title={`Proximity preview · ${t.e}`} subtitle={prox ? `${prox.origin}. Distances only where both locations have valid coordinates; exact coordinates are not shown` : ""}>
        <DataTable rows={prox?.rows ?? []} rowKey={(r) => r.retailerId} caption="Proximity" searchable={false} emptyTitle="No tagged retailers for this electrician" columns={[{ key: "r", header: "Retailer", value: (r) => r.retailerId, render: (r) => memberLink(r.retailerId) }, { key: "p", header: "Pincode", value: (r) => r.pincode ?? "" }, { key: "d", header: "Distance", value: (r) => r.distanceKm ?? -1, render: (r) => (r.distanceKm == null ? <span className="muted small">Not calculable</span> : `${r.distanceKm} km`), align: "right" }, { key: "n", header: "Basis", value: (r) => r.note, render: (r) => <span className="small">{r.note}</span> }]} />
      </Panel>
      <Panel padded={false} title="Tags">
        <DataTable rows={v.js.tags} rowKey={(x) => x.id} caption="Retailer tags" searchable={false} emptyTitle="No tags" columns={[{ key: "id", header: "Tag", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> }, { key: "e", header: "Electrician", value: (x) => x.electricianId, render: (x) => memberLink(x.electricianId) }, { key: "r", header: "Retailer", value: (x) => x.retailerId, render: (x) => memberLink(x.retailerId) }, { key: "p", header: "Pincode", value: (x) => x.pincode ?? "" }, { key: "s", header: "Source", value: (x) => x.source }, { key: "st", header: "Status", value: (x) => x.status, render: () => "Demo" }, { key: "u", header: "Updated", value: (x) => x.updatedAt, render: (x) => <span className="small">{dt(x.updatedAt)}</span> }]} />
      </Panel>
    </>
  );
}

/* ======================= Retailer visit surveys (OP-28) ======================= */

export function VisitSurveysPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const [r, setR] = useState({ surveyRef: "", distance: "", frequency: "", verification: "" });
  return (
    <>
      <SectionTitle title="Retailer visit surveys" description="SOW 12.10 — a survey triggered when an electrician visits a tagged retailer. Separate from the member N06 survey; depends on retailer tagging" actions={<DemoTag />} />
      <Notice tone="warn">Blocked until retailer tagging (<DecisionLink id="OP-27" />) and the trigger rules (<DecisionLink id="OP-28" />) are confirmed: trigger distance, frequency per retailer, visit verification and survey ownership.</Notice>
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title="Trigger rule (draft, inactive)">
          <div className="form-grid">
            <TextField label="Survey reference" value={r.surveyRef} onChange={(x) => setR({ ...r, surveyRef: x })} hint="Not the member N06 survey" />
            <TextField label="Trigger distance (m)" value={r.distance} onChange={(x) => setR({ ...r, distance: x })} hint="Not specified by the SOW" />
            <TextField label="Frequency per retailer" value={r.frequency} onChange={(x) => setR({ ...r, frequency: x })} />
            <TextField label="Visit verification method" value={r.verification} onChange={(x) => setR({ ...r, verification: x })} />
          </div>
          {v.can("proposed-scope:manage") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(saveVisitSurveyRule(v.uid, { surveyRef: r.surveyRef || null, triggerDistanceM: r.distance ? Number(r.distance) : null, frequency: r.frequency || null, visitVerification: r.verification || null }), "Draft saved (inactive)")}>Save draft</button>}
        </Panel>
        <Panel title="Test a trigger">
          <p className="small">Duplicate prevention, notification and timestamp are defined on the rule once approved.</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(triggerVisitSurvey(v.uid, v.js.tags[0]?.electricianId ?? "—", v.js.tags[0]?.retailerId ?? "—"), "")}>Trigger survey for a tagged visit</button>
        </Panel>
      </div>
      <Panel padded={false} title="Rules">
        <DataTable rows={v.js.surveyRules} rowKey={(x) => x.id} caption="Visit survey rules" searchable={false} emptyTitle="No rules" columns={[{ key: "id", header: "Rule", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> }, { key: "s", header: "Survey", value: (x) => x.surveyRef ?? "", render: (x) => x.surveyRef ?? "—" }, { key: "d", header: "Distance", value: (x) => x.triggerDistanceM ?? -1, render: (x) => (x.triggerDistanceM == null ? "Not set" : `${x.triggerDistanceM} m`) }, { key: "f", header: "Frequency", value: (x) => x.frequency ?? "", render: (x) => x.frequency ?? "Not set" }, { key: "st", header: "Status", value: (x) => x.status, render: (x) => <Status s={x.status} /> }]} />
      </Panel>
    </>
  );
}

/* ======================= Work location governance (OP-26) ======================= */

export function WorkLocationPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const h = workLocationHistory();
  const [c, setC] = useState({ memberId: h.current[0]?.memberId ?? "", to: "", reason: "" });
  const impact = c.memberId ? workLocationImpact(c.memberId) : null;
  return (
    <>
      <SectionTitle title="Work location governance" description="SOW 12.10 — electricians who often change working location. Changes are recorded for review; nothing downstream is recalculated" actions={<DemoTag />} />
      <Notice tone="warn">Update frequency, approval, and the effect on retailer tags, geo-fenced schemes and branch mapping are pending <DecisionLink id="OP-26" />.</Notice>
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title="Record a change (prototype)">
          <div className="form-grid">
            <SelectInput label="Member" value={c.memberId} onChange={(x) => setC({ ...c, memberId: x })} options={h.current.slice(0, 60).map((m) => ({ value: m.memberId, label: `${m.memberId} (${m.programme})` }))} />
            <TextField label="New working location" value={c.to} onChange={(x) => setC({ ...c, to: x })} />
            <TextField label="Reason" value={c.reason} onChange={(x) => setC({ ...c, reason: x })} />
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(recordWorkLocationChange(v.uid, c.memberId, c.to, c.reason), "Change recorded (pending policy)")}>Record</button>
        </Panel>
        <Panel title="Impact preview" subtitle="What would need review; nothing is changed">
          {impact && <dl className="dl-grid small"><dt>Branch mapping</dt><dd>{impact.branchMapping}</dd><dt>Retailer tags</dt><dd>{impact.retailerTags} tag(s), unchanged</dd><dt>Geo-fenced schemes</dt><dd>{impact.geoSchemes}</dd><dt>Nearby retailers</dt><dd>{impact.visibility}</dd></dl>}
          <p className="small muted">Draft governance: permitted frequency, approval, effective date, reason, previous-location retention and recalculation behaviour are all undefined.</p>
        </Panel>
      </div>
      <Panel padded={false} title="Recorded changes">
        <DataTable rows={h.changes} rowKey={(x) => x.id} caption="Work location changes" searchable={false} emptyTitle="No changes recorded" columns={[{ key: "m", header: "Member", value: (x) => x.memberId, render: (x) => memberLink(x.memberId) }, { key: "f", header: "Previous", value: (x) => x.from ?? "", render: (x) => <span className="small">{x.from}</span> }, { key: "t", header: "New", value: (x) => x.to, render: (x) => <span className="small">{x.to}</span> }, { key: "at", header: "Changed", value: (x) => x.at, render: (x) => <span className="small">{dt(x.at)}</span> }, { key: "s", header: "Source", value: (x) => x.source }, { key: "st", header: "Status", value: (x) => x.status, render: (x) => <span className="small">{label(x.status)}</span> }]} />
      </Panel>
      <Panel padded={false} title="Current working locations" subtitle="From Member Management">
        <DataTable rows={h.current} rowKey={(x) => x.memberId} caption="Working locations" pageSize={10} columns={[{ key: "m", header: "Member", value: (x) => x.memberId, render: (x) => memberLink(x.memberId) }, { key: "p", header: "Programme", value: (x) => x.programme }, { key: "c", header: "Working location", value: (x) => x.current, render: (x) => <span className="small">{x.current}</span> }, { key: "u", header: "Updated", value: (x) => x.updatedAt, render: (x) => <span className="small">{dt(x.updatedAt)}</span> }, { key: "s", header: "Source / verification", value: (x) => x.source, render: (x) => <span className="small">{x.source} · {label(x.verification)}</span> }, { key: "b", header: "Branch", value: (x) => x.branchCode }]} />
      </Panel>
    </>
  );
}

/* ======================= Sales Executive (OP-36 / OP-37) ======================= */

export function SalesExecutivePage() {
  const v = useJobsView();
  const reps = v.acc.users.filter((u) => v.acc.assignments.some((a) => a.userId === u.id && a.roleId === "ROLE-0005" && a.status === "active"));
  const [rep, setRep] = useState(reps[0]?.id ?? "USR-2006");
  const w = salesExecWorkspace(v.uid, rep);
  return (
    <>
      <SectionTitle title="Sales Executive scope" description="SOW 12.11 — the Sales Executive already uses this portal for EP registration, support, View-As and mapped-member performance. A separate app is not agreed" />
      <Notice tone="warn">No separate Sales Executive mobile app, PWA or web app is built. Whether one is needed, and of what type, is pending <DecisionLink id="OP-36" label="OP-36 / OP-37" />.</Notice>
      <Panel padded={false} title="Existing capability review">
        <DataTable rows={SALES_EXEC_ASSESSMENT} rowKey={(x) => x.need} caption="Sales Executive capabilities" searchable={false} columns={[{ key: "n", header: "Need", value: (x) => x.need, render: (x) => <strong>{x.need}</strong> }, { key: "e", header: "Existing in the portal", value: (x) => x.existing, render: (x) => <span className="small">{x.existing}</span> }, { key: "g", header: "Gap", value: (x) => x.gap, render: (x) => <span className="small">{x.gap}</span> }]} />
      </Panel>
      <Panel padded={false} title="Workspace prototype" subtitle="Mapped members through the access engine's scope; values from the member, wallet and scheme services" actions={<SelectInput label="Sales Rep" value={rep} onChange={setRep} options={(reps.length ? reps : v.acc.users.filter((u) => u.id === "USR-2006")).map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} (${u.id})` }))} />}>
        <DataTable rows={w.rows} rowKey={(r) => r.memberId} caption="Mapped members" emptyTitle="No mapped members" columns={[
          { key: "m", header: "Member", value: (r) => r.memberId, render: (r) => <span>{memberLink(r.memberId)} <span className="small">{r.name}</span></span> },
          { key: "p", header: "Programme", value: (r) => r.programme },
          { key: "r", header: "Registration", value: (r) => r.registration },
          { key: "k", header: "KYC", value: (r) => r.kyc },
          { key: "a", header: "Available points", value: (r) => r.available, align: "right" },
          { key: "s", header: "Schemes", value: (r) => r.schemes, align: "right" },
          { key: "l", header: "First login", value: (r) => r.lastLogin ?? "", render: (r) => <span className="small">{dt(r.lastLogin)}</span> },
          { key: "f", header: "Follow-up", value: (r) => r.followUp },
          { key: "v", header: "", value: () => "", render: (r) => <span className="small"><Link to={`/members/member/${r.memberId}`}>Member 360</Link> · <Link to={`/governance/platform/view-as?member=${r.memberId}`}>View-As</Link></span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Decision register and workstreams ======================= */

const STATUSES: ProposedDecisionStatus[] = ["open", "under_review", "decision_received", "confirmed", "deferred", "out_of_scope"];
export function DecisionsPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const { hash } = useLocation();
  const [edit, setEdit] = useState<{ id: string; status: ProposedDecisionStatus; evidence: string } | null>(null);
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" }), 50);
    return () => window.clearTimeout(t);
  }, [hash]);
  return (
    <>
      <SectionTitle title="Proposed scope decisions" description="The Module 12 decision register. A prototype is never a confirmation of scope; confirming a decision does not activate a feature" />
      <PolicyMessages result={result} />
      <div className="decision-list">
        {v.js.decisions.map((d) => (
          <div key={d.id} id={d.id} className="decision-anchor">
            <Panel title={d.ref} subtitle={`SOW ${d.sow} · business owner ${d.businessOwner ?? "not known"} · technical owner ${d.technicalOwner ?? "not known"}`} actions={<Status s={d.status} />}>
              <p>{d.question}</p>
              <dl className="dl-grid small"><dt>Affects</dt><dd>{d.affected}</dd><dt>Technical dependency</dt><dd>{d.dependency}</dd><dt>Until decided</dt><dd>{d.restriction}</dd><dt>Decision date / evidence</dt><dd>{d.decisionDate ?? "—"} {d.evidence ? `· ${d.evidence}` : ""}</dd></dl>
              {v.can("proposed-scope:manage") && (edit?.id === d.id ? (
                <div className="form-grid">
                  <SelectInput label="Status" value={edit.status} onChange={(x) => setEdit({ ...edit, status: x as ProposedDecisionStatus })} options={STATUSES.map((x) => ({ value: x, label: label(x) }))} />
                  <TextArea label="Confirmation evidence" value={edit.evidence} onChange={(x) => setEdit({ ...edit, evidence: x })} rows={2} />
                  <div className="btn-row"><button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(updateModule12Decision(v.uid, d.id, edit.status, edit.evidence), "Decision recorded"); if (r.ok) setEdit(null); }}>Record</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Cancel</button></div>
                </div>
              ) : <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit({ id: d.id, status: d.status, evidence: d.evidence })}>Record a decision</button>)}
            </Panel>
          </div>
        ))}
      </div>
      <Panel padded={false} title="Indicative implementation workstreams" subtitle="Relative size only, under the stated assumptions. Not an estimate of effort or cost">
        <DataTable rows={WORKSTREAMS} rowKey={(w) => w.id} caption="Workstreams" searchable={false} pageSize={12} columns={[{ key: "n", header: "Workstream", value: (w) => w.name, render: (w) => <strong>{w.name}</strong> }, { key: "s", header: "Relative size", value: (w) => w.size }, { key: "d", header: "Depends on", value: (w) => w.depends, render: (w) => <span className="small">{w.depends}</span> }, { key: "a", header: "Assumption", value: (w) => w.assumption, render: (w) => <span className="small">{w.assumption}</span> }]} />
      </Panel>
      <Panel padded={false} title="Prototype audit" subtitle="Every consequential action and refusal">
        <DataTable rows={[...v.js.audit].reverse()} rowKey={(a) => a.id} caption="Module 12 audit" pageSize={15} columns={[{ key: "at", header: "At", value: (a) => a.at, render: (a) => <span className="small">{dt(a.at)}</span> }, { key: "ac", header: "Actor", value: (a) => a.actor }, { key: "a", header: "Action", value: (a) => a.action, render: (a) => <span className="small">{label(a.action)}</span> }, { key: "e", header: "Entity", value: (a) => a.entity, render: (a) => <span className="mono small">{a.entity}</span> }, { key: "d", header: "Detail", value: (a) => a.detail, render: (a) => <span className="small">{a.detail}</span> }, { key: "r", header: "Result", value: (a) => a.result, render: (a) => <Status s={a.result === "refused" ? "blocked" : "confirmed"} /> }]} />
      </Panel>
    </>
  );
}
