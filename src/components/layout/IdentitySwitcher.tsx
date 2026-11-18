import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer } from "@/components/ui/Overlay";
import { DemoBadge } from "@/components/ui/primitives";
import { AccountStatusBadge } from "@/pages/users/shared";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { useAccessState } from "@/features/access/store";
import { fullName, getEffectiveAccess, orgById, primaryOrg, roleById } from "@/features/access/engine";

/**
 * DEVELOPMENT ONLY. Signs in as another mock user so each role's real restrictions can be tested.
 * It does not bypass anything: the chosen user's access is evaluated by the same engine.
 */
export function IdentitySwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAccessState();
  const { user, switchIdentity } = useSession();
  const navigate = useNavigate();
  const { notify } = useToast();

  const rows = useMemo(
    () =>
      s.users.map((u) => {
        const a = getEffectiveAccess(s, u.id);
        const roles = Array.from(new Set(a.sources.filter((x) => x.effective).map((x) => roleById(s, x.roleId ?? "")?.name ?? "Direct grant")));
        return { u, org: primaryOrg(s, u.id), roles };
      }),
    [s],
  );

  return (
    <Drawer open={open} onClose={onClose} title="Switch demo identity" subtitle={<DemoBadge label="Development only" />} width={520}>
      <p className="drill__text">Sign in as another mock user to see the portal with their access. The access engine evaluates them exactly as it would in production; nothing is bypassed.</p>
      <ul className="identity-list">
        {rows.map(({ u, org, roles }) => (
          <li key={u.id}>
            <button
              type="button"
              className={`identity-row ${u.id === user?.id ? "is-current" : ""}`}
              onClick={() => {
                switchIdentity(u.id);
                onClose();
                navigate("/");
                notify(`Signed in as ${fullName(u)} (demo)`);
              }}
              disabled={u.id === user?.id}
            >
              <span className="avatar" aria-hidden="true">
                {u.firstName[0]}
                {u.lastName[0]}
              </span>
              <span className="identity-row__text">
                <span className="identity-row__name">
                  {fullName(u)} <span className="mono muted small">{u.id}</span>
                </span>
                <span className="identity-row__meta">
                  {org ? orgById(s, org.id)?.name : "No organisation"} · {roles.length ? roles.join(", ") : "No active role"}
                </span>
              </span>
              <AccountStatusBadge status={u.accountStatus} />
            </button>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
