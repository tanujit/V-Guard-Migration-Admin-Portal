import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Eye, Inbox, KeyRound, Plus, RefreshCw, Send, Ticket, Undo2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { SelectInput, TextArea, TextField } from "@/components/form/Form";
import { RECOVERY_OUTCOME, RECOVERY_REASONS, SOW_TARGETS } from "@/config/giftsCatalogue";
import { voucherStatusAt } from "@/features/gifts/engine";
import { requestRecovery, setRecoverySimulation, syncVoucherInventory, viewVoucherCode, voucherDelivery } from "@/features/gifts/store";
import type { RecoveryOutcome, VoucherRecord } from "@/types/gifts";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid } from "@/pages/masters/shared";
import { DecisionRef, DeliveryBadge, GBASE, RecoveryBadge, VoucherBadge, approvalLink, dt, giftName, inr, ledgerLink, memberLink, memberName, partnerName, redemptionLink, useGiftsView, useParam, useRun, userName, type GiftsView } from "./shared";

export function VoucherInventoryPage() {
  const v = useGiftsView();
  const nav = useNavigate();
  const [status, setStatus] = useParam("status");
  const [delivery, setDelivery] = useParam("delivery");
  const [partner, setPartner] = useParam("partner");
  const [open, setOpen] = useState<VoucherRecord | null>(null);
  const [sync, setSync] = useState(false);
  const all = v.gs.vouchers.filter((x) => !x.memberId || v.canOn("vouchers", "view", x.memberId)).map((x) => ({ ...x, st: voucherStatusAt(x, v.now), dl: voucherDelivery(x) }));
  const rows = all.filter((x) => (!status || x.st === status) && (!partner || x.partnerId === partner) && (!delivery || x.dl.whatsapp === delivery || x.dl.inapp === delivery));
  const voucherPartners = v.gs.partners.filter((p) => p.supportedTypes.includes("voucher"));
  return (
    <>
      <SectionTitle title="Voucher inventory and issuance" description="Monitors the member-app voucher flow: the redemption service validates, the wallet debits, the provider issues the e-code, N09 delivers it and it stays in Gifts History" actions={v.can("vouchers:manage") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setSync(true)}><RefreshCw size={14} aria-hidden="true" />Read provider inventory</button>} />
      <Notice tone="info">{SOW_TARGETS.voucher}. Voucher status (Issued, Used, Expired) is kept apart from message delivery (Pending, Delivered, Failed): a voucher can be issued while delivery is still pending. Available and Reserved are operational implementation states. Codes are never shown in lists or exports.</Notice>
      <KpiGrid cols={5} items={[
        { id: "vp", label: "Voucher partners", value: voucherPartners.length, desc: `${voucherPartners.filter((p) => p.status === "active").length} active (mock)`, icon: Ticket, variant: "primary", onSelect: () => nav(`${GBASE}/partners`) },
        { id: "vt", label: "Voucher types", value: v.gs.items.filter((i) => i.type === "voucher").length, desc: "Catalogue items", icon: Ticket, variant: "light", onSelect: () => nav(`${GBASE}/catalogue?type=voucher`) },
        { id: "av", label: "Available inventory", value: all.filter((x) => x.st === "available").length, desc: "Implementation state", icon: Inbox, variant: "dark", onSelect: () => setStatus("available") },
        { id: "rs", label: "Reserved inventory", value: all.filter((x) => x.st === "reserved").length, desc: "Implementation state", icon: Inbox, variant: "light", onSelect: () => setStatus("reserved") },
        { id: "is", label: "Issued vouchers", value: all.filter((x) => x.st === "issued").length, desc: "SOW status", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setStatus("issued") },
        { id: "us", label: "Used vouchers", value: all.filter((x) => x.st === "used").length, desc: "Provider usage report", icon: CheckCircle2, variant: "light", onSelect: () => setStatus("used") },
        { id: "ex", label: "Expired vouchers", value: all.filter((x) => x.st === "expired").length, desc: "Past expiry date", icon: AlertTriangle, variant: "light", onSelect: () => setStatus("expired") },
        { id: "fd", label: "Failed deliveries", value: all.filter((x) => x.dl.whatsapp === "failed" || x.dl.inapp === "failed").length, desc: "WhatsApp / in-app", icon: AlertTriangle, variant: "status", tone: "negative", onSelect: () => setDelivery("failed") },
        { id: "pd", label: "Pending deliveries", value: all.filter((x) => x.dl.whatsapp === "pending").length, desc: "Issued, delivery pending", icon: Send, variant: "status", tone: "warning", onSelect: () => setDelivery("pending") },
        { id: "rr", label: "Recovery requests", value: v.gs.recoveries.length, desc: `${v.gs.recoveries.filter((r) => r.status === "pending_approval").length} awaiting approval`, icon: Undo2, variant: "light", onSelect: () => nav(`${GBASE}/recovery`) },
      ]} />
      <div className="filters-bar">
        <SelectField label="Voucher status" value={status} onChange={setStatus} active={!!status} options={[{ value: "", label: "All statuses" }, ...["available", "reserved", "issued", "used", "expired", "replaced"].map((s) => ({ value: s, label: s }))]} />
        <SelectField label="Delivery" value={delivery} onChange={setDelivery} active={!!delivery} options={[{ value: "", label: "Any delivery" }, { value: "pending", label: "Pending delivery" }, { value: "delivered", label: "Delivered" }, { value: "failed", label: "Failed" }]} />
        <SelectField label="Partner" value={partner} onChange={setPartner} active={!!partner} options={[{ value: "", label: "All partners" }, ...voucherPartners.map((p) => ({ value: p.id, label: p.name }))]} />
        {(status || delivery || partner) && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setStatus(""); setDelivery(""); setPartner(""); }}>Clear all</button>}
      </div>
      <Panel title={`${rows.length} voucher record(s)`} padded={false}>
        <DataTable rows={rows} rowKey={(x) => x.id} caption="Voucher inventory" onRowClick={setOpen} exportName={v.can("vouchers:export") ? "vouchers" : undefined} pageSize={15} columns={[
          { key: "id", header: "Voucher reference", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
          { key: "p", header: "Partner", value: (x) => partnerName(v.gs, x.partnerId) },
          { key: "t", header: "Voucher type", value: (x) => giftName(v.gs, x.giftId) },
          { key: "sku", header: "Partner SKU", value: (x) => x.partnerSku, render: (x) => <span className="mono small">{x.partnerSku}</span> },
          { key: "val", header: "Voucher value", value: (x) => x.value, render: (x) => inr(x.value), align: "right" },
          { key: "m", header: "Member", value: (x) => x.memberId ?? "", render: (x) => memberLink(x.memberId) },
          { key: "s", header: "Voucher status", value: (x) => x.st, render: (x) => <VoucherBadge v={x} now={v.now} /> },
          { key: "i", header: "Issued", value: (x) => x.issuedAt ?? "", render: (x) => <span className="small">{dt(x.issuedAt)}</span> },
          { key: "e", header: "Expiry", value: (x) => x.expiresOn ?? "", render: (x) => <span className="small">{x.expiresOn ?? "—"}</span> },
          { key: "d", header: "Delivery (WhatsApp / in-app)", value: (x) => `${x.dl.whatsapp}/${x.dl.inapp}`, render: (x) => <span className="btn-row"><DeliveryBadge s={x.dl.whatsapp} /><DeliveryBadge s={x.dl.inapp} /></span> },
        ]} />
      </Panel>
      {open && <VoucherDrawer v={v} x={open} onClose={() => setOpen(null)} />}
      {sync && <SyncDrawer v={v} onClose={() => setSync(false)} />}
    </>
  );
}

