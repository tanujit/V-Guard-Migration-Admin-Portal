import { Fragment, useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars } from "@/components/ui/DataBars";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { useSchemeState } from "@/features/schemes/store";
import { FLAG_CAPABILITIES, HAPPY_CONFIG, createFeedbackLink, deliverEidCard, grantVerificationFlag, previewEidCard, revokeVerificationFlag, sendFeedbackLink, simulateFeedback, technicians } from "@/features/jobs/store";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { DecisionLink, DemoTag, Status, Tile, dt, jobLink, label, memberLink, useJobsView, useRun, userName } from "./shared";

const ACTIVE = ["assigned", "accepted", "in_progress"];

export function TechnicianDirectoryPage() {
  const v = useJobsView();
  const techs = technicians();
  return (
    <>
      <SectionTitle title="Technician directory" description="Service Technicians from Member Management (ST members with an app account). Read only: the member record is not copied" actions={<DemoTag />} />
      <Panel padded={false}>
        <DataTable rows={techs} rowKey={(t) => t.id} caption="Technicians" columns={[
          { key: "id", header: "Technician", value: (t) => t.id, render: (t) => <span>{memberLink(t.id)} <span className="small">{t.name}</span></span> },
          { key: "b", header: "Branch", value: (t) => t.branchCode },
          { key: "d", header: "Territory (working district)", value: (t) => t.addresses.working?.district ?? "", render: (t) => t.addresses.working?.district ?? <span className="muted small">Not recorded</span> },
          { key: "s", header: "Skill mapping", value: () => "", render: () => <span className="muted small">None (OP-53)</span> },
          { key: "v", header: "Verified / Exclusive", value: (t) => (v.js.flags.some((f) => f.technicianId === t.id && f.status === "demo_granted") ? 1 : 0), render: (t) => (v.js.flags.some((f) => f.technicianId === t.id && f.status === "demo_granted") ? <Status s="demo_granted" /> : "No") },
          { key: "w", header: "Active demo jobs", value: (t) => v.js.jobs.filter((j) => j.technicianId === t.id && ACTIVE.includes(j.status)).length, align: "right" },
          { key: "c", header: "Completed (confirmed)", value: (t) => v.js.jobs.filter((j) => j.technicianId === t.id && j.status === "confirmed").length, align: "right" },
        ]} />
      </Panel>
    </>
  );
}

