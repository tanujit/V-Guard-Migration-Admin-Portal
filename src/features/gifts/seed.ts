/**
 * Gift & Fulfilment and Insurance Card seed — DEVELOPMENT / DEMO DATA ONLY (Phase 9).
 * Built from the Phase 5 member seed and the Phase 7 wallet seed, so voucher and physical orders
 * point at real seeded redemptions and ledger lines. No real partner, voucher code, insurer or
 * insurance number is used: numbers are DEV-INS-… and codes are masked mock values.
 */
import { GIFT_DECISIONS, SOW_TARGETS } from "@/config/giftsCatalogue";
import { VOUCHER_PROVIDERS } from "@/config/walletCatalogue";
import { SEED_SKUS } from "@/data/mock/masterSeed";
import { geoOfMember, maskMobile, type MemberState } from "@/features/members/engine";
import type { Member, ProgrammeCode } from "@/types/members";
import type { WalletState } from "@/types/wallet";
import type { AddressSnapshot, FulfilmentPartner, GiftAuditEvent, GiftCategory, GiftItem, GiftOrder, GiftState, InsuranceBatch, InsuranceCard, InsuranceCardType, InsuranceRow, PointCostRule, Segmentation, SkuMapping, TrackingEvent, VoucherRecord, VoucherRecoveryRequest } from "@/types/gifts";
import { insuranceKey, maskInsurance } from "./engine";

const SYS = "SYSTEM";
const RAHUL = "USR-1003";
const SNEHA = "USR-1004";
const ANITA = "USR-2001";
const T0 = "2026-04-01T10:00";
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
export const addH = (at: string, h: number) => new Date(Date.parse(`${at}:00Z`) + h * 3600_000).toISOString().slice(0, 16);
const seg = (programmes: ProgrammeCode[], extra: Partial<Segmentation> = {}): Segmentation => ({ programmes, states: [], districts: [], branches: [], tiers: [], ...extra });
const ALL4: ProgrammeCode[] = ["EP", "ST", "CS", "Retailer"];

/* ---------------- Categories ---------------- */
const categories: GiftCategory[] = [
  { id: "GCT-001", name: "Digital vouchers", description: "E-vouchers from voucher partners", status: "active", updatedAt: T0, updatedBy: SYS },
  { id: "GCT-002", name: "Tools & equipment", description: "Trade tools for electricians and technicians", status: "active", updatedAt: T0, updatedBy: SYS },
  { id: "GCT-003", name: "V-Guard products", description: "V-Guard.com merchandise (references the Product & SKU master)", status: "active", updatedAt: T0, updatedBy: SYS },
  { id: "GCT-004", name: "Retail display", description: "Counter and store display items for Retailers", status: "active", updatedAt: T0, updatedBy: SYS },
  { id: "GCT-005", name: "Lifestyle", description: "General lifestyle gifts", status: "active", updatedAt: T0, updatedBy: SYS },
  { id: "GCT-006", name: "Festive hampers", description: "Seasonal hampers (not in use)", status: "inactive", updatedAt: "2026-06-01T10:00", updatedBy: RAHUL },
];

/* ---------------- Partners (mock adapters; voucher providers from the Phase 7 configuration) ---------------- */
const integ = (connection: "mock" | "not_connected", lastSuccess: string | null, lastFailure: string | null = null, err: string | null = null): FulfilmentPartner["integration"] => ({ connection, lastSuccess, lastFailure, sync: lastFailure && (!lastSuccess || lastFailure > lastSuccess) ? "failed" : lastSuccess ? "ok" : "never", errorSummary: err, lastFulfilmentRef: null });
const partners: FulfilmentPartner[] = [
  ...VOUCHER_PROVIDERS.map((p, i): FulfilmentPartner => ({ id: `FPT-${pad(i + 1)}`, code: `VCH-${p.toUpperCase().slice(0, 6)}`, name: `${p} vouchers (mock adapter)`, type: "voucher", supportedTypes: ["voucher"], description: `Voucher provider named in the Phase 7 configuration. Mock adapter only: no ${p} connection exists`, contactRef: "Partner desk (development)", integrationRef: `INT-VCH-${pad(i + 1, 2)}`, status: p === "MMT" ? "inactive" : "active", integration: integ("mock", "2026-11-09T06:00", p === "BookMyShow" ? "2026-11-09T08:10" : null, p === "BookMyShow" ? "Inventory request timed out (mock)" : null), updatedAt: T0, updatedBy: SYS })),
  { id: "FPT-0006", code: "PHY-MOCK", name: "Mock courier fulfilment (development)", type: "physical", supportedTypes: ["physical"], description: "Physical gift fulfilment and tracking adapter. Not connected: OP-GIFT1 leaves the tracking partner open", contactRef: "Fulfilment desk (development)", integrationRef: "INT-PHY-01", status: "active", integration: integ("mock", "2026-11-09T09:00"), updatedAt: T0, updatedBy: SYS },
  { id: "FPT-0007", code: "VGCOM", name: "V-Guard.com (mock arrangement)", type: "vguard_com", supportedTypes: ["vguard_com"], description: "V-Guard.com merchandise arrangement. Mock adapter only", contactRef: "V-Guard e-commerce desk (development)", integrationRef: "INT-VGC-01", status: "active", integration: integ("mock", "2026-11-08T18:00"), updatedAt: T0, updatedBy: SYS },
  { id: "FPT-0008", code: "PHY-LEGACY", name: "Legacy fulfilment partner (inactive, demo)", type: "physical", supportedTypes: ["physical"], description: "Sample inactive partner (edge case)", contactRef: "—", integrationRef: "INT-PHY-00", status: "inactive", integration: integ("not_connected", null), updatedAt: "2026-05-01T10:00", updatedBy: RAHUL },
];
const vp = (name: string) => partners.find((p) => p.name.startsWith(name))!.id;

