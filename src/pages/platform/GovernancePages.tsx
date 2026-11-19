import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { downloadCsv } from "@/lib/csv";
import { configurationRegistry, containsTechnicalTerms, errorCatalogue, exportAudit, linkTicket, memberMessage, openPointRegister, platformAuditEvents, reportServerError, sowCoverage, updatePlatformDecision, type CentralAudit } from "@/features/platform/store";
import { OPERATIONAL_OWNERSHIP, OUT_OF_SCOPE } from "@/config/platformCatalogue";
import type { CoverageStatus, PlatformDecision } from "@/types/platform";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { CoverageBadge, DecisionRef, Tile, dt, memberLink, usePlatformView, useParam, useRun, userName } from "./shared";

const uniq = (xs: string[]) => [...new Set(xs)].sort();

/* ======================= Configuration registry ======================= */

export function ConfigurationRegistryPage() {
  usePlatformView();
  const rows = configurationRegistry();
  const [cat, setCat] = useParam("category", "");
  const [mod, setMod] = useParam("module", "");
  const shown = rows.filter((r) => (!cat || r.category === cat) && (!mod || r.module === mod));
  return (
    <>
      <SectionTitle title="Configuration registry" description="One read-only inventory of governed configuration across the portal: roles, workflows, scan points and rules, schemes, limits, templates, gifts, risk rules, integrations, KPIs, thresholds and app themes. Each entry is changed only in its owning module, through that module's approval workflow — there is no universal edit" />
      <div className="ana-tiles">
        <Tile label="Configuration entries" value={rows.length} />
        <Tile label="Modules" value={uniq(rows.map((r) => r.module)).length} />
        <Tile label="Approved / active" value={rows.filter((r) => /active|approved|confirmed|published/i.test(r.approval)).length} />
        <Tile label="Draft or pending" value={rows.filter((r) => /pending|draft|submitted/i.test(r.approval)).length} />
      </div>
      <Panel>
        <div className="form-grid">
          <SelectInput label="Category" value={cat} onChange={setCat} options={[{ value: "", label: "All categories" }, ...uniq(rows.map((r) => r.category)).map((x) => ({ value: x, label: x }))]} />
          <SelectInput label="Module" value={mod} onChange={setMod} options={[{ value: "", label: "All modules" }, ...uniq(rows.map((r) => r.module)).map((x) => ({ value: x, label: x }))]} />
        </div>
      </Panel>
      <Panel padded={false}>
        <DataTable rows={shown} rowKey={(r) => r.id} caption="Configuration registry" pageSize={15} exportName="configuration-registry" columns={[
          { key: "n", header: "Configuration", value: (r) => r.name, render: (r) => <span><Link to={r.route}><strong>{r.name}</strong></Link><br /><span className="mono small muted">{r.id}</span></span> },
          { key: "m", header: "Module", value: (r) => r.module },
          { key: "c", header: "Category", value: (r) => r.category },
          { key: "v", header: "Version", value: (r) => r.version, render: (r) => <span className="mono small">{r.version}</span> },
          { key: "val", header: "Current value", value: (r) => r.value, render: (r) => <span className="small">{r.value}</span> },
          { key: "e", header: "Effective from", value: (r) => r.effective ?? "", render: (r) => <span className="small">{r.effective ? dt(r.effective) : "—"}</span> },
          { key: "mo", header: "Last change", value: (r) => r.modified ?? "", render: (r) => <span className="small">{r.modified ? dt(r.modified) : "—"}{r.by ? ` · ${r.by}` : ""}</span> },
          { key: "a", header: "Approval state", value: (r) => r.approval, render: (r) => <span className="small">{r.approval}</span> },
          { key: "o", header: "Business owner", value: (r) => r.owner, render: (r) => <span className="small">{r.owner}</span> },
        ]} />
      </Panel>
    </>
  );
}

/* ======================= Central audit and error catalogue ======================= */

export function AuditConsolePage() {
  const [tab, setTab] = useParam("tab", "audit");
  return (
    <>
      <SectionTitle title="Audit & error catalogue" description="Every module's audit trail in one place, and the member-facing error messages from SOW 14.3" />
      <Tabs label="Audit sections" value={tab} onChange={setTab} tabs={[{ id: "audit", label: "Central audit" }, { id: "errors", label: "Error catalogue" }, { id: "incidents", label: "Incidents" }]} />
      {tab === "audit" && <CentralAuditTab />}
      {tab === "errors" && <ErrorCatalogueTab />}
      {tab === "incidents" && <IncidentsTab />}
    </>
  );
}

