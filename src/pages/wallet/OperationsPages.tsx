import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, CircleDashed, Coins, Download, FileUp, Hourglass, MinusCircle, PlusCircle, Send, XCircle, AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { SelectField } from "@/components/ui/primitives";
import { RadioCards, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { ADJUSTMENT_REASONS, LEDGER_TYPE, PROGRAMMES, REVERSAL_REASONS, TRANSFER_REASONS } from "@/config/walletCatalogue";
import { memberById } from "@/features/members/engine";
import { CSV_HEADER, memberBalances, validateAdjustment, validateReversal, validateTransfer } from "@/features/wallet/engine";
import { submitAdjustment, submitBatch, submitReversal, submitTransfer, validateBatchFile } from "@/features/wallet/store";
import type { AdjustmentBatch, OpStatus, PointsAdjustment } from "@/types/wallet";
import { Notice } from "@/pages/approvals/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { FinKpiGrid, OpBadge, PointsCell, TypeTag, approvalLink, dt, ledgerLink, memberLink, memberName, pts, useParam, useRun, useWalletView, userName, type WalletView } from "./shared";

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, { value: "pending_approval", label: "Pending approval" }, { value: "approved", label: "Approved, not executed" }, { value: "completed", label: "Completed" }, { value: "rejected", label: "Rejected" }, { value: "failed", label: "Failed" }, { value: "returned", label: "Returned" }];

/** Evidence capture: file names only. Files are not stored in this development build. */
function EvidenceInput({ value, onChange, label = "Supporting evidence", required }: { value: string[]; onChange: (v: string[]) => void; label?: string; required?: boolean }) {
  return (
    <div className="field">
      <label className="field__label">
        {label}
        {required && <span className="field__req"> *</span>}
      </label>
      <input type="file" multiple onChange={(e) => onChange(Array.from(e.target.files ?? []).map((f) => f.name))} aria-label={label} />
      <p className="field__hint">{value.length ? value.join(", ") : "Only the file name is recorded in this development build; no file is uploaded"}</p>
    </div>
  );
}

function MemberPreview({ v, memberId }: { v: WalletView; memberId: string }) {
  const m = memberById(v.mem, memberId.trim());
  if (!memberId.trim()) return null;
  if (!m) return <p className="small neg">Member not found</p>;
  const b = memberBalances(v.ws, v.ss, v.mem, m.id);
  return (
    <p className="small member-preview">
      <strong>{m.name}</strong> · {m.programme} · Available <span className="num">{pts(b.available)}</span> · Scheme <span className="num">{pts(b.scheme)}</span>
      {v.ws.service.mode !== "available" && <span className="warn-text"> · wallet service unavailable: shown balance may be stale</span>}
    </p>
  );
}

/* ======================= Adjustments ======================= */

