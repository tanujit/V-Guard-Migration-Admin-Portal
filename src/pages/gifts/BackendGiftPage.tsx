import { useState } from "react";
import { Download, Send, Upload } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { Checkbox, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { BACKEND_GIFT_CSV_HEADER } from "@/config/giftsCatalogue";
import { GIFT_REASONS, OP_STATUS } from "@/config/walletCatalogue";
import { costFor, redeemBlocks } from "@/features/gifts/engine";
import { availablePoints, requestFulfilmentRefund, submitBackendGift, submitBackendGiftBatch } from "@/features/gifts/store";
import { memberById } from "@/features/members/engine";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { approvalLink, dt, giftName, ledgerLink, memberLink, memberName, orderLink, pts, useGiftsView, useParam, useRun, userName, type GiftsView } from "./shared";

export function BackendGiftPage() {
  const v = useGiftsView();
  const [tab, setTab] = useParam("tab", "single");
  const gifts = v.ws.gifts.filter((g) => g.catalogueRef.startsWith("GIF-"));
  return (
    <>
      <SectionTitle title="Backend gift redemption" description="Gift redemption on behalf of a member, with points or free of cost (SOW 8.5, 10.5 AF03). The Phase 7 redemption engine and Finance approval are reused; this screen adds the catalogue, segmentation, point cost and fulfilment" />
      <Notice tone="info">Approval (Finance) and execution are separate. Points are deducted only by the wallet service after approval; FOC gifts deduct nothing and need a business justification. A failed fulfilment never deletes the redemption: a refund is raised as a linked wallet adjustment.</Notice>
      <Tabs label="Backend gift sections" value={tab} onChange={setTab} tabs={[{ id: "single", label: "Single redemption" }, { id: "bulk", label: "Bulk CSV", count: v.gs.giftBatches.length }, { id: "requests", label: "Requests", count: gifts.length }, { id: "issues", label: "Fulfilment issues", count: v.gs.issues.filter((i) => i.status === "open").length }]} />
      {tab === "single" && <Single v={v} />}
      {tab === "bulk" && <Bulk v={v} />}
      {tab === "requests" && (
        <Panel title="Backend gift redemptions" padded={false}>
          <DataTable rows={gifts} rowKey={(g) => g.id} caption="Backend gift redemptions" exportName={v.can("gift-redemption:export") ? "backend-gifts" : undefined} initialSort={{ key: "c", dir: "desc" }} columns={[
            { key: "id", header: "Request", value: (g) => g.id, render: (g) => <span className="mono small">{g.id}</span> },
            { key: "m", header: "Member", value: (g) => g.memberId, render: (g) => <span>{memberLink(g.memberId)} <span className="small">{memberName(v.mem, g.memberId)}</span></span> },
            { key: "g", header: "Gift", value: (g) => g.item },
            { key: "q", header: "Qty", value: (g) => g.quantity, align: "right" },
            { key: "p", header: "Points", value: (g) => (g.foc ? 0 : g.quantity * g.pointsPerUnit), render: (g) => (g.foc ? <StatusBadge tone="accent">FOC</StatusBadge> : <span className="num">{pts(g.quantity * g.pointsPerUnit)}</span>), align: "right" },
            { key: "s", header: "Status", value: (g) => g.status, render: (g) => <StatusBadge tone={OP_STATUS[g.status].tone}>{OP_STATUS[g.status].label}</StatusBadge> },
            { key: "a", header: "Approval", value: (g) => g.approvalRequestId ?? "", render: (g) => approvalLink(g.approvalRequestId) },
            { key: "l", header: "Ledger", value: (g) => g.ledgerIds.join(","), render: (g) => (g.ledgerIds.length ? ledgerLink(g.ledgerIds[0]) : <span className="muted small">{g.foc ? "No debit (FOC)" : "—"}</span>) },
            { key: "f", header: "Fulfilment", value: (g) => v.gs.orders.find((o) => o.redemptionRef === g.id)?.id ?? v.gs.vouchers.find((x) => x.redemptionRef?.startsWith(g.id))?.id ?? "", render: (g) => { const o = v.gs.orders.find((x) => x.redemptionRef === g.id); const vc = v.gs.vouchers.filter((x) => x.redemptionRef?.startsWith(g.id)); const iss = v.gs.issues.find((x) => x.redemptionRef === g.id); return o ? orderLink(o.id) : vc.length ? <span className="mono small">{vc.map((x) => x.id).join(", ")}</span> : iss ? <StatusBadge tone="negative">Fulfilment failed</StatusBadge> : <span className="muted small">—</span>; } },
            { key: "by", header: "Operator", value: (g) => userName(v.acc, g.createdBy) },
            { key: "c", header: "Created", value: (g) => g.createdAt, render: (g) => <span className="small">{dt(g.createdAt)}</span> },
            { key: "e", header: "Failure", value: (g) => g.failure ?? "", render: (g) => <span className="small field__error">{g.failure ?? ""}</span> },
          ]} />
        </Panel>
      )}
      {tab === "issues" && <Issues v={v} />}
    </>
  );
}

function Single({ v }: { v: GiftsView }) {
  const { result, run } = useRun();
  const [f, setF] = useState({ memberId: "", giftId: "", quantity: "1", deduct: true, reason: GIFT_REASONS[0].code, remarks: "", evidence: "" });
  const m = f.memberId ? memberById(v.mem, f.memberId.trim()) : undefined;
  const g = v.gs.items.find((i) => i.id === f.giftId);
  const cost = m && g ? costFor(v.gs, g.id, m, v.now) : null;
  const blocks = m && g ? redeemBlocks(v.gs, g, m, v.now) : [];
  const total = cost?.points != null ? cost.points * (Number(f.quantity) || 0) : null;
  const bal = m ? availablePoints(m.id) : null;
  if (!v.can("gift-redemption:create")) return <Notice tone="warn">You can view backend gift redemptions but need Backend gift redemption: Create to raise one.</Notice>;
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel title="Single member gift redemption">
        <div className="form-grid">
          <TextField label="Member ID" value={f.memberId} onChange={(x) => setF({ ...f, memberId: x })} required hint={m ? `${m.name} · ${m.programme} · ${m.branchCode}` : f.memberId ? "Member not found" : undefined} />
          <SelectInput label="Gift catalogue item" value={f.giftId} onChange={(x) => setF({ ...f, giftId: x })} options={[{ value: "", label: "Choose" }, ...v.gs.items.filter((i) => i.status === "active").map((i) => ({ value: i.id, label: `${i.id} · ${i.name}` }))]} required />
          <TextField label="Quantity" value={f.quantity} onChange={(x) => setF({ ...f, quantity: x })} inputMode="numeric" required />
          <Checkbox label="Deduct points" checked={f.deduct} onChange={(x) => setF({ ...f, deduct: x })} description="Clear for a free-of-cost (FOC) gift: no points are deducted and a justification is required" />
          <SelectInput label="Redemption reason" value={f.reason} onChange={(x) => setF({ ...f, reason: x })} options={GIFT_REASONS.map((r) => ({ value: r.code, label: r.label }))} />
          <TextArea label="Remarks" value={f.remarks} onChange={(x) => setF({ ...f, remarks: x })} required />
          <TextField label={f.deduct ? "Supporting evidence (optional)" : "Business justification document (required for FOC)"} value={f.evidence} onChange={(x) => setF({ ...f, evidence: x })} />
        </div>
        <PolicyMessages result={result} />
        <div className="btn-row wizard-nav">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(submitBackendGift(v.uid, { memberId: f.memberId, giftId: f.giftId, quantity: Number(f.quantity), deductPoints: f.deduct, reason: f.reason, remarks: f.remarks, evidence: f.evidence ? [f.evidence] : [] }), "Submitted for Finance approval"); if (r.ok) setF({ ...f, remarks: "", evidence: "" }); }}><Send size={14} aria-hidden="true" />Submit for approval</button>
        </div>
      </Panel>
      <Panel title="Validation" subtitle="Identity, programme, segmentation, availability, partner mapping, point cost and balance">
        <dl className="dl-grid">
          <dt>Member</dt><dd>{m ? `${m.name} · ${m.programme}` : "—"}</dd>
          <dt>Applicable point cost</dt><dd>{cost ? (cost.points != null ? `${pts(cost.points)} per unit` : cost.message) : "—"}</dd>
          <dt>Points to deduct</dt><dd>{f.deduct ? pts(total) : "0 (FOC)"}</dd>
          <dt>Available points</dt><dd>{pts(bal)} {f.deduct && total != null && bal != null && total > bal && <span className="field__error">Insufficient balance</span>}</dd>
        </dl>
        {blocks.length > 0 && <ul className="check-list">{blocks.map((b) => <li key={b} className="field__error">{b}</li>)}</ul>}
        {m && g && !blocks.length && cost?.points != null && <StatusBadge tone="positive">Catalogue checks passed</StatusBadge>}
      </Panel>
    </div>
  );
}