function CentralAuditTab() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const all = useMemo(() => platformAuditEvents(v.uid), [v.uid, v.ps, v.va, v.acc]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState({ module: "", actor: "", result: "", from: "", to: "", member: "" });
  const set = (k: keyof typeof f) => (x: string) => setF({ ...f, [k]: x });
  if (!v.can("platform-admin:view")) return <Notice tone="warn">The central audit needs Platform administration: View.</Notice>;
  const rows = all.filter((e) => (!f.module || e.module === f.module) && (!f.actor || e.actor === f.actor) && (!f.result || e.result === f.result) && (!f.from || e.at.slice(0, 10) >= f.from) && (!f.to || e.at.slice(0, 10) <= f.to) && (!f.member || (e.memberRef ?? "").includes(f.member.trim())));
  const doExport = () => {
    const r = run(exportAudit(v.uid, rows.length), "Audit exported (masked)");
    if (!r.ok) return;
    downloadCsv<CentralAudit>("central-audit", [
      { header: "Event", value: (e) => e.id }, { header: "At", value: (e) => e.at }, { header: "Actor", value: (e) => e.actor }, { header: "Module", value: (e) => e.module }, { header: "Action", value: (e) => e.action }, { header: "Entity", value: (e) => e.entity }, { header: "Before", value: (e) => e.before }, { header: "After", value: (e) => e.after }, { header: "Reason", value: (e) => e.reason }, { header: "Approval", value: (e) => e.approvalRef }, { header: "Result", value: (e) => e.result },
    ], rows, "DEVELOPMENT / DEMO DATA — masked central audit export");
  };
  return (
    <>
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Audit events" value={all.length.toLocaleString("en-IN")} />
        <Tile label="Modules reporting" value={uniq(all.map((e) => e.module)).length} />
        <Tile label="Refused actions" value={all.filter((e) => e.result === "refused").length} tone="warn" onClick={() => setF({ ...f, result: "refused" })} />
        <Tile label="View-As events" value={all.filter((e) => e.module === "View-As").length} onClick={() => setF({ ...f, module: "View-As" })} />
      </div>
      <Panel>
        <div className="form-grid">
          <SelectInput label="Module" value={f.module} onChange={set("module")} options={[{ value: "", label: "All modules" }, ...uniq(all.map((e) => e.module)).map((x) => ({ value: x, label: x }))]} />
          <SelectInput label="Actor" value={f.actor} onChange={set("actor")} options={[{ value: "", label: "Anyone" }, ...uniq(all.map((e) => e.actor)).map((x) => ({ value: x, label: `${userName(v.acc, x)} (${x})` }))]} />
          <SelectInput label="Result" value={f.result} onChange={set("result")} options={[{ value: "", label: "All results" }, ...uniq(all.map((e) => e.result)).map((x) => ({ value: x, label: x.replace(/_/g, " ") }))]} />
          <TextField label="From" type="date" value={f.from} onChange={set("from")} />
          <TextField label="To" type="date" value={f.to} onChange={set("to")} />
          <TextField label="Member ID" value={f.member} onChange={set("member")} />
        </div>
        <p className="small muted">Identifiers of ten or more digits and PAN-format values are masked before display and export.</p>
      </Panel>
      <Panel padded={false} title={`${rows.length.toLocaleString("en-IN")} events`} actions={v.can("platform-admin:export") ? <button type="button" className="btn btn--ghost btn--sm" onClick={doExport}><Download size={14} aria-hidden="true" />Export (masked)</button> : undefined}>
        <DataTable rows={rows} rowKey={(e) => `${e.module}-${e.id}`} caption="Central audit" pageSize={20} columns={[
          { key: "at", header: "At", value: (e) => e.at, render: (e) => <span className="small">{dt(e.at)}</span> },
          { key: "a", header: "Actor", value: (e) => e.actor, render: (e) => <span className="small">{userName(v.acc, e.actor)}</span> },
          { key: "m", header: "Module", value: (e) => e.module },
          { key: "ac", header: "Action", value: (e) => e.action, render: (e) => <span className="small">{e.action.replace(/_/g, " ")}</span> },
          { key: "en", header: "Entity", value: (e) => e.entity, render: (e) => <span className="mono small">{e.entity}</span> },
          { key: "ch", header: "Change", value: (e) => `${e.before ?? ""} ${e.after ?? ""}`, render: (e) => <span className="small">{e.before || e.after ? `${e.before ?? "—"} → ${e.after ?? "—"}` : "—"}</span> },
          { key: "r", header: "Reason", value: (e) => e.reason, render: (e) => <span className="small">{e.reason || "—"}</span> },
          { key: "ap", header: "Approval", value: (e) => e.approvalRef ?? "", render: (e) => (e.approvalRef ? <Link to={`/governance/approvals/request/${e.approvalRef}`} className="mono small">{e.approvalRef}</Link> : "—") },
          { key: "res", header: "Result", value: (e) => e.result, render: (e) => <StatusBadge tone={e.result === "refused" ? "negative" : e.result === "success" ? "positive" : "neutral"}>{e.result.replace(/_/g, " ")}</StatusBadge> },
        ]} />
      </Panel>
    </>
  );
}