export function VerificationPage() {
  const v = useJobsView();
  const ss = useSchemeState();
  const { result, run } = useRun();
  const techs = technicians();
  const [g, setG] = useState({ tech: techs[0]?.id ?? "", reason: "", from: "", to: "" });
  const [rev, setRev] = useState("");
  const tierOf = (_id: string) => ss.tiers.filter((t) => t.programme === "ST" && t.status === "active").length ? "See Tier Master" : "No active ST tiers";
  return (
    <>
      <SectionTitle title="Technician verification status" description="The Verified / Exclusive flag is granted by V-Guard on its own criteria. It is not a tier and is never derived from one" actions={<DemoTag />} />
      <Notice tone="warn">Who sets the flag, the qualification, expiry and every benefit are pending <DecisionLink id="OP-58" />. Flags here are demo records and unlock nothing.</Notice>
      <PolicyMessages result={result} />
      <Panel padded={false} title="Verification directory">
        <DataTable rows={techs} rowKey={(t) => t.id} caption="Verification" columns={[
          { key: "id", header: "Technician", value: (t) => t.id, render: (t) => <span>{memberLink(t.id)} <span className="small">{t.name}</span></span> },
          { key: "p", header: "Programme", value: (t) => t.programme },
          { key: "b", header: "Branch / territory", value: (t) => t.branchCode, render: (t) => <span className="small">{t.branchCode} · {t.addresses.working?.district ?? "—"}</span> },
          { key: "tier", header: "Current tier", value: (t) => tierOf(t.id), render: (t) => <span className="small muted">{tierOf(t.id)}</span> },
          { key: "f", header: "Flag", value: (t) => v.js.flags.find((f) => f.technicianId === t.id)?.status ?? "", render: (t) => { const f = [...v.js.flags].reverse().find((x) => x.technicianId === t.id); return f ? <span className="small"><Status s={f.status} /> {f.effectiveFrom} → {f.expiresOn ?? "no expiry set"}<br /><span className="muted">by {userName(v.acc, f.grantedBy)} · approval pending OP-58</span></span> : <span className="muted small">None</span>; } },
        ]} />
      </Panel>
      <div className="grid-2">
        {v.can("proposed-scope:manage") && (
          <Panel title="Grant a flag (demo)">
            <div className="form-grid">
              <SelectInput label="Technician" value={g.tech} onChange={(x) => setG({ ...g, tech: x })} options={techs.map((t) => ({ value: t.id, label: `${t.id} ${t.name}` }))} />
              <TextField label="Effective from" type="date" value={g.from} onChange={(x) => setG({ ...g, from: x })} />
              <TextField label="Expiry (if any)" type="date" value={g.to} onChange={(x) => setG({ ...g, to: x })} hint="Whether flags expire is pending OP-58" />
              <TextArea label="Reason" value={g.reason} onChange={(x) => setG({ ...g, reason: x })} rows={2} />
            </div>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => run(grantVerificationFlag(v.uid, g.tech, { reason: g.reason, effectiveFrom: g.from || "2026-12-01", expiresOn: g.to || null }), "Flag granted (demo)")}>Grant (demo)</button>
          </Panel>
        )}
        <Panel padded={false} title="Flag history">
          <DataTable rows={v.js.flags.flatMap((f) => f.history.map((h, i) => ({ ...h, id: `${f.id}-${i}`, flagId: f.id, technicianId: f.technicianId, status: f.status })))} rowKey={(h) => h.id} caption="Flag history" searchable={false} emptyTitle="No flags yet" columns={[{ key: "f", header: "Flag", value: (h) => h.flagId, render: (h) => <span className="mono small">{h.flagId}</span> }, { key: "t", header: "Technician", value: (h) => h.technicianId, render: (h) => memberLink(h.technicianId) }, { key: "c", header: "Change", value: (h) => h.change, render: (h) => <span className="small">{h.change}</span> }, { key: "at", header: "At", value: (h) => h.at, render: (h) => <span className="small">{dt(h.at)}</span> }, { key: "x", header: "", value: () => "", render: (h) => (h.status === "demo_granted" && v.can("proposed-scope:manage") ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(revokeVerificationFlag(v.uid, h.flagId, rev || "Revoked in prototype"), "Flag revoked")}>Revoke</button> : null) }]} />
          <div className="panel--pad"><TextField label="Revocation reason" value={rev} onChange={setRev} /></div>
        </Panel>
      </div>
      <Panel padded={false} title="Capability mappings" subtitle="What the flag may unlock (SOW 12.6). All inactive">
        <DataTable rows={FLAG_CAPABILITIES} rowKey={(c) => c.id} caption="Flag capabilities" searchable={false} columns={[{ key: "k", header: "Area", value: (c) => c.kind, render: (c) => label(c.kind) }, { key: "d", header: "Benefit", value: (c) => c.description }, { key: "a", header: "Status", value: () => "inactive", render: () => <Status s="inactive" /> }]} />
      </Panel>
    </>
  );
}

