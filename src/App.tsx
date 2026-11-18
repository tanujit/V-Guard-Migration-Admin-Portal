import { lazy, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ALL_NAV_ITEMS } from "@/config/navigation";
import { useSession } from "@/context/SessionContext";
import { ModulePlaceholder } from "@/pages/ModulePlaceholder";
import { AccountInactive, NotFound, SignedOut } from "@/pages/SignedOut";
// Static: the identity switcher already loads this small module at start-up.
import { AccessDenied, UsersLayout } from "@/pages/users/shared";

/*
 * Route-level code splitting: each module's pages load when the module is first opened, so the
 * dashboard does not download the Scheme Builder, masters, members or approval pages. The shell
 * shows a loading state (AppShell's Suspense boundary) only on the first open of a page; later
 * navigations keep the current page on screen until the next one is ready (v7_startTransition).
 */
function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] as M[K] & ComponentType<any> })));
}

const DashboardPage = lazyNamed(() => import("@/pages/dashboard/DashboardPage"), "DashboardPage");

const UserDirectoryPage = lazyNamed(() => import("@/pages/users/UserDirectoryPage"), "UserDirectoryPage");
const UserWizardPage = lazyNamed(() => import("@/pages/users/UserWizardPage"), "UserWizardPage");
const UserDetailPage = lazyNamed(() => import("@/pages/users/UserDetailPage"), "UserDetailPage");
const OrganisationsPage = lazyNamed(() => import("@/pages/users/OrganisationsPage"), "OrganisationsPage");
const roles = () => import("@/pages/users/RolesPage");
const RolesPage = lazyNamed(roles, "RolesPage");
const RoleEditorPage = lazyNamed(roles, "RoleEditorPage");
const PermissionMatrixPage = lazyNamed(roles, "PermissionMatrixPage");
const NominationsPage = lazyNamed(() => import("@/pages/users/NominationsPage"), "NominationsPage");
const CheckerAccessPage = lazyNamed(() => import("@/pages/users/CheckerAccessPage"), "CheckerAccessPage");
const EffectiveAccessPage = lazyNamed(() => import("@/pages/users/EffectiveAccessPage"), "EffectiveAccessPage");
const AccessAuditPage = lazyNamed(() => import("@/pages/users/AccessAuditPage"), "AccessAuditPage");

const ApprovalsLayout = lazyNamed(() => import("@/pages/approvals/shared"), "ApprovalsLayout");
const RequestListPage = lazyNamed(() => import("@/pages/approvals/RequestListPage"), "RequestListPage");
const RequestDetailPage = lazyNamed(() => import("@/pages/approvals/RequestDetailPage"), "RequestDetailPage");
const RequestComposerPage = lazyNamed(() => import("@/pages/approvals/RequestComposerPage"), "RequestComposerPage");
const workflowConfig = () => import("@/pages/approvals/WorkflowConfigPage");
const WorkflowConfigPage = lazyNamed(workflowConfig, "WorkflowConfigPage");
const WorkflowDetailPage = lazyNamed(workflowConfig, "WorkflowDetailPage");
const WorkflowWizardPage = lazyNamed(() => import("@/pages/approvals/WorkflowWizardPage"), "WorkflowWizardPage");
const AnalyticsPage = lazyNamed(() => import("@/pages/approvals/AnalyticsPage"), "AnalyticsPage");

const mastersOverview = () => import("@/pages/masters/OverviewPage");
const MastersOverviewLayout = lazyNamed(mastersOverview, "MastersOverviewLayout");
const MastersOverviewPage = lazyNamed(mastersOverview, "MastersOverviewPage");
const MasterDecisionsPage = lazyNamed(mastersOverview, "MasterDecisionsPage");
const MastersAuditPage = lazyNamed(mastersOverview, "MastersAuditPage");
const products = () => import("@/pages/masters/ProductsPage");
const ProductsLayout = lazyNamed(products, "ProductsLayout");
const ProductDirectoryPage = lazyNamed(products, "ProductDirectoryPage");
const ProductWizardPage = lazyNamed(products, "ProductWizardPage");
const ProductDetailPage = lazyNamed(products, "ProductDetailPage");
const imports = () => import("@/pages/masters/ImportPage");
const BulkImportPage = lazyNamed(imports, "BulkImportPage");
const ImportHistoryPage = lazyNamed(imports, "ImportHistoryPage");
const categories = () => import("@/pages/masters/CategoriesPage");
const CategoriesLayout = lazyNamed(categories, "CategoriesLayout");
const CategoryDirectoryPage = lazyNamed(categories, "CategoryDirectoryPage");
const SubCategoryDirectoryPage = lazyNamed(categories, "SubCategoryDirectoryPage");
const branches = () => import("@/pages/masters/BranchesPage");
const BranchesLayout = lazyNamed(branches, "BranchesLayout");
const HierarchyPage = lazyNamed(branches, "HierarchyPage");
const BranchDirectoryPage = lazyNamed(branches, "BranchDirectoryPage");
const SyncPage = lazyNamed(branches, "SyncPage");
const OwnershipPage = lazyNamed(branches, "OwnershipPage");
const BranchDetailPage = lazyNamed(branches, "BranchDetailPage");
const scanning = () => import("@/pages/masters/ScanningPage");
const ScanningLayout = lazyNamed(scanning, "ScanningLayout");
const ScanningDashboard = lazyNamed(scanning, "ScanningDashboard");
const ScanPointsPage = lazyNamed(scanning, "ScanPointsPage");
const ScanPointWizardPage = lazyNamed(scanning, "ScanPointWizardPage");
const ScanPointDetailPage = lazyNamed(scanning, "ScanPointDetailPage");
const ExceptionSettingsPage = lazyNamed(scanning, "ExceptionSettingsPage");
const rules = () => import("@/pages/masters/RulesPage");
const RulesDirectoryPage = lazyNamed(rules, "RulesDirectoryPage");
const RuleBuilderPage = lazyNamed(rules, "RuleBuilderPage");
const RuleDetailPage = lazyNamed(rules, "RuleDetailPage");
const SimulatorPage = lazyNamed(rules, "SimulatorPage");