function VoucherDrawer({ v, x, onClose }: { v: GiftsView; x: VoucherRecord; onClose: () => void }) {
  const { result, run } = useRun();
  const [code, setCode] = useState<string | null>(null);
  const dl = voucherDelivery(x);
  const nav = useNavigate();
  return (
    <Drawer open onClose={onClose} title={`Voucher ${x.id}`} subtitle={<VoucherBadge v={x} now={v.now} />}>
      <dl className="dl-grid">
        <dt>Partner</dt><dd>{partnerName(v.gs, x.partnerId)}</dd>
        <dt>Voucher type</dt><dd>{giftName(v.gs, x.giftId)}</dd>
        <dt>Voucher code</dt><dd>{code ?? <span className="muted">Restricted</span>}</dd>
        <dt>Voucher value</dt><dd>{inr(x.value)} (provider data)</dd>
        <dt>Member</dt><dd>{memberLink(x.memberId)} {memberName(v.mem, x.memberId)}</dd>
        <dt>Redemption</dt><dd>{x.redemptionRef ? redemptionLink(x.redemptionRef) : "—"} · ledger {ledgerLink(x.ledgerRef)}</dd>
        <dt>Issued</dt><dd>{dt(x.issuedAt)}</dd>
        <dt>Expiry</dt><dd>{x.expiresOn ?? "—"}</dd>
        <dt>Delivery channels</dt><dd>WhatsApp <DeliveryBadge s={dl.whatsapp} /> · in-app <DeliveryBadge s={dl.inapp} />{dl.commId && <> · <a className="mono small" href={`/masters/communication/history/${dl.commId}`}>{dl.commId}</a></>}</dd>
        <dt>Provider reference</dt><dd className="mono small">{x.providerRef ?? "—"}</dd>
        <dt>Gifts History</dt><dd>{x.memberId ? "Listed in the member's Gifts History (integration data; member app not connected)" : "Not allocated"}</dd>
        <dt>Origin</dt><dd>{x.origin.replace(/_/g, " ")}</dd>
      </dl>
      <div className="btn-row">
        {x.memberId && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const r = run(viewVoucherCode(v.uid, x.id), "Code view recorded in the audit trail"); if (r.ok) setCode(r.code ?? null); }}><KeyRound size={14} aria-hidden="true" />View code</button>}
        {x.memberId && v.can("vouchers:create") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => nav(`${GBASE}/recovery?voucher=${x.id}`)}><Undo2 size={14} aria-hidden="true" />Recover</button>}
      </div>
      <PolicyMessages result={result} />
    </Drawer>
  );
}

