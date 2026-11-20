import { NavLink, useLocation } from "react-router-dom";
import { activeNavItem, activeSection, type HubSection, type NavItem } from "@/config/navigation";
import { useSession } from "@/context/SessionContext";

/** The sidebar hub that owns the current page, with the sections this user may open. */
export function useHub(): { item?: NavItem; sections: HubSection[]; active?: HubSection } {
  const { pathname } = useLocation();
  const { can } = useSession();
  const item = activeNavItem(pathname);
  const sections = (item?.sections ?? []).filter((s) => can(s.permission));
  return { item, sections, active: item ? activeSection(item, pathname) : undefined };
}

/** Switches between the sections of one hub (for example Members and Registration & KYC). */
export function HubSwitcher({ label, sections, active }: { label: string; sections: HubSection[]; active?: HubSection }) {
  if (sections.length < 2) return null;
  return (
    <nav className="hub-switch" aria-label={`${label} sections`}>
      {sections.map((s) => (
        <NavLink key={s.path} to={s.path} end className={() => `hub-switch__opt ${active?.path === s.path ? "is-active" : ""}`} aria-current={active?.path === s.path ? "page" : undefined}>
          {s.label}
        </NavLink>
      ))}
    </nav>
  );
}
