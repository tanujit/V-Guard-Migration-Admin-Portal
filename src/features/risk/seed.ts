/**
 * Fraud & risk seed — DEVELOPMENT / DEMO DATA ONLY (Phase 10).
 * Detection outputs below stand in for the backend detection services (identity registry, device
 * risk, rule-based anomaly, predictive AF02, geo-velocity, geo-validation, QR integrity, SFDC sync).
 * They reference real seeded members, redemptions and SFDC conflicts, but no real identifier, device,
 * QR secret or location is used. Scores and severities appear only where the mock service "supplied"
 * them; many events deliberately have none.
 */
import { RISK_DECISIONS } from "@/config/riskCatalogue";
import { findBranch } from "@/config/geography";
import { geoOfMember, type MemberState } from "@/features/members/engine";
import type { MasterState } from "@/features/masters/engine";
import type { Member, ProgrammeCode } from "@/types/members";
import type { SchemeState } from "@/types/schemes";
import type { WalletState } from "@/types/wallet";
import type { AnomalyRule, ComplianceEvidence, Device, DuplicateQrEvent, FraudVector, GeoFenceCheck, GeoVelocityEvent, HierarchyMismatch, IdentityMatch, PredictiveResult, RedemptionRiskBlock, RiskAuditEvent, RiskCase, RiskEvent, RiskLinks, RiskState, Severity, StoreGeoRecord, TamperedQrCase, ValidationException } from "@/types/risk";

const SYS = "SYSTEM";
const SNEHA = "USR-1004";
const RAHUL = "USR-1003";
const ANITA = "USR-2001";
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const addH = (at: string, h: number) => new Date(Date.parse(`${at}:00Z`) + h * 3600_000).toISOString().slice(0, 16);
const links = (p: Partial<RiskLinks> = {}): RiskLinks => ({ memberIds: [], deviceIds: [], qrRefs: [], scanRefs: [], redemptionRefs: [], ledgerRefs: [], ...p });
/** Development coordinates for branch cities (map display only). */
const CITY: Record<string, [number, number, string]> = { KL: [9.93, 76.27, "Kochi"], TN: [13.08, 80.27, "Chennai"], KA: [12.97, 77.59, "Bengaluru"], MH: [19.07, 72.87, "Mumbai"], TS: [17.38, 78.48, "Hyderabad"], DL: [28.61, 77.21, "New Delhi"], WB: [22.57, 88.36, "Kolkata"], AP: [16.5, 80.64, "Vijayawada"], GJ: [23.02, 72.57, "Ahmedabad"], UP: [26.85, 80.95, "Lucknow"], RJ: [26.91, 75.79, "Jaipur"], OD: [20.3, 85.82, "Bhubaneswar"], MP: [22.72, 75.86, "Indore"] };
const cityOf = (branchCode: string) => CITY[branchCode.slice(0, 2)] ?? CITY.KL;

