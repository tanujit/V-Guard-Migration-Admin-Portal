import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, ChevronRight, CircleHelp, LogOut, Menu, Search, UserRound, Users } from "lucide-react";
import { IdentitySwitcher } from "./IdentitySwitcher";
import { ALL_NAV_ITEMS, findNavItemByPath } from "@/config/navigation";
import { useSession } from "@/context/SessionContext";
import { DEMO_SYSTEM_ALERTS } from "@/data/mock/catalog";
import { markNotificationsRead, useApprovalState } from "@/features/approvals/store";
import { EVENT_LABEL, notificationsFor } from "@/features/approvals/notifications";
import { formatDateTime } from "@/lib/format";
import { Popover } from "@/components/ui/Popover";
import { DemoBadge, StatusBadge } from "@/components/ui/primitives";
import { SearchDialog } from "./SearchDialog";
import type { StatusTone } from "@/types/domain";

export function useBreadcrumbs() {
  const { pathname } = useLocation();
  return useMemo(() => {
    // Longest matching path wins, so /masters/products is not shown as the /masters overview.
    const item = findNavItemByPath(pathname) ?? [...ALL_NAV_ITEMS].sort((a, b) => b.path.length - a.path.length).find((i) => i.path !== "/" && pathname.startsWith(i.path));
    if (!item) return { title: "Page not found", crumbs: [{ label: "Dashboard", to: "/" }] };
    if (item.path === "/") return { title: "Dashboard", crumbs: [{ label: "Overview" }] };
    return { title: item.label, crumbs: [{ label: "Dashboard", to: "/" }, { label: item.group.label }] };
  }, [pathname]);
}

