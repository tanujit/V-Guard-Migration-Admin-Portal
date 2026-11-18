import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, MapPin, PackageCheck, Send, Truck } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { EXCEPTION_KIND, MILESTONES, ORDER_STATUS, SOW_TARGETS } from "@/config/giftsCatalogue";
import { findBranch } from "@/config/geography";
import { addExceptionRemark, changeOrderAddress, confirmAddress, markDeliveredManually, maskedAddress, placeOrder, trackingProviderFailure, trackingUpdate } from "@/features/gifts/store";
import { maskMobile, memberById } from "@/features/members/engine";
import type { GiftOrder } from "@/types/gifts";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid, stateOptions } from "@/pages/masters/shared";
import { BcrTag, DecisionRef, GBASE, OrderBadge, dt, giftLink, giftName, ledgerLink, memberLink, memberName, orderLink, partnerName, pts, redemptionLink, useGiftsView, useParam, useRun, type GiftsView } from "./shared";

const ageDays = (o: GiftOrder, now: string) => Math.max(0, Math.floor((Date.parse(`${now}:00Z`) - Date.parse(`${o.createdAt}:00Z`)) / 86400_000));
const confLabel: Record<GiftOrder["addressConfirmation"]["status"], string> = { pending: "Pending", confirmed: "Confirmed", change_requested: "Change requested", failed: "Verification failed", reconfirmation_required: "Reconfirmation required" };
const ConfBadge = ({ s }: { s: GiftOrder["addressConfirmation"]["status"] }) => <StatusBadge tone={s === "confirmed" ? "positive" : s === "failed" ? "negative" : "warning"}>{confLabel[s]}</StatusBadge>;

