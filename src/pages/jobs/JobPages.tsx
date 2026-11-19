import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars } from "@/components/ui/DataBars";
import { SelectInput, TextField } from "@/components/form/Form";
import { CAPABILITY_ASSESSMENT, FEATURE_GATES, INBOUND_CONTRACT, OUTBOUND_CONTRACT, SIEBEL_JOB_INTEGRATION, SCHEME_COMPATIBILITY } from "@/config/jobsCatalogue";
import { activateFeature, activateRewardConfig, allocationCandidates, createDemoAssignment, createRewardConfigDraft, creditJobReward, customerView, decisionOf, jobTrace, module12Overview, overrideSiebelResult, receiveSiebelJob, recordJobStart, recordSiebelTimeout, siebelCallback, simulateRewardProcessing, simulateTechnicianResponse, submitCompletion, technicians } from "@/features/jobs/store";
import type { JobType, ProposedJob } from "@/types/jobs";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { ClassBadge, DecisionLink, DemoTag, JOBS_BASE, Status, Tile, dt, jobLink, label, memberLink, useJobsView, useRun } from "./shared";

const LIFECYCLE = ["Received from Siebel", "Pending allocation", "Assigned", "Accepted", "In progress", "Completion submitted", "Awaiting Siebel confirmation", "Confirmed / Rejected", "Points eligible"];
const uniqCount = (rows: string[]) => [...rows.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value);

/* ======================= Proposed scope overview ======================= */

