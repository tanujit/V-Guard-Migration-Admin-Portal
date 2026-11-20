import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BarChart3, Bell, BookOpen, Bot, CalendarClock, ClipboardList, FileText, Headset, History, Image, Link2, ListChecks, Mail, MessageCircle, MessageSquare, PenSquare, Settings2, Smartphone, Users, Workflow, Zap } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/primitives";
import { ATTEMPT_STATUS, CHANNEL, COMM_STATUS } from "@/config/commsCatalogue";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { hasPermission, type AccessState, type PolicyResult } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { demoNow, useApprovalState } from "@/features/approvals/store";
import { geoOfMember, type MemberState } from "@/features/members/engine";
import { useMemberState } from "@/features/members/store";
import { useCommsState } from "@/features/comms/store";
import { formatDateTime } from "@/lib/format";
import type { ActionId } from "@/types/rbac";
import type { Member } from "@/types/members";
import type { AttemptStatus, Channel, CommStatus, CommsState } from "@/types/comms";
import { MastersLayout, userName } from "@/pages/masters/shared";

export { userName };
export const CBASE = "/masters/communication";

export function CommsLayout() {
  return (
    <MastersLayout
      title="Communication & helpdesk"
      description="Omnichannel notifications N01–N11, templates in eight languages, composer, delivery monitoring, WhatsApp bot, helpdesk, self-service content, banners and surveys (SOW Module 7 and 10.8)"
      permission="communication:view"
      badge="Development communication data"
      meta="Development / demo data. WhatsApp, SMS, email, push and in-app providers are mock adapters: nothing is sent to members. The member app inbox and the WhatsApp bot are not connected"
      tabs={[
        { to: CBASE, end: true, label: "Overview", icon: BarChart3 },
        { to: `${CBASE}/compose`, label: "Compose", icon: PenSquare },
        { to: `${CBASE}/catalogue`, label: "Notification catalogue", icon: Bell, perm: "comm-templates:view" },
        { to: `${CBASE}/templates`, label: "Templates", icon: FileText, perm: "comm-templates:view" },
        { to: `${CBASE}/scheduled`, label: "Scheduled", icon: CalendarClock },
        { to: `${CBASE}/rules`, label: "Automated rules", icon: Zap },
        { to: `${CBASE}/history`, label: "History", icon: History },
        { to: `${CBASE}/delivery`, label: "Delivery", icon: ListChecks },
        { to: `${CBASE}/audiences`, label: "Audiences", icon: Users },
        { to: `${CBASE}/bot`, label: "WhatsApp bot", icon: Bot, perm: "comm-bot:view" },
        { to: `${CBASE}/helpdesk`, label: "Helpdesk", icon: Headset, perm: "tickets:view" },
        { to: `${CBASE}/content`, label: "Self-service", icon: BookOpen, perm: "content:view" },
        { to: `${CBASE}/banners`, label: "Banners & scrollers", icon: Image, perm: "banners:view" },
        { to: `${CBASE}/media`, label: "Tutorials & testimonials", icon: Workflow, perm: "content:view" },
        { to: `${CBASE}/links`, label: "Social & contact", icon: Link2, perm: "content:view" },
        { to: `${CBASE}/surveys`, label: "Surveys", icon: ClipboardList, perm: "surveys:view" },
        { to: `${CBASE}/config`, label: "Configuration", icon: Settings2 },
      ]}
    />
  );
}

export interface CommsView {
  cs: CommsState;
  mem: MemberState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  now: string;
  approvals: ReturnType<typeof useApprovalState>;
  canOn: (module: string, action: ActionId, programme?: string) => boolean;
  inScope: (m: Member) => boolean;
}

export function useCommsView(): CommsView {
  const cs = useCommsState();
  const mem = useMemberState();
  const acc = useAccessState();
  const approvals = useApprovalState();
  const { user, can } = useSession();
  const uid = user!.id;
  const inScope = useMemo(() => (m: Member) => hasPermission(acc, uid, "communication", "view", { programme: m.programme, geo: geoOfMember(m) }).allowed, [acc, uid]);
  return { cs, mem, acc, uid, can, now: demoNow(), approvals, canOn: (module, action, programme) => hasPermission(acc, uid, module, action, programme ? { programme } : {}).allowed, inScope };
}

