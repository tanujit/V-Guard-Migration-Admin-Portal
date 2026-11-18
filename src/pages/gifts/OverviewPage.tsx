import { useNavigate } from "react-router-dom";
import { AlertTriangle, Boxes, CheckCircle2, Gift, IdCard, PackageCheck, PackageX, ShoppingBag, Ticket, Truck, Undo2, Upload } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { RankedBars, ShareBar, StatList } from "@/components/ui/DataBars";
import { GIFT_TYPE, ORDER_STATUS, SOW_TARGETS } from "@/config/giftsCatalogue";
import { cardStatus, voucherStatusAt } from "@/features/gifts/engine";
import { voucherDelivery } from "@/features/gifts/store";
import { programmeColor } from "@/config/programmes";
import { KpiGrid } from "@/pages/masters/shared";
import { Notice } from "@/pages/approvals/shared";
import { DecisionRef, GBASE, dt, useGiftsView, userName } from "./shared";

export function GiftsOverviewPage() {
  const v = useGiftsView();
  const nav = useNavigate();
  const { gs, now } = v;
  const items = gs.items;
  const vouchers = gs.vouchers.map((x) => ({ ...x, st: voucherStatusAt(x, now) }));
  const orders = gs.orders.filter((o) => v.canOn("gift-orders", "view", o.memberId));
  const today = now.slice(0, 10);
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400_000).toISOString().slice(0, 10);
  const go = (path: string) => () => nav(path);
  const pendingIns = gs.batches.filter((b) => b.status === "pending_approval").length;
  const byType = (Object.keys(GIFT_TYPE) as (keyof typeof GIFT_TYPE)[]).map((t) => ({ key: t, label: GIFT_TYPE[t].label, value: items.filter((i) => i.type === t).length }));
  const progs = ["EP", "ST", "CS", "Retailer", "DD"];
  const delivery = vouchers.filter((x) => x.st === "issued" || x.st === "used").map((x) => voucherDelivery(x).whatsapp);
  return (
    <>
      <Notice tone="warn">
        Address confirmation method and tracking partner are open (<DecisionRef id="OP-GIFT1" />). Insurance card fields, JPEG / PDF requirement, upload approval authority and watermark rules are open (<DecisionRef id="OP-INS1" />). Configuration exists; production rules are not assumed.
      </Notice>
      <KpiGrid
        cols={5}
        items={[
          { id: "ti", label: "Total catalogue items", value: items.length, desc: "All gift types", icon: Gift, variant: "primary", onSelect: go(`${GBASE}/catalogue`) },
          { id: "ai", label: "Active catalogue items", value: items.filter((i) => i.status === "active").length, desc: "Approved and visible", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: go(`${GBASE}/catalogue?status=active`) },
          { id: "ii", label: "Inactive catalogue items", value: items.filter((i) => i.status === "inactive").length, desc: "Deactivated", icon: PackageX, variant: "light", onSelect: go(`${GBASE}/catalogue?status=inactive`) },
          { id: "os", label: "Out-of-stock items", value: items.filter((i) => i.availability === "out_of_stock").length, desc: "Shown as unavailable", icon: AlertTriangle, variant: "status", tone: "warning", onSelect: go(`${GBASE}/catalogue?availability=out_of_stock`) },
          { id: "dv", label: "Digital voucher items", value: items.filter((i) => i.type === "voucher").length, desc: "E-voucher catalogue", icon: Ticket, variant: "light", onSelect: go(`${GBASE}/catalogue?type=voucher`) },
          { id: "ph", label: "Physical gift items", value: items.filter((i) => i.type === "physical").length, desc: "Shipped by partners", icon: ShoppingBag, variant: "light", onSelect: go(`${GBASE}/catalogue?type=physical`) },
          { id: "vg", label: "V-Guard.com merchandise", value: items.filter((i) => i.type === "vguard_com").length, desc: "References SKU master", icon: Boxes, variant: "light", onSelect: go(`${GBASE}/catalogue?type=vguard_com`) },
          { id: "fp", label: "Fulfilment partners", value: gs.partners.length, desc: `${gs.partners.filter((p) => p.status === "active").length} active (mock adapters)`, icon: Boxes, variant: "light", onSelect: go(`${GBASE}/partners`) },
          { id: "av", label: "Available voucher inventory", value: vouchers.filter((x) => x.st === "available").length, desc: "Provider inventory (mock)", icon: Ticket, variant: "dark", onSelect: go(`${GBASE}/vouchers?status=available`) },
          { id: "iv", label: "Issued vouchers", value: vouchers.filter((x) => x.st === "issued").length, desc: "Issued, not used", icon: Ticket, variant: "light", onSelect: go(`${GBASE}/vouchers?status=issued`) },
          { id: "vr", label: "Voucher recovery requests", value: gs.recoveries.length, desc: `${gs.recoveries.filter((r) => r.status === "pending_approval").length} awaiting approval`, icon: Undo2, variant: "light", onSelect: go(`${GBASE}/recovery`) },
          { id: "po", label: "Pending physical orders", value: orders.filter((o) => o.status === "awaiting_address" || o.status === "placed").length, desc: "Awaiting address or dispatch", icon: PackageCheck, variant: "status", tone: "warning", onSelect: go(`${GBASE}/orders?status=pending`) },
          { id: "ds", label: "Dispatched orders", value: orders.filter((o) => o.status === "dispatched").length, desc: "With the partner", icon: Truck, variant: "light", onSelect: go(`${GBASE}/orders?status=dispatched`) },
          { id: "ofd", label: "Out-for-delivery orders", value: orders.filter((o) => o.status === "out_for_delivery").length, desc: "Last mile", icon: Truck, variant: "light", onSelect: go(`${GBASE}/orders?status=out_for_delivery`) },
          { id: "dl", label: "Delivered orders", value: orders.filter((o) => o.status === "delivered").length, desc: "Partner-confirmed", icon: CheckCircle2, variant: "status", tone: "positive", onSelect: go(`${GBASE}/orders?status=delivered`) },
          { id: "ex", label: "Failed / exception orders", value: orders.filter((o) => o.status === "exception" || o.exceptions.some((e) => e.open)).length, desc: "Open exceptions", icon: AlertTriangle, variant: "status", tone: "negative", onSelect: go(`${GBASE}/tracking`) },
          { id: "it", label: "Active insurance card types", value: gs.cardTypes.filter((t) => t.status === "active").length, desc: "EP, ST and CS", icon: IdCard, variant: "light", onSelect: go(`${GBASE}/insurance?tab=types`) },
          { id: "iu", label: "Insurance uploads pending approval", value: pendingIns, desc: "Maker-Checker", icon: Upload, variant: "status", tone: pendingIns ? "warning" : undefined, onSelect: go(`${GBASE}/insurance?tab=upload`) },
        ]}
      />
      <div className="grid-3">
        <Panel title="Gift distribution by type">
          <RankedBars items={byType} onSelect={(x) => nav(`${GBASE}/catalogue?type=${x.key}`)} />
        </Panel>
        <Panel title="Active items by programme" subtitle="Items whose segmentation includes the programme">
          <RankedBars items={progs.map((p) => ({ key: p, label: p, value: items.filter((i) => i.status === "active" && i.segmentation.programmes.includes(p as "EP")).length, color: programmeColor(p as "EP") }))} onSelect={(x) => nav(`${GBASE}/catalogue?programme=${x.key}`)} />
        </Panel>
        <Panel title="Items by category">
          <RankedBars items={gs.categories.map((c) => ({ key: c.id, label: c.name, value: items.filter((i) => i.categoryId === c.id).length }))} onSelect={(x) => nav(`${GBASE}/catalogue?category=${x.key}`)} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Physical fulfilment" subtitle={SOW_TARGETS.physical}>
          <ShareBar label="Orders by status" items={(Object.keys(ORDER_STATUS) as (keyof typeof ORDER_STATUS)[]).map((s) => ({ key: s, label: ORDER_STATUS[s], value: orders.filter((o) => o.status === s).length, tone: s === "delivered" ? "positive" : s === "exception" ? "negative" : s === "awaiting_address" ? "warning" : "info" }))} onSelect={(x) => nav(`${GBASE}/orders?status=${x.key}`)} />
          <StatList items={[
            { label: "Address confirmation pending", value: String(orders.filter((o) => o.addressConfirmation.status !== "confirmed" && o.status === "awaiting_address").length), onSelect: go(`${GBASE}/orders?address=pending`) },
            { label: "Pending partner updates", value: String(orders.filter((o) => o.exceptions.some((e) => e.open && e.kind === "partner_update_missing")).length), onSelect: go(`${GBASE}/tracking`) },
            { label: "Fulfilment issues (refund review)", value: String(gs.issues.filter((i) => i.status === "open").length), onSelect: go(`${GBASE}/backend?tab=issues`) },
          ]} />
        </Panel>
        <Panel title="Voucher delivery" subtitle={SOW_TARGETS.voucher}>
          <ShareBar label="WhatsApp delivery of issued vouchers" items={[{ key: "delivered", label: "Delivered", value: delivery.filter((d) => d === "delivered").length, tone: "positive" }, { key: "pending", label: "Pending", value: delivery.filter((d) => d === "pending").length, tone: "warning" }, { key: "failed", label: "Failed", value: delivery.filter((d) => d === "failed").length, tone: "negative" }]} onSelect={(x) => nav(`${GBASE}/vouchers?delivery=${x.key}`)} />
          <StatList items={[
            { label: "Used vouchers", value: String(vouchers.filter((x) => x.st === "used").length), onSelect: go(`${GBASE}/vouchers?status=used`) },
            { label: "Expired vouchers", value: String(vouchers.filter((x) => x.st === "expired").length), onSelect: go(`${GBASE}/vouchers?status=expired`) },
            { label: "Recoveries completed", value: String(gs.recoveries.filter((r) => r.status === "completed").length), onSelect: go(`${GBASE}/recovery`) },
          ]} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="Insurance cards" subtitle="EP, ST and CS only (SOW 8.4)">
          <RankedBars items={["EP", "ST", "CS"].map((p) => ({ key: p, label: p, value: gs.cards.filter((c) => c.programme === p).length, color: programmeColor(p as "EP") }))} onSelect={(x) => nav(`${GBASE}/insurance?tab=directory&programme=${x.key}`)} />
          <StatList items={[
            { label: "Active cards", value: String(gs.cards.filter((c) => cardStatus(c, now) === "active").length), onSelect: go(`${GBASE}/insurance?tab=directory&status=active`) },
            { label: "Expired cards", value: String(gs.cards.filter((c) => cardStatus(c, now) === "expired").length), onSelect: go(`${GBASE}/insurance?tab=validity`) },
            { label: "Expiring in 30 days", value: String(gs.cards.filter((c) => c.validTo >= today && c.validTo <= soon).length), onSelect: go(`${GBASE}/insurance?tab=validity`) },
            { label: "Awaiting publication", value: String(gs.cards.filter((c) => c.publication.status !== "published").length), onSelect: go(`${GBASE}/insurance?tab=directory&publication=unpublished`) },
          ]} />
        </Panel>
        <Panel title="Recent activity" actions={<button type="button" className="btn btn--ghost btn--sm" onClick={go(`${GBASE}/audit`)}>Open audit history</button>}>
          <ul className="activity-list">
            {[...gs.audit].reverse().slice(0, 9).map((e) => (
              <li key={e.id}>
                <span className="mono small">{e.entityId}</span> <strong>{e.action.replace(/_/g, " ")}</strong> <span className="muted small">{dt(e.at)} · {userName(v.acc, e.actor === "PARTNER" ? "SYSTEM" : e.actor)}</span>
                {e.after && <div className="small muted">{e.after}</div>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
