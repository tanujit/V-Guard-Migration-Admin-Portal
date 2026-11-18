/**
 * Phase 9 — Gift Catalogue, Voucher, Physical Fulfilment and Insurance Card test suite
 * (Build Prompt 09, section 26, scenarios 1–85).
 *   npm run test:gifts
 * Runs the real gifts store with the Phase 7 wallet engine, the Phase 8 Communication Centre and the
 * central approval engine in Node. SOW-defined behaviour is asserted deterministically. Open decisions
 * (OP-GIFT1 address method, OP-INS1 card format / watermark, GD-03 uniqueness, GD-04 cost precedence)
 * are asserted as blocked or configurable, never as an invented production rule.
 */
import { approvalStore, decideRequest } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { walletStore } from "@/features/wallet/store";
import { memberBalances } from "@/features/wallet/engine";
import { schemeStore } from "@/features/schemes/store";
import { commsStore } from "@/features/comms/store";
import * as G from "@/features/gifts/store";
import * as E from "@/features/gifts/engine";
import { BACKEND_GIFT_CSV_HEADER, INSURANCE_CSV_HEADER } from "@/config/giftsCatalogue";
import { SEED_SKUS } from "@/data/mock/masterSeed";
import { geoOfMember } from "@/features/members/engine";
import type { GiftItem } from "@/types/gifts";
import type { Member } from "@/types/members";

const RAHUL = "USR-1003", SNEHA = "USR-1004", ANITA = "USR-2001", TANUJIT = "USR-1001", IMRAN = "USR-3001", LAKSHMI = "USR-2003", VIKRAM = "USR-2006", KA_ADMIN = "USR-2004";
const gs = () => G.giftsStore.get();
const ws = () => walletStore.get();
const mem = () => memberStore.get();
const req = (id: string) => approvalStore.get().requests.find((r) => r.id === id)!;
const decide = (uid: string, id: string, action: "approve" | "reject" | "return" = "approve") => decideRequest(uid, id, action, "Reviewed in test", req(id).seq);
const bal = (id: string) => memberBalances(ws(), schemeStore.get(), mem(), id).available;
const item = (id: string) => gs().items.find((i) => i.id === id)!;
const order = (id: string) => gs().orders.find((o) => o.id === id)!;
const stateOf = (m: Member) => (geoOfMember(m) as { state?: string }).state ?? "";