const membersShared = () => import("@/pages/members/shared");
const MembersLayout = lazyNamed(membersShared, "MembersLayout");
const RegistrationLayout = lazyNamed(membersShared, "RegistrationLayout");
const membersPages = () => import("@/pages/members/MembersPages");
const MemberOverviewPage = lazyNamed(membersPages, "MemberOverviewPage");
const MemberDirectoryPage = lazyNamed(membersPages, "MemberDirectoryPage");
const Member360Picker = lazyNamed(membersPages, "Member360Picker");
const MemberActivityPage = lazyNamed(membersPages, "MemberActivityPage");
const Member360Page = lazyNamed(() => import("@/pages/members/Member360Page"), "Member360Page");
const membersOps = () => import("@/pages/members/MembersOps");
const RestrictionsPage = lazyNamed(membersOps, "RestrictionsPage");
const MpinPage = lazyNamed(membersOps, "MpinPage");
const registration = () => import("@/pages/members/RegistrationPages");
const RegistrationOverviewPage = lazyNamed(registration, "RegistrationOverviewPage");
const RegistrationQueuePage = lazyNamed(registration, "RegistrationQueuePage");
const RegistrationReviewPage = lazyNamed(registration, "RegistrationReviewPage");
const AssistedRegistrationPage = lazyNamed(registration, "AssistedRegistrationPage");
const kyc = () => import("@/pages/members/KycPages");
const KycQueuePage = lazyNamed(kyc, "KycQueuePage");
const DocumentReviewPage = lazyNamed(kyc, "DocumentReviewPage");
const KycExceptionsPage = lazyNamed(kyc, "KycExceptionsPage");
const VerificationHistoryPage = lazyNamed(kyc, "VerificationHistoryPage");
const MemberDecisionsPage = lazyNamed(kyc, "MemberDecisionsPage");

const SchemesLayout = lazyNamed(() => import("@/pages/schemes/shared"), "SchemesLayout");
const schemesOverview = () => import("@/pages/schemes/OverviewPage");
const SchemeOverviewPage = lazyNamed(schemesOverview, "SchemeOverviewPage");
const SchemeCalendarPage = lazyNamed(schemesOverview, "SchemeCalendarPage");
const schemesDirectory = () => import("@/pages/schemes/DirectoryPage");
const SchemeDirectoryPage = lazyNamed(schemesDirectory, "SchemeDirectoryPage");
const SettlementPage = lazyNamed(schemesDirectory, "SettlementPage");
const SchemeBuilderPage = lazyNamed(() => import("@/pages/schemes/BuilderPage"), "SchemeBuilderPage");
const SchemeDetailPage = lazyNamed(() => import("@/pages/schemes/SchemeDetailPage"), "SchemeDetailPage");
const incentives = () => import("@/pages/schemes/IncentivePages");
const TiersPage = lazyNamed(incentives, "TiersPage");
const ReferralsPage = lazyNamed(incentives, "ReferralsPage");
const CampaignsPage = lazyNamed(incentives, "CampaignsPage");
const GamificationPage = lazyNamed(incentives, "GamificationPage");
const SchemeGovernancePage = lazyNamed(() => import("@/pages/schemes/GovernancePages"), "SchemeGovernancePage");

