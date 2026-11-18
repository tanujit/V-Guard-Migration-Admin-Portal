import { useState } from "react";
import { Link } from "react-router-dom";
import { Play, Send } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/primitives";
import { Tabs, TextArea, TextField } from "@/components/form/Form";
import { IDENTIFIER, SOW } from "@/config/riskCatalogue";
import { sowGeoVelocityExample } from "@/features/risk/engine";
import { activateDigest, approveGeoOverride, assignTampered, buildDigestPreview, closeTampered, escalateTampered, evidenceTampered, recordPinResponsibility, remarkTampered, requestRedemptionRelease, routeLeakToReconciliation, runNightlyDedup, setDigestConfig, setMatchStatus } from "@/features/risk/store";
import type { TamperedQrCase } from "@/types/risk";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { GeoPlot } from "./GeoPlot";
import { BcrTag, DecisionRef, FBASE, approvalLink, caseLink, commLink, dt, memberLink, memberName, restrictionState, useFraudView, useParam, useRun, userName, type FraudView } from "./shared";

type Run = ReturnType<typeof useRun>["run"];

/* ======================= Duplicate identity (9.1, 9.5) ======================= */

export function DuplicateIdentityPage() {
  const v = useFraudView();
  const { result, run } = useRun();
  const [remarks, setRemarks] = useState("");
  const linked = v.mem.identities.filter((i) => i.memberIds.length > 1);
  return (
    <>
      <SectionTitle title="Duplicate identity monitoring" description="Matches reported by the master identity registry: mobile in real time across all programmes, Aadhaar / PAN / bank in the nightly midnight batch, device ID captured for device governance. A match is a signal: profiles are never merged or deleted, and restrictions follow the Program Block / Temporary Hold model" actions={v.can("fraud-rules:manage") && <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(runNightlyDedup(`${v.now.slice(0, 10)}T00:00`), "Nightly batch replayed (mock registry)")}><Play size={14} aria-hidden="true" />Replay nightly batch (mock)</button>} />
      <div className="grid-4">
        {(Object.keys(IDENTIFIER) as (keyof typeof IDENTIFIER)[]).map((k) => <Panel key={k} title={IDENTIFIER[k].label}><p className="small">{IDENTIFIER[k].timing}</p><strong>{v.rs.identityMatches.filter((m) => m.identifier === k).length}</strong> <span className="small muted">match(es)</span></Panel>)}
      </div>
      <PolicyMessages result={result} />
      <Panel title="Identity matches" subtitle="Identifiers stay masked" padded={false}>
        <DataTable rows={v.rs.identityMatches.filter((m) => v.canOn("fraud-rules", "view", m.originalMemberId))} rowKey={(m) => m.id} caption="Identity matches" columns={[
          { key: "id", header: "Detection reference", value: (m) => m.id },
          { key: "t", header: "Identifier", value: (m) => IDENTIFIER[m.identifier].label },
          { key: "mask", header: "Masked identifier", value: (m) => m.masked, render: (m) => <span className="mono small">{m.masked}</span> },
          { key: "o", header: "Original member", value: (m) => m.originalMemberId, render: (m) => memberLink(m.originalMemberId) },
          { key: "x", header: "Matching member / attempt", value: (m) => m.matchingMemberId, render: (m) => (m.matchingMemberId.startsWith("MBR-") ? memberLink(m.matchingMemberId) : <span className="mono small">{m.matchingMemberId}</span>) },
          { key: "p", header: "Programme(s)", value: (m) => m.programmes.join(", ") },
          { key: "me", header: "Detection method", value: (m) => m.method.replace("_", " "), render: (m) => <span className="small">{m.method.replace("_", " ")}{m.batchRef ? ` · ${m.batchRef}` : ""}</span> },
          { key: "d", header: "Detected", value: (m) => m.detectedAt, render: (m) => <span className="small">{dt(m.detectedAt)}</span> },
          { key: "s", header: "Status", value: (m) => m.status, render: (m) => <StatusBadge tone={m.status === "open" ? "warning" : m.status === "resolved_restricted" ? "negative" : "neutral"}>{m.status.replace(/_/g, " ")}</StatusBadge> },
          { key: "r", header: "Related restriction", value: (m) => m.restrictionId ?? "", render: (m) => <span className="mono small">{m.restrictionId ?? "—"}</span> },
          { key: "e", header: "Risk event", value: (m) => m.riskEventId ?? "", render: (m) => <span className="mono small">{m.riskEventId ?? "—"}</span> },
          { key: "a", header: "", value: () => "", render: (m) => (v.can("fraud-rules:edit") && m.status === "open" ? <span className="btn-row"><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(setMatchStatus(v.uid, m.id, "under_review", remarks), "Under review")}>Review</button><button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(setMatchStatus(v.uid, m.id, "resolved_no_action", remarks), "Resolved, no action")}>No action</button></span> : null) },
        ]} />
      </Panel>
      {v.can("fraud-rules:edit") && <TextField label="Remarks for match decisions" value={remarks} onChange={setRemarks} hint="Required" />}
      <div className="grid-2">
        <Panel title="Cross-programme KYC: linked identities" subtitle="One identity holding several programme memberships (SOW 9.1). Similar names alone never trigger a Temporary Hold">
          <DataTable rows={linked} rowKey={(i) => i.id} caption="Linked identities" searchable={false} columns={[
            { key: "id", header: "Identity", value: (i) => i.id, render: (i) => <span className="mono small">{i.id}</span> },
            { key: "m", header: "Memberships", value: (i) => i.memberIds.join(", "), render: (i) => <span className="small">{i.memberIds.map((id) => `${id} (${v.mem.members.find((x) => x.id === id)?.programme})`).join(", ")}</span> },
            { key: "k", header: "KYC match", value: (i) => i.maskedAadhaar ?? "", render: (i) => <span className="mono small">Aadhaar {i.maskedAadhaar ?? "—"}</span> },
            { key: "r", header: "Restrictions", value: (i) => i.memberIds.map((id) => restrictionState(v.mem, id)).join("; "), render: (i) => <span className="small">{[...new Set(i.memberIds.map((id) => restrictionState(v.mem, id)))].join("; ")}</span> },
            { key: "s", header: "Source", value: () => "Identity registry", render: () => <span className="small">Identity registry (mock)</span> },
          ]} />
        </Panel>
        <Panel title="Nightly de-duplication batches">
          <DataTable rows={v.rs.dedupBatches} rowKey={(b) => b.id} caption="Dedup batches" searchable={false} columns={[
            { key: "id", header: "Batch", value: (b) => b.id },
            { key: "at", header: "Run", value: (b) => b.runAt, render: (b) => <span className="small">{dt(b.runAt)}</span> },
            { key: "i", header: "Identifiers", value: (b) => b.identifiers.join(", ") },
            { key: "s", header: "Identities scanned", value: (b) => b.scanned, align: "right" },
            { key: "m", header: "Matches", value: (b) => b.matches, align: "right" },
            { key: "st", header: "Status", value: (b) => b.status },
          ]} />
          <p className="small muted">{v.rs.registryFeed.length} match(es) waiting in the mock registry feed for the next midnight run.</p>
        </Panel>
      </div>
    </>
  );
}