export function AdjustmentsPage() {
  const v = useWalletView("points-adjustment");
  const nav = useNavigate();
  const [tab, setTab] = useParam("tab", "requests");
  const [status, setStatus] = useParam("status", "all");
  const all = [...v.ws.adjustments].reverse();
  const ofStatus = (s: OpStatus[]) => all.filter((a) => s.includes(a.status));
  const added = all.filter((a) => a.status === "completed" && a.direction === "add").reduce((n, a) => n + a.points, 0) + v.ws.batches.filter((b) => b.status === "completed").flatMap((b) => b.rows).filter((r) => r.result === "completed" && r.direction.toLowerCase() === "add").reduce((n, r) => n + Number(r.points), 0);
  const deducted = all.filter((a) => a.status === "completed" && a.direction === "deduct").reduce((n, a) => n + a.points, 0) + v.ws.batches.filter((b) => b.status === "completed").flatMap((b) => b.rows).filter((r) => r.result === "completed" && r.direction.toLowerCase() === "deduct").reduce((n, r) => n + Number(r.points), 0);
  const go = (s: string) => { setTab("requests"); setStatus(s); };
  const list = all.filter((a) => v.inScope(a.memberId) || v.canOn("points-adjustment", "view", a.memberId)).filter((a) => status === "all" || a.status === status);
  const cols: Column<PointsAdjustment>[] = [
    { key: "id", header: "Adjustment", value: (a) => a.id, render: (a) => <span className="mono small">{a.id}</span> },
    { key: "member", header: "Member", value: (a) => a.memberId, render: (a) => memberLink(a.memberId) },
    { key: "prog", header: "Programme", value: (a) => a.programme },
    { key: "type", header: "Type", value: (a) => a.direction, render: (a) => (a.direction === "add" ? <span className="pos small">Add</span> : <span className="neg small">Deduct</span>) },
    { key: "cat", header: "Category", value: (a) => (a.category === "base" ? "Base points" : "Scheme points") },
    { key: "pts", header: "Points", value: (a) => a.points, render: (a) => <PointsCell n={a.direction === "add" ? a.points : -a.points} />, align: "right" },
    { key: "reason", header: "Reason", value: (a) => a.reasonCode },
    { key: "maker", header: "Maker", value: (a) => userName(v.acc, a.createdBy) },
    { key: "apr", header: "Approval", value: (a) => a.approvalRequestId ?? "", render: (a) => approvalLink(a.approvalRequestId) },
    { key: "status", header: "Status", value: (a) => a.status, render: (a) => <OpBadge status={a.status} /> },
    { key: "ledger", header: "Ledger", value: (a) => a.ledgerIds.join(" "), render: (a) => (a.ledgerIds.length ? ledgerLink(a.ledgerIds[0]) : <span className="small muted">{a.failure ? "Failed: " + a.failure.slice(0, 40) : "Not posted"}</span>) },
  ];
  return (
    <>
      <FinKpiGrid
        items={[
          { id: "total", label: "Total adjustments", value: all.length, desc: "Single-member adjustment requests", accent: "lead", icon: Coins, onSelect: () => go("all") },
          { id: "pending", label: "Pending approval", value: ofStatus(["pending_approval"]).length, desc: "With a Checker (WF-001)", accent: "pending", icon: Hourglass, onSelect: () => go("pending_approval") },
          { id: "approved", label: "Approved", value: ofStatus(["approved", "completed", "failed"]).length, desc: "Approved by every stage (execution recorded separately)", accent: "neutral", icon: CheckCircle2, onSelect: () => go("approved") },
          { id: "rejected", label: "Rejected", value: ofStatus(["rejected"]).length, desc: "Rejected by a Checker", accent: "failed", icon: XCircle, onSelect: () => go("rejected") },
          { id: "completed", label: "Completed", value: ofStatus(["completed"]).length, desc: "Posted to the ledger by the wallet service", accent: "available", icon: CheckCircle2, onSelect: () => go("completed") },
          { id: "failed", label: "Failed", value: ofStatus(["failed"]).length, desc: "Approved but refused by the wallet service at execution", accent: "failed", icon: AlertTriangle, onSelect: () => go("failed") },
          { id: "added", label: "Total points added", value: added, desc: "Completed additions, single and batch", accent: "available", icon: PlusCircle, onSelect: () => nav("/wallet/ledger?type=manual_add") },
          { id: "deducted", label: "Total points deducted", value: deducted, desc: "Completed deductions, single and batch", accent: "failed", icon: MinusCircle, onSelect: () => nav("/wallet/ledger?type=manual_deduct") },
        ]}
      />
      <Tabs label="Adjustment sections" value={tab} onChange={setTab} tabs={[{ id: "requests", label: "Adjustment requests", count: list.length }, { id: "new", label: "New adjustment" }, { id: "bulk", label: "Bulk upload" }, { id: "batches", label: "Batches", count: v.ws.batches.length }]} />
      {tab === "requests" && (
        <Panel title="Adjustment requests" actions={<SelectField label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />}>
          <DataTable rows={list} columns={cols} rowKey={(a) => a.id} caption="Points adjustments" exportName={v.can("points-adjustment:export") ? "points-adjustments" : undefined} />
        </Panel>
      )}
      {tab === "new" && <NewAdjustment v={v} onDone={() => setTab("requests")} />}
      {tab === "bulk" && <BulkUpload v={v} onDone={() => setTab("batches")} />}
      {tab === "batches" && <Batches v={v} />}
    </>
  );
}

