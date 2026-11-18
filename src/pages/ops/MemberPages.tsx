import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Download, KeyRound, Search, ShieldX, Smartphone, UserX, Users, XCircle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { RankedBars } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { TrendChart } from "@/components/charts/Charts";
import { SelectInput, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { adoptionRows, authEvents, exportAdoption, exportAuth, floatData, floatView, kittySummary, memberDiagnostic, setDormancy, setFloatThreshold } from "@/features/ops/store";
import { filterAuth } from "@/features/ops/engine";
import { KpiGrid } from "@/pages/masters/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, DerivedTag, Fig, RunBadge, dt, inr, memberLink, useOpsView, useParam, useRun } from "./shared";

/* ======================= Authentication audit ======================= */

const REASON: Record<string, string> = { wrong_mpin: "Wrong MPIN", blocked_user: "Blocked user", device_blacklisted: "Blacklisted device" };

export function AuthenticationPage() {
  const v = useOpsView();
  const { result, run } = useRun();
  const [res, setRes] = useParam("result", "");
  const [reason, setReason] = useParam("reason", "");
  const [prog, setProg] = useParam("programme", "");
  const [branch, setBranch] = useParam("branch", "");
  const [ver, setVer] = useParam("version", "");
  const [dev, setDev] = useParam("device", "");
  const [os, setOs] = useParam("os", "");
  const all = authEvents(v.uid).rows ?? [];
  const rows = filterAuth(all, { result: res, reason, programme: prog, branch, appVersion: ver, deviceModel: dev, os }).sort((a, b) => b.at.localeCompare(a.at));
  const opts = (f: (a: (typeof all)[number]) => string) => [{ value: "", label: "All" }, ...[...new Set(all.map(f))].sort().map((x) => ({ value: x, label: x }))];
  const sens = v.can("auth-audit:view_sensitive");
  const exportRows = () => {
    const r = run(exportAuth(v.uid, rows.length), "Export recorded");
    if (r.ok) downloadCsv("authentication-audit", [{ header: "Event", value: (a: (typeof rows)[number]) => a.id }, { header: "Member", value: (a) => a.memberId }, { header: "Programme", value: (a) => a.programme }, { header: "Branch", value: (a) => a.branchCode }, { header: "At", value: (a) => a.at }, { header: "Result", value: (a) => a.result }, { header: "Reason", value: (a) => (a.reason ? REASON[a.reason] : "") }, { header: "App version", value: (a) => a.appVersion }, { header: "Device model", value: (a) => a.deviceModel }, { header: "OS", value: (a) => a.os }], rows);
  };
  return (
    <>
      <SectionTitle title="Authentication audit" description="Member login attempts with MPIN, device and account checks. MPIN values are never captured or shown: only the outcome and reason" actions={v.can("auth-audit:export") && <button type="button" className="btn btn--ghost btn--sm" onClick={exportRows}><Download size={14} aria-hidden="true" />Export CSV</button>} />
      <Notice tone="info">Events come from Phase 10 device logins and the mock authentication adapter. SAML / Single Sign-On for portal staff is not configured in this build: no staff identity provider events are shown or invented.</Notice>
      <KpiGrid cols={5} items={[
        { id: "t", label: "Login attempts", value: all.length, desc: "In your scope", icon: KeyRound, variant: "primary", onSelect: () => { setRes(""); setReason(""); } },
        { id: "s", label: "Successful", value: all.filter((a) => a.result === "success").length, desc: "Signed in", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setRes("success") },
        { id: "f", label: "Failed", value: all.filter((a) => a.result === "failure").length, desc: "All reasons", icon: XCircle, variant: "status", tone: "warning", onSelect: () => setRes("failure") },
        { id: "w", label: "Wrong MPIN", value: all.filter((a) => a.reason === "wrong_mpin").length, desc: "Outcome only", icon: ShieldX, variant: "light", onSelect: () => setReason("wrong_mpin") },
        { id: "b", label: "Blocked users", value: all.filter((a) => a.reason === "blocked_user").length, desc: "Restricted accounts", icon: UserX, variant: "light", onSelect: () => setReason("blocked_user") },
        { id: "d", label: "Blacklisted devices", value: all.filter((a) => a.reason === "device_blacklisted").length, desc: "Device governance", icon: Ban, variant: "light", onSelect: () => setReason("device_blacklisted") },
      ]} />
      <PolicyMessages result={result} />
      <Panel>
        <div className="form-grid">
          <SelectInput label="Result" value={res} onChange={setRes} options={[{ value: "", label: "All" }, { value: "success", label: "Successful" }, { value: "failure", label: "Failed" }]} />
          <SelectInput label="Failure reason" value={reason} onChange={setReason} options={[{ value: "", label: "All" }, ...Object.entries(REASON).map(([k, l]) => ({ value: k, label: l }))]} />
          <SelectInput label="Member type" value={prog} onChange={setProg} options={[{ value: "", label: "All" }, ...["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))]} />
          <SelectInput label="Branch" value={branch} onChange={setBranch} options={opts((a) => a.branchCode)} />
          <SelectInput label="App version" value={ver} onChange={setVer} options={opts((a) => a.appVersion)} />
          <SelectInput label="Device model" value={dev} onChange={setDev} options={opts((a) => a.deviceModel)} />
          <SelectInput label="OS" value={os} onChange={setOs} options={opts((a) => a.os)} />
        </div>
      </Panel>
      <Panel padded={false}>
        <DataTable rows={rows} rowKey={(a) => a.id} caption="Authentication events" columns={[
          { key: "id", header: "Event", value: (a) => a.id, render: (a) => <span className="mono small">{a.id}</span> },
          { key: "m", header: "Member", value: (a) => a.memberId, render: (a) => memberLink(a.memberId) },
          { key: "p", header: "Programme", value: (a) => a.programme },
          { key: "b", header: "Branch", value: (a) => a.branchCode, render: (a) => <span className="mono small">{a.branchCode}</span> },
          { key: "at", header: "At", value: (a) => a.at, render: (a) => <span className="small">{dt(a.at)}</span> },
          { key: "r", header: "Result", value: (a) => a.result, render: (a) => <StatusBadge tone={a.result === "success" ? "positive" : "negative"}>{a.result === "success" ? "Success" : "Failed"}</StatusBadge> },
          { key: "rs", header: "Reason", value: (a) => (a.reason ? REASON[a.reason] : ""), render: (a) => <span className="small">{a.reason ? REASON[a.reason] : "—"}</span> },
          { key: "v", header: "App version", value: (a) => a.appVersion },
          { key: "d", header: "Device", value: (a) => `${a.deviceModel} ${a.os}`, render: (a) => <span className="small">{a.deviceModel} · {a.os}</span> },
          { key: "di", header: "Device ID", value: (a) => (sens ? a.deviceId ?? "" : ""), render: (a) => <span className="mono small">{sens ? a.deviceId ?? "—" : "Restricted"}</span> },
          { key: "ds", header: "Device status", value: (a) => a.deviceStatus, render: (a) => <RunBadge s={a.deviceStatus === "active" ? "completed" : a.deviceStatus === "blocked" ? "failed" : "pending"} /> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Member diagnostics ======================= */

export function MemberDiagnosticsPage() {
  const v = useOpsView();
  const [by, setBy] = useState("member");
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [out, setOut] = useState<ReturnType<typeof memberDiagnostic> | null>(null);
  const view = out?.ok ? out.view : undefined;
  return (
    <>
      <SectionTitle title="Member diagnostics" description="Technical support view of one member: last login, devices, API failures and app errors. Separate from Member 360 and from member management actions; every lookup records who looked and why" />
      <Notice tone="warn">This view needs Member diagnostics: View, a separate technical permission. Searching by mobile number and seeing locations need View sensitive. Credentials and MPIN are never shown.</Notice>
      <Panel>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); setOut(memberDiagnostic(v.uid, by as "member" | "mobile", q, reason)); }}>
          <SelectInput label="Search by" value={by} onChange={setBy} options={[{ value: "member", label: "Member ID" }, { value: "mobile", label: "Mobile number" }]} />
          <TextField label={by === "member" ? "Member ID" : "Mobile number"} value={q} onChange={setQ} />
          <TextField label="Reason for access" value={reason} onChange={setReason} hint="Support ticket or incident reference" required />
          <div><button type="submit" className="btn btn--primary btn--sm"><Search size={14} aria-hidden="true" />Look up</button></div>
        </form>
      </Panel>
      {out && !out.ok && <PolicyMessages result={out} />}
      {view && (
        <>
          <div className="grid-2">
            <Panel title={`${view.member.id} · ${view.member.programme}`} subtitle={`Status ${view.member.status.replace(/_/g, " ")}`}>
              <dl className="dl-grid small">
                <dt>Member</dt><dd>{memberLink(view.member.id)}</dd>
                <dt>Mobile</dt><dd className="mono">{view.member.mobile}</dd>
                <dt>Last login</dt><dd>{dt(view.lastLogin)}</dd>
                <dt>Last device</dt><dd>{view.lastDevice}</dd>
                <dt>Last location</dt><dd>{view.lastLocation}</dd>
                <dt>Last SFDC sync</dt><dd>{view.lastSync ? dt(view.lastSync) : "Not synced from SFDC"}</dd>
                <dt>Restrictions</dt><dd>{view.restrictions.join(", ") || "None"}</dd>
              </dl>
            </Panel>
            <Panel title="Devices" padded={false}>
              <DataTable rows={view.devices} rowKey={(d) => d.id} caption="Devices" searchable={false} emptyTitle="No device recorded" columns={[
                { key: "id", header: "Device", value: (d) => d.id, render: (d) => <span className="mono small">{d.id}</span> },
                { key: "m", header: "Model / OS", value: (d) => `${d.model} ${d.os}` },
                { key: "v", header: "App version", value: (d) => d.appVersion },
                { key: "l", header: "Logins", value: (d) => d.logins, align: "right" },
                { key: "s", header: "Status", value: (d) => d.status },
                { key: "a", header: "Risk alerts", value: (d) => d.alerts, align: "right" },
              ]} />
            </Panel>
          </div>
          <div className="grid-2">
            <Panel title="API failures" padded={false}>
              <DataTable rows={view.apiFailures} rowKey={(f) => f.ref} caption="Member API failures" searchable={false} emptyTitle="No failures recorded" columns={[
                { key: "s", header: "Service", value: (f) => f.service },
                { key: "r", header: "Reference", value: (f) => f.ref, render: (f) => <span className="mono small">{f.ref}</span> },
                { key: "at", header: "At", value: (f) => f.at, render: (f) => <span className="small">{dt(f.at)}</span> },
                { key: "c", header: "Category", value: (f) => f.category ?? "" },
                { key: "h", header: "HTTP", value: (f) => f.status ?? "" },
                { key: "co", header: "Correlation", value: (f) => f.correlation, render: (f) => <span className="mono small">{f.correlation}</span> },
              ]} />
            </Panel>
            <Panel title="App errors" padded={false}>
              <DataTable rows={view.appErrors} rowKey={(c) => c.id} caption="App errors" searchable={false} emptyTitle="No app error linked" columns={[
                { key: "id", header: "Crash group", value: (c) => c.id },
                { key: "t", header: "Error type", value: (c) => c.errorType },
                { key: "v", header: "Version", value: (c) => c.version },
              ]} />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

/* ======================= Adoption ======================= */

export function AdoptionPage() {
  const v = useOpsView();
  const { result, run } = useRun();
  const [status, setStatus] = useParam("status", "");
  const [days, setDays] = useState(v.os.config.dormancyDays == null ? "" : String(v.os.config.dormancyDays));
  const [branch, setBranch] = useParam("branch", "");
  const all = adoptionRows(v.uid);
  const rows = all.filter((r) => (!status || r.status === status) && (!branch || r.member.branchCode === branch));
  const branches = [...new Set(all.filter((r) => r.status === "never_logged_in" || r.status === "dormant").map((r) => r.member.branchCode))].sort();
  const n = (s: string) => all.filter((r) => r.status === s).length;
  const X = v.os.config.dormancyDays;
  const exportRows = () => {
    const r = run(exportAdoption(v.uid, rows.length), "Export recorded");
    if (r.ok) downloadCsv("adoption-follow-up", [{ header: "Member", value: (x: (typeof rows)[number]) => x.member.id }, { header: "Name", value: (x) => x.member.name }, { header: "Programme", value: (x) => x.member.programme }, { header: "Branch", value: (x) => x.member.branchCode }, { header: "Status", value: (x) => x.status }, { header: "Last login", value: (x) => x.last ?? "" }, { header: "Days since", value: (x) => x.since ?? "" }], rows);
  };
  return (
    <>
      <SectionTitle title="Adoption monitoring" description="Enrolled members who never logged in, and members with no login for X days (SOW 10.11). The list supports telecalling and SR follow-up; nobody is contacted automatically" actions={v.can("adoption:export") && <button type="button" className="btn btn--ghost btn--sm" onClick={exportRows}><Download size={14} aria-hidden="true" />Export follow-up list</button>} />
      <Notice tone="warn">V-Guard has not confirmed X, the number of days without login that makes a member dormant (<DecisionRef id="OP-DORM" />). {X == null ? "Until a value is set, active and dormant members cannot be told apart and show as Threshold not set." : `A development value of ${X} days is in use (${v.os.config.dormancyStatus.replace(/_/g, " ")}).`}</Notice>
      <KpiGrid cols={5} items={[
        { id: "e", label: "Enrolled members", value: all.length, desc: "Invited or registered, in your scope", icon: Users, variant: "primary", onSelect: () => setStatus("") },
        { id: "n", label: "Never logged in", value: n("never_logged_in"), desc: "No login recorded", icon: UserX, variant: "status", tone: "warning", onSelect: () => setStatus("never_logged_in") },
        { id: "d", label: "Dormant", value: n("dormant"), desc: X == null ? "Threshold not set" : `No login for over ${X} days`, icon: Smartphone, variant: "light", onSelect: () => setStatus("dormant") },
        { id: "a", label: "Active", value: n("active"), desc: X == null ? "Threshold not set" : `Logged in within ${X} days`, icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setStatus("active") },
        { id: "t", label: "Threshold not set", value: n("threshold_not_set"), desc: "Logged in, not classified", icon: KeyRound, variant: "light", onSelect: () => setStatus("threshold_not_set") },
      ]} />
      <PolicyMessages result={result} />
      {v.can("adoption:manage") && (
        <Panel title="Dormancy threshold (X days)" actions={<BcrTag>OP-DORM open</BcrTag>}>
          <div className="form-grid">
            <TextField label="Days without login" value={days} onChange={setDays} inputMode="numeric" hint="Leave empty to clear. Recorded as a development setting until V-Guard confirms X" />
            <div><button type="button" className="btn btn--primary btn--sm" onClick={() => run(setDormancy(v.uid, days.trim() ? Number(days) : null), "Threshold recorded")}>Save</button></div>
          </div>
        </Panel>
      )}
      <Panel><SelectInput label="Branch (SR / telecalling drill-down)" value={branch} onChange={setBranch} options={[{ value: "", label: "All branches" }, ...branches.map((b) => ({ value: b, label: b }))]} /></Panel>
      <div className="grid-2 grid-2--wide-left">
        <Panel padded={false}>
          <DataTable rows={rows} rowKey={(r) => r.member.id} caption="Adoption" columns={[
            { key: "m", header: "Member", value: (r) => r.member.id, render: (r) => memberLink(r.member.id) },
            { key: "n", header: "Name", value: (r) => r.member.name },
            { key: "p", header: "Programme", value: (r) => r.member.programme },
            { key: "b", header: "Branch", value: (r) => r.member.branchCode, render: (r) => <span className="mono small">{r.member.branchCode}</span> },
            { key: "s", header: "Member status", value: (r) => r.member.status.replace(/_/g, " ") },
            { key: "l", header: "Last login", value: (r) => r.last ?? "", render: (r) => <span className="small">{dt(r.last)}</span> },
            { key: "d", header: "Days since", value: (r) => r.since ?? -1, render: (r) => (r.since == null ? "—" : r.since), align: "right" },
            { key: "a", header: "Adoption", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "active" ? "positive" : r.status === "never_logged_in" || r.status === "dormant" ? "warning" : "neutral"}>{r.status.replace(/_/g, " ")}</StatusBadge> },
          ]} />
        </Panel>
        <Panel title="By programme"><RankedBars items={["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ key: p, label: p, value: all.filter((r) => r.member.programme === p && (r.status === "never_logged_in" || r.status === "dormant")).length }))} /><p className="muted small">Never logged in or dormant</p></Panel>
      </div>
    </>
  );
}

/* ======================= Redemption float and kitties ======================= */

export function FloatPage() {
  const v = useOpsView();
  const { result, run } = useRun();
  useEffect(() => {
    floatView(v.uid); // one audited access per visit
  }, [v.uid]);
  const f = floatData(v.uid);
  const k = kittySummary(v.uid);
  const [amt, setAmt] = useState(v.os.float.lowThreshold == null ? "" : String(v.os.float.lowThreshold));
  if (!f.ok || !f.view) return <PolicyMessages result={f} />;
  const x = f.view;
  return (
    <>
      <SectionTitle title="Redemption float & kitty" description="The RazorPay redemption payout float, monitored separately from the EP / IMP TDS Kitty, unsettled scheme points and available member points. These are different financial concepts and are never added together" />
      <Notice tone="warn">{x.source}. The low-balance threshold is not confirmed (<DecisionRef id="OP-FLOAT" />){x.threshold != null ? `: a development value of ${inr(x.threshold)} is in use` : ": no low-balance alert is raised until one is set"}. Projected burn and time to threshold are not forecast.</Notice>
      <PolicyMessages result={result} />
      <Panel title="Redemption payout float" actions={x.low ? <StatusBadge tone="negative">Below threshold</StatusBadge> : undefined}>
        <div className="ops-figs">
          <Fig label="Available float">{inr(x.available)}</Fig>
          <Fig label="Committed (in process)">{inr(x.committed)}</Fig>
          <Fig label="Remaining after commitments">{inr(x.remaining)}</Fig>
          <Fig label="Paid out (all time)">{inr(x.paid)}</Fig>
          <Fig label="Average daily payouts (7 d)">{inr(x.burnRate)}</Fig>
          <Fig label="Projected burn">Not forecast</Fig>
          <Fig label="Low-balance threshold">{x.threshold == null ? "Not set" : inr(x.threshold)}</Fig>
          <Fig label="Last updated">{x.lastUpdated}</Fig>
        </div>
      </Panel>
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Daily float movement" subtitle="Opening and top-ups are development values; payouts are the Phase 7 records">
          <TrendChart data={x.snapshots.map((s) => ({ key: s.date, label: s.date.slice(5), closing: s.closing, payouts: s.payouts }))} kind="line" ariaLabel="Daily float closing balance" valueFormat={inr} axisFormat={(n) => `₹${Math.round(n / 100000)}L`} series={[{ key: "closing", label: "Closing balance", color: "var(--vg-amber)" }]} />
        </Panel>
        <Panel title="Separate balances" subtitle="Shown side by side, never summed">
          {k.ok && k.view ? (
            <div className="ops-figs ops-figs--stack">
              <Fig label="EP / IMP TDS Kitty">{inr(k.view.tdsKitty)} <DerivedTag from="Wallet & TDS" /></Fig>
              <Fig label="Unsettled scheme points">{k.view.scheme.toLocaleString("en-IN")} points <DerivedTag from="Schemes" /></Fig>
              <Fig label="Available member points">{k.view.available.toLocaleString("en-IN")} points <DerivedTag from="Wallet" /></Fig>
            </div>
          ) : <PolicyMessages result={k} />}
        </Panel>
      </div>
      {v.can("float-monitoring:manage") && (
        <Panel title="Low-balance threshold" actions={<BcrTag>OP-FLOAT open</BcrTag>}>
          <div className="form-grid">
            <TextField label="Threshold (₹)" value={amt} onChange={setAmt} inputMode="numeric" hint={`Alerts go to Finance (${v.os.float.recipients.join(", ")}) through the Communication Centre`} />
            <div><button type="button" className="btn btn--primary btn--sm" onClick={() => run(setFloatThreshold(v.uid, amt.trim() ? Number(amt) : null), "Threshold recorded")}>Save</button></div>
          </div>
        </Panel>
      )}
      <Panel title="Daily snapshots" padded={false}>
        <DataTable rows={[...x.snapshots].reverse()} rowKey={(s) => s.date} caption="Float snapshots" searchable={false} columns={[
          { key: "d", header: "Date", value: (s) => s.date },
          { key: "o", header: "Opening", value: (s) => s.opening, render: (s) => inr(s.opening), align: "right" },
          { key: "i", header: "Top-ups", value: (s) => s.incoming, render: (s) => inr(s.incoming), align: "right" },
          { key: "p", header: "Payouts", value: (s) => s.payouts, render: (s) => inr(s.payouts), align: "right" },
          { key: "c", header: "Closing", value: (s) => s.closing, render: (s) => inr(s.closing), align: "right" },
          { key: "r", header: "Reconciliation", value: (s) => s.reconciliation, render: (s) => <RunBadge s={s.reconciliation === "matched" ? "completed" : s.reconciliation === "difference" ? "failed" : "pending"} /> },
        ]} />
      </Panel>
    </>
  );
}
