/**
 * Communication Centre service contracts — PLACEHOLDER for backend integration (Phase 8).
 *
 * The 23 services of the brief (listed in config/commsCatalogue.ts → COMMS_SERVICES) map onto the
 * interfaces below. Screens use the in-browser comms store; dispatch goes to MOCK provider adapters.
 * The HTTP implementation throws ApiNotConnectedError: no WhatsApp, SMS, email, push, in-app inbox,
 * WhatsApp bot, helpdesk, content storage or survey provider is connected, and no endpoint is invented.
 *
 * Contract rules the backend must honour (enforced by the mock today):
 *  - every dispatch attempt carries an idempotency key; an event ID received twice never re-sends;
 *  - request accepted, dispatched and delivered are distinct states; only a provider callback delivers;
 *  - templates are versioned; an active version is never overwritten;
 *  - templates may use only registry variables; deep links come from the approved catalogue.
 */
import * as store from "@/features/comms/store";
import * as engine from "@/features/comms/engine";
import { memberStore } from "@/features/members/store";
import type { PolicyResult } from "@/features/access/engine";
import type { AudienceFilter, BotConversation, Communication, DeliveryAttempt, HelpdeskQuery, MessageTemplate, NotificationEntry, NotificationEvent, Survey, SurveyResponse } from "@/types/comms";
import { ApiNotConnectedError } from "./api";

type Res = PolicyResult & { id?: string };

export interface CommsApi {
  getNotificationCatalogue(): Promise<NotificationEntry[]>;
  updateNotificationConfiguration(actorId: string, id: NotificationEntry["id"], patch: Parameters<typeof store.updateEntry>[2], reason: string): Promise<Res>;
  getTemplates(): Promise<MessageTemplate[]>;
  updateTemplate(actorId: string, templateId: string, translations: Parameters<typeof store.saveTemplateDraft>[2], deepLink: string | null, reason: string): Promise<Res>;
  validateTemplate(t: MessageTemplate, languages: string[]): Promise<engine.Check>;
  estimateAudience(actorScope: (m: Parameters<typeof engine.resolveAudience>[2] extends (x: infer M) => boolean ? M : never) => boolean, filter: AudienceFilter): Promise<{ eligible: number; excluded: number }>;
  createCommunication(actorId: string, c: Communication): Promise<Res>;
  submitCommunication(actorId: string, id: string): Promise<Res>;
  dispatchCommunication(actorId: string, id: string): Promise<Res>;
  processNotificationEvent(): Promise<{ processed: number; duplicates: number }>;
  getEvents(): Promise<NotificationEvent[]>;
  getDeliveryHistory(commId?: string): Promise<DeliveryAttempt[]>;
  getBotConversations(): Promise<BotConversation[]>;
  escalateToHumanAgent(actorId: string, memberId: string, category: string, text: string): Promise<Res>;
  getHelpdeskQueue(): Promise<HelpdeskQuery[]>;
  getSurveys(): Promise<Survey[]>;
  getSurveyResponses(surveyId: string): Promise<SurveyResponse[]>;
}

const s = () => store.commsStore.get();

export const mockCommsApi: CommsApi = {
  getNotificationCatalogue: async () => s().catalogue,
  updateNotificationConfiguration: async (a, id, p, r) => store.updateEntry(a, id, p, r),
  getTemplates: async () => s().templates,
  updateTemplate: async (a, id, tr, dl, r) => store.saveTemplateDraft(a, id, tr, dl, r),
  validateTemplate: async (t, langs) => engine.validateTemplate(t, engine.latestVersion(t), langs),
  estimateAudience: async (scope, f) => { const r = engine.resolveAudience(memberStore.get(), f, scope); return { eligible: r.included.length, excluded: r.excluded.length }; },
  createCommunication: async (a, c) => store.saveCommunication(a, c),
  submitCommunication: async (a, id) => store.submitCommunication(a, id),
  dispatchCommunication: async (a, id) => store.dispatchCommunication(a, id),
  processNotificationEvent: async () => store.processEvents(),
  getEvents: async () => s().events,
  getDeliveryHistory: async (id) => s().attempts.filter((x) => !id || x.commId === id),
  getBotConversations: async () => s().conversations,
  escalateToHumanAgent: async (a, m, c, t) => store.escalateToAgent(a, m, c, t),
  getHelpdeskQueue: async () => s().queries,
  getSurveys: async () => s().surveys,
  getSurveyResponses: async (id) => s().responses.filter((r) => r.surveyId === id),
};

const notConnected = (): never => {
  throw new ApiNotConnectedError("Communication providers, WhatsApp bot, helpdesk and survey services are not connected");
};
export const httpCommsApi = Object.fromEntries(Object.keys(mockCommsApi).map((k) => [k, async () => notConnected()])) as unknown as CommsApi;
export const commsApi: CommsApi = mockCommsApi;
