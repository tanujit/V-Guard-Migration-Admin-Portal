import { useState } from "react";
import { Plus, Power, Save, Send, ShieldOff } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { StatusBadge } from "@/components/ui/primitives";
import { Checkbox, MultiSelect, SelectInput, Tabs, TextField } from "@/components/form/Form";
import { useMasterState } from "@/features/masters/store";
import { activateRule, deactivateRule, globalImpact, requestGlobalRestriction, ruleServiceEvaluate, saveRule, submitRule } from "@/features/risk/store";
import type { AnomalyRule, GlobalRestriction, Period, RuleKind } from "@/types/risk";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { stateOptions } from "@/pages/masters/shared";
import { BcrTag, DecisionRef, EventStatus, FBASE, SimTag, SourceTag, approvalLink, caseLink, dt, memberLink, memberName, useFraudView, useParam, useRun, userName, type FraudView } from "./shared";
import { Link } from "react-router-dom";

const KIND: Record<RuleKind, string> = { redemption: "Redemption", scan_in: "Scan-In", scan_out: "Scan-Out" };
const PERIODS: Period[] = ["hour", "day", "week", "month"];
const RuleBadge = ({ r }: { r: AnomalyRule }) => <span className="btn-row"><StatusBadge tone={r.status === "active" ? "positive" : r.status === "pending_approval" ? "warning" : r.status === "rejected" ? "negative" : "neutral"}>{r.status === "approved_inactive" ? "Approved · inactive" : r.status.replace("_", " ")}</StatusBadge>{r.demo && <span className="risk-sim">Demo configuration</span>}</span>;

/* ======================= Rule configuration (9.3, AF21) ======================= */

