/**
 * MOCK RULE-EVALUATION & REWARD-ACCRUAL ADAPTER — development only.
 * Stands in for the backend scheme engine so the portal can show traceability, idempotency, budget
 * auto-stop and settlement end to end. It evaluates only explicitly configured values; any construct
 * that needs an unconfirmed formula produces no points. It is not production-safe concurrent budget
 * enforcement: it runs in one browser tab against in-memory state.
 */
import { TARGET_DIMENSIONS } from "@/config/schemeCatalogue";
import { findBranch } from "@/config/geography";
import { skuById, type MasterState } from "@/features/masters/engine";
import type { Member, Restriction } from "@/types/members";
import type { ComponentKey, RewardAccrual, Scheme, SchemeConfig, SchemeState, SchemeVersion, SourceTxn } from "@/types/schemes";
import { basePointsFor, branchesInScope, combinedQualifies, evaluationWindows, quantityAligned, quantityWindows, crossSellQualifies, idempotencyKey, isEarning, milestoneMeasure, milestonesAchieved, quantityQualifies, rewardPoints, selectSlab, skuCategory, skusInScope, versionOf } from "./engine";

export interface EngineCtx {
  ms: MasterState;
  now: string;
  origin: RewardAccrual["origin"];
  memberOf: (id: string) => Member | undefined;
  /** Seed replay of history: version effective ranges decide eligibility instead of the current status. */
  replay?: boolean;
  /** Member restrictions from Member Management (Program Block / Temporary Hold). */
  restrictions?: Restriction[];
}

export interface Candidate {
  scheme: Scheme;
  version: SchemeVersion;
  component: ComponentKey;
  ruleId: string;
  sourceRef: string;
  calcRef: string;
  memberId: string;
  programme: string;
  branchCode: string;
  skuId: string | null;
  points: number;
  bucket: RewardAccrual["bucket"];
  effectiveDate: string;
  note: string;
}

export interface PostSummary {
  posted: number;
  points: number;
  duplicates: number;
  budgetRefused: number;
  excluded: number;
  stopped: string[];
}

const pad = (n: number, w = 6) => String(n).padStart(w, "0");

/** Version whose effective range covers the date; backdated runs use the approved active version. */
export function versionForDate(sc: Scheme, date: string, backdated: boolean): SchemeVersion | undefined {
  if (backdated) return versionOf(sc, sc.activeVersion);
  return sc.versions.find((v) => (v.status === "active" || v.status === "superseded") && v.effectiveStart != null && v.effectiveStart <= date && (v.effectiveEnd == null || date < v.effectiveEnd));
}

/** Restriction in force for the member on a date (applied on or before it and not lifted before it). */
export function restrictedOn(restrictions: Restriction[] | undefined, memberId: string, date: string) {
  return (restrictions ?? []).find((r) => r.memberIds.includes(memberId) && r.appliedAt.slice(0, 10) <= date && (r.status !== "lifted" || (r.reinstatement?.liftedAt ?? "9999").slice(0, 10) > date));
}

const UNREGISTERED = ["pending", "rejected", "invited"];

/**
 * Member-level eligibility on attributes the member master holds; extensions widen scope as approved.
 * A member who is not registered, or is restricted on the date, never earns. Conditions whose source
 * is not connected (group, segment, Elite, unconnected targeting) refuse instead of passing.
 */
