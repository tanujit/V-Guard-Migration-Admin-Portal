/**
 * GIFT & FULFILMENT / INSURANCE ENGINE — pure functions (Phase 9).
 * Segmentation, point-cost resolution, overlap detection, redeemability, the insurance CSV validator,
 * the card render model and the test PDF builder. No store access here, so tests can call it directly.
 */
import { GEOGRAPHY, findBranch } from "@/config/geography";
import { INSURANCE_CSV_HEADER, INSURANCE_PROGRAMMES } from "@/config/giftsCatalogue";
import { geoOfMember, memberById, type MemberState } from "@/features/members/engine";
import type { Member } from "@/types/members";
import type { Sku } from "@/types/masters";
import type { Tier } from "@/types/schemes";
import type { GiftItem, GiftState, InsuranceCard, InsuranceCardType, InsuranceRow, PointCostRule, RenderConfig, Segmentation } from "@/types/gifts";

export const day = (at: string) => at.slice(0, 10);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export const geoOf = (m: Member) => geoOfMember(m) as { state?: string; district?: string; branch?: string };
export const tierOf = (s: GiftState, memberId: string): string | null => s.config.tierAssignments[memberId] ?? null;

/* ======================= Segmentation ======================= */

/** Reasons the member is outside the segment. Empty = inside. Tier is never guessed. */
export function segmentReasons(seg: Segmentation, m: Member, tier: string | null): string[] {
  const r: string[] = [];
  const g = geoOf(m);
  if (seg.programmes.length && !seg.programmes.includes(m.programme)) r.push(`Not offered to ${m.programme}`);
  if (seg.states.length && !(g.state && seg.states.includes(g.state))) r.push(`Outside the configured region (member state ${g.state ?? "unknown"})`);
  if (seg.districts.length && !(g.district && seg.districts.includes(g.district))) r.push(`Outside the configured districts (${g.district ?? "unknown"})`);
  if (seg.branches.length && !seg.branches.includes(m.branchCode)) r.push(`Outside the configured branches (${m.branchCode})`);
  if (seg.tiers.length) {
    if (!tier) r.push("Tier-restricted: the member's tier is not available from the tier service");
    else if (!seg.tiers.includes(tier)) r.push(`Outside the configured tiers (member tier ${tier})`);
  }
  return r;
}

export function validateSegmentation(seg: Segmentation, tiers: Tier[]): string[] {
  const errors: string[] = [];
  if (!seg.programmes.length) errors.push("Choose at least one programme: an item appears only to eligible member types");
  for (const st of seg.states) if (!findStateCode(st)) errors.push(`Unknown state ${st}`);
  for (const b of seg.branches) if (!findBranch(b)) errors.push(`Unknown branch ${b}`);
  for (const t of seg.tiers) {
    const tier = tiers.find((x) => x.id === t);
    if (!tier) errors.push(`Unknown tier ${t}: tiers come from the Tier master`);
    else if (tier.status !== "active") errors.push(`Tier ${tier.name} (${t}) is not active`);
    else if (seg.programmes.length && !(seg.programmes as string[]).includes(tier.programme)) errors.push(`Tier ${t} belongs to ${tier.programme}, which is not among the item's programmes`);
  }
  return errors;
}
const findStateCode = (code: string) => GEOGRAPHY.some((x) => x.code === code);

/* ======================= Point costs ======================= */

const inRange = (r: { effectiveFrom: string; effectiveTo: string | null }, d: string) => r.effectiveFrom <= d && (!r.effectiveTo || r.effectiveTo >= d);

export function ruleMatches(r: PointCostRule, m: Member, tier: string | null, d: string): boolean {
  const g = geoOf(m);
  return r.status === "active" && inRange(r, d) && (!r.programme || r.programme === m.programme) && (!r.memberType || r.memberType === m.memberType) && (!r.states.length || (!!g.state && r.states.includes(g.state))) && (!r.tiers.length || (!!tier && r.tiers.includes(tier)));
}

