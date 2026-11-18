/**
 * COMMUNICATION ENGINE — pure functions (Phase 8).
 * Audience resolution, template validation and rendering, composition checks, dispatch planning with
 * idempotency keys, mock provider outcomes, WhatsApp → SMS fallback, delivery aggregation, SLA status
 * and WhatsApp-bot safety. Nothing here sends a message: providers are mock adapters.
 */
import { BOT_ACTION, CHANNEL, CHANNEL_LIMITS, DEEP_LINKS, SMS_SEGMENT, VARIABLES } from "@/config/commsCatalogue";
import { findBranch } from "@/config/geography";
import { hash01 } from "@/data/mock/random";
import { activeRestrictions, redemptionEligibility, redemptionGaps, scanEligibility, type MemberState } from "@/features/members/engine";
import type { Member } from "@/types/members";
import type { AttemptStatus, AudienceFilter, BotMenu, Channel, Communication, CommsState, DeliveryAttempt, HelpdeskQuery, LangCode, MessageTemplate, NotificationEntry, NotificationId, SlaPolicy, TemplateVersion } from "@/types/comms";

export const EMPTY_FILTER: AudienceFilter = { programmes: [], states: [], districts: [], branches: [], memberIds: [], roles: [], statuses: [] };

/** Development language preference: derived from the member's state until the app supplies it. */
const STATE_LANG: Record<string, LangCode> = { KL: "ml", TN: "ta", KA: "kn", AP: "te", TS: "te", MH: "mr", WB: "bn", OD: "hi", GJ: "hi", DL: "hi", UP: "hi" };
export const langOf = (m: Member): LangCode => STATE_LANG[findBranch(m.branchCode)?.state.code ?? ""] ?? "en";

/** Contact availability per channel (development rules: WhatsApp reachability is simulated). */
export function contactOf(m: Member, ch: Channel): { ok: boolean; reason: string } {
  const digits = m.mobile.replace(/\D/g, "");
  switch (ch) {
    case "sms": return digits.length >= 10 ? { ok: true, reason: "" } : { ok: false, reason: "No valid mobile" };
    case "whatsapp": return digits.length < 10 ? { ok: false, reason: "No valid mobile" } : hash01(m.id + "wa") < 0.08 ? { ok: false, reason: "Mobile not on WhatsApp (mock)" } : { ok: true, reason: "" };
    case "email": return m.email ? { ok: true, reason: "" } : { ok: false, reason: "No email on record" };
    case "push": return m.registration.firstLoginAt ? { ok: true, reason: "" } : { ok: false, reason: "App not installed / never logged in" };
    case "inapp": return ["pending", "rejected", "invited"].includes(m.status) ? { ok: false, reason: "No member app account yet" } : { ok: true, reason: "" };
  }
}

export const maskContact = (v: string | null) => (!v ? "—" : v.includes("@") ? `${v[0]}•••@${v.split("@")[1]}` : `+91 •••••${v.replace(/\D/g, "").slice(-4)}`);

/* ======================= Audience ======================= */

export interface AudienceResult {
  included: Member[];
  excluded: { id: string; reason: string }[];
  byProgramme: Record<string, number>;
  byState: Record<string, number>;
  byLang: Record<string, number>;
  noChannel: Record<Channel, number>;
  outOfScope: number;
}

const STATUS_TEST: Record<AudienceFilter["statuses"][number], (mem: MemberState, m: Member) => boolean> = {
  active: (mem, m) => scanEligibility(mem, m).allowed,
  pending_kyc: (mem, m) => m.programme !== "Retailer" && m.programme !== "DD" && ["active_scan", "redemption_kyc_pending"].includes(m.status) && redemptionGaps(mem, m).length > 0,
  redemption_eligible: (mem, m) => redemptionEligibility(mem, m).allowed,
  scan_enabled: (mem, m) => scanEligibility(mem, m).allowed,
};

/**
 * Resolves an audience against the member master, inside the viewer's scope. Members outside the
 * scope are never included and are counted separately; no contact data leaves this function.
 */