export function Breadcrumbs({ crumbs, current }: { crumbs: { label: string; to?: string }[]; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>
        {crumbs.map((c) => (
          <li key={c.label}>
            {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
            <ChevronRight size={12} strokeWidth={1.75} aria-hidden="true" />
          </li>
        ))}
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}

type Notif = { id: string; at: string; text: string; tone: StatusTone; tag: string; to: string; read: boolean; approval: boolean };

const SYSTEM_ALERTS = DEMO_SYSTEM_ALERTS.slice(0, 3).map((a, i) => ({ id: `n-sys-${i}`, at: a.at, text: a.message, tone: a.tone, to: "/monitoring/health" }));
const NEGATIVE_EVENTS = new Set(["request.rejected", "request.escalated", "execution.failed", "routing.exception"]);
const ACTION_EVENTS = new Set(["approver.assigned", "request.returned", "request.overdue"]);

export function Header({ onOpenMobileNav, onRequestSignOut }: { onOpenMobileNav: () => void; onRequestSignOut: () => void }) {
  const { user } = useSession();
  const { title, crumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set());
  const approvals = useApprovalState();
  const NOTIFICATIONS: Notif[] = useMemo(() => {
    if (!user) return [];
    const mine = notificationsFor(approvals.notifications, user.id).slice(0, 8).map((n) => ({ id: n.id, at: n.at, text: n.message, tone: (NEGATIVE_EVENTS.has(n.event) ? "negative" : ACTION_EVENTS.has(n.event) ? "warning" : "info") as StatusTone, tag: EVENT_LABEL[n.event] ?? "Approval", to: n.link, read: n.read, approval: true }));
    const sys = SYSTEM_ALERTS.map((a) => ({ ...a, tag: a.tone === "negative" ? "Alert" : "Info", read: read.has(a.id), approval: false }));
    return [...mine, ...sys].sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [approvals.notifications, user, read]);
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  const role = user.roles[0]?.label ?? "No role assigned";

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar__menu" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu size={20} strokeWidth={1.5} />
      </button>
      <div className="topbar__titles">
        <Breadcrumbs crumbs={crumbs} current={title} />
        <p className="topbar__title">{title}</p>
      </div>

      <div className="topbar__actions">
        <button type="button" className="topbar__search" onClick={() => setSearchOpen(true)} aria-label="Search the portal (Ctrl K)">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="topbar__search-text">Search</span>
          <kbd className="keycap">Ctrl K</kbd>
        </button>

        <Popover
          label="Notifications"
          width={360}
          trigger={({ open, toggle, id }) => (
            <button type="button" className="icon-btn" data-popover-trigger onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Notifications, ${unread} unread`}>
              <Bell size={18} strokeWidth={1.5} />
              {unread > 0 && <span className="icon-btn__dot" aria-hidden="true" />}
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="menu__head">
                <span className="menu__title">Notifications</span>
                <button type="button" className="link-btn" onClick={() => {
                    setRead(new Set(SYSTEM_ALERTS.map((n) => n.id)));
                    markNotificationsRead(user.id);
                  }} disabled={!unread}>
                  Mark all as read
                </button>
              </div>
              <ul className="notif-list">
                {NOTIFICATIONS.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`notif ${n.read ? "is-read" : ""}`}
                      onClick={() => {
                        if (n.approval) markNotificationsRead(user.id, [n.id]);
                        else setRead((r) => new Set(r).add(n.id));
                        close();
                        navigate(n.to);
                      }}
                    >
                      <StatusBadge tone={n.tone}>{n.tag}</StatusBadge>
                      <span className="notif__text">{n.text}</span>
                      <span className="notif__time num">{formatDateTime(n.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="menu__foot">
                <DemoBadge /> In-portal only. Email and SMS are not configured
              </p>
            </div>
          )}
        </Popover>

        <Popover
          label="Help and support"
          width={300}
          trigger={({ open, toggle, id }) => (
            <button type="button" className="icon-btn" data-popover-trigger onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Help and support">
              <CircleHelp size={18} strokeWidth={1.5} />
            </button>
          )}
        >
          {() => (
            <div className="menu">
              <div className="menu__head">
                <span className="menu__title">Help & support</span>
              </div>
              <dl className="kv kv--menu">
                <div className="kv__row">
                  <dt>Search</dt>
                  <dd>
                    <kbd className="keycap">Ctrl K</kbd>
                  </dd>
                </div>
                <div className="kv__row">
                  <dt>Close panels</dt>
                  <dd>
                    <kbd className="keycap">Esc</kbd>
                  </dd>
                </div>
                <div className="kv__row">
                  <dt>Support desk</dt>
                  <dd className="muted">Contact to be confirmed</dd>
                </div>
              </dl>
              <p className="menu__foot">Portal guide and support channels will be published with the first operational module</p>
            </div>
          )}
        </Popover>

        <Popover
          label="Account"
          width={300}
          trigger={({ open, toggle, id }) => (
            <button type="button" className="profile-btn" data-popover-trigger onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Account menu for ${user.name}`}>
              <span className="avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="profile-btn__text">
                <span className="profile-btn__name">{user.name}</span>
                <span className="profile-btn__role">
                  {user.organisation.name} · {role}
                </span>
              </span>
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" className="profile-btn__chev" />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="identity">
                <span className="avatar avatar--lg" aria-hidden="true">
                  {initials}
                </span>
                <div>
                  <p className="identity__name">{user.name}</p>
                  <p className="identity__meta">{user.organisation.name}</p>
                </div>
              </div>
              <dl className="kv kv--menu">
                <div className="kv__row">
                  <dt>Role</dt>
                  <dd>{role}</dd>
                </div>
                <div className="kv__row">
                  <dt>Organisation</dt>
                  <dd>{user.organisation.name}</dd>
                </div>
                <div className="kv__row">
                  <dt>Access scope</dt>
                  <dd>{user.scope.programmes === "all" ? "All programmes" : user.scope.programmes.join(", ")} · {user.scope.states === "all" ? "All states" : `${user.scope.states.length} states`}</dd>
                </div>
              </dl>
              {user.isDemoIdentity && (
                <p className="menu__note">
                  <DemoBadge label="Demo identity" /> Identity will come from the authentication service
                </p>
              )}
              <ul className="menu__list">
                <li>
                  <button
                    type="button"
                    className="menu__item"
                    onClick={() => {
                      close();
                      navigate("/account/profile");
                    }}
                  >
                    <UserRound size={16} strokeWidth={1.5} aria-hidden="true" />
                    Profile & preferences
                  </button>
                </li>
                {user.isDemoIdentity && (
                  <li>
                    <button
                      type="button"
                      className="menu__item"
                      onClick={() => {
                        close();
                        setSwitchOpen(true);
                      }}
                    >
                      <Users size={16} strokeWidth={1.5} aria-hidden="true" />
                      Switch demo identity
                    </button>
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    className="menu__item menu__item--danger"
                    onClick={() => {
                      close();
                      onRequestSignOut();
                    }}
                  >
                    <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
                    Sign out
                  </button>
                </li>
              </ul>
            </div>
          )}
        </Popover>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <IdentitySwitcher open={switchOpen} onClose={() => setSwitchOpen(false)} />
    </header>
  );
}
