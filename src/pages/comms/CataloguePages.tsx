import { useMemo, useState } from "react";
import { Send, Save, Power } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, TextArea, TextField } from "@/components/form/Form";
import { CHANNEL, CHANNELS, DEEP_LINKS, INBOX, POLICY_LABEL, VARIABLES } from "@/config/commsCatalogue";
import { activeVersion, channelSummary, latestVersion, render, validateTemplate } from "@/features/comms/engine";
import { saveTemplateDraft, setEntryEnabled, setProviderApproval, submitTemplate, updateEntry } from "@/features/comms/store";
import type { Channel, MessageTemplate, NotificationEntry, TemplateTranslation } from "@/types/comms";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, ChannelTag, ContentBadge, DecisionRef, PhonePreview, approvalLink, dt, useCommsView, useParam, useRun, userName, type CommsView } from "./shared";

/* ======================= Notification catalogue N01–N11 ======================= */

export function CataloguePage() {
  const v = useCommsView();
  const [open, setOpen] = useParam("entry", "");
  const entry = v.cs.catalogue.find((e) => e.id === open);
  return (
    <>
      <SectionTitle title="Notification catalogue N01–N11" description="Every entry defines trigger, audience, channel set and localised templates. Entries can be enabled, disabled and configured without a code release; the eleven identifiers cannot be removed" />
      <Panel title="Catalogue">
        <DataTable
          rows={v.cs.catalogue}
          rowKey={(e) => e.id}
          caption="Notification catalogue"
          searchable={false}
          pageSize={11}
          onRowClick={(e) => setOpen(e.id)}
          columns={[
            { key: "id", header: "ID", value: (e) => e.id, render: (e) => <strong className="mono">{e.id}</strong> },
            { key: "name", header: "Notification", value: (e) => e.name },
            { key: "trigger", header: "SOW trigger", value: (e) => e.sowTrigger },
            { key: "aud", header: "SOW audience", value: (e) => e.sowAudience },
            { key: "src", header: "Source module", value: (e) => e.sourceModule },
            { key: "ch", header: "Channels", value: (e) => e.channels.join(", "), render: (e) => <span className="chip-list">{e.channels.map((c) => <ChannelTag key={c} ch={c} />)}{e.smsFallback && <span className="small muted">+SMS fallback</span>}</span> },
            { key: "inbox", header: "Inbox category", value: (e) => INBOX[e.inboxCategory] },
            { key: "tpl", header: "Templates", value: (e) => v.cs.templates.filter((t) => t.notificationId === e.id).length, align: "right" },
            { key: "sent", header: "Dispatches", value: (e) => v.cs.communications.filter((c) => c.notificationId === e.id).length, align: "right" },
            { key: "en", header: "Status", value: (e) => (e.enabled ? "Enabled" : "Disabled"), render: (e) => <StatusBadge tone={e.enabled ? "positive" : "neutral"}>{e.enabled ? "Enabled" : "Disabled"}</StatusBadge> },
          ]}
        />
      </Panel>
      {entry && <EntryDrawer v={v} e={entry} onClose={() => setOpen("")} />}
    </>
  );
}