/* ======================= QR integrity (9.4) ======================= */

export function QrIntegrityPage() {
  const v = useFraudView();
  const [tab, setTab] = useParam("tab", "duplicate");
  const { result, run } = useRun();
  return (
    <>
      <SectionTitle title="QR integrity investigation" description="Duplicate QRs are rejected by the backend at scan time with a message saying whether the code was scanned by the same member or by another (masked) member. Tampered or suspicious QRs are escalated for investigation instead of failing silently" />
      <PolicyMessages result={result} />
      <Tabs label="QR sections" value={tab} onChange={setTab} tabs={[{ id: "duplicate", label: "Duplicate QR", count: v.rs.duplicateQr.length }, { id: "tampered", label: "Tampered QR", count: v.rs.tampered.length }, { id: "digest", label: "Daily digest" }]} />
      {tab === "duplicate" && (
        <Panel title="Duplicate QR events" subtitle="QR security values are never shown" padded={false}>
          <DataTable rows={v.rs.duplicateQr} rowKey={(d) => d.id} caption="Duplicate QR events" columns={[
            { key: "id", header: "Reference", value: (d) => d.id },
            { key: "q", header: "Masked QR", value: (d) => d.qrMasked, render: (d) => <span className="mono small">{d.qrMasked}</span> },
            { key: "sku", header: "Product / SKU", value: (d) => d.skuId ?? "", render: (d) => <span className="mono small">{d.skuId ?? "—"}</span> },
            { key: "f", header: "First scanned", value: (d) => d.first.at, render: (d) => <span className="small">{memberLink(d.first.memberId)} · {d.first.programme} · {d.first.branchCode} · {dt(d.first.at)}</span> },
            { key: "a", header: "Subsequent attempt", value: (d) => d.attempt.at, render: (d) => <span className="small">{memberLink(d.attempt.memberId)} · {d.attempt.programme} · {d.attempt.branchCode} · {dt(d.attempt.at)}</span> },
            { key: "r", header: "Detection result", value: (d) => (d.sameMember ? "Same member" : "Another member"), render: (d) => <StatusBadge tone={d.sameMember ? "neutral" : "warning"}>{d.sameMember ? "Same member" : "Another member"}</StatusBadge> },
            { key: "msg", header: "Member-facing message", value: (d) => d.memberMessage, render: (d) => <span className="small">{d.memberMessage}</span> },
            { key: "rej", header: "Backend rejection", value: (d) => d.rejectionRef, render: (d) => <span className="mono small">{d.rejectionRef}</span> },
            { key: "s", header: "Investigation", value: (d) => d.investigationStatus },
          ]} />
        </Panel>
      )}
      {tab === "tampered" && <Tampered v={v} run={run} />}
      {tab === "digest" && <Digest v={v} run={run} />}
    </>
  );
}