function SyncDrawer({ v, onClose }: { v: GiftsView; onClose: () => void }) {
  const items = v.gs.items.filter((i) => i.type === "voucher");
  const [gift, setGift] = useState(items[0]?.id ?? "");
  const [count, setCount] = useState("5");
  const [outcome, setOutcome] = useState<"ok" | "invalid" | "timeout">("ok");
  const { result, run } = useRun();
  return (
    <Drawer open onClose={onClose} title="Read provider inventory" subtitle="Mock voucher-provider adapter. No real codes are generated" footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Close</button><button type="button" className="btn btn--primary btn--sm" onClick={() => run(syncVoucherInventory(v.uid, gift, Number(count), outcome), "Inventory recorded")}><RefreshCw size={14} aria-hidden="true" />Read inventory</button></div>}>
      <SelectInput label="Voucher item" value={gift} onChange={setGift} options={items.map((i) => ({ value: i.id, label: `${i.name}${i.voucher?.denomination == null ? " (issued on demand)" : ""}` }))} />
      <TextField label="Vouchers reported available" value={count} onChange={setCount} inputMode="numeric" />
      <SelectInput label="Mock provider response (development)" value={outcome} onChange={(x) => setOutcome(x as "ok")} options={[{ value: "ok", label: "Valid response" }, { value: "invalid", label: "Invalid response" }, { value: "timeout", label: "Timeout" }]} />
      <p className="muted small">The provider file format is not assumed; a real integration may expose inventory differently.</p>
      <PolicyMessages result={result} />
    </Drawer>
  );
}

/* ======================= Recovery ======================= */

export function VoucherRecoveryPage() {
  const v = useGiftsView();
  const [voucherParam] = useParam("voucher");
  const [form, setForm] = useState(!!voucherParam);
  const { result, run } = useRun();
  const rows = v.gs.recoveries.filter((r) => v.canOn("vouchers", "view", r.memberId));
  return (
    <>
      <SectionTitle title="Voucher recovery and reissue" description="For a member who lost the code. The provider adapter re-sends or reissues; a recovery never creates a second active voucher, and the original voucher and every event stay traceable" actions={v.can("vouchers:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setForm(true)}><Plus size={14} aria-hidden="true" />Initiate recovery</button>} />
      <Notice tone="warn">Provider reissue behaviour is not confirmed (<DecisionRef id="GD-05" />). Approval (Finance) and execution are separate: the provider is asked only after approval.</Notice>
      <PolicyMessages result={result} />
      <Panel title="Recovery queue" padded={false}>
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Voucher recovery requests" exportName={v.can("vouchers:export") ? "voucher-recovery" : undefined} columns={[
          { key: "id", header: "Recovery request", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "v", header: "Original voucher", value: (r) => r.voucherId, render: (r) => <span className="mono small">{r.voucherId}</span> },
          { key: "m", header: "Member", value: (r) => r.memberId, render: (r) => <span>{memberLink(r.memberId)} <span className="small">{memberName(v.mem, r.memberId)}</span></span> },
          { key: "p", header: "Partner", value: (r) => partnerName(v.gs, v.gs.vouchers.find((x) => x.id === r.voucherId)?.partnerId ?? null) },
          { key: "val", header: "Value", value: (r) => v.gs.vouchers.find((x) => x.id === r.voucherId)?.value ?? 0, render: (r) => inr(v.gs.vouchers.find((x) => x.id === r.voucherId)?.value), align: "right" },
          { key: "is", header: "Issued", value: (r) => v.gs.vouchers.find((x) => x.id === r.voucherId)?.issuedAt ?? "", render: (r) => <span className="small">{dt(v.gs.vouchers.find((x) => x.id === r.voucherId)?.issuedAt)}</span> },
          { key: "e", header: "Expiry", value: (r) => v.gs.vouchers.find((x) => x.id === r.voucherId)?.expiresOn ?? "" },
          { key: "vs", header: "Voucher status", value: (r) => v.gs.vouchers.find((x) => x.id === r.voucherId)?.status ?? "", render: (r) => { const x = v.gs.vouchers.find((y) => y.id === r.voucherId); return x ? <VoucherBadge v={x} now={v.now} /> : "—"; } },
          { key: "o", header: "Recovery status", value: (r) => r.outcome, render: (r) => <RecoveryBadge o={r.outcome} /> },
          { key: "nv", header: "Reissued voucher", value: (r) => r.reissuedVoucherId ?? "", render: (r) => <span className="mono small">{r.reissuedVoucherId ?? "—"}</span> },
          { key: "by", header: "Requested by", value: (r) => userName(v.acc, r.requestedBy) },
          { key: "a", header: "Approval", value: (r) => r.approvalRequestId ?? "", render: (r) => approvalLink(r.approvalRequestId) },
          { key: "x", header: "", value: () => "", render: (r) => (r.status === "pending_approval" && v.can("vouchers:manage") ? <SimPicker v={v} id={r.id} /> : <span className="small muted">{r.outcomeDetail}</span>) },
        ]} />
      </Panel>
      {form && <RecoveryDrawer v={v} voucherId={voucherParam} onClose={() => setForm(false)} onDone={(r) => run(r, "Recovery submitted for approval")} />}
    </>
  );
}