function EntryDrawer({ v, e, onClose }: { v: CommsView; e: NotificationEntry; onClose: () => void }) {
  const { result, run } = useRun();
  const [channels, setChannels] = useState<Channel[]>(e.channels);
  const [fallback, setFallback] = useState(e.smsFallback);
  const [rule, setRule] = useState(e.audienceRule);
  const [cadence, setCadence] = useState(e.cadenceDays == null ? "" : String(e.cadenceDays));
  const [reason, setReason] = useState("");
  const comms = v.cs.communications.filter((c) => c.notificationId === e.id);
  const ids = new Set(comms.map((c) => c.id));
  const sum = channelSummary(v.cs.attempts.filter((a) => ids.has(a.commId)));
  const events = v.cs.events.filter((x) => x.notificationId === e.id);
  const audit = v.cs.audit.filter((a) => a.entityId === e.id);
  const canEdit = v.can("comm-templates:edit");
  return (
    <Drawer open onClose={onClose} width={720} title={`${e.id} · ${e.name}`} subtitle={`Version ${e.version} · updated ${dt(e.updatedAt)} by ${userName(v.acc, e.updatedBy)}`}>
      <PolicyMessages result={result} />
      <dl className="kv kv--tight">
        <div className="kv__row"><dt>SOW trigger</dt><dd>{e.sowTrigger}</dd></div>
        <div className="kv__row"><dt>SOW audience</dt><dd>{e.sowAudience}</dd></div>
        <div className="kv__row"><dt>SOW channels</dt><dd>{e.sowChannels ? e.sowChannels.map((c) => CHANNEL[c].label).join(", ") : "Not fixed by the SOW (configured)"}</dd></div>
        <div className="kv__row"><dt>Authoritative source</dt><dd>{e.sourceModule}</dd></div>
        <div className="kv__row"><dt>Event types</dt><dd className="mono small">{e.events.join(", ")}</dd></div>
        <div className="kv__row"><dt>Approval policy</dt><dd>{POLICY_LABEL[e.policy]} · {v.cs.policies[e.policy].approval ? "approval required for changes" : "no approval"}</dd></div>
        <div className="kv__row"><dt>Variables</dt><dd className="mono small">{VARIABLES[e.id].map((x) => `{{${x.name}}}${x.required ? "*" : ""}`).join(" ")}</dd></div>
        <div className="kv__row"><dt>Events received</dt><dd>{events.length} ({events.filter((x) => x.status === "processed").length} processed, {events.filter((x) => x.status !== "processed").length} skipped)</dd></div>
        <div className="kv__row"><dt>Delivery history</dt><dd>{CHANNELS.filter((c) => sum[c].attempted).map((c) => `${CHANNEL[c].short} ${sum[c].delivered}/${sum[c].attempted}`).join(" · ") || "None"}</dd></div>
      </dl>
      {canEdit && (
        <>
          <h4 className="cfg-sub">Configuration</h4>
          <div className="chip-list">{CHANNELS.map((c) => <Checkbox key={c} label={<ChannelTag ch={c} />} checked={channels.includes(c)} onChange={(on) => setChannels(on ? [...channels, c] : channels.filter((x) => x !== c))} />)}</div>
          <Checkbox label="SMS fallback when WhatsApp is unavailable" checked={fallback} onChange={setFallback} description="Critical transactional messages only" />
          <TextArea label="Audience rule" value={rule} onChange={setRule} rows={2} />
          {e.id === "N10" && <TextField label="Reminder cadence (days)" value={cadence} onChange={setCadence} inputMode="numeric" hint="Not set by default; the SOW's monthly example is not hardcoded (CD-08)" />}
          <TextField label="Reason for change" value={reason} onChange={setReason} required />
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => run(updateEntry(v.uid, e.id, { channels, smsFallback: fallback, audienceRule: rule, ...(e.id === "N10" && cadence !== String(e.cadenceDays ?? "") ? { cadenceDays: cadence ? Number(cadence) : null } : {}) }, reason), "Configuration saved")}><Save size={14} aria-hidden="true" />Save configuration</button>
            {v.can("comm-templates:disable") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setEntryEnabled(v.uid, e.id, !e.enabled, reason), e.enabled ? "Disabled" : "Enabled")}><Power size={14} aria-hidden="true" />{e.enabled ? "Disable" : "Enable"}</button>}
          </div>
        </>
      )}
      {e.id === "N10" && e.cadenceDays == null && <p className="small"><BcrTag>Cadence not configured</BcrTag> <DecisionRef id="CD-08" /></p>}
      <h4 className="cfg-sub">Templates</h4>
      <ul className="plain-list small">{v.cs.templates.filter((t) => t.notificationId === e.id).map((t) => <li key={t.id}><ChannelTag ch={t.channel} /> {t.id} · active v{t.activeVersion ?? "—"} · {latestVersion(t).status}</li>)}</ul>
      <h4 className="cfg-sub">Audit</h4>
      <ul className="plain-list small">{audit.length ? audit.map((a) => <li key={a.id}>{dt(a.at)} · {userName(v.acc, a.actor)} · {a.action.replace(/_/g, " ")} · {a.reason}</li>) : <li className="muted">No changes since seed</li>}</ul>
    </Drawer>
  );
}

/* ======================= Templates ======================= */