function Tampered({ v, run }: { v: FraudView; run: Run }) {
  const [sel, setSel] = useState(v.rs.tampered[0]?.id ?? "");
  const t = v.rs.tampered.find((x) => x.id === sel);
  return (
    <div className="grid-2 grid-2--wide-left">
      <Panel title="Tampered QR investigation queue" padded={false}>
        <DataTable rows={v.rs.tampered} rowKey={(x) => x.id} caption="Tampered QR cases" searchable={false} onRowClick={(x) => setSel(x.id)} columns={[
          { key: "id", header: "Investigation", value: (x) => x.id },
          { key: "q", header: "QR", value: (x) => x.qrMasked, render: (x) => <span className="mono small">{x.qrMasked}</span> },
          { key: "m", header: "Member", value: (x) => x.memberId, render: (x) => memberLink(x.memberId) },
          { key: "p", header: "Programme", value: (x) => x.programme },
          { key: "b", header: "Branch", value: (x) => x.branchCode },
          { key: "r", header: "Detection reason", value: (x) => x.reason, render: (x) => <span className="small">{x.reason}</span> },
          { key: "at", header: "Scan attempt", value: (x) => x.at, render: (x) => <span className="small">{dt(x.at)}</span> },
          { key: "pin", header: "PIN responsibility", value: (x) => x.pin.status, render: (x) => (x.pin.status === "recorded" ? <span className="small">Recorded · <BcrTag>rule BCR</BcrTag></span> : <span className="muted small">Not recorded</span>) },
          { key: "s", header: "Status", value: (x) => x.status, render: (x) => <StatusBadge tone={x.status === "closed" ? "positive" : x.status === "escalated" ? "warning" : "info"}>{x.status}</StatusBadge> },
        ]} />
      </Panel>
      {t && <TamperedDetail v={v} t={t} run={run} />}
    </div>
  );
}