export function ScopeOverviewPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const o = module12Overview();
  return (
    <>
      <SectionTitle title="Proposed scope overview" description="An assessment and prototype dashboard for SOW Module 12 — not a production job-management dashboard. Every figure comes from demo records created through the prototype" />
      <Notice tone="warn"><strong>Not production ready.</strong> {o.openDecisions} of 12 scope decisions are open. No feature below is active, and recording a decision does not activate anything: activation needs a formal scope approval.</Notice>
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Total incoming jobs" value={o.total} sub="Demo data" />
        <Tile label="Unassigned jobs" value={o.unassigned} />
        <Tile label="Awaiting technician acceptance" value={o.awaitingAcceptance} />
        <Tile label="Accepted jobs" value={o.accepted} />
        <Tile label="Jobs in progress" value={o.inProgress} />
        <Tile label="Awaiting completion evidence" value={o.awaitingEvidence} />
        <Tile label="Awaiting Siebel confirmation" value={o.awaitingSiebel} tone="warn" />
        <Tile label="Siebel-confirmed jobs" value={o.confirmed} sub="Mock adapter" />
        <Tile label="Rejected completions" value={o.rejected} />
        <Tile label="Points pending confirmation" value={o.pointsPending} sub="Draft configuration" />
        <Tile label="Points credited" value={o.pointsCredited} sub={`${o.pointsSimulated} simulated, never credited`} />
        <Tile label="Active technicians" value={o.activeTechnicians} sub="ST members with an app account" />
        <Tile label="Verified / Exclusive technicians" value={o.verified} sub="Demo flags (OP-58)" />
        <Tile label="Happy Points feedback requests" value={o.feedbackLinks} sub="Prepared, not sent" />
        <Tile label="Pending customer feedback" value={o.feedbackPending} />
        <Tile label="Direct Order assessment" value="Not determinable" sub="Legacy build not supplied (OP-63)" />
      </div>
      <Panel title="Proposed job lifecycle" subtitle="Points eligibility is separate from completion: uploaded photographs never make a job reward-eligible on their own">
        <ol className="lifecycle">{LIFECYCLE.map((s, i) => <li key={s}><span className="lifecycle__n">{i + 1}</span>{s}{i < LIFECYCLE.length - 1 && <ArrowRight size={14} aria-hidden="true" />}</li>)}</ol>
      </Panel>
      <Panel padded={false} title="Proposed dependencies" subtitle="Each blocks activation of the functionality it affects">
        <DataTable rows={v.js.decisions} rowKey={(d) => d.id} caption="Module 12 dependencies" searchable={false} pageSize={12} columns={[
          { key: "r", header: "Reference", value: (d) => d.ref, render: (d) => <DecisionLink id={d.id} label={d.ref} /> },
          { key: "s", header: "Decision status", value: (d) => d.status, render: (d) => <Status s={d.status} /> },
          { key: "a", header: "Affected functionality", value: (d) => d.affected, render: (d) => <span className="small">{d.affected}</span> },
          { key: "x", header: "Activation restriction", value: (d) => d.restriction, render: (d) => <span className="small">{d.restriction}</span> },
          { key: "o", header: "Owner", value: (d) => d.businessOwner ?? "", render: (d) => <span className="small">{d.businessOwner ?? "Not known"}</span> },
          { key: "n", header: "Confirmation notes", value: (d) => d.evidence, render: (d) => <span className="small muted">{d.evidence || "None recorded"}</span> },
        ]} />
      </Panel>
      <Panel padded={false} title="Feature gates" subtitle="Production activation is refused for every feature in this prototype">
        <DataTable rows={FEATURE_GATES} rowKey={(g) => g.id} caption="Feature gates" searchable={false} pageSize={12} columns={[
          { key: "f", header: "Capability", value: (g) => g.feature, render: (g) => <strong>{g.feature}</strong> },
          { key: "c", header: "Classification", value: (g) => g.cls, render: (g) => <ClassBadge c={g.cls} /> },
          { key: "d", header: "Depends on", value: (g) => g.decisions.join(), render: (g) => <span className="small">{g.decisions.map((d) => decisionOf(d).ref).join(", ")}</span> },
          { key: "p", header: "Prototype", value: (g) => g.prototype, render: (g) => <span className="small">{g.prototype}</span> },
          { key: "s", header: "Production", value: () => "inactive", render: (g) => <span className="btn-row"><Status s="inactive" /><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(activateFeature(v.uid, g.id), "")}>Try to activate</button></span> },
        ]} />
      </Panel>
      <Panel padded={false} title="Existing versus new functionality" subtitle="Inspected before building: reuse first, no rebuilds">
        <DataTable rows={CAPABILITY_ASSESSMENT} rowKey={(c) => c.id} caption="Capability assessment" searchable={false} pageSize={10} exportName="module12-capability-assessment" columns={[
          { key: "c", header: "Capability", value: (c) => c.capability, render: (c) => <span><strong>{c.capability}</strong><br /><span className="small muted">SOW: {c.sowStatus}</span></span> },
          { key: "cl", header: "Status", value: (c) => c.cls, render: (c) => <ClassBadge c={c.cls} /> },
          { key: "w", header: "Existing route / component / service", value: (c) => c.route, render: (c) => <span className="small">{c.route}<br /><span className="muted">{c.component} · {c.service}</span></span> },
          { key: "m", header: "Data model / API / tests", value: (c) => c.dataModel, render: (c) => <span className="small">{c.dataModel}<br /><span className="muted">{c.apiContract} · {c.tests}</span></span> },
          { key: "g", header: "Missing → proposed enhancement", value: (c) => c.missing, render: (c) => <span className="small">{c.missing}<br /><span className="muted">→ {c.enhancement}</span></span> },
          { key: "r", header: "Rebuild", value: (c) => c.rebuild },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Dashboard ======================= */

export function JobDashboardPage() {
  const v = useJobsView();
  const jobs = v.js.jobs;
  return (
    <>
      <SectionTitle title="Job operations dashboard" description="Distribution of the demo jobs. Not operational metrics" actions={<DemoTag />} />
      <div className="grid-2">
        <Panel title="By status"><RankedBars items={uniqCount(jobs.map((j) => label(j.status)))} /></Panel>
        <Panel title="By job type"><RankedBars items={uniqCount(jobs.map((j) => j.payload.jobType ?? "Not supplied"))} /></Panel>
        <Panel title="By product"><RankedBars items={uniqCount(jobs.map((j) => j.payload.product.name ?? "Not supplied"))} /></Panel>
        <Panel title="By territory (district)"><RankedBars items={uniqCount(jobs.map((j) => j.payload.address.district ?? "Not supplied"))} /></Panel>
        <Panel title="By branch"><RankedBars items={uniqCount(jobs.map((j) => j.payload.branchCode ?? "Not supplied"))} /></Panel>
        <Panel title="By technician"><RankedBars items={uniqCount(jobs.filter((j) => j.technicianId).map((j) => j.technicianId!))} /></Panel>
      </div>
      <Panel title="By programme"><RankedBars items={uniqCount(jobs.map((j) => j.programme))} /></Panel>
    </>
  );
}

/* ======================= Job directory and detail ======================= */

export function JobListPage() {
  const v = useJobsView();
  const [f, setF] = useState({ status: "", type: "", siebel: "", reward: "", tech: "", from: "", to: "" });
  const set = (k: keyof typeof f) => (x: string) => setF({ ...f, [k]: x });
  const rows = v.js.jobs.filter((j) => (!f.status || j.status === f.status) && (!f.type || j.payload.jobType === f.type) && (!f.siebel || (j.siebel ?? "none") === f.siebel) && (!f.reward || j.reward === f.reward) && (!f.tech || j.technicianId === f.tech) && (!f.from || j.createdAt.slice(0, 10) >= f.from) && (!f.to || j.createdAt.slice(0, 10) <= f.to));
  const opt = (xs: string[]) => [{ value: "", label: "All" }, ...[...new Set(xs)].map((x) => ({ value: x, label: label(x) }))];
  return (
    <>
      <SectionTitle title="Job management" description="Demo jobs received through the mock Siebel adapter. Customer names and contacts are masked" actions={<DemoTag />} />
      <Panel><div className="form-grid">
        <SelectInput label="Job status" value={f.status} onChange={set("status")} options={opt(v.js.jobs.map((j) => j.status))} />
        <SelectInput label="Job type" value={f.type} onChange={set("type")} options={opt(["installation", "service"])} />
        <SelectInput label="Siebel confirmation" value={f.siebel} onChange={set("siebel")} options={opt(v.js.jobs.map((j) => j.siebel ?? "none"))} />
        <SelectInput label="Reward status" value={f.reward} onChange={set("reward")} options={opt(v.js.jobs.map((j) => j.reward))} />
        <SelectInput label="Technician" value={f.tech} onChange={set("tech")} options={opt(v.js.jobs.flatMap((j) => (j.technicianId ? [j.technicianId] : [])))} />
        <TextField label="Created from" type="date" value={f.from} onChange={set("from")} />
        <TextField label="Created to" type="date" value={f.to} onChange={set("to")} />
      </div></Panel>
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(j) => j.id} caption="Proposed jobs" exportName="module12-demo-jobs" pageSize={15} columns={[
          { key: "id", header: "Job ID", value: (j) => j.id, render: (j) => jobLink(j.id) },
          { key: "s", header: "Siebel job ref", value: (j) => j.siebelJobRef, render: (j) => <span className="mono small">{j.siebelJobRef}</span> },
          { key: "c", header: "Customer", value: (j) => j.payload.customer.ref ?? "", render: (j) => { const c = customerView(v.uid, j); return <span className="small">{c.ref}<br /><span className="muted">{c.name}</span></span>; } },
          { key: "a", header: "Service location", value: (j) => j.payload.address.district ?? "", render: (j) => <span className="small">{j.payload.address.district ?? "Not supplied"} {j.payload.address.pincode ?? ""}</span> },
          { key: "t", header: "Technician", value: (j) => j.technicianId ?? "", render: (j) => memberLink(j.technicianId) },
          { key: "p", header: "Programme", value: (j) => j.programme },
          { key: "jt", header: "Job type", value: (j) => j.payload.jobType ?? "", render: (j) => j.payload.jobType ?? <span className="muted small">Not supplied</span> },
          { key: "pr", header: "Product", value: (j) => j.payload.product.name ?? "", render: (j) => <span className="small">{j.payload.product.name ?? "Not supplied"}</span> },
          { key: "cr", header: "Created", value: (j) => j.createdAt, render: (j) => <span className="small">{dt(j.createdAt)}</span> },
          { key: "as", header: "Assigned", value: (j) => j.assignedAt ?? "", render: (j) => <span className="small">{dt(j.assignedAt)}</span> },
          { key: "st", header: "Job status", value: (j) => j.status, render: (j) => <Status s={j.status} /> },
          { key: "sb", header: "Siebel", value: (j) => j.siebel ?? "", render: (j) => <Status s={j.siebel} /> },
          { key: "rw", header: "Reward", value: (j) => j.reward, render: (j) => <Status s={j.reward} /> },
        ]} />
      </Panel>
    </>
  );
}

export function JobDetailPage() {
  const v = useJobsView();
  const { jobId } = useParams();
  const { result, run } = useRun();
  const j = v.js.jobs.find((x) => x.id === jobId);
  if (!j) return <Notice tone="warn">Job not found. <Link to={`${JOBS_BASE}/jobs`}>Back to jobs</Link></Notice>;
  const c = customerView(v.uid, j);
  const t = technicians().find((x) => x.id === j.technicianId);
  const r = v.js.rewards.find((x) => x.jobId === j.id);
  const flag = v.js.flags.find((f) => f.technicianId === j.technicianId && f.status === "demo_granted");
  const tr = jobTrace(j.id);
  return (
    <>
      <SectionTitle title={`${j.id} · ${j.siebelJobRef}`} description="Demo job. Fields come only from the mock Siebel payload; anything not supplied shows Not supplied" actions={<DemoTag />} />
      <PolicyMessages result={result} />
      {j.issues.length > 0 && <Notice tone="warn">Held for missing data: {j.issues.join("; ")}. Nothing is filled in by the platform.</Notice>}
      <div className="grid-2">
        <Panel title="Job summary">
          <dl className="dl-grid small">
            <dt>Job type</dt><dd>{j.payload.jobType ?? "Not supplied"}</dd>
            <dt>Created</dt><dd>{dt(j.createdAt)}</dd>
            <dt>Source system</dt><dd>Siebel (mock adapter)</dd>
            <dt>Status</dt><dd><Status s={j.status} /></dd>
            <dt>Priority</dt><dd>{j.payload.priority ?? "Not provided by the source"}</dd>
            <dt>Assigned technician</dt><dd>{memberLink(j.technicianId)}</dd>
            <dt>Customer reference</dt><dd>{c.ref}</dd>
          </dl>
        </Panel>
        <Panel title="Customer details" subtitle="As supplied by Siebel; contact and address masked">
          <dl className="dl-grid small">
            <dt>Customer name</dt><dd>{c.name}</dd><dt>Contact reference</dt><dd>{c.contact}</dd><dt>Address</dt><dd>{c.address}</dd><dt>Pincode</dt><dd>{c.pincode}</dd><dt>City / district</dt><dd>{c.district}</dd><dt>Product</dt><dd>{c.product}</dd><dt>Warranty reference</dt><dd>{c.warranty}</dd>
          </dl>
        </Panel>
        <Panel title="Technician">
          {t ? <dl className="dl-grid small"><dt>Name</dt><dd>{t.name}</dd><dt>Technician ID</dt><dd>{memberLink(t.id)}</dd><dt>Programme</dt><dd>{t.programme}</dd><dt>Branch</dt><dd>{t.branchCode}</dd><dt>Territory</dt><dd>{t.addresses.working?.district ?? "Not recorded"}</dd><dt>Skill / category</dt><dd>No skill mapping exists (OP-53)</dd><dt>Verified / Exclusive</dt><dd>{flag ? "Demo flag (OP-58)" : "No"}</dd><dt>Current workload</dt><dd>{v.js.jobs.filter((x) => x.technicianId === t.id && ["assigned", "accepted", "in_progress", "awaiting_siebel"].includes(x.status)).length} active demo job(s)</dd></dl> : <p className="muted small">Not assigned</p>}
        </Panel>
        <Panel title="Reward" subtitle="Uncredited until Siebel confirms">
          <dl className="dl-grid small">
            <dt>Reward configuration</dt><dd>{r?.configId ?? "None matched"}</dd><dt>Expected points</dt><dd>{r?.expectedPoints ?? "—"}</dd><dt>Siebel confirmation</dt><dd><Status s={j.siebel} /> {r?.siebelConfirmationRef ?? ""}</dd><dt>Eligibility</dt><dd><Status s={j.reward} /></dd><dt>Ledger reference</dt><dd>{r?.simulatedLedgerRef ? `${r.simulatedLedgerRef} (simulated)` : "—"}</dd><dt>Wallet</dt><dd>{r?.walletRef ?? "—"}</dd><dt>Credit status</dt><dd>Not credited (demo mode)</dd>
          </dl>
          {r?.note && <p className="small muted">{r.note}</p>}
        </Panel>
      </div>
      <Panel title="Job evidence">
        <dl className="dl-grid small">
          <dt>Start selfie</dt><dd>{j.start?.selfieRef ?? "—"} <span className="muted">(reference only; images are not shown)</span></dd>
          <dt>Location evidence</dt><dd>{j.start ? (j.start.gps ? `Captured · ${label(j.start.locationStatus)}` : "GPS unavailable") : "—"} <span className="muted">(coordinates hidden)</span></dd>
          <dt>Completion photos</dt><dd>{j.photos.length ? j.photos.map((p) => `${p.ref} (${p.category}, ${label(p.status)})`).join("; ") : "—"}</dd>
          <dt>Uploaded</dt><dd>{dt(j.photos[0]?.uploadedAt)}</dd>
        </dl>
      </Panel>
      <Panel padded={false} title="Timeline" subtitle="Only events that occurred">
        <DataTable rows={j.timeline} rowKey={(e) => `${e.at}${e.status}`} caption="Job timeline" searchable={false} columns={[{ key: "s", header: "Status", value: (e) => e.status, render: (e) => <strong>{e.status}</strong> }, { key: "at", header: "Timestamp", value: (e) => e.at, render: (e) => <span className="small">{dt(e.at)}</span> }, { key: "src", header: "Source", value: (e) => e.source }, { key: "r", header: "Reference", value: (e) => e.ref ?? "", render: (e) => <span className="mono small">{e.ref ?? "—"}</span> }, { key: "m", header: "Remarks", value: (e) => e.remarks, render: (e) => <span className="small">{e.remarks}</span> }]} />
      </Panel>
      <Panel title="Message trace (mock Siebel adapter)" subtitle="Lookup traffic stays in Integration Monitoring">
        <p className="small">{tr.inbound.length} inbound · {tr.submissions.length} submission(s) · {tr.callbacks.length} callback(s) · {tr.exceptions.length} exception(s). <Link to={`${JOBS_BASE}/siebel`}>Siebel job verification</Link> · <Link to="/monitoring/integrations/trace">Integration message trace</Link></p>
        <div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(overrideSiebelResult(v.uid, j.id), "")}>Mark confirmed manually</button></div>
      </Panel>
    </>
  );
}

