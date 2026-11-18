import { useState } from "react";
import { Eye, Image as ImageIcon, Plus, Save, Send, Upload } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { SelectField } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { DEEP_LINKS, FAQ_SECTIONS, PROGRAMMES } from "@/config/commsCatalogue";
import { deactivateBanner, publishBanner, publishContent, publishRich, registerMedia, saveBanner, saveFaq, saveGuide, saveLink, saveRich } from "@/features/comms/store";
import type { Banner, Faq, HowToGuide, RichContent, SocialLink } from "@/types/comms";
import type { ProgrammeCode } from "@/types/members";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, ContentBadge, DecisionRef, KpiRow, PhonePreview, approvalLink, dt, useCommsView, useParam, useRun, userName, type CommsView } from "./shared";

const progOpts = PROGRAMMES.map((p) => ({ value: p, label: p }));

/* ======================= Self-service: FAQ and How-To ======================= */

export function SelfServicePage() {
  const v = useCommsView();
  const [tab, setTab] = useParam("tab", "faq");
  const [section, setSection] = useState("all");
  const [edit, setEdit] = useState<Faq | null>(null);
  const [guide, setGuide] = useState<HowToGuide | null>(null);
  const { result, run } = useRun();
  const faqs = v.cs.faqs.filter((f) => section === "all" || f.section === section).sort((a, b) => a.section.localeCompare(b.section) || a.order - b.order);
  const rich = v.cs.rich;
  return (
    <>
      <SectionTitle title="Self-service content" description="Section-based FAQs and How-To guides, delivered to the member apps through their shared content services. Source of FAQ / How-To content is open (OP-CONTENT1)" />
      <KpiRow
        cols={5}
        items={[
          { id: "f", label: "Total FAQs", value: v.cs.faqs.length, desc: "All sections", icon: Eye, variant: "primary", onSelect: () => setTab("faq") },
          { id: "fp", label: "Published FAQs", value: v.cs.faqs.filter((f) => f.status === "published").length, desc: "Live", icon: Eye, variant: "status", tone: "positive", onSelect: () => setTab("faq") },
          { id: "fd", label: "Draft FAQs", value: v.cs.faqs.filter((f) => f.status === "draft").length, desc: "Not published", icon: Eye, onSelect: () => setTab("faq") },
          { id: "g", label: "How-To guides", value: v.cs.guides.length, desc: "Walkthroughs", icon: Eye, onSelect: () => setTab("howto") },
          { id: "t", label: "Published tutorials", value: rich.filter((r) => r.kind === "tutorial" && r.status === "published").length, desc: "Rich media", icon: Eye, onSelect: () => setTab("faq") },
          { id: "ts", label: "Testimonials", value: rich.filter((r) => r.kind === "testimonial").length, desc: "With consent records", icon: Eye, onSelect: () => setTab("faq") },
          { id: "lb", label: "Leaderboard content items", value: rich.filter((r) => r.kind === "leaderboard").length, desc: "Content only; no calculation", icon: Eye, onSelect: () => setTab("faq") },
          { id: "pp", label: "Pending publication", value: [...v.cs.faqs, ...v.cs.guides, ...rich].filter((x) => x.status === "draft" || x.status === "pending_approval").length, desc: "Draft or awaiting approval", icon: Eye, variant: "status", tone: "warning", onSelect: () => setTab("faq") },
          { id: "ex", label: "Expired / inactive", value: [...v.cs.faqs, ...v.cs.guides, ...rich].filter((x) => x.status === "inactive" || x.status === "expired").length, desc: "Not shown", icon: Eye, onSelect: () => setTab("faq") },
        ]}
      />
      <PolicyMessages result={result} />
      <Tabs label="Self-service sections" value={tab} onChange={setTab} tabs={[{ id: "faq", label: "FAQs by section", count: v.cs.faqs.length }, { id: "howto", label: "How-To guides", count: v.cs.guides.length }]} />
      {tab === "faq" ? (
        <Panel title="FAQs" subtitle="The member app shows the FAQs of the section the member is in" actions={<div className="btn-row"><SelectField label="Section" value={section} onChange={setSection} options={[{ value: "all", label: "All sections" }, ...FAQ_SECTIONS.map((s) => ({ value: s, label: s }))]} />{v.can("content:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit({ id: "", section: FAQ_SECTIONS[0], programmes: [...PROGRAMMES], translations: [{ lang: "en", question: "", answer: "" }], order: faqs.length + 1, status: "draft", publishedAt: null, updatedAt: "", updatedBy: v.uid })}><Plus size={14} aria-hidden="true" />New FAQ</button>}</div>}>
          <DataTable
            rows={faqs}
            rowKey={(f) => f.id}
            caption="FAQs"
            onRowClick={(f) => setEdit(structuredClone(f))}
            columns={[
              { key: "id", header: "FAQ ID", value: (f) => f.id },
              { key: "q", header: "Question", value: (f) => f.translations.find((t) => t.lang === "en")?.question ?? "" },
              { key: "s", header: "App section", value: (f) => f.section },
              { key: "p", header: "Programmes", value: (f) => f.programmes.join(", ") },
              { key: "l", header: "Languages", value: (f) => f.translations.map((t) => t.lang).join(", "), render: (f) => <span className="small">{f.translations.map((t) => t.lang).join(", ")}{f.translations.length < v.cs.languages.length ? <span className="warn-text"> · {v.cs.languages.length - f.translations.length} missing</span> : ""}</span> },
              { key: "o", header: "Order", value: (f) => f.order, align: "right" },
              { key: "st", header: "Status", value: (f) => f.status, render: (f) => <ContentBadge status={f.status} /> },
              { key: "pub", header: "Published", value: (f) => f.publishedAt ?? "", render: (f) => <span className="num small">{dt(f.publishedAt)}</span> },
              { key: "act", header: "", value: () => "", render: (f) => (v.can("content:publish") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(publishContent(v.uid, "faq", f.id, f.status !== "published"), f.status === "published" ? "Deactivated" : "Published"); }}>{f.status === "published" ? "Deactivate" : "Publish"}</button> : null) },
            ]}
          />
        </Panel>
      ) : (
        <Panel title="How-To guides" subtitle="Scanning, redeeming, checking points, updating profile" actions={v.can("content:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setGuide({ id: "", name: "", topic: "scanning", description: "", programmes: [...PROGRAMMES], lang: "en", steps: [{ title: "Step 1", text: "", media: null, deepLink: null }], order: v.cs.guides.length + 1, status: "draft", updatedAt: "", updatedBy: v.uid })}><Plus size={14} aria-hidden="true" />New guide</button>}>
          <DataTable rows={v.cs.guides} rowKey={(g) => g.id} caption="How-To guides" onRowClick={(g) => setGuide(structuredClone(g))} columns={[{ key: "id", header: "Guide", value: (g) => g.id }, { key: "n", header: "Name", value: (g) => g.name }, { key: "t", header: "Topic", value: (g) => g.topic.replace("_", " ") }, { key: "s", header: "Steps", value: (g) => g.steps.length, align: "right" }, { key: "l", header: "Language", value: (g) => g.lang }, { key: "st", header: "Status", value: (g) => g.status, render: (g) => <ContentBadge status={g.status} /> }, { key: "act", header: "", value: () => "", render: (g) => (v.can("content:publish") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(publishContent(v.uid, "guide", g.id, g.status !== "published"), g.status === "published" ? "Deactivated" : "Published"); }}>{g.status === "published" ? "Deactivate" : "Publish"}</button> : null) }]} />
        </Panel>
      )}
      {edit && <FaqDrawer v={v} f={edit} onClose={() => setEdit(null)} />}
      {guide && <GuideDrawer v={v} g={guide} onClose={() => setGuide(null)} />}
    </>
  );
}

function FaqDrawer({ v, f, onClose }: { v: CommsView; f: Faq; onClose: () => void }) {
  const { result, run } = useRun();
  const [x, setX] = useState(f);
  const [lang, setLang] = useState("en");
  const tr = x.translations.find((t) => t.lang === lang) ?? { lang, question: "", answer: "" };
  const upd = (p: Partial<typeof tr>) => setX({ ...x, translations: [...x.translations.filter((t) => t.lang !== lang), { ...tr, ...p }].filter((t) => t.question || t.answer || t.lang === "en") });
  return (
    <Drawer open onClose={onClose} width={680} title={x.id || "New FAQ"} footer={<button type="button" className="btn btn--primary" onClick={() => { const r = run(saveFaq(v.uid, x), "Saved as draft"); if (r.ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button>}>
      <PolicyMessages result={result} />
      <div className="form-grid form-grid--2">
        <SelectInput label="App section / context" value={x.section} onChange={(s) => setX({ ...x, section: s })} options={FAQ_SECTIONS.map((s) => ({ value: s, label: s }))} />
        <MultiSelect label="Programmes" options={progOpts} value={x.programmes} onChange={(p) => setX({ ...x, programmes: p as ProgrammeCode[] })} />
        <SelectField label="Language" value={lang} onChange={setLang} options={v.cs.languages.map((l) => ({ value: l.code, label: `${l.name}${x.translations.some((t) => t.lang === l.code) ? "" : " (missing)"}` }))} />
        <TextField label="Display order" value={String(x.order)} onChange={(o) => setX({ ...x, order: Number(o) || x.order })} inputMode="numeric" />
      </div>
      <TextField label="Question" value={tr.question} onChange={(q) => upd({ question: q })} />
      <TextArea label="Answer" value={tr.answer} onChange={(a) => upd({ answer: a })} rows={4} />
      <PhonePreview channel="inapp" title={tr.question} body={tr.answer} lang={lang} />
    </Drawer>
  );
}

function GuideDrawer({ v, g, onClose }: { v: CommsView; g: HowToGuide; onClose: () => void }) {
  const { result, run } = useRun();
  const [x, setX] = useState(g);
  const [i, setI] = useState(0);
  const step = x.steps[i];
  return (
    <Drawer open onClose={onClose} width={720} title={x.id || "New How-To guide"} footer={<button type="button" className="btn btn--primary" onClick={() => { const r = run(saveGuide(v.uid, x), "Guide saved as draft"); if (r.ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button>}>
      <PolicyMessages result={result} />
      <div className="form-grid form-grid--2">
        <TextField label="Guide name" value={x.name} onChange={(n) => setX({ ...x, name: n })} />
        <SelectInput label="Topic" value={x.topic} onChange={(t) => setX({ ...x, topic: t as HowToGuide["topic"] })} options={[["scanning", "Scanning"], ["redeeming", "Redeeming"], ["checking_points", "Checking points"], ["updating_profile", "Updating profile"]].map(([value, label]) => ({ value, label }))} />
      </div>
      <TextArea label="Description" value={x.description} onChange={(d) => setX({ ...x, description: d })} rows={2} />
      <div className="chip-list">{x.steps.map((s, j) => <button key={j} type="button" className={`chip ${j === i ? "is-active" : ""}`} onClick={() => setI(j)}>{j + 1}. {s.title}</button>)}<button type="button" className="chip" onClick={() => { setX({ ...x, steps: [...x.steps, { title: `Step ${x.steps.length + 1}`, text: "", media: null, deepLink: null }] }); setI(x.steps.length); }}>+ Step</button></div>
      {step && (
        <>
          <TextField label="Step title" value={step.title} onChange={(t) => setX({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, title: t } : s)) })} />
          <TextArea label="Step text" value={step.text} onChange={(t) => setX({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, text: t } : s)) })} rows={3} />
          <SelectInput label="Image / video" value={step.media ?? ""} onChange={(m) => setX({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, media: m || null } : s)) })} options={[{ value: "", label: "None" }, ...v.cs.media.map((m) => ({ value: m.id, label: `${m.name} (${m.type})` }))]} />
          <SelectInput label="Deep link" value={step.deepLink ?? ""} onChange={(d) => setX({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, deepLink: d || null } : s)) })} options={[{ value: "", label: "None" }, ...DEEP_LINKS.map((d) => ({ value: d.id, label: d.label }))]} />
          <PhonePreview channel="inapp" title={`${x.name} · ${step.title}`} body={step.text} footer={`Step ${i + 1} of ${x.steps.length}`} />
        </>
      )}
    </Drawer>
  );
}

