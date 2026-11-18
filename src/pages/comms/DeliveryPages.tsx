import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Ban, Play, RefreshCcw, Save, Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState, SelectField, StatusBadge } from "@/components/ui/primitives";
import { TextArea, TextField } from "@/components/form/Form";
import { ATTEMPT_STATUS, CHANNEL, CHANNELS, DISPATCH_MODE } from "@/config/commsCatalogue";
import { activeVersion, channelSummary, EMPTY_FILTER, maskContact, render } from "@/features/comms/engine";
import { cancelCommunication, dispatchCommunication, processEvents, providerCallback, redeliverEvent, retryAttempt, runScheduler, saveAudience, submitCommunication } from "@/features/comms/store";
import type { AudienceFilter, Communication } from "@/types/comms";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { AudienceBuilder } from "./ComposePage";
import { AttemptBadge, CBASE, ChannelTag, CommBadge, DecisionRef, PhonePreview, approvalLink, commLink, dt, memberLabel, useCommsView, useParam, useRun, userName } from "./shared";

/* ======================= Scheduled ======================= */

export function ScheduledPage() {
  const v = useCommsView();
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const rows = v.cs.communications.filter((c) => c.mode === "scheduled" || c.scheduledAt);
  return (
    <>
      <SectionTitle title="Scheduled communications" description="Approved communications wait here until the scheduler dispatches them. Editing a scheduled communication returns it to draft for re-approval" actions={v.can("communication:execute") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const n = runScheduler(); run({ ok: true, errors: [], warnings: [] }, `Scheduler ran: ${n} communication(s) dispatched`); }}><Play size={14} aria-hidden="true" />Run scheduler now</button>} />
      <PolicyMessages result={result} />
      <Panel title="Schedule">
        <DataTable
          rows={rows}
          rowKey={(c) => c.id}
          caption="Scheduled communications"
          columns={[
            { key: "id", header: "Reference", value: (c) => c.id, render: (c) => commLink(c.id) },
            { key: "name", header: "Name", value: (c) => c.name },
            { key: "n", header: "Notification", value: (c) => c.notificationId ?? "" },
            { key: "aud", header: "Audience", value: (c) => c.audienceCount, align: "right" },
            { key: "ch", header: "Channels", value: (c) => c.channels.join(", "), render: (c) => <span className="chip-list">{c.channels.map((x) => <ChannelTag key={x} ch={x} />)}</span> },
            { key: "at", header: "Scheduled (IST)", value: (c) => c.scheduledAt ?? "", render: (c) => <span className="num small">{dt(c.scheduledAt)}</span> },
            { key: "st", header: "Status", value: (c) => c.status, render: (c) => <CommBadge status={c.status} /> },
            { key: "apr", header: "Approval", value: (c) => c.approvalRequestId ?? "", render: (c) => approvalLink(c.approvalRequestId) },
            { key: "act", header: "", value: () => "", render: (c) => (["scheduled", "pending_approval", "draft"].includes(c.status) && v.can("communication:cancel") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(cancelCommunication(v.uid, c.id, reason || "Cancelled from schedule"), "Cancelled")}><Ban size={12} aria-hidden="true" />Cancel</button> : null) },
          ]}
        />
        <TextField label="Cancellation reason" value={reason} onChange={setReason} />
      </Panel>
    </>
  );
}

/* ======================= Automated rules and events ======================= */

