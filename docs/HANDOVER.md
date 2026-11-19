# V-Guard Rishta Enterprise Operations & Governance Portal — Developer Handover

Final handover pack after Phase 13 (Build Prompt 13, section 35), updated for the Phase 14 Module 12 prototype. Status as of 19 November 2026.

> **Read this first.**
> - This is a **development build for business review and UAT preparation**. It is **not**
>   production-ready.
> - Every module runs in the browser against development data.
> - No V-Guard or Evolve system is connected: no identity provider, SFDC, eSeal, DigiLocker,
>   payment gateway, WhatsApp, telemetry, ticketing tool or legacy database.
> - The go-live checklist shows **Not ready (0 of 8 gates passed)**.
> - The SOW is **not** claimed as delivered. The traceability matrix (section E) and the evidence
>   (sections F–I) still have to be reviewed and signed by V-Guard.

## Status legend

| Label | Meaning in this build |
| --- | --- |
| **Implemented** | Portal behaviour, permissions, audit and automated tests exist; runs on development data |
| **UI only** | Screens with no service behind them (none remain in scope) |
| **Mock service** | Behaviour runs against an in-browser mock adapter that stands in for a backend or provider |
| **Prepared integration** | Contract or configuration structure exists; nothing is connected |
| **Connected integration** | Live connection to a real system. **None in this build** |
| **Business confirmation required** | Built behind an open decision; stays restricted until the owner decides |
| **Not implemented** | In scope but not built |
| **Out of scope** | Annexure A exclusions and Proposed Module 12 |

---

## A. Platform administration

**Admin SSO architecture: prepared integration.**
- `src/services/auth.ts` defines `AUTH_CONFIG` with mode `mock` or `saml` and the SAML values (IdP
  entity ID, SSO URL, signing certificate, SP entity ID, ACS URL, user-ID and email attributes). All
  are null.
- Development sign-in picks a mock identity (`/signed-out`).
- Staff never use a member MPIN; the portal has no member login.
- After sign-in, `getEffectiveAccess` resolves organisation, roles, programme and geography scope.
  `landingFor()` shows the role-scoped landing.
- Screen: Platform administration → Admin access & SSO.

**Role mapping matrix: implemented, business confirmation required (OP-RBAC1).**
- Maps the six SOW roles onto the portal roles: HO Admin, Regional Admin, Branch Manager/PIC, Sales
  Rep, Evolve Operations, Finance.
- For each module it checks the five SOW baseline actions (View, Create, Edit, Approve, Disable).
- Screen: Roles & permissions.

**Permission governance: implemented.**
- RBAC engine: `features/access/engine.ts`, pure policy.
- Maker-Checker: `features/approvals`, 39 workflows.
- Super Admin cannot bypass Maker-Checker and cannot approve their own requests.
- The second-person check confirms every financial action is routed through a workflow.
- Temporary hold is applied directly (protective) and is reported as a gap for OP-RBAC1.

**Configuration registry: implemented.**
- A read-only inventory of 161 governed configurations from 12 modules. Each links to its owning
  module.
- There is no universal edit permission.

**Open-point register: implemented.**
- 105 open points across 19 modules, carried forward from every phase, plus 9 Phase 13 decisions.
- Platform decisions are recorded with evidence, and their status gates the dependent features.

## B. View-As

**Architecture: implemented.**
- `features/platform/viewAsSession.ts` is the session store. It is loaded at start-up and registers
  the guard.
- `features/platform/store.ts` holds the validation, start/end, the member view and the history.
- `components/ViewAsBanner.tsx` is rendered above every route.

**Member-facing screens covered:**
- Home: balance, lifetime points, status, restrictions, KYC status.
- Schemes: active schemes and progress.
- Passbook: latest 25 entries.
- Wallet: available, lifetime, redeemed, scheme points, TDS.
- Settlement: unsettled scheme points.

The data comes from the wallet, scheme, passbook and analytics services.

**Read-only controls.**
- While a session is open, the central permission service refuses every non-view action in every
  module, including direct service calls.
- Scan, Redeem, KYC edit, bank edit, points adjustment, referrals, profile edit and messaging are
  shown disabled.
- A backend must enforce the same rule.

**Branch restriction.**
- Within scope: `view-as:view` (Sales Rep, Branch Manager, Regional Admin).
- Outside scope: `view-as:override` plus a recorded reason (Client Admin, Evolve Operations).
- Super Admin holds neither.

**Masking.** The member view contains no Aadhaar, PAN, bank, UPI or mobile value and no masked ID.
KYC appears as type and status only.

**Session audit.**
- Recorded: staff member, role, organisation, member, programme, branch, IP and device, start, last
  activity, end, exit reason and any override.
- Refused attempts are recorded too.
- IP is "Not captured" until the gateway supplies it.
- Inactivity timeout: 15 minutes, a development value pending OP-VIEWAS1.