export function RiskRulesPage() {
  const v = useFraudView();
  const ms = useMasterState();
  const [tab, setTab] = useParam("tab", "scan_in");
  const [edit, setEdit] = useState<AnomalyRule | null>(null);
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const kind = (tab === "global" ? "scan_in" : tab) as RuleKind;
  const rows = v.rs.rules.filter((r) => r.kind === kind);
  const blank = (k: RuleKind): AnomalyRule => ({ id: "", kind: k, name: "", programme: "EP", memberType: null, categoryId: null, skuId: null, states: [], unit: k === "redemption" ? "redemptions" : "scans", limits: { hour: null, day: null, week: null, month: null }, effectiveFrom: v.now.slice(0, 10), effectiveTo: null, autoFlag: true, demo: true, status: "draft", version: 1, replaces: null, approvalRequestId: null, history: [], updatedBy: v.uid, updatedAt: "" });
  const op02 = v.rs.decisions.find((d) => d.id === "OP-02")!;
  return (
    <>
      <SectionTitle title="Risk rule configuration" description="Rule-based checks for redemption, Scan-In and Scan-Out by day, week and month, with category-level scan-rate controls by hour (SOW 9.2, 9.3, AF21). Rules configure the backend rule service; the portal does not detect fraud itself" actions={tab !== "global" && v.can("fraud-rules:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(blank(kind))}><Plus size={14} aria-hidden="true" />New {KIND[kind]} rule</button>} />
      <Notice tone="warn">Thresholds are open under <DecisionRef id="OP-02" /> ({op02.status.replace("_", " ")}). Values here are <strong>Demo configuration</strong>: they can be drafted and approved as configuration, but a rule activates only after OP-02 is confirmed and business-supplied values replace the demo values.</Notice>
      <PolicyMessages result={result} />
      <Tabs label="Rule type" value={tab} onChange={setTab} tabs={[{ id: "scan_in", label: "Scan-In", count: v.rs.rules.filter((r) => r.kind === "scan_in").length }, { id: "scan_out", label: "Scan-Out", count: v.rs.rules.filter((r) => r.kind === "scan_out").length }, { id: "redemption", label: "Redemption", count: v.rs.rules.filter((r) => r.kind === "redemption").length }, { id: "global", label: "Global block rules", count: v.rs.globals.length }]} />
      {tab === "global" ? <GlobalRules v={v} /> : (
        <>
          <Panel title={`${KIND[kind]} thresholds`} subtitle="Side-by-side periods make limits easy to compare" padded={false}>
            <DataTable rows={rows} rowKey={(r) => r.id} caption={`${KIND[kind]} rules`} searchable={false} onRowClick={(r) => v.can("fraud-rules:edit") && setEdit(structuredClone(r))} columns={[
              { key: "id", header: "Rule", value: (r) => `${r.id} v${r.version}`, render: (r) => <span className="mono small">{r.id} v{r.version}</span> },
              { key: "n", header: "Name", value: (r) => r.name },
              { key: "p", header: "Programme", value: (r) => r.programme ?? "All" },
              { key: "c", header: "Category", value: (r) => r.categoryId ?? "", render: (r) => <span className="small">{r.categoryId ? ms.categories.find((c) => c.id === r.categoryId)?.name ?? r.categoryId : "All"}</span> },
              ...PERIODS.map((p) => ({ key: p, header: p === "hour" ? "Hourly" : p === "day" ? "Daily" : p === "week" ? "Weekly" : "Monthly", value: (r: AnomalyRule) => r.limits[p], render: (r: AnomalyRule) => <span className="num">{r.limits[p] ?? "—"}</span>, align: "right" as const })),
              { key: "u", header: "Unit", value: (r) => r.unit },
              { key: "e", header: "Effective", value: (r) => r.effectiveFrom, render: (r) => <span className="small">{r.effectiveFrom} – {r.effectiveTo ?? "open"}</span> },
              { key: "af", header: "Auto-flag", value: (r) => (r.autoFlag ? "Yes" : "No") },
              { key: "s", header: "Status", value: (r) => r.status, render: (r) => <RuleBadge r={r} /> },
              { key: "a", header: "Approval", value: (r) => r.approvalRequestId ?? "", render: (r) => approvalLink(r.approvalRequestId) },
              { key: "x", header: "", value: () => "", render: (r) => <span className="btn-row" onClick={(e) => e.stopPropagation()}>
                {r.status === "draft" && v.can("fraud-rules:submit") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(submitRule(v.uid, r.id), "Submitted for approval")}><Send size={12} aria-hidden="true" />Submit</button>}
                {(r.status === "approved_inactive" || r.status === "inactive") && v.can("fraud-rules:execute") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(activateRule(v.uid, r.id, reason || "Activation"), "Rule activated")}>Activate</button>}
                {r.status === "active" && v.can("fraud-rules:disable") && <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(deactivateRule(v.uid, r.id, reason || "Deactivation"), "Rule deactivated")}><Power size={12} aria-hidden="true" />Deactivate</button>}
              </span> },
            ]} />
          </Panel>
          <TextField label="Reason for activation changes" value={reason} onChange={setReason} hint="Activation is refused while OP-02 is open or the values are demo configuration" />
          <RuleSimulator v={v} rows={rows} />
        </>
      )}
      {edit && <RuleDrawer v={v} r={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RuleSimulator({ v, rows }: { v: FraudView; rows: AnomalyRule[] }) {
  const [ruleId, setRuleId] = useState(rows[0]?.id ?? "");
  const [member, setMember] = useState("");
  const [counts, setCounts] = useState<Record<Period, string>>({ hour: "", day: "", week: "", month: "" });
  const [out, setOut] = useState<string | null>(null);
  const { result, run } = useRun();
  if (!rows.length) return null;
  return (
    <Panel title="Mock rule service" subtitle="Development control: sends reported activity to the mock rule service. Only an active, auto-flagging rule adds a risk event">
      <div className="form-row">
        <SelectInput label="Rule" value={ruleId} onChange={setRuleId} options={rows.map((r) => ({ value: r.id, label: `${r.id} v${r.version} · ${r.name}` }))} />
        <TextField label="Member ID" value={member} onChange={setMember} />
      </div>
      <div className="form-row">{PERIODS.map((p) => <TextField key={p} label={`Observed per ${p}`} value={counts[p]} onChange={(x) => setCounts({ ...counts, [p]: x })} inputMode="numeric" />)}</div>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const r = run(ruleServiceEvaluate(ruleId, member.trim(), Object.fromEntries(PERIODS.filter((p) => counts[p]).map((p) => [p, Number(counts[p])])), v.now), "Evaluated"); if (r.ok) setOut(r.flagged ? `Flagged ${r.id}` : r.exceeded?.length ? `Exceeded ${r.exceeded.map((x) => x.period).join(", ")} (not flagged)` : "Within limits"); }}>Evaluate</button>
      {out && <p className="small">{out}</p>}
      <PolicyMessages result={result} />
    </Panel>
  );
}

function RuleDrawer({ v, r, onClose }: { v: FraudView; r: AnomalyRule; onClose: () => void }) {
  const ms = useMasterState();
  const [f, setF] = useState(r);
  const [reason, setReason] = useState("");
  const { result, run } = useRun();
  const set = (p: Partial<AnomalyRule>) => setF({ ...f, ...p });
  const isNewVersion = r.id && r.status !== "draft" && r.status !== "rejected";
  return (
    <Drawer open onClose={onClose} title={r.id ? (isNewVersion ? `New version of ${r.id}` : `Edit ${r.id}`) : `New ${KIND[f.kind]} rule`} subtitle="Saved as a draft; approval records configuration only" footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button><button type="button" className="btn btn--primary btn--sm" disabled={r.status === "pending_approval"} onClick={() => { if (run(saveRule(v.uid, f, reason), "Draft saved").ok) onClose(); }}><Save size={14} aria-hidden="true" />Save draft</button></div>}>
      <TextField label="Rule name" value={f.name} onChange={(x) => set({ name: x })} required />
      <SelectInput label="Programme" value={f.programme ?? ""} onChange={(x) => set({ programme: (x || null) as AnomalyRule["programme"] })} options={[{ value: "", label: "All programmes" }, ...["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))]} />
      <TextField label="Member type" value={f.memberType ?? ""} onChange={(x) => set({ memberType: x || null })} hint="Where applicable" />
      {f.kind !== "redemption" && <SelectInput label="Product category" value={f.categoryId ?? ""} onChange={(x) => set({ categoryId: x || null })} options={[{ value: "", label: "All categories" }, ...ms.categories.map((c) => ({ value: c.id, label: c.name }))]} />}
      <MultiSelect label="Geographical scope (states)" options={stateOptions()} value={f.states} onChange={(x) => set({ states: x })} placeholder="All states" />
      <SelectInput label="Unit" value={f.unit} onChange={(x) => set({ unit: x as AnomalyRule["unit"] })} options={(f.kind === "redemption" ? ["redemptions", "points"] : ["scans", "units"]).map((u) => ({ value: u, label: u }))} />
      <div className="form-row">{PERIODS.filter((p) => f.kind !== "redemption" || p !== "hour").map((p) => <TextField key={p} label={`${p === "hour" ? "Hourly (category controls)" : p === "day" ? "Daily" : p === "week" ? "Weekly" : "Monthly"} limit`} value={f.limits[p] == null ? "" : String(f.limits[p])} onChange={(x) => set({ limits: { ...f.limits, [p]: x ? Number(x) : null } })} inputMode="numeric" />)}</div>
      <div className="form-row">
        <TextField label="Effective start" type="date" value={f.effectiveFrom} onChange={(x) => set({ effectiveFrom: x })} />
        <TextField label="Effective end" type="date" value={f.effectiveTo ?? ""} onChange={(x) => set({ effectiveTo: x || null })} />
      </div>
      <Checkbox label="Auto-flag to the review queue" checked={f.autoFlag} onChange={(x) => set({ autoFlag: x })} />
      <Checkbox label="Demo configuration (development values)" checked={f.demo} onChange={(x) => set({ demo: x })} description="Clearing this needs OP-02 confirmed: business-supplied values only" />
      <TextField label="Reason" value={reason} onChange={setReason} />
      <PolicyMessages result={result} />
    </Drawer>
  );
}

function GlobalRules({ v }: { v: FraudView }) {
  const { result, run } = useRun();
  const [open, setOpen] = useState<GlobalRestriction | null>(null);
  return (
    <>
      <Notice tone="danger">Global blocks stop scanning or redemption for whole programmes. They cannot be toggled: each change needs Fraud & risk rules: Execute, an impact preview, a mandatory reason and V-Guard approval (WF-035). Automatic trigger conditions are not defined by the SOW and are not invented.</Notice>
      <PolicyMessages result={result} />
      <Panel title="Global restriction policy" padded={false}>
        <DataTable rows={v.rs.globals} rowKey={(g) => g.id} caption="Global restrictions" searchable={false} columns={[
          { key: "id", header: "Policy", value: (g) => g.id },
          { key: "t", header: "Restriction type", value: (g) => (g.type === "block_all_scan" ? "Block all scanning" : "Redemption block") },
          { key: "p", header: "Programmes", value: (g) => g.programmes.join(", ") || "—" },
          { key: "c", header: "Trigger conditions", value: (g) => g.triggerConditions, render: (g) => <span className="small">{g.triggerConditions}</span> },
          { key: "s", header: "Effective status", value: (g) => g.status, render: (g) => <StatusBadge tone={g.status === "active" ? "negative" : g.status.startsWith("pending") ? "warning" : "neutral"}>{g.status.replace("_", " ")}</StatusBadge> },
          { key: "ab", header: "Approved by", value: (g) => g.approvedBy ?? "", render: (g) => (g.approvedBy ? userName(v.acc, g.approvedBy) : "—") },
          { key: "a", header: "Approval", value: (g) => g.approvalRequestId ?? "", render: (g) => approvalLink(g.approvalRequestId) },
          { key: "x", header: "", value: () => "", render: (g) => (v.can("fraud-rules:execute") && !g.status.startsWith("pending") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => setOpen(g)}><ShieldOff size={12} aria-hidden="true" />{g.status === "active" ? "Request deactivation" : "Request activation"}</button> : null) },
        ]} />
      </Panel>
      <Panel title="Change history">
        <ul className="activity-list">{v.rs.globals.flatMap((g) => g.history.map((h, k) => <li key={`${g.id}-${k}`} className="small"><span className="mono">{g.id}</span> {h.action.replace(/_/g, " ")} · {h.detail} <span className="muted">{dt(h.at)} · {userName(v.acc, h.by)}</span> {approvalLink(h.approvalRequestId)}</li>))}</ul>
      </Panel>
      {open && <GlobalDrawer v={v} g={open} onClose={() => setOpen(null)} run={run} />}
    </>
  );
}

function GlobalDrawer({ v, g, onClose, run }: { v: FraudView; g: GlobalRestriction; onClose: () => void; run: ReturnType<typeof useRun>["run"] }) {
  const target = g.status === "active" ? "inactive" : "active";
  const [progs, setProgs] = useState<string[]>(g.programmes);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const local = useRun();
  const impact = globalImpact(target === "active" ? progs : g.programmes);
  return (
    <Drawer open onClose={onClose} title={`${target === "active" ? "Activate" : "Deactivate"} ${g.type === "block_all_scan" ? "Block all scanning" : "Redemption block"}`} subtitle="Sensitive action: Maker-Checker" footer={<div className="btn-row"><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button><button type="button" className="btn btn--danger btn--sm" onClick={() => { const r = local.run(requestGlobalRestriction(v.uid, g.id, target, progs, reason, ack), "Submitted for approval"); if (r.ok) { run(r, "Submitted for approval"); onClose(); } }}>Submit for approval</button></div>}>
      {target === "active" && <MultiSelect label="Programmes" options={["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))} value={progs} onChange={setProgs} required />}
      <div className="review-card small"><strong>Impact preview</strong>{impact.map((i) => <div key={i.programme}>{i.programme}: {i.members} members would {target === "active" ? "lose" : "regain"} {g.type === "block_all_scan" ? "scanning" : "redemption"}</div>)}{!impact.length && <div>Choose programmes</div>}</div>
      <Checkbox label="I have reviewed the impact preview" checked={ack} onChange={setAck} />
      <TextField label="Reason (mandatory)" value={reason} onChange={setReason} />
      <PolicyMessages result={local.result} />
    </Drawer>
  );
}

/* ======================= Predictive anomaly monitoring (AF02) ======================= */

export function AnomalyPage() {
  const v = useFraudView();
  const [src, setSrc] = useParam("source");
  const evs = v.rs.events.filter((e) => e.vector === "scan_rate" && (!src || e.source === src));
  const combined = new Set(v.rs.events.filter((e) => e.memberId && v.rs.events.some((x) => x.memberId === e.memberId && x.id !== e.id && x.source !== e.source)).map((e) => e.memberId));
  return (
    <>
      <SectionTitle title="Anomaly detection" description="Predictive scan-count monitoring (AF02) next to rule-based flags. Both feed the same review queue; a predictive flag is never confirmed fraud and never imposes a restriction" />
      <Notice tone="warn">Predictive results are <strong>simulated development outputs</strong> of a service contract (expected count, observed count, deviation, window, model reference). No model is trained or operational, and the portal computes no forecast. The rule-plus-predictive versus custom ML decision is open (<DecisionRef id="OP-02" />).</Notice>
      <Panel title="Predictive results" subtitle="Values as supplied by the prediction service contract" padded={false}>
        <DataTable rows={v.rs.predictive} rowKey={(p) => p.id} caption="Predictive anomaly results" searchable={false} columns={[
          { key: "id", header: "Result", value: (p) => p.id, render: (p) => <span className="mono small">{p.id} <SimTag /></span> },
          { key: "m", header: "Member", value: (p) => p.memberId, render: (p) => <span>{memberLink(p.memberId)} <span className="small">{memberName(v.mem, p.memberId)}</span></span> },
          { key: "p", header: "Programme", value: (p) => p.programme },
          { key: "e", header: "Expected scans", value: (p) => p.expected, align: "right" },
          { key: "o", header: "Observed scans", value: (p) => p.observed, align: "right" },
          { key: "d", header: "Deviation", value: (p) => p.deviation },
          { key: "w", header: "Prediction window", value: (p) => p.window },
          { key: "at", header: "Detected", value: (p) => p.detectedAt, render: (p) => <span className="small">{dt(p.detectedAt)}</span> },
          { key: "mr", header: "Model / rule reference", value: (p) => p.modelRef, render: (p) => <span className="small">{p.modelRef}</span> },
          { key: "s", header: "Anomaly status", value: (p) => p.status, render: (p) => <StatusBadge tone={p.status === "flagged" ? "warning" : p.status === "confirmed" ? "negative" : "neutral"}>{p.status.replace("_", " ")}</StatusBadge> },
          { key: "r", header: "Review reference", value: (p) => p.riskEventId ?? "", render: (p) => <span className="mono small">{p.riskEventId ?? "—"}</span> },
        ]} />
      </Panel>
      <Panel title="Rule-based and predictive signals" actions={<select className="select select--xs" aria-label="Source filter" value={src} onChange={(e) => setSrc(e.target.value)}><option value="">All sources</option><option value="rule">Rule-based</option><option value="predictive">Predictive</option></select>} padded={false}>
        <DataTable rows={evs} rowKey={(e) => e.id} caption="Scan-rate signals" searchable={false} columns={[
          { key: "id", header: "Event", value: (e) => e.id },
          { key: "m", header: "Member", value: (e) => e.memberId ?? "", render: (e) => memberLink(e.memberId) },
          { key: "s", header: "Source", value: (e) => e.source, render: (e) => <span className="btn-row"><SourceTag s={e.source} />{e.memberId && combined.has(e.memberId) && <span className="risk-sim">Combined signals</span>}</span> },
          { key: "c", header: "Context", value: (e) => e.context, render: (e) => <span className="small">{e.context}</span> },
          { key: "st", header: "Status", value: (e) => e.status, render: (e) => <EventStatus s={e.status} /> },
          { key: "case", header: "Case", value: (e) => e.caseId ?? "", render: (e) => caseLink(e.caseId) },
        ]} />
      </Panel>
      <p className="small"><Link to={`${FBASE}/queue?source=predictive`}>Open predictive signals in the review queue</Link></p>
    </>
  );
}

/* ======================= Scan rate controls (9.2) ======================= */

export function ScanRatePage() {
  const v = useFraudView();
  const ms = useMasterState();
  const cat = v.rs.rules.filter((r) => r.categoryId);
  const flags = v.rs.events.filter((e) => e.vector === "scan_rate" && e.source === "rule");
  return (
    <>
      <SectionTitle title="Scan rate controls" description="Per-member scan-rate limits by product category and hour, day, week or month (SOW 9.1 bot / automated scanning). Limits detect abnormal volume and flag members for review; the cap examples in the SOW are illustrative and no category threshold is assumed" />
      <Notice tone="warn"><BcrTag>Thresholds not confirmed (OP-02)</BcrTag> Category controls are configured on the <Link to={`${FBASE}/rules?tab=scan_in`}>Risk rules</Link> page and stay inactive until confirmed.</Notice>
      <Panel title="Category-level rate policies" padded={false}>
        <DataTable rows={cat} rowKey={(r) => r.id} caption="Category rate policies" searchable={false} columns={[
          { key: "id", header: "Rule", value: (r) => r.id },
          { key: "k", header: "Scan type", value: (r) => KIND[r.kind] },
          { key: "p", header: "Programme", value: (r) => r.programme ?? "All" },
          { key: "c", header: "Category", value: (r) => ms.categories.find((c) => c.id === r.categoryId)?.name ?? r.categoryId ?? "" },
          { key: "sku", header: "SKU", value: (r) => r.skuId ?? "All" },
          ...PERIODS.map((p) => ({ key: p, header: `Max / ${p}`, value: (r: AnomalyRule) => r.limits[p], render: (r: AnomalyRule) => <span className="num">{r.limits[p] ?? "—"}</span>, align: "right" as const })),
          { key: "e", header: "Effective", value: (r) => r.effectiveFrom },
          { key: "s", header: "Status", value: (r) => r.status, render: (r) => <RuleBadge r={r} /> },
        ]} />
      </Panel>
      <Panel title="Scan-rate flags from the backend rule service" padded={false}>
        <DataTable rows={flags} rowKey={(e) => e.id} caption="Scan-rate flags" searchable={false} columns={[
          { key: "id", header: "Event", value: (e) => e.id },
          { key: "m", header: "Member", value: (e) => e.memberId ?? "", render: (e) => memberLink(e.memberId) },
          { key: "p", header: "Programme", value: (e) => e.programme ?? "" },
          { key: "c", header: "Signal", value: (e) => e.context, render: (e) => <span className="small">{e.context} · {Object.entries(e.signal).map(([k, x]) => `${k}: ${x}`).join(" · ")}</span> },
          { key: "d", header: "Detected", value: (e) => e.detectedAt, render: (e) => <span className="small">{dt(e.detectedAt)}</span> },
          { key: "s", header: "Status", value: (e) => e.status, render: (e) => <EventStatus s={e.status} /> },
        ]} />
      </Panel>
    </>
  );
}
