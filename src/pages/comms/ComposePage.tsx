import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Save, Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SelectField } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, RadioCards, SelectInput, Stepper, TextArea, TextField } from "@/components/form/Form";
import { CHANNEL, CHANNELS, DEEP_LINKS, PROGRAMMES, SEED_CATALOGUE } from "@/config/commsCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { activeVersion, render, resolveAudience, validateComposition, EMPTY_FILTER } from "@/features/comms/engine";
import { saveCommunication, submitCommunication } from "@/features/comms/store";
import type { AudienceFilter, Channel, Communication } from "@/types/comms";
import { PolicyMessages } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { CBASE, ChannelTag, PhonePreview, useCommsView, useRun, type CommsView } from "./shared";

const STEPS = ["Details", "Audience", "Channels", "Template", "Schedule", "Review"];
const STATUS_OPTS = [{ value: "active", label: "Active member (scan enabled)" }, { value: "pending_kyc", label: "Pending KYC" }, { value: "redemption_eligible", label: "Redemption eligible" }, { value: "scan_enabled", label: "Scan enabled" }];

const blank = (uid: string, now: string): Communication => ({ id: "", name: "", description: "", mode: "manual", notificationId: null, category: "scheme_announcement", purpose: "", priority: "normal", audience: { ...EMPTY_FILTER }, audienceCount: 0, channels: ["inapp"], languages: ["en"], templateIds: [], deepLink: null, scheduledAt: null, justification: "", status: "draft", approvalRequestId: null, eventId: null, createdBy: uid, createdAt: now, dispatchedAt: null, cancelledAt: null, manualContent: { subject: "", title: "", body: "" }, version: 0 });

export function ComposePage() {
  const v = useCommsView();
  const nav = useNavigate();
  const { result, run } = useRun();
  const [step, setStep] = useState(0);
  const [maxStep, setMax] = useState(0);
  const [c, setC] = useState<Communication>(() => blank(v.uid, v.now));
  const [useTemplate, setUseTemplate] = useState(false);
  const set = (p: Partial<Communication>) => setC((x) => ({ ...x, ...p }));
  const setF = (p: Partial<AudienceFilter>) => set({ audience: { ...c.audience, ...p } });
  const check = useMemo(() => validateComposition(v.cs, v.mem, c, v.inScope, v.now), [v.cs, v.mem, c, v.inScope, v.now]);
  const go = (i: number) => { setStep(i); setMax((m) => Math.max(m, i)); };
  const save = (submit: boolean) => {
    const s = run(saveCommunication(v.uid, c), "Draft saved");
    if (!s.ok) return;
    set({ id: s.id! });
    if (submit) {
      const r = run(submitCommunication(v.uid, s.id!), "Submitted: approval or scheduling follows the configured policy");
      if (r.ok) nav(`${CBASE}/history/${s.id}`);
    }
  };
  const canCreate = v.can("communication:create");
  return (
    <>
      {!canCreate && <Notice tone="warn">You can view communications but not create them (Communication centre: Create).</Notice>}
      <Stepper steps={STEPS} current={step} onSelect={go} maxReached={maxStep} />
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title={`Step ${step + 1} · ${STEPS[step]}`}>
          {step === 0 && <StepDetails c={c} set={set} />}
          {step === 1 && <StepAudience v={v} c={c} setF={setF} />}
          {step === 2 && <StepChannels c={c} set={set} />}
          {step === 3 && <StepTemplate v={v} c={c} set={set} useTemplate={useTemplate} setUseTemplate={setUseTemplate} />}
          {step === 4 && <StepSchedule v={v} c={c} set={set} />}
          {step === 5 && <StepReview c={c} check={check} />}
          <div className="btn-row wizard-nav">
            {step > 0 && <button type="button" className="btn btn--secondary" onClick={() => go(step - 1)}><ArrowLeft size={14} aria-hidden="true" />Back</button>}
            {step < STEPS.length - 1 && <button type="button" className="btn btn--primary" onClick={() => go(step + 1)}>Next<ArrowRight size={14} aria-hidden="true" /></button>}
            {step === STEPS.length - 1 && canCreate && (
              <>
                <button type="button" className="btn btn--secondary" onClick={() => save(false)}><Save size={14} aria-hidden="true" />Save draft</button>
                <button type="button" className="btn btn--primary" disabled={!check.ok} onClick={() => save(true)}><Send size={14} aria-hidden="true" />{c.scheduledAt ? "Submit and schedule" : "Submit"}</button>
              </>
            )}
          </div>
        </Panel>
        <Panel title="Live check" subtitle={`${check.audience.included.length} eligible recipients`}>
          {check.errors.length ? <ul className="plain-list small neg">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul> : <p className="small pos">All checks pass</p>}
          {check.warnings.length > 0 && <ul className="plain-list small warn-text">{check.warnings.map((e) => <li key={e}>{e}</li>)}</ul>}
          <p className="small muted">Approval follows the configured policy (Configuration → Approval policies). Approval never dispatches: sending needs Communication: Execute or the scheduler.</p>
        </Panel>
      </div>
    </>
  );
}

