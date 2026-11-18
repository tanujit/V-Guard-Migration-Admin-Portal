import { useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Headset, MessageCircle, Plus, Save, Send, Timer, Trash2, UserCheck, Users, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { BOT_ACTION, DEEP_LINKS, PROGRAMMES, QUERY_CATEGORIES } from "@/config/commsCatalogue";
import { slaStatus, validateMenu } from "@/features/comms/engine";
import { addRemark, assignQuery, botRefuseFreeText, botRespond, escalateToAgent, reopenQuery, resolveQuery, saveBotMenu, saveSla, submitBotMenu, type BotReply } from "@/features/comms/store";
import type { BotAction, BotMenu, BotMenuItem, HelpdeskQuery, SlaPolicy } from "@/types/comms";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, ContentBadge, DecisionRef, KpiRow, approvalLink, dt, memberLabel, useCommsView, useParam, useRun, userName, type CommsView } from "./shared";

/* ======================= WhatsApp bot ======================= */

export function BotPage() {
  const v = useCommsView();
  const [tab, setTab] = useParam("tab", "menus");
  const conv = v.cs.conversations;
  return (
    <>
      <SectionTitle title="WhatsApp bot management" description="Role-based menus with safe actions only. The bot never redeems, transfers, adds or deducts points, approves KYC or overrides restrictions. Configuration and preview only: the bot is not connected" />
      <Notice tone="info">An in-app chatbot is not in base scope and stays inactive (<DecisionRef id="CD-02" label="OP-CHAT1" />). Language coverage of bot responses is unconfirmed (<DecisionRef id="CD-01" label="OP-A21" />).</Notice>
      <KpiRow
        items={[
          { id: "t", label: "Total conversations", value: conv.length, desc: "Development conversations", icon: MessageCircle, variant: "primary", onSelect: () => setTab("conversations") },
          { id: "a", label: "Active conversations", value: conv.filter((c) => c.status === "active").length, desc: "Open now", icon: Bot, onSelect: () => setTab("conversations") },
          { id: "r", label: "Resolved conversations", value: conv.filter((c) => c.status === "resolved").length, desc: "Closed by the bot", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setTab("conversations") },
          { id: "e", label: "Escalated conversations", value: conv.filter((c) => c.status === "escalated").length, desc: "Handed to agents", icon: Headset, variant: "status", tone: "warning", onSelect: () => setTab("conversations") },
          { id: "u", label: "Unanswered queries", value: conv.filter((c) => c.status === "unanswered").length, desc: "No resolution", icon: XCircle, variant: "status", tone: "negative", onSelect: () => setTab("conversations") },
          { id: "rt", label: "Average response time", value: 0, desc: "Not available until the bot integration reports timings", icon: Timer, onSelect: () => setTab("conversations") },
          { id: "f", label: "Bot fallback events", value: conv.reduce((n, c) => n + c.fallbacks, 0), desc: "Unrecognised input", icon: AlertTriangle, onSelect: () => setTab("conversations") },
          { id: "h", label: "Human agent handoffs", value: conv.filter((c) => c.escalationQueryId).length, desc: "Linked helpdesk queries", icon: Users, onSelect: () => setTab("conversations") },
        ]}
      />
      <Tabs label="Bot sections" value={tab} onChange={setTab} tabs={[{ id: "menus", label: "Role-based menus" }, { id: "simulator", label: "Conversation preview" }, { id: "conversations", label: "Conversations", count: conv.length }]} />
      {tab === "menus" && <Menus v={v} />}
      {tab === "simulator" && <Simulator v={v} />}
      {tab === "conversations" && (
        <Panel title="Conversation monitoring" subtitle="Member references only; contact data masked">
          <DataTable rows={[...conv].reverse()} rowKey={(c) => c.id} caption="Bot conversations" columns={[{ key: "id", header: "Conversation", value: (c) => c.id }, { key: "m", header: "Member", value: (c) => c.memberId }, { key: "p", header: "Programme", value: (c) => c.programme }, { key: "s", header: "Started", value: (c) => c.startedAt, render: (c) => <span className="num small">{dt(c.startedAt)}</span> }, { key: "st", header: "Status", value: (c) => c.status, render: (c) => <ContentBadge status={c.status} /> }, { key: "l", header: "Last message", value: (c) => c.lastMessage }, { key: "step", header: "Bot step", value: (c) => c.step }, { key: "e", header: "Escalation", value: (c) => c.escalationQueryId ?? "" }, { key: "ag", header: "Agent", value: (c) => { const q = v.cs.queries.find((x) => x.id === c.escalationQueryId); return q?.agentId ? userName(v.acc, q.agentId) : ""; } }]} />
        </Panel>
      )}
    </>
  );
}