export interface CostResolution {
  points: number | null;
  matches: PointCostRule[];
  ambiguous: boolean;
  message: string;
}
/** The applicable point cost. Two matching rules without a precedence rule are ambiguous (GD-04). */
export function costFor(s: GiftState, giftId: string, m: Member, at: string): CostResolution {
  const d = day(at);
  const matches = s.costs.filter((r) => r.giftId === giftId && ruleMatches(r, m, tierOf(s, m.id), d));
  if (!matches.length) return { points: null, matches, ambiguous: false, message: "No point cost is configured for this member's segment" };
  if (matches.length > 1) return { points: null, matches, ambiguous: true, message: `Ambiguous point cost: ${matches.map((x) => `${x.id} (${x.points})`).join(", ")} all match and no precedence rule is configured (GD-04)` };
  return { points: matches[0].points, matches, ambiguous: false, message: `${matches[0].points} points (${matches[0].id})` };
}

const meets = <T>(a: T[], b: T[]) => !a.length || !b.length || a.some((x) => b.includes(x));
const datesOverlap = (a: PointCostRule, b: PointCostRule) => a.effectiveFrom <= (b.effectiveTo ?? "9999-12-31") && b.effectiveFrom <= (a.effectiveTo ?? "9999-12-31");
export function segmentsOverlap(a: PointCostRule, b: PointCostRule) {
  return (!a.programme || !b.programme || a.programme === b.programme) && (!a.memberType || !b.memberType || a.memberType === b.memberType) && meets(a.states, b.states) && meets(a.tiers, b.tiers) && datesOverlap(a, b);
}
/** Live or pending rules of the same gift that would match the same member on the same day. */
export function overlapsOf(rules: PointCostRule[], c: PointCostRule): PointCostRule[] {
  return rules.filter((r) => r.id !== c.id && r.id !== c.replaces && r.giftId === c.giftId && (r.status === "active" || r.status === "pending_approval") && segmentsOverlap(r, c));
}
/** Every overlapping pair among active rules (shown on the matrix). */
export function overlapPairs(rules: PointCostRule[]): [PointCostRule, PointCostRule][] {
  const live = rules.filter((r) => r.status === "active");
  const out: [PointCostRule, PointCostRule][] = [];
  live.forEach((a, i) => live.slice(i + 1).forEach((b) => a.giftId === b.giftId && segmentsOverlap(a, b) && out.push([a, b])));
  return out;
}

export function validateCostRule(s: GiftState, r: PointCostRule): string[] {
  const errors: string[] = [];
  const item = s.items.find((x) => x.id === r.giftId);
  if (!item) errors.push("Gift item not found");
  if (!Number.isInteger(r.points) || r.points < 1) errors.push("Point cost must be a whole number of points above zero");
  if (!isDate(r.effectiveFrom)) errors.push("Enter a valid effective-from date");
  if (r.effectiveTo && (!isDate(r.effectiveTo) || r.effectiveTo < r.effectiveFrom)) errors.push("Effective-to must be a valid date on or after effective-from");
  if (item && r.programme && !item.segmentation.programmes.includes(r.programme)) errors.push(`${r.programme} is not among the item's programmes`);
  for (const o of overlapsOf(s.costs, r)) errors.push(`Overlaps ${o.id} (${o.programme ?? "all programmes"}, ${o.states.join("/") || "all regions"}, ${o.tiers.join("/") || "all tiers"}, from ${o.effectiveFrom}): no precedence rule is configured (GD-04)`);
  return errors;
}

/* ======================= Catalogue items ======================= */