type Kind = "deterministic" | "blocked" | "governance";
const results: { n: number; name: string; kind: Kind; ok: boolean; detail: string }[] = [];
function test(n: number, name: string, kind: Kind, fn: () => string | void) {
  try {
    results.push({ n, name, kind, ok: true, detail: fn() ?? "" });
  } catch (e) {
    results.push({ n, name, kind, ok: false, detail: (e as Error).message });
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const ok = (r: { ok: boolean; errors: string[] }, what = "") => expect(r.ok, `${what} ${r.errors.join("; ")}`.trim());

/* Member pools: eligible EP members (redemption enabled, unrestricted, gift address, enough points). */
const restricted = (m: Member) => mem().restrictions.some((r) => r.status !== "lifted" && r.memberIds.includes(m.id));
const used = new Set<string>();
function take(f: (m: Member) => boolean, label: string): Member {
  const m = mem().members.find((x) => !used.has(x.id) && x.status === "redemption_enabled" && !restricted(x) && f(x));
  expect(m, `No member for ${label}`);
  used.add(m.id);
  return m;
}
/** The seeded EP member with enough points for paid redemptions (reused: completed gifts never block a new one). */
const richEp = (label: string) => {
  const m = mem().members.filter((x) => x.programme === "EP" && x.status === "redemption_enabled" && !restricted(x) && !!x.addresses.gift).sort((a, b) => bal(b.id) - bal(a.id))[0];
  expect(m && bal(m.id) >= 3600, `No funded member for ${label}`);
  return m;
};
/** Any other eligible EP member with a gift address (FOC and validation cases). */
const anyEp = (label: string) => take((m) => m.programme === "EP" && !!m.addresses.gift && m.id !== richEp(label).id, label);

/** Runs a backend gift through the Phase 7 engine and Finance approval. */
function backendGift(m: Member, giftId: string, deduct = true, qty = 1, uid = SNEHA) {
  const r = G.submitBackendGift(uid, { memberId: m.id, giftId, quantity: qty, deductPoints: deduct, reason: deduct ? "GFT-ON-BEHALF" : "GFT-SERVICE", remarks: "Test redemption", evidence: deduct ? [] : ["foc-approval.pdf"] });
  ok(r, "submit");
  const g = ws().gifts.find((x) => x.id === r.id)!;
  ok(decide(LAKSHMI, g.approvalRequestId!), "approve");
  return ws().gifts.find((x) => x.id === r.id)!;
}

function newItem(p: Partial<GiftItem>): GiftItem {
  return { id: "", code: "", name: "Test gift", type: "physical", categoryId: "GCT-002", description: "Test", terms: "Test terms", partnerId: "FPT-0006", productSkuId: null, availability: "available", inventory: { reference: "INVREF-TEST", quantity: 10, source: "inventory_service", syncedAt: "2026-11-09T06:00" }, segmentation: { programmes: ["EP", "ST"], states: [], districts: [], branches: [], tiers: [] }, channels: { influencerApp: true, retailerApp: false, microsite: false }, status: "draft", version: 1, history: [], approvalRequestId: null, effectiveFrom: "2026-11-01", createdAt: "", updatedAt: "", updatedBy: RAHUL, publishedAt: null, draft: null, ...p };
}
function createAndPublish(p: Partial<GiftItem>, costs: [string | null, number][]) {
  const r = G.saveItem(RAHUL, newItem(p), "Test item");
  ok(r, "save");
  for (const [prog, pts] of costs) ok(G.saveInitialCost(RAHUL, r.id!, prog as "EP" | null, pts, "2026-11-01"), "cost");
  ok(G.submitItem(RAHUL, r.id!), "submit");
  expect(item(r.id!).status === "pending_approval", `status ${item(r.id!).status}`);
  ok(decide(ANITA, item(r.id!).approvalRequestId!), "approve");
  return item(r.id!);
}

/* ======================= Gift catalogue (1–14) ======================= */

let voucherItem: GiftItem, physicalItem: GiftItem, vgItem: GiftItem;
test(1, "Create a digital voucher item", "governance", () => {
  voucherItem = createAndPublish({ name: "Test e-voucher ₹250", code: "VCH-TEST-250", type: "voucher", categoryId: "GCT-001", partnerId: "FPT-0001", voucher: { denomination: 250, validityNote: "Provider data", productRef: "AMZ-EGV-250" }, inventory: { reference: null, quantity: null, source: "not_supplied", syncedAt: null }, segmentation: { programmes: ["EP", "ST", "CS"], states: [], districts: [], branches: [], tiers: [] } }, [[null, 300]]);
  expect(voucherItem.status === "active" && voucherItem.publishedAt && gs().costs.some((c) => c.giftId === voucherItem.id && c.status === "active"), "not active");
  return `${voucherItem.id} drafted by Rahul, approved by Anita (WF-030), now active with its cost rule`;
});
test(2, "Create a physical gift item", "governance", () => {
  physicalItem = createAndPublish({ name: "Test torch kit", code: "PHY-TEST-TORCH", partnerId: "FPT-0006" }, [["EP", 900], ["ST", 950]]);
  expect(physicalItem.status === "active" && physicalItem.type === "physical", physicalItem.status);
  return `${physicalItem.id} active`;
});
test(3, "Create V-Guard.com merchandise", "governance", () => {
  const sku = SEED_SKUS.find((s) => s.status === "active" && s.name.startsWith("Exhaust fan"))!;
  vgItem = createAndPublish({ name: "Test exhaust fan (V-Guard.com)", code: "VGC-TEST-EXF", type: "vguard_com", categoryId: "GCT-003", partnerId: "FPT-0007", productSkuId: sku.id, vguard: { catalogueRef: "VGCOM-EXF-200", arrangement: "Shipped by V-Guard.com" }, segmentation: { programmes: ["Retailer"], states: [], districts: [], branches: [], tiers: [] }, channels: { influencerApp: false, retailerApp: true, microsite: true } }, [["Retailer", 1500]]);
  return `${vgItem.id} references ${sku.code}`;
});
test(4, "Map a gift to an existing Product / SKU (inactive SKUs refused)", "deterministic", () => {
  expect(SEED_SKUS.some((s) => s.id === vgItem.productSkuId), "SKU not in master");
  const inactive = SEED_SKUS.find((s) => s.status !== "active")!;
  const r = G.saveItem(RAHUL, newItem({ name: "Inactive SKU gift", code: "BAD-SKU", type: "vguard_com", categoryId: "GCT-003", partnerId: "FPT-0007", productSkuId: inactive.id, vguard: { catalogueRef: "X", arrangement: "" } }));
  expect(!r.ok && r.errors.some((e) => e.includes("Product & SKU master")), r.errors.join("; "));
  return `${vgItem.productSkuId} mapped; ${inactive.code} (${inactive.status}) refused`;
});
test(5, "Map a fulfilment partner SKU (duplicate and incompatible mappings refused)", "deterministic", () => {
  ok(G.saveMapping(RAHUL, { id: "", giftId: physicalItem.id, productSkuId: null, partnerId: "FPT-0006", partnerSku: "MCF-TORCH", partnerProductRef: "MCF-TORCH-REF", availabilityMapping: "partner_stock" }), "mapping");
  expect(!G.saveMapping(RAHUL, { id: "", giftId: physicalItem.id, productSkuId: null, partnerId: "FPT-0006", partnerSku: "MCF-TORCH-2", partnerProductRef: "", availabilityMapping: "manual" }).ok, "duplicate accepted");
  const bad = G.saveMapping(RAHUL, { id: "", giftId: physicalItem.id, productSkuId: null, partnerId: "FPT-0001", partnerSku: "AMZ-X", partnerProductRef: "", availabilityMapping: "manual" });
  expect(!bad.ok && bad.errors.some((e) => e.includes("Incompatible")), bad.errors.join("; "));
  return "MCF-TORCH mapped; duplicate and voucher-partner mappings refused";
});
test(6, "Different point costs for two member segments", "deterministic", () => {
  const ep = mem().members.find((m) => m.programme === "EP")!;
  const st = mem().members.find((m) => m.programme === "ST")!;
  const a = E.costFor(gs(), physicalItem.id, ep, "2026-11-09T14:30").points;
  const b = E.costFor(gs(), physicalItem.id, st, "2026-11-09T14:30").points;
  expect(a === 900 && b === 950, `${a} / ${b}`);
  return "EP 900, ST 950 for the same item";
});
test(7, "Programme segmentation", "deterministic", () => {
  const cs = mem().members.find((m) => m.programme === "CS")!;
  expect(E.segmentReasons(physicalItem.segmentation, cs, null).some((r) => r.includes("Not offered to CS")), "CS allowed");
  expect(!E.memberCatalogue(gs(), cs, "influencerApp", "2026-11-09T14:30").some((x) => x.item.id === physicalItem.id), "visible to CS");
});
test(8, "Regional segmentation", "deterministic", () => {
  const g = item("GIF-0010");
  const inside = mem().members.find((m) => m.programme === "EP" && stateOf(m) === "KL")!;
  const outside = mem().members.find((m) => m.programme === "EP" && stateOf(m) === "KA")!;
  expect(!E.segmentReasons(g.segmentation, inside, null).length && E.segmentReasons(g.segmentation, outside, null).some((r) => r.includes("region")), "region");
  return `GIF-0010 (KL, TN): ${inside.id} sees it, ${outside.id} does not`;
});
test(9, "Tier segmentation uses the Tier master; an unknown tier is never guessed", "deterministic", () => {
  const g = item("GIF-0011");
  const t = gs().config.tierAssignments;
  const silver = mem().members.find((m) => t[m.id] === "TIER-EP-2")!;
  const bronze = mem().members.find((m) => t[m.id] === "TIER-EP-1")!;
  const none = mem().members.find((m) => m.programme === "EP" && !t[m.id])!;
  expect(!E.segmentReasons(g.segmentation, silver, "TIER-EP-2").length && E.costFor(gs(), g.id, silver, "2026-11-09T14:30").points === 2400, "silver");
  expect(E.segmentReasons(g.segmentation, bronze, "TIER-EP-1").some((r) => r.includes("tiers")), "bronze");
  expect(E.segmentReasons(g.segmentation, none, null).some((r) => r.includes("tier service")), "unknown tier");
  return "Silver 2,400 points; Bronze outside; member without a tier reference blocked";
});
test(10, "Disable a catalogue item", "governance", () => {
  expect(!G.setItemStatus(RAHUL, vgItem.id, "inactive", "").ok, "no reason accepted");
  ok(G.setItemStatus(RAHUL, vgItem.id, "inactive", "Partner stock discontinued"), "deactivate");
  const rt = mem().members.find((m) => m.programme === "Retailer")!;
  expect(item(vgItem.id).status === "inactive" && !E.memberCatalogue(gs(), rt, "retailerApp", "2026-11-09T14:30").some((x) => x.item.id === vgItem.id), "still visible");
  expect(gs().audit.some((a) => a.entityId === vgItem.id && a.action === "gift_deactivated"), "audit");
});
test(11, "Mark an item Out of Stock", "deterministic", () => {
  ok(G.setAvailability(RAHUL, "GIF-0007", "out_of_stock", "Partner reported zero stock"), "availability");
  expect(item("GIF-0007").availability === "out_of_stock" && gs().audit.some((a) => a.entityId === "GIF-0007" && a.action === "availability_updated"), "not recorded");
});
test(12, "Unavailable items never appear redeemable", "blocked", () => {
  const ep = anyEp("t12");
  const cat = E.memberCatalogue(gs(), ep, "influencerApp", "2026-11-09T14:30");
  const dmm = cat.find((x) => x.item.id === "GIF-0007")!;
  const bms = cat.find((x) => x.item.id === "GIF-0004")!;
  expect(dmm && !dmm.redeemable && dmm.blocks.some((b) => b.includes("out of stock")), "DMM redeemable");
  expect(bms && !bms.redeemable && bms.blocks.some((b) => b.includes("no inventory data")), "unknown availability redeemable");
  expect(!G.submitBackendGift(SNEHA, { memberId: ep.id, giftId: "GIF-0007", quantity: 1, deductPoints: true, reason: "GFT-ON-BEHALF", remarks: "x", evidence: [] }).ok, "order accepted");
  ok(G.setAvailability(RAHUL, "GIF-0007", "available", "Stock restored"), "restore");
  return "Out-of-stock and not-supplied items listed as unavailable; redemption refused";
});
test(13, "Overlapping point-cost configurations are detected; no precedence is invented", "blocked", () => {
  const r = G.saveCostRule(RAHUL, { id: "", giftId: "GIF-0001", programme: "EP", memberType: null, states: ["KL"], tiers: [], points: 600, effectiveFrom: "2026-12-01", effectiveTo: null, status: "draft", approvalRequestId: null, replaces: null, updatedBy: RAHUL, updatedAt: "" });
  expect(!r.ok && r.errors.some((e) => e.includes("Overlaps PCR-0001") && e.includes("GD-04")), r.errors.join("; "));
  const twin = { ...gs(), costs: [...gs().costs, { ...gs().costs[0], id: "PCR-X", points: 610 }] };
  const ep = mem().members.find((m) => m.programme === "EP")!;
  const c = E.costFor(twin, "GIF-0001", ep, "2026-11-09T14:30");
  expect(c.ambiguous && c.points == null && E.overlapPairs(twin.costs).length === 1, c.message);
  return "Overlapping rule refused; two matching rules → ambiguous, no cost";
});
test(14, "A member cannot access an ineligible gift", "blocked", () => {
  const cs = take((m) => m.programme === "CS", "t14");
  const r = G.submitBackendGift(SNEHA, { memberId: cs.id, giftId: "GIF-0006", quantity: 1, deductPoints: true, reason: "GFT-ON-BEHALF", remarks: "x", evidence: [] });
  expect(!r.ok && r.errors.some((e) => e.includes("Not offered to CS")), r.errors.join("; "));
});

/* ======================= Voucher operations (15–26) ======================= */

test(15, "Voucher inventory becomes available (invalid provider response records nothing)", "deterministic", () => {
  const before = gs().vouchers.length;
  expect(!G.syncVoucherInventory(RAHUL, "GIF-0002", 2, "invalid").ok && gs().vouchers.length === before, "invalid response recorded");
  ok(G.syncVoucherInventory(RAHUL, "GIF-0002", 2), "sync");
  expect(gs().vouchers.filter((v) => v.giftId === "GIF-0002" && v.status === "available").length === 2 && item("GIF-0002").availability === "available", "inventory");
  return "Flipkart ₹1,000: 2 available, out-of-stock cleared from inventory data";
});
let vEp: Member;
let issued = "";
test(16, "Voucher issued to an eligible member", "deterministic", () => {
  vEp = richEp("t16");
  const b0 = bal(vEp.id);
  const g = backendGift(vEp, "GIF-0001");
  expect(g.status === "completed", g.status);
  const v = gs().vouchers.find((x) => x.redemptionRef === g.id)!;
  expect(v && v.status === "issued" && v.memberId === vEp.id && v.ledgerRef === g.ledgerIds[0], "voucher");
  expect(b0 - bal(vEp.id) === 550, `debit ${b0 - bal(vEp.id)}`);
  issued = v.id;
  return `${v.id} ${v.codeMasked} from inventory; wallet debit 550 (${v.ledgerRef})`;
});
test(17, "Voucher delivery through WhatsApp / in-app mock services", "deterministic", () => {
  const v = gs().vouchers.find((x) => x.id === issued)!;
  const e = commsStore.get().events.find((x) => x.id === v.delivery.commId)!;
  expect(e && e.status === "processed" && e.notificationId === "N09", "no N09");
  const d = G.voucherDelivery(v);
  expect(d.whatsapp !== "not_applicable" && d.inapp !== "not_applicable", JSON.stringify(d));
  return `${e.id} → ${e.commId}; WhatsApp ${d.whatsapp}, in-app ${d.inapp} (voucher status stays Issued)`;
});
test(18, "Voucher appears in Gifts History integration data", "deterministic", () => {
  const h = G.giftsHistory(vEp.id).find((x) => x.ref === issued)!;
  expect(h && h.expiresOn && h.partner === "FPT-0001", "missing");
});
test(19, "Voucher used (duplicate provider callback ignored)", "deterministic", () => {
  const v = gs().vouchers.find((x) => x.origin === "phase7_redemption" && x.status === "issued" && x.redemptionRef !== "RED-00008")!;
  ok(G.voucherProviderCallback(v.id, "used", "CB-USE-1"), "used");
  const again = G.voucherProviderCallback(v.id, "used", "CB-USE-1");
  expect(again.ok && again.warnings.length && gs().vouchers.find((x) => x.id === v.id)!.status === "used", "duplicate");
});
test(20, "Voucher expired", "deterministic", () => {
  const v = gs().vouchers.find((x) => x.origin === "phase7_redemption" && x.status === "issued" && x.redemptionRef !== "RED-00008")!;
  ok(G.voucherProviderCallback(v.id, "expired", "CB-EXP-1"), "expired");
  expect(E.voucherStatusAt({ status: "issued", expiresOn: "2026-01-01" }, "2026-11-09T14:30") === "expired", "date rule");
  return `${v.id} expired by provider report; issued vouchers past expiry also show Expired`;
});
let recId = "";
test(21, "Member loses the voucher code", "governance", () => {
  const r = G.requestRecovery(SNEHA, { voucherId: issued, memberId: vEp.id, reason: "VRC-LOST", remarks: "Member deleted the message", evidence: [] });
  ok(r, "recovery");
  recId = r.id!;
});
test(22, "Admin initiates recovery: approval first, no new voucher yet", "governance", () => {
  const rec = gs().recoveries.find((x) => x.id === recId)!;
  expect(rec.status === "pending_approval" && req(rec.approvalRequestId!).workflowId === "WF-031", "routing");
  expect(gs().vouchers.filter((v) => v.redemptionRef?.startsWith(rec.voucherId)).length === 0 && gs().vouchers.find((v) => v.id === issued)!.status === "issued", "changed");
});
test(23, "Provider confirms recovery (re-send and reissue)", "deterministic", () => {
  const n = gs().vouchers.length;
  ok(decide(LAKSHMI, gs().recoveries.find((x) => x.id === recId)!.approvalRequestId!), "approve");
  const rec = gs().recoveries.find((x) => x.id === recId)!;
  expect(rec.outcome === "code_retrieved" && gs().vouchers.length === n, rec.outcome);
  expect(commsStore.get().events.some((e) => e.id === `EVT-N09-${recId}-recovered` && e.status === "processed"), "no N09");
  const seeded = gs().recoveries.find((x) => x.id === "VRR-0001")!;
  ok(G.setRecoverySimulation(RAHUL, "VRR-0001", "reissued"), "sim");
  ok(decide(LAKSHMI, seeded.approvalRequestId!), "approve seeded");
  const after = gs().recoveries.find((x) => x.id === "VRR-0001")!;
  const orig = gs().vouchers.find((v) => v.id === seeded.voucherId)!;
  expect(after.outcome === "reissued" && orig.status === "replaced" && gs().vouchers.filter((v) => v.origin === "recovery_reissue").length === 1, "reissue");
  return `${recId}: code re-sent, no new voucher. VRR-0001: one replacement ${after.reissuedVoucherId}; original marked Replaced`;
});
test(24, "Provider rejects recovery", "deterministic", () => {
  const v = gs().vouchers.find((x) => x.origin === "phase7_redemption" && x.status === "issued" && x.memberId && !gs().recoveries.some((r) => r.voucherId === x.id))!;
  const r = G.requestRecovery(SNEHA, { voucherId: v.id, memberId: v.memberId!, reason: "VRC-NOT-RECEIVED", remarks: "Not received", evidence: [] });
  ok(r, "request");
  ok(G.setRecoverySimulation(RAHUL, r.id!, "failed"), "sim");
  decide(LAKSHMI, gs().recoveries.find((x) => x.id === r.id)!.approvalRequestId!);
  const rec = gs().recoveries.find((x) => x.id === r.id)!;
  expect(rec.outcome === "failed" && gs().vouchers.find((x) => x.id === v.id)!.status === "issued", rec.outcome);
  expect(gs().audit.some((a) => a.action === "voucher_recovery_failed" && a.entityId === v.id), "audit");
});
test(25, "Duplicate reissue request is blocked", "blocked", () => {
  const v = gs().vouchers.find((x) => x.origin === "phase7_redemption" && x.status === "issued" && x.memberId && !gs().recoveries.some((r) => r.voucherId === x.id))!;
  ok(G.requestRecovery(SNEHA, { voucherId: v.id, memberId: v.memberId!, reason: "VRC-LOST", remarks: "First", evidence: [] }), "first");
  const second = G.requestRecovery(SNEHA, { voucherId: v.id, memberId: v.memberId!, reason: "VRC-LOST", remarks: "Second", evidence: [] });
  expect(!second.ok && second.errors[0].includes("already open"), second.errors.join("; "));
  const exp = gs().vouchers.find((x) => x.status === "expired")!;
  expect(!G.requestRecovery(SNEHA, { voucherId: exp.id, memberId: exp.memberId!, reason: "VRC-LOST", remarks: "x", evidence: [] }).ok, "expired recovered");
  return "Second open request and recovery after expiry refused";
});
test(26, "Voucher code access is restricted", "governance", () => {
  expect(!G.viewVoucherCode(RAHUL, issued).ok && !G.viewVoucherCode(TANUJIT, issued).ok, "code shown");
  const r = G.viewVoucherCode(SNEHA, issued);
  expect(r.ok && r.code?.includes("XXXX-XXXX") && gs().audit.some((a) => a.action === "voucher_code_viewed"), "Sneha");
  return "Only the named grant (DG-0005) views the masked code; the view is audited";
});

/* ======================= Physical fulfilment (27–40) ======================= */

let pEp: Member;
let ord1 = "";
test(27, "Member places a physical gift order", "deterministic", () => {
  pEp = richEp("t27");
  const g = backendGift(pEp, "GIF-0007");
  const o = gs().orders.find((x) => x.redemptionRef === g.id)!;
  expect(o && o.status === "awaiting_address" && o.ledgerRef === g.ledgerIds[0] && o.points === 1200 && o.address.line === pEp.addresses.gift!.line, "order");
  const seeded = gs().orders.find((x) => x.origin === "phase7_redemption")!;
  expect(seeded.ledgerRef && ws().redemptions.some((r) => r.id === seeded.redemptionRef), "seeded link");
  ord1 = o.id;
  return `${o.id} for ${g.id} (ledger ${o.ledgerRef}); member-app orders carry their Phase 7 redemption and debit`;
});
test(28, "Address confirmation remains pending (no method assumed)", "blocked", () => {
  expect(order(ord1).addressConfirmation.status === "pending" && gs().config.addressMethod === null, "pending");
  const r = G.confirmAddress(RAHUL, ord1, "confirmed", "X");
  expect(!r.ok && r.errors[0].includes("OP-GIFT1"), r.errors.join("; "));
});
test(29, "Order cannot dispatch before address verification", "blocked", () => {
  expect(!G.placeOrder(RAHUL, ord1).ok, "placed");
  const t = G.trackingUpdate(ord1, "PTE-T29", "dispatched", "2026-11-09T15:00", "SHP");
  expect(!t.ok && order(ord1).status === "awaiting_address" && order(ord1).exceptions.some((e) => e.kind === "address_issue"), "dispatched");
});
test(30, "Address verification succeeds (simulated, configured method)", "deterministic", () => {
  ok(G.setAddressMethod(RAHUL, "Development mock confirmation", null), "method");
  ok(G.confirmAddress(RAHUL, ord1, "confirmed", "DEV-ACF-T30"), "confirm");
  const c = order(ord1).addressConfirmation;
  expect(c.status === "confirmed" && c.simulated && c.reference === "DEV-ACF-T30" && c.at, "confirmation");
});
test(31, "Order is placed with the mock fulfilment partner", "deterministic", () => {
  ok(G.placeOrder(RAHUL, ord1), "place");
  expect(order(ord1).status === "placed" && order(ord1).partnerOrderRef, "placed");
});
test(32, "Order is dispatched", "deterministic", () => {
  ok(G.trackingUpdate(ord1, "PTE-T32", "dispatched", "2026-11-09T16:00", "MOCK-SHP-T"), "dispatch");
  expect(order(ord1).status === "dispatched" && order(ord1).shipmentRef === "MOCK-SHP-T", "dispatched");
});
test(33, "Order moves to Out for Delivery", "deterministic", () => {
  ok(G.trackingUpdate(ord1, "PTE-T33", "out_for_delivery", "2026-11-10T09:00", "MOCK-SHP-T"), "ofd");
  expect(order(ord1).status === "out_for_delivery", order(ord1).status);
  expect(!commsStore.get().events.some((e) => e.id === `EVT-N09-${order(ord1).redemptionRef}-delivered`), "delivered sent early");
});
test(34, "Order is Delivered (only on the partner's confirmation)", "deterministic", () => {
  expect(!G.markDeliveredManually(RAHUL, ord1).ok, "manual delivered");
  ok(G.trackingUpdate(ord1, "PTE-T34", "delivered", "2026-11-10T13:00", "MOCK-SHP-T"), "delivered");
  expect(order(ord1).status === "delivered", order(ord1).status);
});
test(35, "N09 delivery notification is triggered", "deterministic", () => {
  const ref = order(ord1).redemptionRef;
  const ev = commsStore.get().events.filter((e) => e.id === `EVT-N09-${ref}-dispatched` || e.id === `EVT-N09-${ref}-delivered`);
  expect(ev.length === 2 && ev.every((e) => e.status === "processed" && e.payload.tracking_ref === "MOCK-SHP-T"), JSON.stringify(ev.map((e) => e.status)));
  return "Dispatch and delivery N09 events with the tracking reference";
});
test(36, "A tracking event received twice is not processed twice", "deterministic", () => {
  const n = commsStore.get().events.length;
  const r = G.trackingUpdate(ord1, "PTE-T34", "delivered", "2026-11-10T13:05", "MOCK-SHP-T");
  expect(r.ok && r.warnings[0].includes("Duplicate") && order(ord1).tracking.filter((t) => t.duplicate).length === 1 && commsStore.get().events.length === n, "duplicate");
});
test(37, "Delivery tracking provider fails", "deterministic", () => {
  const o = gs().orders.find((x) => x.status === "placed" && x.id !== ord1)!;
  ok(G.trackingProviderFailure(o.id), "failure");
  expect(order(o.id).status === "placed" && order(o.id).exceptions.some((e) => e.kind === "tracking_unavailable" && e.open), "exception");
  return `${o.id}: tracking_unavailable exception; status unchanged`;
});
let ord2 = "";
test(38, "Address is changed after order creation", "deterministic", () => {
  const m = richEp("t38");
  const g = backendGift(m, "GIF-0006");
  ord2 = gs().orders.find((x) => x.redemptionRef === g.id)!.id;
  ok(G.confirmAddress(RAHUL, ord2, "confirmed", "DEV-ACF-T38"), "confirm");
  ok(G.changeOrderAddress(RAHUL, ord2, { line: "12 New Street", district: "Ernakulam", state: "KL", pincode: "682001" }, "Member moved"), "change");
  const o = order(ord2);
  expect(o.address.version === 2 && o.addressConfirmation.status === "reconfirmation_required" && o.addressChanges.length === 1, "change");
});
test(39, "The original order-address snapshot is preserved", "deterministic", () => {
  const o = order(ord2);
  expect(o.addressHistory[0].version === 1 && o.addressHistory[0].line !== "12 New Street" && !G.placeOrder(RAHUL, ord2).ok, "snapshot");
  return `v1 kept (${o.addressHistory[0].source}); dispatch blocked until reconfirmed`;
});
test(40, "An order exception appears in the operational queue", "deterministic", () => {
  const o = gs().orders.find((x) => x.status === "out_for_delivery")!;
  ok(G.trackingUpdate(o.id, "PTE-T40", "Returned to origin (mock partner text)", "2026-11-10T10:00", o.shipmentRef), "exception");
  const ex = order(o.id).exceptions.find((e) => e.kind === "returned")!;
  expect(order(o.id).status === "exception" && ex.detail.includes("Returned to origin") && order(o.id).tracking.some((t) => t.partnerStatus.startsWith("Returned")), "queue");
  ok(G.addExceptionRemark(RAHUL, o.id, ex.id, "Called the partner", true), "remark");
  expect(order(o.id).exceptions.find((e) => e.id === ex.id)!.issueRef, "issue");
  return `${o.id}: partner text kept as reported, linked issue raised`;
});

/* ======================= Backend gift redemption (41–51) ======================= */

test(41, "Single gift redemption with points", "deterministic", () => {
  const m = richEp("t41");
  const b0 = bal(m.id);
  const g = backendGift(m, "GIF-0006", true, 2);
  expect(g.status === "completed" && b0 - bal(m.id) === 3600 && g.ledgerIds.length, `debit ${b0 - bal(m.id)}`);
  return `${g.id}: 2 × 1,800 deducted through the wallet`;
});
test(42, "Single gift redemption without points (Deduct points = No)", "deterministic", () => {
  const m = anyEp("t42");
  const b0 = bal(m.id);
  const g = backendGift(m, "GIF-0006", false);
  const o = gs().orders.find((x) => x.redemptionRef === g.id)!;
  expect(g.foc && !g.ledgerIds.length && bal(m.id) === b0 && o.points === 0 && o.foc, "points moved");
});
test(43, "FOC redemption needs justification and keeps a separate reference", "governance", () => {
  const m = anyEp("t43");
  const r = G.submitBackendGift(SNEHA, { memberId: m.id, giftId: "GIF-0006", quantity: 1, deductPoints: false, reason: "GFT-SERVICE", remarks: "x", evidence: [] });
  expect(!r.ok && r.errors.some((e) => e.includes("justification")), r.errors.join("; "));
  const g = backendGift(m, "GIF-0006", false);
  expect(g.foc && g.createdBy === SNEHA && g.reason === "GFT-SERVICE" && req(g.approvalRequestId!).workflowId === "WF-025", "FOC");
  return `${g.id} recorded as FOC by Sneha, approved under WF-025`;
});
let batchText = "";
test(44, "Bulk CSV gift redemption (same content cannot be re-uploaded)", "deterministic", () => {
  const a = richEp("t44a"), b = anyEp("t44b");
  batchText = `${BACKEND_GIFT_CSV_HEADER.join(",")}\n${a.id},GIF-0006,1,no,GFT-CAMPAIGN,Event\n${b.id},GIF-0006,1,yes,GFT-SERVICE,Event\n${a.id},GIF-0006,1,no,GFT-CAMPAIGN,Event\nMBR-XX-0001,GIF-0006,1,no,GFT-CAMPAIGN,Event\n${b.id},GIF-0005,1,no,GFT-CAMPAIGN,Event`;
  const r = G.submitBackendGiftBatch(SNEHA, "bulk.csv", batchText);
  ok(r, "batch");
  expect(r.rows!.filter((x) => x.result === "valid").length === 2, JSON.stringify(r.rows));
  expect(!G.submitBackendGiftBatch(SNEHA, "bulk-retry.csv", batchText).ok, "retry accepted");
  return `${r.id}: 2 rows submitted (1 paid, 1 FOC); retry of the same file refused`;
});
test(45, "Invalid member reference", "blocked", () => {
  const b = gs().giftBatches[gs().giftBatches.length - 1];
  expect(b.rows.find((x) => x.memberId === "MBR-XX-0001")!.result === "invalid", "row");
  expect(!G.submitBackendGift(SNEHA, { memberId: "MBR-XX-9", giftId: "GIF-0006", quantity: 1, deductPoints: true, reason: "GFT-ON-BEHALF", remarks: "x", evidence: [] }).ok, "single");
});
test(46, "Inactive gift item", "blocked", () => {
  const b = gs().giftBatches[gs().giftBatches.length - 1];
  const row = b.rows.find((x) => x.giftId === "GIF-0005")!;
  expect(row.result === "invalid" && row.message.includes("inactive"), row.message);
});
test(47, "Insufficient point balance", "blocked", () => {
  const m = take((x) => x.programme === "EP" && bal(x.id) > 0 && bal(x.id) < 1200 && !!x.addresses.gift, "t47");
  const r = G.submitBackendGift(SNEHA, { memberId: m.id, giftId: "GIF-0007", quantity: 1, deductPoints: true, reason: "GFT-ON-BEHALF", remarks: "x", evidence: [] });
  expect(!r.ok && r.errors.some((e) => e.includes("Insufficient")), r.errors.join("; "));
});
test(48, "Duplicate CSV rows", "blocked", () => {
  const b = gs().giftBatches[gs().giftBatches.length - 1];
  expect(b.rows.filter((x) => x.result === "duplicate").length === 1, "duplicate");
});
let pendingGift = "";
test(49, "Approval pending: nothing is fulfilled or deducted", "governance", () => {
  const m = richEp("t49");
  const b0 = bal(m.id);
  const r = G.submitBackendGift(SNEHA, { memberId: m.id, giftId: "GIF-0007", quantity: 1, deductPoints: true, reason: "GFT-ON-BEHALF", remarks: "Pending", evidence: [] });
  ok(r, "submit");
  pendingGift = r.id!;
  expect(ws().gifts.find((x) => x.id === r.id)!.status === "pending_approval" && !gs().orders.some((o) => o.redemptionRef === r.id) && bal(m.id) === b0, "acted early");
});
let failedGift = "";
test(50, "Failed execution: no order, no deduction", "blocked", () => {
  const st = take((m) => m.programme === "ST" && !!m.addresses.gift && bal(m.id) >= 2000, "t50");
  const b0 = bal(st.id);
  const g = backendGift(st, "GIF-0006");
  failedGift = g.id;
  expect(g.status === "business_confirmation_required" && !gs().orders.some((o) => o.redemptionRef === g.id) && bal(st.id) === b0, g.status);
  return `${g.id}: ST redemption TDS is not confirmed (OP-TDS1), execution blocked, no order created`;
});
test(51, "Successful execution carries the ledger reference", "deterministic", () => {
  const o = order(ord1);
  const g = ws().gifts.find((x) => x.id === o.redemptionRef)!;
  expect(o.ledgerRef === g.ledgerIds[0] && ws().ledger.some((l) => l.id === o.ledgerRef), "ledger");
  return `${o.id} → ${o.redemptionRef} → ${o.ledgerRef}`;
});

/* ======================= Insurance cards (52–76) ======================= */

const H = INSURANCE_CSV_HEADER.join(",");
let n = 0;
const row = (m: Member, type: string, validity = "2026-12-01 to 2027-11-30", insurer?: string, number?: string) => [m.id, type, m.name, number ?? `DEV-INS-T${++n}`, "Demo qualification", "1800 000 0000", "100000", validity, insurer ?? gs().cardTypes.find((t) => t.id === type)!.insurer].map((c) => `"${c}"`).join(",");
const epIn = (states: string[], extra: (m: Member) => boolean = () => true) => mem().members.filter((m) => m.programme === "EP" && m.status !== "rejected" && states.includes(stateOf(m)) && extra(m));
const tiers = () => gs().config.tierAssignments;

test(52, "Create an insurance card type (Retailer refused)", "governance", () => {
  const r = G.saveCardType(RAHUL, { id: "", name: "Test cover card", insurer: "Mock Insurer C (development)", segmentation: { programmes: ["EP", "CS"], states: [], districts: [], branches: [], tiers: [] }, enabled: { EP: true, ST: false, CS: true }, status: "active" });
  ok(r, "type");
  expect(!G.saveCardType(RAHUL, { id: "", name: "Retail", insurer: "X", segmentation: { programmes: ["Retailer" as "EP"], states: [], districts: [], branches: [], tiers: [] }, enabled: { EP: false, ST: false, CS: false }, status: "active" }).ok, "Retailer accepted");
  return `${r.id} for EP and CS; Retailer card type refused (GD-06)`;
});
let batchId = "";
const cleanMembers: Member[] = [];
test(53, "Upload insurance records through CSV", "governance", () => {
  const ms = epIn(["KL", "TN", "KA"]).slice(20, 23);
  const st = mem().members.find((m) => m.programme === "ST" && m.status !== "rejected")!;
  cleanMembers.push(...ms, st);
  const r = G.uploadInsuranceCsv(RAHUL, "test-cards.csv", [H, ...ms.map((m) => row(m, "ICT-001")), row(st, "ICT-002"), row(ms[0], "ICT-002")].join("\n"), 1);
  ok(r, "upload");
  batchId = r.id!;
  const b = gs().batches.find((x) => x.id === batchId)!;
  expect(b.status === "validated" && b.rows.length === 5, `${b.status} ${b.rows.map((x) => x.result + x.errors.map((e) => e.message).join("|")).join(", ")}`);
  return `${batchId}: ${b.rows.filter((x) => x.result === "valid").length} valid of ${b.rows.length}`;
});
test(54, "All SOW fields are validated and keep their names", "deterministic", () => {
  expect(["Name", "Number", "Qualification", "Toll-Free Number", "Insurance Amount", "Validity Dates", "Insurer Name"].every((f) => INSURANCE_CSV_HEADER.includes(f)), "fields");
  expect(!G.uploadInsuranceCsv(RAHUL, "renamed.csv", H.replace("Insurer Name", "Insurer"), 1).ok, "renamed header accepted");
  const m = cleanMembers[0];
  const v = E.validateInsuranceCsv([H, `${m.id},ICT-001,,,,"abc",-5,,`].join("\n"), { s: gs(), mem: mem(), at: "2026-11-09T14:30" });
  const fields = v.rows[0].errors.map((e) => e.field);
  expect(["Name", "Number", "Insurance Amount", "Validity Dates", "Insurer Name", "Toll-Free Number"].every((f) => fields.includes(f)), fields.join(","));
});
test(55, "Invalid validity dates are detected", "blocked", () => {
  const m = cleanMembers[0];
  const v = E.validateInsuranceCsv([H, row(m, "ICT-001", "2027-05-01 to 2027-01-01"), row(m, "ICT-001", "01/01/2027"), row(m, "ICT-001", "2027-02-30 to 2027-12-31")].join("\n"), { s: gs(), mem: mem(), at: "2026-11-09T14:30" });
  expect(v.rows.every((r) => r.result === "invalid" && r.errors.some((e) => e.field === "Validity Dates")), JSON.stringify(v.rows.map((r) => r.errors)));
});
test(56, "Duplicate insurance number follows the configured rule (GD-03)", "deterministic", () => {
  const m = cleanMembers[0];
  const v1 = E.validateInsuranceCsv([H, row(m, "ICT-001", undefined, undefined, "DEV-INS-1001")].join("\n"), { s: gs(), mem: mem(), at: "2026-11-09T14:30" });
  expect(v1.rows[0].result === "duplicate", "seeded number not flagged");
  const other = row(m, "ICT-001", undefined, "Mock Insurer B (development)", "DEV-INS-1001");
  expect(E.validateInsuranceCsv([H, other].join("\n"), { s: gs(), mem: mem(), at: "2026-11-09T14:30" }).rows[0].errors.every((e) => e.field !== "Number"), "per-insurer rule");
  ok(G.setInsuranceSettings(RAHUL, { insuranceNumberRule: "unique_global" }), "rule");
  expect(E.validateInsuranceCsv([H, other].join("\n"), { s: gs(), mem: mem(), at: "2026-11-09T14:30" }).rows[0].result === "duplicate", "global rule");
  ok(G.setInsuranceSettings(RAHUL, { insuranceNumberRule: "unique_per_insurer" }), "restore");
  return "Same number: duplicate per insurer; across insurers only under the global setting";
});
test(57, "Invalid-row report: row, field, masked value, description", "deterministic", () => {
  const b = gs().batches.find((x) => x.id === "INB-0003")!;
  const errs = b.rows.flatMap((r) => r.errors.map((e) => ({ row: r.row, ...e })));
  expect(errs.length === 3 && errs.every((e) => e.row && e.field && e.message) && errs.filter((e) => e.field === "Number").every((e) => e.value.startsWith("••••")), JSON.stringify(errs));
});
test(58, "Submit batch for approval (atomic batch with invalid rows refused)", "governance", () => {
  const atomic = G.submitInsuranceBatch(RAHUL, "INB-0003");
  expect(!atomic.ok && atomic.errors[0].includes("Atomic"), atomic.errors.join("; "));
  const b = gs().batches.find((x) => x.id === batchId)!;
  expect(b.rows.every((r) => r.result === "valid"), "test batch not clean");
  ok(G.submitInsuranceBatch(RAHUL, batchId), "submit");
  const nb = gs().batches.find((x) => x.id === batchId)!;
  expect(nb.status === "pending_approval" && req(nb.approvalRequestId!).workflowId === "WF-032" && !gs().cards.some((c) => c.batchId === batchId), "routing");
});
test(59, "Maker cannot approve their own batch", "governance", () => {
  const r = decide(RAHUL, gs().batches.find((x) => x.id === batchId)!.approvalRequestId!);
  expect(!r.ok, "self-approved");
  return r.errors[0];
});
test(60, "Checker approves the batch", "governance", () => {
  const b = gs().batches.find((x) => x.id === batchId)!;
  ok(decideRequest(ANITA, b.approvalRequestId!, "approve", "Insurer list checked", req(b.approvalRequestId!).seq), "approve");
  expect(gs().batches.find((x) => x.id === batchId)!.status === "completed" && gs().batches.find((x) => x.id === batchId)!.approvedBy === ANITA, "not completed");
});
test(61, "Approved records are processed (unpublished; raw numbers not kept)", "deterministic", () => {
  const cards = gs().cards.filter((c) => c.batchId === batchId);
  const b = gs().batches.find((x) => x.id === batchId)!;
  expect(cards.length === 5 && cards.every((c) => !c.active && c.publication.status === "unpublished" && c.numberMasked.startsWith("••••")), "cards");
  expect(b.rows.every((r) => r.result === "imported" && r.values.Number.startsWith("••••")), "raw number kept");
  return `${cards.length} cards created, unpublished; batch rows hold masked numbers only`;
});
test(62, "Multiple insurance cards for one member", "deterministic", () => {
  const m = cleanMembers[0];
  const cards = gs().cards.filter((c) => c.memberId === m.id);
  expect(cards.length >= 2 && new Set(cards.map((c) => c.typeId)).size >= 2, `${cards.length}`);
});
const vrow = (m: Member, t: string) => E.validateInsuranceCsv([H, row(m, t)].join("\n"), { s: gs(), mem: mem(), at: "2026-11-09T14:30" }).rows[0];
test(63, "EP card segmentation", "deterministic", () => {
  const ep = epIn(["KL", "TN", "KA", "MH"], (m) => tiers()[m.id] === "TIER-EP-3")[0];
  const st = mem().members.find((m) => m.programme === "ST")!;
  expect(vrow(ep, "ICT-003").result === "valid" && vrow(st, "ICT-003").errors.some((e) => e.message.includes("Not offered to ST")), "EP");
});
test(64, "ST card segmentation", "deterministic", () => {
  const st = mem().members.find((m) => m.programme === "ST" && ["KL", "TN", "KA"].includes(stateOf(m)))!;
  const cs = mem().members.find((m) => m.programme === "CS")!;
  expect(vrow(st, "ICT-002").result === "valid" && vrow(cs, "ICT-002").result === "invalid", "ST");
});
test(65, "CS card segmentation and segment on / off without an app release", "deterministic", () => {
  const cs = mem().members.find((m) => m.programme === "CS" && m.status !== "rejected")!;
  expect(vrow(cs, "ICT-001").result === "valid", "CS row");
  const card = gs().cards.find((c) => c.programme === "CS" && E.cardStatus(c, "2026-11-09T14:30") === "active")!;
  const t = () => gs().cardTypes.find((x) => x.id === card.typeId);
  expect(E.memberVisible(card, t(), "2026-11-09T14:30"), "not visible");
  ok(G.setTypeEnabled(RAHUL, card.typeId, "CS", false, "Pause CS cards"), "off");
  expect(!E.memberVisible(card, t(), "2026-11-09T14:30") && gs().cards.find((c) => c.id === card.id)!.validTo === card.validTo, "still visible");
  ok(G.setTypeEnabled(RAHUL, card.typeId, "CS", true, "Resume"), "on");
});
test(66, "Regional segmentation", "deterministic", () => {
  const out = epIn(["MH", "GJ", "DL", "UP"])[0];
  expect(vrow(out, "ICT-002").errors.some((e) => e.message.includes("region")), "outside region accepted");
});
test(67, "Tier segmentation", "deterministic", () => {
  const bronze = mem().members.find((m) => tiers()[m.id] === "TIER-EP-1")!;
  const gold = mem().members.find((m) => tiers()[m.id] === "TIER-EP-3")!;
  expect(vrow(bronze, "ICT-003").result === "invalid" && vrow(gold, "ICT-003").result === "valid", "tier");
});
test(68, "Live profile photo from Member Management in the card preview", "deterministic", () => {
  const withPhoto = gs().cards.find((c) => mem().documents.some((d) => d.memberId === c.memberId && d.type === "selfie" && d.status === "approved"))!;
  const m = E.cardModel(withPhoto, mem().members.find((x) => x.id === withPhoto.memberId), mem(), gs().render, true);
  const doc = mem().documents.find((d) => d.memberId === withPhoto.memberId && d.type === "selfie")!;
  expect(m.photo.status === "approved" && m.photo.ref === (doc.latestRef ?? doc.id), "photo");
  const noPhoto = mem().members.find((x) => !mem().documents.some((d) => d.memberId === x.id && d.type === "selfie" && d.status === "approved"))!;
  expect(E.profilePhoto(mem(), noPhoto.id).status !== "approved", "invalid photo accepted");
  return `${withPhoto.id} uses selfie ${m.photo.ref}; ${noPhoto.id} flagged as an invalid photo reference`;
});
let pubCard = "";
test(69, "Card preview generated", "deterministic", () => {
  pubCard = gs().cards.find((c) => c.batchId === batchId)!.id;
  const r = G.previewCard(RAHUL, pubCard);
  expect(r.ok && r.model!.fields.some((f) => f.label === "Insurer") && r.model!.testLabel.includes("TEST PREVIEW") && gs().audit.some((a) => a.action === "preview_generated"), "preview");
});
test(70, "JPEG test output generated", "deterministic", () => {
  const r = G.recordTestDownload(RAHUL, pubCard, "jpeg");
  ok(r, "jpeg");
  ok(G.setRenderFormats(RAHUL, { jpeg: false, pdf: true }), "formats");
  expect(!G.recordTestDownload(RAHUL, pubCard, "jpeg").ok, "disabled format");
  ok(G.setRenderFormats(RAHUL, { jpeg: true, pdf: true }), "restore");
  expect(gs().render.productionFormat === null, "production format assumed");
  return `${r.id}: JPEG rendered from the card model (canvas in the browser); production format still BCR`;
});
test(71, "PDF test output generated", "deterministic", () => {
  ok(G.recordTestDownload(RAHUL, pubCard, "pdf"), "pdf");
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
  const pdf = E.buildTestPdf(jpeg, 640, 400, "TEST PREVIEW · NOT AN ISSUED INSURANCE CARD");
  const text = new TextDecoder("latin1").decode(pdf);
  expect(text.startsWith("%PDF-1.4") && text.includes("/DCTDecode") && text.includes("TEST PREVIEW") && text.trimEnd().endsWith("%%EOF"), "pdf structure");
  return `${pdf.length}-byte PDF with the JPEG embedded and the test label`;
});
test(72, "Watermark applied from configured development settings", "deterministic", () => {
  const c = gs().cards.find((x) => x.id === pubCard)!;
  expect(E.cardModel(c, undefined, mem(), gs().render, true).watermark === null, "watermark invented");
  ok(G.setWatermark(RAHUL, { text: "DEV SAMPLE", position: "diagonal", opacity: 0.15 }), "watermark");
  const m = E.cardModel(c, undefined, mem(), gs().render, true);
  expect(m.watermark?.text === "DEV SAMPLE" && gs().render.watermark.status === "development_setting" && gs().audit.some((a) => a.action === "watermark_configuration_changed"), "not applied");
});
test(73, "Card activated (only through approved publication)", "governance", () => {
  expect(!G.setCardActive(RAHUL, pubCard, true, "Try").ok, "activated without approval");
  const ids = gs().cards.filter((c) => c.batchId === batchId).map((c) => c.id);
  const r = G.requestPublication(RAHUL, ids);
  ok(r, "publication");
  const p = gs().publications.find((x) => x.id === r.id)!;
  expect(!decide(RAHUL, p.approvalRequestId!).ok, "self-approved");
  ok(decide(ANITA, p.approvalRequestId!), "approve");
  expect(gs().cards.filter((c) => ids.includes(c.id)).every((c) => c.active && c.publication.status === "published" && c.publication.ref === r.id), "not published");
  return `${r.id}: ${ids.length} cards published and active after WF-033`;
});
test(74, "Card deactivated without an application release", "deterministic", () => {
  const before = gs().cards.find((c) => c.id === pubCard)!;
  ok(G.setCardActive(RAHUL, pubCard, false, "Hold"), "deactivate");
  const c = gs().cards.find((x) => x.id === pubCard)!;
  expect(!c.active && c.validFrom === before.validFrom && c.validTo === before.validTo && !E.memberVisible(c, gs().cardTypes.find((t) => t.id === c.typeId), "2026-11-09T14:30") && c.history.length > before.history.length, "deactivation");
  expect(gs().audit.slice(-1)[0].reason.includes("no app release"), "audit");
  ok(G.setCardActive(RAHUL, pubCard, true, "Released"), "reactivate");
});
test(75, "Expired card is not shown as active", "deterministic", () => {
  const c = gs().cards.find((x) => E.cardStatus(x, "2026-11-09T14:30") === "expired")!;
  expect(!E.memberVisible(c, gs().cardTypes.find((t) => t.id === c.typeId), "2026-11-09T14:30") && !G.setCardActive(RAHUL, c.id, true, "Try").ok, "expired active");
  return `${c.id} expired ${c.validTo}; reactivation refused, dates unchanged`;
});
test(76, "Unauthorised user cannot download restricted card data", "governance", () => {
  expect(!G.recordTestDownload(ANITA, pubCard, "pdf").ok && !G.recordTestDownload(TANUJIT, pubCard, "jpeg").ok && !G.recordTestDownload(SNEHA, pubCard, "pdf").ok, "downloaded");
});

/* ======================= Governance (77–85) ======================= */

test(77, "Unauthorised user cannot publish a gift item", "governance", () => {
  const r = G.saveItem(RAHUL, newItem({ name: "Gov test", code: "GOV-77" }));
  ok(r, "save");
  ok(G.saveInitialCost(RAHUL, r.id!, null, 100, "2026-11-01"), "cost");
  expect(!G.submitItem(IMRAN, r.id!).ok && !G.submitItem(VIKRAM, r.id!).ok, "submitted");
  expect(!G.setItemStatus(VIKRAM, "GIF-0006", "inactive", "x").ok && !G.setItemStatus(ANITA, "GIF-0006", "inactive", "x").ok, "status changed");
  ok(G.submitItem(RAHUL, r.id!), "submit");
  expect(!decide(TANUJIT, item(r.id!).approvalRequestId!).ok, "Super Admin approved");
  const cost = G.saveCostRule(VIKRAM, { ...gs().costs[0], id: "", points: 1 });
  expect(!cost.ok, "cost changed");
  return "Partner, Sales Rep and Client Admin cannot submit or deactivate; Super Admin cannot approve";
});
test(78, "Unauthorised user cannot recover a voucher", "governance", () => {
  const v = gs().vouchers.find((x) => x.status === "issued" && x.memberId && !gs().recoveries.some((r) => r.voucherId === x.id))!;
  expect(!G.requestRecovery(IMRAN, { voucherId: v.id, memberId: v.memberId!, reason: "VRC-LOST", remarks: "x", evidence: [] }).ok && !G.requestRecovery(ANITA, { voucherId: v.id, memberId: v.memberId!, reason: "VRC-LOST", remarks: "x", evidence: [] }).ok, "recovered");
  const open = gs().recoveries.find((r) => r.status === "pending_approval")!;
  expect(!decide(RAHUL, open.approvalRequestId!).ok, "non-Finance approved recovery");
});
test(79, "Full voucher code is never exposed without permission", "governance", () => {
  expect(!G.viewVoucherCode(ANITA, issued).ok && !G.viewVoucherCode(VIKRAM, issued).ok, "code shown");
  expect(gs().vouchers.every((v) => /^XXXX-XXXX-(XXXX|\d{4})$/.test(v.codeMasked)), "unmasked code stored");
});
test(80, "User cannot access an order outside the geographical scope", "governance", () => {
  const kl = gs().orders.find((o) => o.branchCode.startsWith("KL-"))!;
  expect(!G.orderVisible(KA_ADMIN, kl) && G.orderVisible(RAHUL, kl), "KA admin sees KL order");
  expect(G.ordersFor(KA_ADMIN).every((o) => o.branchCode.startsWith("KA-")) && !G.confirmAddress(KA_ADMIN, kl.id, "confirmed", "x").ok, "scope");
  return `Regional Admin (KA) sees ${G.ordersFor(KA_ADMIN).length} KA order(s) only`;
});
test(81, "User without insurance permission cannot open sensitive insurance data", "governance", () => {
  expect(!G.previewCard(KA_ADMIN, pubCard).ok && !G.previewCard(ANITA, pubCard).ok && !G.previewCard(TANUJIT, pubCard).ok && !G.canOnMember(KA_ADMIN, "insurance", "view", null), "insurance data opened");
});
const auditSnapshot = JSON.stringify(gs().audit.slice(0, 50));
test(82, "Historical gift, voucher and insurance audit records are preserved", "deterministic", () => {
  const a = gs().audit;
  expect(JSON.stringify(a.slice(0, 50)) === auditSnapshot && a.every((x, i) => x.id === `GAE-${String(i + 1).padStart(6, "0")}`), "audit rewritten");
  const actions = new Set(a.map((x) => x.action));
  expect(["gift_published", "point_cost_drafted", "voucher_issued", "voucher_used", "voucher_reissued", "order_created", "address_confirmed", "delivered", "csv_uploaded", "upload_approved", "card_published", "card_deactivated", "test_download_generated"].every((x) => actions.has(x)), [...actions].join(","));
  return `${a.length} append-only events`;
});
test(83, "Approval and execution statuses remain distinct", "governance", () => {
  const pending = ws().gifts.find((g) => g.id === pendingGift)!;
  expect(req(pending.approvalRequestId!).status === "pending_approval" && req(pending.approvalRequestId!).execution.status !== "executed", "pending");
  const failed = ws().gifts.find((g) => g.id === failedGift)!;
  const r = req(failed.approvalRequestId!);
  expect(r.status === "approved" && failed.status === "business_confirmation_required", `${r.status} / ${failed.status}`);
  return `${failed.id}: approved, execution blocked (${r.execution.status})`;
});
test(84, "Failed fulfilment does not silently delete the original redemption", "deterministic", () => {
  const m = richEp("t84");
  const r = G.submitBackendGift(SNEHA, { memberId: m.id, giftId: "GIF-0003", quantity: 1, deductPoints: true, reason: "GFT-ON-BEHALF", remarks: "Partner goes down", evidence: [] });
  ok(r, "submit");
  const p = gs().partners.find((x) => x.id === "FPT-0003")!;
  ok(G.savePartner(RAHUL, { ...p, status: "inactive" }), "deactivate partner");
  decide(LAKSHMI, ws().gifts.find((x) => x.id === r.id)!.approvalRequestId!);
  const g = ws().gifts.find((x) => x.id === r.id)!;
  const issue = gs().issues.find((x) => x.redemptionRef === g.id)!;
  expect(g.status === "completed" && g.ledgerIds.length && issue && issue.kind === "partner_inactive" && issue.pointsDeducted === 600, "issue");
  ok(G.requestFulfilmentRefund(SNEHA, issue.id, "Refund approved by operations"), "refund");
  const adj = ws().adjustments.find((a) => a.id === gs().issues.find((x) => x.id === issue.id)!.refundRef)!;
  expect(adj && adj.direction === "add" && adj.points === 600 && adj.reasonCode === "ADJ-GIFT-FULFIL" && adj.approvalCode === g.id && adj.status === "pending_approval", "refund link");
  ok(G.savePartner(RAHUL, { ...p, status: "active" }), "reactivate");
  return `${g.id} kept with debit ${g.ledgerIds[0]}; refund ${adj.id} raised through the wallet (pending approval)`;
});
test(85, "A duplicate backend callback creates no duplicate order or voucher", "deterministic", () => {
  const o = order(ord1);
  const counts = [gs().orders.length, gs().vouchers.length];
  const r = G.fulfilRedemption(o.redemptionRef);
  const again = G.fulfilRedemption(gs().vouchers.find((v) => v.id === issued)!.redemptionRef!);
  expect(r.ok && r.warnings[0].includes("Already fulfilled") && again.ok && gs().orders.length === counts[0] && gs().vouchers.length === counts[1], "duplicate created");
});

/* ---------------- Report ---------------- */
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(3)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const byKind = (k: Kind) => results.filter((r) => r.kind === k);
console.log(`\n${pass}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
if (pass !== results.length) process.exit(1);
