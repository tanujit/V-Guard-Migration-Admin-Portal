# V-Guard Rishta — Enterprise Operations & Governance Portal

- **Phase 1:** portal foundation, application shell, navigation and the executive dashboard.
- **Phase 2:** user, organisation and role management, plus granular RBAC.
- **Phase 3:** the central Maker-Checker approval engine and the Approval Centre.
- **Phase 4:** master data (products, SKUs, categories, branch hierarchy with mock SFDC sync) and scanning configuration (Scan-In/Out points, restriction rule builder, simulator).
- **Phase 5:** Member Management, Member 360, programme-specific Registration and document-wise KYC.
- **Phase 6:** Scheme & Incentive Management: the 21-component Scheme Builder, versioning, budget and exposure, two-level settlement, tiers, referrals, campaigns and contests, gamification and bonuses.
- **Phases 7–12:** wallet, TDS and redemption; communication centre; gifts and insurance; fraud and risk; integration monitoring; reports and analytics.
- **Phase 13:** platform administration, read-only View-As, app usage analytics, app themes, configuration registry, central audit, SOW coverage, and UAT / migration / go-live readiness. See the [developer handover](docs/HANDOVER.md).
- **Phase 14A:** interactive client demonstration: simulation banner, role switcher (10 personas), Client Demo Centre with guided scenarios, scan and redemption simulators, integration outcome controls, event timeline and demo reset. See the [client demo guide](docs/CLIENT-DEMO-GUIDE.md).
- **Phase 14 (proposed scope):** a Super Admin-only, demo-mode prototype and scope assessment for SOW Module 12 (Job Management & Field Tooling). Not approved, not live.

> All figures, users, requests and decisions in this build are **development / demo data** held in
> the browser. Nothing is connected to V-Guard or Evolve systems, no email is sent, and no approval
> changes any real record.

## Run it

The build is a **simulation build** by default (`VITE_APP_ENV` unset): a persistent banner marks every page and the Client Demo Centre is available. Set `VITE_APP_ENV=production` at build time to hide every simulation control.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
```

Requires Node 18+. On this machine Windows Application Control blocks Rollup's native binary, so
`package.json` overrides `rollup` with the official WebAssembly build (`@rollup/wasm-node`). Remove
the override if your environment allows native modules.

Useful URLs while testing:

| URL | What it shows |
| --- | --- |
| `/` | Dashboard |
| `/#sec-scanning` | Opens and scrolls to a dashboard section |
| `/?demoError=scanning,points` | Forces those sections into their error state |
| `/governance/users` | User & role management (Phase 2) |
| `/governance/approvals` | Approval Centre: inbox, KPIs and recent activity (Phase 3) |
| `/governance/approvals/workflows` | Workflow templates, governance decisions, policy, SLA, delegation |
| `/members` | Member Management and Member 360 (Phase 5) |
| `/registration-kyc` | Registration queue, assisted EP registration, KYC verification (Phase 5) |
| `/schemes` | Scheme & Incentive Management: overview, schemes, calendar, settlement, tiers, referrals, campaigns, gamification, governance (Phase 6) |
| `/schemes/new` | Scheme Builder |
| `/wallet` | Wallet & points: overview, member wallets, ledger and passbook, adjustments, transfers, reversals, settlement, TDS, GST gate, reports, reconciliation, configuration (Phase 7) |
| `/redemption` | Redemption & fulfilment: requests, payouts, vouchers, products, backend gifts, cancellation, limits, EMI, history (Phase 7) |
| `/masters/communication` | Communication centre: N01–N11 catalogue, templates, composer, delivery, WhatsApp bot, helpdesk, content, banners, surveys (Phase 8) |
| `/governance/fraud` | Fraud & risk: review queue, risk cases, rules, anomaly detection, devices, duplicate identity, QR integrity, geo and branch, redemption risk, scan rate, data integrity, SFDC reconciliation, history, decisions, compliance & audit (Phase 10) |
| `/reports` | Reports & analytics: business overview and 13 dashboards, Member 360 analytics, Scan & QR, finance (points ageing, TDS monthly liability), programme and DD reports, report catalogue, scheduled reports, threshold alerts, KPI dictionary, history, lineage and reconciliation (Phase 12) |
| `/monitoring/integrations` | Integration monitoring: overview, directory, connection health, SFDC, eSeal, other connections, message trace, data sync, jobs & queues, failures, retry, reconciliation, system health, API performance, crashes, infrastructure, authentication, member diagnostics, adoption, float & kitty, alerts & incidents, audit & decisions (Phase 11) |
| `/governance/platform` | Platform administration: overview, admin access & SSO, roles & permissions, configuration registry, audit & error catalogue, View-As, app usage analytics, app themes, SOW coverage, open points & scope, performance & capacity, testing & UAT, data migration, go-live checklist, release & rollback (Phase 13) |
| `/governance/demo-centre` | Client Demo Centre (simulation builds only): personas, guided scenarios, member-app scan and redemption simulator, integration outcomes, event timeline, demo reset (Phase 14A) |
| `/future/job-management` | PROPOSED Module 12 prototype — job lifecycle with a mock Siebel adapter, allocation workbench, simulated rewards, verification flag, Happy Points and E-ID previews, field tooling and the scope decision register (Phase 14, Super Admin only) |
| `/gifts` | Gift & fulfilment: catalogue, point costs, categories, partners and SKU mapping, vouchers and recovery, physical orders, delivery tracking, backend gifts, insurance cards, imports, reports, audit, decisions (Phase 9) |
| `/masters` | Master data overview, decision register, master audit log (Phase 4) |
| `/masters/scanning` | Scanning configuration: points, rules, simulator (Phase 4) |
| `/members` (any planned module path) | "Coming in a subsequent phase" placeholder |