## C. Application usage analytics

Mock service (mock telemetry adapter), definitions pending OP-USAGE1.

- **Screen / page analytics:**
  - Landing count, unique users, page views, average time per screen, exit rate and drop-off count.
  - Ranking by metric, and best / worst screens.
  - Untimed events show "Not available".
- **Session analytics:**
  - App opens, average and median session length, opens per user.
  - Funnel with drop-off between configurable stages.
- **Module usage:** Scanning, Schemes, Wallet and Passbook. These are screen visits, not business
  transactions; scans and redemptions are reported in Reports & analytics.
- **Filters:**
  - Date, programme, role (member type), region, app version and OS.
  - Results are scoped by the viewer's geography.
  - Member-level usage needs `app-usage:view_sensitive` and is audited.
- **Event data model:** `UsageSession` in `types/platform.ts`. It covers member, programme, member
  type, state, branch, app version, device, OS, start, duration and the ordered screen views (screen,
  module, time, seconds or null), plus the exit screen. The real telemetry feed must supply these
  fields.

## D. Theme management

The workflow is implemented; **publishing is disabled** until OP-THEME1 is confirmed.

- **Configuration.** Name, type (tier, festival or default), programmes, colour tokens (#RRGGBB),
  effective period and assets.
- **Tier / event mapping.**
  - Tier themes must reference tiers in the Tier Master.
  - Festival themes need an approved event reference and an effective period.
- **Preview.** A desktop preview of member-app surfaces; it is not a mobile release.
- **Versioning.** Every edit creates a new draft version and the history is kept.
- **Approval.** Maker submits, Checker approves (WF-039 APP-THEME). Approval sets the theme to
  **approved**, not published.
- **OP-THEME1:** open. The portal's V-Guard yellow, black and white palette is untouched: themes
  apply to member apps only.

## E. SOW coverage

The detailed matrices live in the portal: Platform administration → SOW feature coverage. Both
export to CSV.

**AF01–AF28 (27 rows; the SOW has no AF08):**

| Status | Rows |
| --- | --- |
| Implemented | 20 |
| Partially implemented | AF07, AF22, AF27, AF28 |
| Business confirmation required | AF13, AF21 |
| Prepared integration | AF01 |

**SB01–SB21 (21 rows):**

| Status | Rows |
| --- | --- |
| Implemented | 17 |
| Business confirmation required | SB03, SB10, SB17, SB21 |

**Module 10 gap report.** Gaps and remediation per row are in [PHASE-13-REPORT.md](PHASE-13-REPORT.md)
section 5.

**Module 14 acceptance matrix.** All 13 criteria (AC-KYC, AC-SCAN, AC-RED, AC-ADM) are **Not tested —
backend integration required**. They are measured during UAT on the reference device and staging
backend.

**Open-point register.** See section A.

## F. Performance and capacity

| Area | Status |
| --- | --- |
| Response-time targets (PT-01 to PT-13, SOW 14.1) | p95 and p99 kept separately. Timeouts appear only where the SOW states them. Per-hop budget not defined (OP-PERF1) |
| Actual measurements | **None recorded.** The portal accepts staging, load-test or production measurements; local timings are kept as reference only |
| Capacity (CP-01 to CP-07, SOW 14.2) | Not tested |
| Load tests (Scenario A: 2,000 users / 10,000 scans per hour; Scenario B: 10,000 users / 1 lakh scans) | Not tested; duration and ramp pending OP-LOAD1 |
| Security (SC-01 to SC-09, SOW 14.4) | Not tested |

TLS 1.3, AES-256, tokenisation, device fingerprinting and retention are backend and infrastructure
controls. They need evidence from those layers.

## G. UAT

Sign-off is blocked by OP-UAT1.

- **Plan.** One cycle, UAT-01 on staging (not provisioned). The planned two-week window, owner,
  coordinator, sign-off authority and the ~20 pilot members (allocation per programme) are entered as a
  draft. The SOW gives no per-programme numbers.
- **Programme coverage.** 28 test cases: 14 SOW areas × (main journey + a programme variant), covering
  all five programmes.
- **Results.** No UAT executions are recorded. Automated tests on 19 November 2026: **921/921** (including the 67 Phase 14 Module 12 prototype tests and the 38 Phase 14A demo tests):

  | Suite | Result |
  | --- | --- |
  | Schemes | 119 |
  | Wallet | 92 |
  | Communication | 37 |
  | Gifts | 85 |
  | Risk | 88 |
  | Integrations | 114 |
  | Analytics | 155 |
  | Platform | 126 |
  | Module 12 prototype | 67 |
  | Client demo simulation | 38 |

  The scheme gap probes confirm 2 known gaps.
- **Defect register.** DEF-0001 (G13), DEF-0002 (G14) and DEF-0003 (dependency advisories), all
  untriaged. No P0/P1 is open.
- **Sign-off status.** Not signed. Sign-off is refused while OP-UAT1 is open, any case is not passed,
  any P0/P1 is open, or any programme lacks a pilot member.

## H. Migration

Not started against legacy data. Pending OP-MIG1.

- **Scope.** Every programme is "pending confirmation". Member volumes are not stated in the SOW.
- **Reconciliation.**
  - Members, wallets (Available, Scheme, Redeemed, each compared on its own), TDS Kitty (per member
    and financial year), scan history and redemption history.
  - Today these run against a labelled development test snapshot that proves the checks work.
- **Exception register.** Raised from the differences; idempotent. An exception closes only with
  evidence. Target data is never changed to force a match.
- **Cutover plan.** 13-item checklist. Scope items are refused while OP-MIG1 is open.
- **Rollback plan.** Not documented: no restoration time and no rollback test. GL-05 is blocked.

## I. Go-live

**Final readiness status: Not ready.** No production deployment has been made.

| Gate | Status | Blocker |
| --- | --- | --- |
| GL-01 P0/P1 resolved | Not started | None open today. The gate still needs evidence and sign-off |
| GL-02 UAT sign-off | Not started | UAT not signed (OP-UAT1) |
| GL-03 Load test | Not started | No Scenario B evidence (OP-LOAD1) |
| GL-04 Security audit (incl. DPDP) | Not started | No security evidence |
| GL-05 Rollback plan | Not started | Plan, restoration time and test missing |
| GL-06 Monitoring dashboards and fraud alerts live | Not started | Monitoring runs on mock telemetry |
| GL-07 Support training | Not started | Training records needed |
| GL-08 Migration validated | Not started | OP-MIG1 open |

## Module 12 (Proposed) — Phase 14 prototype

SOW Module 12 (Job Management & Field Tooling) is **Proposed** and not in the committed scope.
- **Prototype location:** Future scope → Job management & field tooling (`/future/job-management`).
- **Access:** Evolve Super Admin only (`proposed-scope`).
- **Mode:** demo throughout.
- **Nothing goes live:** no Siebel job API, no real allocation, no points credited, no customer
  messages.
- **Decisions:** all 12 are open.
- **Details:** [PHASE-14-REPORT.md](PHASE-14-REPORT.md).

## Client demonstration (Phase 14A)

The portal runs as an interactive simulation.
- A persistent DEMO / SIMULATION MODE banner and a role switcher (ten personas) are on every page.
- **Governance → Client demo centre** holds the guided scenarios, the member-app scan and redemption simulators, the integration outcome controls, the event timeline and the demo reset.
- The environment comes from the build (`VITE_APP_ENV`); production builds hide every simulation control.
- Automated tests: 921/921 across ten suites.
- See [PHASE-14A-REPORT.md](PHASE-14A-REPORT.md) and [CLIENT-DEMO-GUIDE.md](CLIENT-DEMO-GUIDE.md).

## J. Technical handover

**Repository structure:**

```
src/
  config/      catalogues: navigation, RBAC, approvals, schemes, wallet, comms, gifts, risk, ops, analytics, platform
  types/       domain models per module (members, rbac, approval, schemes, wallet, comms, gifts, risk, ops, analytics, platform)
  data/        seeds and generated data (approvalModuleSteps, testRunResults)
  features/    one folder per module: engine (pure rules) + store (useSyncExternalStore + sessionStorage)
               access, approvals, masters, members, schemes, wallet, comms, gifts, risk, ops, analytics, platform
  services/    API contracts with mock implementations (auth, access, members, masters, schemes, wallet, comms, analytics, approvals, dashboard)
  pages/       screens per module; route-level lazy loading
  components/  layout (AppShell), ui, form, charts, ViewAsBanner, RouteErrorBoundary, SpeedInsightsRoute
  context/     session, filters, toasts, drill-down
  styles/      design tokens + per-module CSS
tests/         Node test suites (esbuild bundle + node)
scripts/       collect-test-results.mjs, seed generators
docs/          phase reports, design system, this handover
```

**Routing structure.**

| Route | Module |
| --- | --- |
| `/` | Dashboard |
| `/governance/users` | Users and roles |
| `/governance/approvals` | Approval Centre |
| `/governance/fraud` | Fraud and risk |
| `/governance/platform` | Platform administration |
| `/masters` | Master data, plus `/masters/products`, `/masters/categories`, `/masters/branches`, `/masters/scanning`, `/masters/communication` |
| `/members` | Member Management |
| `/registration-kyc` | Registration and KYC |
| `/schemes` | Schemes and incentives |
| `/wallet` | Wallet and points |
| `/redemption` | Redemption and fulfilment |
| `/gifts` | Gift catalogue |
| `/reports` | Reports and analytics |
| `/monitoring/integrations` | Integration monitoring |
| `/monitoring/health` | System health |
| `/future/job-management` | PROPOSED Module 12 prototype (Super Admin only) |

`vercel.json` rewrites every path to `index.html` for client-side routing.

**Frontend architecture.**
- React 18, TypeScript 5.6, Vite 5, React Router 6, Recharts 2, Lucide icons, plain CSS on tokens.
- Each module store's only write path is a private `commit(audited(...))`.
- Cross-module effects go through the approval engine's execution handlers.

**Service architecture.**
- Business rules live in `features/*/engine.ts` (pure).
- `services/*Api.ts` defines the contracts. Each has a mock implementation and a not-connected HTTP
  stub.
- **No production endpoints are defined, because none have been agreed.** The backend must enforce
  every rule now in the engines: RBAC, Maker-Checker, View-As read-only, masking, ledger
  immutability, TDS and limits.

**Data models.** See `src/types/*.ts`. Sensitive identifiers are stored masked only.

**Mock data identification.**
- Everything under `src/data/mock` and the seeds in each store is development data. Screens label
  it ("Development governance data", "demo" badges), and every CSV export starts with a
  development-data line.
- Session data is in `sessionStorage`. The storage keys are versioned, so clearing storage or
  opening a new tab reseeds.

**Actual integration status.**

| Status | Integrations |
| --- | --- |
| Connected | None |
| Prepared (contracts or configuration) | SAML SSO, SFDC, eSeal, DigiLocker, payment gateway, WhatsApp/SMS, telemetry, ticketing |
| Mock adapters | Integration monitoring, usage telemetry, scan service, TDS, voucher and insurance partners |

**Environment configuration.**
- Vercel project linked (`.vercel/`, git-ignored).
- `.env.local` holds the Vercel OIDC token. It is git-ignored and must never be committed.
- No application environment variables are required for the development build.
- SAML values are supplied at deployment through `AUTH_CONFIG`.

**Dependency inventory.**

| Kind | Packages |
| --- | --- |
| Runtime | react 18.3.1, react-dom 18.3.1, react-router-dom 6.28.0, recharts 2.15.0, lucide-react 0.460.0, @vercel/speed-insights ^2.1.0 |
| Development | typescript 5.6.3, vite 5.4.11, @vitejs/plugin-react 4.3.4, React type packages |
| Test bundler | esbuild, through Vite |

Notes:
- `rollup` is overridden with `@rollup/wasm-node`, because Windows Application Control blocks the
  native binary.
- npm audit reports advisories in react-router, vite and esbuild (DEF-0003, untriaged).

**Build and test commands:**

```powershell
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check + production bundle (dist/)
npm run preview        # serve dist/ on :4173
npm run test:platform  # or test:schemes, test:wallet, test:comms, test:gifts, test:risk, test:ops, test:analytics, test:jobs, test:demo
npm run report:tests   # run every suite and record results for the Testing & UAT screen
```

**Known limitations.**
- No backend: every rule runs in the browser and can be bypassed by anyone who controls the browser.
  A backend must re-enforce them.
- Data does not persist beyond the browser tab session.
- View-As IP is not captured.
- Usage figures are mock telemetry.
- Migration runs against a test snapshot.
- Error catalogue translations other than English are missing.

**Technical debt.**
- The generated `approvalModuleSteps.ts` (about 111K characters) is in the entry chunk because the
  approval store seeds at start-up.
- The entry chunk is 427 KB raw / 103 KB gzip.
- Scheme gap probes G13 and G14 (DEF-0001, DEF-0002).
- Dependency advisories (DEF-0003).
- The temporary hold has no approval workflow (reported for OP-RBAC1).

**Deployment instructions.**
- **Preview:** `vercel deploy`, or the linked project. The preview sits behind Vercel sign-in.
- **Production is not deployed and must not be deployed from this build.** Promotion follows the
  go-live checklist and V-Guard's formal approval.
- Speed Insights reports only on Vercel. Locally its script returns 404, which is expected.

## Phase reports

[Phase 1](PHASE-1-REPORT.md) · [3](PHASE-3-REPORT.md) · [4](PHASE-4-REPORT.md) · [5](PHASE-5-REPORT.md) ·
[6](PHASE-6-REPORT.md) ([audit](PHASE-6-AUDIT.md)) · [7](PHASE-7-REPORT.md) · [8](PHASE-8-REPORT.md) ·
[9](PHASE-9-REPORT.md) · [10](PHASE-10-REPORT.md) · [11](PHASE-11-REPORT.md) · [12](PHASE-12-REPORT.md) ·
[13](PHASE-13-REPORT.md) · [14 (Module 12 proposed)](PHASE-14-REPORT.md) · [Design system](DESIGN-SYSTEM.md)