export function resolveAudience(mem: MemberState, f: AudienceFilter, inScope: (m: Member) => boolean, channels: Channel[] = []): AudienceResult {
  const r: AudienceResult = { included: [], excluded: [], byProgramme: {}, byState: {}, byLang: {}, noChannel: { whatsapp: 0, sms: 0, email: 0, push: 0, inapp: 0 }, outOfScope: 0 };
  const ids = new Set(f.memberIds.map((x) => x.trim()).filter(Boolean));
  for (const id of ids) if (!mem.members.some((m) => m.id === id)) r.excluded.push({ id, reason: "Unknown member reference" });
  for (const m of mem.members) {
    const b = findBranch(m.branchCode);
    if (ids.size && !ids.has(m.id)) continue;
    if (f.programmes.length && !f.programmes.includes(m.programme)) continue;
    if (f.states.length && !f.states.includes(b?.state.code ?? "")) continue;
    if (f.districts.length && !f.districts.includes(b?.district.code ?? "")) continue;
    if (f.branches.length && !f.branches.includes(m.branchCode)) continue;
    if (f.roles.length && !f.roles.includes(m.memberType)) continue;
    if (f.statuses.length && !f.statuses.every((s) => STATUS_TEST[s](mem, m))) continue;
    if (!inScope(m)) {
      r.outOfScope++;
      r.excluded.push({ id: m.id, reason: "Outside your programme / geography scope" });
      continue;
    }
    if (m.status === "rejected") {
      r.excluded.push({ id: m.id, reason: "Registration rejected" });
      continue;
    }
    if (activeRestrictions(mem, m).some((x) => x.type === "temporary_hold") && !f.statuses.length) {
      // Members on hold still receive transactional / status messages; campaigns exclude them.
      r.excluded.push({ id: m.id, reason: "Temporary hold: excluded from campaigns" });
      continue;
    }
    r.included.push(m);
    r.byProgramme[m.programme] = (r.byProgramme[m.programme] ?? 0) + 1;
    r.byState[b?.state.code ?? "—"] = (r.byState[b?.state.code ?? "—"] ?? 0) + 1;
    r.byLang[langOf(m)] = (r.byLang[langOf(m)] ?? 0) + 1;
    for (const ch of channels) if (!contactOf(m, ch).ok) r.noChannel[ch]++;
  }
  return r;
}

/* ======================= Templates ======================= */

export const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;
export const varsIn = (text: string) => Array.from(new Set(Array.from(text.matchAll(VAR_RE)).map((x) => x[1])));
export const render = (text: string, vars: Record<string, string | number | null | undefined>) => text.replace(VAR_RE, (_, k: string) => (vars[k] == null ? `{{${k}}}` : String(vars[k])));
export const deepLinkOk = (link: string | null) => !link || DEEP_LINKS.some((d) => d.id === link);
export const activeVersion = (t: MessageTemplate): TemplateVersion | undefined => t.versions.find((v) => v.version === t.activeVersion);
export const latestVersion = (t: MessageTemplate): TemplateVersion => t.versions[t.versions.length - 1];

