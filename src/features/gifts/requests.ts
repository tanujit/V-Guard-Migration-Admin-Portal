/**
 * Approval request specifications for Gift & Fulfilment and Insurance Card changes (Phase 9).
 * Used by the store and by the precomputed approval scenario steps, so seeded and live requests match.
 */
import { GIFT_TYPE } from "@/config/giftsCatalogue";
import type { FieldChange, ImpactSummary } from "@/types/approval";
import type { GiftItem, GiftState, InsuranceBatch, InsuranceCard, PointCostRule, VoucherRecord, VoucherRecoveryRequest } from "@/types/gifts";

export interface GiftSpec {
  type: string;
  title: string;
  entity: string;
  programme: string | null;
  amount: number | null;
  fields: FieldChange[];
  purpose: string;
  reason: string;
  justification: string;
  impact: ImpactSummary | null;
}

const f = (key: string, label: string, before: string | number | null, after: string | number | null, material = false): FieldChange => ({ key, label, kind: "text", before, after, material });
const pts = (key: string, label: string, before: number | null, after: number | null): FieldChange => ({ key, label, kind: "points", before, after, material: true });
const prog = (p: string[]) => (p.length === 1 ? p[0] : p.length ? p.join(" + ") : null);
const seg = (i: GiftItem) => `${i.segmentation.programmes.join(", ") || "—"} · ${i.segmentation.states.join(", ") || "all regions"} · ${i.segmentation.tiers.join(", ") || "all tiers"}`;
const channels = (i: GiftItem) => [i.channels.influencerApp && "Influencer app", i.channels.retailerApp && "Retailer app / SDK", i.channels.microsite && "Microsite"].filter(Boolean).join(", ");

export function catalogueSpec(i: GiftItem, prev: GiftItem | undefined, s: GiftState): GiftSpec {
  const costs = s.costs.filter((c) => c.giftId === i.id && (c.status === "active" || c.status === "pending_approval" || c.status === "draft"));
  const mapping = s.mappings.find((m) => m.giftId === i.id && m.status === "active");
  return {
    type: "gift_catalogue_publish",
    title: `${prev?.status === "active" ? "Update" : "Publish"} gift ${i.code} · ${i.name}`,
    entity: `${i.id} v${i.version}`,
    programme: prog(i.segmentation.programmes),
    amount: null,
    fields: [
      f("name", "Gift", prev?.name ?? null, i.name),
      f("type", "Gift type", prev ? GIFT_TYPE[prev.type].label : null, GIFT_TYPE[i.type].label),
      f("segmentation", "Programme · region · tier", prev ? seg(prev) : null, seg(i), true),
      f("channels", "Catalogue channels", prev ? channels(prev) : null, channels(i)),
      f("availability", "Availability", prev?.availability ?? null, i.availability, true),
      f("partner", "Partner / SKU mapping", null, mapping ? `${mapping.partnerId} · ${mapping.partnerSku}` : i.type === "vguard_com" ? `V-Guard.com ${i.vguard?.catalogueRef ?? ""}` : "No mapping", true),
      f("sku", "Product & SKU master reference", prev?.productSkuId ?? null, i.productSkuId),
      f("costs", "Point costs", null, costs.map((c) => `${c.programme ?? "All"}${c.states.length ? ` ${c.states.join("/")}` : ""}${c.tiers.length ? ` ${c.tiers.join("/")}` : ""}: ${c.points}`).join("; ") || "None", true),
    ],
    purpose: "Gift catalogue publication (SOW 8.1 / 8.5)",
    reason: i.history[i.history.length - 1]?.change || "Catalogue item ready for members",
    justification: "Approval publishes the version; members never see a draft or unapproved item",
    impact: { affectedProgrammes: i.segmentation.programmes, operationalImpact: `Visible on ${channels(i)}` },
  };
}

export function costSpec(r: PointCostRule, prev: PointCostRule | undefined, item: GiftItem | undefined): GiftSpec {
  return {
    type: "gift_point_cost_change",
    title: `Point cost ${item?.code ?? r.giftId} · ${r.programme ?? "all programmes"}${r.tiers.length ? ` · ${r.tiers.join("/")}` : ""}`,
    entity: r.id,
    programme: r.programme,
    amount: null,
    fields: [pts("points", "Point cost", prev?.points ?? null, r.points), f("segment", "Segment", prev ? `${prev.programme ?? "All"} ${prev.states.join("/")} ${prev.tiers.join("/")}`.trim() : null, `${r.programme ?? "All"} ${r.memberType ?? ""} ${r.states.join("/")} ${r.tiers.join("/")}`.replace(/\s+/g, " ").trim(), true), f("effective", "Effective", prev ? `${prev.effectiveFrom} – ${prev.effectiveTo ?? "open"}` : null, `${r.effectiveFrom} – ${r.effectiveTo ?? "open"}`, true)],
    purpose: "Segment-specific gift point cost (SOW 8.1)",
    reason: prev ? `Replaces ${prev.id}; the old value is kept as superseded` : "New segment point cost",
    justification: "Overlap checked: no other live rule matches the same segment and dates",
    impact: { affectedProgrammes: r.programme ? [r.programme] : [] },
  };
}

