import { useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { DataTable } from "@/components/ui/DataTable";
import { StatList } from "@/components/ui/DataBars";
import { StatusBadge } from "@/components/ui/primitives";
import { MODULES } from "@/config/rbacCatalogue";
import { adminSsoStatus, authorityHolders, landingFor, platformOverview, roleMappingMatrix, secondPersonCheck, validateRoleCoverage } from "@/features/platform/store";
import { SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { BcrTag, DecisionRef, PBASE, Tile, usePlatformView } from "./shared";

export function PlatformOverviewPage() {
  const v = usePlatformView();
  const nav = useNavigate();
  const o = platformOverview(v.uid);
  const go = (p: string) => () => nav(`${PBASE}${p}`);
  const status = { not_ready: "Not ready", in_progress: "Readiness in progress", blocked: "Blocked", ready_for_formal_approval: "Ready for formal go-live approval" }[o.goLive.status];
  return (
    <>
      <SectionTitle title="Platform overview" description="Counts by category, not a single readiness percentage: requirements, gates and evidence carry different weight. Every card opens its screen" />
      <div className="ana-tiles">
        <Tile label="Admin users" value={o.totalAdmins} sub={`${o.activeAdmins} active`} onClick={() => nav("/governance/users")} />
        <Tile label="Users pending access approval" value={o.pendingAccess} sub="Pending role assignments" onClick={() => nav("/governance/users")} />
        <Tile label="Roles configured" value={o.roles} sub={`${o.profiles} operational profiles`} onClick={go("/roles")} />
        <Tile label="Active Maker-Checker workflows" value={o.workflows} sub={`${o.pendingApprovals} requests pending`} onClick={() => nav("/governance/approvals")} />
        <Tile label="Pending administrative approvals" value={o.pendingAdminApprovals} sub="Users, themes, KPIs, integrations" onClick={() => nav("/governance/approvals")} />
        <Tile label="Active platform configurations" value={o.activeConfigs} sub={`${o.pendingConfigs} draft or pending`} onClick={go("/configuration")} />
        <Tile label="Open audit exceptions" value={o.auditExceptions} sub="Refused privileged actions + migration exceptions" onClick={go("/audit")} tone={o.auditExceptions ? "warn" : undefined} />
        <Tile label="Open SOW dependencies" value={o.openDependencies} sub="Open or under review, all modules" onClick={go("/open-points")} tone="warn" />
        <Tile label="SOW requirements fully implemented" value={o.coverage.full} sub="AF + SB rows (portal workflow)" onClick={go("/coverage")} />
        <Tile label="Partially implemented" value={o.coverage.partial} sub="AF + SB rows" onClick={go("/coverage")} />
        <Tile label="Pending business confirmation" value={o.coverage.bcr} sub="AF + SB rows" onClick={go("/coverage")} tone="warn" />
        <Tile label="Open critical defects (P0 / P1)" value={o.criticalDefects} sub={`${o.untriaged} untriaged`} onClick={go("/testing?tab=defects")} tone={o.untriaged ? "warn" : undefined} />
        <Tile label="UAT readiness" value={o.uat} sub="OP-UAT1" onClick={go("/testing?tab=uat")} />
        <Tile label="Migration readiness" value={o.migration} sub="OP-MIG1" onClick={go("/migration")} />
        <Tile label="Go-live checklist" value={`${o.goLive.passed} / ${o.goLive.total} passed`} sub={status} onClick={go("/go-live")} tone={o.goLive.status === "ready_for_formal_approval" ? "accent" : "warn"} />
      </div>
      <div className="grid-3">
        <Panel title="Access governance">
          <StatList items={[{ label: "SSO", value: o.sso.live ? "Live" : "Integration prepared · not connected", onSelect: go("/access") }, { label: "Active admin users", value: String(o.activeAdmins) }, { label: "Restricted / inactive users", value: String(o.restricted) }, { label: "Pending access requests", value: String(o.pendingAccess) }, { label: "View-As sessions recorded", value: String(o.viewAs), onSelect: go("/view-as") }]} />
        </Panel>
        <Panel title="Configuration & audit governance">
          <StatList items={[{ label: "Active configurations", value: String(o.activeConfigs), onSelect: go("/configuration") }, { label: "Draft or pending configurations", value: String(o.pendingConfigs) }, { label: "Refused privileged actions (platform)", value: String(o.refusedPrivileged), onSelect: go("/audit") }]} />
        </Panel>
        <Panel title="SOW coverage">
          <StatList items={[{ label: "Fully implemented", value: String(o.coverage.full), onSelect: go("/coverage") }, { label: "Partially implemented", value: String(o.coverage.partial) }, { label: "UI only", value: String(o.coverage.uiOnly) }, { label: "Mock service only", value: String(o.coverage.mockOnly) }, { label: "Backend integration prepared", value: String(o.coverage.prepared) }, { label: "Business confirmation required", value: String(o.coverage.bcr) }, { label: "Not implemented", value: String(o.coverage.notImplemented) }]} />
        </Panel>
      </div>
      <Panel title="Release readiness">
        <StatList items={[{ label: "Critical defects (P0 / P1) open", value: String(o.criticalDefects), onSelect: go("/testing?tab=defects") }, { label: "UAT status", value: o.uat, onSelect: go("/testing?tab=uat") }, { label: "Performance targets meeting target (with evidence)", value: `${o.performance} of 13`, onSelect: go("/performance") }, { label: "Security controls with passed evidence", value: `${o.security} of 9`, onSelect: go("/performance?tab=security") }, { label: "Migration validation", value: o.migration, onSelect: go("/migration") }, { label: "Go-live checklist", value: `${o.goLive.passed} of ${o.goLive.total} · ${status}`, onSelect: go("/go-live") }]} />
      </Panel>
    </>
  );
}

export function AdminAccessPage() {
  const v = usePlatformView();
  const s = adminSsoStatus();
  const users = v.acc.users.slice(0, 20);
  return (
    <>
      <SectionTitle title="Admin access & SSO" description="Staff sign in with their V-Guard email through Single Sign-On (SOW AF01) — never with a member MPIN. After sign-in the portal resolves organisation, role, programme and geography, and shows only authorised modules" />
      <Notice tone="warn"><strong>SSO is integration-ready, not live.</strong> The SAML adapter (<span className="mono">services/auth.ts</span>) is prepared; this build signs in with development identities. No credential or secret is stored in the frontend.</Notice>
      <div className="grid-2">
        <Panel title="Authentication">
          <dl className="dl-grid small">
            <dt>Mode</dt><dd>{s.mode === "mock" ? "Development (mock authentication adapter)" : "SAML"}</dd>
            <dt>Identity provider</dt><dd>{s.provider}</dd>
            <dt>Method</dt><dd>{s.method}</dd>
            <dt>Member MPIN</dt><dd>{s.memberMpin}</dd>
            <dt>SAML values missing</dt><dd className="mono">{s.missing.join(", ") || "None"}</dd>
            <dt>MFA / session revocation</dt><dd>{s.capabilities.mfa ? "Available" : "Not connected"} / {s.capabilities.sessionRevocation ? "Available" : "Not connected"}</dd>
          </dl>
        </Panel>
        <Panel title="Authentication audit" subtitle="Sign-in, identity switch and sign-out are logged (Access log)">
          <p className="small">See <a href={`${PBASE}/audit`}>Audit</a> → module Access. IP address and device come from the gateway in production; the mock adapter records “Not captured”.</p>
        </Panel>
      </div>
      <Panel padded={false} title="Role-scoped landing" subtitle="What each user sees after sign-in, from the permission engine">
        <DataTable rows={users.map((u) => ({ u, l: landingFor(u.id) }))} rowKey={(x) => x.u.id} caption="Role-scoped landing" columns={[
          { key: "u", header: "User", value: (x) => x.l.user },
          { key: "o", header: "Organisation", value: (x) => x.l.org },
          { key: "r", header: "Roles", value: (x) => x.l.roles.join(", "), render: (x) => <span className="small">{x.l.roles.join(", ") || "—"}</span> },
          { key: "s", header: "Account", value: (x) => x.u.accountStatus },
          { key: "lp", header: "Landing page", value: (x) => x.l.landing, render: (x) => <span className="mono small">{x.l.landing}</span> },
          { key: "m", header: "Modules visible", value: (x) => x.l.modules.length, align: "right" },
        ]} />
      </Panel>
    </>
  );
}

export function RoleGovernancePage() {
  const roles = roleMappingMatrix();
  const cov = validateRoleCoverage();
  const sp = secondPersonCheck();
  const mpin = authorityHolders("members", "reset_credentials");
  const cancel = authorityHolders("redemption", "cancel");
  return (
    <>
      <SectionTitle title="Role & permission governance" description="The established Evolve / V-Guard role model is kept. This page maps the SOW's legacy roles onto it, checks the five SOW baseline actions per module, and verifies second-person approval for money and member-status actions" />
      <Notice tone="warn">The final role list and the View / Create / Edit / Approve / Disable mapping — including who resets an MPIN and who cancels a redemption — are pending <DecisionRef id="OP-RBAC1" />.</Notice>
      <Panel padded={false} title="SOW role → portal role mapping">
        <DataTable rows={roles} rowKey={(r) => r.id} caption="SOW role mapping" searchable={false} columns={[
          { key: "s", header: "SOW role", value: (r) => r.sowRole, render: (r) => <span><strong>{r.sowRole}</strong><br /><span className="muted small">{r.responsibilities}</span></span> },
          { key: "p", header: "Portal role(s)", value: (r) => r.roles.map((x) => x.name).join(", "), render: (r) => <span className="small">{r.roles.map((x) => `${x.name} (${x.org})`).join("; ")}</span> },
          { key: "sc", header: "Programme / geography scope", value: (r) => r.roles.map((x) => `${x.programmeScope} / ${x.geoScope}`).join("; "), render: (r) => <span className="small">{r.roles.map((x) => `${x.programmeScope} · ${x.geoScope}`).join("; ")}</span> },
          { key: "m", header: "Modules", value: (r) => r.moduleCount, align: "right" },
          { key: "a", header: "SOW actions held", value: (r) => r.actions.join(", ") },
          { key: "ap", header: "Approval authority", value: (r) => r.approvalAuthority, render: (r) => <span className="small">{r.approvalAuthority}</span> },
          { key: "st", header: "Mapping", value: (r) => r.mapping, render: (r) => <span><StatusBadge tone={r.mapping === "mapped" ? "positive" : "warning"}>{r.mapping.replace(/_/g, " ")}</StatusBadge><br /><span className="small muted">{r.note}</span></span> },
          { key: "c", header: "Confirmation", value: (r) => r.confirmation, render: (r) => (r.confirmation === "confirmed" ? <StatusBadge tone="positive">Confirmed</StatusBadge> : <BcrTag>OP-RBAC1</BcrTag>) },
        ]} />
      </Panel>
      <div className="grid-2">
        <Panel padded={false} title="Second-person approval for money and member status" subtitle="Common Approval Engine: a Maker can never approve their own request, and a reason is required">
          <DataTable rows={sp} rowKey={(r) => r.action} caption="Second-person approvals" searchable={false} columns={[
            { key: "a", header: "Action", value: (r) => r.action },
            { key: "t", header: "Request types", value: (r) => r.knownTypes.join(", "), render: (r) => <span className="mono small">{r.knownTypes.join(", ")}</span> },
            { key: "w", header: "Workflows", value: (r) => r.workflows.join(", "), render: (r) => <span className="mono small">{r.workflows.join(", ") || "—"}</span> },
            { key: "s", header: "Status", value: (r) => r.status, render: (r) => <StatusBadge tone={r.status === "covered" ? "positive" : "negative"}>{r.status}</StatusBadge> },
          ]} />
        </Panel>
        <Panel title="Open authority decisions (OP-RBAC1)">
          <StatList items={[
            { label: "MPIN reset — current holders", value: String(mpin.length), note: mpin.map((u) => `${u.name} (${u.role})`).join(", ") || "Nobody" },
            { label: "Redemption cancellation — current holders", value: String(cancel.length), note: `${cancel.map((u) => `${u.name} (${u.role})`).join(", ") || "Nobody"} · SOW 10.5 keeps it with Evolve Operations` },
          ]} />
        </Panel>
      </div>
      <Panel padded={false} title="SOW baseline actions per module" subtitle="View, Create, Edit, Approve, Disable. Additional actions (Submit, Publish, Export…) never replace them">
        <DataTable rows={cov} rowKey={(r) => r.module} caption="Baseline action coverage" pageSize={15} columns={[
          { key: "m", header: "Module", value: (r) => r.label },
          { key: "b", header: "Baseline actions present", value: (r) => r.baseline.join(", ") },
          { key: "x", header: "Not offered", value: (r) => r.missing.join(", "), render: (r) => <span className="small muted">{r.missing.join(", ") || "—"}</span> },
          { key: "a", header: "Additional actions", value: (r) => r.additional.join(", "), render: (r) => <span className="small">{r.additional.join(", ")}</span> },
        ]} />
        <p className="muted small" style={{ padding: "0 14px 12px" }}>{MODULES.length} modules. A missing action is often correct (read-only modules have no Create); the list is for review under OP-RBAC1.</p>
      </Panel>
    </>
  );
}