export interface Check {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Validates one template version for a channel, a notification's variable registry and the required languages. */
export function validateTemplate(t: Pick<MessageTemplate, "channel" | "notificationId">, v: Pick<TemplateVersion, "translations" | "deepLink" | "providerApproval">, languages: LangCode[]): Check {
  const errors: string[] = [];
  const warnings: string[] = [];
  const registry = VARIABLES[t.notificationId ?? "manual"];
  const allowed = new Set(registry.map((x) => x.name));
  const base = v.translations.find((x) => x.lang === "en");
  if (!base || !base.body.trim()) errors.push("English base content is required");
  for (const tr of v.translations.filter((x) => x.status !== "missing")) {
    const text = `${tr.subject} ${tr.title} ${tr.body}`;
    const bad = varsIn(text).filter((x) => !allowed.has(x));
    if (bad.length) errors.push(`${tr.lang}: unsupported variable(s) ${bad.map((b) => `{{${b}}}`).join(", ")}. Use the approved variable registry`);
    const lim = CHANNEL_LIMITS[t.channel];
    if (tr.body.length > lim.body) errors.push(`${tr.lang}: body is ${tr.body.length} characters; ${CHANNEL[t.channel].label} allows ${lim.body} (${lim.note})`);
    if (lim.title && tr.title.length > lim.title) errors.push(`${tr.lang}: title is ${tr.title.length} characters; limit ${lim.title}`);
    if (t.channel === "sms" && tr.body.length > SMS_SEGMENT) warnings.push(`${tr.lang}: ${Math.ceil(tr.body.length / SMS_SEGMENT)} SMS segments`);
    if (t.channel === "email" && !tr.subject.trim()) errors.push(`${tr.lang}: email subject is required`);
    if ((t.channel === "push" || t.channel === "inapp") && !tr.title.trim()) errors.push(`${tr.lang}: title is required for ${CHANNEL[t.channel].label}`);
  }
  if (base) {
    const used = new Set(varsIn(`${base.subject} ${base.title} ${base.body}`));
    const missing = registry.filter((x) => x.required && !used.has(x.name));
    if (missing.length) errors.push(`Missing required variable(s): ${missing.map((x) => `{{${x.name}}}`).join(", ")}`);
  }
  for (const lang of languages) {
    const tr = v.translations.find((x) => x.lang === lang);
    if (!tr || tr.status === "missing" || !tr.body.trim()) errors.push(`Missing translation: ${lang}`);
    else if (tr.status === "needs_review") warnings.push(`${lang}: development translation, needs linguistic review`);
  }
  if (!deepLinkOk(v.deepLink)) errors.push(`Deep link ${v.deepLink} is not in the approved deep-link catalogue`);
  if (t.channel === "whatsapp" && v.providerApproval !== "approved") errors.push(`WhatsApp template is ${v.providerApproval === "pending" ? "awaiting provider approval" : "not approved by the provider"}`);
  return { ok: errors.length === 0, errors, warnings };
}

/* ======================= Composition ======================= */

export interface CompositionCheck extends Check {
  audience: AudienceResult;
}

export function validateComposition(cs: CommsState, mem: MemberState, c: Communication, inScope: (m: Member) => boolean, now: string): CompositionCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!c.name.trim()) errors.push("Give the communication a name");
  if (!c.purpose.trim()) errors.push("State the business purpose");
  if (!c.channels.length) errors.push("Choose at least one channel");
  if (!c.languages.length) errors.push("Choose at least one language");
  const entry = c.notificationId ? cs.catalogue.find((e) => e.id === c.notificationId) : undefined;
  if (entry && !entry.enabled) errors.push(`${entry.id} is disabled in the Notification Catalogue`);
  if (c.mode === "rule") errors.push("Rule-based messages are configured as automated rules on a catalogue event, not composed for an audience");
  if (c.mode === "manual" && !c.justification.trim()) errors.push("Business justification is required for a manual communication");
  if (c.mode === "scheduled" || c.scheduledAt) {
    if (!c.scheduledAt) errors.push("Choose the schedule date and time");
    else if (c.scheduledAt <= now) errors.push("The schedule must be in the future");
  }
  if (c.notificationId === "N10") {
    const cad = cs.catalogue.find((e) => e.id === "N10")?.cadenceDays;
    if (cad == null) errors.push("N10 reminder cadence is not configured (CD-08). Configure it in the Notification Catalogue first");
  }
  if (c.notificationId === "N06" && !(c.deepLink?.startsWith("rishta://survey/") || /survey/i.test(c.manualContent?.body ?? ""))) errors.push("N06 needs a valid survey reference or link");
  if (!deepLinkOk(c.deepLink)) errors.push(`Deep link ${c.deepLink} is not approved`);
  const audience = resolveAudience(mem, c.audience, inScope, c.channels);
  if (!audience.included.length) errors.push("The audience is empty");
  if (audience.excluded.some((x) => x.reason === "Unknown member reference")) errors.push(`Unknown member reference(s): ${audience.excluded.filter((x) => x.reason === "Unknown member reference").map((x) => x.id).join(", ")}`);
  if (audience.outOfScope) warnings.push(`${audience.outOfScope} member(s) match the filter but are outside your scope and will not be messaged`);
  for (const ch of c.channels) if (audience.noChannel[ch]) warnings.push(`${audience.noChannel[ch]} recipient(s) have no ${CHANNEL[ch].label} contact`);
  // Templates per channel
  const templates = c.templateIds.map((id) => cs.templates.find((t) => t.id === id)).filter(Boolean) as MessageTemplate[];
  if (c.manualContent) {
    const bad = varsIn(`${c.manualContent.subject} ${c.manualContent.title} ${c.manualContent.body}`).filter((x) => !VARIABLES.manual.some((v) => v.name === x));
    if (!c.manualContent.body.trim()) errors.push("Message content is empty");
    if (bad.length) errors.push(`Unsupported variable(s): ${bad.map((b) => `{{${b}}}`).join(", ")}`);
    if (c.channels.includes("whatsapp")) errors.push("WhatsApp needs a provider-approved template: free-text manual content cannot go to WhatsApp");
    if (c.languages.some((l) => l !== "en")) errors.push("Free-text content exists in English only: remove other languages or use a localised template");
  } else {
    for (const ch of c.channels) {
      const t = templates.find((x) => x.channel === ch);
      if (!t) {
        errors.push(`No template selected for ${CHANNEL[ch].label}`);
        continue;
      }
      const v = activeVersion(t);
      if (!v) {
        errors.push(`${t.id} has no active (approved) version`);
        continue;
      }
      const tv = validateTemplate(t, v, c.languages);
      errors.push(...tv.errors.map((e) => `${t.id} (${CHANNEL[ch].label}): ${e}`));
      warnings.push(...tv.warnings.map((e) => `${t.id}: ${e}`));
    }
  }
  return { ok: errors.length === 0, errors, warnings, audience };
}