/* ======================= Banners and home scrollers ======================= */

export function BannersPage() {
  const v = useCommsView();
  const { result, run } = useRun();
  const [edit, setEdit] = useState<Banner | null>(null);
  const today = v.now.slice(0, 10);
  const isPublisher = v.can("banners:publish");
  const status = (b: Banner) => (b.status === "published" && b.endDate < today ? "expired" : b.status);
  return (
    <>
      <SectionTitle title="Banners & home scrollers" description="Images, videos and GIFs with approved deep links. Only named HO Admin users (explicit Banners: Publish permission) can publish or republish (SOW 10.8 AF06)" actions={v.can("banners:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit({ id: "", name: "", description: "", mediaId: "", mediaType: "image", programmes: ["EP"], placement: "home_banner", order: 1, startDate: today, endDate: today, deepLink: null, status: "draft", publishedBy: null, publishedAt: null, updatedAt: "", updatedBy: v.uid })}><Plus size={14} aria-hidden="true" />New banner</button>} />
      <Notice tone={isPublisher ? "ok" : "info"}>{isPublisher ? "You are a named publisher." : "You are not a named publisher: you can edit drafts but not publish."} Mapping of legacy HO Admin users is under review (<DecisionRef id="CD-09" />).</Notice>
      <PolicyMessages result={result} />
      <Panel title="Banner directory">
        <DataTable
          rows={v.cs.banners}
          rowKey={(b) => b.id}
          caption="Banners"
          onRowClick={(b) => setEdit(structuredClone(b))}
          columns={[
            { key: "id", header: "Banner ID", value: (b) => b.id },
            { key: "n", header: "Name", value: (b) => b.name },
            { key: "mt", header: "Media", value: (b) => b.mediaType, render: (b) => <span className="small"><ImageIcon size={12} aria-hidden="true" /> {b.mediaType} · {v.cs.media.find((m) => m.id === b.mediaId)?.name}</span> },
            { key: "p", header: "Programme", value: (b) => b.programmes.join(", ") },
            { key: "pl", header: "Placement", value: (b) => b.placement.replace("_", " ") },
            { key: "s", header: "Start", value: (b) => b.startDate },
            { key: "e", header: "End", value: (b) => b.endDate },
            { key: "st", header: "Status", value: (b) => status(b), render: (b) => <ContentBadge status={status(b)} /> },
            { key: "pb", header: "Published by", value: (b) => (b.publishedBy ? userName(v.acc, b.publishedBy) : "") },
            { key: "m", header: "Last modified", value: (b) => b.updatedAt, render: (b) => <span className="num small">{dt(b.updatedAt)}</span> },
            { key: "act", header: "", value: () => "", render: (b) => <span className="btn-row">{status(b) !== "published" && <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(publishBanner(v.uid, b.id), "Published"); }}>Publish</button>}{status(b) === "published" && <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(deactivateBanner(v.uid, b.id), "Deactivated"); }}>Deactivate</button>}</span> },
          ]}
        />
      </Panel>
      <MediaPanel v={v} />
      {edit && <BannerDrawer v={v} b={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function BannerDrawer({ v, b, onClose }: { v: CommsView; b: Banner; onClose: () => void }) {
  const { result, run } = useRun();
  const [x, setX] = useState(b);
  const media = v.cs.media.find((m) => m.id === x.mediaId);
  return (
    <Drawer open onClose={onClose} width={680} title={x.id || "New banner"} subtitle="Saving returns a published banner to draft until republished by a named publisher" footer={<button type="button" className="btn btn--primary" onClick={() => { const r = run(saveBanner(v.uid, x), "Banner saved as draft"); if (r.ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button>}>
      <PolicyMessages result={result} />
      <div className="form-grid form-grid--2">
        <TextField label="Name" value={x.name} onChange={(n) => setX({ ...x, name: n })} />
        <SelectInput label="Media asset" value={x.mediaId} onChange={(m) => setX({ ...x, mediaId: m })} options={[{ value: "", label: "Choose" }, ...v.cs.media.map((m) => ({ value: m.id, label: `${m.name} (${m.type})` }))]} />
        <MultiSelect label="Programmes" options={progOpts} value={x.programmes} onChange={(p) => setX({ ...x, programmes: p as ProgrammeCode[] })} />
        <SelectInput label="Placement" value={x.placement} onChange={(p) => setX({ ...x, placement: p as Banner["placement"] })} options={[{ value: "home_banner", label: "Home banner" }, { value: "home_scroller", label: "Home scroller" }]} />
        <TextField label="Start date" type="date" value={x.startDate} onChange={(d) => setX({ ...x, startDate: d })} />
        <TextField label="End date" type="date" value={x.endDate} onChange={(d) => setX({ ...x, endDate: d })} />
        <TextField label="Display order" value={String(x.order)} onChange={(o) => setX({ ...x, order: Number(o) || 1 })} inputMode="numeric" />
        <SelectInput label="Deep link" value={x.deepLink ?? ""} onChange={(d) => setX({ ...x, deepLink: d || null })} options={[{ value: "", label: "None" }, ...DEEP_LINKS.map((d) => ({ value: d.id, label: d.label }))]} />
      </div>
      <TextArea label="Description" value={x.description} onChange={(d) => setX({ ...x, description: d })} rows={2} />
      <div className={`banner-preview banner-preview--${x.placement}`} aria-label="Banner preview (administrative)">
        <span className="banner-preview__media">{media ? `${media.type.toUpperCase()} · ${media.name}${media.width ? ` · ${media.width}×${media.height}` : ""}` : "No media"}</span>
        <strong>{x.name || "Banner name"}</strong>
        <span className="small">{x.deepLink ? `Opens ${x.deepLink}` : "No deep link"} · {x.startDate} to {x.endDate}</span>
      </div>
    </Drawer>
  );
}

function MediaPanel({ v }: { v: CommsView }) {
  const { result, run } = useRun();
  return (
    <Panel title="Media assets" subtitle="Metadata only: no storage service is connected. Type and size validated against development limits">
      <PolicyMessages result={result} />
      <label className="btn btn--secondary btn--sm file-btn"><Upload size={14} aria-hidden="true" />Register media file<input type="file" accept="image/*,video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(registerMedia(v.uid, { name: f.name, type: f.type, sizeKb: Math.ceil(f.size / 1024) }), "Media registered (metadata only)"); }} /></label>
      <table className="table table--compact"><thead><tr><th>ID</th><th>Name</th><th>Type</th><th className="num">Size (KB)</th><th>Dimensions</th><th>Storage</th></tr></thead><tbody>{v.cs.media.map((m) => <tr key={m.id}><td className="mono small">{m.id}</td><td>{m.name}</td><td>{m.type}</td><td className="num">{m.sizeKb}</td><td>{m.width ? `${m.width}×${m.height}` : "—"}</td><td className="small muted">Mock reference</td></tr>)}</tbody></table>
    </Panel>
  );
}

/* ======================= Tutorials, testimonials, leaderboard content ======================= */

export function RichContentPage() {
  const v = useCommsView();
  const [kind, setKind] = useParam("kind", "tutorial");
  const [edit, setEdit] = useState<RichContent | null>(null);
  const { result, run } = useRun();
  const rows = v.cs.rich.filter((r) => r.kind === kind);
  const blank = (): RichContent => ({ id: "", kind: kind as RichContent["kind"], name: "", description: "", mediaId: null, deepLink: null, programmes: ["EP"], lang: "en", order: rows.length + 1, status: "draft", approvalRequestId: null, updatedAt: "", updatedBy: v.uid, ...(kind === "testimonial" ? { contributor: { display: "", consentRef: null, consentConfirmed: false } } : {}), ...(kind === "leaderboard" ? { leaderboard: { gameId: "GAM-0006", geography: "KL", period: "" } } : {}) });
  return (
    <>
      <SectionTitle title="Tutorials, testimonials & leaderboard content" description="Rich-media scrollers. Testimonials need a recorded consent reference and approval before publication. Leaderboard content is presentation only; rankings come from the Scheme & Incentive leaderboard service" actions={v.can("content:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(blank())}><Plus size={14} aria-hidden="true" />New {kind}</button>} />
      <PolicyMessages result={result} />
      <Tabs label="Content kind" value={kind} onChange={setKind} tabs={[{ id: "tutorial", label: "Tutorials" }, { id: "testimonial", label: "Testimonials" }, { id: "leaderboard", label: "Leaderboard content" }]} />
      <Panel title="Content">
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Rich content" onRowClick={(r) => setEdit(structuredClone(r))} columns={[
          { key: "id", header: "Reference", value: (r) => r.id },
          { key: "n", header: "Name", value: (r) => r.name },
          { key: "m", header: "Media", value: (r) => v.cs.media.find((m) => m.id === r.mediaId)?.name ?? "" },
          { key: "p", header: "Programme", value: (r) => r.programmes.join(", ") },
          { key: "x", header: kind === "testimonial" ? "Contributor / consent" : kind === "leaderboard" ? "Leaderboard" : "Deep link", value: (r) => (r.contributor ? `${r.contributor.display} · ${r.contributor.consentRef ?? "no consent"}` : r.leaderboard ? `${r.leaderboard.gameId} · ${r.leaderboard.geography} · ${r.leaderboard.period}` : r.deepLink ?? "") },
          { key: "o", header: "Order", value: (r) => r.order, align: "right" },
          { key: "st", header: "Status", value: (r) => r.status, render: (r) => <ContentBadge status={r.status} /> },
          { key: "apr", header: "Approval", value: (r) => r.approvalRequestId ?? "", render: (r) => approvalLink(r.approvalRequestId) },
          { key: "act", header: "", value: () => "", render: (r) => (r.status === "draft" ? <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(publishRich(v.uid, r.id), r.kind === "testimonial" ? "Submitted for approval" : "Published"); }}>{r.kind === "testimonial" ? "Submit" : "Publish"}</button> : null) },
        ]} />
      </Panel>
      {edit && <RichDrawer v={v} r={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RichDrawer({ v, r, onClose }: { v: CommsView; r: RichContent; onClose: () => void }) {
  const { result, run } = useRun();
  const [x, setX] = useState(r);
  const games = ["GAM-0006", "GAM-0007"];
  return (
    <Drawer open onClose={onClose} width={640} title={x.id || `New ${x.kind}`} footer={<button type="button" className="btn btn--primary" onClick={() => { const res = run(saveRich(v.uid, x), "Saved as draft"); if (res.ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button>}>
      <PolicyMessages result={result} />
      <TextField label="Name" value={x.name} onChange={(n) => setX({ ...x, name: n })} />
      <TextArea label="Content" value={x.description} onChange={(d) => setX({ ...x, description: d })} rows={3} />
      <div className="form-grid form-grid--2">
        <SelectInput label="Image / video" value={x.mediaId ?? ""} onChange={(m) => setX({ ...x, mediaId: m || null })} options={[{ value: "", label: "None" }, ...v.cs.media.map((m) => ({ value: m.id, label: m.name }))]} />
        <SelectInput label="Deep link" value={x.deepLink ?? ""} onChange={(d) => setX({ ...x, deepLink: d || null })} options={[{ value: "", label: "None" }, ...DEEP_LINKS.map((d) => ({ value: d.id, label: d.label }))]} />
        <MultiSelect label="Programmes" options={progOpts} value={x.programmes} onChange={(p) => setX({ ...x, programmes: p as ProgrammeCode[] })} />
        <SelectInput label="Language" value={x.lang} onChange={(l) => setX({ ...x, lang: l })} options={v.cs.languages.map((l) => ({ value: l.code, label: l.name }))} />
      </div>
      {x.contributor && (
        <>
          <TextField label="Contributor display (approved)" value={x.contributor.display} onChange={(d) => setX({ ...x, contributor: { ...x.contributor!, display: d } })} />
          <TextField label="Consent reference" value={x.contributor.consentRef ?? ""} onChange={(c) => setX({ ...x, contributor: { ...x.contributor!, consentRef: c || null } })} />
          <Checkbox label="Consent confirmed for publication" checked={x.contributor.consentConfirmed} onChange={(c) => setX({ ...x, contributor: { ...x.contributor!, consentConfirmed: c } })} />
        </>
      )}
      {x.leaderboard && (
        <div className="form-grid form-grid--3">
          <SelectInput label="Leaderboard (scheme service)" value={x.leaderboard.gameId} onChange={(g) => setX({ ...x, leaderboard: { ...x.leaderboard!, gameId: g } })} options={games.map((g) => ({ value: g, label: g }))} />
          <TextField label="Geography" value={x.leaderboard.geography} onChange={(g) => setX({ ...x, leaderboard: { ...x.leaderboard!, geography: g } })} />
          <TextField label="Period" value={x.leaderboard.period} onChange={(p) => setX({ ...x, leaderboard: { ...x.leaderboard!, period: p } })} />
        </div>
      )}
      <PhonePreview channel="inapp" title={x.name} body={x.description} footer={x.contributor?.display} />
    </Drawer>
  );
}

/* ======================= Social and contact links ======================= */

export function LinksPage() {
  const v = useCommsView();
  const { result, run } = useRun();
  const [x, setX] = useState<SocialLink | null>(null);
  return (
    <>
      <SectionTitle title="Social & contact links" description="Facebook, Instagram, official website and Twitter/X, configured here rather than hardcoded in the apps" actions={v.can("content:manage") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setX({ id: "", type: "other", display: "", url: "https://", placement: "Profile · Connect with us", programmes: [...PROGRAMMES], order: v.cs.links.length + 1, status: "draft", updatedAt: "", updatedBy: v.uid })}><Plus size={14} aria-hidden="true" />New link</button>} />
      <Notice tone="info">The exact link set and placement are open (<DecisionRef id="CD-03" label="OP-CONTENT1" />). <BcrTag>Final placement pending</BcrTag></Notice>
      <PolicyMessages result={result} />
      <Panel title="Links">
        <DataTable rows={v.cs.links} rowKey={(l) => l.id} caption="Social links" searchable={false} onRowClick={(l) => setX(structuredClone(l))} columns={[{ key: "t", header: "Link type", value: (l) => l.type.replace("_", "/") }, { key: "d", header: "Display name", value: (l) => l.display }, { key: "u", header: "URL", value: (l) => l.url, render: (l) => <span className="mono small">{l.url}</span> }, { key: "pl", header: "Placement", value: (l) => l.placement }, { key: "p", header: "Programmes", value: (l) => l.programmes.join(", ") }, { key: "o", header: "Order", value: (l) => l.order, align: "right" }, { key: "s", header: "Status", value: (l) => l.status, render: (l) => <ContentBadge status={l.status} /> }]} />
      </Panel>
      {x && (
        <Drawer open onClose={() => setX(null)} title={x.id || "New link"} footer={<div className="btn-row"><button type="button" className="btn btn--secondary" onClick={() => { const r = run(saveLink(v.uid, { ...x, status: "draft" }), "Saved"); if (r.ok) setX(null); }}>Save draft</button><button type="button" className="btn btn--primary" onClick={() => { const r = run(saveLink(v.uid, { ...x, status: "published" }), "Published"); if (r.ok) setX(null); }}><Send size={14} aria-hidden="true" />Publish</button></div>}>
          <PolicyMessages result={result} />
          <SelectInput label="Link type" value={x.type} onChange={(t) => setX({ ...x, type: t as SocialLink["type"] })} options={[["facebook", "Facebook"], ["instagram", "Instagram"], ["website", "Official website"], ["twitter_x", "Twitter / X"], ["other", "Other"]].map(([value, label]) => ({ value, label }))} />
          <TextField label="Display name" value={x.display} onChange={(d) => setX({ ...x, display: d })} />
          <TextField label="URL" value={x.url} onChange={(u) => setX({ ...x, url: u })} hint="https:// only" />
          <TextField label="Placement" value={x.placement} onChange={(p) => setX({ ...x, placement: p })} />
          <Checkbox label="Disabled" checked={x.status === "inactive"} onChange={(d) => setX({ ...x, status: d ? "inactive" : "draft" })} />
        </Drawer>
      )}
    </>
  );
}