export function RulesPage() {
  const v = useCommsView();
  const { result, run } = useRun();
  const [nid, setNid] = useState("all");
  const ev = [...v.cs.events].reverse().filter((e) => nid === "all" || e.notificationId === nid);
  return (
    <>
      <SectionTitle title="Automated rules (rule-based dispatch)" description="Each catalogue entry subscribes to events from its authoritative module. Event IDs come from the source record, so a redelivered event is a duplicate and never sends twice" actions={v.can("communication:execute") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const r = processEvents(); run({ ok: true, errors: [], warnings: [] }, `${r.processed} new event(s) processed`); }}><RefreshCcw size={14} aria-hidden="true" />Process new events</button>} />
      <PolicyMessages result={result} />
      <Panel title="Event subscriptions">
        <table className="table table--compact">
          <thead><tr><th>Entry</th><th>Source module</th><th>Event types</th><th>Channels</th><th className="num">Received</th><th className="num">Dispatched</th><th>Status</th></tr></thead>
          <tbody>
            {v.cs.catalogue.map((e) => (
              <tr key={e.id}>
                <th scope="row" className="mono">{e.id}</th>
                <td className="small">{e.sourceModule}</td>
                <td className="mono small">{e.events.join(", ")}</td>
                <td><span className="chip-list">{e.channels.map((c) => <ChannelTag key={c} ch={c} />)}</span></td>
                <td className="num">{v.cs.events.filter((x) => x.notificationId === e.id).reduce((n, x) => n + x.receivedCount, 0)}</td>
                <td className="num">{v.cs.events.filter((x) => x.notificationId === e.id && x.status === "processed").length}</td>
                <td>{e.id === "N06" ? <span className="small">Dispatched from Surveys</span> : e.id === "N10" ? <span className="small">Scheduler (cadence <DecisionRef id="CD-08" />)</span> : <StatusBadge tone={e.enabled ? "positive" : "neutral"}>{e.enabled ? "Listening" : "Disabled"}</StatusBadge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Event log" subtitle={`Events since ${dt(v.cs.subscriptionStart)}`} actions={<SelectField label="Entry" value={nid} onChange={setNid} options={[{ value: "all", label: "All" }, ...v.cs.catalogue.map((e) => ({ value: e.id, label: e.id }))]} />}>
        <DataTable
          rows={ev}
          rowKey={(e) => e.id}
          caption="Notification events"
          columns={[
            { key: "id", header: "Event ID", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
            { key: "type", header: "Event type", value: (e) => e.type },
            { key: "src", header: "Source", value: (e) => `${e.sourceModule} · ${e.sourceRef}` },
            { key: "p", header: "Programme", value: (e) => e.programme ?? "" },
            { key: "m", header: "Member", value: (e) => e.memberId ?? "" },
            { key: "at", header: "Event time", value: (e) => e.at, render: (e) => <span className="num small">{dt(e.at)}</span> },
            { key: "n", header: "Catalogue", value: (e) => e.notificationId },
            { key: "st", header: "Processing", value: (e) => e.status, render: (e) => <StatusBadge tone={e.status === "processed" ? "positive" : "neutral"}>{e.status.replace(/_/g, " ")}</StatusBadge> },
            { key: "rc", header: "Received", value: (e) => e.receivedCount, render: (e) => <span className="num">{e.receivedCount}{e.receivedCount > 1 ? " (duplicate ignored)" : ""}</span>, align: "right" },
            { key: "c", header: "Communication", value: (e) => e.commId ?? "", render: (e) => (e.commId ? commLink(e.commId) : <span className="small muted">{e.detail}</span>) },
            { key: "dup", header: "", value: () => "", render: (e) => (v.can("communication:manage") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(redeliverEvent(e.id), "Duplicate delivery recorded")}>Redeliver (test)</button> : null) },
          ]}
        />
      </Panel>
    </>
  );
}

/* ======================= History and detail ======================= */

export function HistoryPage() {
  const v = useCommsView();
  const nav = useNavigate();
  const [status, setStatus] = useParam("status", "all");
  const [mode, setMode] = useParam("mode", "all");
  const rows = [...v.cs.communications].reverse().filter((c) => (status === "all" || c.status === status) && (mode === "all" || (mode === "manual" ? c.mode !== "rule" : c.mode === mode)));
  return (
    <>
      <div className="filters-bar">
        <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, ...["draft", "pending_approval", "approved", "scheduled", "sent", "delivered", "partially_delivered", "failed", "cancelled", "rejected"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))]} />
        <SelectField label="Dispatch mode" value={mode} onChange={setMode} options={[{ value: "all", label: "All" }, ...Object.entries(DISPATCH_MODE).map(([k, d]) => ({ value: k, label: d.label }))]} />
      </div>
      <Panel title="Dispatch history" subtitle={`${rows.length} communications`}>
        <DataTable
          rows={rows}
          rowKey={(c) => c.id}
          caption="Communication history"
          onRowClick={(c) => nav(`${CBASE}/history/${c.id}`)}
          exportName={v.can("communication:export") ? "communication-history" : undefined}
          columns={[
            { key: "id", header: "Reference", value: (c) => c.id, render: (c) => commLink(c.id) },
            { key: "n", header: "Notification", value: (c) => c.notificationId ?? "" },
            { key: "name", header: "Name", value: (c) => c.name },
            { key: "mode", header: "Mode", value: (c) => DISPATCH_MODE[c.mode].label },
            { key: "aud", header: "Audience", value: (c) => c.audienceCount, align: "right" },
            { key: "ch", header: "Channel set", value: (c) => c.channels.join(", ") },
            { key: "by", header: "Initiated by", value: (c) => userName(v.acc, c.createdBy) },
            { key: "s", header: "Scheduled at", value: (c) => c.scheduledAt ?? "" },
            { key: "d", header: "Dispatched at", value: (c) => c.dispatchedAt ?? "", render: (c) => <span className="num small">{dt(c.dispatchedAt)}</span> },
            { key: "st", header: "Overall status", value: (c) => c.status, render: (c) => <CommBadge status={c.status} /> },
          ]}
        />
      </Panel>
    </>
  );
}