/* ---------------- Catalogue ---------------- */
const skuLike = (prefix: string) => SEED_SKUS.find((s) => s.name.startsWith(prefix))?.id ?? null;
function item(id: number, code: string, name: string, type: GiftItem["type"], categoryId: string, partnerId: string | null, segmentation: Segmentation, opts: Partial<GiftItem> = {}): GiftItem {
  const created = `2026-0${4 + (id % 5)}-1${id % 9}T10:00`;
  return {
    id: `GIF-${pad(id)}`,
    code,
    name,
    type,
    categoryId,
    description: `${name} (development catalogue item)`,
    terms: "Development terms: redemption subject to availability and the member's eligible segment",
    partnerId,
    productSkuId: null,
    availability: "available",
    inventory: { reference: null, quantity: null, source: "not_supplied", syncedAt: null },
    segmentation,
    channels: { influencerApp: segmentation.programmes.some((p) => p !== "Retailer"), retailerApp: segmentation.programmes.includes("Retailer"), microsite: false },
    status: "active",
    version: 1,
    history: [{ version: 1, at: created, by: RAHUL, change: "Created and published", approvalRequestId: null }],
    approvalRequestId: null,
    effectiveFrom: created.slice(0, 10),
    createdAt: created,
    updatedAt: created,
    updatedBy: RAHUL,
    publishedAt: created,
    draft: null,
    ...opts,
  };
}
const inv = (quantity: number, ref: string): GiftItem["inventory"] => ({ reference: ref, quantity, source: "inventory_service", syncedAt: "2026-11-09T06:00" });
const items: GiftItem[] = [
  item(1, "VCH-AMZ-500", "Amazon e-voucher ₹500", "voucher", "GCT-001", vp("Amazon"), seg(ALL4), { voucher: { denomination: 500, validityNote: "12 months from issue (provider data)", productRef: "AMZ-EGV-500" }, inventory: inv(6, "INVREF-AMZ-500"), channels: { influencerApp: true, retailerApp: true, microsite: true } }),
  item(2, "VCH-FKT-1000", "Flipkart e-voucher ₹1,000", "voucher", "GCT-001", vp("Flipkart"), seg(ALL4), { voucher: { denomination: 1000, validityNote: "12 months from issue (provider data)", productRef: "FKT-EGV-1000" }, availability: "out_of_stock", inventory: inv(0, "INVREF-FKT-1000"), channels: { influencerApp: true, retailerApp: true, microsite: false } }),
  item(3, "VCH-BBK-VAR", "BigBasket e-voucher", "voucher", "GCT-001", vp("BigBasket"), seg(ALL4), { voucher: { denomination: null, validityNote: "Value and validity set by the provider at issue", productRef: "BBK-EGV-VAR" } }),
  item(4, "VCH-BMS-VAR", "BookMyShow e-voucher", "voucher", "GCT-001", vp("BookMyShow"), seg(["EP", "ST", "CS"]), { voucher: { denomination: null, validityNote: "Value and validity set by the provider at issue", productRef: "BMS-EGV-VAR" }, availability: "unknown" }),
  item(5, "VCH-MMT-VAR", "MMT travel voucher", "voucher", "GCT-001", vp("MMT"), seg(["Retailer"]), { voucher: { denomination: null, validityNote: "Provider data", productRef: "MMT-EGV-VAR" }, status: "inactive", availability: "unavailable", history: [{ version: 1, at: "2026-05-11T10:00", by: RAHUL, change: "Created and published", approvalRequestId: null }, { version: 1, at: "2026-09-01T10:00", by: RAHUL, change: "Deactivated: partner inactive", approvalRequestId: null }] }),
  item(6, "PHY-TOOLKIT-24", "Tool kit (24 pieces)", "physical", "GCT-002", "FPT-0006", seg(["EP", "ST"]), { physical: { imageRef: "MED-GIFT-TOOLKIT (mock)", delivery: "Courier to the gift delivery address" }, inventory: inv(48, "INVREF-TK24") }),
  item(7, "PHY-MULTIMETER", "Digital multimeter", "physical", "GCT-002", "FPT-0006", seg(["EP", "ST", "CS"]), { physical: { imageRef: "MED-GIFT-DMM (mock)", delivery: "Courier to the gift delivery address" }, inventory: inv(30, "INVREF-DMM") }),
  item(8, "PHY-DISPLAY-RACK", "Store display rack", "physical", "GCT-004", "FPT-0006", seg(["Retailer"]), { physical: { imageRef: "MED-GIFT-RACK (mock)", delivery: "Courier; installation not included" }, inventory: inv(12, "INVREF-RACK") }),
  item(9, "VGC-FAN-1200", "Ceiling fan (V-Guard.com)", "vguard_com", "GCT-003", "FPT-0007", seg(["EP", "Retailer"]), { productSkuId: skuLike("Ceiling fan 1200 mm"), vguard: { catalogueRef: "VGCOM-FAN-1200", arrangement: "Shipped by V-Guard.com" } }),
  item(10, "VGC-WH-15", "Water heater 15 L (V-Guard.com)", "vguard_com", "GCT-003", "FPT-0007", seg(["EP", "Retailer"], { states: ["KL", "TN"] }), { vguard: { catalogueRef: "VGCOM-WH-15", arrangement: "Shipped by V-Guard.com (Kerala and Tamil Nadu only)" } }),
  item(11, "PHY-TOOLBAG-PRO", "Premium tool bag", "physical", "GCT-002", "FPT-0006", seg(["EP"], { tiers: ["TIER-EP-2", "TIER-EP-3"] }), { physical: { imageRef: "MED-GIFT-BAG (mock)", delivery: "Courier to the gift delivery address" }, inventory: inv(20, "INVREF-BAG") }),
  item(12, "PHY-HELMET", "Safety helmet", "physical", "GCT-002", "FPT-0006", seg(["EP", "ST", "CS"]), { physical: { imageRef: null, delivery: "Courier to the gift delivery address" }, availability: "out_of_stock", inventory: inv(0, "INVREF-HELMET") }),
  item(13, "PHY-UMBRELLA", "Branded umbrella", "physical", "GCT-005", "FPT-0006", seg(ALL4), { physical: { imageRef: "MED-GIFT-UMB (mock)", delivery: "Courier to the gift delivery address" }, inventory: inv(200, "INVREF-UMB"), status: "pending_approval", publishedAt: null, history: [{ version: 1, at: "2026-11-08T11:00", by: RAHUL, change: "New item for the monsoon campaign", approvalRequestId: null }], createdAt: "2026-11-08T11:00", updatedAt: "2026-11-08T11:00" }),
  item(14, "VGC-PFAN-400", "Pedestal fan 400 mm (V-Guard.com)", "vguard_com", "GCT-003", "FPT-0007", seg(["Retailer"]), { productSkuId: skuLike("Pedestal fan 400 mm"), vguard: { catalogueRef: "VGCOM-PFAN-400", arrangement: "Shipped by V-Guard.com" } }),
];
const gid = (name: string) => items.find((i) => i.name === name)?.id ?? null;

