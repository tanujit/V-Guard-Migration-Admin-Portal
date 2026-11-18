import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Download, FileImage, FileText, IdCard, Plus, Power, Send, Upload, Users } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { RankedBars } from "@/components/ui/DataBars";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { INSURANCE_CSV_FIELDS, INSURANCE_CSV_HEADER } from "@/config/giftsCatalogue";
import { buildTestPdf, cardModel, cardStatus, type CardModel } from "@/features/gifts/engine";
import { previewCard, recordTestDownload, requestPublication, saveCardType, setCardActive, setTypeEnabled, submitInsuranceBatch, uploadInsuranceCsv } from "@/features/gifts/store";
import { memberById } from "@/features/members/engine";
import type { InsuranceBatch, InsuranceCard, InsuranceCardType } from "@/types/gifts";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid, stateOptions } from "@/pages/masters/shared";
import { BcrTag, CardBadge, DecisionRef, approvalLink, dt, inr, memberLink, memberName, tierLabel, tierOptions, useGiftsView, useParam, useRun, userName, type GiftsView } from "./shared";

const PROGS = ["EP", "ST", "CS"] as const;

export function InsurancePage() {
  const v = useGiftsView();
  const [tab, setTab] = useParam("tab", "dashboard");
  if (!v.can("insurance:view")) return <Notice tone="danger">You need Insurance cards: View. Insurance data is not granted to every Member Management user.</Notice>;
  return (
    <>
      <SectionTitle title="Insurance card management" description="Insurance cards for EP, ST and CS (SOW 8.4): card types, segmentation by role, region and tier, CSV upload with Maker-Checker approval, preview and test download, and on / off without an app release (AF20)" />
      <Notice tone="warn">Final card fields, JPEG / PDF requirement, upload approval authority and watermark rules are open (<DecisionRef id="OP-INS1" />). Retailer and DD cards are not assumed (<DecisionRef id="GD-06" />). The insurer and insurance-card service are mock adapters; insurance numbers are masked and never stored in full.</Notice>
      <Tabs label="Insurance sections" value={tab} onChange={setTab} tabs={[{ id: "dashboard", label: "Dashboard" }, { id: "directory", label: "Card directory", count: v.gs.cards.length }, { id: "validity", label: "Validity monitoring" }, { id: "types", label: "Card types & segments", count: v.gs.cardTypes.length }, { id: "upload", label: "Bulk upload", count: v.gs.batches.filter((b) => b.status === "pending_approval" || b.status === "validated").length }, { id: "preview", label: "Preview & test download" }]} />
      {tab === "dashboard" && <Dashboard v={v} go={setTab} />}
      {tab === "directory" && <Directory v={v} />}
      {tab === "validity" && <Validity v={v} />}
      {tab === "types" && <Types v={v} />}
      {tab === "upload" && <UploadSection v={v} />}
      {tab === "preview" && <PreviewSection v={v} />}
    </>
  );
}

