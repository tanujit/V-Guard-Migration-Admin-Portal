import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BarChart3, Boxes, ClipboardList, FileClock, FileText, FolderTree, Gift, History, IdCard, Layers, PackageCheck, Settings2, Ticket, Truck, Undo2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/primitives";
import { AVAILABILITY, GIFT_TYPE, ORDER_STATUS, RECOVERY_OUTCOME, VOUCHER_STATUS } from "@/config/giftsCatalogue";
import { useSession } from "@/context/SessionContext";
import { hasPermission, type AccessState } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { demoNow, useApprovalState } from "@/features/approvals/store";
import { geoOfMember, memberById, type MemberState } from "@/features/members/engine";
import { useMemberState } from "@/features/members/store";
import { useGiftsState } from "@/features/gifts/store";
import { voucherStatusAt, cardStatus, type CardStatus } from "@/features/gifts/engine";
import { useWalletState } from "@/features/wallet/store";
import { formatDateTime } from "@/lib/format";
import type { ActionId } from "@/types/rbac";
import type { Availability, CatalogueStatus, GiftState, GiftType, InsuranceCard, OrderStatus, RecoveryOutcome, VoucherRecord } from "@/types/gifts";
import type { WalletState } from "@/types/wallet";
import { SEED_TIERS } from "@/data/mock/schemeSeed";
import { MastersLayout, userName } from "@/pages/masters/shared";

export { userName };
export const GBASE = "/gifts";

export function GiftsLayout() {
  return (
    <MastersLayout
      title="Gift & fulfilment"
      description="Gift catalogue, segment point costs, fulfilment partners, vouchers and recovery, physical orders and delivery tracking, backend gift redemption and insurance cards (SOW Module 8, 10.5 AF03, 10.8 AF20)"
      permission="gift-orders:view"
      eyebrow="Programme operations"
      badge="Development gift & insurance data"
      meta="Development / demo data. Voucher providers, fulfilment partners, tracking and insurers are mock adapters: no real voucher code, shipment or insurance record exists. Points move only through the Phase 7 wallet service"
      tabs={[
        { to: GBASE, end: true, label: "Overview", icon: BarChart3 },
        { to: `${GBASE}/catalogue`, label: "Gift catalogue", icon: Gift, perm: "gift-catalogue:view" },
        { to: `${GBASE}/costs`, label: "Point costs", icon: Layers, perm: "gift-catalogue:view" },
        { to: `${GBASE}/categories`, label: "Categories", icon: FolderTree, perm: "gift-catalogue:view" },
        { to: `${GBASE}/partners`, label: "Partners & SKU mapping", icon: Boxes, perm: "fulfilment-partners:view" },
        { to: `${GBASE}/vouchers`, label: "Voucher inventory", icon: Ticket, perm: "vouchers:view" },
        { to: `${GBASE}/recovery`, label: "Voucher recovery", icon: Undo2, perm: "vouchers:view" },
        { to: `${GBASE}/orders`, label: "Physical orders", icon: PackageCheck, perm: "gift-orders:view" },
        { to: `${GBASE}/tracking`, label: "Delivery tracking", icon: Truck, perm: "gift-orders:view" },
        { to: `${GBASE}/backend`, label: "Backend gift redemption", icon: ClipboardList, perm: "gift-redemption:view" },
        { to: `${GBASE}/insurance`, label: "Insurance cards", icon: IdCard, perm: "insurance:view" },
        { to: `${GBASE}/imports`, label: "Bulk import history", icon: FileClock },
        { to: `${GBASE}/reports`, label: "Fulfilment reports", icon: FileText },
        { to: `${GBASE}/audit`, label: "Audit history", icon: History },
        { to: `${GBASE}/settings`, label: "Decisions & settings", icon: Settings2 },
      ]}
    />
  );
}

export interface GiftsView {
  gs: GiftState;
  ws: WalletState;
  mem: MemberState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  now: string;
  approvals: ReturnType<typeof useApprovalState>;
  /** Programme + geography check for a member-owned record. */
  canOn: (module: string, action: ActionId, memberId: string | null) => boolean;
}

export function useGiftsView(): GiftsView {
  const gs = useGiftsState();
  const ws = useWalletState();
  const mem = useMemberState();
  const acc = useAccessState();
  const approvals = useApprovalState();
  const { user, can } = useSession();
  const uid = user!.id;
  const canOn = useMemo(
    () => (module: string, action: ActionId, memberId: string | null) => {
      const m = memberId ? memberById(mem, memberId) : undefined;
      return m ? hasPermission(acc, uid, module, action, { programme: m.programme, geo: geoOfMember(m) }).allowed : hasPermission(acc, uid, module, action).allowed;
    },
    [acc, uid, mem],
  );
  return { gs, ws, mem, acc, uid, can, now: demoNow(), approvals, canOn };
}

