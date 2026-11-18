import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, Ban, Building2, CalendarClock, ClipboardCheck, Eye, History, Hourglass, KeyRound, Lock, PenLine, RotateCcw, UserPlus, Users, UserX } from "lucide-react";
import { KpiCard, type KpiTone, type KpiVariant } from "@/components/ui/KpiCard";
import { DataTable, SearchInput, type Column } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/Panel";
import { SelectField } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { pendingExpiries, reactivateUser, runExpirySweep, suspendUser, useAccessState } from "@/features/access/store";
import { canChangeAccountStatus, canManageUser, fullName, geoCovers, getEffectiveAccess, membershipsOf, orgById, programmesOf, roleById, type AccessSource } from "@/features/access/engine";
import { GEOGRAPHY } from "@/config/geography";
import { PROGRAMMES } from "@/config/programmes";
import { ORG, ROLE } from "@/data/mock/rbacSeed";
import { daysBetween } from "@/data/mock/time";
import { formatDateTime } from "@/lib/format";
import type { KpiMetric } from "@/types/dashboard";
import type { LucideIcon } from "lucide-react";
import type { User } from "@/types/rbac";
import { ACCOUNT_STATUS, AccountStatusBadge, maskMobile, ReasonDialog, SectionTitle } from "./shared";

interface Row {
  u: User;
  orgNames: string[];
  orgIds: string[];
  roles: string[];
  roleIds: string[];
  maker: boolean;
  checker: boolean;
  programmes: "all" | string[];
  geography: string;
  geoSources: AccessSource[];
  expired: number;
}

type Preset = "all" | "active" | "pending" | "suspended" | "locked" | "expired" | "evolve" | "vguard" | "maker" | "checker";

const LOGIN: { value: string; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "stale", label: "Over 30 days ago" },
  { value: "never", label: "Never signed in" },
];