/* ======================= Dispatch (mock providers) ======================= */

/** Deterministic mock provider outcome. Accepted requests are not delivered until a callback says so. */
export function mockOutcome(key: string, ch: Channel): AttemptStatus {
  if (ch === "inapp") return "published";
  const h = hash01(key);
  const fail = { whatsapp: 0.1, sms: 0.05, email: 0.06, push: 0.12 }[ch];
  const pending = { whatsapp: 0.08, sms: 0.06, email: 0.18, push: 0.15 }[ch];
  if (h < fail) return "failed";
  if (h < fail + pending) return "dispatched";
  return "delivered";
}

export interface Recipient {
  id: string;
  kind: "member" | "staff";
  member: Member | null;
  lang: LangCode;
}

/**
 * Plans attempts for recipients × channels. WhatsApp failure or unavailability falls back to SMS only
 * when the notification is flagged critical (smsFallback). Every attempt carries an idempotency key.
 */
export function planAttempts(commId: string, recipients: Recipient[], channels: Channel[], templateFor: (ch: Channel) => { id: string | null; version: number | null }, entry: NotificationEntry | undefined, at: string, seq0: number): DeliveryAttempt[] {
  const out: DeliveryAttempt[] = [];
  let seq = seq0;
  const mk = (r: Recipient, ch: Channel, status: AttemptStatus, response: string, fallbackOf: string | null, error: string | null): DeliveryAttempt => {
    const t = templateFor(ch);
    const key = `${commId}|${r.id}|${ch}|1`;
    return { id: `DLV-${String(++seq).padStart(7, "0")}`, commId, recipientId: r.id, recipientKind: r.kind, programme: r.member?.programme ?? null, channel: ch, lang: r.lang, templateId: t.id, templateVersion: t.version, attempt: 1, idempotencyKey: key, providerRef: status === "provider_error" ? null : `MOCK-${ch.toUpperCase()}-${String(Math.floor(hash01(key) * 1e8)).padStart(8, "0")}`, providerResponse: response, status, fallbackOf, error, at, updatedAt: at, callbacks: status === "delivered" || status === "failed" ? [{ id: `CB-${seq}`, at, status, duplicate: false }] : [] };
  };
  for (const r of recipients) {
    for (const ch of channels) {
      if (r.kind === "staff" && ch !== "email" && ch !== "whatsapp") continue;
      const contact = r.member ? contactOf(r.member, ch) : { ok: true, reason: "" };
      let a: DeliveryAttempt;
      if (!contact.ok) a = mk(r, ch, "provider_error", "Not sent: recipient has no contact for this channel", null, contact.reason);
      else {
        const st = mockOutcome(`${commId}|${r.id}|${ch}`, ch);
        a = mk(r, ch, st, st === "published" ? "Written to the inbox service (mock)" : "Accepted by mock provider", null, st === "failed" ? "Mock provider reported a delivery failure" : null);
      }
      out.push(a);
      if (ch === "whatsapp" && entry?.smsFallback && !channels.includes("sms") && (a.status === "failed" || a.status === "provider_error") && r.member) {
        const c2 = contactOf(r.member, "sms");
        const st = c2.ok ? mockOutcome(`${commId}|${r.id}|sms`, "sms") : "provider_error";
        out.push(mk(r, "sms", st, c2.ok ? `SMS fallback after WhatsApp ${a.status.replace("_", " ")}` : "Fallback not possible", a.id, c2.ok ? (st === "failed" ? "Mock provider reported a delivery failure" : null) : c2.reason));
      }
    }
  }
  return out;
}