function StepDetails({ c, set }: { c: Communication; set: (p: Partial<Communication>) => void }) {
  return (
    <>
      <RadioCards name="mode" label="Dispatch mode" value={c.mode} onChange={(m) => set({ mode: m, scheduledAt: m === "manual" ? null : c.scheduledAt })} options={[{ value: "manual", label: "Manual", description: "Composed for a validated audience" }, { value: "scheduled", label: "Event / scheduled", description: "Dispatched by the scheduler at a set time" }, { value: "rule", label: "Rule-based", description: "Configured on a catalogue event (Automated rules)" }]} />
      {c.mode === "rule" && <Notice tone="info">Rule-based messages fire from authoritative events. Configure them in <Link to={`${CBASE}/rules`}>Automated rules</Link> and the <Link to={`${CBASE}/catalogue`}>Notification catalogue</Link>; new live triggers cannot be created without an event definition.</Notice>}
      <div className="form-grid form-grid--2">
        <TextField label="Communication name" value={c.name} onChange={(x) => set({ name: x })} required />
        <SelectInput label="Notification catalogue entry" value={c.notificationId ?? ""} onChange={(x) => set({ notificationId: (x || null) as Communication["notificationId"] })} options={[{ value: "", label: "None (manual category)" }, ...SEED_CATALOGUE.filter((e) => ["N04", "N06", "N10"].includes(e.id)).map((e) => ({ value: e.id, label: `${e.id} · ${e.name}` }))]} hint="Manual sends may use N04, N06 or N10; other entries are event-driven" />
        <SelectInput label="Message category" value={c.category} onChange={(x) => set({ category: x })} options={[{ value: "scheme_announcement", label: "Scheme announcement" }, { value: "engagement", label: "Engagement / promotional" }, { value: "compliance", label: "Compliance reminder" }]} />
        <SelectInput label="Priority" value={c.priority} onChange={(x) => set({ priority: x as Communication["priority"] })} options={[{ value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
      </div>
      <TextField label="Business purpose" value={c.purpose} onChange={(x) => set({ purpose: x })} required />
      <TextArea label="Description" value={c.description} onChange={(x) => set({ description: x })} rows={2} />
      {c.mode === "manual" && <TextArea label="Business justification" value={c.justification} onChange={(x) => set({ justification: x })} rows={2} required />}
    </>
  );
}

export function AudienceBuilder({ v, f, setF, channels = [] }: { v: CommsView; f: AudienceFilter; setF: (p: Partial<AudienceFilter>) => void; channels?: Channel[] }) {
  const a = resolveAudience(v.mem, f, v.inScope, channels);
  const states = GEOGRAPHY.filter((g) => v.mem.members.some((m) => m.branchCode.startsWith(`${g.code}-`)));
  const branches = GEOGRAPHY.filter((g) => !f.states.length || f.states.includes(g.code)).flatMap((g) => g.districts.flatMap((d) => d.branches.map((b) => ({ value: b.code, label: `${b.name} · ${d.name}`, group: g.name }))));
  return (
    <>
      <div className="form-grid form-grid--2">
        <MultiSelect label="Programme" options={PROGRAMMES.map((p) => ({ value: p, label: p }))} value={f.programmes} onChange={(x) => setF({ programmes: x as AudienceFilter["programmes"] })} placeholder="All programmes" />
        <MultiSelect label="State" options={states.map((s) => ({ value: s.code, label: s.name }))} value={f.states} onChange={(x) => setF({ states: x, branches: [] })} placeholder="All states" />
        <MultiSelect label="Branch" options={branches} value={f.branches} onChange={(x) => setF({ branches: x })} placeholder="All branches" />
        <MultiSelect label="Member status" options={STATUS_OPTS} value={f.statuses} onChange={(x) => setF({ statuses: x as AudienceFilter["statuses"] })} placeholder="Any status" />
        <MultiSelect label="Member role" options={Array.from(new Set(v.mem.members.map((m) => m.memberType))).map((r) => ({ value: r, label: r }))} value={f.roles} onChange={(x) => setF({ roles: x })} placeholder="Any role" />
      </div>
      <TextArea label="Selected member / Rishta IDs (optional)" value={f.memberIds.join(", ")} onChange={(x) => setF({ memberIds: x.split(/[\s,]+/).filter(Boolean) })} rows={2} hint="Comma-separated. Unknown IDs are reported" />
      <div className="audience-preview">
        <p><strong className="num">{a.included.length}</strong> eligible recipients · <span className="num">{a.excluded.length}</span> excluded{a.outOfScope ? ` (${a.outOfScope} outside your scope)` : ""}</p>
        <p className="small">Programme: {Object.entries(a.byProgramme).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}</p>
        <p className="small">State: {Object.entries(a.byState).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}</p>
        <p className="small">Language (development preference): {Object.entries(a.byLang).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}</p>
        {channels.length > 0 && <p className="small">No contact for: {channels.map((ch) => `${CHANNEL[ch].short} ${a.noChannel[ch]}`).join(" · ")}</p>}
        {a.excluded.length > 0 && <details className="small"><summary>Excluded records</summary><ul className="plain-list">{a.excluded.slice(0, 40).map((x) => <li key={x.id}>{x.id}: {x.reason}</li>)}</ul></details>}
        <p className="small muted">Counts come from the development member master within your programme and geography scope. No contact details are shown.</p>
      </div>
    </>
  );
}

function StepAudience({ v, c, setF }: { v: CommsView; c: Communication; setF: (p: Partial<AudienceFilter>) => void }) {
  return (
    <>
      <SelectField label="Start from a saved audience" value="" onChange={(id) => { const a = v.cs.audiences.find((x) => x.id === id); if (a) setF({ ...a.filter }); }} options={[{ value: "", label: "Choose" }, ...v.cs.audiences.map((a) => ({ value: a.id, label: a.name }))]} />
      <AudienceBuilder v={v} f={c.audience} setF={setF} channels={c.channels} />
    </>
  );
}

function StepChannels({ c, set }: { c: Communication; set: (p: Partial<Communication>) => void }) {
  const entry = SEED_CATALOGUE.find((e) => e.id === c.notificationId);
  const toggle = (ch: Channel, on: boolean) => set({ channels: on ? [...c.channels, ch] : c.channels.filter((x) => x !== ch) });
  return (
    <>
      {CHANNELS.map((ch) => (
        <Checkbox key={ch} label={<><ChannelTag ch={ch} /> {CHANNEL[ch].label}</>} checked={c.channels.includes(ch)} onChange={(on) => toggle(ch, on)} description={CHANNEL[ch].sowUse} />
      ))}
      <p className="small muted">WhatsApp is the primary channel. SMS fallback applies only to catalogue entries flagged critical transactional{entry ? ` (${entry.id}: ${entry.smsFallback ? "fallback on" : "no fallback"})` : " (manual communications have no automatic fallback)"}.</p>
    </>
  );
}

function StepTemplate({ v, c, set, useTemplate, setUseTemplate }: { v: CommsView; c: Communication; set: (p: Partial<Communication>) => void; useTemplate: boolean; setUseTemplate: (b: boolean) => void }) {
  const [lang, setLang] = useState("en");
  const options = (ch: Channel) => v.cs.templates.filter((t) => t.channel === ch && (t.notificationId === c.notificationId || (!c.notificationId && !t.notificationId)) && t.activeVersion != null);
  const pick = (ch: Channel, id: string) => set({ templateIds: [...c.templateIds.filter((x) => v.cs.templates.find((t) => t.id === x)?.channel !== ch), ...(id ? [id] : [])] });
  return (
    <>
      <Checkbox label="Use catalogue templates" checked={useTemplate || !!c.notificationId} onChange={(on) => { setUseTemplate(on); set({ manualContent: on ? null : { subject: "", title: "", body: "" } }); }} description="WhatsApp always needs a provider-approved template. Free text is for in-app, push and email only, in English" />
      <MultiSelect label="Languages" options={v.cs.languages.map((l) => ({ value: l.code, label: `${l.name} (${l.code})` }))} value={c.languages} onChange={(x) => set({ languages: x })} />
      {(useTemplate || c.notificationId || !c.manualContent) ? (
        c.channels.map((ch) => (
          <SelectInput key={ch} label={`${CHANNEL[ch].label} template`} value={c.templateIds.find((id) => v.cs.templates.find((t) => t.id === id)?.channel === ch) ?? ""} onChange={(id) => pick(ch, id)} options={[{ value: "", label: "Choose" }, ...options(ch).map((t) => ({ value: t.id, label: `${t.id} · v${t.activeVersion}` }))]} />
        ))
      ) : (
        <>
          <TextField label="Subject (email)" value={c.manualContent!.subject} onChange={(x) => set({ manualContent: { ...c.manualContent!, subject: x } })} />
          <TextField label="Title (push / in-app)" value={c.manualContent!.title} onChange={(x) => set({ manualContent: { ...c.manualContent!, title: x } })} />
          <TextArea label="Message content" value={c.manualContent!.body} onChange={(x) => set({ manualContent: { ...c.manualContent!, body: x } })} rows={4} hint="Allowed variables: {{member_name}}, {{member_id}}, {{programme}}" />
        </>
      )}
      <SelectField label="Preview language" value={lang} onChange={setLang} options={c.languages.map((l) => ({ value: l, label: l }))} />
      <div className="preview-row">
        {c.channels.map((ch) => {
          const t = v.cs.templates.find((x) => c.templateIds.includes(x.id) && x.channel === ch);
          const tr = t ? activeVersion(t)?.translations.find((x) => x.lang === lang) : null;
          const vars = { member_name: "Sample Member", member_id: "MBR-EP-0000", programme: "EP", scheme_name: "Sample scheme", scheme_period: "1–30 Nov", survey_name: "Sample survey", survey_link: "rishta://survey/SRV-001", pending_documents: "PAN, bank" };
          const body = c.manualContent && !t ? c.manualContent.body : tr?.status === "missing" || !tr ? `Missing translation: ${lang}` : tr.body;
          return <PhonePreview key={ch} channel={ch} lang={lang} title={render(c.manualContent && !t ? c.manualContent.title : tr?.title ?? "", vars)} body={render(body, vars)} footer={c.deepLink ?? undefined} />;
        })}
      </div>
    </>
  );
}

function StepSchedule({ v, c, set }: { v: CommsView; c: Communication; set: (p: Partial<Communication>) => void }) {
  return (
    <>
      <RadioCards name="when" label="Dispatch" value={c.scheduledAt ? "schedule" : "now"} onChange={(x) => set({ scheduledAt: x === "now" ? null : `${v.now.slice(0, 10)}T18:00`, mode: x === "now" ? "manual" : "scheduled" })} options={[{ value: "now", label: "Send after approval", description: "An operator with Communication: Execute sends it" }, { value: "schedule", label: "Schedule", description: "The scheduler dispatches at the time (Asia/Kolkata)" }]} />
      {c.scheduledAt && <TextField label="Scheduled date and time (IST)" type="datetime-local" value={c.scheduledAt} onChange={(x) => set({ scheduledAt: x })} />}
      <SelectInput label="Deep link (approved catalogue)" value={c.deepLink ?? ""} onChange={(x) => set({ deepLink: x || null })} options={[{ value: "", label: "None" }, ...DEEP_LINKS.map((d) => ({ value: d.id, label: `${d.label} · ${d.id}` }))]} />
    </>
  );
}

function StepReview({ c, check }: { c: Communication; check: ReturnType<typeof validateComposition> }) {
  const breakdown = c.channels.map((ch) => `${CHANNEL[ch].short}: ${check.audience.included.length - check.audience.noChannel[ch]}`).join(" · ");
  return (
    <dl className="kv kv--wide">
      <div className="kv__row"><dt>Purpose</dt><dd>{c.purpose || "—"}</dd></div>
      <div className="kv__row"><dt>Audience</dt><dd>{check.audience.included.length} eligible ({Object.entries(check.audience.byProgramme).map(([k, n]) => `${k} ${n}`).join(", ")})</dd></div>
      <div className="kv__row"><dt>Channels</dt><dd>{c.channels.map((ch) => <ChannelTag key={ch} ch={ch} />)}</dd></div>
      <div className="kv__row"><dt>Templates</dt><dd>{c.templateIds.join(", ") || (c.manualContent ? "Free-text content" : "—")}</dd></div>
      <div className="kv__row"><dt>Languages</dt><dd>{c.languages.join(", ")}</dd></div>
      <div className="kv__row"><dt>Dispatch</dt><dd>{c.scheduledAt ? `Scheduled ${c.scheduledAt}` : "After approval, by an operator"}</dd></div>
      <div className="kv__row"><dt>Estimated delivery breakdown</dt><dd>{breakdown}</dd></div>
      <div className="kv__row"><dt>Validation</dt><dd className={check.ok ? "pos" : "neg"}>{check.ok ? "All checks pass" : `${check.errors.length} issue(s)`}</dd></div>
    </dl>
  );
}

export { useMemo };
