/**
 * Approval request specifications for Communication Centre changes. Used by the store and by the
 * precomputed approval scenario steps, so seeded and live requests are identical.
 */
import { CHANNEL } from "@/config/commsCatalogue";
import type { FieldChange } from "@/types/approval";
import type { BotMenu, Communication, MessageTemplate, RichContent, Survey, TemplateVersion } from "@/types/comms";

export interface CommsSpec {
  type: string;
  title: string;
  entity: string;
  programme: string | null;
  fields: FieldChange[];
  purpose: string;
  reason: string;
  justification: string;
}

const f = (key: string, label: string, before: string | number | null, after: string | number | null, material = false): FieldChange => ({ key, label, kind: "text", before, after, material });
const progOf = (p: string[]) => (p.length === 1 ? p[0] : p.length ? p.join(" + ") : null);

export function communicationSpec(c: Communication): CommsSpec {
  return {
    type: "communication_publish",
    title: `${c.mode === "scheduled" ? "Scheduled" : "Manual"} communication · ${c.name}`,
    entity: c.id,
    programme: progOf(c.audience.programmes),
    fields: [f("purpose", "Purpose", null, c.purpose), f("audience", "Audience (estimated recipients)", null, c.audienceCount, true), f("channels", "Channels", null, c.channels.map((x) => CHANNEL[x].label).join(", "), true), f("languages", "Languages", null, c.languages.join(", ")), f("schedule", "Dispatch", null, c.scheduledAt ? `Scheduled ${c.scheduledAt}` : "Send after approval", true), f("content", "Content", null, c.manualContent?.body ?? c.templateIds.join(", "), true)],
    purpose: c.purpose,
    reason: c.justification || c.description || "Member-facing communication",
    justification: "Approval does not dispatch: an operator with Communication: Execute sends or the scheduler dispatches at the scheduled time",
  };
}

export function templateSpec(t: MessageTemplate, v: TemplateVersion, prev: TemplateVersion | undefined): CommsSpec {
  const en = (x?: TemplateVersion) => x?.translations.find((y) => y.lang === "en")?.body ?? null;
  return {
    type: "comm_template_publish",
    title: `Template ${t.id} v${v.version}`,
    entity: `${t.id} v${v.version}`,
    programme: null,
    fields: [
      f("body", "English body", en(prev), en(v), true),
      // Every other language whose text changed is shown to the Checker separately.
      ...v.translations.filter((x) => x.lang !== "en" && (prev?.translations.find((y) => y.lang === x.lang)?.body ?? "") !== x.body).map((x) => f(`body_${x.lang}`, `${x.lang} body`, prev?.translations.find((y) => y.lang === x.lang)?.body || null, x.body || null, true)),
      f("deepLink", "Deep link", prev?.deepLink ?? null, v.deepLink),
      f("languages", "Complete translations", prev?.translations.filter((x) => x.status !== "missing").length ?? null, v.translations.filter((x) => x.status !== "missing").length),
      f("provider", "Provider approval", prev?.providerApproval ?? null, v.providerApproval),
    ],
    purpose: `${t.notificationId ?? "Manual"} template change (${CHANNEL[t.channel].label})`,
    reason: v.reason,
    justification: "Previous version stays active until this version is approved",
  };
}

export function contentSpec(c: RichContent): CommsSpec {
  return {
    type: "content_publish",
    title: `Publish ${c.kind} ${c.name}`,
    entity: c.id,
    programme: progOf(c.programmes),
    fields: [f("text", "Content", null, c.description, true), f("contributor", "Contributor display", null, c.contributor?.display ?? null, true), f("consent", "Consent reference", null, c.contributor?.consentRef ?? null, true)],
    purpose: `${c.kind} publication`,
    reason: "Member identity and consent verified before publication",
    justification: "",
  };
}

export function surveySpec(s: Survey): CommsSpec {
  return {
    type: "survey_publish",
    title: `Publish survey ${s.name}`,
    entity: s.id,
    programme: progOf(s.audience.programmes),
    fields: [f("source", "Authoring source", null, s.source, true), f("link", "Survey link", null, s.link, true), f("period", "Period", null, `${s.startDate} – ${s.endDate}`), f("trigger", "Trigger", null, s.trigger)],
    purpose: "Survey publication before N06 dispatch",
    reason: "Survey ready for the configured audience",
    justification: "Authoring source and triggers are open (OP-SURV1)",
  };
}

export function botSpec(m: BotMenu, prev: BotMenu | undefined): CommsSpec {
  return {
    type: "bot_menu_publish",
    title: `WhatsApp bot menu ${m.name} v${m.version}`,
    entity: `${m.id} v${m.version}`,
    programme: m.programme,
    fields: [f("items", "Menu items", prev ? prev.items.map((x) => x.label).join(", ") : null, m.items.map((x) => x.label).join(", "), true)],
    purpose: "Role-based WhatsApp bot menu",
    reason: "Menu change (safe actions only)",
    justification: "Redemption and value-moving actions are refused by validation",
  };
}