export function overallStatus(attempts: DeliveryAttempt[]): Communication["status"] {
  const primary = attempts.filter((a) => !a.fallbackOf);
  if (!primary.length) return "sent";
  const ok = (a: DeliveryAttempt) => a.status === "delivered" || a.status === "published" || attempts.some((f) => f.fallbackOf === a.id && f.status === "delivered");
  const bad = (a: DeliveryAttempt) => (a.status === "failed" || a.status === "provider_error") && !attempts.some((f) => f.fallbackOf === a.id && f.status === "delivered");
  if (primary.every(ok)) return "delivered";
  if (primary.every(bad)) return "failed";
  if (primary.some((a) => a.status === "dispatched" || a.status === "accepted" || a.status === "queued")) return primary.some(bad) ? "partially_delivered" : "sent";
  return "partially_delivered";
}

export function channelSummary(attempts: DeliveryAttempt[]) {
  const s: Record<Channel, { attempted: number; delivered: number; failed: number; pending: number }> = { whatsapp: { attempted: 0, delivered: 0, failed: 0, pending: 0 }, sms: { attempted: 0, delivered: 0, failed: 0, pending: 0 }, email: { attempted: 0, delivered: 0, failed: 0, pending: 0 }, push: { attempted: 0, delivered: 0, failed: 0, pending: 0 }, inapp: { attempted: 0, delivered: 0, failed: 0, pending: 0 } };
  for (const a of attempts) {
    const x = s[a.channel];
    x.attempted++;
    if (a.status === "delivered" || a.status === "published") x.delivered++;
    else if (a.status === "failed" || a.status === "provider_error") x.failed++;
    else if (a.status !== "not_required") x.pending++;
  }
  return s;
}

/* ======================= Helpdesk SLA ======================= */

const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3600000;

export function slaStatus(q: HelpdeskQuery, policies: SlaPolicy[], now: string): { status: "within" | "overdue" | "breached" | "no_policy" | "met"; detail: string } {
  const p = policies.find((x) => x.category === q.category);
  if (!p || p.responseHours == null) return { status: "no_policy", detail: "No SLA configured for this category (CD-06)" };
  if (q.status === "resolved") return { status: "met", detail: "Resolved" };
  const firstDue = p.responseHours;
  if (!q.firstResponseAt && hoursBetween(q.receivedAt, now) > firstDue) return { status: "breached", detail: `No first response within ${firstDue} h (${p.status === "development_example" ? "development example" : "confirmed"})` };
  if (p.resolutionHours != null && hoursBetween(q.receivedAt, now) > p.resolutionHours) return { status: "overdue", detail: `Unresolved after ${p.resolutionHours} h` };
  return { status: "within", detail: `Within ${firstDue} h response target` };
}

/* ======================= WhatsApp bot ======================= */

export function validateMenu(menu: Pick<BotMenu, "items" | "programme">, allMenuIds: string[]): Check {
  const errors: string[] = [];
  for (const it of menu.items) {
    if (!BOT_ACTION[it.action].safe) errors.push(`"${it.label}": ${BOT_ACTION[it.action].label} is not allowed on the WhatsApp bot (value-moving or sensitive)`);
    if (!it.label.trim()) errors.push("Every menu item needs a label");
    if (it.deepLink && !deepLinkOk(it.deepLink)) errors.push(`"${it.label}": deep link not approved`);
    if (it.action === "submenu" && (!it.next || !allMenuIds.includes(it.next))) errors.push(`"${it.label}": sub-menu target missing`);
  }
  return { ok: errors.length === 0, errors, warnings: [] };
}

export const KNOWN_TEMPLATE_IDS = (cs: CommsState, n: NotificationId) => cs.templates.filter((t) => t.notificationId === n).map((t) => t.id);
