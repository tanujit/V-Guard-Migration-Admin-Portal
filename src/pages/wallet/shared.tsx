import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowLeftRight, BarChart3, BookOpen, CalendarClock, ClipboardList, CloudOff, Coins, FileSpreadsheet, Gift, Landmark, LayoutDashboard, ListChecks, Lock, Package, ReceiptIndianRupee, RefreshCcw, Scale, Settings2, ShieldCheck, Ticket, Undo2, Users, Wallet, XCircle, Banknote, History, CreditCard } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/primitives";
import { BUCKET, LEDGER_TYPE, OP_STATUS, STAGE, TRACK } from "@/config/walletCatalogue";
import { findBranch } from "@/config/geography";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { hasPermission, type AccessState, type PolicyResult } from "@/features/access/engine";
import { useAccessState } from "@/features/access/store";
import { demoNow, useApprovalState } from "@/features/approvals/store";
import { geoOfMember, memberById, type MemberState } from "@/features/members/engine";
import { useMemberState } from "@/features/members/store";
import { useSchemeState } from "@/features/schemes/store";
import { balanceView, fullLedger } from "@/features/wallet/engine";
import { refreshBalance, setServiceMode, useWalletState } from "@/features/wallet/store";
import { formatDateTime } from "@/lib/format";
import type { ActionId } from "@/types/rbac";
import type { SchemeState } from "@/types/schemes";
import type { Bucket, LedgerEntry, LedgerType, OpStatus, RedemptionStage, RedemptionTrack, ServiceMode, WalletState } from "@/types/wallet";
import { MastersLayout, userName } from "@/pages/masters/shared";
import { Notice } from "@/pages/approvals/shared";

export { userName };
export const WBASE = "/wallet";
export const RBASE = "/redemption";

const META = "Development / demo financial data. Balances, ledger postings, payouts, TDS and GST results come from a mock wallet service in this browser tab. No bank, tax, voucher, SFDC or financing system is connected";

export function WalletLayout() {
  return (
    <MastersLayout
      title="Wallet & points"
      description="Unified member wallet, immutable points ledger, adjustments, reversals, transfers, settlement, TDS, GST gate, reports and reconciliation (SOW Module 5 and 10.5)"
      permission="wallet:view"
      eyebrow="Programme operations"
      badge="Development financial data"
      meta={META}
      tabs={[
        { to: WBASE, end: true, label: "Overview", icon: LayoutDashboard },
        { to: `${WBASE}/members`, label: "Member wallets", icon: Users },
        { to: `${WBASE}/ledger`, label: "Points ledger", icon: BookOpen, perm: "points-ledger:view" },
        { to: `${WBASE}/adjustments`, label: "Adjustments", icon: Coins, perm: "points-adjustment:view" },
        { to: `${WBASE}/transfers`, label: "Transfers", icon: ArrowLeftRight, perm: "points-transfer:view" },
        { to: `${WBASE}/reversals`, label: "Sales return & reversals", icon: Undo2, perm: "points-reversal:view" },
        { to: `${WBASE}/settlement`, label: "Settlement", icon: Landmark, perm: "scheme-settlement:view" },
        { to: `${WBASE}/tds`, label: "TDS", icon: ReceiptIndianRupee, perm: "tds:view" },
        { to: `${WBASE}/gst`, label: "GST gate", icon: Lock, perm: "gst-gate:view" },
        { to: `${WBASE}/reports`, label: "Reports", icon: BarChart3 },
        { to: `${WBASE}/reconciliation`, label: "Reconciliation", icon: Scale, perm: "fin-reconciliation:view" },
        { to: `${WBASE}/config`, label: "Configuration", icon: Settings2 },
      ]}
    />
  );
}

export function RedemptionLayout() {
  return (
    <MastersLayout
      title="Redemption & fulfilment"
      description="Redemption requests, payouts and reconciliation, vouchers, products, backend gifts, cancellation, limits and EMI (SOW 5.3, 5.6, 5.7, 10.5)"
      permission="redemption:view"
      eyebrow="Programme operations"
      badge="Development financial data"
      meta={META}
      tabs={[
        { to: RBASE, end: true, label: "Overview", icon: LayoutDashboard },
        { to: `${RBASE}/requests`, label: "Requests", icon: ClipboardList },
        { to: `${RBASE}/payouts`, label: "Payouts", icon: Banknote },
        { to: `${RBASE}/vouchers`, label: "Vouchers", icon: Ticket },
        { to: `${RBASE}/products`, label: "Products & V-Guard.com", icon: Package },
        { to: `${RBASE}/gifts`, label: "Backend gifts", icon: Gift, perm: "gift-redemption:view" },
        { to: `${RBASE}/cancellation`, label: "Cancellation", icon: XCircle },
        { to: `${RBASE}/limits`, label: "Limits & controls", icon: ShieldCheck, perm: "redemption-limits:view" },
        { to: `${RBASE}/emi`, label: "EMI via points", icon: CreditCard, perm: "emi:view" },
        { to: `${RBASE}/history`, label: "History", icon: History },
      ]}
    />
  );
}

/* ---------------- View model ---------------- */

