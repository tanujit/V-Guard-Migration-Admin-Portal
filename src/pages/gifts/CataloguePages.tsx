import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Eye, Pencil, Plus, Power, RefreshCw, Save, Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, SelectInput, Stepper, TextArea, TextField } from "@/components/form/Form";
import { AVAILABILITY, GIFT_TYPE } from "@/config/giftsCatalogue";
import { GEOGRAPHY } from "@/config/geography";
import { SEED_SKUS } from "@/data/mock/masterSeed";
import { costFor, overlapPairs, redeemBlocks, segmentReasons, validateItem } from "@/features/gifts/engine";
import { saveCategory, saveCostRule, saveInitialCost, saveItem, setAvailability, setCategoryStatus, setItemStatus, submitCostRule, submitItem, syncItemInventory } from "@/features/gifts/store";
import { memberById } from "@/features/members/engine";
import type { GiftItem, GiftType, PointCostRule } from "@/types/gifts";
import type { ProgrammeCode } from "@/types/members";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { branchOptions, stateOptions } from "@/pages/masters/shared";
import { AvailBadge, CatBadge, DecisionRef, GBASE, TypeTag, approvalLink, dt, giftLink, giftName, partnerName, pts, tierLabel, tierOptions, useGiftsView, useParam, useRun, userName, type GiftsView } from "./shared";

const PROGS: ProgrammeCode[] = ["EP", "ST", "CS", "Retailer", "DD"];
const progOptions = PROGS.map((p) => ({ value: p, label: p }));
const districtOptions = () => GEOGRAPHY.flatMap((s) => s.districts.map((d) => ({ value: d.code, label: d.name, group: s.name })));

function costRange(v: GiftsView, id: string) {
  const c = v.gs.costs.filter((x) => x.giftId === id && x.status === "active");
  if (!c.length) return null;
  const min = Math.min(...c.map((x) => x.points));
  const max = Math.max(...c.map((x) => x.points));
  return { min, max, label: min === max ? pts(min) : `${pts(min)}–${pts(max)}` };
}

/* ======================= Directory ======================= */