function TamperedDetail({ v, t, run }: { v: FraudView; t: TamperedQrCase; run: Run }) {
  const [text, setText] = useState("");
  const [ev, setEv] = useState("");
  const [pin, setPin] = useState({ party: t.pin.party ?? "", decision: t.pin.decision ?? "", remarks: t.pin.remarks ?? "" });
  const edit = v.canOn("fraud-rules", "edit", t.memberId);
  return (
    <Panel title={`${t.id} · ${t.qrMasked}`} subtitle={`${t.reason} · owner ${t.ownerId ? userName(v.acc, t.ownerId) : "unassigned"}`}>
      <ul className="activity-list">{t.evidence.map((e) => <li key={e.id} className="small">Evidence {e.ref}: {e.description}</li>)}{t.remarks.map((r, k) => <li key={k} className="small">{r.text} <span className="muted">{dt(r.at)} · {userName(v.acc, r.by)}</span></li>)}</ul>
      {edit && t.status !== "closed" && (
        <>
          <div className="btn-row">
            <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(assignTampered(v.uid, t.id, v.uid), "Assigned to you")}>Assign to me</button>
            <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(escalateTampered(v.uid, t.id, text), "Escalated")}>Escalate</button>
          </div>
          <TextField label="Remark / escalation reason" value={text} onChange={setText} />
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => { if (run(remarkTampered(v.uid, t.id, text), "Remark added").ok) setText(""); }}>Add remark</button>
          <TextField label="Evidence reference" value={ev} onChange={setEv} />
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => { if (run(evidenceTampered(v.uid, t.id, ev, "Attached by investigator"), "Evidence attached").ok) setEv(""); }}>Attach evidence</button>
        </>
      )}
      <h4>PIN-sharing responsibility</h4>
      <Notice tone="warn">Who is held responsible and how it is adjudicated is not confirmed (<DecisionRef id="OP-QR1" />). Fields are recorded for the investigation; no PIN or MPIN value is ever collected.</Notice>
      <dl className="dl-grid small">
        <dt>Status</dt><dd>{t.pin.status.replace("_", " ")} · <BcrTag>{t.pin.ruleStatus === "confirmed" ? "Rule confirmed" : "Decision logic BCR"}</BcrTag></dd>
        <dt>Assigned party / role</dt><dd>{t.pin.party ?? "—"}</dd>
        <dt>Investigation owner</dt><dd>{t.pin.owner ? userName(v.acc, t.pin.owner) : "—"}</dd>
        <dt>Responsibility decision</dt><dd>{t.pin.decision ?? "—"}</dd>
        <dt>Decision reference</dt><dd className="mono">{t.pin.decisionRef ?? "—"}</dd>
      </dl>
      {edit && t.status !== "closed" && (
        <>
          <TextField label="Assigned party / role" value={pin.party} onChange={(x) => setPin({ ...pin, party: x })} />
          <TextField label="Responsibility decision" value={pin.decision} onChange={(x) => setPin({ ...pin, decision: x })} />
          <TextArea label="Remarks" value={pin.remarks} onChange={(x) => setPin({ ...pin, remarks: x })} />
          <button type="button" className="btn btn--secondary btn--xs" onClick={() => run(recordPinResponsibility(v.uid, t.id, pin), "Responsibility recorded")}>Record responsibility</button>
          <TextField label="Closure outcome" value={text} onChange={setText} />
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => run(closeTampered(v.uid, t.id, text), "Investigation closed")}>Close investigation</button>
        </>
      )}
    </Panel>
  );
}

function Digest({ v, run }: { v: FraudView; run: Run }) {
  const [schedule, setSchedule] = useState(v.rs.digest.schedule ?? "");
  const [group, setGroup] = useState(v.rs.digest.recipientGroup ?? "");
  return (
    <div className="grid-2">
      <Panel title="Daily duplicate-QR digest" subtitle={<>Status: <BcrTag>{v.rs.digest.enabled ? "Active" : "Inactive until OP-QR1 is confirmed"}</BcrTag></>}>
        <p className="small">The SOW mentions a daily digest of already-scanned QRs for Service Engineers. Scope, recipients and ownership are open (<DecisionRef id="OP-QR1" />): the structure is ready, the schedule stays inactive.</p>
        <TextField label="Schedule (development setting)" value={schedule} onChange={setSchedule} placeholder="Not set" />
        <TextField label="Recipient / Service Engineer group" value={group} onChange={setGroup} placeholder="Not set" />
        <div className="btn-row">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(setDigestConfig(v.uid, { schedule: schedule || null, recipientGroup: group || null }), "Digest configuration saved")}>Save configuration</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(activateDigest(v.uid), "Digest activated")}>Activate digest</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => run(buildDigestPreview(v.now.slice(0, 10)), "Preview built (not sent)")}>Build today's preview</button>
        </div>
      </Panel>
      <Panel title="Digest previews" subtitle="Never dispatched while inactive" padded={false}>
        <DataTable rows={v.rs.digest.previews} rowKey={(d) => d.id} caption="Digest previews" searchable={false} columns={[{ key: "id", header: "Digest", value: (d) => d.id }, { key: "d", header: "Date", value: (d) => d.date }, { key: "n", header: "Duplicate QRs", value: (d) => d.duplicateCount, align: "right" }, { key: "b", header: "Branches", value: (d) => d.branches.join(", ") }, { key: "r", header: "Recipients", value: (d) => d.recipientGroup ?? "Not set" }, { key: "s", header: "Dispatch", value: (d) => d.dispatch.replace("_", " ") }]} />
      </Panel>
    </div>
  );
}