function Dashboard({ v, go }: { v: GiftsView; go: (t: string) => void }) {
  const nav = useNavigate();
  const c = v.gs.cards;
  const today = v.now.slice(0, 10);
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400_000).toISOString().slice(0, 10);
  const to = (q: string) => () => nav(`/gifts/insurance?tab=directory&${q}`);
  return (
    <>
      <KpiGrid cols={5} items={[
        { id: "t", label: "Insurance card records", value: c.length, desc: "All types", icon: IdCard, variant: "primary", onSelect: to("") },
        { id: "a", label: "Active cards", value: c.filter((x) => cardStatus(x, v.now) === "active").length, desc: "Published and valid", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: to("status=active") },
        { id: "i", label: "Inactive cards", value: c.filter((x) => cardStatus(x, v.now) === "inactive").length, desc: "Switched off or unpublished", icon: Power, variant: "light", onSelect: to("status=inactive") },
        { id: "aw", label: "Cards awaiting approval", value: c.filter((x) => x.publication.status === "pending_approval").length + v.gs.batches.filter((b) => b.status === "pending_approval").reduce((n, b) => n + b.rows.filter((r) => r.result === "valid").length, 0), desc: "Upload or publication", icon: CalendarClock, variant: "status", tone: "warning", onSelect: () => go("upload") },
        { id: "pp", label: "Cards pending publication", value: c.filter((x) => x.publication.status === "unpublished").length, desc: "Created, not published", icon: Send, variant: "light", onSelect: to("publication=unpublished") },
        { id: "ex", label: "Expired cards", value: c.filter((x) => cardStatus(x, v.now) === "expired").length, desc: "Past validity", icon: AlertTriangle, variant: "light", onSelect: () => go("validity") },
        { id: "up", label: "Upcoming expiries (30 days)", value: c.filter((x) => x.validTo >= today && x.validTo <= soon).length, desc: "No automatic renewal", icon: CalendarClock, variant: "light", onSelect: () => go("validity") },
        { id: "b", label: "Bulk upload batches", value: v.gs.batches.length, desc: `${v.gs.batches.filter((b) => b.status === "completed").length} processed`, icon: Upload, variant: "light", onSelect: () => go("upload") },
        { id: "f", label: "Failed upload records", value: v.gs.batches.reduce((n, b) => n + b.rows.filter((r) => ["invalid", "duplicate", "failed", "rejected"].includes(r.result)).length, 0), desc: "Invalid, duplicate or failed rows", icon: AlertTriangle, variant: "status", tone: "negative", onSelect: () => go("upload") },
        { id: "m", label: "Members with multiple cards", value: [...new Set(c.map((x) => x.memberId))].filter((id) => c.filter((x) => x.memberId === id).length > 1).length, desc: "Different card types", icon: Users, variant: "light", onSelect: () => go("validity") },
      ]} />
      <div className="grid-4">
        <Panel title="Cards by programme"><RankedBars items={PROGS.map((p) => ({ key: p, label: p, value: c.filter((x) => x.programme === p).length }))} onSelect={(x) => nav(`/gifts/insurance?tab=directory&programme=${x.key}`)} /></Panel>
        <Panel title="Cards by insurer"><RankedBars items={[...new Set(c.map((x) => x.insurer))].map((i) => ({ key: i, label: i, value: c.filter((x) => x.insurer === i).length }))} /></Panel>
        <Panel title="Cards by region"><RankedBars items={[...new Set(c.map((x) => x.region))].map((r) => ({ key: r, label: r, value: c.filter((x) => x.region === r).length }))} onSelect={(x) => nav(`/gifts/insurance?tab=directory&region=${x.key}`)} /></Panel>
        <Panel title="Cards by tier" subtitle="Tier references are development data"><RankedBars items={[...new Set(c.map((x) => x.tier ?? "none"))].map((t) => ({ key: t, label: t === "none" ? "Not supplied" : tierLabel(t), value: c.filter((x) => (x.tier ?? "none") === t).length }))} /></Panel>
      </div>
    </>
  );
}