export function memberEligible(s: SchemeState, sc: Scheme, cfg: SchemeConfig, m: Member | undefined, programme: string, branchCode: string, at?: { date: string; restrictions?: Restriction[] }): { ok: boolean; reason: string } {
  if (!cfg.basic.programmes.includes(programme)) return { ok: false, reason: "Programme not in scheme" };
  if (m && UNREGISTERED.includes(m.status)) return { ok: false, reason: `Registration ${m.status}: not eligible to earn` };
  if (m && at) {
    const r = restrictedOn(at.restrictions, m.id, at.date);
    if (r) return { ok: false, reason: `${r.type === "program_block" ? "Program Block" : "Temporary Hold"} ${r.id} in force on ${at.date}` };
  }
  if (cfg.eligibility.elite !== "any" || cfg.eligibility.groups.length || cfg.eligibility.segments.length) return { ok: false, reason: "Cannot evaluate group / segment / Elite eligibility: SFDC retailer master (not connected)" };
  const ext = s.extensions.filter((e) => e.schemeId === sc.id && e.status === "active");
  const extended = !!m && ext.some((e) => e.memberIds.includes(m.id) || e.branchCodes.includes(branchCode));
  if (!extended) {
    if (!branchesInScope(cfg.eligibility.branchScope).has(branchCode)) return { ok: false, reason: "Branch outside scheme scope" };
    if (cfg.eligibility.selectedMemberIds.length && (!m || !cfg.eligibility.selectedMemberIds.includes(m.id))) return { ok: false, reason: "Not a selected member" };
  }
  for (const t of cfg.targeting) {
    const def = TARGET_DIMENSIONS[t.dimension];
    if (!def.available) return { ok: false, reason: `Cannot evaluate "${def.label}": ${def.source}` };
    if (!m || ["product_category", "sub_category", "sku", "date_range", "event"].includes(t.dimension)) continue;
    const geo = findBranch(m.branchCode);
    const v = { programme: m.programme, role: m.memberType, state: geo?.state.code, district: geo?.district.code, branch: m.branchCode, pincode: m.addresses.working?.pincode ?? m.addresses.home?.pincode, member_ids: m.id }[t.dimension as "programme"];
    const hit = t.values.includes(v ?? "");
    if (t.operator === "not_in" ? hit : !hit) return { ok: false, reason: `Targeting: ${def.label}` };
  }
  return { ok: true, reason: extended ? "Special-member extension" : "In scope" };
}

/** Transaction-level targeting: product category / sub-category / SKU and date-range conditions. */
export function txnTargeting(ms: MasterState, cfg: SchemeConfig, skuId: string, date: string): { ok: boolean; reason: string } {
  for (const t of cfg.targeting) {
    if (!["product_category", "sub_category", "sku", "date_range"].includes(t.dimension)) continue;
    const cat = skuCategory(ms, skuId);
    const hit = t.dimension === "product_category" ? t.values.includes(cat.categoryId ?? "") : t.dimension === "sub_category" ? t.values.includes(cat.subCategoryId ?? "") : t.dimension === "sku" ? t.values.includes(skuId) : t.values.some((v) => { const [f, to] = v.split(".."); return !!f && !!to && f <= date && date <= to; });
    if (t.operator === "not_in" ? hit : !hit) return { ok: false, reason: `Targeting: ${TARGET_DIMENSIONS[t.dimension].label}` };
  }
  return { ok: true, reason: "" };
}

/** Only active master records earn: inactive / draft SKUs and inactive branches are excluded. */
export const skuActive = (ms: MasterState, id: string) => skuById(ms, id)?.status === "active";
export const branchActive = (ms: MasterState, code: string) => ms.hierarchy.find((h) => h.code === code)?.status !== "inactive";

/**
 * Transactions counted in an evaluation window. A sales return counts in the window of the sale it
 * reverses (not the window of its own date), and only once it has happened (its date ≤ asOf).
 */
export function windowTxns(s: SchemeState, ms: MasterState, cfg: SchemeConfig, window: { from: string; to: string }, asOf: string) {
  const scope = skusInScope(ms, cfg.products);
  const dateOf = (t: SourceTxn) => (t.kind === "sales_return" ? s.txns.find((x) => x.id === t.originalTxnId)?.date ?? t.date : t.date);
  return s.txns.filter((t) => {
    const d = dateOf(t);
    return d >= window.from && d <= window.to && t.date <= asOf && scope.has(t.skuId) && (t.kind === "sales_return" || (skuActive(ms, t.skuId) && branchActive(ms, t.branchCode))) && txnTargeting(ms, cfg, t.skuId, d).ok;
  });
}