/* ======================= Geo-velocity, geo-fence, store gate and branch leakage ======================= */

export function GeoBranchPage() {
  const v = useFraudView();
  const [tab, setTab] = useParam("tab", "velocity");
  const { result, run } = useRun();
  const [sel, setSel] = useState(v.rs.geoVelocity[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const g = v.rs.geoVelocity.find((x) => x.id === sel);
  return (
    <>
      <SectionTitle title="Geo-velocity, geo-fencing and branch leakage" description="Location signals from the backend geo services: impossible travel between consecutive scans, the Retailer / CS 100 m scan geo-fence, the Retailer / DD / CS store geo-validation gate and scans outside the mapped branch" />
      <PolicyMessages result={result} />
      <Tabs label="Location sections" value={tab} onChange={setTab} tabs={[{ id: "velocity", label: "Geo-velocity", count: v.rs.geoVelocity.length }, { id: "fence", label: "Scan geo-fence", count: v.rs.geoFence.length }, { id: "store", label: "Store geo-validation", count: v.rs.storeGeo.filter((s) => s.sfdcStatus === "pending").length }, { id: "leak", label: "Branch leakage", count: v.rs.leaks.length }]} />
      {tab === "velocity" && (
        <div className="grid-2 grid-2--wide-left">
          <Panel title="Geo-velocity queue" subtitle={`Distance and time are the service's values. Highlighted: ${SOW.geoVelocityExample.text}`} padded={false}>
            <DataTable rows={v.rs.geoVelocity} rowKey={(x) => x.id} caption="Geo-velocity events" searchable={false} onRowClick={(x) => setSel(x.id)} columns={[
              { key: "id", header: "Event", value: (x) => x.riskEventId ?? x.id, render: (x) => <span className="mono small">{x.riskEventId}</span> },
              { key: "m", header: "Member", value: (x) => x.memberId, render: (x) => <span>{memberLink(x.memberId)} <span className="small">{x.programme}</span></span> },
              { key: "p", header: "Previous scan", value: (x) => x.previous.at, render: (x) => <span className="small">{x.previous.scanRef} · {x.previous.location} · {dt(x.previous.at)}</span> },
              { key: "c", header: "Current scan", value: (x) => x.current.at, render: (x) => <span className="small">{x.current.scanRef} · {x.current.location} · {dt(x.current.at)}</span> },
              { key: "d", header: "Distance", value: (x) => x.distanceKm, render: (x) => <span className="num">{x.distanceKm != null ? `${x.distanceKm} km` : <span className="muted">Not supplied</span>}</span>, align: "right" },
              { key: "t", header: "Elapsed", value: (x) => x.elapsedMin, render: (x) => <span className="num">{x.elapsedMin != null ? `${x.elapsedMin} min` : "—"}</span>, align: "right" },
              { key: "r", header: "Detection rule", value: (x) => x.rule, render: (x) => <span className="small">{x.rule}</span> },
              { key: "s", header: "SOW example", value: (x) => (sowGeoVelocityExample(x.distanceKm, x.elapsedMin) ? "yes" : "no"), render: (x) => (sowGeoVelocityExample(x.distanceKm, x.elapsedMin) ? <StatusBadge tone="negative">Over 500 km in under 2 h</StatusBadge> : <span className="muted small">—</span>) },
              { key: "case", header: "Investigation", value: (x) => v.rs.events.find((e) => e.id === x.riskEventId)?.caseId ?? "", render: (x) => caseLink(v.rs.events.find((e) => e.id === x.riskEventId)?.caseId ?? null) },
            ]} />
          </Panel>
          <Panel title="Map view" subtitle="Plotted from the supplied coordinates only">
            {g && <GeoPlot ariaLabel="Consecutive scan locations" line points={[g.previous, g.current].filter((p) => p.lat != null && p.lng != null).map((p, i) => ({ lat: p.lat!, lng: p.lng!, label: `${i === 0 ? "Previous" : "Current"} ${p.at.slice(11)}`, tone: i === 0 ? "dark" : "negative" }))} />}
            {g && <p className="small">Mapped branch: {v.mem.members.find((m) => m.id === g.memberId)?.branchCode} · {g.distanceKm != null ? `${g.distanceKm} km` : "distance not supplied"} in {g.elapsedMin ?? "?"} min</p>}
          </Panel>
        </div>
      )}
      {tab === "fence" && (
        <Panel title="Scan geo-fence checks (Retailer and CS)" subtitle={`SOW: scan allowed only within ${SOW.geoFenceMetres} m of the SFDC-registered location. GPS denial and low accuracy are the backend's verdicts; no accuracy threshold is set in the portal (OP-GEO1)`} padded={false}>
          <DataTable rows={v.rs.geoFence} rowKey={(x) => x.id} caption="Geo-fence checks" searchable={false} columns={[
            { key: "id", header: "Check", value: (x) => x.id },
            { key: "m", header: "Member", value: (x) => x.memberId, render: (x) => <span>{memberLink(x.memberId)} <span className="small">{x.programme}</span></span> },
            { key: "r", header: "Registered location", value: (x) => x.registered.source, render: (x) => <span className="small">{x.registered.lat != null ? `${x.registered.lat.toFixed(4)}, ${x.registered.lng!.toFixed(4)}` : "—"} ({x.registered.source})</span> },
            { key: "s", header: "Scan", value: (x) => x.scan.at, render: (x) => <span className="small">{x.scan.scanRef} · {dt(x.scan.at)}</span> },
            { key: "d", header: "Distance", value: (x) => x.distanceM, render: (x) => <span className="num">{x.distanceM != null ? `${x.distanceM} m` : "—"}</span>, align: "right" },
            { key: "a", header: "GPS accuracy", value: (x) => x.accuracyM, render: (x) => <span className="num">{x.accuracyM != null ? `${x.accuracyM} m` : "—"}</span>, align: "right" },
            { key: "res", header: "Geo-validation result", value: (x) => x.result, render: (x) => <StatusBadge tone={x.result === "within" ? "positive" : "negative"}>{x.result.replace("_", " ")}</StatusBadge> },
            { key: "b", header: "Eligibility banner", value: (x) => x.banner ?? "", render: (x) => <span className="small">{x.banner ?? "—"}</span> },
            { key: "o", header: "Override", value: (x) => x.override.status, render: (x) => (x.override.status === "approved" ? <span className="small">{x.override.ref} · {userName(v.acc, x.override.by!)} · {x.override.reason}</span> : x.result === "outside_blocked" && v.canOn("fraud-rules", "execute", x.memberId) ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(approveGeoOverride(v.uid, x.id, reason), "Audited override recorded")}>Approve override</button> : <span className="muted small">—</span>) },
          ]} />
          <div className="form-inline"><TextField label="Override reason" value={reason} onChange={setReason} hint="For legitimate cases such as several branches of the same store. Audited" /></div>
        </Panel>
      )}
      {tab === "store" && (
        <Panel title="Store geo-validation gate (Retailer, DD, CS)" subtitle={`SOW: while SFDC geo-validation is pending, up to ${SOW.storeGeoMaxScans} QR scans and no redemption; from the sixth scan and on any redemption the member is asked to self geo-validate. Both lift when SFDC completes geo-validation. Not reset or overridden by administrators`} padded={false}>
          <DataTable rows={v.rs.storeGeo} rowKey={(x) => x.memberId} caption="Store geo-validation" searchable={false} columns={[
            { key: "m", header: "Member", value: (x) => x.memberId, render: (x) => <span>{memberLink(x.memberId)} <span className="small">{memberName(v.mem, x.memberId)}</span></span> },
            { key: "p", header: "Programme", value: (x) => x.programme },
            { key: "s", header: "Store reference", value: (x) => x.storeRef, render: (x) => <span className="mono small">{x.storeRef}</span> },
            { key: "g", header: "Geo-validation (SFDC)", value: (x) => x.sfdcStatus, render: (x) => <StatusBadge tone={x.sfdcStatus === "validated" ? "positive" : "warning"}>{x.sfdcStatus}</StatusBadge> },
            { key: "c", header: "Scan count", value: (x) => x.scanCount, render: (x) => <span className="num">{x.sfdcStatus === "pending" ? `${x.scanCount} / ${SOW.storeGeoMaxScans}` : "—"}</span>, align: "right" },
            { key: "se", header: "Scan eligibility", value: (x) => (x.sfdcStatus === "validated" || x.scanCount < SOW.storeGeoMaxScans ? "allowed" : "blocked"), render: (x) => (x.sfdcStatus === "validated" || x.scanCount < SOW.storeGeoMaxScans ? "Allowed" : <StatusBadge tone="negative">Blocked</StatusBadge>) },
            { key: "re", header: "Redemption eligibility", value: (x) => (x.sfdcStatus === "validated" ? "allowed" : "blocked"), render: (x) => (x.sfdcStatus === "validated" ? "Allowed" : <StatusBadge tone="negative">Blocked</StatusBadge>) },
            { key: "w", header: "Member Management address", value: (x) => v.mem.members.find((m) => m.id === x.memberId)?.addresses.working?.verification ?? "", render: (x) => <span className="small">{v.mem.members.find((m) => m.id === x.memberId)?.addresses.working?.verification?.replace("_", " ") ?? "—"}</span> },
            { key: "ls", header: "Last sync", value: (x) => x.lastSync ?? "", render: (x) => <span className="small">{dt(x.lastSync)}</span> },
            { key: "vr", header: "Validation reference", value: (x) => x.validationRef ?? "", render: (x) => <span className="mono small">{x.validationRef ?? "—"}</span> },
          ]} />
        </Panel>
      )}
      {tab === "leak" && (
        <Panel title="Branch leakage" subtitle="Scans outside the member's mapped branch or territory. A member's branch is never changed by a fraud flag: corrections go to Data Integrity reconciliation" padded={false}>
          <DataTable rows={v.rs.leaks} rowKey={(x) => x.id} caption="Branch leakage events" searchable={false} columns={[
            { key: "id", header: "Event", value: (x) => x.id },
            { key: "m", header: "Member", value: (x) => x.memberId, render: (x) => <span>{memberLink(x.memberId)} <span className="small">{x.programme}</span></span> },
            { key: "b", header: "Mapped branch", value: (x) => x.mappedBranch, render: (x) => <span className="mono small">{x.mappedBranch}</span> },
            { key: "t", header: "Mapped territory", value: (x) => x.mappedTerritory },
            { key: "s", header: "Scan branch", value: (x) => x.scanBranch, render: (x) => <span className="mono small">{x.scanBranch}</span> },
            { key: "d", header: "Scan date", value: (x) => x.scanAt, render: (x) => <span className="small">{dt(x.scanAt)}</span> },
            { key: "det", header: "Mismatch", value: (x) => x.detail, render: (x) => <span className="small">{x.detail}</span> },
            { key: "src", header: "Mapping source", value: (x) => x.mappingSource },
            { key: "r", header: "Reconciliation", value: (x) => x.reconciliationRef ?? "", render: (x) => (x.reconciliationRef ? <Link to={`${FBASE}/data`} className="mono small">{x.reconciliationRef}</Link> : v.can("fraud-rules:edit") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(routeLeakToReconciliation(v.uid, x.id), "Routed to reconciliation")}>Route to reconciliation</button> : "—") },
            { key: "c", header: "Investigation", value: (x) => v.rs.events.find((e) => e.id === x.riskEventId)?.caseId ?? "", render: (x) => caseLink(v.rs.events.find((e) => e.id === x.riskEventId)?.caseId ?? null) },
          ]} />
        </Panel>
      )}
    </>
  );
}

