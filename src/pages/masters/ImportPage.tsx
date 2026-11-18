import { useState } from "react";
import { Download, FileCheck2, FileSpreadsheet, Upload } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { RadioCards, Stepper } from "@/components/form/Form";
import { FigureRow } from "@/components/ui/DataBars";
import { IMPORT_TEMPLATES } from "@/config/scanCatalogue";
import { useToast } from "@/context/ToastContext";
import { demoNow } from "@/features/approvals/store";
import { parseCsv, validateImport, type ImportCheck } from "@/features/masters/engine";
import { masterStore, runImport } from "@/features/masters/store";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import type { ImportBatch, ImportIssue, ImportKind } from "@/types/masters";
import { AccessDenied, PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { useMasterView, userName } from "./shared";

const STEPS = ["Template", "Upload", "Validate", "Preview", "Import", "Summary"];

function downloadTemplate(kind: ImportKind) {
  const header = IMPORT_TEMPLATES[kind].map((f) => f.field).join(",");
  const blob = new Blob(["﻿" + header + "\r\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${kind}-master-template.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Development sample with valid and invalid rows (scenario B). Clearly labelled; codes use DEV-. */
function sampleFile(kind: ImportKind) {
  if (kind === "product")
    return [
      "product_code,product_name,description,category_code,sub_category_code,status,warranty_value,warranty_unit,installation_required",
      "DEV-FAN-101,BLDC ceiling fan 900 mm,Development sample,FANS,FANS_CEILING_FANS,active,2,years,yes",
      "DEV-PUM-102,Domestic pump 1 HP,Development sample,PUMPS,PUMPS_DOMESTIC_PUMPS,active,1,years,yes",
      "DEV-WIR-103,FR house wire 4.0 sq mm,,WIRES,WIRES_HOUSE_WIRES,draft,,,no",
      "DEV-FAN-101,Duplicate row in the same file,,FANS,FANS_PEDESTAL_FANS,active,1,years,no",
      "DEV-WIR-001,Code already in the master,,WIRES,WIRES_HOUSE_WIRES,active,,,no",
      "DEV-STA-104,Stabilizer with wrong sub-category,,STABILIZERS,FANS_CEILING_FANS,active,3,years,no",
      "DEV-SOL-105,Solar unit unknown category,,SOLAR_PANELS,SOLAR_SOLAR_INVERTERS,active,2,years,yes",
      "DEV-INV-106,Inverter bad status,,INVERTERS,INVERTERS_INVERTERS,enabled,2,years,maybe",
      ",Missing product code,,WIRES,WIRES_FLEXIBLE_CABLES,active,1,decades,no",
    ].join("\n");
  return [
    "sku_code,product_code,sku_name,status,programmes",
    "DEV-WIR-001-C,DEV-WIR-001,FR house wire 1.0 sq mm · 270 m coil,active,EP|Retailer",
    "DEV-FAN-013-B,DEV-FAN-013,BLDC ceiling fan · Bluetooth,active,Retailer|DD",
    "DEV-WIR-001-A,DEV-WIR-001,Code already in the master,active,EP",
    "DEV-XYZ-999-A,DEV-XYZ-999,Unknown product,active,EP",
    "DEV-PUM-016-B,DEV-PUM-016,Unknown programme,active,EP|Rural",
    "DEV-PUM-017-B,DEV-PUM-017,No programmes yet,draft,",
  ].join("\n");
}

export function BulkImportPage() {
  const { s, acc, can, uid } = useMasterView();
  const { notify } = useToast();
  const [step, setStep] = useState(0);
  const [max, setMax] = useState(0);
  const [kind, setKind] = useState<ImportKind>("product");
  const [file, setFile] = useState<{ name: string; sizeKb: number; at: string; text: string } | null>(null);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [mode, setMode] = useState<"valid_only" | "atomic">("valid_only");
  const [confirm, setConfirm] = useState(false);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [err, setErr] = useState<string[]>([]);
  if (!can("products:create")) return <AccessDenied message="Bulk import needs Product & SKU master: Create." />;
  const go = (i: number) => { setStep(i); setMax((m) => Math.max(m, i)); };
  const tpl = IMPORT_TEMPLATES[kind];
  const load = (name: string, text: string, size: number) => {
    const clean = text.replace(/^﻿/, "");
    setFile({ name, sizeKb: Math.max(1, Math.round(size / 1024)), at: demoNow(), text: clean });
    setCheck(null);
    setBatch(null);
    setErr([]);
  };
  const rowsOf = (text: string) => {
    const rows = parseCsv(text);
    // Exports from this portal start with a demo-data note line; skip it if present.
    return rows[0]?.length === 1 && /demo data/i.test(rows[0][0]) ? rows.slice(1) : rows;
  };
  const validate = () => {
    if (!file) return;
    const rows = rowsOf(file.text);
    if (rows.length < 2) return setErr(["The file has no data rows"]);
    setCheck(validateImport(s, kind, rows, tpl.filter((f) => f.required).map((f) => f.field), tpl.map((f) => f.field)));
    go(3);
  };
  const errors = check?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = check?.issues.filter((i) => i.severity === "warning") ?? [];
  const invalid = check ? check.records.length - check.validRows.length : 0;
  const issueCols: Column<ImportIssue>[] = [
    { key: "row", header: "Row", value: (i) => i.row, align: "right" },
    { key: "code", header: kind === "product" ? "Product code" : "SKU code", value: (i) => i.code, render: (i) => <span className="mono small">{i.code}</span> },
    { key: "field", header: "Field", value: (i) => i.field, render: (i) => <span className="mono small">{i.field}</span> },
    { key: "type", header: "Error type", value: (i) => i.type, render: (i) => <StatusBadge tone={i.severity === "error" ? "negative" : "warning"}>{i.type}</StatusBadge> },
    { key: "msg", header: "Description", value: (i) => i.message, render: (i) => <span className="small cell-wrap">{i.message}</span> },
  ];
  return (
    <div className="wizard">
      <SectionTitle title="Bulk import" description="Mock import into this browser's development store. Nothing is written to the V-Guard database" />
      <Stepper steps={STEPS} current={step} onSelect={go} maxReached={max} />
      <Panel level={3} title={STEPS[step]}>
        {step === 0 && (
          <>
            <RadioCards name="kind" label="What are you importing?" value={kind} onChange={(v) => { setKind(v as ImportKind); setFile(null); setCheck(null); }} options={[{ value: "product", label: "Product master", description: "One row per product" }, { value: "sku", label: "SKU master", description: "One row per SKU; product_code links it to its product, so no separate mapping file is needed" }]} />
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Template fields</caption>
                <thead><tr><th scope="col">Field</th><th scope="col">Required</th><th scope="col">Format</th><th scope="col">Allowed values / reference</th></tr></thead>
                <tbody>{tpl.map((f) => <tr key={f.field}><td className="mono small">{f.field}</td><td>{f.required ? "Mandatory" : "Optional"}</td><td className="small">{f.format}</td><td className="small">{f.allowed || "—"}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="small muted">The template holds only SOW-listed attributes. No price, MRP, stock, tax or margin fields. Unique identifiers: {kind === "product" ? "product_code" : "sku_code"}.</p>
            <div className="btn-row">
              <button type="button" className="btn btn--secondary" onClick={() => downloadTemplate(kind)}><Download size={16} strokeWidth={2} aria-hidden="true" />Download {kind === "product" ? "product" : "SKU"} template</button>
              <button type="button" className="btn btn--dark" onClick={() => go(1)}>Next: upload</button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="btn-row">
              <label className="btn btn--primary file-btn">
                <Upload size={16} strokeWidth={2} aria-hidden="true" />
                Choose CSV file
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then((t) => load(f.name, t, f.size)); }} />
              </label>
              <button type="button" className="btn btn--secondary" onClick={() => { const t = sampleFile(kind); load(`dev-sample-${kind}s.csv`, t, t.length); }}><FileSpreadsheet size={16} strokeWidth={2} aria-hidden="true" />Use development sample file</button>
            </div>
            {file && (
              <dl className="kv kv--tight">
                <div className="kv__row"><dt>File name</dt><dd className="mono small">{file.name}</dd></div>
                <div className="kv__row"><dt>File size</dt><dd>{file.sizeKb} KB</dd></div>
                <div className="kv__row"><dt>Upload time</dt><dd>{formatDateTime(file.at)}</dd></div>
                <div className="kv__row"><dt>Uploaded by</dt><dd>{userName(acc, uid)}</dd></div>
                <div className="kv__row"><dt>Record count</dt><dd>{Math.max(0, rowsOf(file.text).length - 1)}</dd></div>
              </dl>
            )}
            <PolicyMessages result={{ errors: err, warnings: [] }} />
            <div className="btn-row"><button type="button" className="btn btn--dark" disabled={!file} onClick={() => go(2)}>Next: validate</button></div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="small">Checks: required fields, formats, duplicate codes (in the file and against the master), product, category and sub-category references, allowed values and status.</p>
            <div className="btn-row"><button type="button" className="btn btn--primary" disabled={!file} onClick={validate}><FileCheck2 size={16} strokeWidth={2} aria-hidden="true" />Validate {file?.name}</button></div>
          </>
        )}
        {step === 3 && check && (
          <>
            <FigureRow items={[{ label: "Total records", value: String(check.records.length) }, { label: "Valid", value: String(check.validRows.length), tone: "positive" }, { label: "Invalid", value: String(invalid), tone: invalid ? "negative" : undefined }, { label: "Duplicates", value: String(check.duplicateRows.length) }, { label: "Warnings", value: String(warnings.length) }]} />
            <DataTable rows={check.issues} columns={issueCols} rowKey={(i) => `${i.row}-${i.field}-${i.message}`} caption="Validation results" searchPlaceholder="Search issues" pageSize={10} emptyTitle="No issues found" initialSort={{ key: "row", dir: "asc" }} />
            <div className="btn-row">
              <button type="button" className="btn btn--secondary" disabled={!check.issues.length} onClick={() => downloadCsv(`${kind}-import-validation`, [{ header: "Row", value: (i: ImportIssue) => i.row }, { header: "Code", value: (i) => i.code }, { header: "Field", value: (i) => i.field }, { header: "Error type", value: (i) => i.type }, { header: "Severity", value: (i) => i.severity }, { header: "Description", value: (i) => i.message }], check.issues)}><Download size={16} strokeWidth={2} aria-hidden="true" />Download error report</button>
              <button type="button" className="btn btn--dark" onClick={() => go(4)}>Next: import</button>
            </div>
          </>
        )}
        {step === 4 && check && (
          <>
            <RadioCards name="mode" label="Import mode" value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: "valid_only", label: "Import valid records only", description: `${check.validRows.length} valid rows are imported; ${invalid} invalid rows are rejected and listed in the summary` }, { value: "atomic", label: "All or nothing", description: invalid ? `The whole batch is rejected because ${invalid} row(s) are invalid` : "Imports every row, or none if any row fails" }]} />
            {errors.length > 0 && mode === "valid_only" && <Notice tone="warn">Invalid records are never imported silently. They are rejected and reported.</Notice>}
            <div className="btn-row"><button type="button" className="btn btn--primary" onClick={() => setConfirm(true)}>Process import</button></div>
          </>
        )}
        {step === 5 && batch && <BatchSummary b={batch} />}
      </Panel>
      <ConfirmDialog
        open={confirm}
        title="Process import?"
        confirmLabel="Process"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          const out = runImport(uid, kind, { fileName: file!.name, sizeKb: file!.sizeKb }, check!, mode);
          notify(out.ok ? `Import ${out.id} processed (mock)` : out.errors[0], out.ok ? "positive" : "negative");
          setBatch(masterStore.get().imports.find((x) => x.id === out.id) ?? null);
          go(5);
        }}
        body={<p>{mode === "atomic" && invalid ? "The batch will be rejected because it contains invalid rows." : `${check?.validRows.length ?? 0} record(s) will be created in the development store. ${invalid} will be rejected.`}</p>}
      />
    </div>
  );
}