/** Net quantity (scans minus returns) a member has in a window, as the engine counts it. */
export const windowNetQuantity = (s: SchemeState, ms: MasterState, cfg: SchemeConfig, memberId: string, window: { from: string; to: string }, asOf: string) => windowTxns(s, ms, cfg, window, asOf).filter((t) => t.memberId === memberId).reduce((n, t) => n + (t.kind === "scan" ? t.qty : -t.qty), 0);

/** Transaction-level evaluation: Base Points for scans; linked pending reversals for sales returns. */
export function evaluateTxn(s: SchemeState, ctx: EngineCtx, txn: SourceTxn, onlySchemeId?: string): { candidates: Candidate[]; reversals: RewardAccrual[]; trace: { schemeId: string; result: string }[] } {
  const candidates: Candidate[] = [];
  const reversals: RewardAccrual[] = [];
  const trace: { schemeId: string; result: string }[] = [];
  const backdated = ctx.origin === "backdated";
  for (const sc of s.schemes) {
    if (onlySchemeId && sc.id !== onlySchemeId) continue;
    if (!backdated && !ctx.replay && !isEarning(sc)) { trace.push({ schemeId: sc.id, result: `Not earning (${sc.status.replace(/_/g, " ")})` }); continue; }
    const v = versionForDate(sc, txn.date, backdated);
    if (!v) { trace.push({ schemeId: sc.id, result: "No version effective on the transaction date" }); continue; }
    const cfg = v.config;
    if (txn.date < cfg.duration.start || txn.date > cfg.duration.end) { trace.push({ schemeId: sc.id, result: "Outside the scheme period" }); continue; }
    if (!skusInScope(ctx.ms, cfg.products).has(txn.skuId)) { trace.push({ schemeId: sc.id, result: "SKU outside product applicability" }); continue; }
    const tt = txnTargeting(ctx.ms, cfg, txn.skuId, txn.date);
    if (!tt.ok) { trace.push({ schemeId: sc.id, result: tt.reason }); continue; }
    const el = memberEligible(s, sc, cfg, ctx.memberOf(txn.memberId), txn.programme, txn.branchCode, { date: txn.date, restrictions: ctx.restrictions });
    if (!el.ok) { trace.push({ schemeId: sc.id, result: el.reason }); continue; }
    if (txn.kind === "sales_return") {
      const orig = s.txns.find((x) => x.id === txn.originalTxnId);
      const inWindow = (ref: string) => { const [f, to] = ref.slice(7).split(".."); return !!orig && orig.date >= f && orig.date <= to; };
      const originals = s.accruals.filter((a) => a.schemeId === sc.id && a.memberId === txn.memberId && (a.result === "credited" || a.result === "accrued") && (a.sourceRef === txn.originalTxnId || (a.sourceRef.startsWith("PERIOD:") && inWindow(a.sourceRef))));
      originals.forEach((o) => reversals.push({ ...o, id: "", idempotencyKey: `${txn.id}|${o.id}|reversal`, result: "reversal_pending", points: 0, sourceRef: txn.id, calculatedAt: ctx.now, effectiveDate: txn.date, ledgerRef: null, reversalOf: o.id, reversalRef: `REV-${txn.id.slice(4)}`, releasedPoints: 0, note: `Sales return of ${txn.qty} unit(s) against ${o.ledgerRef}. Correction amount pending the reversal formula (SCH-Q7); the original entry is kept`, origin: ctx.origin }));
      trace.push({ schemeId: sc.id, result: originals.length ? `${originals.length} linked reversal(s) recorded as pending` : "No original credit to reverse" });
      continue;
    }
    if (!skuActive(ctx.ms, txn.skuId)) { trace.push({ schemeId: sc.id, result: "SKU is not active in the Product & SKU master" }); continue; }
    if (!branchActive(ctx.ms, txn.branchCode)) { trace.push({ schemeId: sc.id, result: "Branch is inactive in the branch hierarchy" }); continue; }
    const bp = basePointsFor(ctx.ms, cfg, txn.skuId, txn.branchCode, txn.programme);
    if (!bp) { trace.push({ schemeId: sc.id, result: "No Base Points row for this SKU and branch (period components evaluate at period end)" }); continue; }
    if ("error" in bp) { trace.push({ schemeId: sc.id, result: bp.error }); continue; }
    candidates.push({ scheme: sc, version: v, component: "base", ruleId: bp.row.id, sourceRef: txn.id, calcRef: "scan", memberId: txn.memberId, programme: txn.programme, branchCode: txn.branchCode, skuId: txn.skuId, points: bp.pointsPerUnit * txn.qty, bucket: "redeemable", effectiveDate: txn.date, note: `${txn.qty} × ${bp.pointsPerUnit} points (${bp.row.id}, ${el.reason})` });
    trace.push({ schemeId: sc.id, result: `Base Points ${bp.pointsPerUnit * txn.qty} (${txn.qty} × ${bp.pointsPerUnit})` });
  }
  return { candidates, reversals, trace };
}

