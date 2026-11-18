import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, PauseCircle, ShieldBan } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { SelectField } from "@/components/ui/primitives";
import { MPIN_POLICY } from "@/config/memberProgrammes";
import { useToast } from "@/context/ToastContext";
import { canOn, maskMobile } from "@/features/members/engine";
import { triggerMpinReset } from "@/features/members/store";
import { formatDateTime } from "@/lib/format";
import type { MpinReset } from "@/types/members";
import { AccessDenied, ReasonDialog, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { KpiGrid } from "@/pages/masters/shared";
import { RestrictionsTable } from "./Member360Page";
import { RegBadge, useMemberView, userName } from "./shared";

export function RestrictionsPage() {
  const v = useMemberView();
  const ids = new Set(v.visible.map((m) => m.id));
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("active");
  const rows = v.s.restrictions.filter((r) => r.memberIds.some((id) => ids.has(id)) && (type === "all" || r.type === type) && (status === "all" || (status === "active" ? r.status !== "lifted" : r.status === status)));
  const all = v.s.restrictions.filter((r) => r.memberIds.some((id) => ids.has(id)));
  return (
    <>
      <SectionTitle title="Member status & restrictions" description="Program Block restricts one programme. Temporary Hold restricts every programme linked to the same KYC identity" />
      <KpiGrid cols={4} items={[
        { id: "pb", label: "Active Program Blocks", value: all.filter((r) => r.type === "program_block" && r.status !== "lifted").length, desc: "One programme each", variant: "status", tone: "negative", icon: ShieldBan, onSelect: () => { setType("program_block"); setStatus("active"); } },
        { id: "th", label: "Active Temporary Holds", value: all.filter((r) => r.type === "temporary_hold" && r.status !== "lifted").length, desc: "Across linked programmes", variant: "status", tone: "negative", icon: PauseCircle, onSelect: () => { setType("temporary_hold"); setStatus("active"); } },
        { id: "dd", label: "De-duplication holds", value: all.filter((r) => r.trigger !== "manual" && r.status !== "lifted").length, desc: "System-triggered by the identity service", variant: "light", icon: PauseCircle, onSelect: () => { setType("temporary_hold"); setStatus("active"); } },
        { id: "rp", label: "Reinstatement pending", value: all.filter((r) => r.status === "reinstatement_pending").length, desc: "Awaiting second-person approval", variant: "status", tone: "warning", icon: KeyRound, onSelect: () => { setType("all"); setStatus("reinstatement_pending"); } },
      ]} />
      <Notice tone="info">De-duplication matching (mobile in real time; Aadhaar, PAN and bank in the nightly batch) belongs to the identity service. This portal only shows the events it supplies, with identifiers masked. Lifting any restriction needs a second-person approval (OP-BLK1 open for the detailed SOP).</Notice>
      <div className="btn-row">
        <SelectField label="Type" value={type} onChange={setType} options={[{ value: "all", label: "All" }, { value: "program_block", label: "Program block" }, { value: "temporary_hold", label: "Temporary hold" }]} active={type !== "all"} />
        <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Active or pending" }, { value: "reinstatement_pending", label: "Reinstatement pending" }, { value: "lifted", label: "Lifted" }, { value: "all", label: "All" }]} active={status !== "all"} />
      </div>
      <RestrictionsTable rows={rows} showMember />
    </>
  );
}

export function MpinPage() {
  const v = useMemberView();
  const { notify } = useToast();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  if (!v.can("members:reset_credentials")) return <AccessDenied message="MPIN reset needs Member management: Reset credentials." />;
  const digits = q.replace(/\D/g, "");
  const hits = q.trim().length < 4 ? [] : v.visible.filter((m) => m.id.toLowerCase() === q.trim().toLowerCase() || (digits.length === 10 && m.mobile.replace(/\D/g, "").endsWith(digits))).slice(0, 5);
  const last = (id: string) => [...v.s.mpinResets].reverse().find((r) => r.memberId === id);
  const m = v.s.members.find((x) => x.id === target);
  return (
    <>
      <SectionTitle title="MPIN reset administration" description="Search by exact Member ID or full registered mobile. The existing MPIN is never shown, and no MPIN is generated or stored here" />
      <Notice tone="warn">OP-MPIN1 is open: verification method {MPIN_POLICY.verificationMethod ?? "not confirmed"}, MPIN length {MPIN_POLICY.length ?? "not confirmed (4 or 6)"}, lockout policy {MPIN_POLICY.lockout ?? "not confirmed"}. This screen only triggers a reset request through the mock credential service.</Notice>
      <Panel level={3}>
        <SearchInput value={q} onChange={setQ} placeholder="Member ID (e.g. MBR-EP-0005) or 10-digit mobile" label="Find member for MPIN reset" />
        {hits.map((x) => (
          <div key={x.id} className="mpin-hit">
            <dl className="kv kv--tight">
              <div className="kv__row"><dt>Member</dt><dd><Link to={`/members/member/${x.id}`} className="mono">{x.id}</Link> · {x.name} · {x.programme}</dd></div>
              <div className="kv__row"><dt>Mobile</dt><dd className="mono">{maskMobile(x.mobile)}</dd></div>
              <div className="kv__row"><dt>Account status</dt><dd><RegBadge status={x.status} /> · MPIN {x.registration.mpin.replace("_", " ")}</dd></div>
              <div className="kv__row"><dt>Last reset event</dt><dd>{last(x.id) ? `${last(x.id)!.id} · ${formatDateTime(last(x.id)!.at)} · ${last(x.id)!.status}` : "None recorded"}</dd></div>
            </dl>
            {canOn(v.acc, v.uid, "members", "reset_credentials", x).allowed ? <button type="button" className="btn btn--dark btn--sm" onClick={() => setTarget(x.id)}><KeyRound size={14} strokeWidth={2} aria-hidden="true" />Trigger reset</button> : <p className="small neg">Outside your scope for MPIN reset</p>}
          </div>
        ))}
        {q.trim().length >= 4 && !hits.length && <p className="muted small">No member in your scope matches exactly.</p>}
      </Panel>
      <Panel level={3} title="Reset requests" padded={false}>
        <DataTable rows={v.s.mpinResets} rowKey={(r) => r.id} caption="MPIN reset requests" searchable={false} initialSort={{ key: "at", dir: "desc" }} emptyTitle="No reset requests yet" columns={[
          { key: "id", header: "Request", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
          { key: "m", header: "Member", value: (r) => r.memberId, render: (r) => <Link to={`/members/member/${r.memberId}`} className="mono small">{r.memberId}</Link> },
          { key: "at", header: "Time", value: (r) => r.at, render: (r) => <span className="small num">{formatDateTime(r.at)}</span> },
          { key: "by", header: "Requested by", value: (r) => userName(v.acc, r.by) },
          { key: "reason", header: "Reason", value: (r) => r.reason, render: (r) => <span className="small cell-wrap">{r.reason}</span> },
          { key: "st", header: "Status", value: (r) => r.status },
          { key: "res", header: "Result", value: (r) => r.result, render: (r) => <span className="small cell-wrap">{r.result}</span> },
        ] as Column<MpinReset>[]} />
      </Panel>
      <ReasonDialog open={!!m} title={`Trigger MPIN reset · ${m?.id}`} confirmLabel="Trigger reset" tone="danger" body="The member completes the configured recovery step. This action is audited." onClose={() => setTarget(null)} onConfirm={(r) => { const out = triggerMpinReset(v.uid, m!.id, r); if (out.ok) notify(`Reset initiated (${out.id})`, "positive"); return out; }} />
    </>
  );
}
