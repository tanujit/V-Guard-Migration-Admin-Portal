import type { ProgrammeConfig, ProgrammeCode } from "@/types/domain";

/**
 * Central programme master (development configuration).
 *
 * The codes EP, ST, CS, Retailer and DD are the known programme codes. Full names, member types,
 * workflows, KYC checks, TDS models and redemption options below are DEMO ASSUMPTIONS until they are
 * confirmed from the SOW or source application. Every flag is marked `pendingConfirmation`.
 *
 * In production this list is fetched from the programme master API (see services/api.ts).
 */
export const PROGRAMMES: ProgrammeConfig[] = [
  {
    code: "EP",
    name: "EP",
    color: "#ffc400",
    memberTypes: ["Electrician", "Plumber"],
    workflowStatuses: ["submitted", "pending_verification", "pending_kyc", "under_review", "approved", "rejected", "blocked", "inactive"],
    kycChecks: ["aadhaar", "pan", "pan_aadhaar_link", "bank"],
    tdsModel: "at_accrual",
    hasTdsKitty: true,
    referralEnabled: true,
    redemption: { cash: true, gift: true },
    pointValueInr: 1,
    pendingConfirmation: true,
  },
  {
    code: "Retailer",
    name: "Retailer",
    color: "#242833",
    memberTypes: ["Retailer"],
    workflowStatuses: ["submitted", "pending_verification", "pending_kyc", "approved", "rejected", "blocked", "inactive"],
    kycChecks: ["pan", "pan_aadhaar_link", "bank", "gst"],
    tdsModel: "at_redemption",
    hasTdsKitty: false,
    referralEnabled: true,
    redemption: { cash: true, gift: true },
    pointValueInr: 1,
    pendingConfirmation: true,
  },
  {
    code: "CS",
    name: "CS",
    color: "#14a39a",
    memberTypes: ["Counter staff"],
    workflowStatuses: ["submitted", "pending_verification", "under_review", "approved", "rejected", "inactive"],
    kycChecks: ["aadhaar", "pan", "bank"],
    tdsModel: "at_redemption",
    hasTdsKitty: false,
    referralEnabled: false,
    redemption: { cash: true, gift: true },
    pointValueInr: 1,
    pendingConfirmation: true,
  },
  {
    code: "ST",
    name: "ST",
    color: "#f07c1e",
    memberTypes: ["Service technician"],
    workflowStatuses: ["submitted", "pending_verification", "pending_kyc", "approved", "rejected", "blocked", "inactive"],
    kycChecks: ["aadhaar", "pan", "pan_aadhaar_link", "bank"],
    tdsModel: "at_accrual",
    hasTdsKitty: true,
    referralEnabled: true,
    redemption: { cash: true, gift: false },
    pointValueInr: 1,
    pendingConfirmation: true,
  },
  {
    code: "DD",
    name: "DD",
    color: "#4f7fd9",
    memberTypes: ["Distributor"],
    workflowStatuses: ["submitted", "under_review", "approved", "rejected", "inactive"],
    kycChecks: ["pan", "bank", "gst"],
    tdsModel: "to_confirm",
    hasTdsKitty: false,
    referralEnabled: false,
    redemption: { cash: false, gift: true },
    pointValueInr: 0.5,
    pendingConfirmation: true,
  },
];

const byCode = new Map(PROGRAMMES.map((p) => [p.code, p]));

export function getProgramme(code: ProgrammeCode): ProgrammeConfig | undefined {
  return byCode.get(code);
}

export function programmeColor(code: ProgrammeCode): string {
  return byCode.get(code)?.color ?? "#9a9ea8";
}

export const TDS_MODEL_LABEL: Record<ProgrammeConfig["tdsModel"], string> = {
  at_accrual: "At scan / accrual",
  at_redemption: "At redemption",
  not_applicable: "Not applicable",
  to_confirm: "To be confirmed",
};
