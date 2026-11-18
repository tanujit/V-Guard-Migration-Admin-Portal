import { useState } from "react";
import { Download } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, TextArea, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { cardStatus, voucherStatusAt } from "@/features/gifts/engine";
import { recordGiftExport, setAddressMethod, setDevTier, setInsuranceSettings, setRenderFormats, setWatermark, updateGiftDecision, voucherDelivery } from "@/features/gifts/store";
import type { GiftDecision, RenderConfig } from "@/types/gifts";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, approvalLink, dt, giftName, memberName, partnerName, pts, tierOptions, useGiftsView, useParam, useRun, userName, type GiftsView } from "./shared";

/* ======================= Bulk import history ======================= */

export function ImportHistoryPage() {
  const v = useGiftsView();
  const rows = [
    ...v.gs.batches.map((b) => ({ id: b.id, kind: "Insurance cards", file: b.fileName, by: b.uploadedBy, at: b.uploadedAt, total: b.rows.length, ok: b.rows.filter((r) => r.result === "valid" || r.result === "imported").length, bad: b.rows.filter((r) => ["invalid", "duplicate", "failed", "rejected"].includes(r.result)).length, status: b.status, apr: b.approvalRequestId })),
    ...v.gs.giftBatches.map((b) => ({ id: b.id, kind: "Backend gifts", file: b.fileName, by: b.createdBy, at: b.createdAt, total: b.rows.length, ok: b.rows.filter((r) => r.result === "valid").length, bad: b.rows.filter((r) => r.result !== "valid").length, status: "submitted row by row", apr: null })),
  ];
  return (
    <>
      <SectionTitle title="Bulk import history" description="Insurance card uploads and backend gift batches with row outcomes. Successful and failed records are both kept" />
      <Panel title={`${rows.length} batch(es)`} padded={false}>
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Bulk imports" initialSort={{ key: "at", dir: "desc" }} columns={[
          { key: "id", header: "Batch", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "k", header: "Type", value: (r) => r.kind },
          { key: "f", header: "File", value: (r) => r.file },
          { key: "by", header: "Uploaded by", value: (r) => userName(v.acc, r.by) },
          { key: "at", header: "Uploaded", value: (r) => r.at, render: (r) => <span className="small">{dt(r.at)}</span> },
          { key: "t", header: "Records", value: (r) => r.total, align: "right" },
          { key: "ok", header: "Valid / imported", value: (r) => r.ok, align: "right" },
          { key: "bad", header: "Invalid / failed", value: (r) => r.bad, align: "right" },
          { key: "s", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "completed" ? "positive" : r.status === "failed" || r.status === "rejected" ? "negative" : "warning"}>{r.status.replace("_", " ")}</StatusBadge> },
          { key: "a", header: "Approval", value: (r) => r.apr ?? "", render: (r) => approvalLink(r.apr) },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Reports ======================= */

export function ReportsPage() {
  const v = useGiftsView();
  const { result, run } = useRun();
  const exp = <T,>(module: string, name: string, rows: T[], cols: { header: string; value: (r: T) => string | number | null }[]) => {
    if (run(recordGiftExport(v.uid, module, name, rows.length), "Export recorded in the audit trail").ok) downloadCsv(`${name}.csv`, cols, rows, "Development / demo data");
  };
  const orders = v.gs.orders.filter((o) => v.canOn("gift-orders", "view", o.memberId));
  const reports = [
    { id: "cat", name: "Gift catalogue", module: "gift-catalogue", rows: v.gs.items.length, run: () => exp("gift-catalogue", "gift-catalogue-report", v.gs.items, [{ header: "Gift ID", value: (i) => i.id }, { header: "Name", value: (i) => i.name }, { header: "Type", value: (i) => i.type }, { header: "Programmes", value: (i) => i.segmentation.programmes.join("/") }, { header: "Availability", value: (i) => i.availability }, { header: "Status", value: (i) => i.status }, { header: "Version", value: (i) => i.version }]) },
    { id: "cost", name: "Segment point costs", module: "gift-catalogue", rows: v.gs.costs.length, run: () => exp("gift-catalogue", "gift-point-costs", v.gs.costs, [{ header: "Rule", value: (r) => r.id }, { header: "Gift", value: (r) => r.giftId }, { header: "Programme", value: (r) => r.programme ?? "All" }, { header: "Region", value: (r) => r.states.join("/") || "All" }, { header: "Tier", value: (r) => r.tiers.join("/") || "All" }, { header: "Points", value: (r) => r.points }, { header: "From", value: (r) => r.effectiveFrom }, { header: "To", value: (r) => r.effectiveTo ?? "" }, { header: "Status", value: (r) => r.status }]) },
    { id: "vch", name: "Voucher issuance and delivery (codes excluded)", module: "vouchers", rows: v.gs.vouchers.length, run: () => exp("vouchers", "voucher-report", v.gs.vouchers, [{ header: "Voucher", value: (x) => x.id }, { header: "Partner", value: (x) => partnerName(v.gs, x.partnerId) }, { header: "Value", value: (x) => x.value }, { header: "Member", value: (x) => x.memberId ?? "" }, { header: "Status", value: (x) => voucherStatusAt(x, v.now) }, { header: "Issued", value: (x) => x.issuedAt ?? "" }, { header: "Expiry", value: (x) => x.expiresOn ?? "" }, { header: "WhatsApp delivery", value: (x) => voucherDelivery(x).whatsapp }, { header: "In-app delivery", value: (x) => voucherDelivery(x).inapp }]) },
    { id: "ord", name: "Physical orders and delivery (address masked)", module: "gift-orders", rows: orders.length, run: () => exp("gift-orders", "gift-orders-report", orders, [{ header: "Order", value: (o) => o.id }, { header: "Member", value: (o) => o.memberId }, { header: "Programme", value: (o) => o.programme }, { header: "Gift", value: (o) => giftName(v.gs, o.giftId) }, { header: "Points", value: (o) => o.points }, { header: "Redemption", value: (o) => o.redemptionRef }, { header: "Ledger", value: (o) => o.ledgerRef ?? "" }, { header: "Partner", value: (o) => partnerName(v.gs, o.partnerId) }, { header: "Address status", value: (o) => o.addressConfirmation.status }, { header: "Delivery status", value: (o) => o.status }, { header: "Created", value: (o) => o.createdAt }]) },
    { id: "ins", name: "Insurance cards (numbers masked)", module: "insurance", rows: v.gs.cards.length, run: () => exp("insurance", "insurance-cards-report", v.gs.cards, [{ header: "Card", value: (c) => c.id }, { header: "Member", value: (c) => c.memberId }, { header: "Programme", value: (c) => c.programme }, { header: "Insurer", value: (c) => c.insurer }, { header: "Amount", value: (c) => c.amount }, { header: "Valid from", value: (c) => c.validFrom }, { header: "Valid to", value: (c) => c.validTo }, { header: "Status", value: (c) => cardStatus(c, v.now) }, { header: "Publication", value: (c) => c.publication.status }]) },
  ];
  return (
    <>
      <SectionTitle title="Fulfilment reports" description="Exports carry a demo-data banner, never include voucher codes, full addresses or insurance numbers, and are recorded in the audit trail" />
      <PolicyMessages result={result} />
      <Panel title="Reports" padded={false}>
        <table className="table">
          <thead><tr><th>Report</th><th>Rows</th><th>Permission</th><th /></tr></thead>
          <tbody>{reports.map((r) => <tr key={r.id}><td>{r.name}</td><td className="num">{r.rows}</td><td className="mono small">{r.module}:export</td><td>{v.can(`${r.module}:export`) ? <button type="button" className="btn btn--secondary btn--xs" onClick={r.run}><Download size={12} aria-hidden="true" />Export CSV</button> : <span className="muted small">Not permitted</span>}</td></tr>)}</tbody>
        </table>
      </Panel>
      <div className="grid-3">
        <Panel title="Orders by partner"><ul className="bucket-list">{v.gs.partners.filter((p) => p.type !== "voucher").map((p) => <li key={p.id}><span>{p.name}</span><strong>{orders.filter((o) => o.partnerId === p.id).length}</strong></li>)}</ul></Panel>
        <Panel title="Points redeemed through gifts"><ul className="bucket-list"><li><span>Physical / V-Guard.com orders</span><strong>{pts(orders.reduce((n, o) => n + o.points, 0))}</strong></li><li><span>FOC orders (no points)</span><strong>{orders.filter((o) => o.foc).length}</strong></li><li><span>Fulfilment issues</span><strong>{v.gs.issues.length}</strong></li></ul></Panel>
        <Panel title="Insurance uploads"><ul className="bucket-list">{v.gs.batches.map((b) => <li key={b.id}><span>{b.id} · {b.status.replace("_", " ")}</span><strong>{b.rows.length}</strong></li>)}</ul></Panel>
      </div>
    </>
  );
}

/* ======================= Audit ======================= */

export function GiftAuditPage() {
  const v = useGiftsView();
  const [entity, setEntity] = useParam("entity");
  const [kind, setKind] = useParam("kind");
  const rows = [...v.gs.audit].reverse().filter((e) => (!entity || e.entityId === entity) && (!kind || e.entity === kind));
  const kinds = [...new Set(v.gs.audit.map((e) => e.entity))].sort();
  return (
    <>
      <SectionTitle title="Gift & insurance audit history" description="Append-only: catalogue, voucher, fulfilment and insurance events with actor, old and new value, reason, approval and partner references. Ordinary users cannot edit or delete events" />
      <div className="filters-bar">
        <SelectField label="Entity type" value={kind} onChange={setKind} active={!!kind} options={[{ value: "", label: "All entity types" }, ...kinds.map((k) => ({ value: k, label: k.replace(/_/g, " ") }))]} />
        <TextField label="Entity ID" value={entity} onChange={setEntity} />
      </div>
      <Panel title={`${rows.length} event(s)`} padded={false}>
        <DataTable rows={rows} rowKey={(e) => e.id} caption="Gift and insurance audit" exportName={v.can("audit:export") ? "gift-audit" : undefined} pageSize={20} columns={[
          { key: "id", header: "Audit ID", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
          { key: "at", header: "Timestamp", value: (e) => e.at, render: (e) => <span className="small">{dt(e.at)}</span> },
          { key: "a", header: "Actor", value: (e) => (e.actor === "PARTNER" ? "Partner adapter" : userName(v.acc, e.actor)) },
          { key: "t", header: "Entity type", value: (e) => e.entity.replace(/_/g, " ") },
          { key: "eid", header: "Entity ID", value: (e) => e.entityId, render: (e) => <span className="mono small">{e.entityId}</span> },
          { key: "act", header: "Action", value: (e) => e.action.replace(/_/g, " ") },
          { key: "b", header: "Old value", value: (e) => e.before ?? "", render: (e) => <span className="small">{e.before ?? "—"}</span> },
          { key: "af", header: "New value", value: (e) => e.after ?? "", render: (e) => <span className="small">{e.after ?? "—"}</span> },
          { key: "r", header: "Reason / remarks", value: (e) => e.reason, render: (e) => <span className="small">{e.reason}</span> },
          { key: "apr", header: "Approval", value: (e) => e.approvalRequestId ?? "", render: (e) => approvalLink(e.approvalRequestId) },
          { key: "p", header: "Partner reference", value: (e) => e.partnerRef ?? "", render: (e) => <span className="mono small">{e.partnerRef ?? "—"}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Decisions and settings ======================= */

export function GiftSettingsPage() {
  const v = useGiftsView();
  const { result, run } = useRun();
  return (
    <>
      <SectionTitle title="Open decisions and development settings" description="Configuration exists for every open point; the production rule stays Business Confirmation Required until V-Guard confirms it. Items stay listed even after their screens are built" />
      <PolicyMessages result={result} />
      <Panel title="Open business decision register" padded={false}>
        <table className="table">
          <thead><tr><th>Reference</th><th>Open decision</th><th>Affected module</th><th>Business owner</th><th>Status</th><th>Implementation restriction</th><th>Confirmation notes</th></tr></thead>
          <tbody>{v.gs.decisions.map((d) => <DecisionRow key={d.id} v={v} d={d} run={run} />)}</tbody>
        </table>
      </Panel>
      <div className="grid-2">
        <AddressSettings v={v} run={run} />
        <RenderSettings v={v} run={run} />
      </div>
      <div className="grid-2">
        <Panel title="Insurance upload settings" subtitle="Development settings (GD-03, OP-INS1); apply to new uploads">
          <SelectInput label="Insurance number uniqueness" value={v.gs.config.insuranceNumberRule} onChange={(x) => run(setInsuranceSettings(v.uid, { insuranceNumberRule: x as "unique_per_insurer" }), "Setting recorded")} options={[{ value: "unique_per_insurer", label: "Unique per insurer" }, { value: "unique_global", label: "Unique across insurers" }]} />
          <SelectInput label="Upload processing policy" value={v.gs.config.insurancePolicy} onChange={(x) => run(setInsuranceSettings(v.uid, { insurancePolicy: x as "atomic" }), "Setting recorded")} options={[{ value: "atomic", label: "Atomic: all rows or none" }, { value: "row_level", label: "Row level: valid rows only" }]} />
          <p className="small muted">Catalogue publication and point-cost changes {v.gs.config.catalogueApproval ? "go through the Approval Engine (WF-030)" : "are published directly by users with Gift catalogue: Publish"}.</p>
        </Panel>
        <TierSettings v={v} run={run} />
      </div>
    </>
  );
}

type Run = ReturnType<typeof useRun>["run"];
function DecisionRow({ v, d, run }: { v: GiftsView; d: GiftDecision; run: Run }) {
  const [status, setStatus] = useState(d.status);
  const [answer, setAnswer] = useState(d.answer);
  const canEdit = v.can("gift-catalogue:manage") || v.can("insurance:edit");
  return (
    <tr id={d.id}>
      <td className="mono small">{d.ref}</td>
      <td className="small">{d.question}</td>
      <td className="small">{d.module}</td>
      <td className="small">{d.owner}</td>
      <td>{canEdit ? <select className="select select--xs" value={status} onChange={(e) => setStatus(e.target.value as GiftDecision["status"])} aria-label={`Status of ${d.ref}`}>{["open", "under_review", "confirmed", "deferred", "out_of_scope"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select> : <StatusBadge tone={d.status === "confirmed" ? "positive" : d.status === "out_of_scope" ? "neutral" : "warning"}>{d.status.replace("_", " ")}</StatusBadge>}</td>
      <td className="small">{d.restriction}</td>
      <td>{canEdit ? <div className="btn-row"><TextArea label="Notes" value={answer} onChange={setAnswer} rows={2} /><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(updateGiftDecision(v.uid, d.id, { status, answer }), "Decision updated")}>Save</button></div> : <span className="small">{d.answer || "—"}</span>}</td>
    </tr>
  );
}

function AddressSettings({ v, run }: { v: GiftsView; run: Run }) {
  const [method, setMethod] = useState(v.gs.config.addressMethod ?? "");
  const [tracking, setTracking] = useState(v.gs.config.trackingPartner ?? "");
  return (
    <Panel title="Address verification (OP-GIFT1)" subtitle={<>Address verification method: <BcrTag>Business Confirmation Required</BcrTag></>}>
      <Notice tone="warn">No OTP, login-OTP rule or verification provider is assumed. A method recorded here is a development setting: outcomes are recorded as simulated, and dispatch stays blocked until an address is confirmed.</Notice>
      <TextField label="Verification method (development setting)" value={method} onChange={setMethod} placeholder="e.g. Development mock confirmation" />
      <TextField label="Delivery-tracking partner (development setting)" value={tracking} onChange={setTracking} placeholder="Not confirmed" />
      {v.can("gift-orders:manage") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setAddressMethod(v.uid, method || null, tracking || null), "Development setting recorded")}>Save</button>}
    </Panel>
  );
}

function RenderSettings({ v, run }: { v: GiftsView; run: Run }) {
  const w = v.gs.render.watermark;
  const [f, setF] = useState<RenderConfig["watermark"]>(w);
  const [formats, setFormats] = useState(v.gs.render.formats);
  return (
    <Panel title="Card rendering and watermark (OP-INS1)" subtitle={<>Production format: <BcrTag>{v.gs.render.productionFormat ?? "Business Confirmation Required"}</BcrTag></>}>
      <Checkbox label="JPEG output (prepared)" checked={formats.jpeg} onChange={(x) => setFormats({ ...formats, jpeg: x })} />
      <Checkbox label="PDF output (prepared)" checked={formats.pdf} onChange={(x) => setFormats({ ...formats, pdf: x })} />
      {v.can("insurance:edit") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setRenderFormats(v.uid, formats), "Formats recorded")}>Save formats</button>}
      <p className="small muted">Watermark text, position, opacity and whether it varies by programme or insurer are not invented. Values below are development settings for testing the rendering layer.</p>
      <TextField label="Watermark text" value={f.text ?? ""} onChange={(x) => setF({ ...f, text: x || null })} placeholder="Not set" />
      <SelectInput label="Position" value={f.position ?? ""} onChange={(x) => setF({ ...f, position: (x || null) as "diagonal" })} options={[{ value: "", label: "Not set" }, { value: "diagonal", label: "Diagonal" }, { value: "bottom", label: "Bottom" }, { value: "corner", label: "Corner" }]} />
      <TextField label="Opacity (0–1)" value={f.opacity != null ? String(f.opacity) : ""} onChange={(x) => setF({ ...f, opacity: x ? Number(x) : null })} inputMode="numeric" />
      {v.can("insurance:edit") && <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setWatermark(v.uid, f), "Watermark development setting recorded")}>Save watermark</button>}
      <p className="small">Current: {w.text ? `${w.text} · ${w.position} · ${w.opacity} (${w.status.replace("_", " ")})` : "Not configured"}</p>
    </Panel>
  );
}

function TierSettings({ v, run }: { v: GiftsView; run: Run }) {
  const [member, setMember] = useState("");
  const [tier, setTier] = useState("");
  const list = Object.entries(v.gs.config.tierAssignments);
  return (
    <Panel title="Member tier references (development)" subtitle="The tier service does not yet expose member tiers. Without a reference, tier-restricted gifts and cards are not offered">
      <div className="form-row">
        <TextField label="Member ID" value={member} onChange={setMember} />
        <SelectInput label="Tier" value={tier} onChange={setTier} options={[{ value: "", label: "Remove reference" }, ...tierOptions()]} />
      </div>
      {v.can("gift-catalogue:manage") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(setDevTier(v.uid, member.trim(), tier || null), "Tier reference recorded")}>Save reference</button>}
      <p className="small muted">{list.length} development references, e.g. {list.slice(0, 4).map(([m, t]) => `${memberName(v.mem, m)} → ${t}`).join(", ")}</p>
    </Panel>
  );
}