export function useRun() {
  const { notify } = useToast();
  const [result, setResult] = useState<PolicyResult | null>(null);
  const run = <T extends PolicyResult>(r: T, ok: string): T => {
    setResult(r.ok && !r.warnings.length ? null : r);
    if (r.ok) notify(ok, "positive");
    return r;
  };
  return { result, setResult, run };
}

export function useParam(key: string, fallback = ""): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  return [value, (v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== fallback) next.set(key, v);
    else next.delete(key);
    setParams(next, { replace: true });
  }];
}

export const dt = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : "—");
export const CHANNEL_ICON: Record<Channel, LucideIcon> = { whatsapp: MessageCircle, sms: MessageSquare, email: Mail, push: Bell, inapp: Smartphone };
export const ChannelTag = ({ ch }: { ch: Channel }) => {
  const I = CHANNEL_ICON[ch];
  return (
    <span className={`channel-tag channel-tag--${ch}`}>
      <I size={12} aria-hidden="true" />
      {CHANNEL[ch].short}
    </span>
  );
};
export const CommBadge = ({ status }: { status: CommStatus }) => <StatusBadge tone={COMM_STATUS[status].tone}>{COMM_STATUS[status].label}</StatusBadge>;
export const AttemptBadge = ({ status }: { status: AttemptStatus }) => <span title={ATTEMPT_STATUS[status].meaning}><StatusBadge tone={ATTEMPT_STATUS[status].tone}>{ATTEMPT_STATUS[status].label}</StatusBadge></span>;
export const BcrTag = ({ children = "Business confirmation required" }: { children?: ReactNode }) => <span className="bcr-tag"><AlertTriangle size={12} aria-hidden="true" />{children}</span>;
export const ContentBadge = ({ status }: { status: string }) => <StatusBadge tone={status === "published" || status === "active" || status === "complete" ? "positive" : status === "pending_approval" ? "warning" : status === "expired" || status === "rejected" ? "negative" : "neutral"}>{status.replace(/_/g, " ")}</StatusBadge>;
export const approvalLink = (id: string | null | undefined) => (id ? <Link to={`/governance/approvals/request/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const commLink = (id: string) => <Link to={`${CBASE}/history/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link>;
export function DecisionRef({ id, label }: { id: string; label?: string }) {
  return <Link to={`${CBASE}/config?tab=decisions#${id}`} className="decision-ref mono">{label ?? id}</Link>;
}

export interface Kpi {
  id: string;
  label: string;
  value: number;
  desc: string;
  icon: LucideIcon;
  variant?: "primary" | "dark" | "light" | "status";
  tone?: "positive" | "warning" | "negative";
  onSelect: () => void;
}
export function KpiRow({ items, cols = 4 }: { items: Kpi[]; cols?: 4 | 5 }) {
  return (
    <div className={`kpi-grid ${cols === 5 ? "kpi-grid--5" : ""}`}>
      {items.map((k) => (
        <div key={k.id}>
          <KpiCard metric={{ id: k.id, label: k.label, value: k.value, format: "count", description: k.desc, goodDirection: "neutral", reference: "Select to open the filtered list", drill: { module: "communication", title: k.label } }} onSelect={k.onSelect} variant={k.variant ?? "light"} tone={k.tone} icon={k.icon} compact />
        </div>
      ))}
    </div>
  );
}

/** Administrative mobile-style preview. Not the member app. */
export function PhonePreview({ channel, title, body, footer, lang }: { channel: Channel; title?: string; body: string; footer?: string; lang?: string }) {
  return (
    <div className={`phone phone--${channel}`} aria-label={`${CHANNEL[channel].label} preview`}>
      <div className="phone__bar">
        <ChannelTag ch={channel} /> <span className="small muted">Preview{lang ? ` · ${lang}` : ""} · not the member app</span>
      </div>
      <div className={`phone__msg phone__msg--${channel}`}>
        {title && <strong className="phone__title">{title}</strong>}
        <p className="phone__body">{body || <span className="muted">Empty</span>}</p>
        {footer && <span className="phone__footer small muted">{footer}</span>}
      </div>
    </div>
  );
}

export const memberLabel = (mem: MemberState, id: string) => mem.members.find((m) => m.id === id)?.name ?? id;
export { MessageCircle };