export interface WalletView {
  ws: WalletState;
  ss: SchemeState;
  mem: MemberState;
  acc: AccessState;
  uid: string;
  can: (p: string) => boolean;
  now: string;
  today: string;
  lines: LedgerEntry[];
  approvals: ReturnType<typeof useApprovalState>;
  /** Member-scoped permission: module, action, the member's programme and branch. */
  canOn: (module: string, action: ActionId, memberId?: string | null) => boolean;
  /** Members whose wallets the viewer may see (Wallet: View in programme and geography scope). */
  inScope: (memberId: string) => boolean;
  sensitive: boolean;
}

export function useWalletView(module = "wallet"): WalletView {
  const ws = useWalletState();
  const ss = useSchemeState();
  const mem = useMemberState();
  const acc = useAccessState();
  const approvals = useApprovalState();
  const { user, can } = useSession();
  const uid = user!.id;
  const now = demoNow();
  const lines = useMemo(() => fullLedger(ws, ss, mem), [ws, ss, mem]);
  const scope = useMemo(() => {
    const ok = new Set<string>();
    for (const m of mem.members) if (hasPermission(acc, uid, module, "view", { programme: m.programme, geo: geoOfMember(m) }).allowed) ok.add(m.id);
    return ok;
  }, [mem.members, acc, uid, module]);
  const canOn = (mod: string, action: ActionId, memberId?: string | null) => {
    const m = memberId ? memberById(mem, memberId) : undefined;
    return hasPermission(acc, uid, mod, action, m ? { programme: m.programme, geo: geoOfMember(m) } : {}).allowed;
  };
  return { ws, ss, mem, acc, uid, can, now, today: now.slice(0, 10), lines, approvals, canOn, inScope: (id) => scope.has(id), sensitive: can("wallet:view_sensitive") };
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
  const set = (v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== fallback) next.set(key, v);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return [value, set];
}

/* ---------------- Formatting ---------------- */

export const pts = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
export const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
export const stateOf = (branchCode: string) => findBranch(branchCode)?.state.code ?? "";
export const dt = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : "—");

/* ---------------- Badges and links ---------------- */

export const OpBadge = ({ status }: { status: OpStatus }) => <StatusBadge tone={OP_STATUS[status].tone}>{OP_STATUS[status].label}</StatusBadge>;
export const StageBadge = ({ stage }: { stage: RedemptionStage }) => <StatusBadge tone={STAGE[stage].tone}>{STAGE[stage].label}</StatusBadge>;
export const TrackBadge = ({ track }: { track: RedemptionTrack }) => <StatusBadge tone={TRACK[track].tone}>{TRACK[track].label}</StatusBadge>;
export const BucketTag = ({ bucket }: { bucket: Bucket }) => <span className={`bucket-tag bucket-tag--${bucket}`}>{BUCKET[bucket].short}</span>;
export const TypeTag = ({ type }: { type: LedgerType }) => <StatusBadge tone={LEDGER_TYPE[type].tone}>{LEDGER_TYPE[type].label}</StatusBadge>;
export const PointsCell = ({ n }: { n: number }) => <span className={`num ${n > 0 ? "amt-credit" : n < 0 ? "amt-debit" : ""}`}>{signed(n)}</span>;
export const BcrTag = ({ children = "Business confirmation required" }: { children?: ReactNode }) => <span className="bcr-tag"><AlertTriangle size={12} aria-hidden="true" />{children}</span>;