const walletShared = () => import("@/pages/wallet/shared");
const WalletLayout = lazyNamed(walletShared, "WalletLayout");
const RedemptionLayout = lazyNamed(walletShared, "RedemptionLayout");
const WalletOverviewPage = lazyNamed(() => import("@/pages/wallet/OverviewPage"), "WalletOverviewPage");
const walletMembers = () => import("@/pages/wallet/MembersPage");
const MemberWalletsPage = lazyNamed(walletMembers, "MemberWalletsPage");
const WalletDetailPage = lazyNamed(walletMembers, "WalletDetailPage");
const ledger = () => import("@/pages/wallet/LedgerPage");
const LedgerPage = lazyNamed(ledger, "LedgerPage");
const LedgerDetailPage = lazyNamed(ledger, "LedgerDetailPage");
const walletOps = () => import("@/pages/wallet/OperationsPages");
const AdjustmentsPage = lazyNamed(walletOps, "AdjustmentsPage");
const TransfersPage = lazyNamed(walletOps, "TransfersPage");
const ReversalsPage = lazyNamed(walletOps, "ReversalsPage");
const walletFinance = () => import("@/pages/wallet/FinancePages");
const SettlementOpsPage = lazyNamed(walletFinance, "SettlementOpsPage");
const TdsPage = lazyNamed(walletFinance, "TdsPage");
const GstPage = lazyNamed(walletFinance, "GstPage");
const walletGov = () => import("@/pages/wallet/GovernancePages");
const FinReportsPage = lazyNamed(walletGov, "ReportsPage");
const ReconciliationPage = lazyNamed(walletGov, "ReconciliationPage");
const FinConfigPage = lazyNamed(walletGov, "ConfigPage");
const commsShared = () => import("@/pages/comms/shared");
const CommsLayout = lazyNamed(commsShared, "CommsLayout");
const CommsOverviewPage = lazyNamed(() => import("@/pages/comms/OverviewPage"), "CommsOverviewPage");
const ComposePage = lazyNamed(() => import("@/pages/comms/ComposePage"), "ComposePage");
const commsCat = () => import("@/pages/comms/CataloguePages");
const CataloguePage = lazyNamed(commsCat, "CataloguePage");
const TemplatesPage = lazyNamed(commsCat, "TemplatesPage");
const commsDel = () => import("@/pages/comms/DeliveryPages");
const ScheduledPage = lazyNamed(commsDel, "ScheduledPage");
const RulesPage = lazyNamed(commsDel, "RulesPage");
const HistoryPage = lazyNamed(commsDel, "HistoryPage");
const CommDetailPage = lazyNamed(commsDel, "CommDetailPage");
const DeliveryPage = lazyNamed(commsDel, "DeliveryPage");
const AudiencesPage = lazyNamed(commsDel, "AudiencesPage");
const commsBot = () => import("@/pages/comms/BotHelpdeskPages");
const BotPage = lazyNamed(commsBot, "BotPage");
const HelpdeskPage = lazyNamed(commsBot, "HelpdeskPage");
const commsContent = () => import("@/pages/comms/ContentPages");
const SelfServicePage = lazyNamed(commsContent, "SelfServicePage");
const BannersPage = lazyNamed(commsContent, "BannersPage");
const RichContentPage = lazyNamed(commsContent, "RichContentPage");
const LinksPage = lazyNamed(commsContent, "LinksPage");
const commsSurvey = () => import("@/pages/comms/SurveyConfigPages");
const SurveysPage = lazyNamed(commsSurvey, "SurveysPage");
const CommsConfigPage = lazyNamed(commsSurvey, "CommsConfigPage");
const red = () => import("@/pages/redemption/RedemptionPages");
const RedemptionOverviewPage = lazyNamed(red, "RedemptionOverviewPage");
const RedemptionRequestsPage = lazyNamed(red, "RedemptionRequestsPage");
const RedemptionDetailPage = lazyNamed(red, "RedemptionDetailPage");
const PayoutsPage = lazyNamed(red, "PayoutsPage");
const VouchersPage = lazyNamed(red, "VouchersPage");
const RedemptionProductsPage = lazyNamed(red, "ProductsPage");
const GiftsPage = lazyNamed(red, "GiftsPage");
const CancellationPage = lazyNamed(red, "CancellationPage");
const LimitsPage = lazyNamed(red, "LimitsPage");
const EmiPage = lazyNamed(red, "EmiPage");
const RedemptionHistoryPage = lazyNamed(red, "RedemptionHistoryPage");

const giftsShared = () => import("@/pages/gifts/shared");
const GiftsLayout = lazyNamed(giftsShared, "GiftsLayout");
const GiftsOverviewPage = lazyNamed(() => import("@/pages/gifts/OverviewPage"), "GiftsOverviewPage");
const giftCat = () => import("@/pages/gifts/CataloguePages");
const CatalogueDirectoryPage = lazyNamed(giftCat, "CatalogueDirectoryPage");
const GiftDetailPage = lazyNamed(giftCat, "GiftDetailPage");
const GiftWizardPage = lazyNamed(giftCat, "GiftWizardPage");
const GiftCategoriesPage = lazyNamed(giftCat, "CategoriesPage");
const PointCostPage = lazyNamed(giftCat, "PointCostPage");
const GiftPartnersPage = lazyNamed(() => import("@/pages/gifts/PartnerPages"), "PartnersPage");
const giftVch = () => import("@/pages/gifts/VoucherPages");
const VoucherInventoryPage = lazyNamed(giftVch, "VoucherInventoryPage");
const VoucherRecoveryPage = lazyNamed(giftVch, "VoucherRecoveryPage");
const giftOrd = () => import("@/pages/gifts/OrderPages");
const GiftOrdersPage = lazyNamed(giftOrd, "OrdersPage");
const GiftOrderDetailPage = lazyNamed(giftOrd, "OrderDetailPage");
const DeliveryTrackingPage = lazyNamed(giftOrd, "DeliveryTrackingPage");
const BackendGiftPage = lazyNamed(() => import("@/pages/gifts/BackendGiftPage"), "BackendGiftPage");
const InsurancePage = lazyNamed(() => import("@/pages/gifts/InsurancePages"), "InsurancePage");
const giftGov = () => import("@/pages/gifts/GovernancePages");
const GiftImportsPage = lazyNamed(giftGov, "ImportHistoryPage");
const GiftReportsPage = lazyNamed(giftGov, "ReportsPage");
const GiftAuditPage = lazyNamed(giftGov, "GiftAuditPage");
const GiftSettingsPage = lazyNamed(giftGov, "GiftSettingsPage");