function Menus({ v }: { v: CommsView }) {
  const { result, run } = useRun();
  const [prog, setProg] = useState<string>("EP");
  const active = v.cs.menus.find((m) => m.programme === prog && m.status === "active")!;
  const pending = v.cs.menus.find((m) => m.programme === prog && (m.status === "pending_approval" || m.status === "draft"));
  const [edit, setEdit] = useState<BotMenu | null>(null);
  const shown = pending ?? active;
  return (
    <>
      <PolicyMessages result={result} />
      <Panel title={`${prog} menu`} subtitle={`Active v${active.version}${pending ? ` · ${pending.status.replace("_", " ")} v${pending.version}` : ""}`} actions={<div className="btn-row"><SelectField label="Programme" value={prog} onChange={(x) => { setProg(x); setEdit(null); }} options={PROGRAMMES.map((p) => ({ value: p, label: p }))} />{v.canOn("comm-bot", "edit", prog) && <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEdit(structuredClone(shown))}>Edit menu</button>}{pending?.status === "draft" && v.canOn("comm-bot", "submit", prog) && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitBotMenu(v.uid, pending.id), "Submitted for approval")}><Send size={14} aria-hidden="true" />Submit draft</button>}</div>}>
        <ol className="bot-menu">
          {shown.items.map((it) => (
            <li key={it.id} className={it.enabled ? "" : "is-disabled"}>
              <strong>{it.label}</strong> <span className="small muted">· {BOT_ACTION[it.action].label}{it.deepLink ? ` · ${it.deepLink}` : ""}{it.escalation ? " · escalates" : ""}</span>
            </li>
          ))}
        </ol>
        {pending && <p className="small">Approval: {approvalLink(pending.approvalRequestId)}</p>}
      </Panel>
      {edit && <MenuEditor v={v} menu={edit} onClose={() => setEdit(null)} run={run} />}
    </>
  );
}