export interface ItemContext {
  skus: Sku[];
  tiers: Tier[];
}
export function validateItem(s: GiftState, item: GiftItem, ctx: ItemContext): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!item.name.trim()) errors.push("Gift name is required");
  if (s.items.some((x) => x.id !== item.id && x.code.trim().toLowerCase() === item.code.trim().toLowerCase())) errors.push(`Gift code ${item.code} is already used`);
  const cat = s.categories.find((c) => c.id === item.categoryId);
  if (!cat) errors.push("Choose a gift category");
  else if (cat.status !== "active") errors.push(`Category ${cat.name} is inactive`);
  const partner = item.partnerId ? s.partners.find((p) => p.id === item.partnerId) : undefined;
  if (item.type === "voucher") {
    if (!partner) errors.push("Choose the voucher partner");
    if (!item.voucher?.productRef.trim()) errors.push("Enter the partner product / SKU reference");
  }
  if (item.type === "physical" && !partner) errors.push("Choose the fulfilment partner");
  if (item.type === "vguard_com" && !item.vguard?.catalogueRef.trim()) errors.push("Enter the V-Guard catalogue reference");
  if (partner && !partner.supportedTypes.includes(item.type)) errors.push(`${partner.name} does not support ${item.type.replace("_", ".")} gifts`);
  if (partner && partner.status !== "active") errors.push(`${partner.name} is inactive`);
  if (item.productSkuId) {
    const sku = ctx.skus.find((k) => k.id === item.productSkuId);
    if (!sku) errors.push(`SKU ${item.productSkuId} is not in the Product & SKU master`);
    else if (sku.status !== "active") errors.push(`SKU ${sku.code} is ${sku.status} in the Product & SKU master`);
  } else if (item.type === "vguard_com") warnings.push("No Product & SKU mapping: V-Guard.com items normally reference an SKU");
  errors.push(...validateSegmentation(item.segmentation, ctx.tiers));
  if (!item.channels.influencerApp && !item.channels.retailerApp && !item.channels.microsite) errors.push("Choose at least one catalogue channel");
  if (item.availability === "available" && item.inventory.source === "not_supplied") warnings.push("Availability is set by an operator: no inventory data is supplied for this item");
  return { errors, warnings };
}

/** Why the item cannot be redeemed now (empty = redeemable) — catalogue checks only, not wallet balance. */
export function redeemBlocks(s: GiftState, item: GiftItem, m: Member, at: string): string[] {
  const r: string[] = [];
  if (item.status !== "active") r.push(`${item.name} is ${item.status.replace("_", " ")} in the catalogue`);
  else if (item.effectiveFrom > day(at)) r.push(`${item.name} is effective from ${item.effectiveFrom}`);
  if (item.availability !== "available") r.push(`${item.name} is ${item.availability === "out_of_stock" ? "out of stock" : item.availability === "unknown" ? "not confirmed as available (no inventory data)" : "unavailable"}`);
  r.push(...segmentReasons(item.segmentation, m, tierOf(s, m.id)));
  if (item.partnerId) {
    const p = s.partners.find((x) => x.id === item.partnerId);
    if (!p || p.status !== "active") r.push("The fulfilment partner is inactive");
    if (item.type !== "vguard_com" && !s.mappings.some((x) => x.giftId === item.id && x.partnerId === item.partnerId && x.status === "active")) r.push("No active partner / SKU mapping for this item");
  }
  return r;
}

/** Catalogue as a member would see it on a channel: eligible items only, unavailable ones flagged. */
export function memberCatalogue(s: GiftState, m: Member, channel: "influencerApp" | "retailerApp" | "microsite", at: string) {
  return s.items
    .filter((i) => i.status === "active" && i.channels[channel] && !segmentReasons(i.segmentation, m, tierOf(s, m.id)).length)
    .map((i) => {
      const blocks = redeemBlocks(s, i, m, at);
      const cost = costFor(s, i.id, m, at);
      return { item: i, cost, redeemable: !blocks.length && cost.points != null, blocks: cost.points == null ? [...blocks, cost.message] : blocks };
    });
}

/* ======================= Mapping ======================= */