export function TechnicianPerformancePage() {
  const v = useJobsView();
  const rows = technicians().map((t) => {
    const j = v.js.jobs.filter((x) => x.technicianId === t.id);
    const r = v.js.rewards.filter((x) => x.technicianId === t.id);
    return { id: t.id, name: t.name, district: t.addresses.working?.district ?? "—", completed: j.filter((x) => x.status === "confirmed").length, inProgress: j.filter((x) => ACTIVE.includes(x.status)).length, awaiting: j.filter((x) => x.status === "awaiting_siebel").length, pending: r.filter((x) => x.status === "pending" || x.status === "eligible").reduce((n, x) => n + (x.expectedPoints ?? 0), 0), confirmed: r.filter((x) => x.status === "simulated_credit").reduce((n, x) => n + (x.expectedPoints ?? 0), 0), installation: j.filter((x) => x.payload.jobType === "installation").length, service: j.filter((x) => x.payload.jobType === "service").length };
  }).filter((x) => x.completed + x.inProgress + x.awaiting + x.installation + x.service);
  return (
    <>
      <SectionTitle title="Technician performance" description="Administrative preview of the proposed technician dashboard (the member-app screen is not built). Reward points shown here are demo values, never wallet balances" actions={<DemoTag />} />
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Technician performance" searchable={false} emptyTitle="No demo jobs" columns={[
          { key: "t", header: "Technician", value: (r) => r.id, render: (r) => <span>{memberLink(r.id)} <span className="small">{r.name}</span></span> },
          { key: "c", header: "Jobs completed", value: (r) => r.completed, align: "right" },
          { key: "i", header: "In progress", value: (r) => r.inProgress, align: "right" },
          { key: "a", header: "Awaiting Siebel", value: (r) => r.awaiting, align: "right" },
          { key: "p", header: "Reward points pending", value: (r) => r.pending, align: "right" },
          { key: "s", header: "Reward points (simulated)", value: (r) => r.confirmed, align: "right" },
          { key: "jt", header: "Installation / service", value: (r) => r.installation, render: (r) => `${r.installation} / ${r.service}` },
          { key: "d", header: "Territory", value: (r) => r.district },
        ]} />
      </Panel>
      <div className="grid-2">
        <Panel title="Job type distribution"><RankedBars items={[{ key: "i", label: "Installation", value: v.js.jobs.filter((j) => j.payload.jobType === "installation").length }, { key: "s", label: "Service", value: v.js.jobs.filter((j) => j.payload.jobType === "service").length }]} /></Panel>
        <Panel title="Earnings trend" subtitle="Not available: no job reward has been credited (demo mode)"><p className="muted small">Not available</p></Panel>
      </div>
    </>
  );
}