export function recoverySpec(r: VoucherRecoveryRequest, v: VoucherRecord): GiftSpec {
  return {
    type: "voucher_recovery",
    title: `Voucher recovery ${v.id} · ${r.memberId}`,
    entity: r.id,
    programme: null,
    amount: null,
    fields: [f("voucher", "Original voucher", null, `${v.id} · ${v.partnerId} · ₹${v.value} · ${v.codeMasked}`), f("status", "Voucher status", null, v.status), f("expiry", "Expiry", null, v.expiresOn), f("reason", "Reason", null, r.reason, true)],
    purpose: "Voucher recovery / reissue through the provider adapter (SOW 8.2)",
    reason: r.remarks,
    justification: "Approval asks the provider; it never creates a second active voucher for the same redemption",
    impact: { affectedMembers: 1 },
  };
}

export function insuranceBatchSpec(b: InsuranceBatch, programmes: string[], regions: string[], tiers: string[], watermark: string): GiftSpec {
  const valid = b.rows.filter((r) => r.result === "valid");
  const dates = valid.map((r) => r.values["Validity Dates"]).filter(Boolean);
  return {
    type: "insurance_batch_upload",
    title: `Insurance card upload ${b.id} · ${valid.length} records`,
    entity: b.id,
    programme: prog(programmes),
    amount: null,
    fields: [
      f("file", "Upload batch", null, `${b.fileName} (${b.sizeKb} KB)`),
      f("records", "Total / valid / invalid", null, `${b.rows.length} / ${valid.length} / ${b.rows.length - valid.length}`, true),
      f("policy", "Processing policy", null, b.policy === "atomic" ? "Atomic: all rows or none" : "Row level: valid rows only"),
      f("insurers", "Insurers", null, [...new Set(valid.map((r) => r.values["Insurer Name"]))].join(", ")),
      f("programmes", "Programmes", null, programmes.join(", ")),
      f("regions", "Regions", null, regions.join(", ") || "—"),
      f("tiers", "Tiers", null, tiers.join(", ") || "Not supplied"),
      f("validity", "Validity range", null, dates.length ? `${dates.map((d) => d.split(/\s+to\s+/i)[0]).sort()[0]} to ${dates.map((d) => d.split(/\s+to\s+/i)[1]).sort().slice(-1)[0]}` : null, true),
      f("watermark", "Watermark configuration", null, watermark),
    ],
    purpose: "Insurance card bulk upload (SOW 8.4, Maker-Checker required)",
    reason: `${valid.length} validated records`,
    justification: "Approval creates the card records; it does not publish them. Publication is a separate approval",
    impact: { affectedMembers: new Set(valid.map((r) => r.values.member_id)).size, affectedProgrammes: programmes },
  };
}

export function insurancePublishSpec(pubId: string, cards: InsuranceCard[], watermark: string, format: string): GiftSpec {
  const progs = [...new Set(cards.map((c) => c.programme))];
  return {
    type: "insurance_card_publish",
    title: `Publish ${cards.length} insurance card${cards.length === 1 ? "" : "s"} · ${pubId}`,
    entity: pubId,
    programme: prog(progs),
    amount: null,
    fields: [f("cards", "Cards", null, cards.map((c) => `${c.id} (${c.memberId})`).join(", "), true), f("validity", "Validity", null, cards.map((c) => `${c.validFrom}–${c.validTo}`).filter((x, i, a) => a.indexOf(x) === i).join("; ")), f("watermark", "Watermark", null, watermark), f("format", "Download format", null, format)],
    purpose: "Insurance card publication (SOW 8.4 / 10.8 AF20)",
    reason: "Preview and test download reviewed",
    justification: "Publication makes the cards available through the member application contract (not connected in this build)",
    impact: { affectedMembers: new Set(cards.map((c) => c.memberId)).size, affectedProgrammes: progs },
  };
}
