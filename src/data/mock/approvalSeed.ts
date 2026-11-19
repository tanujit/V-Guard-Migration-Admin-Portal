/**
 * MOCK APPROVAL CONFIGURATION — development only.
 * Workflow templates, the mandatory-approval policy registry and the open governance decisions.
 * Routing that depends on an unresolved reading of the SOW is kept in Draft and flagged
 * "Business confirmation required"; it never routes live requests.
 */
import { REQUEST_TYPES } from "@/config/approvalCatalogue";
import { ORG, ROLE } from "@/data/mock/rbacSeed";
import type { GovernanceDecision, MandatoryApprovalPolicy, WorkflowStage, WorkflowTemplate } from "@/types/approval";

const T = "2026-10-20T10:00";

const stage = (id: string, name: string, over: Partial<WorkflowStage>): WorkflowStage => ({
  id,
  name,
  description: "",
  approverModel: "role_group",
  fixedUserIds: [],
  approverOrgIds: [],
  eligibleRoleIds: [],
  requiredProfile: "checker",
  requiredAction: "approve",
  programmes: "all",
  geography: { mode: "all" },
  mandatory: true,
  remarksOnApprove: "optional",
  slaHours: 24,
  ...over,
});

const wf = (w: Pick<WorkflowTemplate, "id" | "code" | "name" | "description" | "module" | "requestTypes" | "stages"> & Partial<WorkflowTemplate>): WorkflowTemplate => ({
  makerOrgs: "any",
  programmes: "all",
  status: "active",
  confirmationRequired: false,
  configNote: "",
  sowRef: "",
  conditions: [],
  model: w.stages.length > 1 ? "sequential" : "single",
  separation: { makerExcluded: true, distinctApproverPerStage: true },
  policy: { allowReturn: true, rejectionTerminal: true, allowNewRequestAfterReject: true, rejectRemarks: "required", returnRemarks: "required", allowWithdraw: "before_decision", onResubmit: "restart", expiryDays: null },
  sla: { calendar: "calendar_hours", escalateAfterHours: 24, escalationRoleIds: [ROLE.CLIENT_ADMIN], behaviour: "notify_and_flag", backupUserIds: [] },
  defaultPriority: "medium",
  createdBy: "USR-1001",
  createdAt: T,
  updatedBy: "USR-1001",
  updatedAt: T,
  ...w,
});