function MenuEditor({ v, menu, onClose, run }: { v: CommsView; menu: BotMenu; onClose: () => void; run: ReturnType<typeof useRun>["run"] }) {
  const [m, setM] = useState(menu);
  const chk = validateMenu(m, v.cs.menus.map((x) => x.id));
  const upd = (i: number, p: Partial<BotMenuItem>) => setM({ ...m, items: m.items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <Drawer open onClose={onClose} width={760} title={`Edit ${m.name}`} subtitle="Flow builder · unsafe actions are refused" footer={<button type="button" className="btn btn--primary" onClick={() => { const r = run(saveBotMenu(v.uid, m), "Draft saved"); if (r.ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button>}>
      {m.items.map((it, i) => (
        <div key={it.id} className="form-grid form-grid--4 bot-item">
          <TextField label="Menu item" value={it.label} onChange={(x) => upd(i, { label: x })} />
          <SelectInput label="Action" value={it.action} onChange={(x) => upd(i, { action: x as BotAction, escalation: x === "escalate" || x === "raise_query" })} options={Object.entries(BOT_ACTION).map(([k, a]) => ({ value: k, label: `${a.label}${a.safe ? "" : " (not allowed)"}` }))} />
          <SelectInput label="Deep link" value={it.deepLink ?? ""} onChange={(x) => upd(i, { deepLink: x || null })} options={[{ value: "", label: "None" }, ...DEEP_LINKS.map((d) => ({ value: d.id, label: d.label }))]} />
          <div className="btn-row"><Checkbox label="Enabled" checked={it.enabled} onChange={(x) => upd(i, { enabled: x })} /><button type="button" className="btn btn--tertiary btn--xs" aria-label={`Remove ${it.label}`} onClick={() => setM({ ...m, items: m.items.filter((_, j) => j !== i) })}><Trash2 size={12} aria-hidden="true" /></button></div>
        </div>
      ))}
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setM({ ...m, items: [...m.items, { id: `${m.programme}-${Date.now() % 10000}`, label: "New option", action: "faq", description: "", deepLink: null, next: null, escalation: false, statuses: [], enabled: true }] })}><Plus size={14} aria-hidden="true" />Add item</button>
      {!chk.ok && <ul className="plain-list small neg">{chk.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    </Drawer>
  );
}

function Simulator({ v }: { v: CommsView }) {
  const { result, run } = useRun();
  const [memberId, setMemberId] = useState(v.mem.members.find((m) => m.programme === "EP" && m.status === "redemption_enabled")?.id ?? "");
  const [log, setLog] = useState<{ from: "member" | "bot"; text: string }[]>([]);
  const [text, setText] = useState("");
  const m = v.mem.members.find((x) => x.id === memberId);
  const menu = v.cs.menus.find((x) => x.programme === m?.programme && x.status === "active");
  const say = (q: string, r: BotReply) => setLog((l) => [...l, { from: "member", text: q }, { from: "bot", text: r.text }]);
  return (
    <div className="grid-2">
      <Panel title="Conversation preview" subtitle="Administrative simulation of the configured menu; nothing is sent">
        <PolicyMessages result={result} />
        <SelectInput label="Member" value={memberId} onChange={(x) => { setMemberId(x); setLog([]); }} options={v.mem.members.filter((x) => v.inScope(x) && !["pending", "rejected", "invited"].includes(x.status)).slice(0, 80).map((x) => ({ value: x.id, label: `${x.id} · ${x.programme}` }))} />
        <div className="chip-list">{menu?.items.filter((i) => i.enabled).map((i) => <button key={i.id} type="button" className="chip" onClick={() => { const r = botRespond(v.uid, memberId, i.id); say(i.label, r); if (r.escalated) run(escalateToAgent(v.uid, memberId, "Other", `Escalated from bot: ${i.label}`), "Escalated to the agent queue"); }}>{i.label}</button>)}</div>
        <div className="btn-row">
          <TextField label="Free text from member" value={text} onChange={setText} placeholder="for example: redeem 500 points" />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => { say(text, botRefuseFreeText(text)); setText(""); }}>Send</button>
          <button type="button" className="btn btn--tertiary btn--sm" onClick={() => run(escalateToAgent(v.uid, memberId, "Other", text || "Member asked for an agent"), "Escalated to the agent queue")}>Escalate to agent</button>
        </div>
      </Panel>
      <Panel title={`WhatsApp · ${m ? memberLabel(v.mem, m.id) : ""}`}>
        <div className="chat">
          <p className="chat__msg chat__msg--bot">{m?.programme} menu: {menu?.items.filter((i) => i.enabled).map((i, n) => `${n + 1} ${i.label}`).join(" · ")}</p>
          {log.map((x, i) => <p key={i} className={`chat__msg chat__msg--${x.from}`}>{x.text}</p>)}
        </div>
      </Panel>
    </div>
  );
}

/* ======================= Helpdesk ======================= */

export function HelpdeskPage() {
  const v = useCommsView();
  const [status, setStatus] = useParam("status", "all");
  const [open, setOpen] = useParam("query", "");
  const [tab, setTab] = useParam("tab", "queue");
  const qs = v.cs.queries;
  const sla = (q: HelpdeskQuery) => slaStatus(q, v.cs.sla, v.now);
  const rows = [...qs].reverse().filter((q) => status === "all" || q.status === status || (status === "overdue" && ["overdue", "breached"].includes(sla(q).status)));
  const q = qs.find((x) => x.id === open);
  return (
    <>
      <SectionTitle title="Helpdesk & agent escalation" description="Queries escalated from the WhatsApp bot and other channels, on the Tickets & support permission module. SLA targets are development examples until confirmed (CD-06)" />
      <KpiRow
        items={[
          { id: "o", label: "Open queries", value: qs.filter((x) => x.status !== "resolved").length, desc: "Not resolved", icon: Headset, variant: "primary", onSelect: () => setStatus("all") },
          { id: "u", label: "Unassigned", value: qs.filter((x) => !x.agentId && x.status !== "resolved").length, desc: "No agent", icon: Users, variant: "status", tone: "warning", onSelect: () => setStatus("open") },
          { id: "a", label: "Assigned to agents", value: qs.filter((x) => x.status === "assigned").length, desc: "Being worked", icon: UserCheck, onSelect: () => setStatus("assigned") },
          { id: "w", label: "Awaiting member", value: qs.filter((x) => x.status === "awaiting_member").length, desc: "Member to respond", icon: MessageCircle, onSelect: () => setStatus("awaiting_member") },
          { id: "e", label: "Escalated", value: qs.filter((x) => x.status === "escalated").length, desc: "From the bot", icon: AlertTriangle, variant: "status", tone: "warning", onSelect: () => setStatus("escalated") },
          { id: "r", label: "Resolved", value: qs.filter((x) => x.status === "resolved").length, desc: "Closed", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setStatus("resolved") },
          { id: "ov", label: "Overdue", value: qs.filter((x) => sla(x).status === "overdue").length, desc: "Past resolution target", icon: Timer, variant: "status", tone: "negative", onSelect: () => setStatus("overdue") },
          { id: "b", label: "SLA breaches", value: qs.filter((x) => sla(x).status === "breached").length, desc: "No first response in time", icon: XCircle, variant: "status", tone: "negative", onSelect: () => setStatus("overdue") },
        ]}
      />
      <Tabs label="Helpdesk sections" value={tab} onChange={setTab} tabs={[{ id: "queue", label: "Query queue", count: rows.length }, { id: "sla", label: "SLA configuration" }]} />
      {tab === "queue" ? (
        <Panel title="Query queue" actions={<SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, ...["open", "assigned", "awaiting_member", "escalated", "resolved", "reopened", "overdue"].map((s) => ({ value: s, label: s.replace("_", " ") }))]} />}>
          <DataTable
            rows={rows}
            rowKey={(x) => x.id}
            caption="Helpdesk queries"
            onRowClick={(x) => setOpen(x.id)}
            columns={[
              { key: "id", header: "Query reference", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
              { key: "m", header: "Member reference", value: (x) => x.memberId },
              { key: "p", header: "Programme", value: (x) => x.programme },
              { key: "src", header: "Source channel", value: (x) => x.sourceChannel },
              { key: "cat", header: "Query category", value: (x) => x.category },
              { key: "at", header: "Received", value: (x) => x.receivedAt, render: (x) => <span className="num small">{dt(x.receivedAt)}</span> },
              { key: "ag", header: "Assigned agent", value: (x) => (x.agentId ? userName(v.acc, x.agentId) : "") },
              { key: "pr", header: "Priority", value: (x) => x.priority },
              { key: "sla", header: "SLA status", value: (x) => sla(x).status, render: (x) => { const s = sla(x); return <span title={s.detail}><StatusBadge tone={s.status === "within" || s.status === "met" ? "positive" : s.status === "no_policy" ? "neutral" : "negative"}>{s.status.replace("_", " ")}</StatusBadge></span>; } },
              { key: "st", header: "Current status", value: (x) => x.status, render: (x) => <ContentBadge status={x.status} /> },
            ]}
          />
        </Panel>
      ) : (
        <SlaConfig v={v} />
      )}
      {q && <QueryDrawer v={v} q={q} onClose={() => setOpen("")} />}
    </>
  );
}

function QueryDrawer({ v, q, onClose }: { v: CommsView; q: HelpdeskQuery; onClose: () => void }) {
  const { result, run } = useRun();
  const [text, setText] = useState("");
  const [agent, setAgent] = useState(q.agentId ?? "");
  const conv = v.cs.conversations.find((c) => c.id === q.conversationId);
  const agents = ["USR-1003", "USR-1004"];
  return (
    <Drawer open onClose={onClose} width={720} title={`${q.id} · ${q.category}`} subtitle={`${q.memberId} · ${q.programme} · ${q.sourceChannel}`}>
      <PolicyMessages result={result} />
      <dl className="kv kv--tight">
        <div className="kv__row"><dt>Escalation reason</dt><dd>{q.escalationReason}</dd></div>
        <div className="kv__row"><dt>Assigned agent</dt><dd>{q.agentId ? userName(v.acc, q.agentId) : "Unassigned"}</dd></div>
        <div className="kv__row"><dt>SLA</dt><dd>{slaStatus(q, v.cs.sla, v.now).detail}</dd></div>
        <div className="kv__row"><dt>Resolution</dt><dd>{q.resolution ?? "—"}</dd></div>
        <div className="kv__row"><dt>KYC / financial details</dt><dd className="small muted">{v.can("members:view_sensitive") ? "Open Member 360 for details" : "Hidden: needs Member management: View sensitive"}</dd></div>
      </dl>
      {conv && <div className="chat">{conv.messages.map((x, i) => <p key={i} className={`chat__msg chat__msg--${x.from}`}>{x.text}</p>)}</div>}
      <h4 className="cfg-sub">Activity</h4>
      <ul className="plain-list small">{q.remarks.map((r, i) => <li key={i}>{dt(r.at)} · {userName(v.acc, r.by)} · {r.internal ? "Internal" : "To member"}: {r.text}</li>)}</ul>
      <div className="form-grid form-grid--2">
        <SelectInput label="Agent" value={agent} onChange={setAgent} options={[{ value: "", label: "Choose" }, ...agents.map((a) => ({ value: a, label: userName(v.acc, a) }))]} />
        <div className="btn-row"><button type="button" className="btn btn--secondary btn--sm" onClick={() => run(assignQuery(v.uid, q.id, agent), q.agentId ? "Reassigned" : "Assigned")}>{q.agentId ? "Reassign" : "Assign"}</button></div>
      </div>
      <TextArea label="Remark / resolution" value={text} onChange={setText} rows={2} />
      <div className="btn-row">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(addRemark(v.uid, q.id, text, true), "Internal remark added")}>Add internal remark</button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(addRemark(v.uid, q.id, text, false), "Member communication recorded")}>Record member communication</button>
        {q.status !== "resolved" ? <button type="button" className="btn btn--primary btn--sm" onClick={() => run(resolveQuery(v.uid, q.id, text), "Resolved")}>Resolve</button> : <button type="button" className="btn btn--tertiary btn--sm" onClick={() => run(reopenQuery(v.uid, q.id, text), "Reopened")}>Reopen</button>}
      </div>
    </Drawer>
  );
}

function SlaConfig({ v }: { v: CommsView }) {
  const { result, run } = useRun();
  const [rows, setRows] = useState<SlaPolicy[]>(v.cs.sla);
  return (
    <Panel title="SLA configuration" subtitle="The SOW defines no SLA values. Rows are labelled development examples until CD-06 is confirmed">
      <PolicyMessages result={result} />
      <table className="table table--compact">
        <thead><tr><th>Category</th><th>Response (h)</th><th>Resolution (h)</th><th>Calendar</th><th>Escalation group</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id}>
              <td>{p.category}</td>
              <td><input className="input input--sm" value={p.responseHours ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, responseHours: e.target.value ? Number(e.target.value) : null } : x)))} aria-label={`Response hours ${p.category}`} /></td>
              <td><input className="input input--sm" value={p.resolutionHours ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, resolutionHours: e.target.value ? Number(e.target.value) : null } : x)))} aria-label={`Resolution hours ${p.category}`} /></td>
              <td>{p.calendar.replace("_", " ")}</td>
              <td>{p.escalateTo || "—"}</td>
              <td>{p.status === "development_example" ? <BcrTag>Development example</BcrTag> : "Confirmed"}</td>
              <td>{v.can("tickets:manage") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(saveSla(v.uid, p), "SLA saved")}>Save</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.can("tickets:manage") && <SelectField label="Add category" value="" onChange={(c) => c && setRows([...rows, { id: `SLA-${String(rows.length + 1).padStart(2, "0")}`, category: c, responseHours: null, resolutionHours: null, calendar: "business_hours", escalateTo: "", status: "development_example" }])} options={[{ value: "", label: "Choose" }, ...QUERY_CATEGORIES.filter((c) => !rows.some((r) => r.category === c)).map((c) => ({ value: c, label: c }))]} />}
    </Panel>
  );
}
