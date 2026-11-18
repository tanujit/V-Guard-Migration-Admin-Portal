/**
 * Authentication adapter — kept separate from authorisation.
 *
 * Authentication answers "who is this?" (identity provider, SSO). Authorisation answers "what may
 * they do?" (features/access/engine.ts). The portal only ever receives a stable user ID from the
 * adapter and evaluates access itself.
 *
 * Phase 2 runs in MOCK mode: a development identity is chosen in the browser. No password, token
 * or credential is stored or displayed. SAML SSO is prepared structurally only — the values below
 * depend on the hosted environment and V-Guard's identity provider and are intentionally empty.
 */
import type { AuthMethod } from "@/types/rbac";

export type AuthMode = "mock" | "saml";

export interface SamlConfig {
  /** Issued by V-Guard's identity provider. Not known yet. */
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  idpSigningCertificate: string | null;
  /** Depend on the hosted portal URL. Generated at deployment, never hardcoded here. */
  spEntityId: string | null;
  acsUrl: string | null;
  /** SAML attribute that carries the stable user identifier to match portal users. */
  userIdAttribute: string | null;
  emailAttribute: string | null;
}

export interface AuthConfig {
  mode: AuthMode;
  saml: SamlConfig;
  capabilities: { invitationEmail: boolean; mfa: boolean; sessionRevocation: boolean; credentialReset: boolean };
}

export const AUTH_CONFIG: AuthConfig = {
  mode: "mock",
  saml: { idpEntityId: null, idpSsoUrl: null, idpSigningCertificate: null, spEntityId: null, acsUrl: null, userIdAttribute: null, emailAttribute: null },
  // None of these services are connected in Phase 2. The UI says so wherever they would appear.
  capabilities: { invitationEmail: false, mfa: false, sessionRevocation: false, credentialReset: false },
};

export const AUTH_METHOD_LABEL: Record<AuthMethod, string> = {
  mock: "Development sign-in (mock)",
  sso_saml: "V-Guard SSO (SAML) — not yet connected",
  email_otp: "Email one-time code — not yet connected",
};

export interface AuthAdapter {
  mode: AuthMode;
  /** Returns the signed-in user's stable ID, or null. */
  currentUserId(): string | null;
  signIn(userId?: string): void;
  signOut(): void;
}

const KEY = "vg-rishta.mock-auth-user";
const DEFAULT_DEMO_USER = "USR-1001";

/** Development adapter: the identity is a mock user chosen in the browser. */
export const mockAuthAdapter: AuthAdapter = {
  mode: "mock",
  currentUserId() {
    try {
      const v = window.sessionStorage.getItem(KEY);
      if (v === "") return null;
      return v ?? DEFAULT_DEMO_USER;
    } catch {
      return DEFAULT_DEMO_USER;
    }
  },
  signIn(userId = DEFAULT_DEMO_USER) {
    try {
      window.sessionStorage.setItem(KEY, userId);
    } catch {
      /* ignore */
    }
  },
  signOut() {
    try {
      window.sessionStorage.setItem(KEY, "");
    } catch {
      /* ignore */
    }
  },
};

export const authAdapter: AuthAdapter = mockAuthAdapter;