/* ---------------- Point costs (segment-specific; mock values) ---------------- */
let costN = 0;
const cost = (giftId: string, programme: ProgrammeCode | null, points: number, extra: Partial<PointCostRule> = {}): PointCostRule => ({ id: `PCR-${pad(++costN)}`, giftId, programme, memberType: null, states: [], tiers: [], points, effectiveFrom: "2026-04-01", effectiveTo: null, status: "active", approvalRequestId: null, replaces: null, updatedBy: RAHUL, updatedAt: T0, ...extra });
const costs: PointCostRule[] = [
  cost("GIF-0001", "EP", 550), cost("GIF-0001", "ST", 550), cost("GIF-0001", "CS", 560), cost("GIF-0001", "Retailer", 520),
  cost("GIF-0002", null, 1100),
  cost("GIF-0003", "EP", 600), cost("GIF-0003", "ST", 600), cost("GIF-0003", "CS", 600), cost("GIF-0003", "Retailer", 580),
  cost("GIF-0004", null, 450),
  cost("GIF-0005", "Retailer", 2500),
  cost("GIF-0006", "EP", 1800), cost("GIF-0006", "ST", 1750),
  cost("GIF-0007", null, 1200),
  cost("GIF-0008", "Retailer", 4500),
  cost("GIF-0009", "EP", 3200), cost("GIF-0009", "Retailer", 3000),
  cost("GIF-0010", null, 5200),
  cost("GIF-0011", "EP", 2400, { tiers: ["TIER-EP-2"] }), cost("GIF-0011", "EP", 2100, { tiers: ["TIER-EP-3"] }),
  cost("GIF-0012", null, 650),
  cost("GIF-0013", null, 300, { status: "draft", updatedAt: "2026-11-08T11:00" }),
  cost("GIF-0014", "Retailer", 2600),
  // Superseded history: the previous Retailer multimeter cost, kept for audit.
  cost("GIF-0007", "Retailer", 1300, { status: "superseded", effectiveTo: "2026-06-30" }),
];
// Pending change: raise the ST tool-kit cost (replaces PCR-0013; the old value stays active until approval).
const pendingCost = cost("GIF-0006", "ST", 1850, { status: "pending_approval", replaces: "PCR-0013", effectiveFrom: "2026-12-01", updatedAt: "2026-11-08T16:00" });
costs.push(pendingCost);