export const memberLink = (id: string) => (
  <Link to={`${WBASE}/member/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>
    {id}
  </Link>
);
export const ledgerLink = (id: string | null | undefined) =>
  id ? (
    <Link to={`${WBASE}/ledger/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>
      {id}
    </Link>
  ) : (
    <span className="muted small">—</span>
  );
export const redemptionLink = (id: string) => (
  <Link to={`${RBASE}/request/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>
    {id}
  </Link>
);
export const approvalLink = (id: string | null | undefined) =>
  id ? (
    <Link to={`/governance/approvals/request/${id}`} className="mono small" onClick={(e) => e.stopPropagation()}>
      {id}
    </Link>
  ) : (
    <span className="muted small">—</span>
  );
export function DecisionRef({ id, label }: { id: string; label?: string }) {
  return (
    <Link to={`${WBASE}/config?tab=decisions#${id}`} className="decision-ref mono" title="Open the business confirmation register">
      {label ?? id}
    </Link>
  );
}
export const memberName = (mem: MemberState, id: string) => memberById(mem, id)?.name ?? id;

/* ---------------- Financial KPI cards ---------------- */

export interface FinKpi {
  id: string;
  label: string;
  value: number;
  format?: "count" | "points" | "inr";
  desc: string;
  /** Category accent keeps buckets visually apart: available, scheme, kitty, gst, paid, pending, failed. */
  accent?: "available" | "scheme" | "kitty" | "gst" | "paid" | "pending" | "failed" | "neutral" | "lead";
  icon: LucideIcon;
  onSelect: () => void;
  reference?: string;
}

const VARIANT: Record<NonNullable<FinKpi["accent"]>, { variant: "primary" | "dark" | "light" | "status"; tone?: "positive" | "warning" | "negative" }> = {
  lead: { variant: "primary" },
  available: { variant: "status", tone: "positive" },
  scheme: { variant: "dark" },
  kitty: { variant: "status", tone: "warning" },
  gst: { variant: "status", tone: "warning" },
  paid: { variant: "light" },
  pending: { variant: "status", tone: "warning" },
  failed: { variant: "status", tone: "negative" },
  neutral: { variant: "light" },
};

export function FinKpiGrid({ items, cols = 4 }: { items: FinKpi[]; cols?: 4 | 5 }) {
  return (
    <div className={`kpi-grid ${cols === 5 ? "kpi-grid--5" : ""}`}>
      {items.map((k) => {
        const v = VARIANT[k.accent ?? "neutral"];
        return (
          <div key={k.id} className={`fin-kpi fin-kpi--${k.accent ?? "neutral"}`}>
            <KpiCard metric={{ id: k.id, label: k.label, value: k.value, format: k.format ?? "count", description: k.desc, goodDirection: "neutral", reference: k.reference ?? "Select to open the filtered list", drill: { module: "wallet", title: k.label } }} onSelect={k.onSelect} variant={v.variant} tone={v.tone} icon={k.icon} compact />
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Balance reliability (SOW 5.1.1) ---------------- */

export function BalanceReliability({ v, memberId }: { v: WalletView; memberId: string }) {
  const { run } = useRun();
  const view = balanceView(v.ws, v.ss, v.mem, memberId, v.now);
  const snap = v.ws.snapshots[memberId];
  const mode = v.ws.service.mode;
  const fresh = view.state === "live" ? "Live" : view.state === "last_known" ? "Last known (stale)" : "Unknown";
  return (
    <div className={`reliability reliability--${view.state}`}>
      <div className="reliability__head">
        {view.state === "live" ? <RefreshCcw size={16} aria-hidden="true" /> : <CloudOff size={16} aria-hidden="true" />}
        <strong>{fresh}</strong>
        <span className="small">{view.message}</span>
      </div>
      <dl className="kv kv--tight reliability__kv">
        <div className="kv__row"><dt>Live balance</dt><dd>{view.state === "live" ? "Available from the wallet service" : "Not available"}</dd></div>
        <div className="kv__row"><dt>Last retrieved</dt><dd className="num">{snap ? dt(snap.retrievedAt) : view.state === "live" ? `${dt(v.now)} (not yet stored)` : "—"}</dd></div>
        <div className="kv__row"><dt>Last successful reconciliation</dt><dd className="num">{dt(v.ws.service.lastReconciledAt)}</dd></div>
        <div className="kv__row"><dt>Retrieval status</dt><dd>{mode === "available" ? "OK" : mode === "timeout" ? "Timed out" : "Service unavailable"}</dd></div>
      </dl>
      <div className="btn-row">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(refreshBalance(v.uid, memberId), "Balance refreshed from the wallet service (mock)")}>
          <RefreshCcw size={14} aria-hidden="true" /> Refresh balance
        </button>
        <label className="sim-toggle small">
          Simulate wallet service
          <select value={mode} onChange={(e) => run(setServiceMode(v.uid, e.target.value as ServiceMode), `Wallet service simulation: ${e.target.value}`)}>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
            <option value="timeout">Timed out</option>
          </select>
        </label>
      </div>
      <p className="small muted">SOW 5.1.1: the wallet must never show a false zero. Atomic balance with the login response and a ~2 second refresh are backend requirements; this build prepares the contract only.</p>
    </div>
  );
}

export function ServiceBanner({ v }: { v: WalletView }) {
  if (v.ws.service.mode === "available") return null;
  return (
    <Notice tone="warn">
      Wallet service {v.ws.service.mode === "timeout" ? "timing out" : "unavailable"} (simulated). Balances show the last known value where one was retrieved. Approved operations will not post until the service responds; they can be retried under the same approval.
    </Notice>
  );
}

export const IconFor = { Wallet, ListChecks, CalendarClock, FileSpreadsheet };

/** Filters a ledger by the SOW 5.1 / 5.7 date presets. */
export type Period = "all" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
export function inPeriod(at: string, period: Period, today: string, from: string, to: string) {
  const d = at.slice(0, 10);
  const back = (n: number) => {
    const x = new Date(`${today}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() - n);
    return x.toISOString().slice(0, 10);
  };
  switch (period) {
    case "daily": return d === today;
    case "weekly": return d > back(7) && d <= today;
    case "monthly": return d.slice(0, 7) === today.slice(0, 7);
    case "yearly": {
      const y = Number(today.slice(0, 4));
      const start = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
      return d >= `${start}-04-01` && d <= `${start + 1}-03-31`;
    }
    case "custom": return (!from || d >= from) && (!to || d <= to);
    default: return true;
  }
}
export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all", label: "All dates" },
  { value: "daily", label: "Today" },
  { value: "weekly", label: "Last 7 days" },
  { value: "monthly", label: "This month" },
  { value: "yearly", label: "This financial year" },
  { value: "custom", label: "Custom range" },
];