function Directory({ v }: { v: GiftsView }) {
  const [programme, setProgramme] = useParam("programme");
  const [status, setStatus] = useParam("status");
  const [region, setRegion] = useParam("region");
  const [publication, setPublication] = useParam("publication");
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<InsuranceCard | null>(null);
  const { result, run } = useRun();
  const rows = v.gs.cards.filter((c) => v.canOn("insurance", "view", c.memberId) && (!programme || c.programme === programme) && (!status || cardStatus(c, v.now) === status) && (!region || c.region === region) && (!publication || c.publication.status === publication));
  const sensitive = (c: InsuranceCard) => v.canOn("insurance", "view_sensitive", c.memberId);
  const type = (id: string) => v.gs.cardTypes.find((t) => t.id === id);
  return (
    <>
      <div className="filters-bar">
        <SelectField label="Programme" value={programme} onChange={setProgramme} active={!!programme} options={[{ value: "", label: "EP, ST and CS" }, ...PROGS.map((p) => ({ value: p, label: p }))]} />
        <SelectField label="Status" value={status} onChange={setStatus} active={!!status} options={[{ value: "", label: "Any status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "expired", label: "Expired" }, { value: "not_yet_valid", label: "Not yet valid" }]} />
        <SelectField label="Region" value={region} onChange={setRegion} active={!!region} options={[{ value: "", label: "All regions" }, ...stateOptions()]} />
        <SelectField label="Publication" value={publication} onChange={setPublication} active={!!publication} options={[{ value: "", label: "Any" }, { value: "unpublished", label: "Not published" }, { value: "pending_approval", label: "Awaiting approval" }, { value: "published", label: "Published" }]} />
        {v.can("insurance:publish") && sel.length > 0 && <button type="button" className="btn btn--primary btn--sm" onClick={() => { if (run(requestPublication(v.uid, sel), "Publication submitted for approval").ok) setSel([]); }}><Send size={14} aria-hidden="true" />Submit {sel.length} for publication</button>}
      </div>
      <PolicyMessages result={result} />
      <Panel title={`${rows.length} card(s)`} subtitle="Insurance numbers stay restricted without Insurance cards: View sensitive" padded={false}>
        <DataTable rows={rows} rowKey={(c) => c.id} caption="Insurance cards" onRowClick={setOpen} exportName={v.can("insurance:export") ? "insurance-cards" : undefined} pageSize={15} columns={[
          { key: "sel", header: "", value: () => "", noSearch: true, render: (c) => (c.publication.status === "unpublished" && v.can("insurance:publish") ? <input type="checkbox" aria-label={`Select ${c.id}`} checked={sel.includes(c.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} /> : null) },
          { key: "id", header: "Card reference", value: (c) => c.id, render: (c) => <span className="mono small">{c.id}</span> },
          { key: "m", header: "Member ID", value: (c) => c.memberId, render: (c) => memberLink(c.memberId) },
          { key: "mn", header: "Member name", value: (c) => memberName(v.mem, c.memberId) },
          { key: "p", header: "Programme", value: (c) => c.programme },
          { key: "t", header: "Card type", value: (c) => type(c.typeId)?.name ?? c.typeId },
          { key: "n", header: "Insurance number", value: () => "", noSearch: true, render: (c) => (sensitive(c) ? <span className="mono small">{c.numberMasked}</span> : <span className="muted small">Restricted</span>) },
          { key: "ins", header: "Insurer", value: (c) => c.insurer },
          { key: "amt", header: "Insurance amount", value: (c) => c.amount, render: (c) => inr(c.amount), align: "right" },
          { key: "q", header: "Qualification", value: (c) => c.qualification },
          { key: "vf", header: "Valid from", value: (c) => c.validFrom },
          { key: "vt", header: "Valid to", value: (c) => c.validTo },
          { key: "r", header: "Region", value: (c) => c.region },
          { key: "tr", header: "Tier", value: (c) => (c.tier ? tierLabel(c.tier) : "—") },
          { key: "s", header: "Status", value: (c) => cardStatus(c, v.now), render: (c) => <CardBadge c={c} now={v.now} /> },
          { key: "ap", header: "Approval status", value: (c) => c.publication.status, render: (c) => <span className="small">{c.publication.status.replace("_", " ")} {approvalLink(c.publication.approvalRequestId)}</span> },
          { key: "u", header: "Last modified", value: (c) => c.history[c.history.length - 1]?.at ?? c.createdAt, render: (c) => <span className="small">{dt(c.history[c.history.length - 1]?.at ?? c.createdAt)}</span> },
        ]} />
      </Panel>
      {open && <CardDrawer v={v} c={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CardDrawer({ v, c, onClose }: { v: GiftsView; c: InsuranceCard; onClose: () => void }) {
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const t = v.gs.cardTypes.find((x) => x.id === c.typeId);
  const nav = useNavigate();
  return (
    <Drawer open onClose={onClose} title={`Card ${c.id}`} subtitle={<CardBadge c={c} now={v.now} />}>
      <dl className="dl-grid">
        <dt>Member</dt><dd>{memberLink(c.memberId)} {memberName(v.mem, c.memberId)} · {c.programme}</dd>
        <dt>Card type</dt><dd>{t?.name} · {t?.insurer}</dd>
        <dt>Validity</dt><dd>{c.validFrom} to {c.validTo}</dd>
        <dt>Publication</dt><dd>{c.publication.status.replace("_", " ")} {c.publication.ref && <span className="mono small">{c.publication.ref}</span>} {approvalLink(c.publication.approvalRequestId)}</dd>
        <dt>Batch</dt><dd className="mono small">{c.batchId ?? "—"}</dd>
        <dt>Segment enabled</dt><dd>{t?.enabled[c.programme] ? "Yes" : "No (card type switched off for this programme)"}</dd>
      </dl>
      <h4>History</h4>
      <ul className="activity-list">{[...c.history].reverse().map((h, k) => <li key={k}><strong>{h.action.replace(/_/g, " ")}</strong> <span className="small muted">{dt(h.at)} · {userName(v.acc, h.by)}</span><div className="small">{h.detail}</div></li>)}</ul>
      <TextField label="Reason" value={reason} onChange={setReason} hint="Required to switch the card on or off. Validity dates never change" />
      <div className="btn-row">
        {v.canOn("insurance", "activate", c.memberId) && !c.active && <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setCardActive(v.uid, c.id, true, reason), "Card activated")}><CheckCircle2 size={14} aria-hidden="true" />Activate</button>}
        {v.canOn("insurance", "disable", c.memberId) && c.active && <button type="button" className="btn btn--danger btn--sm" onClick={() => run(setCardActive(v.uid, c.id, false, reason), "Card deactivated (no app release needed)")}><Power size={14} aria-hidden="true" />Deactivate</button>}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => nav(`/gifts/insurance?tab=preview&card=${c.id}`)}>Preview</button>
      </div>
      <PolicyMessages result={result} />
    </Drawer>
  );
}

function Validity({ v }: { v: GiftsView }) {
  const [range, setRange] = useParam("range", "30");
  const [insurer, setInsurer] = useParam("insurer");
  const [member, setMember] = useParam("member");
  const [tier, setTier] = useParam("tier");
  const today = v.now.slice(0, 10);
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + Number(range) * 86400_000).toISOString().slice(0, 10);
  const scoped = v.gs.cards.filter((c) => v.canOn("insurance", "view", c.memberId) && (!insurer || c.insurer === insurer) && (!member || c.memberId.includes(member.trim())) && (!tier || c.tier === tier));
  const multi = [...new Set(scoped.map((c) => c.memberId))].filter((id) => scoped.filter((c) => c.memberId === id).length > 1);
  const groups = [
    { id: "a", title: "Active cards", rows: scoped.filter((c) => cardStatus(c, v.now) === "active") },
    { id: "s", title: `Expiring within ${range} days`, rows: scoped.filter((c) => c.validTo >= today && c.validTo <= until) },
    { id: "e", title: "Expired cards", rows: scoped.filter((c) => cardStatus(c, v.now) === "expired") },
    { id: "m", title: "Members with multiple cards", rows: scoped.filter((c) => multi.includes(c.memberId)) },
  ];
  return (
    <>
      <Notice tone="info">Validity follows the card's dates and the insurance-card service state. No automatic renewal and no expiry notification is introduced: neither is specified in the SOW. Invalid-date records are rejected at upload (see Bulk upload).</Notice>
      <div className="filters-bar">
        <TextField label="Member" value={member} onChange={setMember} />
        <SelectField label="Insurer" value={insurer} onChange={setInsurer} active={!!insurer} options={[{ value: "", label: "All insurers" }, ...[...new Set(v.gs.cards.map((c) => c.insurer))].map((i) => ({ value: i, label: i }))]} />
        <SelectField label="Tier" value={tier} onChange={setTier} active={!!tier} options={[{ value: "", label: "All tiers" }, ...tierOptions()]} />
        <SelectField label="Validity range" value={range} onChange={setRange} options={[{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "90", label: "90 days" }, { value: "365", label: "12 months" }]} />
      </div>
      <div className="grid-2">
        {groups.map((g) => (
          <Panel key={g.id} title={`${g.title} (${g.rows.length})`}>
            <DataTable rows={g.rows} rowKey={(c) => c.id} caption={g.title} searchable={false} pageSize={6} columns={[{ key: "id", header: "Card", value: (c) => c.id }, { key: "m", header: "Member", value: (c) => c.memberId, render: (c) => memberLink(c.memberId) }, { key: "p", header: "Programme", value: (c) => c.programme }, { key: "i", header: "Insurer", value: (c) => c.insurer }, { key: "t", header: "Valid to", value: (c) => c.validTo }, { key: "s", header: "Status", value: (c) => cardStatus(c, v.now), render: (c) => <CardBadge c={c} now={v.now} /> }]} />
          </Panel>
        ))}
      </div>
    </>
  );
}

function Types({ v }: { v: GiftsView }) {
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const [edit, setEdit] = useState<Omit<InsuranceCardType, "updatedAt" | "updatedBy"> | null>(null);
  return (
    <>
      <SectionTitle title="Card types and segments" description="Turn a card type on or off per programme from the backend: no mobile app release is needed (AF20). Historical cards stay available for audit" actions={v.can("insurance:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit({ id: "", name: "", insurer: "", segmentation: { programmes: ["EP"], states: [], districts: [], branches: [], tiers: [] }, enabled: { EP: true, ST: false, CS: false }, status: "active" })}><Plus size={14} aria-hidden="true" />New card type</button>} />
      <PolicyMessages result={result} />
      <TextField label="Reason for segment changes" value={reason} onChange={setReason} hint="Required" />
      <Panel title="Card types" padded={false}>
        <DataTable rows={v.gs.cardTypes} rowKey={(t) => t.id} caption="Insurance card types" onRowClick={(t) => v.can("insurance:edit") && setEdit(t)} columns={[
          { key: "id", header: "Type", value: (t) => t.id },
          { key: "n", header: "Name", value: (t) => t.name },
          { key: "i", header: "Insurer", value: (t) => t.insurer },
          { key: "seg", header: "Segmentation", value: (t) => `${t.segmentation.programmes.join("/")} ${t.segmentation.states.join("/")} ${t.segmentation.tiers.join("/")}`, render: (t) => <span className="small">{t.segmentation.programmes.join(", ")} · {t.segmentation.states.join(", ") || "all regions"} · {t.segmentation.tiers.map(tierLabel).join(", ") || "all tiers"}</span> },
          { key: "c", header: "Cards", value: (t) => v.gs.cards.filter((c) => c.typeId === t.id).length, align: "right" },
          ...PROGS.map((p) => ({ key: `en-${p}`, header: `${p} on / off`, value: (t: InsuranceCardType) => (t.enabled[p] ? "on" : "off"), render: (t: InsuranceCardType) => (t.segmentation.programmes.includes(p) ? <button type="button" className={`btn btn--xs ${t.enabled[p] ? "btn--secondary" : "btn--ghost"}`} disabled={!v.can(t.enabled[p] ? "insurance:disable" : "insurance:activate")} onClick={(e) => { e.stopPropagation(); run(setTypeEnabled(v.uid, t.id, p, !t.enabled[p], reason), `${p} ${t.enabled[p] ? "switched off" : "switched on"} (no app release)`); }}>{t.enabled[p] ? "On" : "Off"}</button> : <span className="muted small">n/a</span>) })),
          { key: "s", header: "Status", value: (t) => t.status, render: (t) => <StatusBadge tone={t.status === "active" ? "positive" : "neutral"}>{t.status}</StatusBadge> },
        ]} />
      </Panel>
      {edit && (
        <Drawer open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.id}` : "New card type"} footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn btn--primary btn--sm" onClick={() => { if (run(saveCardType(v.uid, edit), "Card type saved").ok) setEdit(null); }}>Save</button></div>}>
          <TextField label="Name" value={edit.name} onChange={(x) => setEdit({ ...edit, name: x })} required />
          <TextField label="Insurer name" value={edit.insurer} onChange={(x) => setEdit({ ...edit, insurer: x })} required />
          <MultiSelect label="Programmes (role)" options={PROGS.map((p) => ({ value: p, label: p }))} value={edit.segmentation.programmes} onChange={(x) => setEdit({ ...edit, segmentation: { ...edit.segmentation, programmes: x as ("EP" | "ST" | "CS")[] } })} required hint="EP, ST and CS only" />
          <MultiSelect label="Regions (states)" options={stateOptions()} value={edit.segmentation.states} onChange={(x) => setEdit({ ...edit, segmentation: { ...edit.segmentation, states: x } })} placeholder="All regions" />
          <MultiSelect label="Tiers (Tier master)" options={tierOptions()} value={edit.segmentation.tiers} onChange={(x) => setEdit({ ...edit, segmentation: { ...edit.segmentation, tiers: x } })} placeholder="All tiers" />
          <SelectInput label="Status" value={edit.status} onChange={(x) => setEdit({ ...edit, status: x as "active" })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
          <PolicyMessages result={result} />
        </Drawer>
      )}
    </>
  );
}

/* ======================= Bulk upload ======================= */

function UploadSection({ v }: { v: GiftsView }) {
  const { result, run } = useRun();
  const [name, setName] = useState("insurance-cards.csv");
  const [text, setText] = useState(`${INSURANCE_CSV_HEADER.join(",")}\n`);
  const [size, setSize] = useState(1);
  const [batchId, setBatchId] = useState(v.gs.batches[v.gs.batches.length - 1]?.id ?? "");
  const b = v.gs.batches.find((x) => x.id === batchId);
  const template = () => {
    const lines = [INSURANCE_CSV_HEADER.join(","), `# ${INSURANCE_CSV_FIELDS.map((f) => `${f.name}: ${f.required ? "mandatory" : "optional"}${f.sow ? " (SOW field)" : " (implementation mapping)"}`).join(" | ")}`, `MBR-EP-0101,ICT-001,Demo Member,DEV-INS-9001,Licensed electrician (demo),1800 000 0000,100000,2026-12-01 to 2027-11-30,Mock Insurer A (development)`];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "insurance-card-template-demo.csv";
    a.click();
  };
  const errorReport = (x: InsuranceBatch) => {
    const lines = ["row,field,submitted value (masked),result,error", ...x.rows.flatMap((r) => r.errors.map((e) => [r.row, e.field, e.value, r.result, e.message].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `${x.id}-errors-demo.csv`;
    a.click();
  };
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel title="1 · Template and upload" subtitle="SOW fields keep their names: Name, Number, Qualification, Toll-Free Number, Insurance Amount, Validity Dates, Insurer Name" actions={<button type="button" className="btn btn--ghost btn--sm" onClick={template}><Download size={14} aria-hidden="true" />Template</button>}>
        <table className="table table--compact">
          <thead><tr><th>Column</th><th>Source</th><th>Required</th><th>Description</th></tr></thead>
          <tbody>{INSURANCE_CSV_FIELDS.map((f) => <tr key={f.name}><td className="mono small">{f.name}</td><td className="small">{f.sow ? "SOW 8.4" : "Implementation mapping"}</td><td>{f.required ? "Mandatory" : "Optional"}</td><td className="small">{f.description}</td></tr>)}</tbody>
        </table>
        {v.can("insurance:create") ? <>
          <input type="file" accept=".csv" aria-label="Choose insurance CSV" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setName(file.name); setSize(Math.max(1, Math.round(file.size / 1024))); setText(await file.text()); } }} />
          <TextField label="File name" value={name} onChange={setName} />
          <TextArea label="File content" value={text} onChange={setText} rows={7} />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(uploadInsuranceCsv(v.uid, name, text, size), "Uploaded and validated"); if (r.ok && r.id) setBatchId(r.id); }}><Upload size={14} aria-hidden="true" />Upload and validate</button>
        </> : <p className="muted small">You need Insurance cards: Create to upload.</p>}
        <PolicyMessages result={result} />
        <p className="small muted">Processing policy: <strong>{v.gs.config.insurancePolicy === "atomic" ? "Atomic (all rows or none)" : "Row level"}</strong> · number uniqueness: <strong>{v.gs.config.insuranceNumberRule === "unique_per_insurer" ? "per insurer" : "across insurers"}</strong> (development settings, <DecisionRef id="GD-03" />)</p>
      </Panel>
      <Panel title="Batches" actions={<SelectField label="Batch" value={batchId} onChange={setBatchId} options={v.gs.batches.map((x) => ({ value: x.id, label: `${x.id} · ${x.status.replace("_", " ")}` }))} />}>
        {b ? <BatchView v={v} b={b} onReport={() => errorReport(b)} run={run} /> : <p className="muted small">No batch</p>}
      </Panel>
    </div>
  );
}

function BatchView({ v, b, onReport, run }: { v: GiftsView; b: InsuranceBatch; onReport: () => void; run: ReturnType<typeof useRun>["run"] }) {
  const count = (r: string[]) => b.rows.filter((x) => r.includes(x.result)).length;
  return (
    <>
      <dl className="dl-grid">
        <dt>Batch</dt><dd className="mono small">{b.id} · {b.fileName} · {b.sizeKb} KB</dd>
        <dt>Uploaded</dt><dd>{userName(v.acc, b.uploadedBy)} · {dt(b.uploadedAt)}</dd>
        <dt>Approved by</dt><dd>{b.approvedBy ? userName(v.acc, b.approvedBy) : "—"} {approvalLink(b.approvalRequestId)}</dd>
        <dt>Status</dt><dd><StatusBadge tone={b.status === "completed" ? "positive" : b.status === "failed" || b.status === "rejected" ? "negative" : "warning"}>{b.status.replace("_", " ")}</StatusBadge> · policy {b.policy === "atomic" ? "atomic" : "row level"}</dd>
        <dt>Records</dt><dd>{b.rows.length} total · {count(["valid", "imported"])} valid · {count(["invalid"])} invalid · {count(["duplicate"])} duplicate · {b.rows.reduce((n, r) => n + r.warnings.length, 0)} warnings</dd>
        {b.status === "completed" && <><dt>Outcome</dt><dd>{count(["imported"])} imported · {count(["rejected"])} rejected · {count(["skipped"])} skipped · {count(["failed"])} failed · completed {dt(b.completedAt)}</dd></>}
      </dl>
      <div className="btn-row">
        {b.status === "validated" && v.can("insurance:submit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitInsuranceBatch(v.uid, b.id), "Submitted for Maker-Checker approval")}><Send size={14} aria-hidden="true" />Submit for approval</button>}
        {b.rows.some((r) => r.errors.length) && <button type="button" className="btn btn--ghost btn--sm" onClick={onReport}><Download size={14} aria-hidden="true" />Error report</button>}
      </div>
      <DataTable rows={b.rows.flatMap((r) => (r.errors.length ? r.errors.map((e, k) => ({ key: `${r.row}-${k}`, row: r.row, field: e.field, value: e.value, result: r.result, message: e.message })) : [{ key: `${r.row}`, row: r.row, field: "—", value: "", result: r.result, message: r.warnings.join("; ") || (r.cardId ? `Card ${r.cardId}` : "") }]))} rowKey={(x) => x.key} caption="Row validation" searchable={false} pageSize={8} columns={[
        { key: "r", header: "Row", value: (x) => x.row, align: "right" },
        { key: "f", header: "Field", value: (x) => x.field },
        { key: "v", header: "Submitted value", value: (x) => x.value, render: (x) => <span className="mono small">{x.value || "—"}</span> },
        { key: "s", header: "Validation result", value: (x) => x.result, render: (x) => <span className={`result result--${x.result === "imported" ? "completed" : x.result}`}>{x.result}</span> },
        { key: "m", header: "Error description", value: (x) => x.message, render: (x) => <span className="small">{x.message}</span> },
      ]} />
    </>
  );
}

/* ======================= Preview and test download ======================= */

function drawCard(m: CardModel, w = 640, h = 400): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#ffc400";
  g.fillRect(0, 0, w, 64);
  g.fillStyle = "#111318";
  g.font = "bold 22px sans-serif";
  g.fillText(m.title, 24, 40);
  g.font = "12px sans-serif";
  g.fillText("V-Guard Rishta · development preview", w - 250, 40);
  g.fillStyle = m.photo.status === "approved" ? "#242833" : "#c0392b";
  g.beginPath();
  g.arc(84, 150, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = "bold 30px sans-serif";
  g.fillText(m.photo.initials, 62, 161);
  g.fillStyle = "#555";
  g.font = "10px sans-serif";
  g.fillText(m.photo.ref ? `Photo ref ${m.photo.ref}` : "No photo reference", 30, 220);
  g.fillStyle = "#111318";
  m.fields.forEach((f, i) => {
    g.font = "11px sans-serif";
    g.fillStyle = "#666";
    g.fillText(f.label, 170, 100 + i * 32);
    g.font = "bold 15px sans-serif";
    g.fillStyle = "#111318";
    g.fillText(f.value, 300, 100 + i * 32);
  });
  if (m.watermark) {
    g.save();
    g.globalAlpha = m.watermark.opacity;
    g.fillStyle = "#111318";
    g.font = "bold 40px sans-serif";
    if (m.watermark.position === "diagonal") {
      g.translate(w / 2, h / 2);
      g.rotate(-Math.PI / 7);
      g.textAlign = "center";
      g.fillText(m.watermark.text, 0, 0);
    } else if (m.watermark.position === "bottom") g.fillText(m.watermark.text, 24, h - 40);
    else {
      g.font = "bold 16px sans-serif";
      g.fillText(m.watermark.text, w - 220, 90);
    }
    g.restore();
  }
  g.fillStyle = "#c0392b";
  g.font = "bold 12px sans-serif";
  g.fillText(m.testLabel, 24, h - 14);
  return c;
}

function PreviewSection({ v }: { v: GiftsView }) {
  const [cardParam] = useParam("card");
  const [memberId, setMemberId] = useState(() => v.gs.cards.find((c) => c.id === cardParam)?.memberId ?? v.gs.cards[0]?.memberId ?? "");
  const cards = v.gs.cards.filter((c) => c.memberId === memberId.trim());
  const [cardId, setCardId] = useState(cardParam || cards[0]?.id || "");
  const card = cards.find((c) => c.id === cardId) ?? cards[0];
  const { result, run } = useRun();
  const [out, setOut] = useState<{ kind: "jpeg" | "pdf"; url: string; id: string } | null>(null);
  const can = card ? v.canOn("insurance", "view_sensitive", card.memberId) : false;
  const model = useMemo(() => (card && can ? cardModel(card, memberById(v.mem, card.memberId), v.mem, v.gs.render, true) : null), [card, can, v.mem, v.gs.render]);
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  const generate = (format: "jpeg" | "pdf") => {
    if (!card) return;
    const r = run(recordTestDownload(v.uid, card.id, format), `${format.toUpperCase()} test output generated`);
    if (!r.ok || !r.model) return;
    const canvas = drawCard(r.model);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (ch) => ch.charCodeAt(0));
    const blob = format === "jpeg" ? new Blob([bytes], { type: "image/jpeg" }) : new Blob([buildTestPdf(bytes, canvas.width, canvas.height, r.model.testLabel)], { type: "application/pdf" });
    setOut({ kind: format, url: URL.createObjectURL(blob), id: r.id! });
  };
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel title="Member-specific card preview" subtitle="Resembles the member-facing card. Not a mobile app screen">
        <div className="form-row">
          <TextField label="Member ID" value={memberId} onChange={(x) => { setMemberId(x); setCardId(""); }} />
          <SelectInput label="Card" value={card?.id ?? ""} onChange={setCardId} options={cards.length ? cards.map((c) => ({ value: c.id, label: `${c.id} · ${v.gs.cardTypes.find((t) => t.id === c.typeId)?.name}` })) : [{ value: "", label: "No card for this member" }]} />
        </div>
        {card && !can && <Notice tone="danger">You need Insurance cards: View sensitive for this member to open the card preview.</Notice>}
        {card && can && model && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(previewCard(v.uid, card.id), "Preview generated")}>Record preview</button>
            <div className="ins-card" aria-label="Insurance card preview">
              <div className="ins-card__band"><strong>{model.title}</strong><span className="small">V-Guard Rishta · development preview</span></div>
              <div className="ins-card__body">
                <div className={`ins-card__photo ins-card__photo--${model.photo.status}`} title={model.photo.note}>{model.photo.initials}</div>
                <dl className="ins-card__fields">{model.fields.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
              </div>
              {model.watermark && <div className={`ins-card__wm ins-card__wm--${model.watermark.position}`} style={{ opacity: model.watermark.opacity }}>{model.watermark.text}</div>}
              <div className="ins-card__test">{model.testLabel}</div>
            </div>
            <p className={`small ${model.photo.status === "approved" ? "muted" : "field__error"}`}>{model.photo.note}</p>
            <p className="small muted">{model.watermarkNote}</p>
          </>
        )}
        <PolicyMessages result={result} />
      </Panel>
      <Panel title="Test download" subtitle={<>Production format: <BcrTag>{v.gs.render.productionFormat ?? "Business Confirmation Required (OP-INS1)"}</BcrTag></>}>
        <p className="small">Renders a development card with the configured watermark. The output is a test preview, not an issued insurance card.</p>
        <div className="btn-row">
          <button type="button" className="btn btn--secondary btn--sm" disabled={!card || !v.gs.render.formats.jpeg} onClick={() => generate("jpeg")}><FileImage size={14} aria-hidden="true" />JPEG test output</button>
          <button type="button" className="btn btn--secondary btn--sm" disabled={!card || !v.gs.render.formats.pdf} onClick={() => generate("pdf")}><FileText size={14} aria-hidden="true" />PDF test output</button>
        </div>
        {out && (
          <div className="test-output">
            {out.kind === "jpeg" ? <img src={out.url} alt="JPEG test output of the insurance card" width={480} /> : <object data={out.url} type="application/pdf" width="100%" height="320" aria-label="PDF test output">PDF generated</object>}
            <a className="btn btn--ghost btn--sm" href={out.url} download={`${card?.id}-${out.id}-test-preview.${out.kind === "jpeg" ? "jpg" : "pdf"}`}><Download size={14} aria-hidden="true" />Download {out.kind.toUpperCase()} ({out.id})</a>
          </div>
        )}
        <h4>Recent test downloads</h4>
        <ul className="activity-list">{[...v.gs.downloads].reverse().slice(0, 6).map((d) => <li key={d.id} className="small"><span className="mono">{d.id}</span> {d.cardId} · {d.format.toUpperCase()} · {dt(d.at)} · {userName(v.acc, d.by)} · watermark {d.watermark}</li>)}</ul>
        <p className="small muted">Watermark and output formats are configured under <a href="/gifts/settings">Decisions & settings</a>.</p>
        <Checkbox label="Profile photo comes from Member Management (approved selfie reference)" checked disabled onChange={() => undefined} description="No duplicate photo master is kept. The image service itself is not connected" />
      </Panel>
    </div>
  );
}
