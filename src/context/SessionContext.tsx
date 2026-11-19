import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { endSession as endViewAsSession } from "@/features/platform/viewAsSession";
import { authAdapter } from "@/services/auth";
import { accessLog, recordAccess } from "@/features/access/accessLog";
import { useAccessState } from "@/features/access/store";
import { fullName, getAccessibleGeography, getAccessibleProgrammes, getEffectiveAccess, hasPermission, primaryOrg, roleById, statesTouched, type Decision, type EffectiveAccess } from "@/features/access/engine";
import { parseKey } from "@/config/rbacCatalogue";
import type { Permission, SessionUser } from "@/types/domain";
import type { ActionId, ModuleId } from "@/types/rbac";

interface SessionValue {
  user: SessionUser | null;
  /** Effective access of the signed-in user, from the access engine. */
  access: EffectiveAccess | null;
  /** "module:action" check through the engine. Deny by default; no role-name shortcuts. */
  can: (permission: Permission) => boolean;
  /** Full decision with reason, optionally for a programme / location. */
  decide: (module: ModuleId, action: ActionId, ctx?: { programme?: string; geo?: { state?: string; district?: string; branch?: string } }) => Decision;
  signOut: () => void;
  signInDemo: (userId?: string) => void;
  /** Development only: sign in as another mock user to test their access. */
  switchIdentity: (userId: string) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const access = useAccessState();
  const [userId, setUserId] = useState<string | null>(() => {
    const id = authAdapter.currentUserId();
    // A restored session is recorded once per tab so the access log is never empty for an active session.
    if (id && !accessLog().length) recordAccess(id, "sign_in");
    return id;
  });

  const effective = useMemo(() => (userId ? getEffectiveAccess(access, userId) : null), [access, userId]);

  const user = useMemo<SessionUser | null>(() => {
    if (!userId || !effective?.user) return null;
    const u = effective.user;
    const org = primaryOrg(access, userId);
    const roles = effective.sources.filter((s) => s.effective && s.roleId).map((s) => ({ id: s.roleId!, label: roleById(access, s.roleId!)?.name ?? s.title }));
    const uniqueRoles = roles.filter((r, i) => roles.findIndex((x) => x.id === r.id) === i);
    return {
      id: u.id,
      name: fullName(u),
      email: u.email,
      organisation: { id: org?.id ?? "", name: org?.name ?? "No organisation" },
      roles: uniqueRoles,
      scope: { programmes: getAccessibleProgrammes(access, userId, undefined, effective), states: statesTouched(getAccessibleGeography(access, userId, undefined, effective)) },
      isDemoIdentity: authAdapter.mode === "mock",
    };
  }, [access, userId, effective]);

  const can = useCallback(
    (permission: Permission) => {
      if (!userId || !effective?.accountActive) return false;
      // Personal pages (own profile, sign-out) need only an active session.
      if (permission.startsWith("session:") || permission.startsWith("profile:")) return true;
      const { module, action } = parseKey(permission);
      return hasPermission(access, userId, module, action, {}, effective).allowed;
    },
    [access, userId, effective],
  );

  const decide = useCallback<SessionValue["decide"]>((module, action, ctx) => (userId ? hasPermission(access, userId, module, action, ctx, effective ?? undefined) : { allowed: false, reason: "Not signed in" }), [access, userId, effective]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      access: effective,
      can,
      decide,
      signOut: () => {
        if (userId) endViewAsSession(userId, "sign_out");
        if (userId) recordAccess(userId, "sign_out");
        authAdapter.signOut();
        setUserId(null);
      },
      signInDemo: (id?: string) => {
        authAdapter.signIn(id);
        const now = authAdapter.currentUserId();
        if (now) recordAccess(now, "sign_in");
        setUserId(now);
      },
      switchIdentity: (id: string) => {
        if (userId) endViewAsSession(userId, "sign_out");
        authAdapter.signIn(id);
        recordAccess(id, "identity_switch");
        setUserId(id);
      },
    }),
    [user, effective, can, decide, userId],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** The signed-in user's ID; throws outside an authenticated area. */
export function useActorId() {
  const { user } = useSession();
  if (!user) throw new Error("No signed-in user");
  return user.id;
}