/* ======================= Incoming jobs (mock Siebel inbound) ======================= */

export function IncomingJobsPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const [ref, setRef] = useState("SBL-DEMO-2001");
  const [type, setType] = useState<JobType>("installation");
  const t0 = technicians()[0];
  return (
    <>
      <SectionTitle title="Incoming jobs" description="Messages from the mock Siebel job adapter. Duplicate references are identified, never created twice; incomplete payloads are held" actions={<DemoTag />} />
      <PolicyMessages result={result} />
      <Panel title="Simulate a Siebel job message" subtitle="Development only — draft payload (OP-52 / OP-55)">
        <div className="form-grid"><TextField label="Siebel job reference" value={ref} onChange={setRef} /><SelectInput label="Job type" value={type} onChange={(x) => setType(x as JobType)} options={[{ value: "installation", label: "Installation" }, { value: "service", label: "Service" }]} /></div>
        <button type="button" className="btn btn--primary btn--sm" disabled={!v.can("proposed-scope:edit")} onClick={() => run(receiveSiebelJob(v.uid, { siebelJobRef: ref.trim(), jobType: type, customer: { ref: `CUST-DEMO-${ref.slice(-4)}`, name: `Demo Customer ${ref.slice(-4)}`, contactRef: `CNT-DEMO-${ref.slice(-4)}` }, address: { line: "Demo service address", pincode: t0?.addresses.working?.pincode ?? null, district: t0?.addresses.working?.district ?? null, state: t0?.addresses.working?.state ?? null }, product: { skuRef: null, name: "Demo product", categoryId: null }, warrantyRef: null, priority: null, branchCode: t0?.branchCode ?? null, extensions: {} }), "Job received (demo)")}>Receive demo job</button>
      </Panel>
      <Panel padded={false} title="Inbound messages">
        <DataTable rows={[...v.js.inbound].reverse()} rowKey={(x) => x.id} caption="Inbound messages" columns={[{ key: "id", header: "Message", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> }, { key: "at", header: "Received", value: (x) => x.at, render: (x) => <span className="small">{dt(x.at)}</span> }, { key: "r", header: "Siebel job ref", value: (x) => x.siebelJobRef, render: (x) => <span className="mono small">{x.siebelJobRef}</span> }, { key: "res", header: "Result", value: (x) => x.result, render: (x) => <Status s={x.result === "accepted" ? "confirmed" : x.result === "duplicate" ? "rejected" : "pending"} /> }, { key: "j", header: "Job", value: (x) => x.jobId ?? "", render: (x) => (x.jobId ? jobLink(x.jobId) : "—") }, { key: "m", header: "Remarks", value: (x) => x.remarks, render: (x) => <span className="small">{x.remarks}</span> }]} />
      </Panel>
    </>
  );
}

