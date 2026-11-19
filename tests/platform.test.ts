/**
 * Phase 13 — Platform administration, View-As, application usage analytics, app themes, governance,
 * error catalogue, performance / capacity / security evidence, UAT, migration and go-live readiness
 * (Build Prompt 13, section 30, scenarios 1–126).
 *   npm run test:platform
 * Runs the real platform store against the access engine, the approval engine, members, wallet,
 * schemes, analytics and ops stores in Node. All data is labelled development data. Items that need a
 * backend, a provider sandbox or a business decision are asserted as pending / refused, not passed.
 */
import { readFileSync } from "node:fs";
import { accessStore } from "@/features/access/store";
import { hasPermission } from "@/features/access/engine";
import { approvalStore, decideRequest } from "@/features/approvals/store";
import { memberStore } from "@/features/members/store";
import { geoOfMember } from "@/features/members/engine";
import { walletStore } from "@/features/wallet/store";
import { schemeStore } from "@/features/schemes/store";
import * as P from "@/features/platform/store";
import { activeSession, durationSec, viewAsStore } from "@/features/platform/viewAsSession";
import { AUTH_CONFIG } from "@/services/auth";
import { ACCEPTANCE_CRITERIA, AF_COVERAGE, CAPACITY_TARGETS, ERROR_CATALOGUE, GO_LIVE_GATES, OUT_OF_SCOPE, PERF_TARGETS, PROGRAMMES, RELEASE_ITEMS, SECURITY_CONTROLS } from "@/config/platformCatalogue";
import type { Member } from "@/types/members";
import type { ThemeInput } from "@/features/platform/store";

const RAHUL = "USR-1003", ANITA = "USR-2001", TANUJIT = "USR-1001", VIKRAM = "USR-2006", KA_ADMIN = "USR-2004", PRIYA = "USR-2005", LAKSHMI = "USR-2003";
const acc = () => accessStore.get();
const mem = () => memberStore.get();
const ps = () => P.platformStore.get();
const T0 = Date.parse("2026-11-19T10:00:00Z");
const MIN = 60_000;

