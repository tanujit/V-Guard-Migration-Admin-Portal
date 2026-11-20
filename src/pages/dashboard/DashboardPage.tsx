import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useLocation } from "react-router-dom";
import { ChevronsDownUp, ChevronsUpDown, RotateCw } from "lucide-react";
import { DASHBOARD_GROUPS, DASHBOARD_SECTIONS } from "@/config/dashboardSections";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { useToast } from "@/context/ToastContext";
import { storageGet, storageSet } from "@/lib/csv";
import { FilterBar } from "./FilterBar";
import type { SectionProps } from "./DashboardSection";
import { OverviewSection, ProgrammeSection } from "./sections/OverviewSections";
import { ActiveUsersSection, ApprovalStatusSection, GeographySection, RegistrationSection } from "./sections/MemberSections";
import { PointsSection, RedemptionSection, ScanningSection } from "./sections/ActivitySections";
import { KycSection, TdsSection } from "./sections/ComplianceSections";
import { GiftSection, ReferralSection, SchemeSection } from "./sections/EngagementSections";
import { OperationsSection, RiskSection } from "./sections/ControlSections";

const COMPONENTS: Record<string, ComponentType<SectionProps>> = {
  overview: OverviewSection,
  programmes: ProgrammeSection,
  registrations: RegistrationSection,
  approvals: ApprovalStatusSection,
  active: ActiveUsersSection,
  geography: GeographySection,
  scanning: ScanningSection,
  points: PointsSection,
  redemption: RedemptionSection,
  kyc: KycSection,
  tds: TdsSection,
  schemes: SchemeSection,
  gifts: GiftSection,
  referrals: ReferralSection,
  risk: RiskSection,
  operations: OperationsSection,
};

const OPEN_KEY = "vg-rishta.dashboard-open-sections";
const defaults = Object.fromEntries(DASHBOARD_SECTIONS.map((s) => [s.id, s.defaultOpen]));

export function DashboardPage() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ ...defaults, ...storageGet<Record<string, boolean>>(OPEN_KEY, {}) }));
  const [refreshToken, setRefreshToken] = useState(0);
  const { notify } = useToast();
  const location = useLocation();

  const persist = (next: Record<string, boolean>) => {
    storageSet(OPEN_KEY, next);
    return next;
  };
  const toggle = useCallback((id: string) => setOpen((o) => persist({ ...o, [id]: !o[id] })), []);
  const setAll = (value: boolean) => setOpen(persist(Object.fromEntries(DASHBOARD_SECTIONS.map((s) => [s.id, value]))));
  const allOpen = DASHBOARD_SECTIONS.every((s) => open[s.id]);

  // Deep links from search or the section index: open the section, then scroll to it.
  useEffect(() => {
    const id = location.hash.replace("#sec-", "");
    if (!id || !COMPONENTS[id]) return;
    setOpen((o) => (o[id] ? o : persist({ ...o, [id]: true })));
    const t = setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [location.hash]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="V-Guard Rishta · Operations"
        title="Dashboard"
        description="All programmes at a glance: members, scans, points, verification, finance and operations"
        actions={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(!allOpen)}>
              {allOpen ? <ChevronsDownUp size={14} strokeWidth={1.75} aria-hidden="true" /> : <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden="true" />}
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                setRefreshToken((t) => t + 1);
                notify("Refreshing all sections from demo data");
              }}
            >
              <RotateCw size={14} strokeWidth={1.75} aria-hidden="true" />
              Refresh all
            </button>
          </>
        }
      />

      <FilterBar />

      {DASHBOARD_GROUPS.map((g) => (
        <div key={g.id} className="sec-group">
          <h2 className="sec-group__title">{g.label}</h2>
          {DASHBOARD_SECTIONS.filter((s) => s.group === g.id).map((s) => {
            const Section = COMPONENTS[s.id];
            return <Section key={s.id} def={s} open={!!open[s.id]} onToggle={() => toggle(s.id)} refreshToken={refreshToken} />;
          })}
        </div>
      ))}
    </PageContainer>
  );
}