export const dt = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : "—");
export const pts = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
export const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
export const memberName = (mem: MemberState, id: string | null) => (id ? memberById(mem, id)?.name ?? id : "—");

export const TypeTag = ({ type }: { type: GiftType }) => <span className={`gift-type gift-type--${type}`}>{GIFT_TYPE[type].short}</span>;
export const AvailBadge = ({ a }: { a: Availability }) => <StatusBadge tone={AVAILABILITY[a].tone}>{AVAILABILITY[a].label}</StatusBadge>;
export const CatBadge = ({ s }: { s: CatalogueStatus }) => <StatusBadge tone={s === "active" ? "positive" : s === "pending_approval" ? "warning" : s === "rejected" ? "negative" : "neutral"}>{s === "pending_approval" ? "Awaiting approval" : s[0].toUpperCase() + s.slice(1)}</StatusBadge>;
export const OrderBadge = ({ s }: { s: OrderStatus }) => <StatusBadge tone={s === "delivered" ? "positive" : s === "exception" ? "negative" : s === "awaiting_address" ? "warning" : "info"}>{ORDER_STATUS[s]}</StatusBadge>;
export const RecoveryBadge = ({ o }: { o: RecoveryOutcome }) => <StatusBadge tone={o === "code_retrieved" || o === "reissued" ? "positive" : o === "open" || o === "provider_review" ? "warning" : "negative"}>{RECOVERY_OUTCOME[o]}</StatusBadge>;
export function VoucherBadge({ v, now }: { v: VoucherRecord; now: string }) {
  const st = voucherStatusAt(v, now) as VoucherRecord["status"];
  const def = VOUCHER_STATUS[st];
  return <span title={def.implementation ? "Operational implementation state (not an SOW status)" : undefined}><StatusBadge tone={st === "issued" ? "info" : st === "used" ? "positive" : st === "available" ? "neutral" : st === "expired" || st === "replaced" ? "negative" : "warning"}>{def.label}{def.implementation ? " ·" : ""}</StatusBadge></span>;
}
export const DeliveryBadge = ({ s }: { s: string }) => <StatusBadge tone={s === "delivered" ? "positive" : s === "failed" ? "negative" : s === "pending" ? "warning" : "neutral"}>{s === "not_applicable" ? "—" : s === "pending" ? "Pending delivery" : s[0].toUpperCase() + s.slice(1)}</StatusBadge>;
const CARD_LABEL: Record<CardStatus, string> = { active: "Active", inactive: "Inactive", expired: "Expired", not_yet_valid: "Not yet valid" };
export const CardBadge = ({ c, now }: { c: InsuranceCard; now: string }) => {
  const st = cardStatus(c, now);
  return <StatusBadge tone={st === "active" ? "positive" : st === "expired" ? "negative" : st === "not_yet_valid" ? "info" : "neutral"}>{CARD_LABEL[st]}</StatusBadge>;
};
export const BcrTag = ({ children = "Business confirmation required" }: { children?: ReactNode }) => <span className="bcr-tag"><AlertTriangle size={12} aria-hidden="true" />{children}</span>;

export const approvalLink = (id: string | null | undefined) => (id ? <Link to={`/governance/approvals/request/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const giftLink = (id: string) => <Link to={`${GBASE}/catalogue/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link>;
export const orderLink = (id: string) => <Link to={`${GBASE}/orders/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link>;
export const memberLink = (id: string | null) => (id ? <Link to={`/wallet/member/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export const redemptionLink = (id: string) => (id.startsWith("RED-") ? <Link to={`/redemption/request/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <Link to="/redemption/gifts" className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link>);
export const ledgerLink = (id: string | null | undefined) => (id ? <Link to={`/wallet/ledger/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="muted small">—</span>);
export function DecisionRef({ id, label }: { id: string; label?: string }) {
  return <Link to={`${GBASE}/settings#${id}`} className="decision-ref mono">{label ?? id}</Link>;
}
export const giftName = (gs: GiftState, id: string) => gs.items.find((i) => i.id === id)?.name ?? id;
export const partnerName = (gs: GiftState, id: string | null) => (id ? gs.partners.find((p) => p.id === id)?.name ?? id : "—");

export { useParam, useRun } from "@/pages/comms/shared";
export const tierOptions = () => SEED_TIERS.filter((t) => t.status === "active").map((t) => ({ value: t.id, label: `${t.programme} · ${t.name} (${t.id})` }));
export const tierLabel = (id: string) => SEED_TIERS.find((t) => t.id === id)?.name ?? id;
