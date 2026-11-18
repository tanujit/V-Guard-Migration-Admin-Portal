/**
 * Core domain types shared across the portal.
 * Programme behaviour is described by configuration (see config/programmes.ts), never by
 * hardcoded branches on programme codes inside UI components.
 */

export type ProgrammeCode = string;

/** How TDS applies to a programme. Final model per programme must be confirmed against the SOW. */
export type TdsModel = "at_accrual" | "at_redemption" | "not_applicable" | "to_confirm";

export type RegistrationStatusKey =
  | "submitted"
  | "pending_verification"
  | "pending_kyc"
  | "under_review"
  | "approved"
  | "rejected"
  | "blocked"
  | "inactive";

export type KycCheckKey = "aadhaar" | "pan" | "pan_aadhaar_link" | "bank" | "gst";

export interface ProgrammeConfig {
  code: ProgrammeCode;
  /** Display name. Official names are pending confirmation from the SOW / source application. */
  name: string;
  /** Colour identity used in every chart and chip on the dashboard. */
  color: string;
  /** Member/user types that register under this programme (demo labels, to be confirmed). */
  memberTypes: string[];
  /** Registration workflow states that apply to this programme, in order. */
  workflowStatuses: RegistrationStatusKey[];
  /** Verification checks that apply to this programme. */
  kycChecks: KycCheckKey[];
  tdsModel: TdsModel;
  /** Whether a TDS Kitty is held for this programme. Kept separate from available points. */
  hasTdsKitty: boolean;
  referralEnabled: boolean;
  redemption: { cash: boolean; gift: boolean };
  /** Rupee value of one point, used only to express redemption value. Demo assumption. */
  pointValueInr: number;
  /** True while the configuration is a development assumption awaiting business confirmation. */
  pendingConfirmation: boolean;
}

export interface StatusDefinition<K extends string = string> {
  key: K;
  label: string;
  tone: StatusTone;
  description?: string;
}

export type StatusTone = "neutral" | "info" | "warning" | "positive" | "negative" | "accent";

export interface GeoState {
  code: string;
  name: string;
  weight: number;
  districts: GeoDistrict[];
}

export interface GeoDistrict {
  code: string;
  name: string;
  weight: number;
  branches: GeoBranch[];
}

export interface GeoBranch {
  code: string;
  name: string;
  weight: number;
}

export interface ProductCategory {
  key: string;
  name: string;
  weight: number;
  pointsPerScan: number;
}

/* ---------- Signed-in session (derived from the access engine, see context/SessionContext) ---------- */

/** Permission strings follow "module:action" (see config/rbacCatalogue.ts). */
export type Permission = string;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /** Primary organisation. A user may belong to several; see the user profile. */
  organisation: { id: string; name: string };
  /** Effective business, platform and operational roles. Organisation never implies a role. */
  roles: { id: string; label: string }[];
  /** Union of programmes and states across effective grants (dashboard data scope). */
  scope: { programmes: "all" | ProgrammeCode[]; states: "all" | string[] };
  /** Marks a development identity. Real identity comes from the authentication service. */
  isDemoIdentity: boolean;
}