function NewAdjustment({ v, onDone }: { v: WalletView; onDone: () => void }) {
  const [member] = useParam("member", "");
  const [f, setF] = useState({ memberId: member, programme: (memberById(v.mem, member)?.programme ?? "EP") as string, direction: "add" as "add" | "deduct", category: "base" as "base" | "scheme", points: "", reasonCode: "", remarks: "", approvalCode: "" });
  const [evidence, setEvidence] = useState<string[]>([]);
  const { result, run } = useRun();
  const m = memberById(v.mem, f.memberId.trim());
  const input = { ...f, points: Number(f.points) };
  const check = validateAdjustment(v.ws, v.ss, v.mem, input, ADJUSTMENT_REASONS.map((r) => r.code));
  const can = v.canOn("points-adjustment", "create", m?.id) && v.canOn("points-adjustment", "submit", m?.id);
  return (
    <Panel title="Single member adjustment" subtitle="SOW 10.5 AF04. Submitted to WF-001; posted only after approval, by the wallet service">
      <PolicyMessages result={result} />
      <div className="form-grid form-grid--2">
        <TextField label="Member ID" value={f.memberId} onChange={(x) => setF({ ...f, memberId: x, programme: memberById(v.mem, x.trim())?.programme ?? f.programme })} required />
        <SelectInput label="Programme" value={f.programme} onChange={(x) => setF({ ...f, programme: x })} options={PROGRAMMES.map((p) => ({ value: p, label: p }))} required hint="Must match the member's programme" />
      </div>
      <MemberPreview v={v} memberId={f.memberId} />
      <RadioCards name="direction" label="Adjustment type" value={f.direction} onChange={(x) => setF({ ...f, direction: x })} options={[{ value: "add", label: "Add", description: "Manual points addition" }, { value: "deduct", label: "Deduct", description: "Manual points deduction; the balance cannot go negative" }]} />
      <RadioCards name="category" label="Points category" value={f.category} onChange={(x) => setF({ ...f, category: x })} options={[{ value: "base", label: "Base points", description: "Available bucket" }, { value: "scheme", label: "Scheme points", description: "Unsettled scheme bucket" }]} />
      <div className="form-grid form-grid--3">
        <TextField label="Adjustment value (points)" value={f.points} onChange={(x) => setF({ ...f, points: x })} inputMode="numeric" required />
        <SelectInput label="Reason code" value={f.reasonCode} onChange={(x) => setF({ ...f, reasonCode: x })} options={[{ value: "", label: "Choose" }, ...ADJUSTMENT_REASONS.map((r) => ({ value: r.code, label: r.label }))]} required />
        <TextField label="Approval code / reference" value={f.approvalCode} onChange={(x) => setF({ ...f, approvalCode: x })} required hint="Business approval reference, separate from the Checker's decision" />
      </div>
      <TextArea label="Remarks" value={f.remarks} onChange={(x) => setF({ ...f, remarks: x })} required />
      <EvidenceInput value={evidence} onChange={setEvidence} />
      {f.memberId && !check.ok && <ul className="small neg plain-list">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="btn-row">
        <button type="button" className="btn btn--primary" disabled={!can} onClick={() => { const r = run(submitAdjustment(v.uid, { ...input, evidence }), "Adjustment submitted for approval. Nothing is posted until approval and execution"); if (r.ok) onDone(); }}>
          <Send size={14} aria-hidden="true" />Submit for approval
        </button>
        {!can && <span className="small muted">Needs Points adjustments: Create and Submit for this member's programme and branch</span>}
      </div>
    </Panel>
  );
}

const TEMPLATE = `${CSV_HEADER.join(",")}\nMBR-EP-0001,EP,base,add,250,ADJ-SCAN-FAIL,Scan outage on 3 Oct\n`;

function BulkUpload({ v, onDone }: { v: WalletView; onDone: () => void }) {
  const { result, run } = useRun();
  const [text, setText] = useState("");
  const [name, setName] = useState("adjustments.csv");
  return (
    <Panel title="Bulk CSV adjustment" subtitle={`Validated row by row. Batch policy: ${v.ws.config.batchPolicy === "atomic" ? "atomic (all valid rows post together or none)" : "row-level"}`}>
      <PolicyMessages result={result} />
      <ol className="steps small">
        <li>Download the template</li><li>Upload or paste the CSV</li><li>Review the validation summary</li><li>Submit the batch for approval (in Batches)</li><li>Rows execute after approval; results are kept per row</li>
      </ol>
      <div className="btn-row">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => downloadCsv("points-adjustment-template.csv", CSV_HEADER.map((h, i) => ({ header: h, value: (r: string[]) => r[i] })), [["MBR-EP-0001", "EP", "base", "add", "250", "ADJ-SCAN-FAIL", "Scan outage on 3 Oct"]])}>
          <Download size={14} aria-hidden="true" />Template
        </button>
        <label className="btn btn--secondary btn--sm file-btn">
          <FileUp size={14} aria-hidden="true" />Choose CSV
          <input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setName(file.name); setText(await file.text()); } }} />
        </label>
        <button type="button" className="btn btn--tertiary btn--sm" onClick={() => setText(TEMPLATE)}>Use template example</button>
      </div>
      <TextArea label="CSV content" value={text} onChange={setText} rows={8} placeholder={CSV_HEADER.join(",")} />
      <p className="small muted">Reason codes: {ADJUSTMENT_REASONS.map((r) => r.code).join(", ")}. Points category: base or scheme. Adjustment type: add or deduct.</p>
      <button type="button" className="btn btn--primary" disabled={!text.trim() || !v.can("points-adjustment:create")} onClick={() => { const r = run(validateBatchFile(v.uid, name, text), "File validated: review the batch and submit it for approval"); if (r.ok) onDone(); }}>
        Validate file
      </button>
    </Panel>
  );
}