/** Period-level evaluation: Quantity, Slab, Milestone and Cross-sell for one evaluation window. */
/**
 * mode: "all" evaluates every period component; "skip_quantity" leaves quantity to its own windows;
 * "quantity_only" evaluates just the quantity component in a quantity window.
 */
export function evaluatePeriod(s: SchemeState, ctx: EngineCtx, sc: Scheme, window: { from: string; to: string }, asOf: string, mode: "all" | "skip_quantity" | "quantity_only" = "all"): { candidates: Candidate[]; blocked: string[] } {
  const closed = window.to <= asOf;
  const v = (ctx.replay ? versionForDate(sc, closed ? window.to : asOf, false) : undefined) ?? versionOf(sc, sc.activeVersion);
  if (!v) return { candidates: [], blocked: ["No active version"] };
  const cfg = v.config;
  const blocked: string[] = [];
  const out: Candidate[] = [];
  const txns = windowTxns(s, ctx.ms, cfg, window, asOf);
  // When milestones take part in a combined rule they wait for the window to close, like the other components.
  const deferMilestone = cfg.combined.enabled && cfg.combined.components.includes("milestone");
  const members = Array.from(new Set(txns.map((t) => t.memberId)));
  const calcRef = `${window.from}..${window.to}`;
  for (const memberId of members) {
    const mine = txns.filter((t) => t.memberId === memberId);
    const first = mine[0];
    if (!memberEligible(s, sc, cfg, ctx.memberOf(memberId), first.programme, first.branchCode, { date: closed ? window.to : asOf, restrictions: ctx.restrictions }).ok) continue;
    const net = (pred: (t: SourceTxn) => boolean) => mine.filter(pred).reduce((n, t) => n + (t.kind === "scan" ? t.qty : -t.qty), 0);
    const qty = net(() => true);
    const scans = mine.filter((t) => t.kind === "scan").length;
    const basePts = s.accruals.filter((a) => a.schemeId === sc.id && a.memberId === memberId && a.component === "base" && (a.result === "credited" || a.result === "accrued") && a.effectiveDate >= window.from && a.effectiveDate <= window.to).reduce((n, a) => n + a.points, 0);
    const byCategory: Record<string, number> = {};
    mine.forEach((t) => { const c = skuCategory(ctx.ms, t.skuId).categoryId; if (c) byCategory[c] = (byCategory[c] ?? 0) + (t.kind === "scan" ? t.qty : -t.qty); });
    const measure = (basis: "quantity" | "scan_count" | "points") => (basis === "quantity" ? qty : basis === "scan_count" ? scans : basePts);
    const results: Partial<Record<ComponentKey, boolean | "blocked">> = { base: basePts > 0, category: qty > 0 };
    const pending: Candidate[] = [];
    const add = (component: ComponentKey, ruleId: string, points: number, note: string, extra = "") => pending.push({ scheme: sc, version: v, component, ruleId, sourceRef: `PERIOD:${calcRef}`, calcRef: `${calcRef}${extra}`, memberId, programme: first.programme, branchCode: first.branchCode, skuId: null, points, bucket: "unsettled", effectiveDate: closed ? window.to : asOf, note });
    // Quantity, slab and cross-sell are decided when the window closes; milestones accrue when reached.
    if (cfg.quantity.enabled && closed && mode !== "skip_quantity") {
      const achieved = measure(cfg.quantity.basis);
      results.quantity = quantityQualifies(cfg.quantity, achieved);
      if (results.quantity && !cfg.quantity.useSlabs) {
        const r = rewardPoints(s, cfg.quantity.reward, achieved);
        if (r.ok) add("quantity", "QTY", r.points, `Quantity ${achieved} ≥ threshold ${cfg.quantity.threshold}`);
        else { results.quantity = "blocked"; blocked.push(`${memberId}: ${r.reason}`); }
      }
    }
    if (cfg.slab.enabled && cfg.slab.slabs.length && closed && mode !== "quantity_only") {
      const achieved = measure(cfg.slab.slabs[0].achievement);
      const slab = selectSlab(cfg.slab.slabs, achieved);
      results.slab = !!slab;
      if (slab) {
        const r = rewardPoints(s, slab.reward, achieved);
        if (r.ok) add("slab", slab.id, r.points, `Achieved ${achieved}: slab ${slab.name} (${slab.min}–${slab.max ?? "∞"}, priority ${slab.priority})`);
        else { results.slab = "blocked"; blocked.push(`${memberId}: ${r.reason}`); }
      }
    }
    if (cfg.crossSell.enabled && closed && mode !== "quantity_only") {
      const cs = crossSellQualifies(cfg.crossSell, byCategory);
      results.crossSell = cs.qualified;
      if (cs.qualified) {
        const r = rewardPoints(s, cfg.crossSell.reward, cs.met.length);
        if (r.ok) add("crossSell", "XSELL", r.points, `${cs.met.length} categories met their minimum`);
        else { results.crossSell = "blocked"; blocked.push(`${memberId}: ${r.reason}`); }
      }
    }
    if (cfg.milestone.enabled && mode !== "quantity_only" && (!deferMilestone || closed)) {
      const m = cfg.milestone.measure === "points" ? milestoneMeasure(s, cfg.milestone, { base: basePts, rider: 0, crossSell: pending.filter((c) => c.component === "crossSell").reduce((n, c) => n + c.points, 0) }) : { ok: true as const, points: measure(cfg.milestone.measure) };
      if (!m.ok) { results.milestone = "blocked"; blocked.push(`${memberId}: ${m.reason}`); }
      else {
        const levels = milestonesAchieved(cfg.milestone, m.points);
        results.milestone = levels.length > 0;
        levels.forEach((l) => { const r = rewardPoints(s, l.reward, m.points); if (r.ok) add("milestone", l.id, r.points, `Milestone ${l.name} reached (${m.points} ≥ ${l.threshold})`, `|${l.id}`); else blocked.push(`${memberId}: ${r.reason}`); });
      }
    }
    if (cfg.combined.enabled && closed && mode !== "quantity_only") {
      const ok = combinedQualifies(cfg.combined, results);
      if (ok !== true) { if (ok === "blocked") blocked.push(`${memberId}: combined rule blocked`); continue; }
    }
    out.push(...pending.filter((p) => p.points > 0));
  }
  return { candidates: out, blocked };
}