export function TemplatesPage() {
  const v = useCommsView();
  const [nid, setNid] = useState("all");
  const [ch, setCh] = useState("all");
  const [lang, setLang] = useState("all");
  const [open, setOpen] = useParam("template", "");
  const rows = v.cs.templates.filter((t) => (nid === "all" || (t.notificationId ?? "manual") === nid) && (ch === "all" || t.channel === ch));
  const flat = rows.flatMap((t) => v.cs.languages.filter((l) => lang === "all" || l.code === lang).map((l) => ({ t, l: l.code, tr: (activeVersion(t) ?? latestVersion(t)).translations.find((x) => x.lang === l.code) })));
  const t = v.cs.templates.find((x) => x.id === open);
  return (
    <>
      <SectionTitle title="Message templates" description="Channel- and language-specific templates. Editing creates a new version; the active version is never overwritten. Variables come from the approved registry only" />
      <Notice tone="info">Eight-language coverage beyond in-app, WhatsApp, SMS and email templates is unconfirmed for push and bot responses (<DecisionRef id="CD-01" label="OP-A21" />). The language list itself stands in for the app configuration (<DecisionRef id="CD-05" />).</Notice>
      <div className="filters-bar">
        <SelectField label="Notification" value={nid} onChange={setNid} options={[{ value: "all", label: "All" }, ...v.cs.catalogue.map((e) => ({ value: e.id, label: e.id })), { value: "manual", label: "Manual" }]} />
        <SelectField label="Channel" value={ch} onChange={setCh} options={[{ value: "all", label: "All" }, ...CHANNELS.map((c) => ({ value: c, label: CHANNEL[c].label }))]} />
        <SelectField label="Language" value={lang} onChange={setLang} options={[{ value: "all", label: "All" }, ...v.cs.languages.map((l) => ({ value: l.code, label: l.name }))]} />
      </div>
      <Panel title="Template directory" subtitle={`${rows.length} templates · ${flat.filter((x) => x.tr?.status === "missing").length} missing translations`}>
        <DataTable
          rows={flat}
          rowKey={(x) => `${x.t.id}-${x.l}`}
          caption="Templates by language"
          onRowClick={(x) => setOpen(x.t.id)}
          columns={[
            { key: "id", header: "Template ID", value: (x) => x.t.id, render: (x) => <span className="mono small">{x.t.id}</span> },
            { key: "n", header: "Notification", value: (x) => x.t.notificationId ?? "Manual" },
            { key: "name", header: "Template name", value: (x) => x.t.name },
            { key: "cat", header: "Category", value: (x) => x.t.category },
            { key: "ch", header: "Channel", value: (x) => x.t.channel, render: (x) => <ChannelTag ch={x.t.channel} /> },
            { key: "lang", header: "Language", value: (x) => x.l },
            { key: "tr", header: "Translation", value: (x) => x.tr?.status ?? "missing", render: (x) => <ContentBadge status={x.tr?.status === "complete" ? "complete" : x.tr?.status === "needs_review" ? "needs review" : "missing"} /> },
            { key: "st", header: "Template status", value: (x) => latestVersion(x.t).status, render: (x) => <ContentBadge status={latestVersion(x.t).status} /> },
            { key: "prov", header: "Provider approval", value: (x) => latestVersion(x.t).providerApproval.replace("_", " ") },
            { key: "ver", header: "Version", value: (x) => `${x.t.activeVersion ?? "—"} / ${latestVersion(x.t).version}` },
            { key: "mod", header: "Last modified", value: (x) => x.t.updatedAt, render: (x) => <span className="num small">{dt(x.t.updatedAt)}</span> },
            { key: "by", header: "Modified by", value: (x) => userName(v.acc, latestVersion(x.t).changedBy) },
          ]}
        />
      </Panel>
      {t && <TemplateEditor v={v} t={t} onClose={() => setOpen("")} />}
    </>
  );
}