export function validateMapping(s: GiftState, mp: { id: string; giftId: string; partnerId: string; partnerSku: string; productSkuId: string | null }, skus: Sku[]): string[] {
  const e: string[] = [];
  const item = s.items.find((x) => x.id === mp.giftId);
  const partner = s.partners.find((x) => x.id === mp.partnerId);
  if (!item) e.push("Gift item not found");
  if (!partner) e.push("Missing partner reference");
  if (!mp.partnerSku.trim()) e.push("Missing partner SKU");
  if (item && partner && !partner.supportedTypes.includes(item.type)) e.push(`Incompatible gift type: ${partner.name} does not fulfil ${item.type.replace("_", ".")} gifts`);
  if (partner && partner.status !== "active") e.push(`${partner.name} is inactive`);
  if (mp.productSkuId) {
    const k = skus.find((x) => x.id === mp.productSkuId);
    if (!k) e.push(`SKU ${mp.productSkuId} not in the Product & SKU master`);
    else if (k.status !== "active") e.push(`SKU ${k.code} is ${k.status} (inactive products cannot be mapped)`);
  }
  const dup = s.mappings.find((x) => x.id !== mp.id && x.status === "active" && ((x.giftId === mp.giftId && x.partnerId === mp.partnerId) || (x.partnerId === mp.partnerId && x.partnerSku.trim().toLowerCase() === mp.partnerSku.trim().toLowerCase())));
  if (dup) e.push(`Duplicate mapping: ${dup.id} already maps ${dup.giftId} / ${dup.partnerSku}`);
  return e;
}

/* ======================= Vouchers ======================= */

export const maskCode = (last4: string) => `XXXX-XXXX-${last4}`;
export function voucherStatusAt(v: { status: string; expiresOn: string | null }, at: string) {
  return v.status === "issued" && v.expiresOn && v.expiresOn < day(at) ? "expired" : v.status;
}

/* ======================= Insurance ======================= */

export const maskInsurance = (n: string) => (n.length <= 4 ? "••••" : `••••${n.slice(-4)}`);
/** Non-reversible key: the raw insurance number is never stored (only the masked form and this key). */
export function hashKey(v: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2654435761);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
export const insuranceKey = (insurer: string, n: string) => `${insurer.trim().toLowerCase()}|${hashKey(n.trim().toUpperCase())}`;
/** The comparison key under the configured uniqueness rule (GD-03, development setting). */
export const dupKey = (rule: GiftState["config"]["insuranceNumberRule"], key: string) => (rule === "unique_global" ? key.split("|")[1] : key);

export function parseValidity(v: string): { from: string; to: string } | null {
  const m = /^\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(v);
  return m ? { from: m[1], to: m[2] } : null;
}