/**
 * Posts candidates through the idempotency key and the budget cap. A key seen before is refused and
 * never credited twice. With auto-stop on, an accrual that would cross the cap is refused and the
 * scheme stops (partial credit is not defined: SCH-Q2).
 */
export function postCandidates(s: SchemeState, ctx: EngineCtx, candidates: Candidate[], recordDuplicates = true): { state: SchemeState; summary: PostSummary } {
  let accruals = s.accruals;
  let schemes = s.schemes;
  const keys = new Set(accruals.map((a) => a.idempotencyKey));
  const summary: PostSummary = { posted: 0, points: 0, duplicates: 0, budgetRefused: 0, excluded: 0, stopped: [] };
  const consumed = new Map<string, number>();
  const used = (id: string) => {
    if (!consumed.has(id)) consumed.set(id, accruals.filter((a) => a.schemeId === id && (a.result === "credited" || a.result === "accrued")).reduce((n, a) => n + a.points, 0));
    return consumed.get(id)!;
  };
  const participates = (schemeId: string, memberId: string) => accruals.some((a) => a.schemeId === schemeId && a.memberId === memberId && (a.result === "credited" || a.result === "accrued"));
  let n = accruals.length;
  const push = (c: Candidate, result: RewardAccrual["result"], points: number, note: string) => {
    n += 1;
    const a: RewardAccrual = { id: `ACR-${pad(n)}`, idempotencyKey: idempotencyKey({ sourceRef: c.sourceRef, memberId: c.memberId, schemeId: c.scheme.id, version: c.version.version, component: c.component, calcRef: c.calcRef }), schemeId: c.scheme.id, schemeVersion: c.version.version, ruleId: c.ruleId, ruleVersion: c.version.ruleVersion, component: c.component, sourceRef: c.sourceRef, memberId: c.memberId, programme: c.programme, branchCode: c.branchCode, skuId: c.skuId, categoryId: c.skuId ? skuCategory(ctx.ms, c.skuId).categoryId : null, effectiveDate: c.effectiveDate, calculatedAt: ctx.now, result, points, bucket: c.bucket, ledgerRef: result === "credited" || result === "accrued" ? `LDG-${pad(n + 700000, 7)}` : null, reversalOf: null, reversalRef: null, releasedPoints: 0, note, origin: ctx.origin };
    accruals = [...accruals, a];
    return a;
  };
  for (const c of candidates) {
    const key = idempotencyKey({ sourceRef: c.sourceRef, memberId: c.memberId, schemeId: c.scheme.id, version: c.version.version, component: c.component, calcRef: c.calcRef });
    // Duplicate check spans versions too: the same source event never earns twice in one scheme.
    const dupAny = accruals.some((a) => a.schemeId === c.scheme.id && a.memberId === c.memberId && a.component === c.component && a.sourceRef === c.sourceRef && a.idempotencyKey.endsWith(`|${c.component}|${c.calcRef}`) && (a.result === "credited" || a.result === "accrued"));
    if (keys.has(key) || dupAny) {
      summary.duplicates += 1;
      if (recordDuplicates) push(c, "rejected_duplicate", 0, `Duplicate of an earlier calculation (key ${key}). Not credited`);
      continue;
    }
    const sc = schemes.find((x) => x.id === c.scheme.id)!;
    if (ctx.origin !== "backdated" && !ctx.replay && sc.status !== "active") { summary.budgetRefused += 1; push(c, "rejected_budget", 0, `Scheme is ${sc.status.replace(/_/g, " ")}; not credited`); continue; }
    // Exclusivity: participation in an exclusive partner scheme prevents participation here.
    const rules = s.exclusivity.filter((r) => r.status === "active" && (r.schemeA === c.scheme.id || r.schemeB === c.scheme.id) && r.from <= c.effectiveDate && r.to >= c.effectiveDate && (!r.programmes.length || r.programmes.includes(c.programme)));
    const partner = rules.map((r) => (r.schemeA === c.scheme.id ? r.schemeB : r.schemeA)).find((p) => participates(p, c.memberId));
    if (partner) { summary.excluded += 1; push(c, "excluded", 0, `Member already participates in ${partner}; exclusivity rule prevents participation in ${c.scheme.id}`); continue; }
    const simultaneous = rules.map((r) => (r.schemeA === c.scheme.id ? r.schemeB : r.schemeA)).find((p) => candidates.some((o) => o !== c && o.scheme.id === p && o.memberId === c.memberId && o.sourceRef === c.sourceRef));
    if (simultaneous && !participates(c.scheme.id, c.memberId)) { summary.excluded += 1; push(c, "excluded", 0, `Qualifies for exclusive schemes ${c.scheme.id} and ${simultaneous} at once; precedence is not defined (SCH-Q10). Not credited, flagged for review`); continue; }
    const cfg = c.version.config;
    const budget = cfg.budget.amount ?? 0;
    if (budget && cfg.budget.autoStop && used(sc.id) + c.points > budget) {
      summary.budgetRefused += 1;
      push(c, "rejected_budget", 0, `Budget cap ${budget.toLocaleString("en-IN")} would be exceeded (${used(sc.id).toLocaleString("en-IN")} used + ${c.points}). Auto-stop applied; partial credit is not defined (SCH-Q2)`);
      if (sc.status === "active") { schemes = schemes.map((x) => (x.id === sc.id ? { ...x, status: "budget_exhausted", updatedAt: ctx.now } : x)); summary.stopped.push(sc.id); }
      continue;
    }
    keys.add(key);
    push(c, c.bucket === "redeemable" ? "credited" : "accrued", c.points, c.note);
    consumed.set(sc.id, used(sc.id) + c.points);
    summary.posted += 1;
    summary.points += c.points;
    if (budget && cfg.budget.autoStop && used(sc.id) >= budget && sc.status === "active") { schemes = schemes.map((x) => (x.id === sc.id ? { ...x, status: "budget_exhausted", updatedAt: ctx.now } : x)); summary.stopped.push(sc.id); }
  }
  return { state: { ...s, accruals, schemes }, summary };
}