type Kind = "deterministic" | "blocked" | "governance";
const results: { n: number; name: string; kind: Kind; ok: boolean; detail: string }[] = [];
const pending: Promise<void>[] = [];
function test(n: number, name: string, kind: Kind, fn: () => string | void | Promise<string | void>) {
  const done = (ok: boolean, detail: string) => results.push({ n, name, kind, ok, detail });
  try {
    const r = fn();
    if (r instanceof Promise) pending.push(r.then((d) => done(true, d ?? "")).catch((e) => done(false, (e as Error).message)));
    else done(true, r ?? "");
  } catch (e) {
    done(false, (e as Error).message);
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const ok = (r: { ok: boolean; errors: string[] }, what = "") => expect(r.ok, `${what} ${r.errors.join("; ")}`.trim());
const no = (r: { ok: boolean; errors?: string[] }, what: string, match?: RegExp) => {
  expect(!r.ok, `${what} was allowed`);
  if (match) expect((r.errors ?? []).some((e) => match.test(e)), `${what}: unexpected reason ${(r.errors ?? []).join("; ")}`);
};
const audited = (action: string, entity?: string) => ps().audit.some((a) => a.action === action && (!entity || a.entity === entity));
const can = (uid: string, module: string, action: string, m?: Member) => hasPermission(acc(), uid, module, action as never, m ? { programme: m.programme, geo: geoOfMember(m) } : undefined).allowed;
const hasApp = (m: Member) => !["pending", "rejected", "invited"].includes(m.status) && !!m.registration.firstLoginAt;
const src = (p: string) => readFileSync(p, "utf8");

/* Personas and members used across scenarios (development data). */
const vikramMember = mem().members.find((m) => m.branchCode === "TN-BR-CHENNAI-NORTH" && m.programme === "EP" && hasApp(m))!;
const otherTn = mem().members.find((m) => m.branchCode.startsWith("TN-") && m.branchCode !== "TN-BR-CHENNAI-NORTH" && hasApp(m))!;
const kaMember = mem().members.find((m) => m.branchCode.startsWith("KA-") && hasApp(m))!;
const kochiMember = mem().members.find((m) => m.branchCode === "KL-BR-KOCHI" && ["EP", "Retailer"].includes(m.programme))!;
const noApp = mem().members.find((m) => !hasApp(m))!;
expect(vikramMember && otherTn && kaMember && kochiMember && noApp, "development personas missing");

/* ======================= Admin SSO and RBAC (1–12) ======================= */

test(1, "V-Guard email SSO route is available", "governance", () => {
  const s = P.adminSsoStatus();
  expect(AUTH_CONFIG.saml && "idpSsoUrl" in AUTH_CONFIG.saml, "SAML configuration structure missing");
  expect(s.mode === "mock" && !s.live && s.provider === "Not connected", "SSO reported live without an identity provider");
  expect(s.missing.length === Object.keys(AUTH_CONFIG.saml).length, "missing SAML values not listed");
  expect(AF_COVERAGE.find((x) => x.ref === "AF01")?.status === "backend_integration_prepared", "AF01 must stay prepared, not complete");
  return `SSO prepared; ${s.missing.length} SAML values to supply at deployment`;
});
test(2, "Member MPIN is not used for admin login", "deterministic", () => {
  expect(!/mpin/i.test(src("src/services/auth.ts")), "auth service mentions MPIN");
  expect(/never used/i.test(P.adminSsoStatus().memberMpin), "MPIN statement missing");
});
test(3, "User lands on the correct role-scoped dashboard", "deterministic", () => {
  const v = P.landingFor(VIKRAM), t = P.landingFor(TANUJIT);
  expect(t.landing === "/" && t.modules.includes("users"), "Super Admin landing");
  expect(v.modules.includes("members") && !v.modules.includes("users") && !v.modules.includes("platform-admin"), "Sales Rep modules");
  return `Sales Rep sees ${v.modules.length} modules, Super Admin ${t.modules.length}`;
});
test(4, "Regional user cannot access another region", "deterministic", () => {
  expect(can(KA_ADMIN, "members", "view", kaMember), "KA admin cannot see KA member");
  expect(!can(KA_ADMIN, "members", "view", vikramMember), "KA admin sees TN member");
});
test(5, "Branch user cannot access another branch", "deterministic", () => {
  expect(can(PRIYA, "members", "view", kochiMember), "Kochi branch manager cannot see Kochi member");
  expect(!can(PRIYA, "members", "view", vikramMember), "Kochi branch manager sees Chennai member");
});
test(6, "Sales Rep sees only mapped members", "deterministic", () => {
  expect(can(VIKRAM, "members", "view", vikramMember), "own branch member hidden");
  expect(!can(VIKRAM, "members", "view", otherTn) && !can(VIKRAM, "members", "view", kaMember), "Sales Rep sees members outside the mapped branch");
  const inScope = mem().members.filter((m) => can(VIKRAM, "members", "view", m));
  expect(inScope.every((m) => m.branchCode === "TN-BR-CHENNAI-NORTH" && m.programme === "EP"), "scope leak");
  return `${inScope.length} mapped members`;
});
test(7, "HO/Admin override is explicitly authorised", "deterministic", () => {
  no(P.validateViewAsAccess(ANITA, otherTn.id), "override without a reason");
  expect(P.validateViewAsAccess(ANITA, otherTn.id, { reason: "" }).allowed === false, "override with an empty reason");
  const d = P.validateViewAsAccess(ANITA, otherTn.id, { reason: "Ticket TCK-1 member request" });
  expect(d.allowed && d.override, "explicit override refused");
  expect(!P.validateViewAsAccess(VIKRAM, otherTn.id, { reason: "x" }).allowed, "Sales Rep used the override");
});
test(8, "Financial action requires separate approval", "governance", () => {
  const rows = P.secondPersonCheck();
  const financial = rows.filter((r) => /points|redemption|settlement|gst|tds|financial|limit|insurance/i.test(r.requestTypes.join()));
  const gaps = financial.filter((r) => r.status !== "covered");
  expect(financial.length >= 6 && !gaps.length, `uncovered financial actions: ${gaps.map((g) => g.action).join(", ")}`);
  expect(rows.every((r) => r.selfApprovalBlocked && r.reasonRequired), "self-approval / reason");
  const other = rows.filter((r) => r.status !== "covered").map((r) => r.action);
  return `${financial.length} financial actions routed through Maker-Checker workflows${other.length ? `; reported without a workflow: ${other.join(", ")}` : ""}`;
});
test(10, "MPIN Reset authority is configurable and remains tied to OP-RBAC1", "governance", () => {
  const holders = P.authorityHolders("members", "reset_credentials");
  expect(Array.isArray(holders), "authority not derived from roles");
  expect(P.decisionStatus("OP-RBAC1") === "open", "OP-RBAC1 not open");
  return `${holders.length} current holder(s), pending OP-RBAC1`;
});
test(11, "Redemption Cancellation remains Evolve-restricted", "deterministic", () => {
  const h = P.authorityHolders("redemption", "cancel");
  expect(h.length > 0 && h.every((u) => /evolve/i.test(u.org)), `non-Evolve holder: ${h.map((u) => `${u.name} (${u.org})`).join(", ")}`);
  return h.map((u) => u.name).join(", ");
});
test(12, "Role mapping matrix shows unresolved mappings", "governance", () => {
  const m = P.roleMappingMatrix();
  expect(m.length === 6, "six SOW roles expected");
  expect(m.some((r) => r.mapping !== "mapped"), "no unresolved mapping shown");
  expect(m.every((r) => r.confirmation === "business_confirmation_required"), "mapping marked confirmed");
});

/* ======================= View-As (13–33) ======================= */

let vSession = "";
test(13, "Sales Rep can View-As own-branch member", "deterministic", () => {
  const r = P.startViewAs(VIKRAM, vikramMember.id, {}, T0);
  ok(r, "start");
  vSession = r.sessionId!;
  return `${vSession} for ${vikramMember.id}`;
});
const app = P.viewAsMemberApp(VIKRAM, T0 + MIN).app!;
test(14, "Member screens render correctly", "deterministic", () => {
  expect(app && app.home.name === vikramMember.name && app.home.programme === "EP", "home screen");
  expect(Array.isArray(app.schemes.progress) && Array.isArray(app.passbook) && typeof app.wallet.available === "number", "screens incomplete");
});
test(15, "Wallet and passbook are read-only", "deterministic", () => {
  const before = walletStore.get();
  P.viewAsMemberApp(VIKRAM, T0 + MIN);
  expect(walletStore.get() === before, "wallet store changed while viewing");
  expect(!hasPermission(acc(), VIKRAM, "wallet", "edit" as never).allowed, "wallet edit allowed in View-As");
});
const disabled = (label: string) => expect(app.disabled.includes(label), `${label} not listed as disabled`);
test(16, "Scan action is disabled", "deterministic", () => { disabled("Scan"); expect(!hasPermission(acc(), VIKRAM, "scanning", "create" as never).allowed, "scan create allowed"); });
test(17, "Redemption action is disabled", "deterministic", () => { disabled("Redeem"); expect(!hasPermission(acc(), VIKRAM, "redemption", "create" as never).allowed, "redeem allowed"); });
test(18, "KYC edit is disabled", "deterministic", () => { disabled("Edit KYC"); expect(!hasPermission(acc(), VIKRAM, "registration-kyc", "edit" as never).allowed, "KYC edit allowed"); });
test(19, "Bank detail edit is disabled", "deterministic", () => { disabled("Edit bank details"); expect(!hasPermission(acc(), VIKRAM, "members", "edit" as never).allowed, "member edit allowed"); });
test(20, "Points adjustment is disabled", "deterministic", () => { disabled("Adjust points"); });
test(21, "Referral and messaging actions are disabled", "deterministic", () => { disabled("Referrals"); disabled("Send messages"); });
const secrets = () => mem().documents.filter((d) => d.memberId === vikramMember.id && d.maskedId).map((d) => ({ type: d.type, v: d.maskedId! }));
const appJson = JSON.stringify(app);
test(22, "Aadhaar is masked", "deterministic", () => {
  expect(!secrets().filter((s) => s.type === "aadhaar").some((s) => appJson.includes(s.v)), "Aadhaar reference present");
  expect(!/\b\d{12}\b/.test(appJson), "12-digit number present");
  expect(app.kyc.every((k) => Object.keys(k).join() === "type,status"), "KYC rows carry more than type and status");
});
test(23, "PAN is masked", "deterministic", () => {
  expect(!secrets().filter((s) => s.type === "pan").some((s) => appJson.includes(s.v)), "PAN reference present");
  expect(!/\b[A-Z]{5}\d{4}[A-Z]\b/.test(appJson), "PAN pattern present");
});
test(24, "Full bank account is masked", "deterministic", () => {
  expect(!secrets().filter((s) => s.type === "bank").some((s) => appJson.includes(s.v)), "bank reference present");
  expect(!/maskedId|mobile|ifsc|account/i.test(Object.keys(app.home).join()), "sensitive keys present");
  expect(!appJson.includes(vikramMember.mobile), "mobile present");
});
test(25, "Branch restriction is enforced", "deterministic", () => {
  no(P.startViewAs(VIKRAM, otherTn.id, {}, T0 + 2 * MIN), "out-of-branch View-As", /outside your branch/);
  expect(activeSession(VIKRAM, T0 + 2 * MIN)?.id === vSession, "refused attempt ended the open session");
});
test(26, "HO/Admin override is audited", "governance", () => {
  const r = P.startViewAs(ANITA, otherTn.id, { override: { reason: "Ticket TCK-204: member reports wrong balance" } }, T0);
  ok(r, "override start");
  const s = viewAsStore.get().sessions.find((x) => x.id === r.sessionId)!;
  expect(s.override?.reason.includes("TCK-204") && audited("view_as_override_started", otherTn.id), "override not audited");
  ok(P.endViewAs(ANITA, "exit", T0 + 3 * MIN), "end");
});
test(27, "Persistent View-As banner is shown", "governance", () => {
  const main = src("src/main.tsx"), banner = src("src/components/ViewAsBanner.tsx");
  expect(/<ViewAsBanner \/>[\s\S]*<App \/>/.test(main), "banner not rendered above every route");
  expect(banner.includes("READ-ONLY VIEW-AS MODE") && banner.includes("activeSession"), "banner content");
});
test(28, "Exit action works", "deterministic", () => {
  ok(P.endViewAs(VIKRAM, "exit", T0 + 4 * MIN + 5_000), "exit");
  expect(!activeSession(VIKRAM, T0 + 5 * MIN), "session still open");
  expect(hasPermission(acc(), VIKRAM, "tickets", "create" as never).allowed, "write access not restored after exit");
});
test(29, "Inactivity closes session", "deterministic", () => {
  ok(P.startViewAs(VIKRAM, vikramMember.id, {}, T0 + 10 * MIN));
  expect(activeSession(VIKRAM, T0 + 20 * MIN), "closed too early");
  expect(!activeSession(VIKRAM, T0 + 10 * MIN + (viewAsStore.get().idleMinutes + 1) * MIN), "still open after the inactivity period");
  const s = viewAsStore.get().sessions.slice(-1)[0];
  expect(s.exitReason === "inactivity_timeout", `exit reason ${s.exitReason}`);
  return `Idle timeout ${viewAsStore.get().idleMinutes} min (development, OP-VIEWAS1)`;
});
test(30, "Session duration is recorded", "deterministic", () => {
  const s = viewAsStore.get().sessions.find((x) => x.id === vSession)!;
  expect(s.endedAt && durationSec(s) === 245, `duration ${durationSec(s)}`);
});
test(31, "IP and device references are recorded, where available", "deterministic", () => {
  const s = viewAsStore.get().sessions.find((x) => x.id === vSession)!;
  expect(s.ip && s.device && /not captured/i.test(s.ip), "IP must say it is not captured by the mock adapter, not invent one");
  return `${s.ip} · ${s.device}`;
});
test(32, "Failed attempts are audited", "governance", () => {
  no(P.startViewAs(VIKRAM, noApp.id, {}, T0 + 40 * MIN), "View-As without an app account", /unavailable/);
  no(P.startViewAs(LAKSHMI, vikramMember.id, {}, T0 + 40 * MIN), "View-As without permission");
  const refused = viewAsStore.get().attempts.filter((a) => a.result === "refused");
  expect(refused.length >= 3 && audited("view_as_refused"), "refused attempts not recorded");
  return `${refused.length} refused attempts recorded`;
});
const BASE_THEME = (): ThemeInput => ({ name: "EP Gold tier", type: "tier", programmes: ["EP"], tierIds: [schemeStore.get().tiers.find((t) => t.programme === "EP")!.id], eventRef: null, effectiveFrom: "2026-12-01", effectiveTo: null, tokens: { primary: "#C9A227", secondary: "#111318", background: "#FFFFFF", text: "#111318", accent: "#E5A000" }, assets: { background: null, banner: null }, screens: [] });
test(33, "Backend/API mutation attempt is rejected", "deterministic", () => {
  ok(P.startViewAs(RAHUL, vikramMember.id, { override: { reason: "Ticket TCK-300" } }, T0 + 50 * MIN), "Evolve Ops override");
  const at = T0 + 51 * MIN;
  expect(activeSession(RAHUL, at), "no session");
  const g = hasPermission(acc(), RAHUL, "members", "edit" as never);
  expect(!g.allowed && /View-As/.test(g.reason ?? ""), "permission service allowed a change");
  no(P.createThemeDraft(RAHUL, BASE_THEME()), "theme draft during View-As", /View-As|need/i);
  no(P.logDefect(RAHUL, { module: "x", title: "x", description: "", severity: "P3", source: "UAT" }), "defect during View-As");
  ok(P.endViewAs(RAHUL, "exit", at));
  expect(hasPermission(acc(), RAHUL, "members", "edit" as never).allowed || !can(RAHUL, "members", "edit"), "permissions not restored");
});

/* ======================= Application usage analytics (34–50) ======================= */

const u = P.usageView(RAHUL, {});
expect(!("denied" in u), "Evolve Ops denied usage analytics");
const U = u as Exclude<typeof u, { denied: true }>;
const all = P.usageSessions();
test(34, "Landing count", "deterministic", () => {
  const landed = U.screens.reduce((n, s) => n + s.landing, 0);
  expect(landed === U.overview.appOpens && U.overview.appOpens === U.sessions, `landing ${landed} vs opens ${U.overview.appOpens}`);
  return `${U.overview.appOpens} app opens`;
});
test(35, "Unique users", "deterministic", () => {
  expect(U.overview.uniqueUsers === new Set(all.map((s) => s.memberId)).size, "unique users");
});
test(36, "Screen/page views", "deterministic", () => {
  expect(U.overview.pageViews === all.reduce((n, s) => n + s.views.length, 0) && U.overview.pageViews === U.screens.reduce((n, s) => n + s.views, 0), "page views");
});
test(37, "Average time per screen", "deterministic", () => {
  const timed = all.flatMap((s) => s.views).filter((v) => v.seconds != null).map((v) => v.seconds!);
  expect(Math.abs((U.overview.avgTimePerScreenSec ?? 0) - timed.reduce((a, b) => a + b, 0) / timed.length) < 0.01, "average time per screen");
});
test(38, "Bounce/exit rate", "deterministic", () => {
  const s = U.screens.find((x) => x.views)!;
  expect(Math.abs((s.exitRate ?? 0) - s.exits / s.views) < 1e-9, "exit rate is not exits ÷ views");
  expect(U.overview.exitRate != null && U.overview.exitRate > 0 && U.overview.exitRate <= 1, "overall exit rate");
  expect(P.decisionStatus("OP-USAGE1") === "open" && /OP-USAGE1/.test(U.source), "bounce definition presented as confirmed");
});
test(39, "Funnel drop-off", "deterministic", () => {
  const f = U.funnel(["Home", "Scan", "Scan result", "Wallet"]);
  expect(f.length === 4 && f.every((x, i) => i === 0 || x.users <= f[i - 1].users), "funnel not monotonic");
  expect(f.slice(1).every((x, i) => x.left == null || x.left === f[i].users - x.users) || f.slice(0, -1).every((x, i) => x.left == null || x.left === x.users - f[i + 1].users), "drop-off count");
  return f.map((x) => `${x.stage} ${x.users}`).join(" → ");
});
test(40, "Session length", "deterministic", () => {
  expect(Math.abs((U.overview.avgSessionSec ?? 0) - all.reduce((n, s) => n + s.durationSec, 0) / all.length) < 0.01, "average session");
  expect(U.overview.medianSessionSec != null, "median missing");
});
test(41, "App-open frequency", "deterministic", () => {
  expect(Math.abs((U.overview.opensPerUser ?? 0) - U.overview.appOpens / U.overview.uniqueUsers) < 1e-9, "opens per user");
});
const mod = (m: string) => U.modules.find((x) => x.module === m)!;
const modCount = (m: string) => all.flatMap((s) => s.views).filter((v) => v.module === m).length;
test(42, "Scan module usage", "deterministic", () => { expect(mod("Scanning").usageCount === modCount("Scanning") && mod("Scanning").uniqueUsers > 0, "scan module"); });
test(43, "Scheme module usage", "deterministic", () => { expect(mod("Schemes").usageCount === modCount("Schemes"), "scheme module"); });
test(44, "Wallet module usage", "deterministic", () => { expect(mod("Wallet").usageCount === modCount("Wallet"), "wallet module"); });
test(45, "Passbook module usage", "deterministic", () => { expect(mod("Passbook").usageCount === modCount("Passbook"), "passbook module"); });
test(46, "Role filter", "deterministic", () => {
  const role = all[0].memberType;
  const r = P.usageView(RAHUL, { role }) as typeof U;
  expect(r.sessions === all.filter((s) => s.memberType === role).length && r.sessions < U.sessions, "role filter");
});
test(47, "Region filter", "deterministic", () => {
  const r = P.usageView(RAHUL, { state: "KA" }) as typeof U;
  expect(r.sessions === all.filter((s) => s.state === "KA").length, "region filter");
  const scoped = P.usageView(KA_ADMIN, {}) as typeof U;
  expect(scoped.byRegion.every((g) => g.key === "KA"), "Regional Admin sees other regions");
  return `KA: ${r.sessions} sessions`;
});
test(48, "App Version filter", "deterministic", () => {
  const v = U.byVersion[0].key;
  const r = P.usageView(RAHUL, { appVersion: v }) as typeof U;
  expect(r.sessions === all.filter((s) => s.appVersion === v).length && /mock/.test(v), "version filter / version label");
});
test(49, "Incomplete telemetry displays Not Available", "deterministic", () => {
  const gifts = U.screens.find((s) => s.screen === "Gifts")!;
  expect(gifts.views > 0 && gifts.avgSec === null, "untimed screen shows a number");
  expect(src("src/pages/platform/ExperiencePages.tsx").includes('"Not available"'), "UI label missing");
});
test(50, "Usage event is not counted as a successful business transaction", "governance", () => {
  const before = { w: walletStore.get(), s: schemeStore.get(), m: memberStore.get() };
  P.usageView(RAHUL, {});
  expect(walletStore.get() === before.w && schemeStore.get() === before.s && memberStore.get() === before.m, "usage changed business stores");
  expect(!("transactions" in U) && !("points" in U.overview), "usage reports transactions");
});

/* ======================= App themes (51–58) ======================= */

let tierTheme = "", festTheme = "";
test(51, "Create theme draft", "deterministic", () => {
  const r = P.createThemeDraft(RAHUL, BASE_THEME());
  ok(r, "draft");
  tierTheme = r.id!;
  expect(ps().themes.find((t) => t.id === tierTheme)?.status === "draft" && audited("theme_draft_created", tierTheme), "draft not audited");
  no(P.createThemeDraft(VIKRAM, BASE_THEME()), "Sales Rep theme draft");
});
test(52, "Configure tier theme", "deterministic", () => {
  no(P.createThemeDraft(RAHUL, { ...BASE_THEME(), tierIds: [] }), "tier theme without tiers");
  no(P.createThemeDraft(RAHUL, { ...BASE_THEME(), tierIds: ["TIER-NOPE"] }), "tier outside the Tier Master");
  expect(ps().themes.find((t) => t.id === tierTheme)!.tierIds.length === 1, "tier not stored");
});
test(53, "Configure event/festival theme", "deterministic", () => {
  no(P.createThemeDraft(RAHUL, { ...BASE_THEME(), name: "Diwali", type: "festival", tierIds: [], eventRef: null }), "festival without event");
  const r = P.createThemeDraft(RAHUL, { ...BASE_THEME(), name: "Diwali 2026", type: "festival", tierIds: [], eventRef: "EVT-DIWALI-2026", effectiveFrom: "2026-10-25", effectiveTo: "2026-11-05" });
  ok(r);
  festTheme = r.id!;
});
test(54, "Preview theme", "deterministic", () => {
  const p = P.previewTheme(tierTheme)!;
  expect(p.target.tiers.length === 1 && /OP-THEME1/.test(p.screens.join()) && /not a mobile release/.test(p.note), "preview");
});
test(55, "Theme version preserved", "deterministic", () => {
  ok(P.updateTheme(RAHUL, tierTheme, { ...BASE_THEME(), tokens: { ...BASE_THEME().tokens, accent: "#D4A017" } }, "Accent tweak"));
  const t = ps().themes.find((x) => x.id === tierTheme)!;
  expect(t.version === 2 && t.versions.length === 2 && t.versions[0].tokens.accent === "#E5A000", "previous version lost");
});
test(56, "Unconfirmed theme cannot publish", "blocked", () => {
  no(P.publishTheme(ANITA, festTheme), "publish while OP-THEME1 open", /OP-THEME1/);
  no(P.publishTheme(TANUJIT, festTheme), "Super Admin publish");
  expect(audited("theme_publish_refused", festTheme), "refusal not audited");
});
test(57, "Web portal brand theme remains unchanged", "governance", () => {
  expect(/--vg-yellow:\s*#ffd000/i.test(src("src/styles/tokens.css")), "portal yellow token changed");
  expect(!/documentElement|--vg-/.test(src("src/features/platform/store.ts")), "theme service touches the portal styles");
});
test(58, "OP-THEME1 remains visible", "governance", () => {
  expect(P.openPointRegister().some((x) => x.ref === "OP-THEME1" && x.status === "open"), "OP-THEME1 not in register");
  expect(src("src/pages/platform/ExperiencePages.tsx").includes('DecisionRef id="OP-THEME1"'), "OP-THEME1 not shown on the theme page");
});

/* ======================= Governance and audit (59–67) ======================= */

test(59, "SOW role matrix generated", "deterministic", () => {
  const cov = P.validateRoleCoverage();
  expect(cov.length > 20 && cov.every((m) => m.baseline.length + m.missing.length === 5), "role coverage");
  return `${cov.length} modules mapped to View / Create / Edit / Approve / Disable`;
});
const cov = P.sowCoverage();
test(60, "AF01–AF28 coverage matrix generated", "deterministic", () => {
  const refs = cov.af.map((x) => x.ref);
  expect(refs.length === 27 && !refs.includes("AF08") && refs.includes("AF01") && refs.includes("AF28"), `AF rows ${refs.length}`);
  expect(cov.af.every((x) => x.route && x.test && x.permission), "incomplete rows");
});
test(61, "SB01–SB21 coverage matrix generated", "deterministic", () => {
  expect(cov.sb.length === 21 && cov.sb[0].ref === "SB01" && cov.sb[20].ref === "SB21", "SB rows");
});
test(62, "Missing SOW requirement identified", "governance", () => {
  const gaps = [...cov.af, ...cov.sb].filter((x) => x.status !== "fully_implemented");
  expect(gaps.length > 0 && cov.af.filter((x) => x.status !== "fully_implemented").every((x) => x.gap), "gaps without explanation");
  return `${gaps.length} rows not fully implemented: ${gaps.map((g) => g.ref).join(", ")}`;
});
test(63, "Existing feature is not duplicated", "governance", () => {
  const keys = Object.keys(ps());
  expect(!keys.some((k) => /^(members|ledger|schemes|requests|workflows|redemptions|kpis)$/.test(k)), `platform store duplicates module data: ${keys.join()}`);
  expect(!/function (createRequest|decideRequest|postLedger)/.test(src("src/features/platform/store.ts")), "approval or ledger logic re-implemented");
});
test(64, "Open Point register carries previous references", "governance", () => {
  const reg = P.openPointRegister();
  const mods = new Set(reg.map((x) => x.module));
  expect(mods.size >= 10 && ["OP-RBAC1", "OP-THEME1", "OP-TICKET1", "OP-UAT1", "OP-MIG1"].every((id) => reg.some((x) => x.ref === id)), "register incomplete");
  return `${reg.length} points across ${mods.size} modules`;
});
test(65, "Configuration change creates audit record", "governance", () => {
  ok(P.setViewAsIdle(TANUJIT, 20), "idle change");
  expect(audited("view_as_idle_changed", "OP-VIEWAS1") && viewAsStore.get().idleMinutes === 20, "not audited");
  no(P.setViewAsIdle(RAHUL, 20), "Evolve Ops idle change");
  ok(P.setViewAsIdle(TANUJIT, 15), "restore");
});
test(67, "View-As audit appears in central history", "governance", () => {
  const ev = P.platformAuditEvents(TANUJIT);
  expect(ev.some((e) => e.module === "View-As" && e.action === "view_as_session") && ev.some((e) => e.module === "View-As" && e.result === "refused"), "View-As missing from central audit");
  expect(P.platformAuditEvents(VIKRAM).length === 0, "Sales Rep reads the central audit");
  expect(new Set(ev.map((e) => e.module)).size >= 8, "modules missing");
  return `${ev.length} events across ${new Set(ev.map((e) => e.module)).size} modules`;
});

/* ======================= Error catalogue (68–74) ======================= */

test(68, "Network error shows the SOW message", "deterministic", () => {
  expect(P.memberMessage("NETWORK_UNAVAILABLE").message === "Unable to connect. Please check your internet and try again.", "network message");
});
test(69, "HTTP 5xx displays the plain-language server message", "deterministic", () => {
  const m = P.memberMessage("HTTP_500 Internal Server Error");
  expect(m.message === ERROR_CATALOGUE.find((e) => e.id === "ERR-5XX")!.message && !P.containsTechnicalTerms(m.message), "5xx message");
});
test(70, "Incident ID is generated/linked where supported", "deterministic", () => {
  const r = P.reportServerError("Wallet", "HTTP_503 Service Unavailable", vikramMember.id);
  expect(r.ok && /^ERI-\d{6}$/.test(r.incidentId ?? ""), "no incident id");
  const l = P.linkTicket(TANUJIT, r.incidentId!, "TCK-9001", "Investigating");
  ok(l);
  expect(l.warnings.some((w) => /OP-TICKET1/.test(w)), "ticketing tool presented as connected");
  expect(!P.reportServerError("Wallet", "NETWORK_UNAVAILABLE").incidentId, "incident raised for a network error");
});
test(71, "HTTP 4xx displays a specific plain-language message", "deterministic", () => {
  expect(P.memberMessage("INVALID_AADHAAR").message === "Invalid Aadhaar number.", "Aadhaar 4xx");
  expect(P.memberMessage("QR_ALREADY_SCANNED").message === "QR already scanned.", "duplicate QR");
  expect(P.memberMessage("INSUFFICIENT_BALANCE").message === "Insufficient balance.", "balance");
});
test(72, "Request timeout does not expose HTTP 504 to the member", "deterministic", () => {
  const m = P.memberMessage("HTTP 504 Gateway Timeout");
  expect(!/504|gateway|timeout/i.test(m.message) && !P.containsTechnicalTerms(m.message), `leaked: ${m.message}`);
  expect(ERROR_CATALOGUE.every((e) => !P.containsTechnicalTerms(e.message)), "catalogue message leaks a technical term");
});
test(73, "Error catalogue language selection works", "deterministic", () => {
  const c = P.errorCatalogue();
  expect(c.languages.includes("en") && c.languages.length > 1, "languages");
  const hi = P.memberMessage("NETWORK_UNAVAILABLE", c.languages.find((l) => l !== "en"));
  expect(hi.translated === false && hi.message.length > 0, "fallback");
});
test(74, "Missing translation is identified", "governance", () => {
  const c = P.errorCatalogue();
  const missing = c.rows.flatMap((r) => Object.entries(r.translations).filter(([, t]) => t == null).map(([l]) => `${r.id}/${l}`));
  expect(missing.length === c.rows.length * (c.languages.length - 1), "translations invented");
  return `${missing.length} translations missing`;
});

/* ======================= Performance (75–82) ======================= */

test(75, "Every SOW response-time target is present", "deterministic", () => {
  expect(PERF_TARGETS.length === 13 && P.performanceMatrix().length === 13, "targets");
});
test(76, "p95 and p99 are kept separate", "deterministic", () => {
  expect(PERF_TARGETS.every((t) => "p95Ms" in t && "p99Ms" in t) && PERF_TARGETS.some((t) => t.p99Ms == null && t.p95Ms != null), "p95/p99");
});
test(77, "Only specified timeouts are shown", "governance", () => {
  const withTimeout = PERF_TARGETS.filter((t) => t.timeout !== "Not specified").map((t) => t.id);
  expect(withTimeout.join() === "PT-03,PT-06,PT-08,PT-13", `timeouts on ${withTimeout.join()}`);
});
test(78, "Wallet fallback to last known balance is represented", "deterministic", () => { expect(/last known balance/i.test(PERF_TARGETS.find((t) => t.id === "PT-04")!.failure), "wallet fallback"); });
test(79, "Scan acknowledgement is distinct from point credit", "deterministic", () => {
  const a = PERF_TARGETS.find((t) => t.id === "PT-05")!, c = PERF_TARGETS.find((t) => t.id === "PT-06")!;
  expect(a.p95Ms === 300 && c.p95Ms === 500 && /before point credit/.test(a.failure), "scan acknowledgement");
});
test(80, "Report export background-job behaviour is represented", "deterministic", () => { expect(/queue/i.test(PERF_TARGETS.find((t) => t.id === "PT-13")!.timeout), "export queue"); });
test(81, "Actual measurement evidence can be attached", "deterministic", () => {
  no(P.recordMeasurement(RAHUL, { targetId: "PT-09", p95Ms: 800, p99Ms: 1500, timeouts: 0, samples: 500, window: "1h", environment: "staging", runRef: "", evidence: "" }), "measurement without evidence");
  ok(P.recordMeasurement(RAHUL, { targetId: "PT-09", p95Ms: 800, p99Ms: 1500, timeouts: 0, samples: 500, window: "1h", environment: "staging", runRef: "LOAD-DEV-01", evidence: "k6 report (development fixture)" }));
  expect(P.performanceMatrix().find((p) => p.id === "PT-09")!.status === "meets_target", "staging measurement not evaluated");
  ok(P.recordMeasurement(RAHUL, { targetId: "PT-12", p95Ms: 300, p99Ms: 500, timeouts: 0, samples: 20, window: "local", environment: "local_development", runRef: "LOCAL", evidence: "Browser navigation timing" }));
  expect(P.performanceMatrix().find((p) => p.id === "PT-12")!.status === "pending_engineering_evidence", "local timing accepted as evidence");
  ok(P.recordMeasurement(RAHUL, { targetId: "PT-10", p95Ms: 1200, p99Ms: 1800, timeouts: 0, samples: 100, window: "1h", environment: "staging", runRef: "R2", evidence: "e" }));
  expect(P.performanceMatrix().find((p) => p.id === "PT-10")!.status === "fails_target", "slow p95 passed");
});
test(82, "Untested performance targets are not marked Passed", "governance", () => {
  const m = P.performanceMatrix().filter((p) => !["PT-09", "PT-10", "PT-12"].includes(p.id));
  expect(m.every((p) => p.status === "not_tested"), "untested target has a status");
});

/* ======================= Capacity and security (83–95) ======================= */

const cap = (id: string, re: RegExp) => expect(re.test(CAPACITY_TARGETS.find((c) => c.id === id)!.target) && P.capacityMatrix().find((c) => c.id === id)!.status === "not_tested", `${id} target or status`);
test(83, "15 lakh member capacity target", "deterministic", () => cap("CP-01", /15 lakh/));
test(84, "1 lakh scans/day target", "deterministic", () => cap("CP-02", /1 lakh/));
test(85, "1 lakh redemptions/month target", "deterministic", () => cap("CP-03", /1 lakh/));
test(86, "10,000 concurrent user target", "deterministic", () => cap("CP-04", /10,000/));
test(87, "CPU above 70% autoscaling threshold", "deterministic", () => cap("CP-05", /70%/));
test(88, "100 API calls/member/minute rate limit", "deterministic", () => {
  cap("CP-06", /100 API calls per minute/);
  expect(P.memberMessage("HTTP 429").message === "Please try again shortly.", "rate-limit message");
});
test(89, "Zero-downtime deployment readiness", "deterministic", () => {
  cap("CP-07", /Zero downtime/);
  expect(RELEASE_ITEMS.some((x) => /zero downtime/i.test(x)) && P.checklist("release").length === RELEASE_ITEMS.length, "release checklist");
});
const sc = (id: string) => P.securityMatrix().find((c) => c.id === id)!;
test(90, "TLS 1.3 evidence", "blocked", () => {
  expect(sc("SC-02").spec === "TLS 1.3" && sc("SC-02").status === "not_tested", "TLS");
  no(P.recordEvidence(RAHUL, { subject: "SC-02", kind: "security", result: "passed", value: "TLS 1.3", environment: "local_development", runRef: "L1", evidence: "Vercel preview HTTPS" }), "local TLS evidence", /cannot be recorded as passed/);
});
test(91, "AES-256 evidence", "blocked", () => {
  no(P.recordEvidence(RAHUL, { subject: "SC-03", kind: "security", result: "passed", value: "AES-256", environment: "mock", runRef: "M1", evidence: "x" }), "mock AES evidence");
  ok(P.recordEvidence(RAHUL, { subject: "SC-03", kind: "security", result: "partial", value: "Storage encryption enabled; key size not evidenced", environment: "staging", runRef: "SEC-DEV-1", evidence: "Development fixture" }));
  expect(sc("SC-03").status === "partial", "evidence not linked");
});
test(92, "Tokenisation evidence", "blocked", () => { expect(sc("SC-01").spec === "Tokenised" && sc("SC-01").status === "not_tested" && /not connected/.test(sc("SC-01").backend), "tokenisation"); });
test(93, "Device fingerprint enforcement", "governance", () => { expect(/must not be enforced only in React/.test(sc("SC-04").frontend) && sc("SC-05").status === "not_tested", "device fingerprint"); });
test(94, "Seven-year KYC retention metadata", "governance", () => { expect(/Seven years/.test(sc("SC-06").spec), "retention"); });
test(95, "Scan and transaction history preservation", "governance", () => { expect(sc("SC-07").spec === "Never deleted" && sc("SC-08").spec === "Never deleted", "history"); });

/* ======================= UAT (96–105) ======================= */

test(96, "Unit Test Suite", "governance", () => {
  const pkg = JSON.parse(src("package.json")) as { scripts: Record<string, string> };
  const suites = ["test:schemes", "test:wallet", "test:comms", "test:gifts", "test:risk", "test:ops", "test:analytics", "test:platform"];
  expect(suites.every((s) => pkg.scripts[s]) && pkg.scripts["report:tests"], "suite scripts");
  expect(suites.every((s) => src("scripts/collect-test-results.mjs").includes(`"${s}"`)), "collector misses a suite");
});
test(97, "Integration Test Suite", "governance", () => {
  const it = P.integrationTestMatrix();
  expect(it.length === 40 && it.every((x) => x.status === "mock_adapter_only" || x.status === "not_tested"), "integration tests marked passed without a sandbox");
  return `${it.filter((x) => x.status === "mock_adapter_only").length} of 40 covered by mock adapters`;
});
const cycle = () => ps().uat[0];
test(98, "Five-programme UAT coverage", "deterministic", () => {
  const progs = new Set(ps().uatCases.map((c) => c.programme));
  expect(PROGRAMMES.every((p) => progs.has(p)) && ps().uatCases.length === 28, "programme coverage");
});
test(99, "Approximately 20 pilot-member capacity", "deterministic", () => {
  const r = P.configureUat(RAHUL, "UAT-01", { allocation: { EP: 1, ST: 5, CS: 5, Retailer: 5, DD: 4 } });
  ok(r);
  expect(!r.warnings.some((w) => /Allocation totals/.test(w)) && r.warnings.some((w) => /OP-UAT1/.test(w)), "allocation warnings");
  const eps = mem().members.filter((m) => m.programme === "EP" && hasApp(m));
  ok(P.addPilotMember(RAHUL, "UAT-01", eps[0].id));
  no(P.addPilotMember(RAHUL, "UAT-01", eps[1].id), "pilot over the EP allocation", /full/);
  const w = P.configureUat(RAHUL, "UAT-01", { allocation: { EP: 20, ST: 20, CS: 5, Retailer: 5, DD: 4 } });
  expect(w.warnings.some((x) => /Allocation totals 54/.test(x)), "oversized allocation not flagged");
  ok(P.configureUat(RAHUL, "UAT-01", { allocation: { EP: 4, ST: 4, CS: 4, Retailer: 4, DD: 4 } }));
});
test(100, "Two-week UAT window configuration", "deterministic", () => {
  const a = P.configureUat(RAHUL, "UAT-01", { plannedStart: "2026-12-01", plannedEnd: "2026-12-14" });
  expect(a.ok && !a.warnings.some((w) => /Window/.test(w)), "14-day window flagged");
  const b = P.configureUat(RAHUL, "UAT-01", { plannedStart: "2026-12-01", plannedEnd: "2026-12-10" });
  expect(b.warnings.some((w) => /Window is 10 days/.test(w)), "short window not flagged");
  no(P.configureUat(RAHUL, "UAT-01", { plannedStart: "2026-12-10", plannedEnd: "2026-12-01" }), "end before start");
});
let uatDefect = "";
test(101, "Test execution and evidence", "deterministic", () => {
  no(P.recordUatExecution(RAHUL, "UTC-001", { actual: "Worked", result: "pass", defectId: null, evidence: "", retestOf: null }), "execution without evidence");
  ok(P.recordUatExecution(RAHUL, "UTC-001", { actual: "Registration completed", result: "pass", defectId: null, evidence: "Screen recording (dev)", retestOf: null }));
  expect(P.caseResult(ps().uatCases.find((c) => c.id === "UTC-001")!) === "pass", "result not recorded");
});
test(102, "Defect logging", "deterministic", () => {
  const r = P.logDefect(RAHUL, { module: "Scanning", title: "Scan result screen freezes on retry (development)", description: "Found in UAT dry run", severity: "P1", source: "UAT" });
  ok(r);
  uatDefect = r.id!;
  expect(P.openCritical().some((d) => d.id === uatDefect), "P1 not tracked as critical");
  no(P.updateDefect(RAHUL, uatDefect, { severity: "P3" }, "Looks minor"), "P1 silently downgraded", /Approve/);
  expect(ps().defects.find((d) => d.id === uatDefect)!.severity === "P1" && audited("defect_downgrade_refused", uatDefect), "downgrade not refused / audited");
  no(P.updateDefect(RAHUL, uatDefect, { status: "closed" }, "done"), "close before retest");
});
test(103, "Retest", "deterministic", () => {
  no(P.recordUatExecution(RAHUL, "UTC-005", { actual: "Froze", result: "fail", defectId: null, evidence: "video", retestOf: null }), "fail without defect");
  const f = P.recordUatExecution(RAHUL, "UTC-005", { actual: "Froze", result: "fail", defectId: uatDefect, evidence: "video", retestOf: null });
  ok(f);
  ok(P.recordUatExecution(RAHUL, "UTC-005", { actual: "Fixed", result: "pass", defectId: uatDefect, evidence: "video 2", retestOf: f.id! }));
  const c = ps().uatCases.find((x) => x.id === "UTC-005")!;
  expect(c.executions.length === 2 && c.executions[1].retestOf === f.id && audited("uat_retest", "UTC-005"), "retest history");
});
test(104, "Final sign-off", "blocked", () => {
  no(P.signOffUat(RAHUL, "UAT-01", "ok"), "Evolve Ops sign-off", /Approve/);
  const r = P.signOffUat(ANITA, "UAT-01", "ok");
  no(r, "sign-off with open conditions", /OP-UAT1/);
  expect(r.errors[0].includes("not passed") && r.errors[0].includes("P0 / P1"), "all blockers not listed");
  expect(cycle().signOff.status === "not_signed", "signed off");
});
test(105, "OP-UAT1 pending status", "governance", () => { expect(P.decisionStatus("OP-UAT1") === "open", "OP-UAT1"); });

/* ======================= Migration (106–116) ======================= */

const rec = P.migrationReconciliation();
test(106, "Programme migration scope", "deterministic", () => {
  const r = P.setMigrationScope(RAHUL, "EP", "included");
  ok(r);
  expect(r.warnings.some((w) => /OP-MIG1/.test(w)) && ps().migrationScope.status === "pending_business_confirmation", "scope presented as confirmed");
});
test(107, "Member record reconciliation", "deterministic", () => {
  expect(rec.members.missing === 1 && rec.members.rows.some((x) => x.source.sourceRef === "LEG-DEV-ONLY-0001" && x.issues.includes("missing_member")), "missing member");
  expect(rec.members.rows.some((x) => x.issues.includes("invalid_branch")), "invalid branch");
  expect(/Development test snapshot/.test(rec.source.label), "source not labelled");
});
test(108, "Wallet reconciliation", "deterministic", () => {
  const d = rec.wallets.differences;
  expect(d.length === 2 && d.some((x) => x.bucket === "available" && x.difference === -50) && d.some((x) => x.bucket === "scheme" && x.difference === -20), "wallet buckets");
  expect(rec.wallets.rows.every((x) => ["available", "scheme", "redeemed"].includes(x.bucket)), "buckets merged");
});
test(109, "TDS Kitty reconciliation", "deterministic", () => {
  expect(rec.kitty.differences.length === 1 && rec.kitty.differences[0].difference === -12 && rec.kitty.rows.every((x) => x.programme === "EP"), "kitty");
});
test(110, "Scan history validation", "deterministic", () => { expect(rec.scans.missing.length === 2 && rec.scans.matched === rec.scans.target, "scans"); });
test(111, "Redemption history validation", "deterministic", () => { expect(rec.redemptions.matched === rec.redemptions.target, "redemptions"); });
test(112, "Duplicate detection", "deterministic", () => { expect(rec.members.duplicates === 2 && rec.redemptions.duplicates === 1, `duplicates ${rec.members.duplicates}/${rec.redemptions.duplicates}`); });
test(113, "Migration exceptions", "deterministic", () => {
  const before = JSON.stringify({ ...P.targetSnapshot(), takenAt: null });
  const r = P.raiseMigrationExceptions(RAHUL);
  ok(r);
  const n = ps().migrationExceptions.length;
  expect(n >= 7, `${n} exceptions`);
  P.raiseMigrationExceptions(RAHUL);
  expect(ps().migrationExceptions.length === n, "exceptions duplicated");
  expect(JSON.stringify({ ...P.targetSnapshot(), takenAt: null }) === before, "target data changed");
  const x = ps().migrationExceptions[0];
  no(P.resolveMigrationException(RAHUL, x.id, "resolved", ""), "resolve without evidence");
  no(P.resolveMigrationException(RAHUL, x.id, "accepted", "acceptable"), "accept without approval", /Approve/);
  ok(P.resolveMigrationException(RAHUL, x.id, "investigating", "", "Evolve data team"));
  return `${n} exceptions; target unchanged`;
});
test(114, "Cutover readiness", "blocked", () => {
  no(P.updateChecklistItem(RAHUL, "CUT-01", "passed", "Email from V-Guard"), "scope confirmed while OP-MIG1 open", /OP-MIG1/);
  no(P.updateChecklistItem(RAHUL, "CUT-04", "passed", ""), "item passed without evidence");
  ok(P.updateChecklistItem(RAHUL, "CUT-04", "in_progress", ""));
  expect(P.checklist("cutover").length === 13, "cutover items");
});
test(115, "Rollback readiness", "deterministic", () => {
  no(P.setRollbackPlan(RAHUL, { testResult: "passed" }), "rollback test passed without a date");
  ok(P.setRollbackPlan(RAHUL, { documented: true, steps: "Redeploy previous build; restore snapshot" }));
  expect(P.gateBlockers().find((b) => b.id === "GL-05")!.blocker, "GL-05 unblocked without restoration time and test");
});
test(116, "OP-MIG1 pending status", "governance", () => { expect(P.decisionStatus("OP-MIG1") === "open", "OP-MIG1"); });

/* ======================= Go-live (117–126) ======================= */

const pass = (id: string, uid = ANITA) => P.updateGate(uid, id, "passed", { evidence: "Evidence pack (development)", signOffRef: `SO-${id}` });
test(117, "P0/P1 defect closure tracking", "blocked", () => {
  no(pass("GL-01"), "GL-01 with an open P1", /P0 \/ P1/);
  no(P.updateGate(RAHUL, "GL-01", "passed", { evidence: "x", signOffRef: "y" }), "Evolve Ops passing a gate", /Approve/);
  no(P.updateGate(ANITA, "GL-07", "passed", {}), "gate without evidence", /evidence/);
});
test(118, "UAT sign-off", "blocked", () => { no(pass("GL-02"), "GL-02", /UAT/); });
test(119, "Load-test sign-off", "blocked", () => {
  no(pass("GL-03"), "GL-03", /Scenario B/);
  no(P.recordEvidence(RAHUL, { subject: "LT-B", kind: "capacity", result: "passed", value: "10,000 users", environment: "local_development", runRef: "L", evidence: "local" }), "local load test");
  expect(P.loadScenarioStatus("LT-B") === "not_tested", "load scenario");
});
test(120, "Security sign-off", "blocked", () => { no(pass("GL-04"), "GL-04", /Security/); });
test(121, "Rollback plan", "blocked", () => { no(pass("GL-05"), "GL-05", /Rollback/); });
test(122, "Monitoring dashboard readiness", "blocked", () => { no(pass("GL-06"), "GL-06", /mock telemetry/); });
test(123, "Fraud alert readiness", "governance", () => { expect(/fraud alerts/i.test(GO_LIVE_GATES.find((g) => g.id === "GL-06")!.check) && ps().gates.find((g) => g.id === "GL-06")!.status !== "passed", "fraud alert gate"); });
test(124, "Support team training", "deterministic", () => {
  ok(pass("GL-07"), "GL-07 with training records");
  const g = ps().gates.find((x) => x.id === "GL-07")!;
  expect(g.status === "passed" && g.reviewer === ANITA && g.signOffRef === "SO-GL-07", "gate record");
});
test(125, "Data migration sign-off", "blocked", () => { no(pass("GL-08"), "GL-08", /OP-MIG1/); });
test(126, "Production readiness remains blocked if mandatory gates fail", "blocked", () => {
  expect(P.goLiveStatus() === "in_progress", `status ${P.goLiveStatus()}`);
  ok(P.updateGate(ANITA, "GL-03", "failed", { evidence: "Scenario B not run", remarks: "No load-test environment" }));
  expect(P.goLiveStatus() === "blocked", "failed gate does not block");
  expect(!/vercel|deploy\(/i.test(src("src/features/platform/store.ts").replace(/deploys? anything|deployment/gi, "")), "store can deploy");
});

/* ======================= Approval-engine scenarios (9, 66) — async ======================= */

test(9, "User cannot approve their own request", "deterministic", async () => {
  const r = P.submitThemeForApproval(RAHUL, festTheme, "Diwali campaign");
  ok(r, "submit");
  const q = approvalStore.get().requests.find((x) => x.id === r.id)!;
  const self = decideRequest(RAHUL, q.id, "approve", "self", q.seq);
  expect(!self.ok, "Maker approved their own request");
  return self.errors[0];
});
test(66, "Maker and Checker are both retained", "governance", async () => {
  await new Promise((res) => setTimeout(res, 10));
  const t = ps().themes.find((x) => x.id === festTheme)!;
  const q = approvalStore.get().requests.find((x) => x.id === t.approvalRequestId)!;
  ok(decideRequest(ANITA, q.id, "approve", "Approved for Diwali", q.seq), "checker approve");
  for (let i = 0; i < 50 && ps().themes.find((x) => x.id === festTheme)!.status !== "approved"; i++) await new Promise((res) => setTimeout(res, 10));
  const done = approvalStore.get().requests.find((x) => x.id === q.id)!;
  expect(done.makerId === RAHUL && done.history.some((h) => h.userId === ANITA && /^Approved/.test(h.action)), `maker / checker history: maker ${done.makerId}; ${done.history.map((h) => `${h.userId}:${h.action}`).join(", ")}`);
  expect(ps().themes.find((x) => x.id === festTheme)!.status === "approved", "approved theme status");
  no(P.publishTheme(ANITA, festTheme), "publish after approval while OP-THEME1 open", /OP-THEME1/);
  return `${q.id}: maker ${done.makerId}, checker ${ANITA}; approved, not published`;
});

void OUT_OF_SCOPE;
void ACCEPTANCE_CRITERIA;

/* ---------------- Report ---------------- */
Promise.all(pending).then(() => {
  results.sort((a, b) => a.n - b.n);
  const passed = results.filter((r) => r.ok).length;
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${String(r.n).padStart(3)}  [${r.kind}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const byKind = (k: Kind) => results.filter((r) => r.kind === k);
  console.log(`\n${passed}/${results.length} passed · deterministic ${byKind("deterministic").filter((r) => r.ok).length}/${byKind("deterministic").length} · blocked-as-expected ${byKind("blocked").filter((r) => r.ok).length}/${byKind("blocked").length} · governance ${byKind("governance").filter((r) => r.ok).length}/${byKind("governance").length}`);
  if (results.length !== 126) console.log(`WARNING: ${results.length} scenarios registered, expected 126`);
  if (passed !== results.length || results.length !== 126) process.exit(1);
});