export type CardStatus = "active" | "inactive" | "expired" | "not_yet_valid";
export function cardStatus(c: InsuranceCard, at: string): CardStatus {
  const d = day(at);
  if (c.validTo < d) return "expired";
  if (!c.active) return "inactive";
  if (c.validFrom > d) return "not_yet_valid";
  return "active";
}
/** What the member application would show: published, active, valid today and the type enabled for the programme. */
export function memberVisible(c: InsuranceCard, t: InsuranceCardType | undefined, at: string) {
  return c.publication.status === "published" && cardStatus(c, at) === "active" && !!t && t.status === "active" && t.enabled[c.programme];
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export interface InsuranceContext {
  s: GiftState;
  mem: MemberState;
  at: string;
}
/** Validates an insurance CSV. Never invents number formats or amount limits. */
export function validateInsuranceCsv(text: string, ctx: InsuranceContext): { headerError: string | null; rows: InsuranceRow[] } {
  const all = parseCsvText(text);
  if (!all.length) return { headerError: "The file is empty", rows: [] };
  const head = all[0].map((h) => h.trim());
  if (head.length !== INSURANCE_CSV_HEADER.length || INSURANCE_CSV_HEADER.some((h, i) => head[i] !== h)) return { headerError: `Header must be exactly: ${INSURANCE_CSV_HEADER.join(",")} (SOW field names are kept as written)`, rows: [] };
  const { s, mem } = ctx;
  const seenRow = new Set<string>();
  const seenNumber = new Map<string, number>();
  const rule = s.config.insuranceNumberRule;
  const existing = new Set(s.cards.map((c) => dupKey(rule, c.numberKey)));
  const rows: InsuranceRow[] = [];
  all.slice(1).forEach((cells, i) => {
    const values: Record<string, string> = {};
    INSURANCE_CSV_HEADER.forEach((h, j) => (values[h] = (cells[j] ?? "").trim()));
    const errors: InsuranceRow["errors"] = [];
    const warnings: string[] = [];
    const err = (field: string, message: string) => errors.push({ field, value: field === "Number" ? maskInsurance(values[field] ?? "") : values[field] ?? "", message });
    if (cells.length > INSURANCE_CSV_HEADER.length && cells.slice(INSURANCE_CSV_HEADER.length).some((x) => x.trim())) err("row", "Unsupported extra columns in this row");
    for (const f of ["member_id", "card_type", "Name", "Number", "Insurance Amount", "Validity Dates", "Insurer Name"]) if (!values[f]) err(f, `${f} is required`);
    const m = values.member_id ? memberById(mem, values.member_id) : undefined;
    if (values.member_id && !m) err("member_id", "Member not found");
    if (m && !(INSURANCE_PROGRAMMES as readonly string[]).includes(m.programme)) err("member_id", `Insurance cards apply to EP, ST and CS only (member is ${m.programme})`);
    if (m && m.status === "rejected") err("member_id", "Member registration is rejected");
    const t = values.card_type ? s.cardTypes.find((x) => x.id === values.card_type) : undefined;
    if (values.card_type && !t) err("card_type", "Card type not found");
    if (t && t.status !== "active") err("card_type", `${t.name} is inactive`);
    if (t && m && (INSURANCE_PROGRAMMES as readonly string[]).includes(m.programme)) {
      const out = segmentReasons(t.segmentation, m, tierOf(s, m.id));
      if (out.length) err("card_type", `Programme / region / tier mapping: ${out.join("; ")}`);
    }
    if (t && values["Insurer Name"] && t.insurer.toLowerCase() !== values["Insurer Name"].toLowerCase()) warnings.push(`Insurer Name differs from the card type's insurer (${t.insurer})`);
    if (m && values.Name && m.name.toLowerCase() !== values.Name.toLowerCase()) warnings.push(`Name differs from the member record (${m.name})`);
    const amt = values["Insurance Amount"];
    if (amt && !(/^\d+(\.\d{1,2})?$/.test(amt) && Number(amt) > 0)) err("Insurance Amount", "Insurance Amount must be a positive number");
    if (values["Toll-Free Number"] && !/^[+\d][\d\s-]*$/.test(values["Toll-Free Number"])) err("Toll-Free Number", "Toll-Free Number may contain only digits, spaces, + and -");
    const vd = values["Validity Dates"];
    if (vd) {
      const p = parseValidity(vd);
      if (!p) err("Validity Dates", "Validity Dates must be written as YYYY-MM-DD to YYYY-MM-DD");
      else if (!isDate(p.from) || !isDate(p.to)) err("Validity Dates", "Validity Dates contain an invalid calendar date");
      else if (p.to < p.from) err("Validity Dates", "Validity end date is before the start date");
      else if (p.to < day(ctx.at)) warnings.push("Card validity has already ended: it will be recorded as expired");
    }
    let result: InsuranceRow["result"] = errors.length ? "invalid" : "valid";
    const rowKey = INSURANCE_CSV_HEADER.map((h) => values[h].toLowerCase()).join("|");
    if (seenRow.has(rowKey)) {
      result = "duplicate";
      errors.push({ field: "row", value: `row ${i + 2}`, message: "Duplicate of an earlier row in this file" });
    } else if (values.Number && values["Insurer Name"]) {
      const k = dupKey(rule, insuranceKey(values["Insurer Name"], values.Number));
      if (existing.has(k)) {
        result = "duplicate";
        errors.push({ field: "Number", value: maskInsurance(values.Number), message: `Insurance number already exists (${s.config.insuranceNumberRule === "unique_global" ? "unique across insurers" : "unique per insurer"}, development setting GD-03)` });
      } else if (seenNumber.has(k)) {
        result = "duplicate";
        errors.push({ field: "Number", value: maskInsurance(values.Number), message: `Insurance number repeats row ${seenNumber.get(k)} (development setting GD-03)` });
      } else seenNumber.set(k, i + 2);
    }
    seenRow.add(rowKey);
    rows.push({ row: i + 2, values, errors, warnings, result, cardId: null });
  });
  return { headerError: null, rows };
}

/* ======================= Card rendering ======================= */

export interface CardModel {
  title: string;
  photo: { ref: string | null; status: "approved" | "missing" | "not_approved"; note: string; initials: string };
  fields: { label: string; value: string }[];
  watermark: { text: string; position: NonNullable<RenderConfig["watermark"]["position"]>; opacity: number } | null;
  watermarkNote: string;
  testLabel: string;
}

/** Profile photo reference from Member Management (approved selfie KYC document). No duplicate photo master. */
export function profilePhoto(mem: MemberState, memberId: string): CardModel["photo"] {
  const m = memberById(mem, memberId);
  const initials = (m?.name ?? "?").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const d = mem.documents.find((x) => x.memberId === memberId && x.type === "selfie");
  if (!d || d.status === "not_submitted") return { ref: null, status: "missing", note: "Invalid profile photo reference: no selfie on the member profile", initials };
  if (d.status !== "approved") return { ref: d.latestRef ?? d.id, status: "not_approved", note: `Invalid profile photo reference: selfie is ${d.status.replace(/_/g, " ")}`, initials };
  return { ref: d.latestRef ?? d.id, status: "approved", note: "Latest approved profile image (reference only: the image service is not connected)", initials };
}

export function cardModel(c: InsuranceCard, m: Member | undefined, mem: MemberState, render: RenderConfig, showNumber: boolean): CardModel {
  const w = render.watermark;
  return {
    title: "Insurance card",
    photo: profilePhoto(mem, c.memberId),
    fields: [
      { label: "Member name", value: m?.name ?? c.name },
      { label: "Member ID", value: c.memberId },
      { label: "Insurance number", value: showNumber ? c.numberMasked : "Restricted" },
      { label: "Insurer", value: c.insurer },
      { label: "Insurance amount", value: `₹${c.amount.toLocaleString("en-IN")}` },
      { label: "Qualification", value: c.qualification || "—" },
      { label: "Toll-free", value: c.tollFree || "—" },
      { label: "Validity", value: `${c.validFrom} to ${c.validTo}` },
    ],
    watermark: w.text && w.position && w.opacity != null ? { text: w.text, position: w.position, opacity: w.opacity } : null,
    watermarkNote: w.text ? `Watermark: development setting (${w.status === "confirmed" ? "confirmed" : "OP-INS1 open"})` : "Watermark not configured: text, position and opacity are open (OP-INS1)",
    testLabel: "TEST PREVIEW · NOT AN ISSUED INSURANCE CARD · DEVELOPMENT DATA",
  };
}

/* ======================= Test PDF (JPEG embedded with DCTDecode) ======================= */

const enc = (s: string) => new TextEncoder().encode(s);
const pdfText = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");

/** A one-page PDF that embeds the rendered JPEG and the test-preview label. Pure: works in Node and the browser. */
export function buildTestPdf(jpeg: Uint8Array, width: number, height: number, label: string): Uint8Array {
  const pw = 595;
  const scale = Math.min((pw - 80) / width, 1);
  const iw = Math.round(width * scale);
  const ih = Math.round(height * scale);
  const ph = ih + 140;
  const content = `q ${iw} 0 0 ${ih} 40 80 cm /Im1 Do Q BT /F1 10 Tf 40 ${ih + 100} Td (${pdfText(label)}) Tj ET BT /F1 8 Tf 40 50 Td (Generated by the V-Guard Rishta portal for test download only.) Tj ET`;
  const parts: (Uint8Array | string)[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === "string" ? enc(p) : p;
    parts.push(b);
    len += b.length;
  };
  const obj = (n: number, body: (Uint8Array | string)[]) => {
    offsets[n] = len;
    push(`${n} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im1 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`]);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  obj(5, [`<< /Length ${enc(content).length} >>\nstream\n${content}\nendstream`]);
  obj(6, ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]);
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 7 /Root 1 0 R /Info << /Title (${pdfText(label)}) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    const b = typeof p === "string" ? enc(p) : p;
    out.set(b, o);
    o += b.length;
  }
  return out;
}
