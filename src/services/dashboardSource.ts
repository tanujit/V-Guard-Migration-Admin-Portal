import type {
  ActiveUsersData,
  DashboardFilters,
  GeographyData,
  GiftData,
  KycData,
  OperationsData,
  OverviewData,
  PointsData,
  ProgrammeDistributionData,
  RedemptionData,
  ReferralData,
  RegistrationAnalyticsData,
  RegistrationStatusData,
  RiskData,
  SchemeData,
  ScanningData,
  TdsData,
} from "@/types/dashboard";

export type GeoDrill = { level: "state" } | { level: "district"; parent: string } | { level: "branch"; parent: string };

/**
 * Contract between dashboard UI and its data. The mock source and the future HTTP source both
 * implement it, so visual components never change when real APIs are connected.
 */
export interface DashboardDataSource {
  overview(f: DashboardFilters): Promise<OverviewData>;
  programmeDistribution(f: DashboardFilters): Promise<ProgrammeDistributionData>;
  registrationAnalytics(f: DashboardFilters): Promise<RegistrationAnalyticsData>;
  registrationStatus(f: DashboardFilters): Promise<RegistrationStatusData>;
  activeUsers(f: DashboardFilters): Promise<ActiveUsersData>;
  geography(f: DashboardFilters, drill?: GeoDrill): Promise<GeographyData>;
  scanning(f: DashboardFilters): Promise<ScanningData>;
  points(f: DashboardFilters): Promise<PointsData>;
  redemption(f: DashboardFilters): Promise<RedemptionData>;
  kyc(f: DashboardFilters): Promise<KycData>;
  schemes(f: DashboardFilters): Promise<SchemeData>;
  gifts(f: DashboardFilters): Promise<GiftData>;
  tds(f: DashboardFilters): Promise<TdsData>;
  referrals(f: DashboardFilters): Promise<ReferralData>;
  risk(f: DashboardFilters): Promise<RiskData>;
  operations(f: DashboardFilters): Promise<OperationsData>;
}