export function CommDetailPage() {
  const { commId = "" } = useParams();
  const v = useCommsView();
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const c = v.cs.communications.find((x) => x.id === commId);
  if (!c) return <EmptyState title="Communication not found">{commId}</EmptyState>;
  const atts = v.cs.attempts.filter((a) => a.commId === c.id);
  const sum = channelSummary(atts);
  const ev = c.eventId ? v.cs.events.find((e) => e.id === c.eventId) : undefined;
  const t = v.cs.templates.find((x) => c.templateIds.includes(x.id));
  const tr = t && activeVersion(t)?.translations.find((x) => x.lang === "en");
  const vars = ev ? ev.payload : { member_name: "‹Member›", programme: "‹Programme›" };
  const sensitive = v.can("members:view_sensitive");
  return (
    <>
      <p className="muted small"><Link to={`${CBASE}/history`}>History</Link> / {c.id}</p>
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title={c.name} subtitle={`${DISPATCH_MODE[c.mode].label}${c.notificationId ? ` · ${c.notificationId}` : ""} · v${c.version}`} actions={<CommBadge status={c.status} />}>
          <dl className="kv kv--wide">
            <div className="kv__row"><dt>Purpose</dt><dd>{c.purpose}</dd></div>
            <div className="kv__row"><dt>Trigger event</dt><dd>{ev ? <span className="mono small">{ev.id} · {ev.type} · {ev.sourceModule}</span> : "—"}</dd></div>
            <div className="kv__row"><dt>Audience</dt><dd>{c.audienceCount} recipient(s){c.audience.programmes.length ? ` · ${c.audience.programmes.join(", ")}` : ""}{c.audience.memberIds.length === 1 ? ` · ${memberLabel(v.mem, c.audience.memberIds[0])}` : ""}</dd></div>
            <div className="kv__row"><dt>Channels</dt><dd>{c.channels.map((x) => <ChannelTag key={x} ch={x} />)}</dd></div>
            <div className="kv__row"><dt>Templates</dt><dd className="mono small">{c.templateIds.join(", ") || "Free text"}</dd></div>
            <div className="kv__row"><dt>Initiated by</dt><dd>{userName(v.acc, c.createdBy)} · {dt(c.createdAt)}</dd></div>
            <div className="kv__row"><dt>Approval</dt><dd>{approvalLink(c.approvalRequestId)}</dd></div>
            <div className="kv__row"><dt>Scheduled / dispatched</dt><dd>{dt(c.scheduledAt)} / {dt(c.dispatchedAt)}</dd></div>
          </dl>
          <div className="btn-row">
            {c.status === "draft" && v.can("communication:submit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitCommunication(v.uid, c.id), "Submitted")}><Send size={14} aria-hidden="true" />Submit</button>}
            {c.status === "approved" && v.can("communication:execute") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(dispatchCommunication(v.uid, c.id), "Dispatched (simulated)")}><Send size={14} aria-hidden="true" />Send now</button>}
            {["draft", "pending_approval", "approved", "scheduled"].includes(c.status) && v.can("communication:cancel") && <><TextField label="Cancellation reason" value={reason} onChange={setReason} /><button type="button" className="btn btn--danger btn--sm" onClick={() => run(cancelCommunication(v.uid, c.id, reason), "Cancelled")}><Ban size={14} aria-hidden="true" />Cancel</button></>}
          </div>
        </Panel>
        <Panel title="Preview">
          {c.channels.slice(0, 2).map((ch) => <PhonePreview key={ch} channel={ch} title={render(c.manualContent?.title ?? tr?.title ?? "", vars)} body={render(c.manualContent?.body ?? tr?.body ?? "", vars)} />)}
        </Panel>
      </div>
      <Panel title="Channel outcomes" subtitle="Request accepted ≠ dispatched ≠ delivered. Only a provider callback marks delivery">
        <table className="table table--compact">
          <thead><tr><th>Channel</th><th className="num">Attempted</th><th className="num">Delivered / published</th><th className="num">Failed</th><th className="num">Pending</th><th>Summary</th></tr></thead>
          <tbody>
            {CHANNELS.map((ch) => (
              <tr key={ch}>
                <th scope="row"><ChannelTag ch={ch} /></th>
                <td className="num">{sum[ch].attempted}</td><td className="num">{sum[ch].delivered}</td><td className="num">{sum[ch].failed}</td><td className="num">{sum[ch].pending}</td>
                <td className="small">{!c.channels.includes(ch) && !sum[ch].attempted ? (ch === "sms" && c.notificationId && v.cs.catalogue.find((e) => e.id === c.notificationId)?.smsFallback ? "Not required (fallback only)" : "Not selected") : sum[ch].failed ? "Partly failed" : sum[ch].pending ? "Awaiting callbacks" : "Complete"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Delivery details" subtitle={sensitive ? "Contacts masked" : "Contacts masked (members: view sensitive needed for more)"}>
        <DataTable
          rows={atts}
          rowKey={(a) => a.id}
          caption="Delivery attempts"
          columns={[
            { key: "r", header: "Recipient", value: (a) => a.recipientId, render: (a) => <span className="mono small">{a.recipientKind === "staff" ? a.recipientId : a.recipientId}</span> },
            { key: "contact", header: "Contact", value: () => "", render: (a) => { const m = v.mem.members.find((x) => x.id === a.recipientId); return <span className="mono small">{m ? maskContact(a.channel === "email" ? m.email : m.mobile) : "Staff contact (masked)"}</span>; } },
            { key: "p", header: "Programme", value: (a) => a.programme ?? "Staff" },
            { key: "ch", header: "Channel", value: (a) => a.channel, render: (a) => <ChannelTag ch={a.channel} /> },
            { key: "l", header: "Language", value: (a) => a.lang },
            { key: "tv", header: "Template version", value: (a) => (a.templateId ? `${a.templateId} v${a.templateVersion}` : "Free text") },
            { key: "n", header: "Attempt", value: (a) => a.attempt, align: "right" },
            { key: "pr", header: "Provider reference", value: (a) => a.providerRef ?? "", render: (a) => <span className="mono small">{a.providerRef ?? "—"}</span> },
            { key: "resp", header: "Provider response", value: (a) => a.providerResponse },
            { key: "s", header: "Status", value: (a) => a.status, render: (a) => <AttemptBadge status={a.status} /> },
            { key: "e", header: "Error", value: (a) => a.error ?? "" },
            { key: "at", header: "Time", value: (a) => a.updatedAt, render: (a) => <span className="num small">{dt(a.updatedAt)}</span> },
          ]}
        />
      </Panel>
    </>
  );
}

/* ======================= Delivery monitoring ======================= */

export function DeliveryPage() {
  const v = useCommsView();
  const { result, run } = useRun();
  const [ch, setCh] = useParam("channel", "all");
  const [st, setSt] = useParam("status", "all");
  const group = (s: string) => (s === "delivered" || s === "published" ? "delivered" : s === "failed" || s === "provider_error" ? "failed" : "pending");
  const rows = [...v.cs.attempts].reverse().filter((a) => (ch === "all" || a.channel === ch) && (st === "all" || group(a.status) === st || a.status === st));
  return (
    <>
      <SectionTitle title="Delivery monitoring" description="Channel attempts from the mock provider adapters. WhatsApp is primary; SMS fallback runs only for critical entries. Retries need a confirmed policy (CD-07)" />
      <Notice tone="info">Retry policy: {v.cs.retry.maxAttempts == null ? <>not configured <DecisionRef id="CD-07" /> · no automatic or unlimited retries</> : `${v.cs.retry.maxAttempts} attempts`}. Callback buttons simulate provider callbacks for development; repeated or late callbacks are ignored.</Notice>
      <PolicyMessages result={result} />
      <div className="filters-bar">
        <SelectField label="Channel" value={ch} onChange={setCh} options={[{ value: "all", label: "All" }, ...CHANNELS.map((c) => ({ value: c, label: CHANNEL[c].label }))]} />
        <SelectField label="Status" value={st} onChange={setSt} options={[{ value: "all", label: "All" }, { value: "delivered", label: "Delivered / published" }, { value: "failed", label: "Failed / provider error" }, { value: "pending", label: "Pending (accepted / dispatched)" }, ...Object.entries(ATTEMPT_STATUS).map(([k, s]) => ({ value: k, label: s.label }))]} />
      </div>
      <Panel title="Attempts" subtitle={`${rows.length} attempts`}>
        <DataTable
          rows={rows}
          rowKey={(a) => a.id}
          caption="Delivery attempts"
          columns={[
            { key: "id", header: "Attempt", value: (a) => a.id, render: (a) => <span className="mono small">{a.id}</span> },
            { key: "c", header: "Communication", value: (a) => a.commId, render: (a) => commLink(a.commId) },
            { key: "r", header: "Recipient", value: (a) => a.recipientId },
            { key: "ch", header: "Channel", value: (a) => a.channel, render: (a) => <ChannelTag ch={a.channel} /> },
            { key: "fb", header: "Fallback of", value: (a) => a.fallbackOf ?? "" },
            { key: "s", header: "Status", value: (a) => a.status, render: (a) => <AttemptBadge status={a.status} /> },
            { key: "k", header: "Idempotency key", value: (a) => a.idempotencyKey, render: (a) => <span className="mono small">{a.idempotencyKey}</span> },
            { key: "cb", header: "Callbacks", value: (a) => a.callbacks.length, render: (a) => <span className="small">{a.callbacks.length}{a.callbacks.some((x) => x.duplicate) ? " (dup ignored)" : ""}</span> },
            { key: "act", header: "", value: () => "", render: (a) => (
              <span className="btn-row">
                {(a.status === "dispatched" || a.status === "accepted") && <><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(providerCallback(v.uid, a.id, "delivered", `CB-${a.id}-D`), "Callback processed")}>Delivered</button><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(providerCallback(v.uid, a.id, "failed", `CB-${a.id}-F`), "Callback processed")}>Failed</button></>}
                {(a.status === "failed" || a.status === "provider_error") && v.can("communication:execute") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(retryAttempt(v.uid, a.id), "Retry queued")}>Retry</button>}
              </span>
            ) },
          ]}
        />
      </Panel>
    </>
  );
}

/* ======================= Audiences ======================= */

export function AudiencesPage() {
  const v = useCommsView();
  const { result, run } = useRun();
  const [name, setName] = useState("");
  const [f, setF] = useState<AudienceFilter>({ ...EMPTY_FILTER });
  const [id, setId] = useState<string | undefined>();
  return (
    <>
      <SectionTitle title="Audience management" description="Reusable audience definitions for manual and scheduled communications, N10 reminders, N06 surveys and announcements. Counts respect your programme and geography scope; contact data is never listed" />
      <PolicyMessages result={result} />
      <div className="grid-2">
        <Panel title="Saved audiences">
          <DataTable rows={v.cs.audiences} rowKey={(a) => a.id} caption="Audiences" searchable={false} onRowClick={(a) => { setId(a.id); setName(a.name); setF(a.filter); }} columns={[{ key: "id", header: "ID", value: (a) => a.id }, { key: "n", header: "Name", value: (a) => a.name }, { key: "f", header: "Criteria", value: (a) => [a.filter.programmes.join("/"), a.filter.states.join("/"), a.filter.statuses.join("/")].filter(Boolean).join(" · ") }, { key: "u", header: "Updated", value: (a) => a.updatedAt, render: (a) => <span className="num small">{dt(a.updatedAt)}</span> }]} />
        </Panel>
        <Panel title={id ? `Edit ${id}` : "New audience"}>
          <TextField label="Audience name" value={name} onChange={setName} />
          <AudienceBuilder v={v} f={f} setF={(p) => setF({ ...f, ...p })} channels={["whatsapp", "inapp"]} />
          {v.can("communication:manage") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(saveAudience(v.uid, { id, name, filter: f }), "Audience saved")}><Save size={14} aria-hidden="true" />Save audience</button>}
        </Panel>
      </div>
    </>
  );
}

export type { Communication };
export { TextArea };