/* ======================= Allocation workbench (OP-53) ======================= */

export function AllocationPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const waiting = v.js.jobs.filter((j) => j.status === "pending_allocation" || j.status === "received");
  const [sel, setSel] = useState<string>(waiting[0]?.id ?? "");
  const cands = sel ? allocationCandidates(sel) : [];
  const awaiting = v.js.assignments.filter((a) => a.response === "awaiting");
  return (
    <>
      <SectionTitle title="Job allocation workbench" description="Compares candidates on the SOW's possible factors. No score, no weights and no automatic allocation until OP-53 defines the rules" actions={<DemoTag />} />
      <Notice tone="warn">Single or multiple technicians, acceptance window and no-acceptance handling are pending <DecisionLink id="OP-53" />. Settings below are inactive.</Notice>
      <PolicyMessages result={result} />
      <Panel padded={false} title="Jobs awaiting allocation">
        <DataTable rows={waiting} rowKey={(j) => j.id} caption="Awaiting allocation" searchable={false} onRowClick={(j) => setSel(j.id)} emptyTitle="No jobs awaiting allocation" columns={[{ key: "id", header: "Job", value: (j) => j.id, render: (j) => <span>{jobLink(j.id)}{j.id === sel ? " ◂" : ""}</span> }, { key: "l", header: "Customer location", value: (j) => j.payload.address.district ?? "", render: (j) => <span className="small">{j.payload.address.district ?? "Not supplied"} {j.payload.address.pincode ?? ""}</span> }, { key: "p", header: "Product", value: (j) => j.payload.product.name ?? "" }, { key: "t", header: "Job type", value: (j) => j.payload.jobType ?? "" }, { key: "tr", header: "Territory", value: (j) => j.payload.branchCode ?? "" }, { key: "e", header: "Territory-matched technicians", value: (j) => allocationCandidates(j.id).filter((c) => c.territory === "yes").length, align: "right" }, { key: "s", header: "Status", value: (j) => j.status, render: (j) => <Status s={j.status} /> }]} />
      </Panel>
      {sel && (
        <Panel padded={false} title={`Candidates for ${sel}`} subtitle="Eligibility stays Pending rule for every candidate">
          <DataTable rows={cands} rowKey={(c) => c.technicianId} caption="Candidates" searchable={false} columns={[
            { key: "t", header: "Technician", value: (c) => c.technicianId, render: (c) => <span>{memberLink(c.technicianId)} <span className="small muted">{c.name}</span></span> },
            { key: "tm", header: "Territory match", value: (c) => c.territory, render: (c) => label(c.territory) },
            { key: "v", header: "Verified flag", value: (c) => c.verified, render: (c) => label(c.verified) },
            { key: "s", header: "Required skill", value: (c) => c.skill, render: (c) => `${label(c.skill)} (no skill mapping)` },
            { key: "w", header: "Current workload", value: (c) => c.workload, render: (c) => `${c.workload} active demo job(s)`, align: "right" },
            { key: "e", header: "Eligibility", value: (c) => c.eligibility, render: () => <Status s="pending" /> },
            { key: "a", header: "", value: () => "", render: (c) => (v.can("proposed-scope:edit") ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(createDemoAssignment(v.uid, sel, c.technicianId), "Demo assignment recorded")}>Assign (demo)</button> : null) },
          ]} />
        </Panel>
      )}
      <Panel padded={false} title="Assignments awaiting technician response" subtitle="Simulated responses; no notification is sent">
        <DataTable rows={awaiting} rowKey={(a) => a.id} caption="Awaiting response" searchable={false} emptyTitle="None" columns={[{ key: "j", header: "Job", value: (a) => a.jobId, render: (a) => jobLink(a.jobId) }, { key: "t", header: "Technician", value: (a) => a.technicianId, render: (a) => memberLink(a.technicianId) }, { key: "n", header: "Notification", value: (a) => a.notification, render: () => "Not sent (demo)" }, { key: "x", header: "Simulate", value: () => "", render: (a) => <span className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(simulateTechnicianResponse(v.uid, a.jobId, "accepted"), "Accepted (simulated)")}>Accept</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(simulateTechnicianResponse(v.uid, a.jobId, "declined"), "Declined (simulated)")}>Decline</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(simulateTechnicianResponse(v.uid, a.jobId, "no_response"), "No response recorded")}>No response</button></span> }]} />
      </Panel>
      <Panel title="Allocation decision register (OP-53)">
        <dl className="dl-grid small"><dt>Factors</dt><dd>Territory, Verified / Exclusive status, skill or product type, current workload</dd><dt>Rule order / priority</dt><dd>Not agreed</dd><dt>Weights</dt><dd>Not agreed — none applied</dd><dt>Single / multi-technician mode</dt><dd>Not agreed (inactive)</dd><dt>Acceptance window</dt><dd>Not agreed (inactive)</dd><dt>No-acceptance handling</dt><dd>Not agreed — returns to manual allocation in the prototype</dd><dt>Confirmation status</dt><dd><Status s={decisionOf("OP-53").status} /></dd></dl>
      </Panel>
    </>
  );
}