function ErrorCatalogueTab() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const cat = errorCatalogue();
  const [code, setCode] = useState("HTTP 504 Gateway Timeout");
  const m = memberMessage(code);
  return (
    <>
      <PolicyMessages result={result} />
      <Notice tone="info">Members never see technical text such as status codes or stack traces. Messages are in English; other app languages show <strong>Not translated</strong> until the translations are supplied.</Notice>
      <Panel padded={false} title="Error catalogue (SOW 14.3)">
        <DataTable rows={cat.rows} rowKey={(r) => r.id} caption="Error catalogue" searchable={false} columns={[
          { key: "id", header: "Reference", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "c", header: "Category", value: (r) => r.category },
          { key: "code", header: "Technical code", value: (r) => r.code, render: (r) => <span className="mono small">{r.code}</span> },
          { key: "msg", header: "Member message", value: (r) => r.message, render: (r) => <span className="small">{r.message}</span> },
          { key: "re", header: "Recovery", value: (r) => r.retry },
          { key: "s", header: "Support behaviour", value: (r) => r.support, render: (r) => <span className="small">{r.support}</span> },
          { key: "tr", header: "Translations", value: (r) => Object.values(r.translations).filter(Boolean).length, render: (r) => <span className="small">{Object.entries(r.translations).map(([l, t]) => `${l}: ${t ? "✓" : "Not translated"}`).join(" · ")}</span> },
        ]} />
      </Panel>
      <div className="grid-2">
        <Panel title="Check a technical error" subtitle="What the member would see">
          <TextField label="Technical error" value={code} onChange={setCode} />
          <dl className="dl-grid small">
            <dt>Member message</dt><dd>{m.message}</dd>
            <dt>Catalogue reference</dt><dd className="mono">{m.errorRef ?? "Unmapped (generic message)"}</dd>
            <dt>Recovery</dt><dd>{m.retry}</dd>
            <dt>Technical terms leaked</dt><dd>{containsTechnicalTerms(m.message) ? <StatusBadge tone="negative">Yes</StatusBadge> : <StatusBadge tone="positive">None</StatusBadge>}</dd>
          </dl>
        </Panel>
        {v.can("platform-admin:edit") && (
          <Panel title="Log a server error (development)" subtitle="5xx errors raise an incident automatically">
            <p className="small muted">Simulates the backend reporting a server error, to check the incident flow. Development only.</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(reportServerError("Wallet", "HTTP_503 Service Unavailable"), "Incident logged")}>Log HTTP 503 from Wallet</button>
          </Panel>
        )}
      </div>
    </>
  );
}

function IncidentsTab() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const [sel, setSel] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");
  const [res, setRes] = useState("");
  const inc = v.ps.incidents;
  return (
    <>
      <PolicyMessages result={result} />
      <Notice tone="warn">No ticketing tool is connected. Ticket references are recorded by hand until <DecisionRef id="OP-TICKET1" /> confirms the tool and who sees resolution comments.</Notice>
      <Panel padded={false} title="Server error incidents">
        <DataTable rows={[...inc].reverse()} rowKey={(x) => x.id} caption="Incidents" emptyTitle="No incidents logged" onRowClick={(x) => { setSel(x.id); setTicket(x.ticketRef ?? ""); setRes(x.resolution ?? ""); }} columns={[
          { key: "id", header: "Incident", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
          { key: "at", header: "At", value: (x) => x.at, render: (x) => <span className="small">{dt(x.at)}</span> },
          { key: "m", header: "Module", value: (x) => x.module },
          { key: "e", header: "Error", value: (x) => x.errorRef, render: (x) => <span className="small"><span className="mono">{x.errorRef}</span> · {x.technicalCode}</span> },
          { key: "mem", header: "Member", value: (x) => x.memberRef ?? "", render: (x) => memberLink(x.memberRef) },
          { key: "t", header: "Ticket", value: (x) => x.ticketRef ?? "", render: (x) => x.ticketRef ?? <span className="muted small">Not linked</span> },
          { key: "r", header: "Resolution", value: (x) => x.resolution ?? "", render: (x) => <span className="small">{x.resolution ?? "—"}</span> },
        ]} />
      </Panel>
      {sel && v.can("platform-admin:edit") && (
        <Panel title={`Link a ticket to ${sel}`}>
          <div className="form-grid"><TextField label="Ticket reference" value={ticket} onChange={setTicket} /><TextField label="Resolution note" value={res} onChange={setRes} /></div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(linkTicket(v.uid, sel, ticket, res), "Ticket linked")}>Save</button>
        </Panel>
      )}
    </>
  );
}