export function UserDirectoryPage() {
  const s = useAccessState();
  const { user, can } = useSession();
  const actorId = user!.id;
  const navigate = useNavigate();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("all");
  const [role, setRole] = useState("all");
  const [profile, setProfile] = useState("all");
  const [programme, setProgramme] = useState("all");
  const [state, setState] = useState("all");
  const [status, setStatus] = useState("all");
  const [login, setLogin] = useState("any");
  const [pageSize, setPageSize] = useState(10);
  const [dialog, setDialog] = useState<{ kind: "suspend" | "reactivate"; user: User } | null>(null);
  const preset = (params.get("view") as Preset) ?? "all";

  const isPlatformAdmin = can("users:manage");
  const canSeeMobile = can("users:view_sensitive");

  const rows: Row[] = useMemo(() => {
    const actorOrgs = new Set(membershipsOf(s, actorId).filter((m) => m.status === "active").map((m) => m.orgId));
    return s.users
      .map((u) => {
        const a = getEffectiveAccess(s, u.id);
        const mems = membershipsOf(s, u.id);
        const live = a.sources.filter((x) => x.effective);
        const roleSources = live.filter((x) => x.kind === "role");
        const progs = live.some((x) => x.scope.programmes === "all") ? ("all" as const) : Array.from(new Set(live.flatMap((x) => programmesOf(x.scope))));
        const geoAll = live.some((x) => x.scope.geography.mode === "all");
        const geoCount = live.reduce((n, x) => n + (x.scope.geography.mode === "selected" ? x.scope.geography.states.length + x.scope.geography.districts.length + x.scope.geography.branches.length : 0), 0);
        return {
          u,
          orgIds: mems.map((m) => m.orgId),
          orgNames: mems.map((m) => orgById(s, m.orgId)?.name ?? m.orgId),
          roles: Array.from(new Set(roleSources.map((x) => roleById(s, x.roleId!)?.name ?? ""))),
          roleIds: Array.from(new Set(a.sources.filter((x) => x.status !== "revoked").map((x) => x.roleId ?? ""))),
          maker: live.some((x) => x.roleId === ROLE.MAKER),
          checker: live.some((x) => x.roleId === ROLE.CHECKER),
          programmes: progs,
          geography: !live.length ? "—" : geoAll ? "All geography" : geoCount ? `${geoCount} location${geoCount > 1 ? "s" : ""}` : "None assigned",
          geoSources: live,
          expired: a.sources.filter((x) => x.status === "expired" || (x.status === "active" && x.validTo && x.note?.startsWith("Ended"))).length,
        };
      })
      .filter((r) => isPlatformAdmin || r.orgIds.some((o) => actorOrgs.has(o)) || r.maker || r.checker);
  }, [s, actorId, isPlatformAdmin]);

  const kpis: { id: Preset; label: string; value: number; desc: string; variant: KpiVariant; tone?: KpiTone; icon: LucideIcon }[] = [
    { id: "all", label: "Total users", value: rows.length, desc: isPlatformAdmin ? "All portal accounts" : "Your organisation and operational users", variant: "primary", icon: Users },
    { id: "active", label: "Active users", value: rows.filter((r) => r.u.accountStatus === "active").length, desc: "Account status Active", variant: "light", icon: Activity },
    { id: "pending", label: "Pending invitations", value: rows.filter((r) => ["invited", "pending_activation"].includes(r.u.accountStatus)).length, desc: "Invited or awaiting activation", variant: "status", tone: "warning", icon: Hourglass },
    { id: "suspended", label: "Suspended users", value: rows.filter((r) => r.u.accountStatus === "suspended").length, desc: "Account suspended", variant: "status", tone: "negative", icon: Ban },
    { id: "locked", label: "Locked users", value: rows.filter((r) => r.u.accountStatus === "locked").length, desc: "Locked after failed sign-ins", variant: "status", tone: "negative", icon: Lock },
    { id: "expired", label: "Expired access", value: rows.reduce((n, r) => n + r.expired, 0), desc: "Assignments past their end date", variant: "status", tone: "warning", icon: CalendarClock },
    { id: "evolve", label: "Evolve users", value: rows.filter((r) => r.orgIds.includes(ORG.EVOLVE)).length, desc: "Members of Evolve Brands", variant: "dark", icon: Building2 },
    { id: "vguard", label: "V-Guard users", value: rows.filter((r) => r.orgIds.includes(ORG.VGUARD)).length, desc: "Members of V-Guard", variant: "light", icon: Building2 },
    { id: "maker", label: "Maker access", value: rows.filter((r) => r.maker).length, desc: "Active Maker profile", variant: "light", icon: PenLine },
    { id: "checker", label: "Checker access", value: rows.filter((r) => r.checker).length, desc: "Active Checker profile", variant: "light", icon: ClipboardCheck },
  ];

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    if (t) {
      const text = [r.u.id, fullName(r.u), r.u.email, r.u.employeeId ?? ""].join(" ").toLowerCase();
      const digits = t.replace(/\D/g, "");
      // Mobile search only for viewers who may see full numbers; others can still search the last four digits.
      const mobileHit = digits.length >= 4 && (canSeeMobile ? r.u.mobile.replace(/\D/g, "").includes(digits) : r.u.mobile.replace(/\D/g, "").endsWith(digits));
      if (!text.includes(t) && !mobileHit) return false;
    }
    if (org !== "all" && !r.orgIds.includes(org)) return false;
    if (role !== "all" && !r.roleIds.includes(role)) return false;
    if (profile === "maker" && !r.maker) return false;
    if (profile === "checker" && !r.checker) return false;
    if (profile === "both" && !(r.maker && r.checker)) return false;
    if (profile === "none" && (r.maker || r.checker)) return false;
    if (programme !== "all" && !(r.programmes === "all" || r.programmes.includes(programme))) return false;
    if (state !== "all" && !r.geoSources.some((x) => geoCovers(x.scope.geography, { state }) || (x.scope.geography.mode === "selected" && [...x.scope.geography.districts, ...x.scope.geography.branches].some((c) => c.startsWith(`${state}-`))))) return false;
    if (status !== "all" && r.u.accountStatus !== status) return false;
    if (login !== "any") {
      const last = r.u.lastLoginAt;
      if (login === "never") {
        if (last) return false;
      } else if (!last) return false;
      else {
        const days = daysBetween(last.slice(0, 10), "2026-11-09");
        if (login === "stale" ? days <= 30 : days > Number(login)) return false;
      }
    }
    switch (preset) {
      case "active":
        return r.u.accountStatus === "active";
      case "pending":
        return ["invited", "pending_activation"].includes(r.u.accountStatus);
      case "suspended":
        return r.u.accountStatus === "suspended";
      case "locked":
        return r.u.accountStatus === "locked";
      case "expired":
        return r.expired > 0;
      case "evolve":
        return r.orgIds.includes(ORG.EVOLVE);
      case "vguard":
        return r.orgIds.includes(ORG.VGUARD);
      case "maker":
        return r.maker;
      case "checker":
        return r.checker;
      default:
        return true;
    }
  });

  const anyFilter = q || org !== "all" || role !== "all" || profile !== "all" || programme !== "all" || state !== "all" || status !== "all" || login !== "any" || preset !== "all";
  const clearAll = () => {
    setQ("");
    setOrg("all");
    setRole("all");
    setProfile("all");
    setProgramme("all");
    setState("all");
    setStatus("all");
    setLogin("any");
    setParams({});
  };

  const columns: Column<Row>[] = [
    { key: "id", header: "User ID", value: (r) => r.u.id, render: (r) => <span className="mono small">{r.u.id}</span> },
    {
      key: "name",
      header: "Name",
      value: (r) => fullName(r.u),
      render: (r) => (
        <span className="cell-2">
          <span className="cell-2__main">{fullName(r.u)}</span>
          <span className="cell-2__sub">{r.u.designation}</span>
        </span>
      ),
    },
    { key: "email", header: "Email", value: (r) => r.u.email, render: (r) => <span className="small">{r.u.email}</span> },
    { key: "mobile", header: "Mobile", value: (r) => (canSeeMobile ? r.u.mobile : null), noSearch: true, render: (r) => <span className="mono small">{maskMobile(r.u.mobile, canSeeMobile)}</span> },
    { key: "org", header: "Organisation", value: (r) => r.orgNames.join(", "), render: (r) => <span title={r.orgNames.join(", ")}>{r.orgNames[0]}{r.orgNames.length > 1 && <span className="more-chip">+{r.orgNames.length - 1}</span>}</span> },
    { key: "role", header: "Business role", value: (r) => r.roles.join(", "), render: (r) => (r.roles.length ? <span title={r.roles.join(", ")}>{r.roles[0]}{r.roles.length > 1 && <span className="more-chip">+{r.roles.length - 1}</span>}</span> : <span className="muted">None active</span>) },
    { key: "profile", header: "Operational profile", value: (r) => [r.maker && "Maker", r.checker && "Checker"].filter(Boolean).join(", ") || "None", render: (r) => (r.maker || r.checker ? <span className="profile-chips">{r.maker && <span className="op-chip op-chip--maker">Maker</span>}{r.checker && <span className="op-chip op-chip--checker">Checker</span>}</span> : <span className="muted">None</span>) },
    { key: "prog", header: "Programmes", value: (r) => (r.programmes === "all" ? "All" : r.programmes.join(", ")), render: (r) => (r.programmes === "all" ? "All" : r.programmes.length ? r.programmes.join(", ") : <span className="muted">—</span>) },
    { key: "geo", header: "Geography", value: (r) => r.geography, render: (r) => <span className={r.geography === "None assigned" ? "neg" : ""}>{r.geography}</span> },
    { key: "status", header: "Account", value: (r) => ACCOUNT_STATUS[r.u.accountStatus].label, render: (r) => <AccountStatusBadge status={r.u.accountStatus} /> },
    { key: "login", header: "Last login", value: (r) => r.u.lastLoginAt ?? "", render: (r) => <span className="small num">{r.u.lastLoginAt ? formatDateTime(r.u.lastLoginAt) : "Never"}</span> },
    { key: "created", header: "Created on", value: (r) => r.u.createdAt, render: (r) => <span className="small num">{formatDateTime(r.u.createdAt).split(",")[0]}</span> },
    {
      key: "actions",
      header: "Actions",
      value: () => null,
      sortable: false,
      noSearch: true,
      render: (r) => {
        const manage = canManageUser(s, actorId, r.u.id, "edit").ok;
        const suspendable = r.u.accountStatus !== "suspended" && r.u.accountStatus !== "deactivated" && canChangeAccountStatus(s, actorId, r.u.id, "suspended").ok;
        const reactivatable = ["suspended", "locked"].includes(r.u.accountStatus) && canChangeAccountStatus(s, actorId, r.u.id, "active").ok;
        return (
          <span className="row-actions" onClick={(e) => e.stopPropagation()}>
            <Link className="icon-btn icon-btn--sm" to={`/governance/users/user/${r.u.id}`} aria-label={`View ${fullName(r.u)}`} title="View user">
              <Eye size={15} strokeWidth={2} />
            </Link>
            {manage && (
              <Link className="icon-btn icon-btn--sm" to={`/governance/users/user/${r.u.id}?tab=roles`} aria-label={`Manage access for ${fullName(r.u)}`} title="Manage roles and access">
                <KeyRound size={15} strokeWidth={2} />
              </Link>
            )}
            {suspendable && (
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => setDialog({ kind: "suspend", user: r.u })} aria-label={`Suspend ${fullName(r.u)}`} title="Suspend user">
                <UserX size={15} strokeWidth={2} />
              </button>
            )}
            {reactivatable && (
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => setDialog({ kind: "reactivate", user: r.u })} aria-label={`Reactivate ${fullName(r.u)}`} title="Reactivate user">
                <RotateCcw size={15} strokeWidth={2} />
              </button>
            )}
            <Link className="icon-btn icon-btn--sm" to={`/governance/users/user/${r.u.id}?tab=audit`} aria-label={`Audit history for ${fullName(r.u)}`} title="Audit history">
              <History size={15} strokeWidth={2} />
            </Link>
          </span>
        );
      },
    },
  ];

  const expiriesDue = pendingExpiries(s);
  const kpiMetric = (k: (typeof kpis)[number]): KpiMetric => ({ id: k.id, label: k.label, value: k.value, format: "count", description: k.desc, goodDirection: "neutral", reference: preset === k.id && k.id !== "all" ? "Filter applied · select again to clear" : k.id === "all" ? "Select to show everyone" : "Select to filter the list", drill: { module: "users", title: k.label } });

  return (
    <>
      <SectionTitle
        title="User directory"
        description={isPlatformAdmin ? "Every portal account across organisations" : "Users in your organisation, plus operational users (Maker/Checker) serving it"}
        actions={
          can("users:create") && (
            <Link to="/governance/users/new" className="btn btn--primary">
              <UserPlus size={16} strokeWidth={2} aria-hidden="true" />
              Create user
            </Link>
          )
        }
      />

      <div className="kpi-grid kpi-grid--5">
        {kpis.map((k) => (
          <div key={k.id} className={preset === k.id && k.id !== "all" ? "kpi-selected" : ""}>
            <KpiCard metric={kpiMetric(k)} onSelect={() => setParams(preset === k.id ? {} : { view: k.id })} variant={k.variant} tone={k.tone} icon={k.icon} compact />
          </div>
        ))}
      </div>

      {expiriesDue > 0 && isPlatformAdmin && (
        <div className="callout callout--info expiry-banner">
          <CalendarClock size={16} strokeWidth={2} aria-hidden="true" />
          <p>
            {expiriesDue} assignment{expiriesDue > 1 ? "s have" : " has"} passed the end date. The access engine already treats {expiriesDue > 1 ? "them" : "it"} as ineffective; the expiry check updates the status and writes the audit record. There is no backend scheduler yet.
          </p>
          <button
            type="button"
            className="btn btn--dark btn--sm"
            onClick={() => {
              const r = runExpirySweep();
              notify(`Mock expiry check: ${r.expired} assignment(s) marked expired`, "positive");
            }}
          >
            Run expiry check (mock)
          </button>
        </div>
      )}

      <Panel padded={false} className="directory">
        <div className="filters-bar">
          <SearchInput value={q} onChange={setQ} placeholder="Name, email, mobile or user ID" label="Search users" />
          <SelectField label="Organisation" value={org} onChange={setOrg} options={[{ value: "all", label: "All organisations" }, ...s.organisations.map((o) => ({ value: o.id, label: o.name }))]} active={org !== "all"} />
          <SelectField label="Business role" value={role} onChange={setRole} options={[{ value: "all", label: "All roles" }, ...s.roles.filter((r) => r.category !== "operational").map((r) => ({ value: r.id, label: r.name }))]} active={role !== "all"} />
          <SelectField label="Maker / Checker" value={profile} onChange={setProfile} options={[{ value: "all", label: "Any" }, { value: "maker", label: "Maker" }, { value: "checker", label: "Checker" }, { value: "both", label: "Both" }, { value: "none", label: "Neither" }]} active={profile !== "all"} />
          <SelectField label="Programme" value={programme} onChange={setProgramme} options={[{ value: "all", label: "All programmes" }, ...PROGRAMMES.map((p) => ({ value: p.code, label: p.code }))]} active={programme !== "all"} />
          <SelectField label="State access" value={state} onChange={setState} options={[{ value: "all", label: "Any geography" }, ...GEOGRAPHY.map((g) => ({ value: g.code, label: g.name }))]} active={state !== "all"} />
          <SelectField label="Account status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, ...Object.entries(ACCOUNT_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} active={status !== "all"} />
          <SelectField label="Last login" value={login} onChange={setLogin} options={LOGIN} active={login !== "any"} />
          <div className="filters-bar__end">
            <SelectField label="Rows per page" value={String(pageSize)} onChange={(v) => setPageSize(Number(v))} options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearAll} disabled={!anyFilter}>
              <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
              Clear all
            </button>
          </div>
        </div>
        <p className="filters-bar__count" aria-live="polite">
          {filtered.length} of {rows.length} users
          {preset !== "all" && (
            <>
              {" "}
              · showing <strong>{kpis.find((k) => k.id === preset)?.label}</strong>
            </>
          )}
        </p>
        <DataTable
          key={pageSize}
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.u.id}
          caption="User directory"
          searchable={false}
          pageSize={pageSize}
          exportName={can("users:export") ? "user-directory" : undefined}
          onRowClick={(r) => navigate(`/governance/users/user/${r.u.id}`)}
          rowActionLabel={(r) => `Open ${fullName(r.u)}`}
          initialSort={{ key: "id", dir: "asc" }}
          emptyTitle="No users match these filters"
        />
      </Panel>

      <ReasonDialog
        open={dialog?.kind === "suspend"}
        title={`Suspend ${dialog ? fullName(dialog.user) : ""}`}
        tone="danger"
        confirmLabel="Suspend account"
        body={dialog && <SuspendImpact userId={dialog.user.id} />}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => {
          const r = suspendUser(actorId, dialog!.user.id, reason);
          if (r.ok) notify(`${fullName(dialog!.user)} suspended`, "positive");
          return r;
        }}
      />
      <ReasonDialog
        open={dialog?.kind === "reactivate"}
        title={`Reactivate ${dialog ? fullName(dialog.user) : ""}`}
        confirmLabel="Reactivate"
        withDate
        body={<p>The account becomes active again. Revoked or suspended access is not restored automatically; open the user to review assignments.</p>}
        onClose={() => setDialog(null)}
        onConfirm={(reason, date) => {
          const r = reactivateUser(actorId, dialog!.user.id, reason, date, []);
          if (r.ok) notify(`${fullName(dialog!.user)} reactivated`, "positive");
          return r;
        }}
      />
    </>
  );
}

/** Lists memberships and assignments that stop working while the account is suspended. */
export function SuspendImpact({ userId }: { userId: string }) {
  const s = useAccessState();
  const a = getEffectiveAccess(s, userId);
  const mems = membershipsOf(s, userId);
  return (
    <div className="impact">
      <p>All access stops while the account is suspended. Assignments are kept and become effective again only after reactivation.</p>
      <p className="impact__h">Affected</p>
      <ul>
        {mems.map((m) => (
          <li key={m.id}>Membership: {orgById(s, m.orgId)?.name}</li>
        ))}
        {a.sources
          .filter((x) => x.effective)
          .map((x) => (
            <li key={x.id}>{x.kind === "direct" ? "Direct grant" : x.title}</li>
          ))}
      </ul>
    </div>
  );
}