/* ======================= Execution, evidence, Siebel, rewards ======================= */

export function ExecutionPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const rows = v.js.jobs.filter((j) => ["accepted", "in_progress"].includes(j.status));
  return (
    <>
      <SectionTitle title="Job execution monitoring" description="Job start (selfie + GPS) and completion as they would arrive from the technician app. The app screens are not built here; these are simulated events" actions={<DemoTag />} />
      <PolicyMessages result={result} />
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(j) => j.id} caption="Jobs in execution" searchable={false} emptyTitle="No accepted or in-progress jobs" columns={[
          { key: "j", header: "Job", value: (j) => j.id, render: (j) => jobLink(j.id) },
          { key: "t", header: "Technician", value: (j) => j.technicianId ?? "", render: (j) => memberLink(j.technicianId) },
          { key: "s", header: "Status", value: (j) => j.status, render: (j) => <Status s={j.status} /> },
          { key: "e", header: "Start evidence", value: (j) => j.start?.selfieRef ?? "", render: (j) => <span className="small">{j.start ? `${j.start.selfieRef} · GPS ${j.start.gps ? "captured" : "unavailable"}` : "Not started"}</span> },
          { key: "x", header: "Simulate", value: () => "", render: (j: ProposedJob) => (j.status === "accepted" ? <span className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(recordJobStart(v.uid, j.id, { selfieRef: `SELFIE-DEMO-${j.id}`, gps: { lat: 13.08, lng: 80.27 } }), "Job started (simulated)")}>Start with selfie + GPS</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(recordJobStart(v.uid, j.id, { selfieRef: `SELFIE-DEMO-${j.id}`, gps: null }), "")}>Start without GPS</button></span> : <span className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(submitCompletion(v.uid, j.id, [{ ref: `PHOTO-DEMO-${j.id}-1`, category: "Installed product" }]), "Completion submitted to mock Siebel")}>Submit completion</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(submitCompletion(v.uid, j.id, []), "")}>Submit without photos</button></span>) },
        ]} />
      </Panel>
    </>
  );
}