export function CatalogueDirectoryPage() {
  const v = useGiftsView();
  const nav = useNavigate();
  const [type, setType] = useParam("type");
  const [status, setStatus] = useParam("status");
  const [availability, setAvail] = useParam("availability");
  const [category, setCategory] = useParam("category");
  const [partner, setPartner] = useParam("partner");
  const [programme, setProgramme] = useParam("programme");
  const [region, setRegion] = useParam("region");
  const [tier, setTier] = useParam("tier");
  const [minCost, setMin] = useParam("min");
  const [maxCost, setMax] = useParam("max");
  const rows = v.gs.items.filter((i) => {
    const c = costRange(v, i.id);
    return (!type || i.type === type) && (!status || i.status === status) && (!availability || i.availability === availability) && (!category || i.categoryId === category) && (!partner || i.partnerId === partner) && (!programme || i.segmentation.programmes.includes(programme as ProgrammeCode)) && (!region || !i.segmentation.states.length || i.segmentation.states.includes(region)) && (!tier || i.segmentation.tiers.includes(tier)) && (!minCost || (c && c.max >= Number(minCost))) && (!maxCost || (c && c.min <= Number(maxCost)));
  });
  const any = [type, status, availability, category, partner, programme, region, tier, minCost, maxCost].some(Boolean);
  const clear = () => [setType, setStatus, setAvail, setCategory, setPartner, setProgramme, setRegion, setTier, setMin, setMax].forEach((f) => f(""));
  const sku = (i: GiftItem) => v.gs.mappings.find((m) => m.giftId === i.id && m.status === "active")?.partnerSku ?? "—";
  return (
    <>
      <SectionTitle title="Gift catalogue" description="Central catalogue for the member app and microsite. Members see only approved, active items for their programme, region and tier; out-of-stock items show as unavailable" actions={v.can("gift-catalogue:create") && <Link className="btn btn--primary btn--sm" to={`${GBASE}/catalogue/new`}><Plus size={14} aria-hidden="true" />New gift item</Link>} />
      <div className="filters-bar">
        <SelectField label="Gift type" value={type} onChange={setType} active={!!type} options={[{ value: "", label: "All types" }, ...Object.entries(GIFT_TYPE).map(([k, x]) => ({ value: k, label: x.label }))]} />
        <SelectField label="Category" value={category} onChange={setCategory} active={!!category} options={[{ value: "", label: "All categories" }, ...v.gs.categories.map((c) => ({ value: c.id, label: c.name }))]} />
        <SelectField label="Partner" value={partner} onChange={setPartner} active={!!partner} options={[{ value: "", label: "All partners" }, ...v.gs.partners.map((p) => ({ value: p.id, label: p.name }))]} />
        <SelectField label="Programme" value={programme} onChange={setProgramme} active={!!programme} options={[{ value: "", label: "All programmes" }, ...progOptions]} />
        <SelectField label="Region" value={region} onChange={setRegion} active={!!region} options={[{ value: "", label: "All regions" }, ...stateOptions()]} />
        <SelectField label="Tier" value={tier} onChange={setTier} active={!!tier} options={[{ value: "", label: "All tiers" }, ...tierOptions()]} />
        <SelectField label="Availability" value={availability} onChange={setAvail} active={!!availability} options={[{ value: "", label: "Any availability" }, ...Object.entries(AVAILABILITY).map(([k, x]) => ({ value: k, label: x.label }))]} />
        <SelectField label="Status" value={status} onChange={setStatus} active={!!status} options={[{ value: "", label: "Any status" }, { value: "draft", label: "Draft" }, { value: "pending_approval", label: "Awaiting approval" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "rejected", label: "Rejected" }]} />
        <TextField label="Min points" value={minCost} onChange={setMin} inputMode="numeric" />
        <TextField label="Max points" value={maxCost} onChange={setMax} inputMode="numeric" />
        {any && <button type="button" className="btn btn--ghost btn--sm" onClick={clear}>Clear all</button>}
      </div>
      <Panel title={`${rows.length} catalogue item${rows.length === 1 ? "" : "s"}`} padded={false}>
        <DataTable
          rows={rows}
          rowKey={(i) => i.id}
          caption="Gift catalogue"
          onRowClick={(i) => nav(`${GBASE}/catalogue/${i.id}`)}
          rowActionLabel={(i) => `Open ${i.name}`}
          exportName={v.can("gift-catalogue:export") ? "gift-catalogue" : undefined}
          pageSize={15}
          columns={[
            { key: "id", header: "Gift ID", value: (i) => i.id, render: (i) => giftLink(i.id) },
            { key: "n", header: "Gift name", value: (i) => i.name, render: (i) => <span>{i.name}{i.draft && <> <StatusBadge tone="warning">Draft change</StatusBadge></>}</span> },
            { key: "t", header: "Type", value: (i) => GIFT_TYPE[i.type].label, render: (i) => <TypeTag type={i.type} /> },
            { key: "c", header: "Category", value: (i) => v.gs.categories.find((c) => c.id === i.categoryId)?.name ?? i.categoryId },
            { key: "d", header: "Description", value: (i) => i.description, render: (i) => <span className="small muted truncate">{i.description}</span>, noSearch: true },
            { key: "p", header: "Partner", value: (i) => partnerName(v.gs, i.partnerId) },
            { key: "sku", header: "Partner SKU", value: (i) => sku(i), render: (i) => <span className="mono small">{sku(i)}</span> },
            { key: "pr", header: "Programmes", value: (i) => i.segmentation.programmes.join(", ") },
            { key: "r", header: "Region", value: (i) => i.segmentation.states.join(", ") || "All" },
            { key: "tr", header: "Tier", value: (i) => i.segmentation.tiers.map(tierLabel).join(", ") || "All" },
            { key: "pc", header: "Point cost", value: (i) => costRange(v, i.id)?.min ?? null, render: (i) => <span className="num">{costRange(v, i.id)?.label ?? <span className="muted">Not set</span>}</span>, align: "right" },
            { key: "av", header: "Availability", value: (i) => i.availability, render: (i) => <AvailBadge a={i.availability} /> },
            { key: "stk", header: "Stock", value: (i) => i.inventory.quantity, render: (i) => (i.inventory.source === "inventory_service" ? <span className="num">{i.inventory.quantity}</span> : <span className="muted small">Not supplied</span>), align: "right" },
            { key: "s", header: "Status", value: (i) => i.status, render: (i) => <CatBadge s={i.status} /> },
            { key: "u", header: "Last modified", value: (i) => i.updatedAt, render: (i) => <span className="small">{dt(i.updatedAt)}</span> },
          ]}
        />
      </Panel>
    </>
  );
}

/* ======================= Detail ======================= */