export function EidCardPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const techs = technicians();
  const [tech, setTech] = useState(techs[0]?.id ?? "");
  const card = previewEidCard(tech);
  const job = v.js.jobs.find((j) => j.technicianId === tech);
  return (
    <>
      <SectionTitle title="Technician E-ID card" description="A card the customer could receive to identify the visiting technician (SOW 12.7). Customers are not loyalty members; this is a new audience" actions={<DemoTag />} />
      <Notice tone="warn">Delivery is blocked. Card content, timing (before or during the visit), channel, customer consent (DPDP) and retention are pending <DecisionLink id="OP-59" />.</Notice>
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title="Card preview" actions={<SelectInput label="Technician" value={tech} onChange={setTech} options={techs.map((t) => ({ value: t.id, label: t.id }))} />}>
          {card && (
            <div className="eid-card" aria-label="E-ID card preview">
              <div className="eid-card__brand">V-Guard · Service Technician</div>
              <div className="eid-card__photo" aria-hidden="true">Photo</div>
              <div className="eid-card__name">{card.name}</div>
              <div className="eid-card__id mono">{card.technicianId}</div>
              {card.verified !== "Not shown" && <div className="eid-card__flag"><BadgeCheck size={14} aria-hidden="true" />{card.verified}</div>}
              <div className="eid-card__foot">Demo preview — not an issued card</div>
            </div>
          )}
          {card && <dl className="dl-grid small"><dt>Photograph</dt><dd>{card.photo}</dd><dt>Validity</dt><dd>{card.validity}</dd><dt>QR / verification</dt><dd>{card.qr}</dd><dt>Not shown</dt><dd>Mobile number, address, KYC details</dd></dl>}
        </Panel>
        <Panel title="Customer delivery (draft)">
          <dl className="dl-grid small"><dt>Associated job</dt><dd>{job ? jobLink(job.id) : "—"}</dd><dt>Customer contact</dt><dd>Masked reference only</dd><dt>Proposed channel</dt><dd>WhatsApp (not approved)</dd><dt>Consent status</dt><dd>Not captured</dd><dt>Consent timestamp / source / record</dt><dd>—</dd><dt>Purpose</dt><dd>Identify the visiting technician</dd><dt>Withdrawal</dt><dd>Not supported yet</dd><dt>Timing</dt><dd>Pending OP-59</dd><dt>Template</dt><dd>None approved</dd></dl>
          {job && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(deliverEidCard(v.uid, job.id), "")}>Send to customer</button>}
        </Panel>
      </div>
      <Panel padded={false} title="Delivery history" subtitle="Blocked attempts are recorded">
        <DataTable rows={v.js.eidDeliveries} rowKey={(x) => x.id} caption="E-ID deliveries" searchable={false} emptyTitle="No attempts" columns={[{ key: "id", header: "Attempt", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> }, { key: "j", header: "Job", value: (x) => x.jobId, render: (x) => jobLink(x.jobId) }, { key: "c", header: "Consent", value: (x) => x.consent.status, render: (x) => label(x.consent.status) }, { key: "o", header: "Outcome", value: (x) => x.outcome, render: (x) => <Status s={x.outcome} /> }, { key: "r", header: "Reason", value: (x) => x.reason, render: (x) => <span className="small">{x.reason}</span> }]} />
      </Panel>
    </>
  );
}