export function EvidencePage() {
  const v = useJobsView();
  const rows = v.js.jobs.filter((j) => j.start || j.photos.length);
  return (
    <>
      <SectionTitle title="Completion evidence" description="Evidence references only. Photographs and exact coordinates are not displayed; the number and type of mandatory photos are for V-Guard to define" actions={<DemoTag />} />
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(j) => j.id} caption="Evidence" columns={[
          { key: "j", header: "Job", value: (j) => j.id, render: (j) => jobLink(j.id) },
          { key: "t", header: "Technician", value: (j) => j.technicianId ?? "", render: (j) => memberLink(j.technicianId) },
          { key: "s", header: "Start selfie", value: (j) => j.start?.selfieRef ?? "", render: (j) => <span className="mono small">{j.start?.selfieRef ?? "—"}</span> },
          { key: "c", header: "Captured", value: (j) => j.start?.capturedAt ?? "", render: (j) => <span className="small">{dt(j.start?.capturedAt)}</span> },
          { key: "g", header: "Location validation", value: (j) => j.start?.locationStatus ?? "", render: (j) => <span className="small">{j.start ? label(j.start.locationStatus) : "—"}</span> },
          { key: "p", header: "Completion photos", value: (j) => j.photos.length, render: (j) => <span className="small">{j.photos.map((p) => `${p.ref} · ${p.category} · ${label(p.capture)}`).join("; ") || "—"}</span> },
          { key: "v", header: "Evidence status", value: (j) => j.photos[0]?.status ?? "", render: (j) => (j.photos.length ? label(j.photos[0].status) : "—") },
        ]} />
      </Panel>
    </>
  );
}

