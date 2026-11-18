import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CheckCircle2, Eye, Layers, LogIn, ShieldAlert, Smartphone, Unlock, Users } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { SelectField, StatusBadge } from "@/components/ui/primitives";
import { Checkbox, TextField } from "@/components/form/Form";
import { clearDeviceReview, deviceImpact, deviceLocations, requestDeviceBlock, requestDeviceRelease } from "@/features/risk/store";
import type { Device } from "@/types/risk";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid } from "@/pages/masters/shared";
import { GeoPlot } from "./GeoPlot";
import { DecisionRef, EventStatus, FBASE, VectorTag, approvalLink, caseLink, deviceLink, dt, memberLink, memberName, useFraudView, useParam, useRun, userName } from "./shared";

const DevBadge = ({ d }: { d: Device }) => <StatusBadge tone={d.status === "blocked" ? "negative" : "positive"}>{d.status === "blocked" ? "Blocked" : d.actions.some((a) => a.action === "release" && a.status === "executed") ? "Active (released)" : "Active"}</StatusBadge>;
const InvBadge = ({ s }: { s: Device["investigation"] }) => <StatusBadge tone={s === "under_review" ? "warning" : s === "confirmed" ? "negative" : s === "cleared" ? "positive" : "neutral"}>{s === "none" ? "None" : s.replace("_", " ")}</StatusBadge>;