const fraudShared = () => import("@/pages/fraud/shared");
const FraudLayout = lazyNamed(fraudShared, "FraudLayout");
const FraudOverviewPage = lazyNamed(() => import("@/pages/fraud/OverviewPage"), "FraudOverviewPage");
const fraudQueue = () => import("@/pages/fraud/QueuePages");
const ReviewQueuePage = lazyNamed(fraudQueue, "ReviewQueuePage");
const RiskCasesPage = lazyNamed(fraudQueue, "CasesPage");
const RiskCaseDetailPage = lazyNamed(fraudQueue, "CaseDetailPage");
const InvestigationHistoryPage = lazyNamed(fraudQueue, "InvestigationHistoryPage");
const fraudRules = () => import("@/pages/fraud/RulePages");
const RiskRulesPage = lazyNamed(fraudRules, "RiskRulesPage");
const AnomalyPage = lazyNamed(fraudRules, "AnomalyPage");
const ScanRatePage = lazyNamed(fraudRules, "ScanRatePage");
const fraudDevices = () => import("@/pages/fraud/DevicePages");
const DeviceGovernancePage = lazyNamed(fraudDevices, "DeviceGovernancePage");
const DeviceDetailPage = lazyNamed(fraudDevices, "DeviceDetailPage");
const fraudVectors = () => import("@/pages/fraud/VectorPages");
const DuplicateIdentityPage = lazyNamed(fraudVectors, "DuplicateIdentityPage");
const QrIntegrityPage = lazyNamed(fraudVectors, "QrIntegrityPage");
const GeoBranchPage = lazyNamed(fraudVectors, "GeoBranchPage");
const RedemptionRiskPage = lazyNamed(fraudVectors, "RedemptionRiskPage");
const fraudData = () => import("@/pages/fraud/DataPages");
const DataIntegrityPage = lazyNamed(fraudData, "DataIntegrityPage");
const SfdcReconPage = lazyNamed(fraudData, "SfdcReconPage");
const fraudGov = () => import("@/pages/fraud/GovernancePages");
const RiskConfigHistoryPage = lazyNamed(fraudGov, "ConfigHistoryPage");
const ComplianceAuditPage = lazyNamed(fraudGov, "ComplianceAuditPage");
const OpsLayout = lazyNamed(() => import("@/pages/ops/shared"), "OpsLayout");
const OpsOverviewPage = lazyNamed(() => import("@/pages/ops/OverviewPage"), "OpsOverviewPage");
const opsDir = () => import("@/pages/ops/DirectoryPages");
const OpsDirectoryPage = lazyNamed(opsDir, "DirectoryPage");
const IntegrationDetailPage = lazyNamed(opsDir, "IntegrationDetailPage");
const ConnectionHealthPage = lazyNamed(opsDir, "ConnectionHealthPage");
const opsConn = () => import("@/pages/ops/ConnectionPages");
const SfdcPage = lazyNamed(opsConn, "SfdcPage");
const EsealPage = lazyNamed(opsConn, "EsealPage");
const OtherConnectionsPage = lazyNamed(opsConn, "OtherConnectionsPage");
const opsData = () => import("@/pages/ops/DataPages");
const MessageTracePage = lazyNamed(opsData, "MessageTracePage");
const DataSyncPage = lazyNamed(opsData, "DataSyncPage");
const JobsQueuesPage = lazyNamed(opsData, "JobsQueuesPage");
const FailuresPage = lazyNamed(opsData, "FailuresPage");
const RetryPage = lazyNamed(opsData, "RetryPage");
const OpsReconciliationPage = lazyNamed(opsData, "ReconciliationPage");
const opsHealth = () => import("@/pages/ops/HealthPages");
const SystemHealthPage = lazyNamed(opsHealth, "SystemHealthPage");
const ApiPerformancePage = lazyNamed(opsHealth, "ApiPerformancePage");
const CrashPage = lazyNamed(opsHealth, "CrashPage");
const InfrastructurePage = lazyNamed(opsHealth, "InfrastructurePage");
const opsMember = () => import("@/pages/ops/MemberPages");
const AuthenticationPage = lazyNamed(opsMember, "AuthenticationPage");
const MemberDiagnosticsPage = lazyNamed(opsMember, "MemberDiagnosticsPage");
const AdoptionPage = lazyNamed(opsMember, "AdoptionPage");
const FloatPage = lazyNamed(opsMember, "FloatPage");
const opsGov = () => import("@/pages/ops/GovernancePages");
const IncidentsPage = lazyNamed(opsGov, "IncidentsPage");
const OpsAuditPage = lazyNamed(opsGov, "OpsAuditPage");
const AnalyticsLayout = lazyNamed(() => import("@/pages/analytics/shared"), "AnalyticsLayout");
const AnalyticsOverviewPage = lazyNamed(() => import("@/pages/analytics/OverviewPage"), "AnalyticsOverviewPage");
const anaDash = () => import("@/pages/analytics/DashboardPages");
const EngagementPage = lazyNamed(anaDash, "EngagementPage");
const PointsFlowPage = lazyNamed(anaDash, "PointsFlowPage");
const RevenuePage = lazyNamed(anaDash, "RevenuePage");
const FraudAnalyticsPage = lazyNamed(anaDash, "FraudAnalyticsPage");
const SchemePerformancePage = lazyNamed(anaDash, "SchemePerformancePage");
const ChannelPage = lazyNamed(anaDash, "ChannelPage");
const GeographyPage = lazyNamed(anaDash, "GeographyPage");
const TierPage = lazyNamed(anaDash, "TierPage");
const SupportPage = lazyNamed(anaDash, "SupportPage");
const RetentionPage = lazyNamed(anaDash, "RetentionPage");
const AcquisitionPage = lazyNamed(anaDash, "AcquisitionPage");
const RedemptionProductPage = lazyNamed(anaDash, "RedemptionProductPage");
const SegmentationPage = lazyNamed(anaDash, "SegmentationPage");
const anaRep = () => import("@/pages/analytics/ReportPages");
const Member360AnalyticsPage = lazyNamed(anaRep, "Member360AnalyticsPage");
const ScanReportsPage = lazyNamed(anaRep, "ScanReportsPage");
const FinanceReportsPage = lazyNamed(anaRep, "FinanceReportsPage");
const ProgrammeReportsPage = lazyNamed(anaRep, "ProgrammeReportsPage");
const anaGov = () => import("@/pages/analytics/GovernancePages");
const CataloguePageA = lazyNamed(anaGov, "CataloguePage");
const SchedulesPage = lazyNamed(anaGov, "SchedulesPage");
const ThresholdAlertsPage = lazyNamed(anaGov, "ThresholdAlertsPage");
const KpiDictionaryPage = lazyNamed(anaGov, "KpiDictionaryPage");
const AnalyticsHistoryPage = lazyNamed(anaGov, "HistoryPage");

