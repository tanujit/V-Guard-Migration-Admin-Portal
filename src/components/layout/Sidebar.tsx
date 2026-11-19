import { useState, type FocusEvent, type MouseEvent } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { NAVIGATION, type NavItem } from "@/config/navigation";
import { useSession } from "@/context/SessionContext";
import { storageGet, storageSet } from "@/lib/csv";

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onRequestSignOut: () => void;
}

const GROUP_KEY = "vg-rishta.nav-groups";

/**
 * Placeholder product mark. There is no official V-Guard logo asset in the repository; when one is
 * supplied, render it here unchanged and delete this SVG.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="brand__mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--vg-yellow)" />
      <path d="M9 9l7 14 7-14" fill="none" stroke="var(--vg-black)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onRequestSignOut }: Props) {
  const { can } = useSession();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => storageGet(GROUP_KEY, {}));
  const [tip, setTip] = useState<{ label: string; top: number; planned: boolean } | null>(null);

  const isGroupOpen = (id: string) => openGroups[id] ?? true;
  const toggleGroup = (id: string) =>
    setOpenGroups((g) => {
      const next = { ...g, [id]: !(g[id] ?? true) };
      storageSet(GROUP_KEY, next);
      return next;
    });

  const showTip = (el: HTMLElement, item: NavItem) => {
    if (!collapsed) return;
    const rect = el.getBoundingClientRect();
    setTip({ label: item.label, top: rect.top + rect.height / 2, planned: item.status === "planned" });
  };

  const renderItem = (item: NavItem) => {
    if (!can(item.permission)) return null;
    const Icon = item.icon;
    const planned = item.status === "planned";
    const common = {
      onMouseEnter: (e: MouseEvent<HTMLElement>) => showTip(e.currentTarget, item),
      onMouseLeave: () => setTip(null),
      onFocus: (e: FocusEvent<HTMLElement>) => showTip(e.currentTarget, item),
      onBlur: () => setTip(null),
      "aria-label": collapsed ? `${item.label}${planned ? " (planned)" : item.proposed ? " (proposed)" : ""}` : undefined,
      title: collapsed ? undefined : planned ? `${item.label} — coming in a later phase` : item.label,
    };
    const inner = (
      <>
        <span className="nav-item__icon">
          <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="nav-item__label">{item.label}</span>
        {planned && <span className="nav-item__tag">Later</span>}
        {item.proposed && <span className="nav-item__tag nav-item__tag--proposed">Proposed</span>}
      </>
    );
    if (item.action === "logout") {
      return (
        <li key={item.id}>
          <button type="button" className="nav-item" onClick={onRequestSignOut} {...common}>
            {inner}
          </button>
        </li>
      );
    }
    return (
      <li key={item.id}>
        <NavLink to={item.path} end={item.path === "/" || item.exact} className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""} ${planned ? "is-planned" : ""} ${item.proposed ? "is-proposed" : ""}`} onClick={onCloseMobile} {...common}>
          {inner}
        </NavLink>
      </li>
    );
  };

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} aria-hidden="true" />}
      <aside className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`} aria-label="Primary">
        <div className="sidebar__brand">
          <NavLink to="/" className="brand" aria-label="V-Guard Rishta operations portal, dashboard">
            <BrandMark />
            <span className="brand__text">
              <span className="brand__name">V-Guard Rishta</span>
              <span className="brand__sub">Operations & governance</span>
            </span>
          </NavLink>
          <button type="button" className="icon-btn icon-btn--dark sidebar__mobile-close" onClick={onCloseMobile} aria-label="Close navigation">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <nav className="sidebar__nav">
          {NAVIGATION.map((group) => {
            const items = group.items.filter((i) => can(i.permission));
            if (!items.length) return null;
            const open = collapsed || isGroupOpen(group.id);
            return (
              <div key={group.id} className="nav-group">
                {!collapsed ? (
                  <button type="button" className="nav-group__head" aria-expanded={open} aria-controls={`nav-${group.id}`} onClick={() => toggleGroup(group.id)}>
                    <span>{group.label}</span>
                    <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" className="nav-group__chev" />
                  </button>
                ) : (
                  <hr className="nav-group__rule" />
                )}
                {open && (
                  <ul id={`nav-${group.id}`} className="nav-group__list">
                    {items.map(renderItem)}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__foot">
          <p className="sidebar__env">
            <span className="sidebar__env-dot" aria-hidden="true" />
            <span className="sidebar__env-text">Development build · demo data</span>
          </p>
          <button type="button" className="icon-btn icon-btn--dark sidebar__collapse" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-pressed={collapsed}>
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.5} /> : <PanelLeftClose size={18} strokeWidth={1.5} />}
          </button>
        </div>
      </aside>
      {tip && (
        <div className="nav-tip" role="tooltip" style={{ top: tip.top }}>
          {tip.label}
          {tip.planned && <span className="nav-tip__sub">Coming in a later phase</span>}
        </div>
      )}
    </>
  );
}