/* ======================= Redemption risk ======================= */

export function RedemptionRiskPage() {
  const v = useFraudView();
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  return (
    <>
      <SectionTitle title="Redemption risk monitoring" description="Redemptions blocked by a risk trigger at the authoritative redemption service. A block is never silent: admins are warned through the Communication Centre, the event enters the review queue, and the original redemption is kept" />
      <Notice tone="info">Lifting a risk block needs approval (WF-034) and is refused while a member restriction is still active; member reinstatement stays in Member Management. The original risk flag and redemption history are kept.</Notice>
      <PolicyMessages result={result} />
      <Panel title="Redemption risk queue" padded={false}>
        <DataTable rows={v.rs.redemptionBlocks.filter((b) => v.canOn("fraud-rules", "view", b.memberId))} rowKey={(b) => b.id} caption="Redemption risk blocks" searchable={false} columns={[
          { key: "r", header: "Redemption", value: (b) => b.redemptionRef, render: (b) => <Link to={`/redemption/request/${b.redemptionRef}`} className="mono small">{b.redemptionRef}</Link> },
          { key: "m", header: "Member", value: (b) => b.memberId, render: (b) => memberLink(b.memberId) },
          { key: "p", header: "Programme", value: (b) => b.programme },
          { key: "me", header: "Method", value: (b) => b.method },
          { key: "a", header: "Amount", value: (b) => b.amountInr, render: (b) => <span className="num">₹{b.amountInr.toLocaleString("en-IN")} · {b.points.toLocaleString("en-IN")} pts</span>, align: "right" },
          { key: "t", header: "Risk trigger", value: (b) => b.trigger, render: (b) => <span className="small">{b.trigger}</span> },
          { key: "pr", header: "Provider response", value: (b) => b.providerResponse, render: (b) => <span className="small">{b.providerResponse}</span> },
          { key: "d", header: "Detected", value: (b) => b.detectedAt, render: (b) => <span className="small">{dt(b.detectedAt)}</span> },
          { key: "s", header: "Block status", value: (b) => b.blockStatus, render: (b) => <StatusBadge tone={b.blockStatus === "blocked" ? "negative" : "positive"}>{b.blockStatus}</StatusBadge> },
          { key: "w", header: "Admin warning", value: (b) => b.warning.status, render: (b) => (b.warning.status === "sent" ? <span className="small">Sent {commLink(b.warning.alertRef)}</span> : <StatusBadge tone="negative">Not sent</StatusBadge>) },
          { key: "mr", header: "Member restriction", value: (b) => restrictionState(v.mem, b.memberId), render: (b) => <span className="small">{restrictionState(v.mem, b.memberId)}</span> },
          { key: "i", header: "Investigation", value: (b) => b.riskEventId ?? "", render: (b) => <span className="small mono">{b.riskEventId} {caseLink(v.rs.events.find((e) => e.id === b.riskEventId)?.caseId ?? null)}</span> },
          { key: "l", header: "Lift", value: (b) => b.lift?.approvalRef ?? "", render: (b) => (b.lift ? <span className="small">{userName(v.acc, b.lift.by)} · {dt(b.lift.at)} · {approvalLink(b.lift.approvalRef)}</span> : b.blockStatus === "blocked" && v.can("fraud-rules:submit") ? <button type="button" className="btn btn--tertiary btn--xs" onClick={() => run(requestRedemptionRelease(v.uid, b.id, reason), "Release submitted for approval")}><Send size={12} aria-hidden="true" />Request release</button> : "—") },
        ]} />
      </Panel>
      {v.can("fraud-rules:submit") && <TextField label="Release reason" value={reason} onChange={setReason} hint="Required" />}
      <p className="small muted">Triggers are the backend rule outputs; no additional trigger rules are defined in the portal.</p>
    </>
  );
}