/* ---------------- Partner / SKU mappings ---------------- */
let mapN = 0;
const mapping = (giftId: string, partnerId: string, partnerSku: string, productSkuId: string | null = null, availabilityMapping: SkuMapping["availabilityMapping"] = "partner_stock"): SkuMapping => ({ id: `PSM-${pad(++mapN)}`, giftId, productSkuId, partnerId, partnerSku, partnerProductRef: `${partnerSku}-REF`, availabilityMapping, status: "active", updatedAt: T0, updatedBy: RAHUL });
const mappings: SkuMapping[] = [
  mapping("GIF-0001", vp("Amazon"), "AMZ-EGV-500"),
  mapping("GIF-0002", vp("Flipkart"), "FKT-EGV-1000"),
  mapping("GIF-0003", vp("BigBasket"), "BBK-EGV-VAR", null, "always_available_on_partner"),
  mapping("GIF-0004", vp("BookMyShow"), "BMS-EGV-VAR", null, "always_available_on_partner"),
  mapping("GIF-0005", vp("MMT"), "MMT-EGV-VAR"),
  mapping("GIF-0006", "FPT-0006", "MCF-TK24"),
  mapping("GIF-0007", "FPT-0006", "MCF-DMM"),
  mapping("GIF-0008", "FPT-0006", "MCF-RACK"),
  mapping("GIF-0009", "FPT-0007", "VGCOM-FAN-1200", skuLike("Ceiling fan 1200 mm")),
  mapping("GIF-0010", "FPT-0007", "VGCOM-WH-15"),
  mapping("GIF-0011", "FPT-0006", "MCF-BAG-PRO"),
  mapping("GIF-0012", "FPT-0006", "MCF-HELMET"),
  mapping("GIF-0013", "FPT-0006", "MCF-UMB"),
  mapping("GIF-0014", "FPT-0007", "VGCOM-PFAN-400", skuLike("Pedestal fan 400 mm")),
];

/* ---------------- Insurance card types ---------------- */
const cardTypes: InsuranceCardType[] = [
  { id: "ICT-001", name: "Accident cover card", insurer: "Mock Insurer A (development)", segmentation: seg(["EP", "ST", "CS"]), enabled: { EP: true, ST: true, CS: true }, status: "active", updatedAt: T0, updatedBy: RAHUL },
  { id: "ICT-002", name: "Health cover card", insurer: "Mock Insurer B (development)", segmentation: seg(["EP", "ST"], { states: ["KL", "TN", "KA"] }), enabled: { EP: true, ST: true, CS: false }, status: "active", updatedAt: T0, updatedBy: RAHUL },
  { id: "ICT-003", name: "Tool & equipment cover card", insurer: "Mock Insurer A (development)", segmentation: seg(["EP"], { tiers: ["TIER-EP-2", "TIER-EP-3"] }), enabled: { EP: true, ST: false, CS: false }, status: "active", updatedAt: T0, updatedBy: RAHUL },
];