export function OrdersPage() {
  const v = useGiftsView();
  const nav = useNavigate();
  const [status, setStatus] = useParam("status");
  const [address, setAddress] = useParam("address");
  const [programme, setProgramme] = useParam("programme");
  const [partner, setPartner] = useParam("partner");
  const [state, setState] = useParam("state");
  const [ageing, setAgeing] = useParam("ageing");
  const visible = v.gs.orders.filter((o) => v.canOn("gift-orders", "view", o.memberId));
  const rows = visible.filter((o) => {
    const st = findBranch(o.branchCode)?.state.code;
    const age = ageDays(o, v.now);
    return (!status || (status === "pending" ? o.status === "awaiting_address" || o.status === "placed" : o.status === status)) && (!address || (address === "pending" ? o.addressConfirmation.status !== "confirmed" : o.addressConfirmation.status === "confirmed")) && (!programme || o.programme === programme) && (!partner || o.partnerId === partner) && (!state || st === state) && (!ageing || (ageing === "3" ? age > 3 : ageing === "7" ? age > 7 : age <= 3));
  });
  const count = (f: (o: GiftOrder) => boolean) => visible.filter(f).length;
  return (
    <>
      <SectionTitle title="Physical gift orders" description="Physical and V-Guard.com gifts after the member chooses them. Dispatch needs a confirmed delivery address; only the partner's confirmation marks an order delivered" />
      <Notice tone="warn">Address verification method and tracking partner: <BcrTag>Business Confirmation Required</BcrTag> (<DecisionRef id="OP-GIFT1" />). Configured method: <strong>{v.gs.config.addressMethod ?? "none"}</strong>. {SOW_TARGETS.physical}. Orders outside your programme and geography are not listed.</Notice>
      <KpiGrid cols={5} items={[
        { id: "t", label: "Total physical orders", value: visible.length, desc: "In your scope", icon: PackageCheck, variant: "primary", onSelect: () => setStatus("") },
        { id: "pa", label: "Pending address confirmation", value: count((o) => o.status === "awaiting_address"), desc: "Dispatch blocked", icon: MapPin, variant: "status", tone: "warning", onSelect: () => setStatus("awaiting_address") },
        { id: "ac", label: "Address confirmed", value: count((o) => o.addressConfirmation.status === "confirmed"), desc: "Simulated in this build", icon: CheckCircle2, variant: "light", onSelect: () => setAddress("confirmed") },
        { id: "pl", label: "Order placed", value: count((o) => o.status === "placed"), desc: "With the partner", icon: Send, variant: "light", onSelect: () => setStatus("placed") },
        { id: "ds", label: "Dispatched", value: count((o) => o.status === "dispatched"), desc: "Shipment created", icon: Truck, variant: "light", onSelect: () => setStatus("dispatched") },
        { id: "of", label: "Out for delivery", value: count((o) => o.status === "out_for_delivery"), desc: "Last mile", icon: Truck, variant: "light", onSelect: () => setStatus("out_for_delivery") },
        { id: "dl", label: "Delivered", value: count((o) => o.status === "delivered"), desc: "Partner-confirmed", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setStatus("delivered") },
        { id: "df", label: "Delivery failed", value: count((o) => o.exceptions.some((e) => e.kind === "failed_delivery" || e.kind === "returned")), desc: "Reported by partner", icon: AlertTriangle, variant: "status", tone: "negative", onSelect: () => nav(`${GBASE}/tracking?kind=failed_delivery`) },
        { id: "ex", label: "Delivery exceptions", value: count((o) => o.exceptions.some((e) => e.open)), desc: "Open exceptions", icon: AlertTriangle, variant: "light", onSelect: () => nav(`${GBASE}/tracking`) },
        { id: "pu", label: "Pending partner updates", value: count((o) => o.exceptions.some((e) => e.open && (e.kind === "partner_update_missing" || e.kind === "tracking_unavailable"))), desc: "No recent tracking", icon: AlertTriangle, variant: "light", onSelect: () => nav(`${GBASE}/tracking?kind=partner_update_missing`) },
      ]} />
      <div className="filters-bar">
        <SelectField label="Delivery status" value={status} onChange={setStatus} active={!!status} options={[{ value: "", label: "All statuses" }, { value: "pending", label: "Pending (address or dispatch)" }, ...Object.entries(ORDER_STATUS).map(([k, x]) => ({ value: k, label: x }))]} />
        <SelectField label="Address status" value={address} onChange={setAddress} active={!!address} options={[{ value: "", label: "Any" }, { value: "pending", label: "Not confirmed" }, { value: "confirmed", label: "Confirmed" }]} />
        <SelectField label="Programme" value={programme} onChange={setProgramme} active={!!programme} options={[{ value: "", label: "All programmes" }, ...["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))]} />
        <SelectField label="Partner" value={partner} onChange={setPartner} active={!!partner} options={[{ value: "", label: "All partners" }, ...v.gs.partners.filter((p) => p.type !== "voucher").map((p) => ({ value: p.id, label: p.name }))]} />
        <SelectField label="State" value={state} onChange={setState} active={!!state} options={[{ value: "", label: "All states" }, ...stateOptions()]} />
        <SelectField label="Delivery ageing" value={ageing} onChange={setAgeing} active={!!ageing} options={[{ value: "", label: "Any age" }, { value: "0", label: "Up to 3 days" }, { value: "3", label: "Over 3 days" }, { value: "7", label: "Over 7 days" }]} />
        {[status, address, programme, partner, state, ageing].some(Boolean) && <button type="button" className="btn btn--ghost btn--sm" onClick={() => [setStatus, setAddress, setProgramme, setPartner, setState, setAgeing].forEach((f) => f(""))}>Clear all</button>}
      </div>
      <Panel title={`${rows.length} order(s)`} padded={false}>
        <DataTable rows={rows} rowKey={(o) => o.id} caption="Physical gift orders" onRowClick={(o) => nav(`${GBASE}/orders/${o.id}`)} rowActionLabel={(o) => `View order ${o.id}`} exportName={v.can("gift-orders:export") ? "gift-orders" : undefined} pageSize={15} initialSort={{ key: "d", dir: "desc" }} columns={[
          { key: "id", header: "Order ID", value: (o) => o.id, render: (o) => orderLink(o.id) },
          { key: "m", header: "Member ID", value: (o) => o.memberId, render: (o) => memberLink(o.memberId) },
          { key: "mn", header: "Member name", value: (o) => memberName(v.mem, o.memberId) },
          { key: "p", header: "Programme", value: (o) => o.programme },
          { key: "g", header: "Gift item", value: (o) => giftName(v.gs, o.giftId) },
          { key: "sku", header: "Product / SKU", value: (o) => o.productSkuId ?? "", render: (o) => <span className="mono small">{o.productSkuId ?? "—"}</span> },
          { key: "pts", header: "Points cost", value: (o) => o.points, render: (o) => <span className="num">{o.foc ? "FOC" : pts(o.points)}</span>, align: "right" },
          { key: "d", header: "Order date", value: (o) => o.createdAt, render: (o) => <span className="small">{dt(o.createdAt)}</span> },
          { key: "a", header: "Address status", value: (o) => o.addressConfirmation.status, render: (o) => <ConfBadge s={o.addressConfirmation.status} /> },
          { key: "fp", header: "Fulfilment partner", value: (o) => partnerName(v.gs, o.partnerId) },
          { key: "sr", header: "Shipment reference", value: (o) => o.shipmentRef ?? "", render: (o) => <span className="mono small">{o.shipmentRef ?? "—"}</span> },
          { key: "s", header: "Delivery status", value: (o) => o.status, render: (o) => <OrderBadge s={o.status} /> },
          { key: "u", header: "Last updated", value: (o) => o.updatedAt, render: (o) => <span className="small">{dt(o.updatedAt)}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Order detail ======================= */

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const v = useGiftsView();
  const { result, run } = useRun();
  const o = v.gs.orders.find((x) => x.id === orderId);
  if (!o) return <Notice tone="danger">Order {orderId} not found. <Link to={`${GBASE}/orders`}>Back to orders</Link></Notice>;
  if (!v.canOn("gift-orders", "view", o.memberId)) return <Notice tone="danger">This order is outside your programme or geographical scope.</Notice>;
  const m = memberById(v.mem, o.memberId);
  const a = maskedAddress(v.uid, o);
  const manage = v.canOn("gift-orders", "manage", o.memberId);
  const accepted = o.tracking.filter((t) => t.accepted && t.milestone);
  return (
    <>
      <div className="wallet-head">
        <div>
          <Link to={`${GBASE}/orders`} className="btn btn--ghost btn--sm"><ArrowLeft size={14} aria-hidden="true" />Orders</Link>
          <h2 className="wallet-head__title">Order {o.id} <OrderBadge s={o.status} /></h2>
          <p className="muted small">{giftName(v.gs, o.giftId)} · {o.origin === "phase7_redemption" ? "Member-app redemption" : "Backend gift redemption"} {redemptionLink(o.redemptionRef)} · created {dt(o.createdAt)}</p>
        </div>
      </div>
      <PolicyMessages result={result} />
      <div className="grid-3">
        <Panel title="A · Member">
          <dl className="dl-grid">
            <dt>Member ID</dt><dd>{memberLink(o.memberId)}</dd>
            <dt>Member name</dt><dd>{m?.name ?? "—"}</dd>
            <dt>Programme</dt><dd>{o.programme}</dd>
            <dt>Mobile</dt><dd>{m ? maskMobile(m.mobile) : "—"}</dd>
            <dt>Member status</dt><dd>{m?.status.replace(/_/g, " ") ?? "—"}</dd>
          </dl>
        </Panel>
        <Panel title="B · Gift">
          <dl className="dl-grid">
            <dt>Gift</dt><dd>{giftLink(o.giftId)} {giftName(v.gs, o.giftId)}</dd>
            <dt>Product / SKU</dt><dd className="mono small">{o.productSkuId ?? "—"}</dd>
            <dt>Quantity</dt><dd>{o.quantity}</dd>
            <dt>Point cost</dt><dd>{o.foc ? "Free of cost (no points deducted)" : `${pts(o.points)} points`}</dd>
            <dt>Redemption</dt><dd>{redemptionLink(o.redemptionRef)} · ledger {ledgerLink(o.ledgerRef)}</dd>
            {o.refundRef && <><dt>Refund</dt><dd className="mono small">{o.refundRef} (wallet adjustment)</dd></>}
          </dl>
        </Panel>
        <Panel title="C · Delivery address" subtitle="Gift delivery address from Member Management (not the Aadhaar home address or working location)">
          <dl className="dl-grid">
            <dt>Recipient</dt><dd>{a.recipient || "—"}</dd>
            <dt>Address</dt><dd>{a.line || <span className="field__error">No gift delivery address</span>}</dd>
            <dt>District / state</dt><dd>{a.district || "—"} · {a.state || "—"}</dd>
            <dt>Pincode</dt><dd>{a.pincode || "—"}</dd>
            <dt>Contact</dt><dd>{a.contactMasked}</dd>
            <dt>Source</dt><dd>{a.source}</dd>
            <dt>Snapshot</dt><dd>Version {o.address.version} · captured {dt(o.address.capturedAt)}</dd>
          </dl>
          {o.addressHistory.length > 0 && <details className="review-card"><summary>Earlier address versions ({o.addressHistory.length}, kept on the order)</summary><ul className="check-list">{o.addressHistory.map((h) => <li key={h.version} className="small">v{h.version} · {maskedAddress(v.uid, { ...o, address: h }).line} · {h.district} · {h.state} · captured {dt(h.capturedAt)}</li>)}</ul>{o.addressChanges.map((c) => <p key={c.version} className="small muted">{dt(c.at)} → v{c.version}: {c.detail}</p>)}</details>}
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="D · Address confirmation" subtitle={<>Verification method: <BcrTag>Business Confirmation Required</BcrTag></>}>
          <dl className="dl-grid">
            <dt>Status</dt><dd><ConfBadge s={o.addressConfirmation.status} /></dd>
            <dt>Method</dt><dd>{o.addressConfirmation.method ?? "Not configured (OP-GIFT1)"}</dd>
            <dt>Reference</dt><dd className="mono small">{o.addressConfirmation.reference ?? "—"}</dd>
            <dt>Timestamp</dt><dd>{dt(o.addressConfirmation.at)}</dd>
          </dl>
          {o.addressConfirmation.simulated && <p className="small muted">Simulated confirmation: no real verification occurred in this development build.</p>}
          {manage && o.status === "awaiting_address" && <ConfirmAddress v={v} o={o} run={run} />}
          {manage && ["awaiting_address", "placed"].includes(o.status) && <ChangeAddress v={v} o={o} run={run} />}
        </Panel>
        <Panel title="E · Order and shipment">
          <dl className="dl-grid">
            <dt>Order reference</dt><dd className="mono small">{o.id}</dd>
            <dt>Fulfilment partner</dt><dd>{partnerName(v.gs, o.partnerId)}</dd>
            <dt>Partner order reference</dt><dd className="mono small">{o.partnerOrderRef ?? "—"}</dd>
            <dt>Shipment reference</dt><dd className="mono small">{o.shipmentRef ?? "—"}</dd>
            <dt>Dispatch date</dt><dd>{dt(o.tracking.find((t) => t.milestone === "dispatched" && t.accepted)?.at)}</dd>
            <dt>Last partner update</dt><dd>{dt(o.tracking.filter((t) => t.source === "partner_adapter").slice(-1)[0]?.at)}</dd>
          </dl>
          <div className="btn-row">
            {manage && o.status === "awaiting_address" && <button type="button" className="btn btn--primary btn--sm" onClick={() => run(placeOrder(v.uid, o.id), "Order placed with the mock partner")}><Send size={14} aria-hidden="true" />Place order with partner</button>}
            {manage && o.status !== "delivered" && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(markDeliveredManually(v.uid, o.id), "")}>Mark delivered</button>}
          </div>
        </Panel>
      </div>
      <Panel title="Delivery timeline" subtitle="Placed → Dispatched → Out for Delivery → Delivered. Only partner events are shown; none are fabricated">
        <ol className="gift-timeline">
          {MILESTONES.map((ms) => {
            const ev = accepted.find((t) => t.milestone === ms.id);
            return (
              <li key={ms.id} className={`gift-timeline__step ${ev ? "is-done" : ""}`}>
                <strong>{ms.label}</strong>
                {ev ? <span className="small">{dt(ev.at)} · {ev.source === "partner_adapter" ? "Partner adapter (mock)" : "Order service"} · <span className="mono">{ev.partnerRef ?? "—"}</span>{ev.remarks && ` · ${ev.remarks}`}</span> : <span className="small muted">No event</span>}
              </li>
            );
          })}
        </ol>
        {o.tracking.some((t) => !t.accepted || t.duplicate || !t.milestone) && (
          <details className="review-card"><summary>All partner events ({o.tracking.length})</summary>
            <ul className="check-list">{o.tracking.map((t) => <li key={t.id} className="small"><span className="mono">{t.id}</span> · {t.partnerStatus} · {dt(t.at)} · {t.duplicate ? "duplicate, ignored" : t.accepted ? "applied" : "not applied"}{t.remarks ? ` · ${t.remarks}` : ""}</li>)}</ul>
          </details>
        )}
      </Panel>
      <div className="grid-2">
        <Panel title="Delivery exceptions" subtitle="The partner's reported status is never changed here">
          {o.exceptions.length ? <ExceptionList v={v} o={o} manage={manage} run={run} /> : <p className="muted small">No exceptions</p>}
        </Panel>
        {v.can("gift-orders:manage") && <PartnerSimulator v={v} o={o} run={run} />}
      </div>
    </>
  );
}

type Run = ReturnType<typeof useRun>["run"];
function ConfirmAddress({ v, o, run }: { v: GiftsView; o: GiftOrder; run: Run }) {
  const [ref, setRef] = useState("");
  const [outcome, setOutcome] = useState<"confirmed" | "failed" | "change_requested">("confirmed");
  if (!v.gs.config.addressMethod) return <Notice tone="warn">No verification method is configured. Record one under <Link to={`${GBASE}/settings`}>Decisions & settings</Link> (OTP is not assumed).</Notice>;
  return (
    <div className="form-inline">
      <SelectInput label="Verification outcome (simulated)" value={outcome} onChange={(x) => setOutcome(x as "confirmed")} options={[{ value: "confirmed", label: "Confirmed" }, { value: "failed", label: "Verification failed" }, { value: "change_requested", label: "Address change requested" }]} />
      <TextField label="Verification reference" value={ref} onChange={setRef} />
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(confirmAddress(v.uid, o.id, outcome, ref), "Verification outcome recorded")}>Record outcome</button>
    </div>
  );
}

function ChangeAddress({ v, o, run }: { v: GiftsView; o: GiftOrder; run: Run }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ line: "", district: "", state: "", pincode: "", reason: "" });
  if (!open) return <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>Record address change</button>;
  return (
    <div className="form-inline">
      <TextArea label="New address line" value={f.line} onChange={(x) => setF({ ...f, line: x })} />
      <TextField label="District" value={f.district} onChange={(x) => setF({ ...f, district: x })} />
      <TextField label="State" value={f.state} onChange={(x) => setF({ ...f, state: x })} />
      <TextField label="Pincode" value={f.pincode} onChange={(x) => setF({ ...f, pincode: x })} inputMode="numeric" />
      <TextField label="Reason" value={f.reason} onChange={(x) => setF({ ...f, reason: x })} />
      <div className="btn-row"><button type="button" className="btn btn--secondary btn--sm" onClick={() => { if (run(changeOrderAddress(v.uid, o.id, f, f.reason), "Address version recorded").ok) setOpen(false); }}>Save new version</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}

function ExceptionList({ v, o, manage, run }: { v: GiftsView; o: GiftOrder; manage: boolean; run: Run }) {
  const [text, setText] = useState("");
  return (
    <ul className="check-list">
      {o.exceptions.map((e) => (
        <li key={e.id} className="review-card">
          <strong>{EXCEPTION_KIND[e.kind]}</strong> <StatusBadge tone={e.open ? "negative" : "neutral"}>{e.open ? "Open" : "Closed"}</StatusBadge> <span className="small muted">{dt(e.at)} · {e.id}</span>
          <p className="small">{e.detail}</p>
          {e.issueRef && <p className="small">Linked fulfilment issue <span className="mono">{e.issueRef}</span></p>}
          {e.remarks.map((r, k) => <p key={k} className="small muted">{r}</p>)}
          {manage && e.open && <div className="btn-row"><TextField label="Remark" value={text} onChange={setText} /><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(addExceptionRemark(v.uid, o.id, e.id, text), "Remark added")}>Add remark</button><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(addExceptionRemark(v.uid, o.id, e.id, text || "Linked fulfilment issue raised", true), "Fulfilment issue raised")}>Raise linked issue</button></div>}
        </li>
      ))}
    </ul>
  );
}

/** Development control standing in for the partner's tracking webhook. */
function PartnerSimulator({ v, o, run }: { v: GiftsView; o: GiftOrder; run: Run }) {
  const [status, setStatus] = useState("dispatched");
  const [eventId, setEventId] = useState(`PTE-${o.id.split("-")[1]}-1`);
  return (
    <Panel title="Mock partner tracking events" subtitle="Development control: stands in for the partner's webhook (tracking contract: placed, dispatched, out_for_delivery, delivered)">
      <TextField label="Partner event ID" value={eventId} onChange={setEventId} hint="Send the same ID twice to see duplicate handling" />
      <SelectInput label="Partner status" value={status} onChange={setStatus} options={[...MILESTONES.map((m) => ({ value: m.id, label: m.label })), { value: "Returned to origin (mock partner text)", label: "Returned (unmapped partner text)" }, { value: "Delivery failed: customer unavailable (mock)", label: "Delivery failed (unmapped partner text)" }]} />
      <div className="btn-row">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const r = run(trackingUpdate(o.id, eventId, status, v.now, o.shipmentRef ?? `MOCK-SHP-${o.id.split("-")[1]}`, "Mock partner event"), "Partner event received"); if (r.ok && !r.warnings.length) setEventId(`PTE-${o.id.split("-")[1]}-${o.tracking.length + 2}`); }}><Truck size={14} aria-hidden="true" />Send partner event</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(trackingProviderFailure(o.id), "Tracking failure recorded")}>Simulate tracking provider failure</button>
      </div>
    </Panel>
  );
}