export function DeviceGovernancePage() {
  const v = useFraudView();
  const nav = useNavigate();
  const [status, setStatus] = useParam("status");
  const [inv, setInv] = useParam("investigation");
  const [member, setMember] = useParam("member");
  const [programme, setProgramme] = useParam("programme");
  const [view, setView] = useParam("view", "directory");
  const d = v.rs.devices;
  const progOf = (x: Device) => [...new Set(x.associations.map((a) => v.mem.members.find((m) => m.id === a.memberId)?.programme).filter(Boolean))] as string[];
  const multi = d.filter((x) => x.associations.length > 1);
  const memberDevices = (id: string) => d.filter((x) => x.associations.some((a) => a.memberId === id)).length;
  const hoppers = [...new Set(d.flatMap((x) => x.associations.map((a) => a.memberId)))].filter((id) => memberDevices(id) > 1);
  const rows = d.filter((x) => (!status || (status === "released" ? x.actions.some((a) => a.action === "release" && a.status === "executed") : x.status === status)) && (!inv || x.investigation === inv) && (!member || x.associations.some((a) => a.memberId.includes(member.trim()))) && (!programme || progOf(x).includes(programme)));
  const logins = d.flatMap((x) => x.logins).filter((l) => l.at >= "2026-11-01");
  return (
    <>
      <SectionTitle title="Device farming & device governance" description="Device and IMEI history, shared-device visibility, device farming review and controlled block / release (SOW 3.2, 9.2). One profile may be created per device across all programmes, but several existing profiles may log in on the same device" />
      <Notice tone="info">Shared-device logins are allowed by design (for example a Sales Rep or shop owner helping influencers), so they are never blocked automatically. Profile creation on a device that already holds a profile is rejected by the identity service. What counts as farming is the device risk service's rule, not a count chosen here (<DecisionRef id="OP-DEV1" />).</Notice>
      <KpiGrid cols={5} items={[
        { id: "t", label: "Registered devices", value: d.length, desc: "Device governance service (mock)", icon: Smartphone, variant: "primary", onSelect: () => { setStatus(""); setInv(""); } },
        { id: "a", label: "Active devices", value: d.filter((x) => x.status === "active").length, desc: "Not blocked", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: () => setStatus("active") },
        { id: "m", label: "Devices linked to multiple accounts", value: multi.length, desc: "Shared use is not itself fraud", icon: Users, variant: "light", onSelect: () => setView("farming") },
        { id: "s", label: "Devices with suspicious scanning", value: v.rs.events.filter((e) => e.vector === "device_farming").flatMap((e) => e.links.deviceIds).filter((x, i, a) => a.indexOf(x) === i).length, desc: "Flagged by the device risk service", icon: ShieldAlert, variant: "status", tone: "warning", onSelect: () => setView("farming") },
        { id: "h", label: "Members using multiple devices", value: hoppers.length, desc: "Across their logins", icon: Layers, variant: "light", onSelect: () => setView("members") },
        { id: "u", label: "Devices under investigation", value: d.filter((x) => x.investigation === "under_review").length, desc: "Pending review", icon: Eye, variant: "light", onSelect: () => setInv("under_review") },
        { id: "b", label: "Blocked devices", value: d.filter((x) => x.status === "blocked").length, desc: "Approved blocks", icon: Ban, variant: "status", tone: "negative", onSelect: () => setStatus("blocked") },
        { id: "r", label: "Released devices", value: d.filter((x) => x.actions.some((a) => a.action === "release" && a.status === "executed")).length, desc: "Block lifted", icon: Unlock, variant: "light", onSelect: () => setStatus("released") },
        { id: "p", label: "Pending device reviews", value: d.filter((x) => x.actions.some((a) => a.status === "pending_approval")).length, desc: "Awaiting approval", icon: Eye, variant: "light", onSelect: () => setInv("") },
        { id: "l", label: "Recent login events", value: logins.length, desc: "Since 1 November", icon: LogIn, variant: "light", onSelect: () => setView("directory") },
      ]} />
      <div className="filters-bar">
        <SelectField label="View" value={view} onChange={setView} options={[{ value: "directory", label: "Device and IMEI directory" }, { value: "farming", label: "Device farming review" }, { value: "members", label: "Members on several devices" }]} />
        <TextField label="Member ID" value={member} onChange={setMember} />
        <SelectField label="Programme" value={programme} onChange={setProgramme} active={!!programme} options={[{ value: "", label: "All programmes" }, ...["EP", "ST", "CS", "Retailer", "DD"].map((p) => ({ value: p, label: p }))]} />
        <SelectField label="Device status" value={status} onChange={setStatus} active={!!status} options={[{ value: "", label: "Any" }, { value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }, { value: "released", label: "Released" }]} />
        <SelectField label="Investigation" value={inv} onChange={setInv} active={!!inv} options={[{ value: "", label: "Any" }, { value: "under_review", label: "Under review" }, { value: "cleared", label: "Cleared" }, { value: "confirmed", label: "Confirmed" }, { value: "none", label: "None" }]} />
      </div>
      {view === "members" ? (
        <Panel title="Members using several devices" padded={false}>
          <DataTable rows={hoppers.map((id) => ({ id, devices: d.filter((x) => x.associations.some((a) => a.memberId === id)) }))} rowKey={(x) => x.id} caption="Members on multiple devices" searchable={false} columns={[
            { key: "m", header: "Member", value: (x) => x.id, render: (x) => <span>{memberLink(x.id)} <span className="small">{memberName(v.mem, x.id)}</span></span> },
            { key: "n", header: "Devices", value: (x) => x.devices.length, align: "right" },
            { key: "d", header: "Device references", value: (x) => x.devices.map((y) => y.id).join(", "), render: (x) => <span>{x.devices.map((y) => <span key={y.id}>{deviceLink(y.id)} </span>)}</span> },
            { key: "e", header: "Risk events", value: (x) => v.rs.events.filter((e) => e.vector === "device_farming" && e.links.memberIds.includes(x.id)).length, align: "right" },
          ]} />
        </Panel>
      ) : (
        <Panel title={view === "farming" ? "Device farming review" : `${rows.length} device(s)`} subtitle="Identifiers are masked" padded={false}>
          <DataTable rows={view === "farming" ? rows.filter((x) => x.associations.length > 1 || x.investigation !== "none") : rows} rowKey={(x) => x.id} caption="Devices" onRowClick={(x) => nav(`${FBASE}/devices/${x.id}`)} exportName={v.can("devices:export") ? "devices" : undefined} pageSize={15} columns={[
            { key: "id", header: "Device reference", value: (x) => x.id, render: (x) => deviceLink(x.id) },
            { key: "i", header: "Masked IMEI / device ID", value: (x) => x.imeiMasked, render: (x) => <span className="mono small">{x.imeiMasked} · {x.identifierMasked}</span> },
            { key: "t", header: "Type", value: (x) => x.type },
            { key: "f", header: "First seen", value: (x) => x.firstSeen, render: (x) => <span className="small">{dt(x.firstSeen)}</span> },
            { key: "l", header: "Last seen", value: (x) => x.lastSeen, render: (x) => <span className="small">{dt(x.lastSeen)}</span> },
            { key: "c", header: "Profile created", value: (x) => x.createdProfile ?? "", render: (x) => memberLink(x.createdProfile) },
            { key: "n", header: "Associated members", value: (x) => x.associations.length, align: "right" },
            { key: "p", header: "Programme(s)", value: (x) => progOf(x).join(", ") },
            { key: "rej", header: "Rejected creations", value: (x) => x.logins.filter((l) => l.outcome === "profile_creation_rejected").length, align: "right" },
            { key: "ll", header: "Last login", value: (x) => x.logins.slice(-1)[0]?.at ?? "", render: (x) => <span className="small">{dt(x.logins.slice(-1)[0]?.at)}{v.can("devices:view_sensitive") ? ` · ${x.logins.slice(-1)[0]?.location ?? ""}` : ""}</span> },
            { key: "s", header: "Device status", value: (x) => x.status, render: (x) => <DevBadge d={x} /> },
            { key: "inv", header: "Investigation", value: (x) => x.investigation, render: (x) => <InvBadge s={x.investigation} /> },
          ]} />
        </Panel>
      )}
    </>
  );
}