/* ======================= SOW coverage ======================= */

const STATUSES: CoverageStatus[] = ["fully_implemented", "partially_implemented", "backend_integration_prepared", "business_confirmation_required", "mock_service_only", "ui_only", "not_implemented"];
export function SowCoveragePage() {
  usePlatformView();
  const [tab, setTab] = useParam("tab", "af");
  const [status, setStatus] = useParam("status", "");
  const cov = sowCoverage();
  const all = [...cov.af, ...cov.sb];
  const count = (s: CoverageStatus) => all.filter((x) => x.status === s).length;
  return (
    <>
      <SectionTitle title="SOW feature coverage" description="Annexure A additional features (AF01–AF28) and the Scheme Builder components (SB01–SB21), with where each one lives and how it was verified. The SOW register has no AF08, so none is listed" />
      <Notice tone="info">“Fully implemented” means the portal behaviour, permissions, audit and automated tests exist against development mock services. No row is live: production integrations are listed as prepared or mock, and SOW-level acceptance still needs UAT evidence.</Notice>
      <div className="ana-tiles">{STATUSES.map((s) => <Tile key={s} label={s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} value={count(s)} onClick={() => setStatus(status === s ? "" : s)} tone={status === s ? "accent" : undefined} />)}</div>
      <Tabs label="Coverage registers" value={tab} onChange={setTab} tabs={[{ id: "af", label: "Additional features", count: cov.af.length }, { id: "sb", label: "Scheme Builder", count: cov.sb.length }]} />
      {tab === "af" && (
        <Panel padded={false}>
          <DataTable rows={cov.af.filter((x) => !status || x.status === status)} rowKey={(x) => x.ref} caption="AF coverage" pageSize={30} exportName="sow-af-coverage" columns={[
            { key: "r", header: "Ref", value: (x) => x.ref, render: (x) => <span className="mono small">{x.ref}</span> },
            { key: "f", header: "Feature", value: (x) => x.feature, render: (x) => <span><strong>{x.feature}</strong><br /><span className="small muted">{x.sowLocation} · {x.phase}</span></span> },
            { key: "w", header: "Where", value: (x) => x.route, render: (x) => <span className="small">{x.route.startsWith("/") ? <Link to={x.route.split(" ")[0]}>{x.route}</Link> : x.route}<br /><span className="muted">{x.component}</span></span> },
            { key: "sv", header: "Service", value: (x) => x.service, render: (x) => <span className="small mono">{x.service}</span> },
            { key: "t", header: "Tests", value: (x) => x.test, render: (x) => <span className="small">{x.test}</span> },
            { key: "p", header: "Permission / audit", value: (x) => x.permission, render: (x) => <span className="small">{x.permission}<br /><span className="muted">{x.audit}</span></span> },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => <CoverageBadge s={x.status} /> },
            { key: "i", header: "Integration", value: (x) => x.integration, render: (x) => <span className="small">{x.integration.replace("_", " ")}</span> },
            { key: "g", header: "Gap / remediation", value: (x) => x.gap, render: (x) => <span className="small">{x.gap || "—"}{x.remediation ? <><br /><span className="muted">{x.remediation}</span></> : null}</span> },
          ]} />
        </Panel>
      )}
      {tab === "sb" && (
        <Panel padded={false}>
          <DataTable rows={cov.sb.filter((x) => !status || x.status === status)} rowKey={(x) => x.ref} caption="Scheme Builder coverage" pageSize={30} exportName="sow-sb-coverage" columns={[
            { key: "r", header: "Ref", value: (x) => x.ref, render: (x) => <span className="mono small">{x.ref}</span> },
            { key: "f", header: "Component", value: (x) => x.feature, render: (x) => <span><strong>{x.feature}</strong><br /><span className="small muted">{x.sowLocation}</span></span> },
            { key: "w", header: "Where in the builder", value: (x) => x.where, render: (x) => <span className="small">{x.where}</span> },
            { key: "v", header: "Validation · approval", value: (x) => x.validation, render: (x) => <span className="small">{x.validation}<br /><span className="muted">{x.approval}</span></span> },
            { key: "sg", header: "Safeguards", value: (x) => x.safeguards, render: (x) => <span className="small">{x.safeguards}</span> },
            { key: "t", header: "Tests", value: (x) => x.test, render: (x) => <span className="small">{x.test}</span> },
            { key: "d", header: "Decision", value: (x) => x.decision ?? "", render: (x) => (x.decision ? <Link to="/schemes/governance" className="mono small">{x.decision}</Link> : "—") },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => <CoverageBadge s={x.status} /> },
          ]} />
        </Panel>
      )}
    </>
  );
}