/* ======================= Delivery tracking queue ======================= */

export function DeliveryTrackingPage() {
  const v = useGiftsView();
  const nav = useNavigate();
  const [kind, setKind] = useParam("kind");
  const [open, setOpen] = useParam("open", "open");
  const rows = v.gs.orders.filter((o) => v.canOn("gift-orders", "view", o.memberId)).flatMap((o) => o.exceptions.map((e) => ({ o, e }))).filter(({ e }) => (!kind || e.kind === kind) && (open === "all" || e.open === (open === "open")));
  return (
    <>
      <SectionTitle title="Delivery tracking and exceptions" description="Operational queue for address issues, failed deliveries, missing partner updates, undispatched orders, tracking outages and returns. Resolution policies are not invented: add remarks or raise a linked fulfilment issue" />
      <Notice tone="info">{SOW_TARGETS.physical}. Partner statuses outside the tracking contract are kept exactly as reported. N09 dispatch and delivery notifications go through the Communication Centre only after an authoritative partner event.</Notice>
      <div className="filters-bar">
        <SelectField label="Exception" value={kind} onChange={setKind} active={!!kind} options={[{ value: "", label: "All exceptions" }, ...Object.entries(EXCEPTION_KIND).map(([k, x]) => ({ value: k, label: x }))]} />
        <SelectField label="State" value={open} onChange={setOpen} active={open !== "open"} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
      </div>
      <Panel title={`${rows.length} exception(s)`} padded={false}>
        <DataTable rows={rows} rowKey={(x) => `${x.o.id}-${x.e.id}`} caption="Delivery exceptions" onRowClick={(x) => nav(`${GBASE}/orders/${x.o.id}`)} exportName={v.can("gift-orders:export") ? "delivery-exceptions" : undefined} columns={[
          { key: "o", header: "Order", value: (x) => x.o.id, render: (x) => orderLink(x.o.id) },
          { key: "k", header: "Exception", value: (x) => EXCEPTION_KIND[x.e.kind] },
          { key: "d", header: "Detail", value: (x) => x.e.detail, render: (x) => <span className="small">{x.e.detail}</span> },
          { key: "m", header: "Member", value: (x) => x.o.memberId, render: (x) => memberLink(x.o.memberId) },
          { key: "g", header: "Gift", value: (x) => giftName(v.gs, x.o.giftId) },
          { key: "p", header: "Partner", value: (x) => partnerName(v.gs, x.o.partnerId) },
          { key: "s", header: "Order status", value: (x) => x.o.status, render: (x) => <OrderBadge s={x.o.status} /> },
          { key: "at", header: "Raised", value: (x) => x.e.at, render: (x) => <span className="small">{dt(x.e.at)}</span> },
          { key: "i", header: "Linked issue", value: (x) => x.e.issueRef ?? "", render: (x) => <span className="mono small">{x.e.issueRef ?? "—"}</span> },
          { key: "st", header: "State", value: (x) => (x.e.open ? "open" : "closed"), render: (x) => <StatusBadge tone={x.e.open ? "negative" : "neutral"}>{x.e.open ? "Open" : "Closed"}</StatusBadge> },
        ]} />
      </Panel>
    </>
  );
}