export function HappyPointsPage() {
  const v = useJobsView();
  const { result, run } = useRun();
  const [rating, setRating] = useState(5);
  const confirmed = v.js.jobs.filter((j) => j.status === "confirmed" && !v.js.feedbackLinks.some((l) => l.jobId === j.id));
  const link = v.js.feedbackLinks.find((l) => !l.submissionId) ?? v.js.feedbackLinks[0];
  const job = link && v.js.jobs.find((j) => j.id === link.jobId);
  return (
    <>
      <SectionTitle title="Happy Points" description="End-customer feedback after a job, through a simple web page (SOW 12.5). Separate from the member N06 survey" actions={<DemoTag />} />
      <Notice tone="warn">The link channel (WhatsApp or SMS), the questions, how answers become Happy Points and who receives them are pending <DecisionLink id="OP-57" />. No microsite is published and no link is sent.</Notice>
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Feedback links created" value={v.js.feedbackLinks.length} /><Tile label="Feedback links sent" value={0} sub="Messaging disabled" /><Tile label="Feedback submitted" value={v.js.feedback.length} sub="Simulated" /><Tile label="Feedback pending" value={v.js.feedbackLinks.filter((l) => !l.submissionId).length} /><Tile label="Linked to jobs" value={v.js.feedback.length} /><Tile label="Happy Points pending decision" value={v.js.feedback.length} /><Tile label="Happy Points credited" value={0} sub="No conversion rule" />
      </div>
      <div className="grid-2">
        <Panel title="Microsite preview" subtitle={HAPPY_CONFIG.microsite}>
          <div className="happy-preview">
            <div className="happy-preview__brand">V-Guard</div>
            <p>How was your {job?.payload.jobType ?? "service"} visit?</p>
            <p className="small muted">Technician {link?.technicianId ?? "—"} · Job {link?.jobId ?? "—"}</p>
            <div className="happy-preview__stars" role="radiogroup" aria-label="Rating (preview scale)">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} className={`happy-star ${n <= rating ? "is-on" : ""}`} onClick={() => setRating(n)} aria-label={`${n}`}><Star size={20} aria-hidden="true" /></button>)}</div>
            <p className="small muted">Comment (optional)</p>
            <button type="button" className="btn btn--primary btn--sm" disabled={!link} onClick={() => run(simulateFeedback(v.uid, link!.id, rating, "Demo comment"), "Feedback recorded (simulated)")}>Submit (simulated)</button>
          </div>
        </Panel>
        <Panel title="Form configuration (draft)">
          <dl className="dl-grid small">{HAPPY_CONFIG.fields.map((f) => <Fragment key={f.key}><dt>{f.label}</dt><dd>{"note" in f ? f.note : "Proposed field"}</dd></Fragment>)}<dt>Channel</dt><dd>{HAPPY_CONFIG.channel}</dd><dt>Rating → Happy Points</dt><dd>Not defined (no conversion is calculated)</dd><dt>Beneficiary</dt><dd>Not defined</dd></dl>
          <p className="small muted">The final questions are for V-Guard to confirm. No question is mandatory in this draft.</p>
        </Panel>
      </div>
      <Panel padded={false} title="Prepare a feedback link" subtitle="Only Siebel-confirmed jobs">
        <DataTable rows={confirmed} rowKey={(j) => j.id} caption="Confirmed jobs without a link" searchable={false} emptyTitle="Every confirmed job has a link" columns={[{ key: "j", header: "Job", value: (j) => j.id, render: (j) => jobLink(j.id) }, { key: "t", header: "Technician", value: (j) => j.technicianId ?? "", render: (j) => memberLink(j.technicianId) }, { key: "x", header: "", value: () => "", render: (j) => <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(createFeedbackLink(v.uid, j.id), "Link prepared (not sent)")}>Prepare link</button> }]} />
      </Panel>
      <Panel padded={false} title="Feedback links">
        <DataTable rows={v.js.feedbackLinks} rowKey={(l) => l.id} caption="Feedback links" searchable={false} emptyTitle="No links" columns={[{ key: "id", header: "Link", value: (l) => l.id, render: (l) => <span className="mono small">{l.id}</span> }, { key: "j", header: "Job", value: (l) => l.jobId, render: (l) => jobLink(l.jobId) }, { key: "d", header: "Delivery", value: (l) => l.delivery, render: () => "Not sent (disabled)" }, { key: "s", header: "Submission", value: (l) => l.submissionId ?? "", render: (l) => l.submissionId ?? "Pending" }, { key: "x", header: "", value: () => "", render: (l) => <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(sendFeedbackLink(v.uid, l.id), "")}>Send to customer</button> }]} />
      </Panel>
    </>
  );
}

export function CustomerFeedbackPage() {
  const v = useJobsView();
  return (
    <>
      <SectionTitle title="Customer feedback" description="Simulated submissions linked to job and technician. Not real customer data" actions={<DemoTag />} />
      <Panel padded={false}>
        <DataTable rows={[...v.js.feedback].reverse()} rowKey={(f) => f.id} caption="Feedback history" emptyTitle="No feedback yet — submit one from the Happy Points preview" columns={[{ key: "id", header: "Feedback", value: (f) => f.id, render: (f) => <span className="mono small">{f.id}</span> }, { key: "at", header: "Submitted", value: (f) => f.at, render: (f) => <span className="small">{dt(f.at)}</span> }, { key: "j", header: "Job", value: (f) => f.jobId, render: (f) => jobLink(f.jobId) }, { key: "t", header: "Technician", value: (f) => f.technicianId, render: (f) => memberLink(f.technicianId) }, { key: "r", header: "Rating (preview scale)", value: (f) => f.rating, align: "right" }, { key: "c", header: "Comment", value: (f) => f.comment, render: (f) => <span className="small">{f.comment || "—"}</span> }, { key: "h", header: "Happy Points", value: (f) => f.happyPoints, render: (f) => <span className="small">{label(f.happyPoints)}</span> }]} />
      </Panel>
    </>
  );
}