export function GiftDetailPage() {
  const { giftId = "" } = useParams();
  const v = useGiftsView();
  const nav = useNavigate();
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const [member, setMember] = useState("");
  const i = v.gs.items.find((x) => x.id === giftId);
  if (!i) return <Notice tone="danger">Gift item {giftId} not found. <Link to={`${GBASE}/catalogue`}>Back to the catalogue</Link></Notice>;
  const cat = v.gs.categories.find((c) => c.id === i.categoryId);
  const costs = v.gs.costs.filter((c) => c.giftId === i.id);
  const maps = v.gs.mappings.filter((m) => m.giftId === i.id);
  const sku = i.productSkuId ? SEED_SKUS.find((s) => s.id === i.productSkuId) : undefined;
  const m = member ? memberById(v.mem, member.trim()) : undefined;
  const live = i.status === "active";
  return (
    <>
      <div className="wallet-head">
        <div>
          <Link to={`${GBASE}/catalogue`} className="btn btn--ghost btn--sm"><ArrowLeft size={14} aria-hidden="true" />Catalogue</Link>
          <h2 className="wallet-head__title">{i.name} <TypeTag type={i.type} /> <CatBadge s={i.status} /> <AvailBadge a={i.availability} /></h2>
          <p className="muted small"><span className="mono">{i.id}</span> · {i.code} · version {i.version}{i.publishedAt ? ` · published ${dt(i.publishedAt)}` : ""} · approval {approvalLink(i.approvalRequestId)}</p>
        </div>
        <div className="btn-row">
          {v.can("gift-catalogue:edit") && i.status !== "pending_approval" && i.draft?.status !== "pending_approval" && <Link className="btn btn--secondary btn--sm" to={`${GBASE}/catalogue/${i.id}/edit`}><Pencil size={14} aria-hidden="true" />{live ? "Edit (new version)" : "Edit draft"}</Link>}
          {v.can("gift-catalogue:submit") && (i.status === "draft" || i.draft?.status === "draft") && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(submitItem(v.uid, i.id), "Submitted for approval")}><Send size={14} aria-hidden="true" />Submit for approval</button>}
        </div>
      </div>
      {i.draft && <Notice tone="info">A draft change (v{i.draft.version}, {i.draft.status === "pending_approval" ? <>awaiting approval {approvalLink(i.draft.approvalRequestId)}</> : "not submitted"}) is waiting. Members keep seeing v{i.version} until it is approved. Reason: {i.draft.reason}</Notice>}
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Gift details">
          <dl className="dl-grid">
            <dt>Category</dt><dd>{cat?.name ?? i.categoryId}</dd>
            <dt>Description</dt><dd>{i.description}</dd>
            <dt>Terms and conditions</dt><dd>{i.terms}</dd>
            <dt>Fulfilment partner</dt><dd>{partnerName(v.gs, i.partnerId)}</dd>
            {i.voucher && <><dt>Voucher</dt><dd>{i.voucher.denomination != null ? `Denomination ₹${i.voucher.denomination}` : "Value set by the provider at issue"} · {i.voucher.productRef} · {i.voucher.validityNote}</dd></>}
            {i.physical && <><dt>Physical delivery</dt><dd>{i.physical.delivery} · image {i.physical.imageRef ?? "none"}</dd></>}
            {i.vguard && <><dt>V-Guard.com</dt><dd>{i.vguard.catalogueRef} · {i.vguard.arrangement}</dd></>}
            <dt>Product & SKU master</dt><dd>{sku ? <Link to={`/masters/products/${sku.productId}`} className="mono small">{sku.code} · {sku.name}</Link> : <span className="muted">No SKU mapping</span>}</dd>
            <dt>Inventory</dt><dd>{i.inventory.source === "inventory_service" ? `${i.inventory.quantity} available · ${i.inventory.reference} · synced ${dt(i.inventory.syncedAt)}` : "No inventory data supplied: availability is not assumed"}</dd>
            <dt>Segmentation</dt><dd>{i.segmentation.programmes.join(", ")} · {i.segmentation.states.join(", ") || "all regions"}{i.segmentation.districts.length ? ` · ${i.segmentation.districts.length} district(s)` : ""}{i.segmentation.branches.length ? ` · ${i.segmentation.branches.length} branch(es)` : ""} · {i.segmentation.tiers.map(tierLabel).join(", ") || "all tiers"}</dd>
            <dt>Channels</dt><dd>{[i.channels.influencerApp && "Influencer app", i.channels.retailerApp && "Retailer app / SDK", i.channels.microsite && "Microsite"].filter(Boolean).join(", ")}</dd>
            <dt>Effective from</dt><dd>{i.effectiveFrom}</dd>
            <dt>Last modified</dt><dd>{dt(i.updatedAt)} by {userName(v.acc, i.updatedBy)}</dd>
          </dl>
        </Panel>
        <Panel title="Catalogue preview" subtitle="Administrative preview, not the member app">
          <CataloguePreview v={v} i={i} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Point costs" subtitle="One rule per segment; no universal cost is assumed" actions={<Link to={`${GBASE}/costs?gift=${i.id}`} className="btn btn--ghost btn--sm">Open matrix</Link>}>
          <CostTable v={v} rows={costs} />
        </Panel>
        <Panel title="Partner / SKU mapping" actions={<Link to={`${GBASE}/partners?tab=mapping`} className="btn btn--ghost btn--sm">Manage mappings</Link>}>
          {maps.length ? <ul className="check-list">{maps.map((x) => <li key={x.id}><span className="mono small">{x.id}</span> {partnerName(v.gs, x.partnerId)} · <span className="mono">{x.partnerSku}</span> · {x.availabilityMapping.replace(/_/g, " ")} · <StatusBadge tone={x.status === "active" ? "positive" : "neutral"}>{x.status}</StatusBadge></li>)}</ul> : <p className="muted small">No partner mapping{i.type === "vguard_com" ? " (V-Guard.com arrangement)" : ": the item cannot be redeemed"}</p>}
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Availability and status" subtitle="Every change is audited">
          <TextField label="Reason" value={reason} onChange={setReason} hint="Required for availability and status changes" />
          <div className="btn-row">
            {v.can("gift-catalogue:edit") && <>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setAvailability(v.uid, i.id, "out_of_stock", reason), "Marked out of stock")}>Mark out of stock</button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setAvailability(v.uid, i.id, "available", reason), "Marked available")}>Mark available</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(syncItemInventory(v.uid, i.id, i.inventory.source === "inventory_service" ? i.inventory.quantity : null), "Inventory read")}><RefreshCw size={14} aria-hidden="true" />Read inventory service</button>
            </>}
            {v.can("gift-catalogue:disable") && live && <button type="button" className="btn btn--danger btn--sm" onClick={() => run(setItemStatus(v.uid, i.id, "inactive", reason), "Deactivated")}><Power size={14} aria-hidden="true" />Deactivate</button>}
            {v.can("gift-catalogue:publish") && i.status === "inactive" && <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setItemStatus(v.uid, i.id, "active", reason), "Reactivated")}><CheckCircle2 size={14} aria-hidden="true" />Reactivate</button>}
          </div>
        </Panel>
        <Panel title="Eligibility check" subtitle="What the catalogue service decides for one member">
          <TextField label="Member ID" value={member} onChange={setMember} placeholder="MBR-EP-0101" />
          {member && !m && <p className="field__error">Member not found</p>}
          {m && (() => {
            const blocks = redeemBlocks(v.gs, i, m, v.now);
            const c = costFor(v.gs, i.id, m, v.now);
            const seg = segmentReasons(i.segmentation, m, v.gs.config.tierAssignments[m.id] ?? null);
            return (
              <div className="small">
                <p>{m.name} · {m.programme} · {m.branchCode} · tier {v.gs.config.tierAssignments[m.id] ? tierLabel(v.gs.config.tierAssignments[m.id]) : "not available"}</p>
                <p>Visible in catalogue: <strong>{seg.length ? "No" : "Yes"}</strong> · Redeemable now: <strong>{!blocks.length && c.points != null ? "Yes" : "No"}</strong> · Point cost: <strong>{c.points != null ? pts(c.points) : "—"}</strong></p>
                <ul className="check-list">{[...blocks, ...(c.points == null ? [c.message] : [])].map((x) => <li key={x} className="field__error">{x}</li>)}</ul>
              </div>
            );
          })()}
        </Panel>
      </div>
      <Panel title="Version history">
        <ul className="activity-list">{[...i.history].reverse().map((h, k) => <li key={k}><strong>v{h.version}</strong> {h.change} <span className="muted small">{dt(h.at)} · {userName(v.acc, h.by)}</span> {h.approvalRequestId && approvalLink(h.approvalRequestId)}</li>)}</ul>
      </Panel>
      <p><button type="button" className="btn btn--ghost btn--sm" onClick={() => nav(`${GBASE}/audit?entity=${i.id}`)}><Eye size={14} aria-hidden="true" />Audit events for {i.id}</button></p>
    </>
  );
}

