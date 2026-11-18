/**
 * Business analytics and reporting service contracts — PLACEHOLDER for backend integration (Phase 12).
 *
 * The analytics warehouse / data marts are not connected. Screens use the in-browser analytics store
 * (features/analytics/store.ts), which reads the authoritative module stores and calculates through
 * features/analytics/engine.ts. The HTTP implementation throws ApiNotConnectedError: no endpoint is
 * invented here.
 *
 * The member-facing contracts (SOW 13.2) are what the member apps call; this portal does not build
 * member app screens. Member progress, wallet and passbook figures come from the wallet and scheme
 * services, never from a client-side calculation.
 */
import * as store from "@/features/analytics/store";
import * as E from "@/features/analytics/engine";
import { milestoneMeasure } from "@/features/schemes/engine";
import { REPORTS } from "@/config/analyticsCatalogue";
import { ApiNotConnectedError } from "./api";

type F = E.Filters;
type S = ReturnType<typeof store.analyticsStore.get>;
export interface AnalyticsApi {
  getKpiDictionary(): Promise<S["kpis"]>;
  getKpiDefinition(kpiId: string): Promise<S["kpis"][number] | undefined>;
  getKpiValues(uid: string, asOn: string, f?: Partial<F>): Promise<ReturnType<typeof store.kpiValues>>;
  getMemberEngagementAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.engagement>>;
  getPointsFlowAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.pointsFlowView>>;
  getRevenueImpactAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.revenueView>>;
  getFraudAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.fraudView>>;
  getSchemePerformanceAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.schemeView>>;
  getChannelPerformanceAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.channelView>>;
  getGeographicAnalytics(uid: string, f: F, level: "state" | "district" | "branch"): Promise<ReturnType<typeof store.geoView>>;
  getTierDistribution(uid: string, f: F): Promise<ReturnType<typeof store.tierView>>;
  getSupportAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.supportView>>;
  getRetentionAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.retentionView>>;
  getAcquisitionCostAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.acquisitionView>>;
  getRedemptionProductAnalytics(uid: string, f: F): Promise<ReturnType<typeof store.redemptionView>>;
  getMemberSegmentation(uid: string, f: F): Promise<ReturnType<typeof store.segmentationView>>;
  getMember360Analytics(uid: string, memberId: string): Promise<ReturnType<typeof store.member360>>;
  getScanQrReport(uid: string, f: E.ScanFilter): Promise<ReturnType<typeof store.scanReport>>;
  getScanInReport(uid: string, f: E.ScanFilter): Promise<ReturnType<typeof store.scanReport>>;
  getScanOutReport(uid: string, f: E.ScanFilter): Promise<ReturnType<typeof store.scanReport>>;
  getParentChildScanReport(uid: string): Promise<ReturnType<typeof store.parentChildReport>>;
  getPointsAgeingReport(uid: string, asOn: string, f: Parameters<typeof store.pointsAgeingReport>[2]): Promise<ReturnType<typeof store.pointsAgeingReport>>;
  getTdsMonthlyLiabilityReport(uid: string, month: string, f: Parameters<typeof store.tdsLiabilityReport>[2], unmasked?: boolean): Promise<ReturnType<typeof store.tdsLiabilityReport>>;
  getProgrammeReports(uid: string, programme: string, f: F): Promise<ReturnType<typeof store.programmeReport>>;
  getDirectDealerReports(uid: string, f: F): Promise<ReturnType<typeof store.programmeReport>>;
  getReportCatalogue(): Promise<typeof REPORTS>;
  executeReport: typeof store.executeReport;
  exportReport: typeof store.exportReport;
  scheduleReport: typeof store.createSchedule;
  getScheduledReports(): Promise<S["schedules"]>;
  configureKpiThreshold: typeof store.saveThreshold;
  getKpiAlertHistory(): Promise<S["alerts"]>;
  getAnalyticsLineage(): Promise<ReturnType<typeof store.lineage>>;
  getDataFreshness(domain: string): Promise<ReturnType<typeof store.freshness>>;
  getAnalyticsReconciliation(uid: string): Promise<ReturnType<typeof store.reconciliation>>;
  /* Member app contracts (SOW 13.2) */
  memberWallet(memberId: string, from: string, to: string): Promise<ReturnType<typeof E.memberWallet>>;
  memberEarningsByCategory(memberId: string, from: string, to: string): Promise<ReturnType<typeof E.memberEarningsByCategory>>;
  memberScanHistory(memberId: string, f?: Parameters<typeof E.memberScanHistory>[2]): Promise<ReturnType<typeof E.memberScanHistory>>;
  memberPassbook(memberId: string, f?: E.PassbookFilter): Promise<ReturnType<typeof E.memberPassbook>>;
  memberStatement(memberId: string, from: string, to: string, format: "csv" | "pdf"): Promise<ReturnType<typeof E.memberStatement>>;
  memberSchemeProgress(memberId: string): Promise<ReturnType<typeof E.memberSchemeProgress>>;
}