function Bulk({ v }: { v: GiftsView }) {
  const { result, run } = useRun();
  const [name, setName] = useState("backend-gifts.csv");
  const [text, setText] = useState(`${BACKEND_GIFT_CSV_HEADER.join(",")}\n`);
  const [rows, setRows] = useState<{ row: number; result: string; message: string }[] | null>(null);
  const template = () => {
    const blob = new Blob([`${BACKEND_GIFT_CSV_HEADER.join(",")}\nMBR-EP-0101,GIF-0007,1,no,GFT-ON-BEHALF,Development example row\n`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "backend-gift-template-demo.csv";
    a.click();
  };
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel title="Bulk gift redemption" subtitle="Rows are validated one by one; invalid and duplicate rows are never processed. The same file content cannot be uploaded twice, so a retry does not create duplicate orders" actions={<button type="button" className="btn btn--ghost btn--sm" onClick={template}><Download size={14} aria-hidden="true" />Template</button>}>
        <p className="small muted">Columns: {BACKEND_GIFT_CSV_HEADER.join(", ")}. <code>catalogue_ref</code> is the Gift Catalogue ID; <code>foc</code> is yes or no.</p>
        <TextField label="File name" value={name} onChange={setName} />
        <input type="file" accept=".csv" aria-label="Choose CSV file" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setName(file.name); setText(await file.text()); } }} />
        <TextArea label="File content" value={text} onChange={setText} rows={8} />
        <PolicyMessages result={result} />
        {v.can("gift-redemption:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(submitBackendGiftBatch(v.uid, name, text), "Batch processed"); setRows(r.ok ? r.rows ?? null : null); }}><Upload size={14} aria-hidden="true" />Validate and submit valid rows</button>}
        {rows && <DataTable rows={rows} rowKey={(r) => String(r.row)} caption="Row results" searchable={false} columns={[{ key: "r", header: "Row", value: (r) => r.row }, { key: "s", header: "Result", value: (r) => r.result, render: (r) => <span className={`result result--${r.result}`}>{r.result}</span> }, { key: "m", header: "Message", value: (r) => r.message }]} />}
      </Panel>
      <Panel title="Uploaded batches">
        <DataTable rows={v.gs.giftBatches} rowKey={(b) => b.id} caption="Backend gift batches" searchable={false} columns={[
          { key: "id", header: "Batch", value: (b) => b.id },
          { key: "f", header: "File", value: (b) => b.fileName },
          { key: "v", header: "Submitted rows", value: (b) => b.rows.filter((r) => r.result === "valid").length, align: "right" },
          { key: "i", header: "Invalid / duplicate", value: (b) => b.rows.filter((r) => r.result !== "valid").length, align: "right" },
          { key: "by", header: "By", value: (b) => userName(v.acc, b.createdBy) },
          { key: "at", header: "Uploaded", value: (b) => b.createdAt, render: (b) => <span className="small">{dt(b.createdAt)}</span> },
        ]} />
      </Panel>
    </div>
  );
}