function TemplateEditor({ v, t, onClose }: { v: CommsView; t: MessageTemplate; onClose: () => void }) {
  const { result, run } = useRun();
  const base = latestVersion(t);
  const [trs, setTrs] = useState<TemplateTranslation[]>(() => v.cs.languages.map((l) => base.translations.find((x) => x.lang === l.code) ?? { lang: l.code, subject: "", title: "", body: "", status: "missing" }));
  const [deepLink, setDeepLink] = useState(base.deepLink);
  const [reason, setReason] = useState("");
  const [lang, setLang] = useState("en");
  const draft = { translations: trs, deepLink, providerApproval: t.channel === "whatsapp" ? (base.status === "draft" ? base.providerApproval : "pending") : "not_required" } as const;
  const chk = useMemo(() => validateTemplate(t, draft, ["en"]), [t, trs, deepLink]);
  const all = useMemo(() => validateTemplate(t, draft, v.cs.languages.map((l) => l.code)), [t, trs, deepLink, v.cs.languages]);
  const cur = trs.find((x) => x.lang === lang)!;
  const upd = (p: Partial<TemplateTranslation>) => setTrs(trs.map((x) => (x.lang === lang ? { ...x, ...p, status: (p.body ?? x.body).trim() ? (lang === "en" ? "complete" : x.status === "complete" ? "complete" : "needs_review") : "missing" } : x)));
  const vars = Object.fromEntries((VARIABLES[t.notificationId ?? "manual"]).map((x) => [x.name, `‹${x.label}›`]));
  const canEdit = v.can("comm-templates:edit");
  return (
    <Drawer open onClose={onClose} width={860} title={`${t.id} · ${CHANNEL[t.channel].label}`} subtitle={`Active v${t.activeVersion ?? "—"} · latest v${base.version} (${base.status})`}>
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <div>
          <SelectField label="Language" value={lang} onChange={setLang} options={v.cs.languages.map((l) => ({ value: l.code, label: `${l.name} · ${trs.find((x) => x.lang === l.code)?.status}` }))} />
          {t.channel === "email" && <TextField label="Subject" value={cur.subject} onChange={(x) => upd({ subject: x })} />}
          {(t.channel === "push" || t.channel === "inapp") && <TextField label="Title" value={cur.title} onChange={(x) => upd({ title: x })} />}
          <TextArea label="Message body" value={cur.body} onChange={(x) => upd({ body: x })} rows={5} hint={`Variables: ${(VARIABLES[t.notificationId ?? "manual"]).map((x) => `{{${x.name}}}`).join(" ")}`} />
          {t.channel !== "sms" && t.channel !== "email" && <SelectInput label="Deep link" value={deepLink ?? ""} onChange={(x) => setDeepLink(x || null)} options={[{ value: "", label: "None" }, ...DEEP_LINKS.map((d) => ({ value: d.id, label: d.label }))]} />}
          <TextField label="Reason for change" value={reason} onChange={setReason} />
          {chk.errors.length > 0 && <ul className="plain-list small neg">{chk.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <p className="small muted">All languages: {all.errors.filter((e) => e.startsWith("Missing translation")).length} missing translation(s).</p>
          {canEdit && (
            <div className="btn-row">
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(saveTemplateDraft(v.uid, t.id, trs, deepLink, reason), "Draft version saved; the active version is unchanged")}><Save size={14} aria-hidden="true" />Save as new version</button>
              {t.channel === "whatsapp" && base.status === "draft" && <button type="button" className="btn btn--tertiary btn--sm" onClick={() => run(setProviderApproval(v.uid, t.id, "approved"), "Mock provider approval recorded")}>Simulate provider approval</button>}
              {base.status === "draft" && v.can("comm-templates:submit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitTemplate(v.uid, t.id), "Submitted")}><Send size={14} aria-hidden="true" />Submit version</button>}
            </div>
          )}
        </div>
        <PhonePreview channel={t.channel} lang={lang} title={render(cur.title, vars)} body={cur.status === "missing" && !cur.body ? `Missing translation (${lang})` : render(cur.body, vars)} footer={deepLink ?? undefined} />
      </div>
      <h4 className="cfg-sub">Version history</h4>
      <table className="table table--compact">
        <thead><tr><th>Version</th><th>Status</th><th>Provider</th><th>Changed by</th><th>At</th><th>Reason</th><th>Approval</th></tr></thead>
        <tbody>{[...t.versions].reverse().map((x) => <tr key={x.version}><td>v{x.version}{x.version === t.activeVersion ? " (active)" : ""}</td><td><ContentBadge status={x.status} /></td><td className="small">{x.providerApproval.replace("_", " ")}</td><td className="small">{userName(v.acc, x.changedBy)}</td><td className="num small">{dt(x.changedAt)}</td><td className="small">{x.reason}</td><td>{approvalLink(x.approvalRequestId)}</td></tr>)}</tbody>
      </table>
    </Drawer>
  );
}