const c = () => store.context();
export const mockAnalyticsApi: AnalyticsApi = {
  getKpiDictionary: async () => store.analyticsStore.get().kpis,
  getKpiDefinition: async (id) => store.analyticsStore.get().kpis.find((k) => k.id === id),
  getKpiValues: async (u, a, f) => store.kpiValues(u, a, f),
  getMemberEngagementAnalytics: async (u, f) => store.engagement(u, f),
  getPointsFlowAnalytics: async (u, f) => store.pointsFlowView(u, f),
  getRevenueImpactAnalytics: async (u, f) => store.revenueView(u, f),
  getFraudAnalytics: async (u, f) => store.fraudView(u, f),
  getSchemePerformanceAnalytics: async (u, f) => store.schemeView(u, f),
  getChannelPerformanceAnalytics: async (u, f) => store.channelView(u, f),
  getGeographicAnalytics: async (u, f, l) => store.geoView(u, f, l),
  getTierDistribution: async (u, f) => store.tierView(u, f),
  getSupportAnalytics: async (u, f) => store.supportView(u, f),
  getRetentionAnalytics: async (u, f) => store.retentionView(u, f),
  getAcquisitionCostAnalytics: async (u, f) => store.acquisitionView(u, f),
  getRedemptionProductAnalytics: async (u, f) => store.redemptionView(u, f),
  getMemberSegmentation: async (u, f) => store.segmentationView(u, f),
  getMember360Analytics: async (u, id) => store.member360(u, id),
  getScanQrReport: async (u, f) => store.scanReport(u, f),
  getScanInReport: async (u, f) => store.scanReport(u, { ...f, type: "scan_in" }),
  getScanOutReport: async (u, f) => store.scanReport(u, { ...f, type: "scan_out" }),
  getParentChildScanReport: async (u) => store.parentChildReport(u),
  getPointsAgeingReport: async (u, a, f) => store.pointsAgeingReport(u, a, f),
  getTdsMonthlyLiabilityReport: async (u, m, f, x) => store.tdsLiabilityReport(u, m, f, x),
  getProgrammeReports: async (u, p, f) => store.programmeReport(u, p, f),
  getDirectDealerReports: async (u, f) => store.programmeReport(u, "DD", f),
  getReportCatalogue: async () => REPORTS,
  executeReport: store.executeReport,
  exportReport: store.exportReport,
  scheduleReport: store.createSchedule,
  getScheduledReports: async () => store.analyticsStore.get().schedules,
  configureKpiThreshold: store.saveThreshold,
  getKpiAlertHistory: async () => store.analyticsStore.get().alerts,
  getAnalyticsLineage: async () => store.lineage(),
  getDataFreshness: async (d) => store.freshness(d),
  getAnalyticsReconciliation: async (u) => store.reconciliation(u),
  memberWallet: async (id, from, to) => E.memberWallet(c(), id, from, to),
  memberEarningsByCategory: async (id, from, to) => E.memberEarningsByCategory(c(), id, from, to),
  memberScanHistory: async (id, f) => E.memberScanHistory(c(), id, f),
  memberPassbook: async (id, f) => E.memberPassbook(c(), id, f),
  memberStatement: async (id, from, to, fmt) => E.memberStatement(c(), id, from, to, fmt),
  memberSchemeProgress: async (id) => E.memberSchemeProgress(c(), id, milestoneMeasure as never),
};
const notConnected = (): never => {
  throw new ApiNotConnectedError("Analytics warehouse, reporting, export, scheduling and member-app analytics services are not connected");
};
/** Every operation of the HTTP implementation refuses until the backend exists. */
export const httpAnalyticsApi = Object.fromEntries(Object.keys(mockAnalyticsApi).map((k) => [k, async () => notConnected()])) as unknown as AnalyticsApi;
export const analyticsApi: AnalyticsApi = mockAnalyticsApi;