export function postReversals(s: SchemeState, reversals: RewardAccrual[]): SchemeState {
  const keys = new Set(s.accruals.map((a) => a.idempotencyKey));
  let n = s.accruals.length;
  const add = reversals.filter((r) => !keys.has(r.idempotencyKey)).map((r) => ({ ...r, id: `ACR-${pad(++n)}` }));
  return add.length ? { ...s, accruals: [...s.accruals, ...add] } : s;
}

export const skuName = (ms: MasterState, id: string) => skuById(ms, id)?.code ?? id;

/** Runs period evaluation for every window that has started by asOf. Re-running never double-credits. */
export function runPeriodEvaluation(s: SchemeState, ctx: EngineCtx, sc: Scheme, asOf: string, recordDuplicates = false) {
  const v = versionOf(sc, sc.activeVersion) ?? sc.versions.find((x) => x.status === "superseded");
  if (!v) return { state: s, summary: { posted: 0, points: 0, duplicates: 0, budgetRefused: 0, excluded: 0, stopped: [] } as PostSummary, blocked: [] as string[] };
  const cfg = v.config;
  if (!(cfg.quantity.enabled || cfg.slab.enabled || cfg.milestone.enabled || cfg.crossSell.enabled)) return { state: s, summary: { posted: 0, points: 0, duplicates: 0, budgetRefused: 0, excluded: 0, stopped: [] } as PostSummary, blocked: [] as string[] };
  const windows = evaluationWindows(cfg.duration).filter((w) => w.from <= asOf);
  let state = s;
  const total: PostSummary = { posted: 0, points: 0, duplicates: 0, budgetRefused: 0, excluded: 0, stopped: [] };
  const blocked: string[] = [];
  // Quantity is decided in its own windows when its period differs from the evaluation windows.
  const aligned = quantityAligned(cfg);
  const passes: { w: { from: string; to: string }; mode: "all" | "skip_quantity" | "quantity_only" }[] = [
    ...windows.map((w) => ({ w, mode: aligned ? ("all" as const) : ("skip_quantity" as const) })),
    ...(cfg.quantity.enabled && !aligned ? quantityWindows(cfg).filter((w) => w.from <= asOf).map((w) => ({ w, mode: "quantity_only" as const })) : []),
  ];
  for (const { w, mode } of passes) {
    const cur = state.schemes.find((x) => x.id === sc.id)!;
    const ev = evaluatePeriod(state, ctx, cur, w, asOf, mode);
    blocked.push(...ev.blocked);
    const out = postCandidates(state, ctx, ev.candidates, recordDuplicates);
    state = out.state;
    total.posted += out.summary.posted; total.points += out.summary.points; total.duplicates += out.summary.duplicates; total.budgetRefused += out.summary.budgetRefused; total.excluded += out.summary.excluded; total.stopped.push(...out.summary.stopped);
  }
  return { state, summary: total, blocked };
}