export function buildGiftSeed(ws: WalletState, mem: MemberState): GiftState {
  const audit: GiftAuditEvent[] = [];
  const log = (at: string, actor: string, entity: string, entityId: string, action: string, after: string | null, reason = "", approvalRequestId: string | null = null, partnerRef: string | null = null) => audit.push({ id: `GAE-${pad(audit.length + 1, 6)}`, at, actor, entity, entityId, action, before: null, after, reason, approvalRequestId, partnerRef });
  const byId = new Map(mem.members.map((m) => [m.id, m]));

  for (const i of items) log(i.createdAt, RAHUL, "gift", i.id, "gift_created", `${i.name} · ${i.type}`, "Development catalogue");
  for (const i of items.filter((x) => x.status === "active")) log(i.publishedAt!, SYS, "gift", i.id, "gift_published", `v${i.version}`, "Published before Phase 9 approval history (development seed)");
  log("2026-09-01T10:00", RAHUL, "gift", "GIF-0005", "gift_deactivated", "inactive", "Partner inactive");
  log("2026-11-09T06:00", SYS, "gift", "GIF-0002", "availability_updated", "out_of_stock", "Inventory service reported 0 available", null, "INVREF-FKT-1000");

  /* Tier references (development): the tier service does not expose member tiers yet. */
  const tierAssignments: Record<string, string> = {};
  const eps = mem.members.filter((m) => m.programme === "EP" && m.status !== "rejected");
  eps.slice(0, 18).forEach((m, i) => (tierAssignments[m.id] = ["TIER-EP-1", "TIER-EP-2", "TIER-EP-3"][i % 3]));

  /* ---------------- Vouchers ---------------- */
  const vouchers: VoucherRecord[] = [];
  const vid = () => `VCH-${pad(vouchers.length + 1, 5)}`;
  for (let i = 0; i < 6; i++) vouchers.push({ id: vid(), partnerId: vp("Amazon"), giftId: "GIF-0001", partnerSku: "AMZ-EGV-500", value: 500, codeMasked: "XXXX-XXXX-XXXX", vaultRef: `DEV-VAULT-AMZ-${pad(i + 1, 3)}`, status: "available", memberId: null, redemptionRef: null, ledgerRef: null, issuedAt: null, expiresOn: "2027-06-30", usedAt: null, delivery: { whatsapp: "not_applicable", inapp: "not_applicable", commId: null }, providerRef: null, recoverable: true, callbackIds: [], origin: "provider_inventory_mock" });
  log("2026-11-09T06:00", SYS, "voucher_inventory", "INVREF-AMZ-500", "voucher_inventory_received", "6 available", "Mock provider inventory sync", null, "INVREF-AMZ-500");
  const dl = (d: string) => (d === "delivered" ? "delivered" : d === "failed" ? "failed" : "pending") as VoucherRecord["delivery"]["whatsapp"];
  const used = new Set(["RED-00011", "RED-00029"]);
  for (const r of ws.redemptions.filter((x) => x.voucher)) {
    const v = r.voucher!;
    const id = vid();
    const giftId = items.find((g) => g.type === "voucher" && g.partnerId === vp(v.provider))?.id ?? "GIF-0003";
    const isUsed = used.has(r.id);
    vouchers.push({ id, partnerId: vp(v.provider), giftId, partnerSku: mappings.find((m) => m.giftId === giftId)?.partnerSku ?? "", value: r.grossInr, codeMasked: v.codeMasked, vaultRef: `DEV-VAULT-${r.id}`, status: isUsed ? "used" : "issued", memberId: r.memberId, redemptionRef: r.id, ledgerRef: r.debitLedgerId, issuedAt: v.issuedAt, expiresOn: v.expiresOn, usedAt: isUsed ? addH(v.issuedAt, 24 * 9) : null, delivery: { whatsapp: dl(v.delivery), inapp: dl(v.delivery), commId: null }, providerRef: `MOCK-VPR-${r.id}`, recoverable: v.provider !== "MMT", callbackIds: [], origin: "phase7_redemption" });
    log(v.issuedAt, SYS, "voucher", id, "voucher_issued", `${r.memberId} · ${v.codeMasked}`, `Phase 7 redemption ${r.id}`, null, `MOCK-VPR-${r.id}`);
    if (v.delivery === "delivered") log(addH(v.issuedAt, 0.01), SYS, "voucher", id, "voucher_delivered", "WhatsApp + in-app", "Mock provider delivery report");
    if (isUsed) log(addH(v.issuedAt, 24 * 9), SYS, "voucher", id, "voucher_used", null, "Provider usage report (mock)");
  }

  /* ---------------- Physical / V-Guard.com orders from Phase 7 redemptions ---------------- */
  const orders: GiftOrder[] = [];
  let trk = 0;
  const snap = (m: Member | undefined, at: string): AddressSnapshot => {
    const a = m?.addresses.gift;
    return { version: 1, recipient: m?.name ?? "", line: a?.line ?? "", district: a?.district ?? "", state: a?.state ?? "", pincode: a?.pincode ?? "", contactMasked: m ? maskMobile(m.mobile) : "", source: a ? `Gift delivery address (${a.source.replace("_", " ")})` : "No gift delivery address on the member profile", capturedAt: at };
  };
  const ev = (milestone: TrackingEvent["milestone"], at: string, ref: string, status = milestone ?? ""): TrackingEvent => ({ id: `TRK-${pad(++trk, 5)}`, partnerStatus: status, milestone, at, source: milestone === "placed" ? "order_service" : "partner_adapter", partnerRef: ref, remarks: "Mock tracking adapter (development data)", duplicate: false, accepted: true });
  const prodRedemptions = ws.redemptions.filter((x) => x.product).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of prodRedemptions) {
    const m = byId.get(r.memberId);
    const id = `GOR-${pad(orders.length + 1)}`;
    const giftId = gid(r.product!.item) ?? "GIF-0007";
    const g = items.find((x) => x.id === giftId)!;
    const po = `MOCK-PO-${pad(orders.length + 1, 5)}`;
    const shp = `MOCK-SHP-${pad(orders.length + 1, 5)}`;
    const placedAt = r.createdAt;
    const base: GiftOrder = { id, memberId: r.memberId, programme: r.programme, branchCode: r.branchCode, giftId, productSkuId: g.productSkuId, quantity: 1, points: r.points, foc: false, redemptionRef: r.id, ledgerRef: r.debitLedgerId, partnerId: g.partnerId, partnerOrderRef: po, shipmentRef: null, address: snap(m, placedAt), addressHistory: [], addressChanges: [], addressConfirmation: { status: "confirmed", method: "Development mock (OP-GIFT1 open)", reference: `DEV-ACF-${pad(orders.length + 1, 5)}`, at: addH(placedAt, 2), simulated: true }, status: "placed", tracking: [ev("placed", addH(placedAt, 3), po)], exceptions: [], refundRef: null, createdAt: placedAt, updatedAt: placedAt, origin: "phase7_redemption" };
    log(placedAt, SYS, "order", id, "order_created", `${g.name} · ${r.memberId}`, `Phase 7 redemption ${r.id}`);
    log(addH(placedAt, 2), SYS, "order", id, "address_confirmed", base.addressConfirmation.reference, "Simulated confirmation: no real verification occurred (OP-GIFT1)");
    if (r.product!.delivery === "delivered") {
      const del = r.updatedAt > addH(placedAt, 48) ? r.updatedAt : addH(placedAt, 60);
      base.tracking.push(ev("dispatched", addH(del, -30), shp), ev("out_for_delivery", addH(del, -6), shp), ev("delivered", del, shp));
      Object.assign(base, { status: "delivered", shipmentRef: shp, updatedAt: del });
      log(del, SYS, "order", id, "delivered", shp, "Mock partner delivery confirmation", null, shp);
    } else if (r.stage === "cancellation_pending") {
      Object.assign(base, { status: "awaiting_address", addressConfirmation: { status: "pending", method: null, reference: null, at: null, simulated: false }, tracking: [], partnerOrderRef: null });
      base.exceptions.push({ id: `GEX-${pad(orders.length + 1)}`, kind: "not_dispatched", detail: "Phase 7 redemption cancellation is pending; the order is on hold", at: r.updatedAt, remarks: [], issueRef: null, open: true });
    } else if (r.programme === "Retailer") {
      base.tracking.push(ev("dispatched", addH(placedAt, 30), shp), ev("out_for_delivery", "2026-11-09T09:10", shp));
      Object.assign(base, { status: "out_for_delivery", shipmentRef: shp, updatedAt: "2026-11-09T09:10" });
    } else {
      base.exceptions.push({ id: `GEX-${pad(orders.length + 1)}`, kind: "partner_update_missing", detail: "No partner update since the order was placed", at: "2026-11-09T09:00", remarks: [], issueRef: null, open: true });
    }
    orders.push(base);
  }

  /* ---------------- Voucher recovery (pending at Finance) ---------------- */
  const target = vouchers.find((v) => v.redemptionRef === "RED-00008")!;
  const recoveries: VoucherRecoveryRequest[] = [{ id: "VRR-0001", voucherId: target.id, memberId: target.memberId!, reason: "VRC-LOST", remarks: "Member changed phone and lost the WhatsApp message (ticket HDQ demo)", evidence: [], status: "pending_approval", outcome: "open", outcomeDetail: "", reissuedVoucherId: null, approvalRequestId: null, commId: null, requestedBy: SNEHA, requestedAt: "2026-11-09T10:20", events: [{ at: "2026-11-09T10:20", event: "recovery_requested", detail: "Submitted for approval" }] }];
  log("2026-11-09T10:20", SNEHA, "voucher", target.id, "voucher_recovery_requested", "VRR-0001", "Member lost the code");

  /* ---------------- Fulfilment issue: voucher issued, delivery failed ---------------- */
  const failedV = ws.redemptions.find((x) => x.voucher?.delivery === "failed");
  const issues: GiftState["issues"] = failedV ? [{ id: "GFI-0001", redemptionRef: failedV.id, memberId: failedV.memberId, giftId: vouchers.find((v) => v.redemptionRef === failedV.id)!.giftId, kind: "delivery_failed", detail: "Voucher issued by the provider but the WhatsApp / in-app delivery failed", at: failedV.updatedAt, status: "open", pointsDeducted: failedV.points, ledgerRef: failedV.debitLedgerId, refundRef: null, remarks: [] }] : [];

  /* ---------------- Insurance cards ---------------- */
  const pickEp = eps.filter((m) => ["KL", "TN", "KA"].includes((geoOfMember(m) as { state?: string }).state ?? ""));
  const sts = mem.members.filter((m) => m.programme === "ST" && m.status !== "rejected");
  const css = mem.members.filter((m) => m.programme === "CS" && m.status !== "rejected");
  let numN = 1000;
  const rowsFor = (list: [Member, string, string?][], at: string): InsuranceRow[] =>
    list.map(([m, typeId, validity], i) => {
      const t = cardTypes.find((x) => x.id === typeId)!;
      const values: Record<string, string> = { member_id: m.id, card_type: typeId, Name: m.name, Number: `DEV-INS-${++numN}`, Qualification: m.programme === "EP" ? "Licensed electrician (demo)" : m.programme === "ST" ? "Service technician (demo)" : "Counter sales (demo)", "Toll-Free Number": "1800 000 0000", "Insurance Amount": typeId === "ICT-002" ? "200000" : "100000", "Validity Dates": validity ?? "2026-10-01 to 2027-09-30", "Insurer Name": t.insurer };
      void at;
      return { row: i + 2, values, errors: [], warnings: [], result: "valid", cardId: null };
    });
  const rows1 = rowsFor([
    ...pickEp.slice(0, 4).map((m) => [m, "ICT-001"] as [Member, string]),
    [pickEp[0], "ICT-002"], [pickEp[1], "ICT-002"],
    ...sts.slice(0, 3).map((m) => [m, "ICT-001"] as [Member, string]),
    ...css.slice(0, 2).map((m) => [m, "ICT-001"] as [Member, string]),
    [css[2], "ICT-001", "2025-11-01 to 2026-10-31"],
  ], "2026-10-20T11:00");
  const tierEp = eps.find((m) => tierAssignments[m.id] === "TIER-EP-2" && pickEp.indexOf(m) > 3);
  if (tierEp) rows1.push({ ...rowsFor([[tierEp, "ICT-003"]], "")[0], row: rows1.length + 2 });
  const cards: InsuranceCard[] = [];
  for (const r of rows1) {
    const m = byId.get(r.values.member_id)!;
    const [from, to] = r.values["Validity Dates"].split(" to ");
    const id = `INC-${pad(cards.length + 1, 5)}`;
    r.result = "imported";
    r.cardId = id;
    cards.push({ id, typeId: r.values.card_type, memberId: m.id, programme: m.programme as "EP", name: r.values.Name, numberMasked: maskInsurance(r.values.Number), numberKey: insuranceKey(r.values["Insurer Name"], r.values.Number), qualification: r.values.Qualification, tollFree: r.values["Toll-Free Number"], amount: Number(r.values["Insurance Amount"]), validFrom: from, validTo: to, insurer: r.values["Insurer Name"], region: (geoOfMember(m) as { state?: string }).state ?? "", tier: tierAssignments[m.id] ?? null, active: false, publication: { status: "unpublished", ref: null, at: null, approvalRequestId: null }, batchId: "INB-0001", createdAt: "2026-10-21T10:05", history: [{ at: "2026-10-21T10:05", by: SYS, action: "insurance_record_created", detail: "Approved batch INB-0001" }] });
  }
  // Published (PUB-0001) except the last three, which stay unpublished for the publication demo.
  const pubIds = cards.slice(0, cards.length - 3).map((c) => c.id);
  for (const c of cards.filter((x) => pubIds.includes(x.id))) {
    c.active = true;
    c.publication = { status: "published", ref: "PUB-0001", at: "2026-10-22T10:05", approvalRequestId: null };
    c.history.push({ at: "2026-10-22T10:05", by: SYS, action: "card_published", detail: "PUB-0001 approved" }, { at: "2026-10-22T10:05", by: SYS, action: "card_activated", detail: "Activated on publication" });
  }
  const off = cards[3];
  off.active = false;
  off.history.push({ at: "2026-11-02T12:00", by: RAHUL, action: "card_deactivated", detail: "Member asked to hold the card pending a correction (no app release needed)" });

  const batch1: InsuranceBatch = { id: "INB-0001", fileName: "insurance-cards-oct-2026.csv", sizeKb: 3, uploadedBy: RAHUL, uploadedAt: "2026-10-20T11:00", policy: "atomic", rows: rows1, status: "completed", approvalRequestId: null, approvedBy: ANITA, completedAt: "2026-10-21T10:05" };
  const rows2 = rowsFor([...pickEp.slice(4, 7).map((m) => [m, "ICT-001"] as [Member, string]), [sts[3], "ICT-002"]], "");
  const batch2: InsuranceBatch = { id: "INB-0002", fileName: "insurance-cards-nov-2026.csv", sizeKb: 1, uploadedBy: RAHUL, uploadedAt: "2026-11-08T15:00", policy: "atomic", rows: rows2, status: "pending_approval", approvalRequestId: null, approvedBy: null, completedAt: null };
  const rows3 = rowsFor([[pickEp[7], "ICT-001"], [sts[4], "ICT-001"], [css[3], "ICT-001"], [pickEp[8], "ICT-001", "2027-01-01 to 2026-12-31"], [pickEp[9], "ICT-001"], [pickEp[10], "ICT-001"]], "");
  rows3[3] = { ...rows3[3], result: "invalid", errors: [{ field: "Validity Dates", value: "2027-01-01 to 2026-12-31", message: "Validity end date is before the start date" }] };
  rows3[4] = { ...rows3[4], values: { ...rows3[4].values, Number: rows1[0].values.Number }, result: "duplicate", errors: [{ field: "Number", value: maskInsurance(rows1[0].values.Number), message: "Insurance number already exists (unique per insurer, development setting GD-03)" }] };
  rows3[5] = { ...rows3[5], values: { ...rows3[5].values, "Insurer Name": "" }, result: "invalid", errors: [{ field: "Insurer Name", value: "", message: "Insurer Name is required" }] };
  const batch3: InsuranceBatch = { id: "INB-0003", fileName: "insurance-cards-corrections.csv", sizeKb: 1, uploadedBy: RAHUL, uploadedAt: "2026-11-09T09:30", policy: "atomic", rows: rows3, status: "validated", approvalRequestId: null, approvedBy: null, completedAt: null };
  for (const b of [batch1, batch2, batch3]) {
    log(b.uploadedAt, RAHUL, "insurance_batch", b.id, "csv_uploaded", `${b.rows.length} rows · ${b.fileName}`);
    log(b.uploadedAt, SYS, "insurance_batch", b.id, "csv_validated", `${b.rows.filter((r) => r.result === "valid" || r.result === "imported").length} valid of ${b.rows.length}`);
  }
  log("2026-10-20T11:05", RAHUL, "insurance_batch", "INB-0001", "upload_submitted", null, "12 validated records");
  log("2026-10-21T10:00", ANITA, "insurance_batch", "INB-0001", "upload_approved", null, "Records checked against the insurer list");
  for (const c of cards) log(c.createdAt, SYS, "insurance_card", c.id, "insurance_record_created", `${c.memberId} · ${c.typeId}`, "INB-0001");
  log("2026-10-22T10:05", SYS, "insurance_card", "PUB-0001", "card_published", `${pubIds.length} cards`, "Publication approved");
  log("2026-11-02T12:00", RAHUL, "insurance_card", off.id, "card_deactivated", "inactive", "Member asked to hold the card pending a correction");
  log("2026-11-08T15:00", RAHUL, "insurance_batch", "INB-0002", "upload_submitted", null, "4 validated records");

  audit.sort((a, b) => a.at.localeCompare(b.at));
  audit.forEach((e, i) => (e.id = `GAE-${pad(i + 1, 6)}`));

  return {
    categories: structuredClone(categories),
    items: structuredClone(items),
    costs: structuredClone(costs),
    partners: structuredClone(partners),
    mappings: structuredClone(mappings),
    vouchers,
    recoveries,
    orders,
    cardTypes: structuredClone(cardTypes),
    cards,
    batches: [batch1, batch2, batch3],
    render: { formats: { jpeg: true, pdf: true }, productionFormat: null, watermark: { text: null, position: null, opacity: null, perProgramme: false, status: "not_set" } },
    publications: [{ id: "PUB-0001", cardIds: pubIds, status: "published", approvalRequestId: null, requestedBy: RAHUL, requestedAt: "2026-10-21T15:00", publishedAt: "2026-10-22T10:05" }],
    downloads: [],
    config: { addressMethod: null, trackingPartner: null, insuranceNumberRule: "unique_per_insurer", insuranceRuleStatus: "development_setting", insurancePolicy: "atomic", catalogueApproval: true, tierAssignments, sowFulfilmentTarget: SOW_TARGETS.physical },
    issues,
    giftBatches: [],
    fulfilled: [],
    decisions: structuredClone(GIFT_DECISIONS),
    audit,
    seq: 0,
  };
}