function SimPicker({ v, id }: { v: GiftsView; id: string }) {
  const [x, setX] = useState("code_retrieved");
  const { run } = useRun();
  return (
    <span className="btn-row" title="Development control: the mock provider's answer when the approved request executes">
      <select className="select select--xs" value={x} onChange={(e) => setX(e.target.value)} aria-label={`Mock provider answer for ${id}`}>
        {(["code_retrieved", "reissued", "failed", "provider_review", "not_recoverable"] as RecoveryOutcome[]).map((o) => <option key={o} value={o}>{RECOVERY_OUTCOME[o]}</option>)}
      </select>
      <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(setRecoverySimulation(v.uid, id, x as "code_retrieved"), "Mock provider answer set")}><Eye size={12} aria-hidden="true" />Set</button>
    </span>
  );
}

function RecoveryDrawer({ v, voucherId, onClose, onDone }: { v: GiftsView; voucherId: string; onClose: () => void; onDone: (r: ReturnType<typeof requestRecovery>) => void }) {
  const pre = v.gs.vouchers.find((x) => x.id === voucherId);
  const [f, setF] = useState({ memberId: pre?.memberId ?? "", voucherId: voucherId ?? "", reason: RECOVERY_REASONS[0].code, remarks: "", evidence: "" });
  const { result, run } = useRun();
  const x = v.gs.vouchers.find((y) => y.id === f.voucherId.trim());
  return (
    <Drawer open onClose={onClose} title="Initiate voucher recovery" subtitle="Validated against the voucher, member, status, expiry and provider support" footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button><button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(requestRecovery(v.uid, { ...f, evidence: f.evidence ? [f.evidence] : [] }), "Recovery submitted for approval"); if (r.ok) { onDone(r); onClose(); } }}><Send size={14} aria-hidden="true" />Submit for approval</button></div>}>
      <TextField label="Member ID" value={f.memberId} onChange={(y) => setF({ ...f, memberId: y })} required />
      <TextField label="Original voucher reference" value={f.voucherId} onChange={(y) => setF({ ...f, voucherId: y })} required />
      {x && <p className="small muted">{giftName(v.gs, x.giftId)} · {inr(x.value)} · {x.codeMasked} · expires {x.expiresOn ?? "—"} · <VoucherBadge v={x} now={v.now} /></p>}
      <SelectInput label="Reason" value={f.reason} onChange={(y) => setF({ ...f, reason: y })} options={RECOVERY_REASONS.map((r) => ({ value: r.code, label: r.label }))} />
      <TextArea label="Remarks" value={f.remarks} onChange={(y) => setF({ ...f, remarks: y })} required />
      <TextField label="Evidence reference (if required by policy)" value={f.evidence} onChange={(y) => setF({ ...f, evidence: y })} />
      <PolicyMessages result={result} />
      <StatusBadge tone="info">Delivered again through the Communication Centre (N09) after a successful recovery</StatusBadge>
    </Drawer>
  );
}