Use the identity switcher in the header (development only) to act as another mock user. Mock data is
kept in `sessionStorage`; clear it (or open a new tab) to reseed.

Tests:

- `npm run test:schemes` runs the 119 Phase 6 scheme cases in Node against the real stores and engines.
- `npm run test:schemes:gaps` runs the audit probes (see `docs/PHASE-6-AUDIT.md`).
- `npm run test:comms` runs the 37 Phase 8 Communication Centre cases (see `docs/PHASE-8-REPORT.md`).
- `npm run test:wallet` runs the 92 Phase 7 wallet, TDS and redemption cases (see `docs/PHASE-7-REPORT.md`).
- `npm run test:risk` runs the 88 Phase 10 fraud, risk, device, data integrity and compliance cases (see `docs/PHASE-10-REPORT.md`).
- `npm run test:gifts` runs the 85 Phase 9 gift, voucher, fulfilment and insurance cases (see `docs/PHASE-9-REPORT.md`).
- `npm run test:ops` runs the 114 Phase 11 integration, monitoring, system health and technical operations cases (see `docs/PHASE-11-REPORT.md`).
- `npm run test:analytics` runs the 155 Phase 12 analytics, reporting, KPI governance, finance report and export cases (see `docs/PHASE-12-REPORT.md`).
- `npm run test:platform` runs the 126 Phase 13 platform, View-As, usage, theme, governance and readiness cases (see `docs/PHASE-13-REPORT.md`).
- `npm run test:jobs` runs the 67 Phase 14 Module 12 prototype cases (see `docs/PHASE-14-REPORT.md`).
- `npm run test:demo` runs the 38 Phase 14A cross-module simulation acceptance cases (see `docs/PHASE-14A-REPORT.md`).
- `npm run report:tests` runs every suite and records the results shown on Platform administration → Testing & UAT.

Pages are lazy-loaded per route, so each module's code downloads the first time it opens. The
approval seed replays the module-raised demo requests from
`src/data/mock/generated/approvalModuleSteps.ts`. After changing the master or scheme seeds, run
`npm run seed:approval-steps` to regenerate that file; test 119 fails until you do.