function CataloguePreview({ v, i }: { v: GiftsView; i: GiftItem }) {
  const c = costRange(v, i.id);
  return (
    <div className="gift-preview">
      <div className={`gift-preview__media gift-preview__media--${i.type}`} aria-hidden="true">{GIFT_TYPE[i.type].short}</div>
      <div className="gift-preview__body">
        <strong>{i.name}</strong>
        <span className="small muted">{i.description}</span>
        <span className="gift-preview__cost">{c ? `${c.label} points` : "Point cost not set"}</span>
        <span className="small">{AVAILABILITY[i.availability].label} · {GIFT_TYPE[i.type].label}</span>
        <span className="small muted">For {i.segmentation.programmes.join(", ")} · {i.segmentation.states.join(", ") || "all regions"} · {i.segmentation.tiers.map(tierLabel).join(", ") || "all tiers"}</span>
        <span className="small muted">T&amp;C: {i.terms}</span>
      </div>
    </div>
  );
}

function CostTable({ v, rows }: { v: GiftsView; rows: PointCostRule[] }) {
  const { result, run } = useRun();
  return (
    <>
      <PolicyMessages result={result} />
      <DataTable rows={rows} rowKey={(r) => r.id} caption="Point cost rules" searchable={false} pageSize={8} columns={[
        { key: "id", header: "Rule", value: (r) => r.id },
        { key: "g", header: "Gift", value: (r) => giftName(v.gs, r.giftId), render: (r) => <span>{giftLink(r.giftId)} <span className="small">{giftName(v.gs, r.giftId)}</span></span> },
        { key: "p", header: "Programme", value: (r) => r.programme ?? "All" },
        { key: "mt", header: "Member type", value: (r) => r.memberType ?? "All" },
        { key: "r", header: "Region", value: (r) => r.states.join(", ") || "All" },
        { key: "t", header: "Tier", value: (r) => r.tiers.map(tierLabel).join(", ") || "All" },
        { key: "pts", header: "Point cost", value: (r) => r.points, render: (r) => <span className="num">{pts(r.points)}</span>, align: "right" },
        { key: "e", header: "Effective", value: (r) => r.effectiveFrom, render: (r) => <span className="small">{r.effectiveFrom} – {r.effectiveTo ?? "open"}</span> },
        { key: "s", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "active" ? "positive" : r.status === "pending_approval" ? "warning" : r.status === "rejected" ? "negative" : "neutral"}>{r.status.replace("_", " ")}</StatusBadge> },
        { key: "rep", header: "Replaces", value: (r) => r.replaces ?? "", render: (r) => <span className="mono small">{r.replaces ?? "—"}</span> },
        { key: "a", header: "Approval", value: (r) => r.approvalRequestId ?? "", render: (r) => approvalLink(r.approvalRequestId) },
        { key: "x", header: "", value: () => "", render: (r) => (r.status === "draft" && v.can("gift-catalogue:submit") && v.gs.items.find((i) => i.id === r.giftId)?.status === "active" ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(submitCostRule(v.uid, r.id), "Submitted for approval")}>Submit</button> : null) },
      ]} />
    </>
  );
}