/* ======================= Open points, scope and ownership ======================= */

const DECISION_STATUSES: PlatformDecision["status"][] = ["open", "under_review", "decision_received", "confirmed", "implemented", "deferred", "out_of_scope", "rejected"];
export function OpenPointsPage() {
  const v = usePlatformView();
  const { result, run } = useRun();
  const { hash } = useLocation();
  const [tab, setTab] = useParam("tab", "register");
  const [mod, setMod] = useParam("module", "");
  const [st, setSt] = useParam("status", "");
  const [edit, setEdit] = useState<{ id: string; status: PlatformDecision["status"]; evidence: string } | null>(null);
  const all = openPointRegister();
  useEffect(() => {
    if (!hash) return;
    if (tab !== "platform") setTab("platform");
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" }), 50);
    return () => window.clearTimeout(t);
  }, [hash]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = all.filter((x) => ["open", "under_review"].includes(x.status));
  return (
    <>
      <SectionTitle title="Open points & scope" description="Every open business decision carried forward from earlier modules, the Phase 13 platform decisions, out-of-scope items and who owns each operational function. An open point stays open until its owner records the decision — the portal never assumes the answer" />
      <PolicyMessages result={result} />
      <div className="ana-tiles">
        <Tile label="Open points (all modules)" value={open.length} tone="warn" />
        <Tile label="Platform decisions open" value={v.ps.decisions.filter((d) => d.status === "open" || d.status === "under_review").length} />
        <Tile label="Modules with open points" value={uniq(open.map((x) => x.module)).length} />
        <Tile label="Out-of-scope items" value={OUT_OF_SCOPE.length} />
      </div>
      <Tabs label="Open point sections" value={tab} onChange={setTab} tabs={[{ id: "register", label: "Register", count: all.length }, { id: "platform", label: "Platform decisions", count: v.ps.decisions.length }, { id: "scope", label: "Out of scope" }, { id: "ownership", label: "Operational ownership" }]} />
      {tab === "register" && (
        <>
          <Panel><div className="form-grid">
            <SelectInput label="Module" value={mod} onChange={setMod} options={[{ value: "", label: "All modules" }, ...uniq(all.map((x) => x.module)).map((x) => ({ value: x, label: x }))]} />
            <SelectInput label="Status" value={st} onChange={setSt} options={[{ value: "", label: "All statuses" }, ...uniq(all.map((x) => x.status)).map((x) => ({ value: x, label: x.replace(/_/g, " ") }))]} />
          </div></Panel>
          <Panel padded={false}>
            <DataTable rows={all.filter((x) => (!mod || x.module === mod) && (!st || x.status === st))} rowKey={(x) => `${x.module}-${x.ref}`} caption="Open point register" pageSize={20} exportName="open-points" columns={[
              { key: "r", header: "Ref", value: (x) => x.ref, render: (x) => <Link to={x.route} className="mono small">{x.ref}</Link> },
              { key: "m", header: "Module", value: (x) => x.module },
              { key: "d", header: "Decision needed", value: (x) => x.description, render: (x) => <span className="small">{x.description}</span> },
              { key: "o", header: "Owner", value: (x) => x.owner, render: (x) => <span className="small">{x.owner}</span> },
              { key: "rs", header: "Current treatment", value: (x) => x.restriction, render: (x) => <span className="small muted">{x.restriction || "—"}</span> },
              { key: "s", header: "Status", value: (x) => x.status, render: (x) => <StatusBadge tone={x.status === "confirmed" || x.status === "implemented" ? "positive" : x.status === "open" ? "warning" : "neutral"}>{x.status.replace(/_/g, " ")}</StatusBadge> },
            ]} />
          </Panel>
        </>
      )}
      {tab === "platform" && (
        <div className="decision-list">
          {v.ps.decisions.map((d) => (
            <div key={d.id} id={d.id} className="decision-anchor"><Panel title={d.ref} subtitle={`${d.module} · business owner ${d.businessOwner} · technical owner ${d.technicalOwner}`} actions={<StatusBadge tone={d.status === "confirmed" || d.status === "implemented" ? "positive" : d.status === "open" ? "warning" : "neutral"}>{d.status.replace(/_/g, " ")}</StatusBadge>}>
              <p>{d.description}</p>
              <dl className="dl-grid small">
                <dt>Impact</dt><dd>{d.impact}</dd>
                <dt>Affects</dt><dd>{d.affected}</dd>
                <dt>Until decided</dt><dd>{d.restriction}</dd>
                {d.evidence && <><dt>Decision evidence</dt><dd>{d.evidence}{d.decisionDate ? ` (${d.decisionDate})` : ""}</dd></>}
              </dl>
              {v.can("platform-admin:manage") && (edit?.id === d.id ? (
                <div className="form-grid">
                  <SelectInput label="Status" value={edit.status} onChange={(x) => setEdit({ ...edit, status: x as PlatformDecision["status"] })} options={DECISION_STATUSES.map((x) => ({ value: x, label: x.replace(/_/g, " ") }))} />
                  <TextArea label="Decision evidence (who decided, when, reference)" value={edit.evidence} onChange={(x) => setEdit({ ...edit, evidence: x })} rows={2} />
                  <div className="btn-row"><button type="button" className="btn btn--primary btn--sm" onClick={() => { const r = run(updatePlatformDecision(v.uid, d.id, edit.status, edit.evidence), "Decision recorded"); if (r.ok) setEdit(null); }}>Record</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Cancel</button></div>
                </div>
              ) : <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit({ id: d.id, status: d.status, evidence: d.evidence })}>Record a decision</button>)}
            </Panel></div>
          ))}
        </div>
      )}
      {tab === "scope" && (
        <Panel padded={false} title="Out of scope and change-request register" subtitle="Annexure A exclusions and proposed modules. These are not built and cannot be switched on from the portal">
          <DataTable rows={OUT_OF_SCOPE} rowKey={(x) => x.id} caption="Out of scope" searchable={false} columns={[
            { key: "id", header: "Ref", value: (x) => x.id, render: (x) => <span className="mono small">{x.id}</span> },
            { key: "i", header: "Item", value: (x) => x.item, render: (x) => <span className="small">{x.item}</span> },
            { key: "s", header: "Status", value: (x) => x.status, render: (x) => <StatusBadge tone="neutral">{x.status.replace(/_/g, " ")}</StatusBadge> },
            { key: "f", header: "In this build", value: (x) => x.found, render: (x) => <span className="small">{x.found}</span> },
            { key: "r", header: "Source", value: (x) => x.refs },
          ]} />
        </Panel>
      )}
      {tab === "ownership" && (
        <Panel padded={false} title="Operational governance register" subtitle={<>Draft until <DecisionRef id="OP-RBAC1" /> confirms the final roles</>}>
          <DataTable rows={OPERATIONAL_OWNERSHIP} rowKey={(x) => x.id} caption="Operational ownership" searchable={false} pageSize={20} columns={[
            { key: "a", header: "Function", value: (x) => x.area, render: (x) => <strong>{x.area}</strong> },
            { key: "o", header: "Operates", value: (x) => x.operates, render: (x) => <span className="small">{x.operates}</span> },
            { key: "ap", header: "Approves", value: (x) => x.approves, render: (x) => <span className="small">{x.approves}</span> },
            { key: "s", header: "Supports", value: (x) => x.supports, render: (x) => <span className="small">{x.supports}</span> },
            { key: "e", header: "Escalation", value: (x) => x.escalation, render: (x) => <span className="small">{x.escalation}</span> },
            { key: "src", header: "SOW", value: (x) => x.source, render: (x) => <span className="small muted">{x.source}</span> },
          ]} />
        </Panel>
      )}
    </>
  );
}