export function SiebelVerificationPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  return (
    <>
      <SectionTitle title="Siebel job verification" description="Proposed two-way Siebel job handshake (OP-52 / OP-55). Separate from the existing customer and warranty lookup integration, which is unchanged" actions={<DemoTag />} />
      <Notice tone="warn">No Siebel job API is connected. Wait period, no-response handling, rejection codes and the effect on points are pending <DecisionLink id="OP-52" label="OP-52 / OP-55" />. Until then nothing is approved or rejected automatically.</Notice>
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title={SIEBEL_JOB_INTEGRATION.name}>
          <dl className="dl-grid small">{Object.entries({ Reference: SIEBEL_JOB_INTEGRATION.ref, Source: SIEBEL_JOB_INTEGRATION.source, Destination: SIEBEL_JOB_INTEGRATION.destination, "Inbound job creation": SIEBEL_JOB_INTEGRATION.inbound, "Outbound completion": SIEBEL_JOB_INTEGRATION.outbound, "Inbound confirmation": SIEBEL_JOB_INTEGRATION.confirmation, Authentication: SIEBEL_JOB_INTEGRATION.auth, "Contract status": SIEBEL_JOB_INTEGRATION.contract, Health: SIEBEL_JOB_INTEGRATION.health, "Last request": dt(v.js.submissions.slice(-1)[0]?.submittedAt), "Last response": dt(v.js.callbacks.slice(-1)[0]?.at), "Existing lookup integration": SIEBEL_JOB_INTEGRATION.separateFrom }).map(([k, x]) => <Fragment key={k}><dt>{k}</dt><dd>{x}</dd></Fragment>)}</dl>
          <p className="small"><Link to="/monitoring/integrations/directory/INT-SIEBEL">Siebel lookup integration</Link> · <Link to="/monitoring/integrations/trace">Message trace</Link> · <Link to="/monitoring/integrations/failures">Failed requests</Link></p>
        </Panel>
        <Panel title="Draft contracts" subtitle="Proposed fields; not approved by V-Guard or Siebel">
          <p className="small"><strong>Inbound job (Siebel → platform)</strong></p>
          <ul className="small">{INBOUND_CONTRACT.map((f) => <li key={f.field}><span className="mono">{f.field}</span> — {f.meaning}</li>)}</ul>
          <p className="small"><strong>Completion submission (platform → Siebel)</strong></p>
          <ul className="small">{OUTBOUND_CONTRACT.map((f) => <li key={f.field}><span className="mono">{f.field}</span> — {f.meaning}</li>)}</ul>
          <p className="small muted">Outcomes: pending, confirmed, rejected, integration error, timeout, awaiting manual resolution. Final rejection codes are not invented.</p>
        </Panel>
      </div>
      <Panel padded={false} title="Completion submissions">
        <DataTable rows={[...v.js.submissions].reverse()} rowKey={(s) => s.id} caption="Submissions" searchable={false} columns={[
          { key: "id", header: "Request", value: (s) => s.id, render: (s) => <span className="mono small">{s.id}</span> },
          { key: "j", header: "Job", value: (s) => s.jobId, render: (s) => jobLink(s.jobId) },
          { key: "at", header: "Submitted", value: (s) => s.submittedAt, render: (s) => <span className="small">{dt(s.submittedAt)}</span> },
          { key: "r", header: "Response", value: (s) => s.respondedAt ?? "", render: (s) => <span className="small">{dt(s.respondedAt)}</span> },
          { key: "res", header: "Result", value: (s) => s.result, render: (s) => <Status s={s.result} /> },
          { key: "rr", header: "Rejection reason / error", value: (s) => s.rejectionReason ?? s.errorRef ?? "", render: (s) => <span className="small">{s.rejectionReason ?? s.errorRef ?? "—"}</span> },
          { key: "rt", header: "Retry", value: (s) => s.retry, render: (s) => <span className="small">{label(s.retry)}</span> },
          { key: "x", header: "Mock Siebel response", value: () => "", render: (s) => (s.result === "pending" || s.result === "timeout" || s.result === "integration_error" ? <span className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(siebelCallback(v.uid, { requestRef: s.id, result: "confirmed", confirmationRef: `SBL-CNF-${s.id}` }), "Confirmed (mock)")}>Confirm</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(siebelCallback(v.uid, { requestRef: s.id, result: "rejected", rejectionReason: "Demo rejection" }), "Rejected (mock)")}>Reject</button>{s.result === "pending" && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(recordSiebelTimeout(v.uid, s.id), "No response recorded")}>No response</button>}</span> : <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(siebelCallback(v.uid, { requestRef: s.id, result: s.result as "confirmed" }), "Duplicate callback")}>Repeat callback</button>) },
        ]} />
      </Panel>
      <div className="grid-2">
        <Panel padded={false} title="Callback history">
          <DataTable rows={[...v.js.callbacks].reverse()} rowKey={(c) => c.id} caption="Callbacks" searchable={false} columns={[{ key: "id", header: "Callback", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> }, { key: "r", header: "Request", value: (c) => c.requestRef }, { key: "res", header: "Result", value: (c) => c.result, render: (c) => <Status s={c.result} /> }, { key: "o", header: "Outcome", value: (c) => c.outcome, render: (c) => label(c.outcome) }]} />
        </Panel>
        <Panel padded={false} title="Integration exceptions">
          <DataTable rows={[...v.js.exceptions].reverse()} rowKey={(x) => x.id} caption="Exceptions" searchable={false} columns={[{ key: "id", header: "Exception", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> }, { key: "k", header: "Kind", value: (x) => x.kind, render: (x) => label(x.kind) }, { key: "r", header: "Reference", value: (x) => x.ref, render: (x) => <span className="mono small">{x.ref}</span> }, { key: "n", header: "Note", value: (x) => x.note, render: (x) => <span className="small">{x.note}</span> }]} />
        </Panel>
      </div>
    </>
  );
}