export function buildRiskSeed(mem: MemberState, ws: WalletState, ss: SchemeState, ms: MasterState): RiskState {
  const byProg = (p: ProgrammeCode) => mem.members.filter((m) => m.programme === p && m.status !== "rejected");
  const EP = byProg("EP"), ST = byProg("ST"), CS = byProg("CS"), RT = byProg("Retailer"), DD = byProg("DD");
  const events: RiskEvent[] = [];
  const audit: RiskAuditEvent[] = [];
  const log = (at: string, actor: string, entity: string, entityId: string, action: string, after: string | null, reason = "", approvalRequestId: string | null = null) => audit.push({ id: "", at, actor, entity, entityId, action, before: null, after, reason, approvalRequestId });
  const event = (vector: FraudVector, source: RiskEvent["source"], m: Member | null, at: string, context: string, signal: RiskEvent["signal"], extra: Partial<RiskEvent> = {}): RiskEvent => {
    const id = `RSK-${pad(events.length + 1, 5)}`;
    const e: RiskEvent = { id, sourceKey: `${vector}|${extra.serviceRef ?? id}`, vector, source, serviceRef: extra.serviceRef ?? `MOCK-${vector.toUpperCase().slice(0, 6)}-${pad(events.length + 1, 5)}`, memberId: m?.id ?? null, programme: m?.programme ?? null, branchCode: m?.branchCode ?? null, detectedAt: at, context, signal, score: null, severity: null, priority: null, ruleRef: null, modelRef: null, links: links({ memberIds: m ? [m.id] : [] }), status: "new", caseId: null, receivedCount: 1, alertRef: null, simulated: true, ...extra };
    e.sourceKey = `${vector}|${e.serviceRef}`;
    events.push(e);
    log(at, SYS, "risk_event", id, "risk_event_received", `${vector} · ${source}`, context);
    return e;
  };
  const sev = (s: Severity | null, score: number | null = null) => ({ severity: s, score });

  /* ---------------- Identity (9.1 duplicate accounts, cross-programme KYC) ---------------- */
  const identityMatches: IdentityMatch[] = [];
  const match = (identifier: IdentityMatch["identifier"], masked: string, a: Member, b: Member, method: IdentityMatch["method"], at: string, status: IdentityMatch["status"], restrictionId: string | null = null, batchRef: string | null = null) => {
    const ev = event(identifier === "device" ? "device_farming" : a.identityId === b.identityId ? "cross_programme_kyc" : "duplicate_identity", "system_validation", b, at, `${identifier.toUpperCase()} matches ${a.id} (${method.replace("_", " ")})`, { identifier, masked, original: a.id, matching: b.id }, { serviceRef: `IDR-${identifier.toUpperCase()}-${b.id}`, links: links({ memberIds: [a.id, b.id] }) });
    identityMatches.push({ id: `DUP-${pad(identityMatches.length + 1)}`, matchKey: `${identifier}|${[a.id, b.id].sort().join("|")}`, identifier, masked, originalMemberId: a.id, matchingMemberId: b.id, programmes: [...new Set([a.programme, b.programme])], method, batchRef, detectedAt: at, status, restrictionId, riskEventId: ev.id });
    return ev;
  };
  const rst2 = mem.restrictions.find((r) => r.dedup?.match === "pan");
  const panPair = rst2 ? rst2.memberIds.map((id) => mem.members.find((m) => m.id === id)!) : [EP[9], ST[2]];
  const panEv = match("pan", rst2?.dedup?.masked ?? "XXXXX0072X", panPair[0], panPair[1], "nightly_batch", "2026-11-04T00:00", "resolved_restricted", rst2?.id ?? null, "DBB-0001");
  match("mobile", "+91 9XXXXXX412", EP[14], RT[6], "realtime", "2026-11-06T11:42", "open");
  match("aadhaar", "XXXX XXXX 8267", EP[4], RT[0], "nightly_batch", "2026-11-04T00:00", "linked_identity", null, "DBB-0001");
  match("bank", "XXXXXXXX4471", CS[5], CS[9], "nightly_batch", "2026-11-09T00:00", "open", null, "DBB-0002");
  const dedupBatches = [
    { id: "DBB-0001", runAt: "2026-11-04T00:00", identifiers: ["aadhaar", "pan", "bank"] as IdentityMatch["identifier"][], scanned: mem.identities.length, matches: 2, status: "completed" as const },
    { id: "DBB-0002", runAt: "2026-11-09T00:00", identifiers: ["aadhaar", "pan", "bank"] as IdentityMatch["identifier"][], scanned: mem.identities.length, matches: 1, status: "completed" as const },
  ];
  // Matches the identity registry will report in the next nightly run (mock feed).
  const registryFeed: RiskState["registryFeed"] = [
    { matchKey: `aadhaar|${[ST[6].id, DD[2].id].sort().join("|")}`, identifier: "aadhaar", masked: "XXXX XXXX 3390", originalMemberId: ST[6].id, matchingMemberId: DD[2].id, programmes: ["ST", "DD"], method: "nightly_batch" },
    { matchKey: `bank|${[EP[20].id, EP[21].id].sort().join("|")}`, identifier: "bank", masked: "XXXXXXXX9015", originalMemberId: EP[20].id, matchingMemberId: EP[21].id, programmes: ["EP"], method: "nightly_batch" },
  ];

  /* ---------------- Devices (3.2 governance, 9.2 farming) ---------------- */
  const devices: Device[] = [];
  const dev = (owner: Member | null, at: string, extra: Partial<Device> = {}): Device => {
    const n = devices.length + 1;
    const d: Device = { id: `DEV-${pad(n, 5)}`, identifierMasked: `DID ••••${pad((n * 7919) % 10000)}`, imeiMasked: `IMEI ••••••••${pad((n * 104729) % 10000)}`, type: n % 4 === 0 ? "Android tablet" : "Android phone", firstSeen: at, lastSeen: at, createdProfile: owner?.id ?? null, associations: owner ? [{ memberId: owner.id, kind: "created_profile", firstAt: at, lastAt: at }] : [], logins: [], status: "active", investigation: "none", actions: [], ...extra };
    devices.push(d);
    return d;
  };
  const login = (d: Device, m: Member, at: string, outcome: "success" | "profile_creation_rejected" = "success", loc?: [number, number, string]) => {
    const [lat, lng, city] = loc ?? cityOf(m.branchCode);
    d.logins.push({ id: `DLG-${d.id.slice(4)}-${pad(d.logins.length + 1, 3)}`, memberId: m.id, at, lat: lat + (d.logins.length % 5) * 0.004, lng: lng + (d.logins.length % 3) * 0.004, location: `${city} (development location)`, sessionRef: `SES-${pad(Math.abs(at.length * 31 + d.logins.length * 97 + d.id.length), 6)}${d.logins.length}`, appVersion: "4.2.0 (mock)", outcome });
    if (outcome === "success") {
      const a = d.associations.find((x) => x.memberId === m.id);
      if (a) a.lastAt = at;
      else d.associations.push({ memberId: m.id, kind: "login", firstAt: at, lastAt: at });
    }
    d.lastSeen = at > d.lastSeen ? at : d.lastSeen;
  };
  for (const m of [...EP.slice(0, 12), ...ST.slice(0, 4), ...CS.slice(0, 4), ...RT.slice(0, 4), ...DD.slice(0, 2)]) {
    const d = dev(m, m.registration.submittedAt.slice(0, 16));
    login(d, m, "2026-11-0" + (1 + (devices.length % 8)) + "T09:" + pad(devices.length % 60, 2));
  }
  // Shared shop device: the Retailer's handset used by three existing EP profiles (legitimate, not blocked).
  const shared = devices.find((d) => d.createdProfile === RT[1].id)!;
  for (const [i, m] of [EP[12], EP[13], EP[15]].entries()) login(shared, m, `2026-11-0${5 + i}T11:1${i}`);
  // Farming pattern: profile creations rejected on one handset, scans from several accounts.
  const farm = dev(EP[16], "2026-10-20T10:00");
  for (const [i, m] of [EP[17], EP[18], EP[19]].entries()) login(farm, m, `2026-11-0${6 + i}T21:0${i}`);
  login(farm, EP[22], "2026-11-08T22:15", "profile_creation_rejected");
  login(farm, EP[23], "2026-11-08T22:40", "profile_creation_rejected");
  farm.investigation = "under_review";
  const farmEv = event("device_farming", "rule", EP[16], "2026-11-08T23:00", `Scans from ${farm.imeiMasked} by 4 accounts; 2 profile creations rejected on the handset`, { device: farm.id, accounts: 4, rejectedCreations: 2 }, { ...sev("high", null), ruleRef: "DEV-FARM (backend rule output, mock)", serviceRef: `DRS-${farm.id}`, links: links({ memberIds: [EP[16].id, EP[17].id, EP[18].id, EP[19].id], deviceIds: [farm.id] }) });
  // One account hopping across devices.
  const hopper = EP[24];
  const hopDevices = [1, 2, 3, 4].map((k) => dev(null, `2026-11-0${k}T08:00`));
  for (const [k, d] of hopDevices.entries()) login(d, hopper, `2026-11-0${k + 1}T08:3${k}`, "success", CITY[["KL", "TN", "KA", "MH"][k]]);
  event("device_farming", "rule", hopper, "2026-11-05T01:00", `${hopper.id} used 4 devices in 4 days`, { devices: 4, days: 4 }, { ruleRef: "DEV-HOP (backend rule output, mock)", serviceRef: `DRS-HOP-${hopper.id}`, links: links({ memberIds: [hopper.id], deviceIds: hopDevices.map((d) => d.id) }) });
  // Block and release history.
  const blocked = dev(EP[25], "2026-09-01T10:00", { status: "blocked" });
  login(blocked, EP[25], "2026-10-02T10:00");
  blocked.actions.push({ id: "DBA-0001", action: "block", reason: "Confirmed device farming (case CASE-OLD-01)", requestedBy: SNEHA, requestedAt: "2026-10-03T10:00", approvalRequestId: null, status: "executed", executedAt: "2026-10-04T11:00", previous: "active", next: "blocked", impactReviewed: [EP[25].id] });
  blocked.investigation = "confirmed";
  const released = dev(ST[5], "2026-08-01T10:00");
  login(released, ST[5], "2026-11-03T10:00");
  released.actions.push({ id: "DBA-0002", action: "block", reason: "Suspected cloned handset", requestedBy: SNEHA, requestedAt: "2026-09-10T10:00", approvalRequestId: null, status: "executed", executedAt: "2026-09-11T10:00", previous: "active", next: "blocked", impactReviewed: [ST[5].id] }, { id: "DBA-0003", action: "release", reason: "Member proved ownership at the branch", requestedBy: SNEHA, requestedAt: "2026-09-20T10:00", approvalRequestId: null, status: "executed", executedAt: "2026-09-21T10:00", previous: "blocked", next: "active", impactReviewed: [ST[5].id] });
  released.investigation = "cleared";
  match("device", farm.identifierMasked, EP[16], EP[17], "device_capture", "2026-11-06T21:00", "under_review");

  /* ---------------- Anomaly rules (OP-02: demo values, never active) ---------------- */
  const rule = (n: number, kind: AnomalyRule["kind"], name: string, programme: ProgrammeCode | null, limits: Partial<AnomalyRule["limits"]>, extra: Partial<AnomalyRule> = {}): AnomalyRule => ({ id: `ANR-${pad(n, 3)}`, kind, name, programme, memberType: null, categoryId: null, skuId: null, states: [], unit: kind === "redemption" ? "redemptions" : "scans", limits: { hour: null, day: null, week: null, month: null, ...limits }, effectiveFrom: "2026-12-01", effectiveTo: null, autoFlag: true, demo: true, status: "draft", version: 1, replaces: null, approvalRequestId: null, history: [{ at: "2026-10-20T10:00", by: SNEHA, action: "drafted", detail: "Demo configuration (OP-02 open)", approvalRequestId: null }], updatedBy: SNEHA, updatedAt: "2026-10-20T10:00", ...extra });
  const rules: AnomalyRule[] = [
    rule(1, "scan_in", "EP Scan-In volume check (demo)", "EP", { day: 40, week: 200, month: 600 }, { status: "approved_inactive", history: [{ at: "2026-10-20T10:00", by: SNEHA, action: "drafted", detail: "Demo configuration", approvalRequestId: null }, { at: "2026-10-22T10:00", by: ANITA, action: "approved_inactive", detail: "Approved as configuration; activation blocked until OP-02 thresholds are confirmed", approvalRequestId: null }] }),
    rule(2, "scan_out", "Retailer Scan-Out volume check (demo)", "Retailer", { day: 60, week: 300, month: 1000 }),
    rule(3, "redemption", "EP redemption frequency check (demo)", "EP", { day: 2, week: 5, month: 12 }),
    rule(4, "scan_in", "Fans category scan-rate control (demo)", null, { hour: 10, day: 30, week: 150, month: 400 }, { categoryId: "CAT-004", unit: "units", updatedAt: "2026-11-08T16:00", status: "pending_approval", history: [{ at: "2026-11-08T16:00", by: SNEHA, action: "submitted", detail: "Category-level scan-rate control (demo values)", approvalRequestId: null }] }),
    rule(5, "scan_out", "CS Scan-Out volume check (demo)", "CS", { day: 30, week: 150, month: 500 }),
  ];
  const globals: RiskState["globals"] = [
    { id: "GRP-001", type: "block_all_scan", programmes: [], triggerConditions: "Not defined by the SOW: automatic conditions are not invented (OP-02)", status: "inactive", reason: "", requestedBy: null, approvedBy: null, executedAt: null, approvalRequestId: null, history: [] },
    { id: "GRP-002", type: "redemption_block", programmes: [], triggerConditions: "Not defined by the SOW: automatic conditions are not invented (OP-02)", status: "inactive", reason: "", requestedBy: null, approvedBy: null, executedAt: null, approvalRequestId: null, history: [] },
  ];

  /* ---------------- Rule-based rate flags and predictive AF02 (simulated) ---------------- */
  event("scan_rate", "rule", EP[26], "2026-11-07T23:59", "Scan-In daily count above the backend rule limit", { period: "day", observed: 74, limit: "backend rule (value not shown: OP-02 open)" }, { ruleRef: "BACKEND-RATE (mock)", serviceRef: "RBA-0001" });
  event("scan_rate", "rule", RT[3], "2026-11-08T23:59", "Category-level hourly scan burst (fans)", { period: "hour", category: "CAT-004", observed: 22 }, { ruleRef: "BACKEND-CATRATE (mock)", serviceRef: "RBA-0002", ...sev("medium") });
  const predictive: PredictiveResult[] = [];
  for (const [i, [m, exp, obs]] of ([[EP[27], 18, 64], [ST[7], 9, 31], [RT[4], 40, 112], [CS[6], 12, 15]] as [Member, number, number][]).entries()) {
    const flagged = obs > exp * 2;
    const ev = flagged ? event("scan_rate", "predictive", m, `2026-11-0${5 + i}T06:00`, `Observed ${obs} scans against an expected ${exp} (simulated AF02 output)`, { expected: exp, observed: obs, window: "7 days" }, { modelRef: "DEV-SIM-AF02 (simulated, no model trained)", serviceRef: `PRD-SVC-${i + 1}`, ...sev(null, i === 0 ? 0.91 : null) }) : null;
    predictive.push({ id: `PRD-${pad(i + 1)}`, memberId: m.id, programme: m.programme, expected: exp, observed: obs, deviation: `${obs - exp >= 0 ? "+" : ""}${obs - exp} scans (service-supplied)`, window: "7 days to " + `2026-11-0${5 + i}`, detectedAt: `2026-11-0${5 + i}T06:00`, modelRef: "DEV-SIM-AF02 (simulated, no model trained)", simulated: true, status: flagged ? "flagged" : "cleared", riskEventId: ev?.id ?? null });
  }

  /* ---------------- Redemption risk blocks (backend-applied, mock) ---------------- */
  const redemptionBlocks: RedemptionRiskBlock[] = [];
  const blk = (redId: string, trigger: string, response: string, at: string) => {
    const r = ws.redemptions.find((x) => x.id === redId);
    if (!r) return;
    const m = mem.members.find((x) => x.id === r.memberId)!;
    const ev = event("redemption_abuse", "rule", m, at, trigger, { redemption: r.id, points: r.points, provider: response }, { serviceRef: `RRK-${r.id}`, ruleRef: "BACKEND-REDEMPTION-RISK (mock)", links: links({ memberIds: [m.id], redemptionRefs: [r.id], ledgerRefs: r.debitLedgerId ? [r.debitLedgerId] : [] }), ...sev("high") });
    redemptionBlocks.push({ id: `RRB-${pad(redemptionBlocks.length + 1)}`, redemptionRef: r.id, memberId: m.id, programme: m.programme, method: r.method, amountInr: r.grossInr, points: r.points, trigger, providerResponse: response, detectedAt: at, source: "rule", blockStatus: "blocked", warning: { alertRef: null, status: "not_sent" }, riskEventId: ev.id, lift: null });
  };
  blk("RED-00108", "Duplicate identity (PAN match) linked to an active Temporary Hold", "Redemption service: REJECTED_RISK_IDENTITY (mock response)", "2026-11-04T09:00");
  blk("RED-00107", "Unusual redemption frequency (backend rule output)", "Redemption service: REJECTED_RISK_FREQUENCY (mock response)", "2026-11-07T15:10");

  /* ---------------- Geo-velocity, geo-fence, store gate, branch leakage ---------------- */
  const sp = (ref: string, code: string, at: string, city?: string): GeoVelocityEvent["previous"] => { const c = city ? CITY[city] : cityOf(code); return { scanRef: ref, lat: c[0], lng: c[1], location: `${c[2]} (development location)`, branchCode: code, at }; };
  const geoVelocity: GeoVelocityEvent[] = [];
  const gv = (m: Member, prev: GeoVelocityEvent["previous"], cur: GeoVelocityEvent["previous"], km: number | null, min: number | null, rule: string) => {
    const ev = event("geo_velocity", "rule", m, cur.at, `${km ?? "?"} km between consecutive scans in ${min ?? "?"} min (service output)`, { distanceKm: km, elapsedMin: min, previous: prev.scanRef, current: cur.scanRef }, { serviceRef: `GVS-${m.id}-${cur.scanRef}`, ruleRef: rule, links: links({ memberIds: [m.id], scanRefs: [prev.scanRef, cur.scanRef] }) });
    geoVelocity.push({ id: `GVE-${pad(geoVelocity.length + 1)}`, memberId: m.id, programme: m.programme, previous: prev, current: cur, distanceKm: km, elapsedMin: min, rule, serviceRef: ev.serviceRef, riskEventId: ev.id });
  };
  gv(EP[28], sp("SCN-DEV-10021", EP[28].branchCode, "2026-11-08T10:05", "KL"), sp("SCN-DEV-10022", "DL-BR-DELHI-CENTRAL", "2026-11-08T11:40", "DL"), 2108, 95, "Geo-velocity service rule (mock)");
  gv(ST[8], sp("SCN-DEV-10031", ST[8].branchCode, "2026-11-07T09:00", "TS"), sp("SCN-DEV-10032", "KA-BR-BENGALURU-EAST", "2026-11-07T12:10", "KA"), 498, 190, "Geo-velocity service rule (mock)");
  gv(CS[7], sp("SCN-DEV-10041", CS[7].branchCode, "2026-11-06T18:00", "MP"), sp("SCN-DEV-10042", "MH-BR-MUMBAI", "2026-11-06T19:15", "MH"), null, 75, "Geo-velocity service rule (mock): distance not supplied");
  const geoFence: GeoFenceCheck[] = [];
  const gf = (m: Member, distanceM: number | null, accuracyM: number | null, result: GeoFenceCheck["result"], at: string, override = false) => {
    const w = m.addresses.working;
    const banner = result === "within" ? null : result === "outside_blocked" ? `Scan blocked: you are outside ${100} m of your registered store location` : result === "gps_denied" ? "Location permission is off. Turn on location to scan, or contact support" : "Location accuracy is too low to verify your store. Move to an open area and retry, or contact support";
    const ev = result === "within" ? null : event("geo_fence", "system_validation", m, at, banner!, { distanceM, accuracyM, result }, { serviceRef: `GEO-${m.id}-${at}` });
    geoFence.push({ id: `GFC-${pad(geoFence.length + 1)}`, memberId: m.id, programme: m.programme, registered: { lat: w?.lat ?? null, lng: w?.lng ?? null, source: "SFDC onboarding location" }, scan: { scanRef: `SCN-DEV-2${pad(geoFence.length + 1)}`, lat: w?.lat != null ? w.lat + (distanceM ?? 0) / 111000 : null, lng: w?.lng ?? null, location: "Development location", branchCode: m.branchCode, at }, distanceM, accuracyM, result, banner, override: override ? { status: "approved", ref: "GOV-0001", by: RAHUL, reason: "Second branch of the same store (SFDC store group)", at: "2026-11-05T12:00" } : { status: "none", ref: null, by: null, reason: null, at: null }, riskEventId: ev?.id ?? null });
  };
  gf(RT[0], 42, 8, "within", "2026-11-08T10:00");
  gf(RT[2], 240, 12, "outside_blocked", "2026-11-08T11:00");
  gf(CS[1], 380, 10, "outside_blocked", "2026-11-07T16:00", true);
  gf(CS[3], null, null, "gps_denied", "2026-11-08T17:20");
  gf(RT[5], 70, 160, "low_accuracy", "2026-11-09T09:30");
  const storeGeo: StoreGeoRecord[] = [...RT.slice(0, 3), ...CS.slice(0, 2), ...DD.slice(0, 3)].map((m, i) => ({ memberId: m.id, programme: m.programme, storeRef: `SFDC-STORE-${pad(i + 1, 5)}`, sfdcStatus: i === 2 || i === 4 || i === 6 || i === 7 ? "pending" : "validated", scanCount: i === 2 ? 5 : i === 4 ? 2 : i === 6 ? 4 : i === 7 ? 0 : 0, scansBlocked: i === 2 ? 1 : 0, redemptionAttempts: i === 2 ? 1 : 0, lastSync: "2026-11-09T02:12", validationRef: i === 2 || i === 4 || i === 6 || i === 7 ? null : `SFDC-GEO-${pad(i + 1, 5)}` }));
  for (const r of storeGeo.filter((x) => x.sfdcStatus === "pending" && x.scansBlocked)) event("store_geo_pending", "system_validation", mem.members.find((m) => m.id === r.memberId)!, "2026-11-08T12:00", "Sixth scan blocked: store geo-validation pending in SFDC", { storeRef: r.storeRef, scans: r.scanCount }, { serviceRef: `SGV-${r.memberId}-6` });
  const leaks: RiskState["leaks"] = [];
  const leak = (m: Member, scanBranch: string, at: string) => {
    const b = findBranch(m.branchCode);
    const ev = event("branch_leakage", "rule", m, at, `Scan at ${scanBranch} outside mapped branch ${m.branchCode}`, { mapped: m.branchCode, scanned: scanBranch }, { serviceRef: `BLK-${m.id}-${at}`, ruleRef: "Branch & Hierarchy mapping check (mock)" });
    leaks.push({ id: `BLE-${pad(leaks.length + 1)}`, memberId: m.id, programme: m.programme, mappedBranch: m.branchCode, mappedTerritory: b?.district.name ?? "—", scanBranch, scanRef: `SCN-DEV-3${pad(leaks.length + 1)}`, scanAt: at, detail: `${findBranch(scanBranch)?.branch.name ?? scanBranch} is outside the mapped territory`, rule: "Branch & Hierarchy mapping check (mock)", mappingSource: "SFDC branch mapping", reconciliationRef: null, riskEventId: ev.id });
  };
  leak(EP[29], "TN-BR-CHENNAI-NORTH", "2026-11-07T12:30");
  leak(RT[7], "KA-BR-BENGALURU-WEST", "2026-11-08T15:45");
  leak(ST[9], "MH-BR-PUNE", "2026-11-09T09:10");

  /* ---------------- QR integrity (9.4) ---------------- */
  const qrRegistry: RiskState["qrRegistry"] = {};
  ss.txns.filter((t) => t.kind === "scan").slice(0, 40).forEach((t) => (qrRegistry[`QR-${t.id}`] = { memberId: t.memberId, at: `${t.date}T10:00`, skuId: t.skuId }));
  const qMask = (ref: string) => `QR ••••${ref.slice(-4)}`;
  const duplicateQr: DuplicateQrEvent[] = [];
  const dq = (ref: string, attemptBy: Member, at: string) => {
    const f = qrRegistry[ref];
    const first = mem.members.find((m) => m.id === f.memberId)!;
    const same = first.id === attemptBy.id;
    const ev = event("duplicate_qr", "system_validation", attemptBy, at, same ? "QR already scanned by the same member" : "QR already scanned by another member", { qr: qMask(ref), sameMember: same ? "yes" : "no" }, { serviceRef: `QRV-${ref}-${attemptBy.id}`, links: links({ memberIds: [attemptBy.id, first.id], qrRefs: [ref] }) });
    duplicateQr.push({ id: `DQR-${pad(duplicateQr.length + 1)}`, qrRef: ref, qrMasked: qMask(ref), skuId: f.skuId, first: { memberId: first.id, programme: first.programme, branchCode: first.branchCode, at: f.at }, attempt: { memberId: attemptBy.id, programme: attemptBy.programme, branchCode: attemptBy.branchCode, at }, sameMember: same, memberMessage: same ? `You already scanned this code on ${f.at.slice(0, 10)}` : `This code was already scanned by another member (${first.id.slice(0, 7)}••${first.id.slice(-2)}) on ${f.at.slice(0, 10)}`, rejectionRef: `QRV-REJ-${pad(duplicateQr.length + 1, 5)}`, investigationStatus: "logged", riskEventId: ev.id });
  };
  const qrRefs = Object.keys(qrRegistry);
  dq(qrRefs[0], mem.members.find((m) => m.id === qrRegistry[qrRefs[0]].memberId)!, "2026-11-08T10:30");
  dq(qrRefs[1], EP[30], "2026-11-08T14:00");
  const tampered: TamperedQrCase[] = [];
  const tq = (ref: string, m: Member, reason: string, at: string, pin = false) => {
    const ev = event("tampered_qr", "system_validation", m, at, reason, { qr: qMask(ref) }, { serviceRef: `QRT-${ref}`, links: links({ memberIds: [m.id], qrRefs: [ref] }) });
    tampered.push({ id: `TQR-${pad(tampered.length + 1)}`, qrRef: ref, qrMasked: qMask(ref), skuId: "SKU-00012", memberId: m.id, programme: m.programme, branchCode: m.branchCode, reason, at, evidence: [{ id: "EVD-T1", kind: "qr", ref: qMask(ref), description: "QR integrity service rejection payload (mock)", sensitive: false, addedBy: SYS, addedAt: at }], remarks: [], ownerId: pin ? SNEHA : null, status: pin ? "assigned" : "open", pin: pin ? { status: "recorded", party: "Retail counter staff (as reported)", owner: SNEHA, decision: "Recorded for review: adjudication rules not confirmed", remarks: "Member says the counter staff scratched the label", decisionRef: "PIN-REC-0001", ruleStatus: "business_confirmation_required" } : { status: "not_recorded", party: null, owner: null, decision: null, remarks: null, decisionRef: null, ruleStatus: "business_confirmation_required" }, closure: null, riskEventId: ev.id });
  };
  tq("QR-TMP-77120", EP[31], "Label checksum mismatch (QR integrity service)", "2026-11-07T19:00", true);
  tq("QR-TMP-77131", RT[8], "Coupon PIN revealed before sale (reported by service engineer)", "2026-11-09T11:20");

  /* ---------------- Data integrity and SFDC reconciliation (9.5) ---------------- */
  const validationExceptions: ValidationException[] = [
    { id: "DIX-0001", entityType: "Member (SFDC)", entityId: "SFDC-MOCK-Retailer-609911", source: "SFDC", field: "Member name", valueMasked: "(empty)", errorType: "missing_mandatory", message: "Member name is mandatory before sync (SOW 9.5)", detectedAt: "2026-11-09T02:12", batchId: "DVB-0002", status: "open", owner: null, remarks: [], sourceFix: null, reprocess: [] },
    { id: "DIX-0002", entityType: "Member (SFDC)", entityId: "SFDC-MOCK-DD-602114", source: "SFDC", field: "Branch reference", valueMasked: "KA-BR-UDUPI", errorType: "invalid_reference", message: "Branch code not in the Branch & Hierarchy master", detectedAt: "2026-11-09T02:12", batchId: "DVB-0002", status: "assigned", owner: RAHUL, remarks: [{ at: "2026-11-09T10:00", by: RAHUL, text: "Raised with the SFDC team" }], sourceFix: null, reprocess: [] },
    { id: "DIX-0003", entityType: "Identity", entityId: panPair[1].id, source: "Identity registry", field: "PAN", valueMasked: rst2?.dedup?.masked ?? "XXXXX0072X", errorType: "duplicate_identity", message: "PAN shared with another identity (nightly batch DBB-0001)", detectedAt: "2026-11-04T00:00", batchId: null, status: "awaiting_source_fix", owner: SNEHA, remarks: [], sourceFix: null, reprocess: [] },
  ];
  const validationBatches = [
    { id: "DVB-0001", at: "2026-11-08T02:10", source: "SFDC member sync (mock)", total: 120, synced: 120, failed: 0, status: "completed" as const },
    { id: "DVB-0002", at: "2026-11-09T02:12", source: "SFDC member sync (mock)", total: 118, synced: 116, failed: 2, status: "partial" as const },
  ];
  const kindOf: Record<string, HierarchyMismatch["kind"]> = { pincode_mismatch: "pincode_mismatch", parent_changed: "invalid_parent", missing_in_source: "stale_reference", duplicate_source: "duplicate_source", validation_failed: "pincode_mismatch", source_changed: "branch_mismatch" };
  const hv = (code: string, over: Partial<HierarchyMismatch["sfdc"]> = {}) => { const b = findBranch(code); return { state: b?.state.code ?? code.slice(0, 2), district: b?.district.code ?? null, branch: b ? code : null, pincode: ms.hierarchy.find((h) => h.code === code)?.pincodes[0] ?? null, sourceRef: ms.hierarchy.find((h) => h.code === code)?.sourceRecordId ?? null, ...over }; };
  const mismatches: HierarchyMismatch[] = ms.conflicts.map((c, i) => ({ id: `HRM-${pad(i + 1)}`, batchId: "SRB-0001", kind: kindOf[c.kind] ?? "branch_mismatch", recordCode: c.recordCode, sfdc: hv(c.recordCode, c.kind === "pincode_mismatch" || c.kind === "validation_failed" ? { pincode: c.sourceValue } : c.kind === "parent_changed" ? { district: c.sourceValue } : c.kind === "missing_in_source" ? { branch: null, sourceRef: null } : {}), platform: hv(c.recordCode, c.kind === "pincode_mismatch" || c.kind === "validation_failed" ? { pincode: c.portalValue } : {}), conflictRef: c.id, proposedCorrection: "", owningSystem: null, responsibleTeam: null, confirmation: null, status: c.status === "under_review" ? "under_review" : "open", reprocess: null, history: [{ at: c.detectedAt, by: SYS, action: "detected", detail: `From SFDC sync ${c.syncRunId}` }] }));
  mismatches.push(
    { id: `HRM-${pad(mismatches.length + 1)}`, batchId: "SRB-0001", kind: "district_mismatch", recordCode: "KL-BR-ALUVA", sfdc: hv("KL-BR-ALUVA", { district: "KL-THRISSUR" }), platform: hv("KL-BR-ALUVA"), conflictRef: null, proposedCorrection: "", owningSystem: null, responsibleTeam: null, confirmation: null, status: "open", reprocess: null, history: [{ at: "2026-11-09T02:30", by: SYS, action: "detected", detail: "Hierarchy reconciliation batch SRB-0001" }] },
    { id: `HRM-${pad(mismatches.length + 3)}`, batchId: "SRB-0001", kind: "branch_mismatch", recordCode: "TN-BR-MADURAI", sfdc: hv("TN-BR-MADURAI", { branch: "TN-BR-MADURAI-CITY", sourceRef: "SFDC-MOCK-09931" }), platform: hv("TN-BR-MADURAI"), conflictRef: null, proposedCorrection: "", owningSystem: null, responsibleTeam: null, confirmation: null, status: "open", reprocess: null, history: [{ at: "2026-11-09T02:30", by: SYS, action: "detected", detail: "SFDC renamed the branch code" }] },
    { id: `HRM-${pad(mismatches.length + 2)}`, batchId: "SRB-0001", kind: "missing_branch", recordCode: "TN-BR-SALEM", sfdc: { state: "TN", district: "TN-SALEM", branch: "TN-BR-SALEM", pincode: "636001", sourceRef: "SFDC-MOCK-09920" }, platform: { state: "TN", district: null, branch: null, pincode: null, sourceRef: null }, conflictRef: null, proposedCorrection: "", owningSystem: null, responsibleTeam: null, confirmation: null, status: "open", reprocess: null, history: [{ at: "2026-11-09T02:30", by: SYS, action: "detected", detail: "Branch exists in SFDC only" }] },
  );
  const reconBatches = [{ id: "SRB-0001", at: "2026-11-09T02:30", total: ms.hierarchy.length + 1, matchedDistricts: ms.hierarchy.filter((h) => h.level === "district").length - 1, matchedBranches: ms.hierarchy.filter((h) => h.level === "branch").length - ms.conflicts.length - 1, mismatches: mismatches.length, status: "completed" as const, mock: true as const }];

  /* ---------------- Cases ---------------- */
  const cases: RiskCase[] = [];
  const mkCase = (title: string, vector: FraudVector, evIds: string[], status: RiskCase["status"], owner: string | null, at: string, extra: Partial<RiskCase> = {}): RiskCase => {
    const evs = events.filter((e) => evIds.includes(e.id));
    const id = `CASE-${pad(cases.length + 1)}`;
    const merge = (k: keyof RiskLinks) => [...new Set(evs.flatMap((e) => e.links[k]))];
    const c: RiskCase = { id, title, vector, eventIds: evIds, links: { memberIds: merge("memberIds"), deviceIds: merge("deviceIds"), qrRefs: merge("qrRefs"), scanRefs: merge("scanRefs"), redemptionRefs: merge("redemptionRefs"), ledgerRefs: merge("ledgerRefs") }, ownerId: owner, priority: null, status, notes: [], evidence: [], recommendations: [], decision: null, history: [{ at, by: SNEHA, from: null, to: "new", remarks: "Case opened" }], createdAt: at, createdBy: SNEHA, updatedAt: at, ...extra };
    for (const e of evs) { e.status = status === "cleared" || status === "closed" ? "cleared" : "in_case"; e.caseId = id; }
    cases.push(c);
    log(at, SNEHA, "risk_case", id, "case_opened", evIds.join(", "), title);
    return c;
  };
  mkCase("Device farming on one handset (4 accounts)", "device_farming", [farmEv.id], "under_investigation", SNEHA, "2026-11-09T09:00", { priority: "p2", history: [{ at: "2026-11-09T09:00", by: SNEHA, from: null, to: "new", remarks: "Case opened" }, { at: "2026-11-09T09:05", by: SNEHA, from: "new", to: "assigned", remarks: "Assigned to Sneha" }, { at: "2026-11-09T09:10", by: SNEHA, from: "assigned", to: "under_investigation", remarks: "Reviewing login history" }], notes: [{ id: "NTE-0001", at: "2026-11-09T09:20", by: SNEHA, orgId: "ORG-EVOLVE", text: "Four accounts scan from one handset late at night; two profile creations were rejected by the identity service", eventId: farmEv.id, visibility: "internal" }], evidence: [{ id: "EVD-0001", kind: "device", ref: farm.id, description: "Device login history export (mock)", sensitive: true, addedBy: SNEHA, addedAt: "2026-11-09T09:25" }] });
  mkCase("PAN shared across EP and ST memberships", "duplicate_identity", [panEv.id], "restriction_applied", SNEHA, "2026-11-04T10:00", { priority: "p1", recommendations: [{ id: "REC-0001", action: "temporary_hold", targetId: panPair[0].id, reason: "Same PAN on two earning accounts", by: SNEHA, at: "2026-11-04T10:30", status: "applied", appliedRef: rst2?.id ?? null, appliedBy: rst2?.appliedBy ?? SYS }], history: [{ at: "2026-11-04T10:00", by: SNEHA, from: null, to: "new", remarks: "Case opened" }, { at: "2026-11-04T10:05", by: SNEHA, from: "new", to: "assigned", remarks: "" }, { at: "2026-11-04T10:10", by: SNEHA, from: "assigned", to: "under_investigation", remarks: "" }, { at: "2026-11-04T10:30", by: SNEHA, from: "under_investigation", to: "restriction_recommended", remarks: "Temporary Hold recommended" }, { at: "2026-11-04T11:00", by: SYS, from: "restriction_recommended", to: "restriction_applied", remarks: `${rst2?.id ?? "RST"} applied in Member Management` }] });
  const gvFalse = events.find((e) => e.vector === "geo_velocity" && e.signal.distanceKm === 498)!;
  mkCase("Geo-velocity: Hyderabad to Bengaluru", "geo_velocity", [gvFalse.id], "closed", SNEHA, "2026-11-07T13:00", { decision: { outcome: "cleared", by: SNEHA, at: "2026-11-07T15:00", remarks: "Member travelled by flight for a site visit (SR confirmed)" }, history: [{ at: "2026-11-07T13:00", by: SNEHA, from: null, to: "new", remarks: "" }, { at: "2026-11-07T13:05", by: SNEHA, from: "new", to: "assigned", remarks: "" }, { at: "2026-11-07T13:10", by: SNEHA, from: "assigned", to: "under_investigation", remarks: "" }, { at: "2026-11-07T15:00", by: SNEHA, from: "under_investigation", to: "cleared", remarks: "SR confirmed travel" }, { at: "2026-11-07T15:05", by: SNEHA, from: "cleared", to: "closed", remarks: "" }] });

  /* ---------------- Compliance evidence register ---------------- */
  const evidence: ComplianceEvidence[] = [
    { id: "CER-001", controlRef: "DPDP-CONSENT", area: "DPDP / data protection", description: "Explicit Aadhaar consent captured per identity", sourceModule: "Member Management", link: "/governance/fraud/compliance?tab=dpdp", lastUpdated: "2026-11-09T02:00", validation: "evidence_available", openException: null, owner: "V-Guard compliance" },
    { id: "CER-002", controlRef: "DPDP-RETENTION", area: "DPDP / data protection", description: "KYC retained seven years after account closure (policy service not connected)", sourceModule: "Member Management", link: "/governance/fraud/compliance?tab=dpdp", lastUpdated: "2026-11-09T02:00", validation: "not_connected", openException: null, owner: "V-Guard compliance" },
    { id: "CER-003", controlRef: "DPDP-LOCK", area: "DPDP / data protection", description: "Verified identity fields locked; changes through the override policy", sourceModule: "Member Management", link: "/members", lastUpdated: "2026-11-09T02:00", validation: "evidence_available", openException: null, owner: "Evolve operations" },
    { id: "CER-004", controlRef: "DPDP-TOKEN", area: "DPDP / data protection", description: "PII tokenisation status (backend not connected)", sourceModule: "Identity registry", link: "/governance/fraud/compliance?tab=dpdp", lastUpdated: "2026-11-09T02:00", validation: "not_connected", openException: null, owner: "Evolve platform" },
    { id: "CER-005", controlRef: "TDS-26Q", area: "Income Tax / 26Q", description: "Quarterly TDS statements and 26Q report (Phase 7)", sourceModule: "Wallet · TDS management", link: "/wallet/tds", lastUpdated: "2026-11-08T10:00", validation: "evidence_available", openException: null, owner: "V-Guard finance" },
    { id: "CER-006", controlRef: "TDS-RECON", area: "Income Tax / 26Q", description: "TDS Kitty FY reconciliation", sourceModule: "Wallet · TDS management", link: "/wallet/tds", lastUpdated: "2026-11-08T10:00", validation: "exception_open", openException: "Redemption TDS slab for ST / CS / Retailer not confirmed (OP-TDS1)", owner: "V-Guard finance" },
    { id: "CER-007", controlRef: "RBI-PAYOUT", area: "RBI / payouts", description: "Payout activity on regulated rails with provider references and UTRs", sourceModule: "Redemption · Payouts", link: "/redemption/payouts", lastUpdated: "2026-11-09T06:00", validation: "evidence_available", openException: null, owner: "V-Guard finance" },
    { id: "CER-008", controlRef: "RBI-RECON", area: "RBI / payouts", description: "UTR reconciliation and failed payout exceptions", sourceModule: "Wallet · Reconciliation", link: "/wallet/reconciliation", lastUpdated: "2026-11-09T06:00", validation: "exception_open", openException: "Payout success callback without UTR (FEX-0001)", owner: "V-Guard finance" },
    { id: "CER-009", controlRef: "RBI-LIMITS", area: "RBI / payouts", description: "Configured redemption limits and approvals", sourceModule: "Redemption · Limits & controls", link: "/redemption/limits", lastUpdated: "2026-11-08T10:00", validation: "evidence_available", openException: null, owner: "V-Guard finance" },
    { id: "CER-010", controlRef: "AUDIT-PLATFORM", area: "Audit trail", description: "Access, data-change, configuration and financial adjustment logs across modules", sourceModule: "Platform audit", link: "/governance/fraud/audit", lastUpdated: "2026-11-09T14:00", validation: "evidence_available", openException: null, owner: "Evolve platform" },
    { id: "CER-011", controlRef: "FRAUD-THRESHOLDS", area: "Fraud controls", description: "Rule thresholds for Scan-In, Scan-Out and redemption", sourceModule: "Fraud & risk · Anomaly rules", link: "/governance/fraud/rules", lastUpdated: "2026-11-08T16:00", validation: "exception_open", openException: "Thresholds not confirmed (OP-02)", owner: "V-Guard risk team" },
  ];
  void geoOfMember;

  audit.sort((a, b) => a.at.localeCompare(b.at));
  audit.forEach((e, i) => (e.id = `RAE-${pad(i + 1, 6)}`));
  return {
    events, cases, identityMatches, dedupBatches, registryFeed, devices, rules, globals, predictive, redemptionBlocks, geoVelocity, geoFence, storeGeo, leaks, qrRegistry, duplicateQr, tampered,
    digest: { enabled: false, schedule: null, recipientGroup: null, status: "business_confirmation_required", previews: [{ id: "QDG-0001", date: "2026-11-08", duplicateCount: duplicateQr.length, categories: ["Fans", "Wires & cables"], branches: [...new Set(duplicateQr.map((d) => d.attempt.branchCode))], recipientGroup: null, dispatch: "not_dispatched" }] },
    validationRules: [
      { id: "DVR-001", entity: "Member", field: "Member name", mandatory: true, ruleRef: "SOW 9.5 (member name must not be null)", source: "SFDC", errorCount: 1, lastValidation: "2026-11-09T02:12", status: "active" },
      { id: "DVR-002", entity: "Member", field: "Branch reference", mandatory: true, ruleRef: "Branch & Hierarchy master reference (existing data)", source: "SFDC", errorCount: 1, lastValidation: "2026-11-09T02:12", status: "active" },
    ],
    validationExceptions, validationBatches, reconBatches, mismatches, evidence,
    alerts: [],
    config: { investigationSlaDays: null, alertRecipients: ["USR-1003", "USR-1004", "USR-2001"] },
    decisions: structuredClone(RISK_DECISIONS),
    audit,
  };
}
export { addH };