function BatchSummary({ b }: { b: ImportBatch }) {
  const { acc } = useMasterView();
  return (
    <dl className="kv kv--wide">
      {[["Import reference", b.id], ["Type", b.kind === "product" ? "Product master" : "SKU master"], ["File", b.fileName], ["Uploaded by", userName(acc, b.uploadedBy)], ["Mode", b.mode === "atomic" ? "All or nothing" : "Valid records only"], ["Total records", b.total], ["Successfully imported", b.imported], ["Rejected", b.rejected], ["Skipped", b.skipped], ["Import status", b.status], ["Completed", formatDateTime(b.completedAt)]].map(([k, v]) => (
        <div key={String(k)} className="kv__row"><dt>{k}</dt><dd>{k === "Import status" ? <StatusBadge tone={b.status === "completed" ? "positive" : b.status === "partial" ? "warning" : "negative"}>{String(v)}</StatusBadge> : String(v)}</dd></div>
      ))}
      <div className="kv__row"><dt>Note</dt><dd className="small muted">Mock processing in this browser. Nothing was imported into the production V-Guard database.</dd></div>
    </dl>
  );
}

export function ImportHistoryPage() {
  const { s, acc } = useMasterView();
  const [open, setOpen] = useState<ImportBatch | null>(null);
  const cols: Column<ImportBatch>[] = [
    { key: "id", header: "Import reference", value: (b) => b.id, render: (b) => <span className="mono small">{b.id}</span> },
    { key: "kind", header: "Type", value: (b) => b.kind },
    { key: "file", header: "File", value: (b) => b.fileName, render: (b) => <span className="mono small">{b.fileName}</span> },
    { key: "by", header: "Uploaded by", value: (b) => userName(acc, b.uploadedBy) },
    { key: "total", header: "Total", value: (b) => b.total, align: "right" },
    { key: "ok", header: "Imported", value: (b) => b.imported, align: "right" },
    { key: "rej", header: "Rejected", value: (b) => b.rejected, align: "right" },
    { key: "status", header: "Status", value: (b) => b.status, render: (b) => <StatusBadge tone={b.status === "completed" ? "positive" : b.status === "partial" ? "warning" : "negative"}>{b.status}</StatusBadge> },
    { key: "at", header: "Completed", value: (b) => b.completedAt, render: (b) => <span className="small num">{formatDateTime(b.completedAt)}</span> },
  ];
  return (
    <>
      <SectionTitle title="Import history" description="Every bulk import batch with its validation report" />
      <Panel padded={false}>
        <DataTable rows={s.imports} columns={cols} rowKey={(b) => b.id} caption="Import history" searchPlaceholder="Search imports" emptyTitle="No imports yet" onRowClick={setOpen} rowActionLabel={(b) => `Open ${b.id}`} initialSort={{ key: "at", dir: "desc" }} />
      </Panel>
      {open && (
        <Panel level={3} title={`${open.id} · summary`} actions={<button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(null)}>Close</button>}>
          <BatchSummary b={open} />
          {open.issues.length > 0 && <p className="small muted">{open.issues.length} validation issue(s) were recorded for this batch.</p>}
        </Panel>
      )}
    </>
  );
}