function Issues({ v }: { v: GiftsView }) {
  const { result, run } = useRun();
  const [remarks, setRemarks] = useState("");
  return (
    <Panel title="Fulfilment issues" subtitle="Failed fulfilments that already deducted points. The original redemption and ledger debit are kept; any refund goes through the wallet service and is linked">
      <PolicyMessages result={result} />
      <TextField label="Refund remarks" value={remarks} onChange={setRemarks} hint="Required to raise a refund" />
      <DataTable rows={v.gs.issues} rowKey={(i) => i.id} caption="Fulfilment issues" searchable={false} columns={[
        { key: "id", header: "Issue", value: (i) => i.id },
        { key: "r", header: "Redemption", value: (i) => i.redemptionRef, render: (i) => <span className="mono small">{i.redemptionRef}</span> },
        { key: "m", header: "Member", value: (i) => i.memberId, render: (i) => memberLink(i.memberId) },
        { key: "g", header: "Gift", value: (i) => giftName(v.gs, i.giftId) },
        { key: "k", header: "Issue", value: (i) => i.kind.replace(/_/g, " "), render: (i) => <span className="small">{i.detail}</span> },
        { key: "p", header: "Points deducted", value: (i) => i.pointsDeducted, render: (i) => <span className="num">{pts(i.pointsDeducted)}</span>, align: "right" },
        { key: "l", header: "Debit", value: (i) => i.ledgerRef ?? "", render: (i) => ledgerLink(i.ledgerRef) },
        { key: "s", header: "Status", value: (i) => i.status, render: (i) => <StatusBadge tone={i.status === "open" ? "negative" : i.status === "refund_requested" ? "warning" : "positive"}>{i.status.replace("_", " ")}</StatusBadge> },
        { key: "rf", header: "Refund", value: (i) => i.refundRef ?? "", render: (i) => (i.refundRef ? <span className="mono small">{i.refundRef}</span> : v.can("points-adjustment:create") && i.status === "open" ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(requestFulfilmentRefund(v.uid, i.id, remarks), "Refund raised for approval")}>Raise refund</button> : <span className="muted small">—</span>) },
      ]} />
    </Panel>
  );
}