## Stack

React 18 + TypeScript + Vite, React Router 6, Recharts 2 for charts, Lucide icons. Styling is plain
CSS on design tokens (`src/styles/tokens.css`) — no CSS framework.

## Where things live

```
src/
  config/        programmes, statuses, geography, navigation, RBAC catalogue, approval catalogue
  types/         domain, dashboard, rbac and approval models
  data/          period resolution, mock dashboard engine, RBAC seed, approval workflow/policy seed
  features/
    access/      RBAC engine (pure policy) + in-browser store
    schemes/     scheme engine (validation, overlap, exposure, settlement), mock evaluation adapter, seed, store
    comms/       communication engine (audience, templates, dispatch, fallback), event bridge, store
    wallet/      wallet engine (ledger, balances, GST gate, limits, reconciliation), mock wallet service, TDS adapter, seed, store
    members/     member eligibility, KYC completeness, restrictions + store and ledger abstraction
    masters/     master data and scanning engine (validation, conflicts, simulator) + store
    approvals/   approval engine (routing, eligibility, transitions), execution adapters,
                 notification service, demo scenarios, store
  services/      API contracts with mock and not-connected HTTP implementations
  context/       session, filters, toasts, drill-down panel
  hooks/         useSection (per-section loading, refresh, stale-response guard)
  components/    layout, ui, charts, form, rbac, filters
  pages/
    dashboard/   DashboardPage and sections A–P
    users/       Phase 2 screens
    masters/     Phase 4 screens (overview, products, import, categories, branches, scanning, rules)
    schemes/     Phase 6 screens (overview, builder, scheme detail, settlement, incentives, governance)
    approvals/   Phase 3 screens (lists, request detail, composer, workflow config, wizard, analytics)
  styles/        tokens, base, components, shell, dashboard, access, approvals
```

## Switching to real APIs

1. Dashboard: implement `httpDashboardSource` in `src/services/api.ts` and set `DATA_MODE` to `"http"`.
2. Access: implement `httpAccessApi` in `src/services/accessApi.ts`.
3. Members: implement `httpMemberApi` in `src/services/memberApi.ts`; verification services stay server-side.
4. Master data: implement `httpMasterDataApi` in `src/services/masterDataApi.ts`. Hierarchy data arrives from SFDC; the portal never writes back.
5. Schemes: implement `httpSchemeApi` in `src/services/schemeApi.ts`. Rewards, budgets and settlement must be calculated by the backend scheme engine and ledger; the in-browser mock engine is for development only.
6. Approvals: implement `httpApprovalApi` in `src/services/approvalApi.ts`. The backend must enforce
   the same rules as `src/features/approvals/engine.ts`.

Screens consume these contracts, so they do not change. No endpoints are defined, because none have
been agreed.

Reports: [Phase 1](docs/PHASE-1-REPORT.md) · [Phase 3](docs/PHASE-3-REPORT.md) · [Phase 4](docs/PHASE-4-REPORT.md) · [Phase 5](docs/PHASE-5-REPORT.md) · [Phase 6](docs/PHASE-6-REPORT.md) ·
[Phase 7](docs/PHASE-7-REPORT.md) · [Phase 8](docs/PHASE-8-REPORT.md) · [Phase 9](docs/PHASE-9-REPORT.md) · [Phase 10](docs/PHASE-10-REPORT.md) · [Phase 11](docs/PHASE-11-REPORT.md) ·
[Phase 12](docs/PHASE-12-REPORT.md) · [Phase 13](docs/PHASE-13-REPORT.md) · [Phase 14](docs/PHASE-14-REPORT.md) · [Phase 14A](docs/PHASE-14A-REPORT.md) · [Client demo guide](docs/CLIENT-DEMO-GUIDE.md) · [Developer handover](docs/HANDOVER.md) · [Design system](docs/DESIGN-SYSTEM.md).