/* ======================= Point cost matrix ======================= */

export function PointCostPage() {
  const v = useGiftsView();
  const [gift, setGift] = useParam("gift");
  const [edit, setEdit] = useState<PointCostRule | null>(null);
  const rows = v.gs.costs.filter((c) => !gift || c.giftId === gift);
  const pairs = overlapPairs(v.gs.costs);
  const blank = (giftId: string, replaces: PointCostRule | null = null): PointCostRule => ({ id: "", giftId, programme: replaces?.programme ?? null, memberType: replaces?.memberType ?? null, states: replaces?.states ?? [], tiers: replaces?.tiers ?? [], points: replaces?.points ?? 0, effectiveFrom: v.now.slice(0, 10), effectiveTo: null, status: "draft", approvalRequestId: null, replaces: replaces?.id ?? null, updatedBy: v.uid, updatedAt: "" });
  return (
    <>
      <SectionTitle title="Segment point cost matrix" description="Point costs may differ by programme, member type, region and tier. Approved costs are never overwritten: a change is a new rule that replaces the old one from its effective date" actions={v.can("gift-catalogue:edit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(blank(gift || v.gs.items[0].id))}><Plus size={14} aria-hidden="true" />New cost rule</button>} />
      {pairs.length ? <Notice tone="danger">{pairs.length} overlapping active pair(s): {pairs.map(([a, b]) => `${a.id} / ${b.id}`).join(", ")}. A member matching both gets no point cost until a precedence rule is confirmed (<DecisionRef id="GD-04" />)</Notice> : <Notice tone="ok">No overlapping active rules. New rules that overlap a live or pending rule are refused (<DecisionRef id="GD-04" label="no precedence is invented" />)</Notice>}
      <div className="filters-bar">
        <SelectField label="Gift" value={gift} onChange={setGift} active={!!gift} options={[{ value: "", label: "All gifts" }, ...v.gs.items.map((i) => ({ value: i.id, label: `${i.id} · ${i.name}` }))]} />
      </div>
      <Panel title={`${rows.length} rule(s)`} subtitle="Draft rules for a live item are submitted here; drafts of a new item are approved with the item">
        <CostTable v={v} rows={rows} />
      </Panel>
      {v.can("gift-catalogue:edit") && (
        <Panel title="Replace an approved cost">
          <div className="btn-row">{rows.filter((r) => r.status === "active").map((r) => <button key={r.id} type="button" className="btn btn--ghost btn--xs" onClick={() => setEdit(blank(r.giftId, r))}>Replace {r.id} ({r.programme ?? "All"} {pts(r.points)})</button>)}</div>
        </Panel>
      )}
      {edit && <CostDrawer v={v} rule={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function CostDrawer({ v, rule, onClose }: { v: GiftsView; rule: PointCostRule; onClose: () => void }) {
  const [r, setR] = useState(rule);
  const { result, run } = useRun();
  const set = (p: Partial<PointCostRule>) => setR({ ...r, ...p });
  const old = r.replaces ? v.gs.costs.find((x) => x.id === r.replaces) : undefined;
  return (
    <Drawer open onClose={onClose} title={old ? `Replace ${old.id}` : "New point cost rule"} subtitle="Saved as a draft; submit it for approval" footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button><button type="button" className="btn btn--primary btn--sm" onClick={() => { const x = run(saveCostRule(v.uid, r), "Draft rule saved"); if (x.ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button></div>}>
      {old && <div className="original-box small">Current: {old.programme ?? "All"} · {old.states.join("/") || "all regions"} · {old.tiers.map(tierLabel).join("/") || "all tiers"} · <strong>{pts(old.points)} points</strong> from {old.effectiveFrom}. The old value stays active until the day before the new effective date.</div>}
      <SelectInput label="Gift item" value={r.giftId} onChange={(x) => set({ giftId: x })} options={v.gs.items.map((i) => ({ value: i.id, label: `${i.id} · ${i.name}` }))} required />
      <SelectInput label="Programme" value={r.programme ?? ""} onChange={(x) => set({ programme: (x || null) as ProgrammeCode | null })} options={[{ value: "", label: "All the item's programmes" }, ...progOptions]} />
      <TextField label="Member type" value={r.memberType ?? ""} onChange={(x) => set({ memberType: x || null })} hint="Leave blank for every member type" />
      <MultiSelect label="Region (states)" options={stateOptions()} value={r.states} onChange={(x) => set({ states: x })} placeholder="All regions" />
      <MultiSelect label="Tier" options={tierOptions()} value={r.tiers} onChange={(x) => set({ tiers: x })} placeholder="All tiers" hint="Tiers from the Tier master" />
      <TextField label="Point cost" value={r.points ? String(r.points) : ""} onChange={(x) => set({ points: Number(x) || 0 })} inputMode="numeric" required />
      <TextField label="Effective from" type="date" value={r.effectiveFrom} onChange={(x) => set({ effectiveFrom: x })} required />
      <TextField label="Effective to" type="date" value={r.effectiveTo ?? ""} onChange={(x) => set({ effectiveTo: x || null })} hint="Optional" />
      <PolicyMessages result={result} />
    </Drawer>
  );
}

/* ======================= Create / edit wizard ======================= */

const STEPS = ["Basic information", "Gift details", "Point cost & availability", "Member segmentation", "Catalogue channels", "Preview & publish"];

export function GiftWizardPage() {
  const { giftId } = useParams();
  const v = useGiftsView();
  const nav = useNavigate();
  const existing = giftId ? v.gs.items.find((x) => x.id === giftId) : undefined;
  const base = useMemo<GiftItem>(() => {
    if (existing) return existing.draft ? ({ ...existing, ...existing.draft, draft: null } as GiftItem) : existing;
    return { id: "", code: "", name: "", type: "physical", categoryId: v.gs.categories.find((c) => c.status === "active")?.id ?? "", description: "", terms: "", partnerId: null, productSkuId: null, availability: "unknown", inventory: { reference: null, quantity: null, source: "not_supplied", syncedAt: null }, segmentation: { programmes: [], states: [], districts: [], branches: [], tiers: [] }, channels: { influencerApp: true, retailerApp: false, microsite: false }, status: "draft", version: 1, history: [], approvalRequestId: null, effectiveFrom: v.now.slice(0, 10), createdAt: "", updatedAt: "", updatedBy: v.uid, publishedAt: null, draft: null };
  }, [existing, v.gs.categories, v.now, v.uid]);
  const [i, setI] = useState<GiftItem>(base);
  const [step, setStep] = useState(0);
  const [max, setMax] = useState(0);
  const [reason, setReason] = useState("");
  const [costs, setCosts] = useState<{ programme: string; points: string }[]>([{ programme: "", points: "" }]);
  const { result, setResult, run } = useRun();
  const set = (p: Partial<GiftItem>) => setI({ ...i, ...p });
  const check = validateItem(v.gs, { ...i, id: i.id || "NEW" }, { skus: SEED_SKUS, tiers: [] });
  if (!v.can(existing ? "gift-catalogue:edit" : "gift-catalogue:create")) return <Notice tone="danger">You need Gift catalogue: {existing ? "Edit" : "Create"}.</Notice>;
  const partners = v.gs.partners.filter((p) => p.supportedTypes.includes(i.type));
  const go = (n: number) => {
    setStep(n);
    setMax(Math.max(max, n));
    setResult(null);
  };
  const save = (submit: boolean) => {
    const r = saveItem(v.uid, i, reason);
    if (!r.ok) return run(r, "");
    const id = r.id!;
    if (!existing) for (const c of costs.filter((x) => Number(x.points) > 0)) {
      const cr = saveInitialCost(v.uid, id, (c.programme || null) as ProgrammeCode | null, Number(c.points), i.effectiveFrom);
      if (!cr.ok) return run(cr, "");
    }
    if (submit) {
      const s = run(submitItem(v.uid, id), "Submitted for approval");
      if (s.ok) nav(`${GBASE}/catalogue/${id}`);
      return s;
    }
    run(r, existing ? "Draft change saved" : "Draft saved");
    nav(`${GBASE}/catalogue/${id}`);
    return r;
  };
  return (
    <>
      <SectionTitle title={existing ? `Edit ${existing.name}` : "New gift item"} description={existing?.status === "active" ? "The live version stays visible until this change is approved" : "Drafts are never visible to members"} actions={<Link to={existing ? `${GBASE}/catalogue/${existing.id}` : `${GBASE}/catalogue`} className="btn btn--ghost btn--sm"><ArrowLeft size={14} aria-hidden="true" />Cancel</Link>} />
      <Stepper steps={STEPS} current={step} onSelect={go} maxReached={max} />
      <Panel title={STEPS[step]}>
        {step === 0 && <div className="form-grid">
          <TextField label="Gift name" value={i.name} onChange={(x) => set({ name: x })} required />
          <TextField label="Gift code" value={i.code} onChange={(x) => set({ code: x })} hint="Platform convention: short unique code" />
          <SelectInput label="Gift type" value={i.type} onChange={(x) => set({ type: x as GiftType, partnerId: null })} options={Object.entries(GIFT_TYPE).map(([k, x]) => ({ value: k, label: x.label }))} required />
          <SelectInput label="Gift category" value={i.categoryId} onChange={(x) => set({ categoryId: x })} options={v.gs.categories.map((c) => ({ value: c.id, label: `${c.name}${c.status === "inactive" ? " (inactive)" : ""}`, disabled: c.status === "inactive" }))} required />
          <TextArea label="Description" value={i.description} onChange={(x) => set({ description: x })} />
          <TextArea label="Terms and conditions" value={i.terms} onChange={(x) => set({ terms: x })} />
        </div>}
        {step === 1 && <div className="form-grid">
          <SelectInput label={i.type === "voucher" ? "Voucher partner" : "Fulfilment partner"} value={i.partnerId ?? ""} onChange={(x) => set({ partnerId: x || null })} options={[{ value: "", label: "Choose" }, ...partners.map((p) => ({ value: p.id, label: `${p.name}${p.status === "inactive" ? " (inactive)" : ""}`, disabled: p.status === "inactive" }))]} required={i.type !== "vguard_com"} />
          {i.type === "voucher" && <>
            <TextField label="Denomination / value (₹)" value={i.voucher?.denomination != null ? String(i.voucher.denomination) : ""} onChange={(x) => set({ voucher: { productRef: i.voucher?.productRef ?? "", validityNote: i.voucher?.validityNote ?? "", denomination: x ? Number(x) : null } })} hint="Only where the partner provides it" inputMode="numeric" />
            <TextField label="Partner product / SKU reference" value={i.voucher?.productRef ?? ""} onChange={(x) => set({ voucher: { denomination: i.voucher?.denomination ?? null, validityNote: i.voucher?.validityNote ?? "", productRef: x } })} required />
            <TextField label="Voucher validity information" value={i.voucher?.validityNote ?? ""} onChange={(x) => set({ voucher: { denomination: i.voucher?.denomination ?? null, productRef: i.voucher?.productRef ?? "", validityNote: x } })} />
          </>}
          {i.type === "physical" && <>
            <TextField label="Gift image reference" value={i.physical?.imageRef ?? ""} onChange={(x) => set({ physical: { delivery: i.physical?.delivery ?? "", imageRef: x || null } })} hint="Media reference (no upload service in this build)" />
            <TextField label="Delivery configuration" value={i.physical?.delivery ?? ""} onChange={(x) => set({ physical: { imageRef: i.physical?.imageRef ?? null, delivery: x } })} />
          </>}
          {i.type === "vguard_com" && <>
            <TextField label="V-Guard catalogue reference" value={i.vguard?.catalogueRef ?? ""} onChange={(x) => set({ vguard: { arrangement: i.vguard?.arrangement ?? "", catalogueRef: x } })} required />
            <TextField label="Fulfilment arrangement" value={i.vguard?.arrangement ?? ""} onChange={(x) => set({ vguard: { catalogueRef: i.vguard?.catalogueRef ?? "", arrangement: x } })} />
          </>}
          <SelectInput label="Product / SKU mapping (Phase 4 master)" value={i.productSkuId ?? ""} onChange={(x) => set({ productSkuId: x || null })} options={[{ value: "", label: "None" }, ...SEED_SKUS.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}${s.status !== "active" ? ` (${s.status})` : ""}` }))]} />
          <p className="muted small">Commercial fields (MRP, purchase price, taxes, margin) are not part of the approved catalogue model and are not captured.</p>
        </div>}
        {step === 2 && <div className="form-grid">
          <SelectInput label="Availability" value={i.availability} onChange={(x) => set({ availability: x as GiftItem["availability"] })} options={Object.entries(AVAILABILITY).map(([k, x]) => ({ value: k, label: x.label }))} hint={i.inventory.source === "not_supplied" ? "No inventory data: choose Available only as an explicit operator decision" : undefined} />
          <TextField label="Stock / inventory reference" value={i.inventory.reference ?? ""} onChange={(x) => set({ inventory: { ...i.inventory, reference: x || null } })} hint="Quantity comes from the inventory service, never typed here" />
          <TextField label="Effective date" type="date" value={i.effectiveFrom} onChange={(x) => set({ effectiveFrom: x })} />
          {!existing ? (
            <div className="span-2">
              <p className="field__label">Point cost by segment</p>
              <p className="muted small">Add one cost per programme, or one for all programmes. Region and tier costs are added in the point cost matrix. No points-to-rupee conversion is applied.</p>
              {costs.map((c, k) => (
                <div key={k} className="form-row">
                  <SelectInput label="Programme" value={c.programme} onChange={(x) => setCosts(costs.map((y, j) => (j === k ? { ...y, programme: x } : y)))} options={[{ value: "", label: "All the item's programmes" }, ...progOptions]} />
                  <TextField label="Point cost" value={c.points} onChange={(x) => setCosts(costs.map((y, j) => (j === k ? { ...y, points: x } : y)))} inputMode="numeric" />
                </div>
              ))}
              <button type="button" className="btn btn--ghost btn--xs" onClick={() => setCosts([...costs, { programme: "", points: "" }])}><Plus size={12} aria-hidden="true" />Add segment cost</button>
            </div>
          ) : <p className="span-2 small">Approved costs are changed through the <Link to={`${GBASE}/costs?gift=${existing.id}`}>point cost matrix</Link> (old values are kept).</p>}
        </div>}
        {step === 3 && <div className="form-grid">
          <MultiSelect label="Programme / member type" options={progOptions} value={i.segmentation.programmes} onChange={(x) => set({ segmentation: { ...i.segmentation, programmes: x as ProgrammeCode[] } })} required />
          <MultiSelect label="States" options={stateOptions()} value={i.segmentation.states} onChange={(x) => set({ segmentation: { ...i.segmentation, states: x } })} placeholder="All states" />
          <MultiSelect label="Districts" options={districtOptions()} value={i.segmentation.districts} onChange={(x) => set({ segmentation: { ...i.segmentation, districts: x } })} placeholder="All districts" />
          <MultiSelect label="Branches" options={branchOptions()} value={i.segmentation.branches} onChange={(x) => set({ segmentation: { ...i.segmentation, branches: x } })} placeholder="All branches" />
          <MultiSelect label="Tiers (Tier master)" options={tierOptions()} value={i.segmentation.tiers} onChange={(x) => set({ segmentation: { ...i.segmentation, tiers: x } })} placeholder="All tiers" hint="Members whose tier the tier service cannot supply are not shown tier-restricted items" />
        </div>}
        {step === 4 && <div className="form-grid">
          <Checkbox label="Influencer app (EP, ST, CS)" checked={i.channels.influencerApp} onChange={(x) => set({ channels: { ...i.channels, influencerApp: x } })} />
          <Checkbox label="Retailer app / SDK" checked={i.channels.retailerApp} onChange={(x) => set({ channels: { ...i.channels, retailerApp: x } })} />
          <Checkbox label="Microsite (where enabled)" checked={i.channels.microsite} onChange={(x) => set({ channels: { ...i.channels, microsite: x } })} description="Not every item is offered on every channel" />
        </div>}
        {step === 5 && <>
          <CataloguePreview v={v} i={i} />
          <TextField label="Reason for this version" value={reason} onChange={setReason} hint="Shown to the Checker" />
          {!!check.errors.length && <ul className="check-list">{check.errors.map((e) => <li key={e} className="field__error">{e}</li>)}</ul>}
          {!!check.warnings.length && <ul className="check-list">{check.warnings.map((e) => <li key={e} className="muted small">{e}</li>)}</ul>}
        </>}
        <PolicyMessages result={result} />
        <div className="btn-row wizard-nav">
          {step > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(step - 1)}>Back</button>}
          {step < STEPS.length - 1 && <button type="button" className="btn btn--secondary btn--sm" onClick={() => go(step + 1)}>Next</button>}
          {step === STEPS.length - 1 && <>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => save(false)}><Save size={14} aria-hidden="true" />Save draft</button>
            {v.can("gift-catalogue:submit") && <button type="button" className="btn btn--primary btn--sm" onClick={() => save(true)}><Send size={14} aria-hidden="true" />Submit for approval</button>}
          </>}
        </div>
      </Panel>
    </>
  );
}

/* ======================= Categories ======================= */

export function CategoriesPage() {
  const v = useGiftsView();
  const { result, run } = useRun();
  const [edit, setEdit] = useState<{ id: string; name: string; description: string } | null>(null);
  const [reason, setReason] = useState("");
  return (
    <>
      <SectionTitle title="Gift categories" description="Catalogue classification only. Not the Product category master from Phase 4" actions={v.can("gift-catalogue:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit({ id: "", name: "", description: "" })}><Plus size={14} aria-hidden="true" />New category</button>} />
      <PolicyMessages result={result} />
      <Panel title="Categories" padded={false}>
        <DataTable rows={v.gs.categories} rowKey={(c) => c.id} caption="Gift categories" exportName={v.can("gift-catalogue:export") ? "gift-categories" : undefined} onRowClick={(c) => v.can("gift-catalogue:edit") && setEdit({ id: c.id, name: c.name, description: c.description })} columns={[
          { key: "id", header: "Category ID", value: (c) => c.id },
          { key: "n", header: "Category name", value: (c) => c.name },
          { key: "d", header: "Description", value: (c) => c.description },
          { key: "t", header: "Gift items", value: (c) => v.gs.items.filter((i) => i.categoryId === c.id).length, align: "right" },
          { key: "a", header: "Active items", value: (c) => v.gs.items.filter((i) => i.categoryId === c.id && i.status === "active").length, align: "right" },
          { key: "i", header: "Inactive items", value: (c) => v.gs.items.filter((i) => i.categoryId === c.id && i.status === "inactive").length, align: "right" },
          { key: "s", header: "Status", value: (c) => c.status, render: (c) => <StatusBadge tone={c.status === "active" ? "positive" : "neutral"}>{c.status}</StatusBadge> },
          { key: "u", header: "Last modified", value: (c) => c.updatedAt, render: (c) => <span className="small">{dt(c.updatedAt)}</span> },
          { key: "x", header: "", value: () => "", render: (c) => v.can("gift-catalogue:disable") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={(e) => { e.stopPropagation(); run(setCategoryStatus(v.uid, c.id, c.status === "active" ? "inactive" : "active", reason), c.status === "active" ? "Category deactivated" : "Category activated"); }}>{c.status === "active" ? "Deactivate" : "Activate"}</button> : null },
        ]} />
      </Panel>
      {v.can("gift-catalogue:disable") && <div className="form-inline"><TextField label="Reason for activation changes" value={reason} onChange={setReason} hint="Required. Deactivation is refused while active items depend on the category" /></div>}
      {edit && (
        <Drawer open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.id}` : "New gift category"} footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn btn--primary btn--sm" onClick={() => { if (run(saveCategory(v.uid, edit), "Category saved").ok) setEdit(null); }}>Save</button></div>}>
          <TextField label="Category name" value={edit.name} onChange={(x) => setEdit({ ...edit, name: x })} required />
          <TextArea label="Description" value={edit.description} onChange={(x) => setEdit({ ...edit, description: x })} />
          {edit.id && <p className="small muted">Items in this category: {v.gs.items.filter((i) => i.categoryId === edit.id).map((i) => i.code).join(", ") || "none"}</p>}
          <PolicyMessages result={result} />
        </Drawer>
      )}
    </>
  );
}