function WorkflowDetailRoute() {
  const { workflowId = "" } = useParams();
  return <WorkflowDetailPage id={workflowId} />;
}

/** Route guard: renders children only when the engine allows the permission. */
function Require({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useSession();
  return can(permission) ? <>{children}</> : <div className="page"><AccessDenied message={`This page needs ${permission}. Ask an Evolve Super Admin to review your access.`} /></div>;
}

export default function App() {
  const { user, access } = useSession();
  if (user && access && !access.accountActive) return <AccountInactive />;
  return (
    <Routes>
      <Route path="/signed-out" element={<SignedOut />} />
      <Route element={user ? <AppShell /> : <Navigate to="/signed-out" replace />}>
        <Route index element={<Require permission="dashboard:view"><DashboardPage /></Require>} />
        <Route path="/governance/users" element={<UsersLayout />}>
          <Route index element={<UserDirectoryPage />} />
          <Route path="new" element={<UserWizardPage />} />
          <Route path="user/:userId" element={<UserDetailPage />} />
          <Route path="organisations" element={<OrganisationsPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="roles/new" element={<RoleEditorPage key="new" mode="new" />} />
          <Route path="roles/:roleId/edit" element={<RoleEditorPage key="edit" mode="edit" />} />
          <Route path="roles/:roleId/clone" element={<RoleEditorPage key="clone" mode="clone" />} />
          <Route path="permissions" element={<PermissionMatrixPage />} />
          <Route path="nominations" element={<NominationsPage />} />
          <Route path="checkers" element={<CheckerAccessPage />} />
          <Route path="effective" element={<EffectiveAccessPage />} />
          <Route path="audit" element={<AccessAuditPage />} />
        </Route>
        <Route path="/governance/approvals" element={<ApprovalsLayout />}>
          <Route index element={<RequestListPage key="inbox" queue="inbox" />} />
          <Route path="all" element={<RequestListPage key="all" queue="all" />} />
          <Route path="mine" element={<RequestListPage key="mine" queue="mine" />} />
          <Route path="returned" element={<RequestListPage key="returned" queue="returned" />} />
          <Route path="approved" element={<RequestListPage key="approved" queue="approved" />} />
          <Route path="rejected" element={<RequestListPage key="rejected" queue="rejected" />} />
          <Route path="execution" element={<RequestListPage key="execution" queue="execution" />} />
          <Route path="overdue" element={<RequestListPage key="overdue" queue="overdue" />} />
          <Route path="new" element={<RequestComposerPage key="new" mode="new" />} />
          <Route path="request/:requestId" element={<RequestDetailPage />} />
          <Route path="request/:requestId/edit" element={<RequestComposerPage key="edit" mode="edit" />} />
          <Route path="workflows" element={<WorkflowConfigPage />} />
          <Route path="workflows/new" element={<WorkflowWizardPage key="new" mode="new" />} />
          <Route path="workflows/:workflowId" element={<WorkflowDetailRoute />} />
          <Route path="workflows/:workflowId/edit" element={<WorkflowWizardPage key="edit" mode="edit" />} />
          <Route path="workflows/:workflowId/clone" element={<WorkflowWizardPage key="clone" mode="clone" />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
        <Route path="/members" element={<MembersLayout />}>
          <Route index element={<MemberOverviewPage />} />
          <Route path="directory" element={<MemberDirectoryPage />} />
          <Route path="360" element={<Member360Picker />} />
          <Route path="member/:memberId" element={<Member360Page />} />
          <Route path="restrictions" element={<RestrictionsPage />} />
          <Route path="activity" element={<MemberActivityPage />} />
          <Route path="mpin" element={<MpinPage />} />
        </Route>
        <Route path="/registration-kyc" element={<RegistrationLayout />}>
          <Route index element={<RegistrationOverviewPage />} />
          <Route path="queue" element={<RegistrationQueuePage />} />
          <Route path="review/:memberId" element={<RegistrationReviewPage />} />
          <Route path="assisted" element={<AssistedRegistrationPage />} />
          <Route path="kyc" element={<KycQueuePage />} />
          <Route path="kyc/doc/:docId" element={<DocumentReviewPage />} />
          <Route path="exceptions" element={<KycExceptionsPage />} />
          <Route path="history" element={<VerificationHistoryPage />} />
          <Route path="decisions" element={<MemberDecisionsPage />} />
        </Route>
        <Route path="/schemes" element={<SchemesLayout />}>
          <Route index element={<SchemeOverviewPage />} />
          <Route path="list" element={<SchemeDirectoryPage />} />
          <Route path="calendar" element={<SchemeCalendarPage />} />
          <Route path="new" element={<SchemeBuilderPage key="new" />} />
          <Route path="scheme/:schemeId" element={<SchemeDetailPage />} />
          <Route path="scheme/:schemeId/edit" element={<SchemeBuilderPage key="edit" />} />
          <Route path="settlement" element={<SettlementPage />} />
          <Route path="tiers" element={<TiersPage />} />
          <Route path="referrals" element={<ReferralsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="gamification" element={<GamificationPage />} />
          <Route path="governance" element={<SchemeGovernancePage />} />
        </Route>
        <Route path="/wallet" element={<WalletLayout />}>
          <Route index element={<WalletOverviewPage />} />
          <Route path="members" element={<MemberWalletsPage />} />
          <Route path="member/:memberId" element={<WalletDetailPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="ledger/:ledgerId" element={<LedgerDetailPage />} />
          <Route path="adjustments" element={<AdjustmentsPage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="reversals" element={<ReversalsPage />} />
          <Route path="settlement" element={<SettlementOpsPage />} />
          <Route path="tds" element={<TdsPage />} />
          <Route path="gst" element={<GstPage />} />
          <Route path="reports" element={<FinReportsPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
          <Route path="config" element={<FinConfigPage />} />
        </Route>
        <Route path="/redemption" element={<RedemptionLayout />}>
          <Route index element={<RedemptionOverviewPage />} />
          <Route path="requests" element={<RedemptionRequestsPage />} />
          <Route path="request/:redemptionId" element={<RedemptionDetailPage />} />
          <Route path="payouts" element={<PayoutsPage />} />
          <Route path="vouchers" element={<VouchersPage />} />
          <Route path="products" element={<RedemptionProductsPage />} />
          <Route path="gifts" element={<GiftsPage />} />
          <Route path="cancellation" element={<CancellationPage />} />
          <Route path="limits" element={<LimitsPage />} />
          <Route path="emi" element={<EmiPage />} />
          <Route path="history" element={<RedemptionHistoryPage />} />
        </Route>
        <Route path="/governance/fraud" element={<FraudLayout />}>
          <Route index element={<FraudOverviewPage />} />
          <Route path="queue" element={<ReviewQueuePage />} />
          <Route path="cases" element={<RiskCasesPage />} />
          <Route path="cases/:caseId" element={<RiskCaseDetailPage />} />
          <Route path="rules" element={<RiskRulesPage />} />
          <Route path="anomaly" element={<AnomalyPage />} />
          <Route path="devices" element={<Require permission="devices:view"><DeviceGovernancePage /></Require>} />
          <Route path="devices/:deviceId" element={<Require permission="devices:view"><DeviceDetailPage /></Require>} />
          <Route path="identity" element={<DuplicateIdentityPage />} />
          <Route path="qr" element={<QrIntegrityPage />} />
          <Route path="geo" element={<GeoBranchPage />} />
          <Route path="redemption" element={<RedemptionRiskPage />} />
          <Route path="rate" element={<ScanRatePage />} />
          <Route path="data" element={<DataIntegrityPage />} />
          <Route path="sfdc" element={<SfdcReconPage />} />
          <Route path="history" element={<InvestigationHistoryPage />} />
          <Route path="config-history" element={<RiskConfigHistoryPage />} />
          <Route path="compliance" element={<ComplianceAuditPage />} />
          <Route path="audit" element={<Navigate to="/governance/fraud/compliance?tab=audit" replace />} />
        </Route>
        <Route path="/monitoring/integrations" element={<OpsLayout />}>
          <Route index element={<OpsOverviewPage />} />
          <Route path="directory" element={<OpsDirectoryPage />} />
          <Route path="directory/:integrationId" element={<IntegrationDetailPage />} />
          <Route path="connection-health" element={<ConnectionHealthPage />} />
          <Route path="sfdc" element={<SfdcPage />} />
          <Route path="eseal" element={<EsealPage />} />
          <Route path="connections" element={<OtherConnectionsPage />} />
          <Route path="trace" element={<MessageTracePage />} />
          <Route path="sync" element={<DataSyncPage />} />
          <Route path="jobs" element={<JobsQueuesPage />} />
          <Route path="failures" element={<FailuresPage />} />
          <Route path="retry" element={<RetryPage />} />
          <Route path="reconciliation" element={<OpsReconciliationPage />} />
          <Route path="system-health" element={<Require permission="health:view"><SystemHealthPage /></Require>} />
          <Route path="api-performance" element={<Require permission="health:view"><ApiPerformancePage /></Require>} />
          <Route path="crashes" element={<Require permission="health:view"><CrashPage /></Require>} />
          <Route path="infrastructure" element={<Require permission="health:view"><InfrastructurePage /></Require>} />
          <Route path="authentication" element={<Require permission="auth-audit:view"><AuthenticationPage /></Require>} />
          <Route path="member-diagnostics" element={<Require permission="member-diagnostics:view"><MemberDiagnosticsPage /></Require>} />
          <Route path="adoption" element={<Require permission="adoption:view"><AdoptionPage /></Require>} />
          <Route path="float" element={<Require permission="float-monitoring:view"><FloatPage /></Require>} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="audit" element={<OpsAuditPage />} />
        </Route>
        <Route path="/monitoring/health" element={<Navigate to="/monitoring/integrations/system-health" replace />} />
        <Route path="/reports" element={<AnalyticsLayout />}>
          <Route index element={<Require permission="analytics:view"><AnalyticsOverviewPage /></Require>} />
          <Route path="engagement" element={<Require permission="analytics:view"><EngagementPage /></Require>} />
          <Route path="points" element={<Require permission="analytics:view"><PointsFlowPage /></Require>} />
          <Route path="revenue" element={<Require permission="analytics:view"><RevenuePage /></Require>} />
          <Route path="fraud" element={<Require permission="fraud-rules:view"><FraudAnalyticsPage /></Require>} />
          <Route path="schemes" element={<Require permission="analytics:view"><SchemePerformancePage /></Require>} />
          <Route path="channels" element={<Require permission="analytics:view"><ChannelPage /></Require>} />
          <Route path="geography" element={<Require permission="analytics:view"><GeographyPage /></Require>} />
          <Route path="tiers" element={<Require permission="analytics:view"><TierPage /></Require>} />
          <Route path="support" element={<Require permission="analytics:view"><SupportPage /></Require>} />
          <Route path="retention" element={<Require permission="analytics:view"><RetentionPage /></Require>} />
          <Route path="acquisition" element={<Require permission="analytics:view"><AcquisitionPage /></Require>} />
          <Route path="redemption" element={<Require permission="analytics:view"><RedemptionProductPage /></Require>} />
          <Route path="segmentation" element={<Require permission="analytics:view"><SegmentationPage /></Require>} />
          <Route path="member-360" element={<Require permission="member-analytics:view"><Member360AnalyticsPage /></Require>} />
          <Route path="scans" element={<Require permission="scan-reports:view"><ScanReportsPage /></Require>} />
          <Route path="finance" element={<Require permission="finance-reports:view"><FinanceReportsPage /></Require>} />
          <Route path="programmes" element={<ProgrammeReportsPage />} />
          <Route path="catalogue" element={<CataloguePageA />} />
          <Route path="schedules" element={<SchedulesPage />} />
          <Route path="alerts" element={<Require permission="kpi-governance:view"><ThresholdAlertsPage /></Require>} />
          <Route path="kpis" element={<Require permission="kpi-governance:view"><KpiDictionaryPage /></Require>} />
          <Route path="history" element={<AnalyticsHistoryPage />} />
        </Route>
        <Route path="/gifts" element={<GiftsLayout />}>
          <Route index element={<GiftsOverviewPage />} />
          <Route path="catalogue" element={<Require permission="gift-catalogue:view"><CatalogueDirectoryPage /></Require>} />
          <Route path="catalogue/new" element={<Require permission="gift-catalogue:create"><GiftWizardPage /></Require>} />
          <Route path="catalogue/:giftId" element={<Require permission="gift-catalogue:view"><GiftDetailPage /></Require>} />
          <Route path="catalogue/:giftId/edit" element={<Require permission="gift-catalogue:edit"><GiftWizardPage /></Require>} />
          <Route path="costs" element={<Require permission="gift-catalogue:view"><PointCostPage /></Require>} />
          <Route path="categories" element={<Require permission="gift-catalogue:view"><GiftCategoriesPage /></Require>} />
          <Route path="partners" element={<Require permission="fulfilment-partners:view"><GiftPartnersPage /></Require>} />
          <Route path="vouchers" element={<Require permission="vouchers:view"><VoucherInventoryPage /></Require>} />
          <Route path="recovery" element={<Require permission="vouchers:view"><VoucherRecoveryPage /></Require>} />
          <Route path="orders" element={<GiftOrdersPage />} />
          <Route path="orders/:orderId" element={<GiftOrderDetailPage />} />
          <Route path="tracking" element={<DeliveryTrackingPage />} />
          <Route path="backend" element={<Require permission="gift-redemption:view"><BackendGiftPage /></Require>} />
          <Route path="insurance" element={<InsurancePage />} />
          <Route path="imports" element={<GiftImportsPage />} />
          <Route path="reports" element={<GiftReportsPage />} />
          <Route path="audit" element={<GiftAuditPage />} />
          <Route path="settings" element={<GiftSettingsPage />} />
        </Route>
        <Route path="/masters/communication" element={<CommsLayout />}>
          <Route index element={<CommsOverviewPage />} />
          <Route path="compose" element={<ComposePage />} />
          <Route path="catalogue" element={<CataloguePage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="scheduled" element={<ScheduledPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="history/:commId" element={<CommDetailPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="audiences" element={<AudiencesPage />} />
          <Route path="bot" element={<BotPage />} />
          <Route path="helpdesk" element={<HelpdeskPage />} />
          <Route path="content" element={<SelfServicePage />} />
          <Route path="banners" element={<BannersPage />} />
          <Route path="media" element={<RichContentPage />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="surveys" element={<SurveysPage />} />
          <Route path="config" element={<CommsConfigPage />} />
        </Route>
        <Route path="/masters" element={<MastersOverviewLayout />}>
          <Route index element={<MastersOverviewPage />} />
          <Route path="decisions" element={<MasterDecisionsPage />} />
          <Route path="audit" element={<MastersAuditPage />} />
        </Route>
        <Route path="/masters/products" element={<ProductsLayout />}>
          <Route index element={<ProductDirectoryPage />} />
          <Route path="new" element={<ProductWizardPage />} />
          <Route path="import" element={<BulkImportPage />} />
          <Route path="imports" element={<ImportHistoryPage />} />
          <Route path=":productId" element={<ProductDetailPage />} />
        </Route>
        <Route path="/masters/categories" element={<CategoriesLayout />}>
          <Route index element={<CategoryDirectoryPage />} />
          <Route path="sub" element={<SubCategoryDirectoryPage />} />
        </Route>
        <Route path="/masters/branches" element={<BranchesLayout />}>
          <Route index element={<HierarchyPage />} />
          <Route path="directory" element={<BranchDirectoryPage />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="ownership" element={<OwnershipPage />} />
          <Route path="branch/:code" element={<BranchDetailPage />} />
        </Route>
        <Route path="/masters/scanning" element={<ScanningLayout />}>
          <Route index element={<ScanningDashboard />} />
          <Route path="points" element={<ScanPointsPage />} />
          <Route path="points/new" element={<ScanPointWizardPage />} />
          <Route path="points/:configId" element={<ScanPointDetailPage />} />
          <Route path="rules" element={<RulesDirectoryPage />} />
          <Route path="rules/new" element={<RuleBuilderPage key="new" mode="new" />} />
          <Route path="rules/:ruleId" element={<RuleDetailPage />} />
          <Route path="rules/:ruleId/edit" element={<RuleBuilderPage key="edit" mode="edit" />} />
          <Route path="simulator" element={<SimulatorPage />} />
          <Route path="exceptions" element={<ExceptionSettingsPage />} />
        </Route>
        {ALL_NAV_ITEMS.filter((i) => i.status === "planned").map((i) => (
          <Route key={i.id} path={i.path} element={<ModulePlaceholder />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