export const SEED_WORKFLOWS: WorkflowTemplate[] = [
  wf({
    id: "WF-001",
    code: "WAL-POINTS-2STEP",
    name: "Manual points adjustment and reversal",
    description: "Finance review, then V-Guard governance sign-off, for any manual change to a member's points",
    module: "points-adjustment",
    requestTypes: ["points_adjustment", "points_adjustment_bulk"],
    sowRef: "SOW: points adjustments require second-person approval with reason",
    defaultPriority: "high",
    stages: [
      stage("WF-001-S1", "Finance review", { description: "V-Guard Finance checks balance, reason code and ledger impact", eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 24 }),
      stage("WF-001-S2", "Client governance approval", { description: "V-Guard Client Admin gives final approval", eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 24, remarksOnApprove: "required" }),
    ],
  }),
  wf({
    id: "WF-002",
    code: "SCH-CHANGE",
    name: "Scheme creation and change",
    description: "One V-Guard Checker approves scheme versions, deactivation, closure, special-member extensions and exclusivity rules within their programme and region. Approval never activates a scheme: activation is a separate engine step",
    module: "schemes",
    requestTypes: ["scheme_create", "scheme_modify", "scheme_activation", "scheme_closure", "scheme_extension", "scheme_exclusivity"],
    stages: [stage("WF-002-S1", "V-Guard scheme approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 72 })],
    sla: { calendar: "business_hours", escalateAfterHours: 48, escalationRoleIds: [ROLE.CLIENT_ADMIN], behaviour: "notify_and_flag", backupUserIds: [] },
  }),
  wf({
    id: "WF-003",
    code: "PRD-SKU",
    name: "Product and SKU configuration",
    description: "Any eligible Checker on the Product & SKU master other than the Maker",
    module: "products",
    requestTypes: ["sku_update"],
    stages: [stage("WF-003-S1", "SKU configuration review", { eligibleRoleIds: [ROLE.CHECKER], slaHours: 48 })],
    sla: { calendar: "business_hours", escalateAfterHours: 48, escalationRoleIds: [], behaviour: "notify", backupUserIds: [] },
    defaultPriority: "low",
  }),
  wf({
    id: "WF-004",
    code: "MEM-STATUS",
    name: "Member status change",
    description: "Proposed: SR/PIC confirms on the ground, then V-Guard HO approves the block or reinstatement",
    module: "members",
    requestTypes: ["member_block", "member_reinstate"],
    status: "draft",
    confirmationRequired: true,
    configNote: "Whether a Sales Rep or Branch PIC is Stage 1 for member status changes is not yet confirmed",
    sowRef: "SOW: member block/unblock is a Maker-Checker action; first-level reviewer to be confirmed",
    defaultPriority: "high",
    stages: [
      stage("WF-004-S1", "SR/PIC field confirmation", { approverModel: "geography_group", eligibleRoleIds: [ROLE.BRANCH_MANAGER, ROLE.SALES_REP], approverOrgIds: [ORG.VGUARD], slaHours: 48 }),
      stage("WF-004-S2", "V-Guard HO approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 24, remarksOnApprove: "required" }),
    ],
  }),
  wf({
    id: "WF-005",
    code: "REG-KYC",
    name: "Registration and KYC approval",
    description: "Proposed: regional business review, then Evolve verification of KYC documents",
    module: "registration-kyc",
    requestTypes: ["registration_approval", "kyc_status_override"],
    status: "draft",
    confirmationRequired: true,
    configNote: "Whether Evolve performs a second KYC verification stage after the regional approval is not yet confirmed",
    sowRef: "SOW: registration approval; KYC verification ownership to be confirmed",
    stages: [
      stage("WF-005-S1", "Regional business review", { approverModel: "geography_group", eligibleRoleIds: [ROLE.REGIONAL_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48 }),
      stage("WF-005-S2", "Evolve KYC verification", { approverModel: "org_group", approverOrgIds: [ORG.EVOLVE], slaHours: 24 }),
    ],
  }),
  wf({
    id: "WF-006",
    code: "FIN-RULE",
    name: "Financial rule change",
    description: "V-Guard Finance approves changes to point value, TDS and payout rules",
    module: "financial",
    requestTypes: ["financial_rule_change"],
    defaultPriority: "high",
    stages: [stage("WF-006-S1", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })],
  }),
  wf({
    id: "WF-007",
    code: "RED-CANCEL",
    name: "Redemption cancellation",
    description: "V-Guard Finance approves a redemption cancellation and the refund of points",
    module: "redemption",
    requestTypes: ["redemption_cancellation"],
    defaultPriority: "high",
    stages: [stage("WF-007-S1", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 24 })],
    sla: { calendar: "calendar_hours", escalateAfterHours: null, escalationRoleIds: [], behaviour: "notify", backupUserIds: [] },
  }),
  wf({
    id: "WF-008",
    code: "COM-PUBLISH",
    name: "Communication publication",
    description: "A named V-Guard approver signs off member-facing communication before it is published",
    module: "communication",
    requestTypes: ["communication_publish"],
    defaultPriority: "low",
    stages: [stage("WF-008-S1", "Brand approval", { approverModel: "fixed_user", fixedUserIds: ["USR-2001"], slaHours: 48 })],
    sla: { calendar: "business_hours", escalateAfterHours: 24, escalationRoleIds: [], behaviour: "notify", backupUserIds: [] },
  }),
  wf({
    id: "WF-009",
    code: "FRD-SCAN",
    name: "Scan restriction change",
    description: "A named regional approver confirms scan-limit changes",
    module: "fraud-rules",
    requestTypes: ["scan_restriction_change"],
    configNote: "The named approver's account is suspended: requests wait in Pending assignment until the workflow is updated",
    stages: [stage("WF-009-S1", "Regional risk approval", { approverModel: "fixed_user", fixedUserIds: ["USR-2010"], slaHours: 24 })],
  }),
  wf({
    id: "WF-010",
    code: "SCN-RULE",
    name: "Scan restriction rule change",
    description: "One V-Guard Checker approves the creation, change or deactivation of a scan restriction rule. Approval hands the version to the Scanning Configuration execution adapter, which activates it",
    module: "scan-config",
    requestTypes: ["scan_rule_create", "scan_rule_modify", "scan_rule_deactivate"],
    sowRef: "SOW: Maker-Checker for scan restriction changes",
    stages: [stage("WF-010-S1", "V-Guard configuration approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "optional" })],
    sla: { calendar: "business_hours", escalateAfterHours: 24, escalationRoleIds: [ROLE.CLIENT_ADMIN], behaviour: "notify_and_flag", backupUserIds: [] },
    defaultPriority: "high",
    createdAt: "2026-11-01T10:00",
    updatedAt: "2026-11-01T10:00",
  }),
  wf({
    id: "WF-011",
    code: "SCN-POINTS",
    name: "Scan-In / Scan-Out point configuration",
    description: "Routed as a safeguard while the approval requirement for scan points awaits business confirmation",
    module: "scan-config",
    requestTypes: ["scan_points_change"],
    sowRef: "SOW: Scan-In / Scan-Out points per SKU and branch",
    stages: [stage("WF-011-S1", "V-Guard configuration approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48 })],
    createdAt: "2026-11-01T10:00",
    updatedAt: "2026-11-01T10:00",
  }),
  wf({
    id: "WF-012",
    code: "MEM-REINSTATE",
    name: "Member restriction reinstatement",
    description: "Second-person approval to lift a Program Block or Temporary Hold. The SOW requires second-person approval for unblocking; the detailed SOP is open (OP-BLK1)",
    module: "members",
    requestTypes: ["member_reinstate"],
    sowRef: "SOW: unblocking requires a second-person approval",
    configNote: "OP-BLK1: who may lift each restriction, mandatory reason codes and pre-conditions are not yet confirmed",
    defaultPriority: "high",
    stages: [stage("WF-012-S1", "V-Guard member governance approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })],
    createdAt: "2026-11-09T09:00",
    updatedAt: "2026-11-09T09:00",
  }),
  wf({
    id: "WF-013",
    code: "MEM-ID-OVERRIDE",
    name: "Verified identity override",
    description: "Change to Aadhaar-verified name, date of birth or home address, only under the override permission and with approval",
    module: "members",
    requestTypes: ["member_info_correction"],
    sowRef: "SOW: verified identity is locked; admin override is controlled and audited",
    defaultPriority: "high",
    stages: [stage("WF-013-S1", "V-Guard identity override approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })],
    createdAt: "2026-11-09T09:00",
    updatedAt: "2026-11-09T09:00",
  }),
];

const P6 = "2026-11-08T10:00";
const P7 = "2026-11-08T10:00";
const P8 = "2026-11-08T10:00";
const P9 = "2026-10-15T10:00";
const P10 = "2026-11-01T10:00";
const P11 = "2026-11-10T10:00";
const P12 = "2026-11-12T10:00";
const P13 = "2026-11-18T10:00";
SEED_WORKFLOWS.push(
  wf({ id: "WF-014", code: "SCH-BUDGET", name: "Scheme budget change and backdated calculation", description: "V-Guard scheme approval, then Finance, for any change to a scheme's financial exposure", module: "scheme-budget", requestTypes: ["scheme_budget_change", "scheme_backdated_calc"], sowRef: "SOW 6.2.15 / 6.2.17: backdated calculation and budget exposure", defaultPriority: "high", stages: [stage("WF-014-S1", "V-Guard scheme approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" }), stage("WF-014-S2", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P6, updatedAt: P6 }),
  wf({ id: "WF-015", code: "SCH-SETTLE", name: "Scheme settlement release (two-level)", description: "Two-level approval before unsettled scheme points move to the redeemable wallet (SOW 5.2). Stage 1 V-Guard programme governance, Stage 2 Finance", module: "scheme-settlement", requestTypes: ["scheme_settlement"], sowRef: "SOW 5.2: movement from Unsettled to Redeemable needs two-level approval", defaultPriority: "high", stages: [stage("WF-015-S1", "V-Guard programme approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" }), stage("WF-015-S2", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P6, updatedAt: P6 }),
  wf({ id: "WF-016", code: "TIER-CONFIG", name: "Tier configuration", description: "V-Guard approval of tiers, thresholds and benefits", module: "tiers", requestTypes: ["tier_config"], sowRef: "SOW 6.3 / 10.6", stages: [stage("WF-016-S1", "V-Guard approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P6, updatedAt: P6 }),
  wf({ id: "WF-017", code: "REF-CONFIG", name: "Referral rule configuration", description: "V-Guard approval of referral rules", module: "referrals", requestTypes: ["referral_config"], sowRef: "SOW 6.4 / 10.6", stages: [stage("WF-017-S1", "V-Guard approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P6, updatedAt: P6 }),
  wf({ id: "WF-018", code: "CMP-PUBLISH", name: "Campaign publication, gift batches and backend redemption", description: "V-Guard approval before a campaign is published or gifts are issued on a member's behalf", module: "campaigns", requestTypes: ["campaign_publish", "gift_batch", "backend_redemption"], sowRef: "SOW 6.5", stages: [stage("WF-018-S1", "V-Guard approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "optional" })], createdAt: P6, updatedAt: P6 }),
  wf({ id: "WF-020", code: "PTS-REVERSAL", name: "Points reversal (sales return, invalid claim, wrong credit)", description: "Finance review, then V-Guard governance approval, before a reversal posts. A different person from the Maker approves (SOW 10.5)", module: "points-reversal", requestTypes: ["points_reversal", "sales_return_adjustment"], sowRef: "SOW 10.5: second-person approval with compulsory comment", defaultPriority: "high", stages: [stage("WF-020-S1", "Finance review", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 24 }), stage("WF-020-S2", "Client governance approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 24, remarksOnApprove: "required" })], createdAt: P7, updatedAt: P7 }),
  wf({ id: "WF-021", code: "PTS-TRANSFER", name: "Member-to-member points transfer", description: "Finance review, then V-Guard governance approval. Debit and credit post together after the final approval", module: "points-transfer", requestTypes: ["points_transfer"], sowRef: "SOW 10.5: transfers between members of the same programme", defaultPriority: "high", stages: [stage("WF-021-S1", "Finance review", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 24 }), stage("WF-021-S2", "Client governance approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 24, remarksOnApprove: "required" })], createdAt: P7, updatedAt: P7 }),
  wf({ id: "WF-022", code: "GST-OVERRIDE", name: "Retailer GST gate override", description: "V-Guard governance approves an administrative GST unlock. The override never marks the GSTIN as verified", module: "gst-gate", requestTypes: ["gst_override"], sowRef: "SOW 5.5: administrative override for exceptional cases", defaultPriority: "high", stages: [stage("WF-022-S1", "V-Guard governance approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P7, updatedAt: P7 }),
  wf({ id: "WF-023", code: "RED-LIMITS", name: "Redemption limits and Retailer reserve", description: "Finance, then V-Guard governance, approve redemption limits, minimum balances and Retailer TDS reserves", module: "redemption-limits", requestTypes: ["redemption_limit_change", "retailer_reserve_change"], sowRef: "SOW 10.5 AF22/AF23; SOW 5.4.2 reserve", stages: [stage("WF-023-S1", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 48 }), stage("WF-023-S2", "Client governance approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P7, updatedAt: P7 }),
  wf({ id: "WF-024", code: "TDS-FY", name: "TDS Kitty financial-year reconciliation", description: "Finance approves the FY outcome (Kitty refund). Above-threshold outcomes stay blocked until the slab is confirmed (OP-TDS1)", module: "tds", requestTypes: ["tds_fy_reconciliation"], sowRef: "SOW 5.4.1", defaultPriority: "high", stages: [stage("WF-024-S1", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 72, remarksOnApprove: "required" })], createdAt: P7, updatedAt: P7 }),
  wf({ id: "WF-025", code: "GIFT-BACKEND", name: "Backend gift redemption", description: "Finance approves gifts redeemed on behalf of a member, with points or free of cost", module: "gift-redemption", requestTypes: ["gift_redemption"], sowRef: "SOW 10.5 AF03", stages: [stage("WF-025-S1", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 24 })], createdAt: P7, updatedAt: P7 }),
  wf({ id: "WF-026", code: "COM-TEMPLATE", name: "Message template publication", description: "V-Guard approval of transactional and critical template versions. The previous version stays active until approval", module: "comm-templates", requestTypes: ["comm_template_publish"], sowRef: "SOW 7.2 / 10.8", stages: [stage("WF-026-S1", "V-Guard communication approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "optional" })], createdAt: P8, updatedAt: P8 }),
  wf({ id: "WF-027", code: "CONTENT-PUBLISH", name: "Testimonial and content publication", description: "V-Guard approval of content carrying member identity (consent checked)", module: "content", requestTypes: ["content_publish"], sowRef: "SOW 7.5", stages: [stage("WF-027-S1", "V-Guard content approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P8, updatedAt: P8 }),
  wf({ id: "WF-028", code: "SURVEY-PUBLISH", name: "Survey publication", description: "V-Guard approval before survey invitations (N06) can be sent", module: "surveys", requestTypes: ["survey_publish"], sowRef: "SOW 7.7", stages: [stage("WF-028-S1", "V-Guard approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P8, updatedAt: P8 }),
  wf({ id: "WF-029", code: "BOT-MENU", name: "WhatsApp bot menu publication", description: "V-Guard approval of role-based bot menus (safe actions only)", module: "comm-bot", requestTypes: ["bot_menu_publish"], sowRef: "SOW 7.3", stages: [stage("WF-029-S1", "V-Guard approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P8, updatedAt: P8 }),
  wf({ id: "WF-030", code: "GIFT-CATALOGUE", name: "Gift catalogue publication and point costs", description: "V-Guard approval before a catalogue item, its segmentation or a segment point cost goes live", module: "gift-catalogue", requestTypes: ["gift_catalogue_publish", "gift_point_cost_change"], sowRef: "SOW 8.1 / 8.5", stages: [stage("WF-030-S1", "V-Guard catalogue approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P9, updatedAt: P9 }),
  wf({ id: "WF-031", code: "VOUCHER-RECOVERY", name: "Voucher recovery and reissue", description: "Finance approves a voucher recovery before the provider adapter is asked; a recovery never creates a second active voucher", module: "vouchers", requestTypes: ["voucher_recovery"], sowRef: "SOW 8.2", stages: [stage("WF-031-S1", "Finance approval", { eligibleRoleIds: [ROLE.FINANCE], approverOrgIds: [ORG.VGUARD], slaHours: 24 })], createdAt: P9, updatedAt: P9 }),
  wf({ id: "WF-032", code: "INS-UPLOAD", name: "Insurance card bulk upload", description: "Maker-Checker approval of insurance-card CSV uploads (SOW 8.4). Approval authority to confirm under OP-INS1", module: "insurance", requestTypes: ["insurance_batch_upload"], sowRef: "SOW 8.4 / OP-INS1", stages: [stage("WF-032-S1", "V-Guard insurance approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P9, updatedAt: P9 }),
  wf({ id: "WF-033", code: "INS-PUBLISH", name: "Insurance card publication", description: "V-Guard approval after preview and test download, before cards become available to members", module: "insurance", requestTypes: ["insurance_card_publish"], sowRef: "SOW 8.4 / 10.8 AF20", stages: [stage("WF-033-S1", "V-Guard insurance approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P9, updatedAt: P9 }),
  wf({ id: "WF-034", code: "RISK-THRESHOLD", name: "Anomaly thresholds and redemption risk release", description: "V-Guard approval of rule thresholds (approval does not activate them while OP-02 is open) and of lifting a redemption risk block", module: "fraud-rules", requestTypes: ["risk_threshold_change", "risk_block_release"], sowRef: "SOW 9.3 / AF21; 9.1 redemption abuse", stages: [stage("WF-034-S1", "V-Guard risk approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P10, updatedAt: P10 }),
  wf({ id: "WF-035", code: "RISK-GLOBAL", name: "Global restriction policy", description: "V-Guard approval before a global scan or redemption block is switched on or off", module: "fraud-rules", requestTypes: ["global_restriction_change"], sowRef: "SOW 9.3 global block rules", defaultPriority: "high", stages: [stage("WF-035-S1", "V-Guard HO approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 24, remarksOnApprove: "required" })], createdAt: P10, updatedAt: P10 }),
  wf({ id: "WF-036", code: "DEVICE-ACTION", name: "Device block and release", description: "V-Guard approval of device blocks and releases after the impact on linked accounts is reviewed (separate from member restrictions)", module: "devices", requestTypes: ["device_block", "device_release"], sowRef: "SOW 3.2 / 9.2", stages: [stage("WF-036-S1", "V-Guard approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 24, remarksOnApprove: "required" })], createdAt: P10, updatedAt: P10 }),
  wf({ id: "WF-037", code: "INT-CONFIG", name: "Integration configuration change", description: "V-Guard approval before a production-impacting integration setting (for example the SFDC invitation target frequency) is recorded. Approval does not close the related open decision", module: "integrations", requestTypes: ["integration_config_change"], sowRef: "SOW 11.1 / 11.2", stages: [stage("WF-037-S1", "V-Guard integration approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P11, updatedAt: P11 }),
  wf({ id: "WF-038", code: "KPI-GOVERN", name: "KPI definition and target", description: "V-Guard approval before a KPI definition or target is recorded as confirmed (OP-KPI1). Every dashboard and report then uses the confirmed version", module: "kpi-governance", requestTypes: ["kpi_definition_change", "kpi_target_change"], sowRef: "SOW 13.1", stages: [stage("WF-038-S1", "V-Guard management approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 72, remarksOnApprove: "required" })], createdAt: P12, updatedAt: P12 }),
  wf({ id: "WF-039", code: "APP-THEME", name: "Member app theme", description: "V-Guard approval of a member app theme version (tier or festival). Approval does not publish: publishing stays disabled until OP-THEME1 is confirmed", module: "app-themes", requestTypes: ["app_theme_publish"], sowRef: "SOW 10.8", stages: [stage("WF-039-S1", "V-Guard marketing approval", { eligibleRoleIds: [ROLE.CLIENT_ADMIN], approverOrgIds: [ORG.VGUARD], slaHours: 48, remarksOnApprove: "required" })], createdAt: P13, updatedAt: P13 }),
  wf({ id: "WF-019", code: "GAM-CONFIG", name: "Gamification and bonus configuration", description: "V-Guard approval of badges, streaks, scratch cards, spin wheel, leaderboards and bonuses", module: "gamification", requestTypes: ["gamification_config", "bonus_config"], sowRef: "SOW 6.6", stages: [stage("WF-019-S1", "V-Guard approval", { approverModel: "org_group", approverOrgIds: [ORG.VGUARD], slaHours: 48 })], createdAt: P6, updatedAt: P6 }),
);

const CONFIRM: Record<string, string> = {
  scan_points_change: "To be confirmed whether every scan-point change needs approval; routed as a safeguard",
  tier_config: "Routed as a safeguard; confirm whether every tier edit needs approval",
  referral_config: "Routed as a safeguard; referral mechanics are open (OP-REF1)",
  campaign_publish: "Routed as a safeguard; confirm whether every campaign needs approval",
  gamification_config: "Routed as a safeguard",
  bonus_config: "Routed as a safeguard; bonus triggers are open (OP-SB-BONUS)",
  sku_update: "Point-value changes on SKUs are material; other SKU attributes may not need approval",
  communication_publish: "To be confirmed whether all communication needs approval or only member-wide broadcasts",
  scan_restriction_change: "To be confirmed",
  gift_catalogue_publish: "To be confirmed",
};

/** Configuration changes the SOW itself places under Maker-Checker. */
/** Protective restrictions applied immediately; lifting them goes through approval (member_reinstate). */
const PROTECTIVE = new Set(["member_block"]);
/** SOW 6.2.18 places the scheme lifecycle under Maker-Checker (Create, Draft, Review, Approve, Activate). */
const SCHEME_LIFECYCLE = new Set(["scheme_create", "scheme_modify", "scheme_activation", "scheme_closure", "scheme_extension", "scheme_exclusivity"]);
const REQUIRED_CONFIG = new Set(["scan_rule_create", "scan_rule_modify", "scan_rule_deactivate", ...SCHEME_LIFECYCLE]);

export const SEED_POLICIES: MandatoryApprovalPolicy[] = REQUEST_TYPES.map((t, i) => ({
  id: `POL-${String(i + 1).padStart(3, "0")}`,
  module: t.module,
  requestType: t.id,
  label: t.label,
  category: t.category,
  requirement: PROTECTIVE.has(t.id) ? "confirmation_required" : t.category === "configuration" && !REQUIRED_CONFIG.has(t.id) ? "confirmation_required" : "required",
  reasonRequired: true,
  sowRef: t.category === "financial" ? "SOW: money-related changes require Maker-Checker with mandatory reason" : t.category === "member" ? "SOW: member status and sensitive data changes require Maker-Checker" : "Configuration change: approval requirement pending confirmation",
  note: PROTECTIVE.has(t.id) ? "Applying a block is immediate and audited (protective action); the SOW requires second-person approval to lift it. Confirm under OP-BLK1" : SCHEME_LIFECYCLE.has(t.id) ? "SOW 6.2.18: scheme lifecycle is Maker-Checker. Mandatory; approval does not activate (GD-04 still open on regional sufficiency and minor edits)" : REQUIRED_CONFIG.has(t.id) ? "SOW: Maker-Checker for scan restriction changes. Mandatory" : t.category === "configuration" ? (CONFIRM[t.id] ?? "To be confirmed") : "Mandatory. Cannot be bypassed by any administrative role",
}));

export const SEED_DECISIONS: GovernanceDecision[] = [
  { id: "GD-01", question: "Is the Sales Rep or Branch PIC the first-level reviewer for member block and reinstatement?", context: "WF-004 is drafted with an SR/PIC field-confirmation stage before V-Guard HO approval. Neither role holds a Checker profile today", sowRef: "Member status Maker-Checker", workflowIds: ["WF-004"], status: "open", owner: "V-Guard Channel Loyalty", answer: "" },
  { id: "GD-02", question: "Does Evolve perform a second KYC verification stage after regional registration approval?", context: "WF-005 proposes Regional review → Evolve KYC verification. Ownership of document verification is not stated", sowRef: "Registration & KYC", workflowIds: ["WF-005"], status: "open", owner: "V-Guard / Evolve programme leads", answer: "" },
  { id: "GD-03", question: "Should every manual points adjustment need Client Admin sign-off, or only above a points or value threshold?", context: "WF-001 currently routes all adjustments through two stages. A threshold condition can be added once confirmed", sowRef: "Points adjustment approval", workflowIds: ["WF-001"], status: "proposed", owner: "V-Guard Finance", answer: "" },
  { id: "GD-04", question: "Which scheme changes need approval, and is a regional approval sufficient for state-specific schemes?", context: "WF-002 routes all scheme changes to one V-Guard Checker in scope", sowRef: "Scheme builder approval", workflowIds: ["WF-002"], status: "open", owner: "V-Guard Marketing", answer: "" },
  { id: "GD-05", question: "Is temporary delegation of approval authority required during leave?", context: "Delegation is built but disabled. When enabled, the delegate must independently hold a Checker profile with Approve on the module", sowRef: "Not in SOW", workflowIds: [], status: "open", owner: "V-Guard governance", answer: "" },
  { id: "GD-06", question: "Who may retry a failed execution, and after how many failures must a new approval be raised?", context: "Retries are limited to 3 attempts by Evolve platform administrators; the same approved version is never executed twice", sowRef: "Not in SOW", workflowIds: ["WF-001", "WF-007"], status: "open", owner: "Evolve platform", answer: "" },
  { id: "GD-07", question: "Is there an emergency override that may bypass Maker-Checker, and who holds it?", context: "No override exists. Every override attempt is blocked and audited", sowRef: "Not in SOW", workflowIds: [], status: "open", owner: "V-Guard governance", answer: "" },
];