export function RewardMonitoringPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const [c, setC] = useState({ jobType: "installation" as JobType, points: "", effectiveFrom: "", territory: "" });
  return (
    <>
      <SectionTitle title="Job reward monitoring" description="Rewards become eligible only after Siebel confirms. Processing is simulated through the existing wallet service; nothing is credited" actions={<DemoTag />} />
      <Notice tone="warn">Whether job rewards reuse the Scheme Engine or a separate set-up is pending <DecisionLink id="OP-56" />. Configurations stay draft and cannot be activated.</Notice>
      <PolicyMessages result={result} />
      <Panel padded={false} title="Rewards">
        <DataTable rows={v.js.rewards} rowKey={(r) => r.jobId} caption="Job rewards" searchable={false} emptyTitle="No rewards yet" columns={[
          { key: "j", header: "Job", value: (r) => r.jobId, render: (r) => jobLink(r.jobId) },
          { key: "t", header: "Technician", value: (r) => r.technicianId, render: (r) => memberLink(r.technicianId) },
          { key: "c", header: "Configuration", value: (r) => r.configId ?? "", render: (r) => <span className="small">{r.configId ?? "—"}</span> },
          { key: "p", header: "Expected points", value: (r) => r.expectedPoints ?? -1, render: (r) => r.expectedPoints ?? "—", align: "right" },
          { key: "s", header: "Status", value: (r) => r.status, render: (r) => <Status s={r.status} /> },
          { key: "cf", header: "Siebel confirmation", value: (r) => r.siebelConfirmationRef ?? "", render: (r) => <span className="mono small">{r.siebelConfirmationRef ?? "—"}</span> },
          { key: "l", header: "Ledger / wallet", value: (r) => r.simulatedLedgerRef ?? "", render: (r) => <span className="small">{r.simulatedLedgerRef ? `${r.simulatedLedgerRef} · ${r.walletRef}` : "—"}</span> },
          { key: "x", header: "", value: () => "", render: (r) => <span className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(simulateRewardProcessing(v.uid, r.jobId), "Processed (simulation)")}>Simulate processing</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(creditJobReward(v.uid, r.jobId), "")}>Credit</button></span> },
        ]} />
      </Panel>
      <div className="grid-2">
        <Panel padded={false} title="Draft reward configurations" subtitle="Demo values; not a proposal">
          <DataTable rows={v.js.rewardConfigs} rowKey={(r) => r.id} caption="Reward configurations" searchable={false} columns={[{ key: "id", header: "Config", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> }, { key: "t", header: "Job type", value: (r) => r.jobType }, { key: "p", header: "Points", value: (r) => r.points, align: "right" }, { key: "tr", header: "Territory", value: (r) => r.territory ?? "", render: (r) => r.territory ?? "Any" }, { key: "e", header: "Effective", value: (r) => r.effectiveFrom }, { key: "s", header: "Status", value: (r) => r.status, render: (r) => <span className="btn-row"><Status s={r.status} /><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(activateRewardConfig(v.uid, r.id), "")}>Activate</button></span> }]} />
          <div className="panel--pad">
            <div className="form-grid">
              <SelectInput label="Job type" value={c.jobType} onChange={(x) => setC({ ...c, jobType: x as JobType })} options={[{ value: "installation", label: "Installation" }, { value: "service", label: "Service" }]} />
              <TextField label="Points" value={c.points} onChange={(x) => setC({ ...c, points: x })} inputMode="numeric" />
              <TextField label="Territory (branch code, optional)" value={c.territory} onChange={(x) => setC({ ...c, territory: x })} />
              <TextField label="Effective from" type="date" value={c.effectiveFrom} onChange={(x) => setC({ ...c, effectiveFrom: x })} />
            </div>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => run(createRewardConfigDraft(v.uid, { jobType: c.jobType, points: Number(c.points), effectiveFrom: c.effectiveFrom, territory: c.territory || null }), "Draft saved")}>Save draft</button>
          </div>
        </Panel>
        <Panel padded={false} title="Scheme Engine compatibility (OP-56)" subtitle="Inspected in features/schemes before building">
          <DataTable rows={SCHEME_COMPATIBILITY} rowKey={(r) => r.aspect} caption="Scheme compatibility" searchable={false} columns={[{ key: "a", header: "Aspect", value: (r) => r.aspect, render: (r) => <strong>{r.aspect}</strong> }, { key: "e", header: "Existing", value: (r) => r.existing, render: (r) => <span className="small">{r.existing}</span> }, { key: "f", header: "Fits", value: (r) => r.fit, render: (r) => <Status s={r.fit === "yes" ? "confirmed" : "rejected"} /> }, { key: "g", header: "Gap", value: (r) => r.gap, render: (r) => <span className="small">{r.gap}</span> }]} />
        </Panel>
      </div>
    </>
  );
}