function Batches({ v }: { v: WalletView }) {
  const [open, setOpen] = useState<AdjustmentBatch | null>(null);
  const batches = [...v.ws.batches].reverse();
  const count = (b: AdjustmentBatch, r: string[]) => b.rows.filter((x) => r.includes(x.result)).length;
  return (
    <Panel title="Batches" subtitle="Batch approval is not proof that each row executed: row results are recorded at execution">
      <DataTable
        rows={batches}
        rowKey={(b) => b.id}
        caption="Adjustment batches"
        onRowClick={(b) => setOpen(b)}
        columns={[
          { key: "id", header: "Batch ID", value: (b) => b.id, render: (b) => <span className="mono small">{b.id}</span> },
          { key: "file", header: "File", value: (b) => b.fileName },
          { key: "total", header: "Total", value: (b) => b.rows.length, align: "right" },
          { key: "valid", header: "Valid", value: (b) => count(b, ["valid", "completed", "failed", "not_executed"]), align: "right" },
          { key: "invalid", header: "Invalid", value: (b) => count(b, ["invalid"]), align: "right" },
          { key: "dup", header: "Duplicate", value: (b) => count(b, ["duplicate"]), align: "right" },
          { key: "appr", header: "Approved rows", value: (b) => (["approved", "completed", "failed"].includes(b.status) ? count(b, ["valid", "completed", "failed", "not_executed"]) : 0), align: "right" },
          { key: "failed", header: "Failed", value: (b) => count(b, ["failed", "not_executed"]), align: "right" },
          { key: "done", header: "Completed", value: (b) => count(b, ["completed"]), align: "right" },
          { key: "apr", header: "Approval", value: (b) => b.approvalRequestId ?? "", render: (b) => approvalLink(b.approvalRequestId) },
          { key: "status", header: "Status", value: (b) => b.status, render: (b) => <OpBadge status={b.status} /> },
        ]}
      />
      {open && <BatchDrawer v={v} batch={v.ws.batches.find((b) => b.id === open.id)!} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

function BatchDrawer({ v, batch, onClose }: { v: WalletView; batch: AdjustmentBatch; onClose: () => void }) {
  const { result, run } = useRun();
  const [code, setCode] = useState(batch.approvalCode);
  const [remarks, setRemarks] = useState(batch.remarks);
  const invalid = batch.rows.filter((r) => r.result === "invalid" || r.result === "duplicate").length;
  return (
    <Drawer open onClose={onClose} width={760} title={`Batch ${batch.id}`} subtitle={`${batch.fileName} · ${batch.policy === "atomic" ? "Atomic policy" : "Row-level policy"}`}>
      <PolicyMessages result={result} />
      {batch.status === "draft" && invalid > 0 && batch.policy === "atomic" && <Notice tone="warn">{invalid} invalid or duplicate row(s). Under the atomic policy the file must be corrected and validated again before submission.</Notice>}
      <table className="table table--compact">
        <thead><tr><th>Row</th><th>Member</th><th>Prog.</th><th>Category</th><th>Type</th><th className="num">Points</th><th>Reason</th><th>Result</th><th>Message</th></tr></thead>
        <tbody>
          {batch.rows.map((r) => (
            <tr key={r.row} className={r.result === "invalid" || r.result === "duplicate" || r.result === "failed" ? "row--warn" : ""}>
              <td className="num">{r.row}</td><td className="mono small">{r.memberId}</td><td>{r.programme}</td><td>{r.category}</td><td>{r.direction}</td><td className="num">{r.points}</td><td className="small">{r.reasonCode}</td>
              <td><span className={`small result result--${r.result}`}>{r.result.replace("_", " ")}</span></td>
              <td className="small">{r.ledgerIds.length ? ledgerLink(r.ledgerIds[0]) : r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {batch.status === "draft" && (
        <>
          <div className="form-grid form-grid--2">
            <TextField label="Approval code / reference" value={code} onChange={setCode} required />
            <TextField label="Remarks" value={remarks} onChange={setRemarks} required />
          </div>
          <button type="button" className="btn btn--primary" onClick={() => { const res = run(submitBatch(v.uid, batch.id, code, remarks), "Batch submitted for approval"); if (res.ok) onClose(); }}><Send size={14} aria-hidden="true" />Submit batch for approval</button>
        </>
      )}
    </Drawer>
  );
}

/* ======================= Transfers ======================= */

export function TransfersPage() {
  const v = useWalletView("points-transfer");
  const [tab, setTab] = useParam("tab", "list");
  const list = [...v.ws.transfers].reverse().filter((t) => v.canOn("points-transfer", "view", t.fromMemberId));
  return (
    <>
      <SectionTitle title="Member-to-member transfers" description="Dispute resolution within the same programme. Debit and credit post together under one transfer reference after approval (WF-021). Balances never go negative" />
      <Tabs label="Transfer sections" value={tab} onChange={setTab} tabs={[{ id: "list", label: "Transfers", count: list.length }, { id: "new", label: "New transfer" }]} />
      {tab === "list" ? (
        <Panel title="Transfer directory">
          <DataTable
            rows={list}
            rowKey={(t) => t.id}
            caption="Points transfers"
            exportName={v.can("points-transfer:export") ? "points-transfers" : undefined}
            columns={[
              { key: "id", header: "Transfer reference", value: (t) => t.id, render: (t) => <span className="mono small">{t.id}</span> },
              { key: "from", header: "Source member", value: (t) => t.fromMemberId, render: (t) => memberLink(t.fromMemberId) },
              { key: "to", header: "Destination member", value: (t) => t.toMemberId, render: (t) => memberLink(t.toMemberId) },
              { key: "prog", header: "Programme", value: (t) => t.programme },
              { key: "pts", header: "Points", value: (t) => t.points, render: (t) => <span className="num">{pts(t.points)}</span>, align: "right" },
              { key: "at", header: "Transfer date", value: (t) => t.executedAt ?? t.createdAt, render: (t) => <span className="num small">{dt(t.executedAt ?? t.createdAt)}</span> },
              { key: "reason", header: "Reason", value: (t) => t.reasonCode },
              { key: "by", header: "Initiated by", value: (t) => userName(v.acc, t.createdBy) },
              { key: "apr", header: "Approval", value: (t) => t.approvalRequestId ?? "", render: (t) => approvalLink(t.approvalRequestId) },
              { key: "status", header: "Execution status", value: (t) => t.status, render: (t) => <OpBadge status={t.status} /> },
              { key: "lines", header: "Ledger lines", value: (t) => t.ledgerIds.join(" "), render: (t) => (t.ledgerIds.length ? <span>{ledgerLink(t.ledgerIds[0])} {ledgerLink(t.ledgerIds[1])}</span> : <span className="small muted">{t.failure ?? "—"}</span>) },
            ]}
          />
        </Panel>
      ) : (
        <NewTransfer v={v} onDone={() => setTab("list")} />
      )}
    </>
  );
}

function NewTransfer({ v, onDone }: { v: WalletView; onDone: () => void }) {
  const [from] = useParam("from", "");
  const [f, setF] = useState({ fromMemberId: from, toMemberId: "", points: "", reasonCode: "", comment: "" });
  const [evidence, setEvidence] = useState<string[]>([]);
  const { result, run } = useRun();
  const input = { ...f, points: Number(f.points), evidence };
  const check = validateTransfer(v.ws, v.ss, v.mem, input);
  return (
    <Panel title="New transfer request" subtitle="Restricted operation: same programme, sufficient available points, evidence and comment required">
      <PolicyMessages result={result} />
      <div className="form-grid form-grid--2">
        <div><TextField label="Source member ID" value={f.fromMemberId} onChange={(x) => setF({ ...f, fromMemberId: x })} required /><MemberPreview v={v} memberId={f.fromMemberId} /></div>
        <div><TextField label="Destination member ID" value={f.toMemberId} onChange={(x) => setF({ ...f, toMemberId: x })} required /><MemberPreview v={v} memberId={f.toMemberId} /></div>
        <TextField label="Points to transfer" value={f.points} onChange={(x) => setF({ ...f, points: x })} inputMode="numeric" required />
        <SelectInput label="Reason" value={f.reasonCode} onChange={(x) => setF({ ...f, reasonCode: x })} options={[{ value: "", label: "Choose" }, ...TRANSFER_REASONS.map((r) => ({ value: r.code, label: r.label }))]} required />
      </div>
      <TextArea label="Mandatory comment" value={f.comment} onChange={(x) => setF({ ...f, comment: x })} required />
      <EvidenceInput value={evidence} onChange={setEvidence} label="Supporting evidence (QR image or document)" required />
      {(f.fromMemberId || f.toMemberId) && !check.ok && <ul className="small neg plain-list">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <button type="button" className="btn btn--primary" onClick={() => { const r = run(submitTransfer(v.uid, input), "Transfer submitted for approval"); if (r.ok) onDone(); }}><Send size={14} aria-hidden="true" />Submit for approval</button>
    </Panel>
  );
}

/* ======================= Reversals ======================= */

export function ReversalsPage() {
  const v = useWalletView("points-reversal");
  const [tab, setTab] = useParam("tab", "list");
  const list = [...v.ws.reversals].reverse().filter((r) => v.canOn("points-reversal", "view", r.memberId));
  return (
    <>
      <SectionTitle title="Sales return & reversals" description="Negative-point reversals linked to the original transaction. A second person approves (WF-020) and a comment is compulsory. The original credit is never deleted" />
      <Tabs label="Reversal sections" value={tab} onChange={setTab} tabs={[{ id: "list", label: "Reversals", count: list.length }, { id: "new", label: "New reversal" }]} />
      {tab === "list" ? (
        <Panel title="Reversal directory">
          <DataTable
            rows={list}
            rowKey={(r) => r.id}
            caption="Points reversals"
            exportName={v.can("points-reversal:export") ? "points-reversals" : undefined}
            columns={[
              { key: "id", header: "Reversal reference", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
              { key: "orig", header: "Original transaction", value: (r) => r.originalLedgerId, render: (r) => ledgerLink(r.originalLedgerId) },
              { key: "member", header: "Member", value: (r) => r.memberId, render: (r) => memberLink(r.memberId) },
              { key: "prog", header: "Programme", value: (r) => r.programme },
              { key: "src", header: "Scheme / scan reference", value: (r) => r.sourceRef, render: (r) => <span className="mono small">{r.sourceRef}</span> },
              { key: "op", header: "Original points", value: (r) => r.originalPoints, align: "right" },
              { key: "rp", header: "Reversal points", value: (r) => r.points, render: (r) => <PointsCell n={-r.points} />, align: "right" },
              { key: "reason", header: "Reason", value: (r) => r.type.replace(/_/g, " ") },
              { key: "by", header: "Initiated by", value: (r) => userName(v.acc, r.createdBy) },
              { key: "apr", header: "Approval", value: (r) => r.approvalRequestId ?? "", render: (r) => approvalLink(r.approvalRequestId) },
              { key: "status", header: "Execution status", value: (r) => r.status, render: (r) => <OpBadge status={r.status} /> },
            ]}
          />
        </Panel>
      ) : (
        <NewReversal v={v} onDone={() => setTab("list")} />
      )}
    </>
  );
}

function NewReversal({ v, onDone }: { v: WalletView; onDone: () => void }) {
  const [member] = useParam("member", "");
  const [f, setF] = useState({ originalLedgerId: "", points: "", reasonCode: "", comment: "" });
  const [evidence, setEvidence] = useState<string[]>([]);
  const { result, run } = useRun();
  const credits = useMemo(() => (member ? v.lines.filter((l) => l.memberId === member && l.points > 0 && ["scan_credit", "base_credit", "welcome_bonus", "other_bonus", "manual_add", "transfer_credit"].includes(l.type) && l.bucket === "available").slice(-12).reverse() : []), [v.lines, member]);
  const input = { ...f, points: Number(f.points), evidence };
  const check = validateReversal(v.ws, v.ss, v.mem, input);
  const o = check.original;
  const row = (k: string, val: ReactNode) => <div className="kv__row"><dt>{k}</dt><dd>{val}</dd></div>;
  return (
    <Panel title="New reversal request" subtitle="Only a valid ledger credit can be reversed. Complex scheme / milestone reversal amounts are not invented (SCH-Q7)">
      <PolicyMessages result={result} />
      {credits.length > 0 && (
        <div className="field">
          <span className="field__label">Recent credits for {member} ({memberName(v.mem, member)})</span>
          <div className="chip-list">{credits.map((c) => <button type="button" key={c.id} className="chip" onClick={() => setF({ ...f, originalLedgerId: c.id, points: String(c.points) })}>{c.id} · {LEDGER_TYPE[c.type].label} · {pts(c.points)}</button>)}</div>
        </div>
      )}
      <div className="form-grid form-grid--3">
        <TextField label="Original transaction (ledger ID)" value={f.originalLedgerId} onChange={(x) => setF({ ...f, originalLedgerId: x })} required />
        <TextField label="Proposed reversal points" value={f.points} onChange={(x) => setF({ ...f, points: x })} inputMode="numeric" required />
        <SelectInput label="Reversal type" value={f.reasonCode} onChange={(x) => setF({ ...f, reasonCode: x })} options={[{ value: "", label: "Choose" }, ...REVERSAL_REASONS.map((r) => ({ value: r.code, label: r.label }))]} required />
      </div>
      {o && (
        <dl className="kv kv--tight original-box">
          {row("Original", <>{ledgerLink(o.id)} <TypeTag type={o.type} /></>)}
          {row("Member / programme", `${o.memberId} · ${o.programme}`)}
          {row("Original points", pts(o.points))}
          {row("Reference", o.ref)}
          {row("Bucket", o.bucket)}
        </dl>
      )}
      <TextArea label="Mandatory comment" value={f.comment} onChange={(x) => setF({ ...f, comment: x })} required />
      <EvidenceInput value={evidence} onChange={setEvidence} />
      {f.originalLedgerId && !check.ok && <ul className="small neg plain-list">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {check.warnings.map((w) => <p key={w} className="small warn-text">{w}</p>)}
      <button type="button" className="btn btn--primary" onClick={() => { const r = run(submitReversal(v.uid, input), "Reversal submitted for second-person approval"); if (r.ok) onDone(); }}><Send size={14} aria-hidden="true" />Submit for approval</button>
      <p className="small muted"><CircleDashed size={12} aria-hidden="true" /> Bulk reversal is accepted only where each row links to a valid source transaction; use one request per original line in this build.</p>
    </Panel>
  );
}