export function DeviceDetailPage() {
  const { deviceId = "" } = useParams();
  const v = useFraudView();
  const { result, run } = useRun();
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [showLoc, setShowLoc] = useState(false);
  const d = v.rs.devices.find((x) => x.id === deviceId);
  if (!d) return <Notice tone="danger">Device {deviceId} not found. <Link to={`${FBASE}/devices`}>Back to devices</Link></Notice>;
  const impact = deviceImpact(d.id);
  const loc = showLoc ? deviceLocations(v.uid, d.id) : null;
  const events = v.rs.events.filter((e) => e.links.deviceIds.includes(d.id));
  const pending = d.actions.find((a) => a.status === "pending_approval");
  return (
    <>
      <div className="wallet-head">
        <div>
          <Link to={`${FBASE}/devices`} className="btn btn--ghost btn--sm"><ArrowLeft size={14} aria-hidden="true" />Devices</Link>
          <h2 className="wallet-head__title">{d.id} <DevBadge d={d} /> <InvBadge s={d.investigation} /></h2>
          <p className="muted small"><span className="mono">{d.imeiMasked}</span> · <span className="mono">{d.identifierMasked}</span> · {d.type} · first seen {dt(d.firstSeen)} · last seen {dt(d.lastSeen)}</p>
        </div>
      </div>
      <PolicyMessages result={result} />
      <div className="grid-2 grid-2--wide-left">
        <Panel title="Linked accounts" subtitle="Profile created on this device and existing profiles that logged in">
          <DataTable rows={impact} rowKey={(a) => a.memberId} caption="Device associations" searchable={false} columns={[
            { key: "m", header: "Member", value: (a) => a.memberId, render: (a) => <span>{memberLink(a.memberId)} <span className="small">{a.member?.name}</span></span> },
            { key: "p", header: "Programme", value: (a) => a.member?.programme ?? "" },
            { key: "k", header: "Association", value: (a) => a.kind, render: (a) => (a.kind === "created_profile" ? <StatusBadge tone="info">Profile created here</StatusBadge> : <span className="small">Existing profile login (shared device)</span>) },
            { key: "r", header: "Member restrictions", value: (a) => a.restrictions.join(", "), render: (a) => <span className="small">{a.restrictions.join(", ") || "None"}</span> },
          ]} />
        </Panel>
        <Panel title="Block and release" subtitle="Separate from Program Block and Temporary Hold. Impact review, reason and approval (WF-036) are required">
          {pending && <Notice tone="warn">{pending.action === "block" ? "Block" : "Release"} {pending.id} awaiting approval {approvalLink(pending.approvalRequestId)}</Notice>}
          {d.status === "active" && v.can("devices:disable") && !pending && (
            <>
              <p className="small">Confirm the impact on each linked account:</p>
              {impact.map((a) => <Checkbox key={a.memberId} label={`${a.memberId} · ${a.member?.name ?? ""} loses this device`} checked={reviewed.includes(a.memberId)} onChange={(x) => setReviewed(x ? [...reviewed, a.memberId] : reviewed.filter((y) => y !== a.memberId))} />)}
              <TextField label="Reason (mandatory)" value={reason} onChange={setReason} />
              <button type="button" className="btn btn--danger btn--sm" onClick={() => run(requestDeviceBlock(v.uid, d.id, reason, reviewed), "Block requested (awaiting approval)")}><Ban size={14} aria-hidden="true" />Request device block</button>
            </>
          )}
          {d.status === "blocked" && v.can("devices:manage") && !pending && (
            <>
              <TextField label="Reason (mandatory)" value={reason} onChange={setReason} />
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(requestDeviceRelease(v.uid, d.id, reason), "Release requested (awaiting approval)")}><Unlock size={14} aria-hidden="true" />Request device release</button>
            </>
          )}
          {d.investigation === "under_review" && v.can("devices:edit") && <div className="form-inline"><TextField label="Review remarks" value={reason} onChange={setReason} /><button type="button" className="btn btn--ghost btn--sm" onClick={() => run(clearDeviceReview(v.uid, d.id, reason), "Device review cleared")}>Clear review without a block</button></div>}
          <h4>Block history</h4>
          <ul className="activity-list">{[...d.actions].reverse().map((a) => <li key={a.id} className="small"><strong>{a.action}</strong> {a.status.replace("_", " ")} · {a.previous} → {a.next} · {a.reason} <span className="muted">requested {dt(a.requestedAt)} by {userName(v.acc, a.requestedBy)}{a.executedAt ? ` · executed ${dt(a.executedAt)}` : ""}</span> {approvalLink(a.approvalRequestId)}</li>)}{!d.actions.length && <li className="muted small">No block history</li>}</ul>
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Device login location history" subtitle="Sensitive: needs Device & security: View sensitive" actions={!showLoc && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowLoc(true)}><Eye size={14} aria-hidden="true" />Show locations</button>}>
          {loc && !loc.ok && <Notice tone="danger">{loc.errors[0]}</Notice>}
          {loc?.ok && loc.logins && (
            <>
              <GeoPlot ariaLabel={`Login locations for ${d.id}`} line points={loc.logins.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat!, lng: l.lng!, label: `${l.memberId.slice(-4)} ${l.at.slice(5, 10)}`, tone: l.outcome === "success" ? "accent" : "negative" }))} />
              <DataTable rows={loc.logins} rowKey={(l) => l.id} caption="Device logins" searchable={false} pageSize={8} columns={[
                { key: "at", header: "Timestamp", value: (l) => l.at, render: (l) => <span className="small">{dt(l.at)}</span> },
                { key: "m", header: "Member", value: (l) => l.memberId, render: (l) => memberLink(l.memberId) },
                { key: "o", header: "Outcome", value: (l) => l.outcome, render: (l) => (l.outcome === "success" ? "Login" : <StatusBadge tone="negative">Profile creation rejected</StatusBadge>) },
                { key: "ll", header: "Latitude / longitude", value: (l) => `${l.lat ?? ""},${l.lng ?? ""}`, render: (l) => <span className="mono small">{l.lat != null ? `${l.lat.toFixed(3)}, ${l.lng!.toFixed(3)}` : "Not captured"}</span> },
                { key: "loc", header: "Location", value: (l) => l.location },
                { key: "s", header: "Session", value: (l) => l.sessionRef, render: (l) => <span className="mono small">{l.sessionRef}</span> },
                { key: "v", header: "App version", value: (l) => l.appVersion ?? "", render: (l) => <span className="small">{l.appVersion ?? "—"}</span> },
              ]} />
            </>
          )}
          {!loc && <p className="small muted">{d.logins.length} login event(s) recorded. Locations stay hidden until requested.</p>}
        </Panel>
        <Panel title="Associated risk events">
          <ul className="check-list">{events.map((e) => <li key={e.id} className="small"><span className="mono">{e.id}</span> <VectorTag v={e.vector} /> {e.context} <EventStatus s={e.status} /> {caseLink(e.caseId)}</li>)}{!events.length && <li className="muted small">None</li>}</ul>
        </Panel>
      </div>
    </>
  );
}
