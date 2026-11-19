# Phase 13 — Platform Administration, View-As, App Usage, Governance, SOW Coverage and Go-Live Readiness

Completion report for Build Prompt 13 (SOW Module 10.1, 10.2, 10.7, 10.8, 10.12, 10.13, Module 14 and
Annexure A). The project-wide developer handover is in [HANDOVER.md](HANDOVER.md).

> **Development build. This is not production readiness.** No identity provider, app telemetry
> service, ticketing tool, staging environment, load-test environment or legacy data source is
> connected. Every readiness status comes from recorded evidence. With none recorded, every
> performance, capacity, security, acceptance and integration test target shows **Not tested**, and
> the go-live checklist shows **Not ready** (0 of 8 gates).

## 1. Real versus mock

| Item | Status |
| --- | --- |
| View-As (read-only, branch-restricted, override, banner, inactivity, audit) | Implemented. Read-only is enforced in the central permission service, not only in the UI |
| Admin SSO (AF01) | Prepared. `services/auth.ts` holds the SAML structure; no identity provider is connected (development identities only) |
| Role governance (SOW role crosswalk, baseline actions, second-person check) | Implemented as reports on the live RBAC and workflow data. Final mapping pending OP-RBAC1 |
| Application usage analytics | Implemented on a **mock telemetry adapter**. Its definitions are pending OP-USAGE1 |
| App themes | Draft, preview, versioning and Maker-Checker approval (WF-039) are implemented. **Publishing is disabled** until OP-THEME1 is confirmed |
| Configuration registry, central audit console, open-point register | Implemented. These read the owning modules and never copy or edit their data |
| Error catalogue (SOW 14.3) and incidents | Implemented. Ticket links are entered by hand (OP-TICKET1) |
| Performance, capacity, security and acceptance (14.1–14.5) | Target registers and evidence recording are implemented. No evidence is recorded |
| UAT, defects, migration reconciliation, go-live gates, rollback | Implemented as an evidence-gated workflow. Migration is checked against a labelled **development test snapshot**, not legacy data |

## 2. Navigation

- **Governance → Platform administration** (`/governance/platform`) has four groups and 15 sections:
  - **Administration:** overview, admin access & SSO, roles & permissions, configuration registry, audit & error catalogue.
  - **Member experience:** View-As, app usage analytics, app themes.
  - **SOW & governance:** SOW feature coverage, open points & scope.
  - **Readiness:** performance & capacity, testing & UAT, data migration, go-live checklist, release & rollback.
- **Intelligence & monitoring → App usage analytics** opens `/governance/platform/app-usage`.
- **Member 360** has a "View as member (read-only)" link for anyone who holds View-As.
- Each tab needs its own permission:
  - `platform-admin:view`
  - `view-as:view` or `view-as:override`
  - `app-usage:view`
  - `app-themes:view`
  - `release-readiness:view`

## 3. Access model

New RBAC modules and the roles that hold them:

| Module | Actions | Held by |
| --- | --- | --- |
| `platform-admin` | view, edit, manage, export | Super Admin (all); Evolve Operations (view, edit, export); Client Admin (view, export) |
| `view-as` | view, override | Sales Rep, Branch Manager and Regional Admin (view: own scope); Client Admin and Evolve Operations (override). **Super Admin has none** |
| `app-usage` | view, export, view_sensitive | Client Admin, Evolve Operations, Regional Admin (scoped). Member-level views need `view_sensitive` (DG-0009) and are audited |
| `app-themes` | view, create, edit, submit, approve, reject, return, publish | Maker (create / edit / submit), Checker (approve), Client Admin (publish — refused while OP-THEME1 is open). **Super Admin cannot publish** |
| `release-readiness` | view, edit, approve, manage, export | Evolve Operations (edit, manage), Client Admin (edit), Checker (approve), Finance (view) |

There is no universal "edit any configuration" permission. Each registry entry links to its owning
module, and changes go through that module's workflow.

## 4. View-As enforcement (SOW 10.7)

- **Read-only at the service layer.** `features/platform/viewAsSession.ts` registers a session guard
  in `features/access/engine.ts`. While a staff member has an open session, `hasPermission` refuses
  every action except `view`, in every module. The UI follows because `can()` uses the same engine.
  A backend must apply the same rule; this guard is its reference.
- **Branch restriction.** View-As uses `hasPermission(view-as, view, {programme, geo})`. A member
  outside the user's scope needs `view-as:override` and a recorded reason. HO users always take the
  override path. Members with no app account are refused with "Member app data unavailable".
- **Masking.** `viewAsMemberApp` builds a separate view from the wallet, scheme and passbook services.
  It contains no Aadhaar, PAN, bank, UPI or mobile values and no masked IDs: KYC appears as type and
  status only. Nothing sensitive reaches the page, its state, the export or the logs.
- **Session record.**
  - Staff member, organisation, role, member, programme and branch.
  - IP: "Not captured (mock adapter; supplied by the gateway in production)" — never invented.
  - Device, start, last activity, end, exit reason (exit, inactivity, sign-out) and any override.
- **Audit.** Refused attempts are recorded as well as successful ones. Sessions and attempts appear in
  the central audit console.
- **Inactivity timeout.** 15 minutes, a development value pending OP-VIEWAS1. Activity is recorded at
  most every 15 seconds.
- **Banner.** A persistent sticky "READ-ONLY VIEW-AS MODE" banner sits above every route, with Exit.
  Signing out or switching identity also ends the session.

## 5. SOW coverage audit

- **Annexure A:** 27 AF rows (the SOW register has no AF08, so none was invented).
- **Scheme Builder:** 21 SB rows, from the existing `BUILDER_COMPONENTS` (SOW 6.2.1–6.2.21).
- **Fully implemented** means the portal behaviour, permission, audit and automated test exist
  against development mock services. No row is a live integration.

11 rows are **not** fully implemented:

| Ref | Status | Gap |
| --- | --- | --- |
| AF01 SSO | Backend integration prepared | No identity provider connected |
| AF07 Scheme targeting | Partially implemented | PC/SPC and behaviour attributes have no source |
| AF13 Welcome / scratch bonuses | Business confirmation required | Values and odds pending OP-SB-BONUS |
| AF21 Rule-based redemption / scan checks | Business confirmation required | Thresholds pending OP-02; rules inactive |
| AF22 Minimum balance | Partially implemented | Scan-count variant pending OP-08 |
| AF27 Pincode master | Partially implemented | Ownership (SFDC or portal) unconfirmed; no automated test |
| AF28 Sales hierarchy | Partially implemented | ASM / SR levels are not a separate master |
| SB03 Rider points | Business confirmation required | OP-SB-RIDER |
| SB10 Growth-based | Business confirmation required | OP-01 |
| SB17 Projected liability | Business confirmation required | OP-SB-LIAB |
| SB21 Configuration guide | Business confirmation required | OP-SB-GUIDE |

Out of scope (Annexure A), not built and not switchable:

- Training & Certification.
- Consumer Loyalty.
- Retailer → Consumer referral (present in the referral catalogue as inactive "future").
- Module 12 (job management) stays Proposed.

## 6. Open decisions added in Phase 13

All nine decisions are open. The open-point register also carries forward every earlier module's
decisions: 105 open points across 19 modules.

| Ref | Decision needed | Until decided |
| --- | --- | --- |
| OP-RBAC1 | Final role list and action mapping, including MPIN reset and cancellation | Role crosswalk kept; current holders unchanged |
| OP-THEME1 | Are tier / festival themes needed now, and on which screens | Draft and approve only; publish refused |
| OP-TICKET1 | Ticketing tool and who sees resolution comments | Incidents recorded in the portal only |
| OP-UAT1 | Participants, ~20 pilot members, allocation, window, sign-off authority | UAT cannot be signed off |
| OP-MIG1 | Programmes and volumes to migrate, reconciliation, owners, cutover | Migration gate GL-08 blocked |
| OP-VIEWAS1 | Inactivity timeout and HO override holders | 15-minute development timeout |
| OP-USAGE1 | Bounce / exit, session and app-open definitions | Mock adapter definitions shown and labelled |
| OP-PERF1 | Reference device and per-hop latency budget | Targets show Pending engineering evidence |
| OP-LOAD1 | Load-test duration, ramp, and how to read 10,000 users / 1 lakh scans | Load tests not marked passed |

## 7. Evidence rules

These rules are in `features/platform/store.ts`.

- **Measurements.** A measurement needs a run reference and evidence.
  - `local_development` results are kept as Pending engineering evidence and never count.
  - p95 above target is Fails target.
  - A missing or exceeded p99 (where the SOW defines one) is At risk.
  - Only the four SOW timeouts are shown (PT-03, PT-06, PT-08, PT-13).
  - The per-hop budget is not invented.
- **Evidence records.** Passed evidence is refused for local, mock or development environments. The
  portal cannot prove TLS 1.3, AES-256, tokenisation or device fingerprinting: those are backend and
  infrastructure controls.
- **Defects.**
  - A reason is required for every change.
  - Downgrading a P0/P1 needs `release-readiness:approve`; otherwise it is refused and audited.
  - A defect closes only after a passed retest.
  - Three genuine findings are seeded, untriaged: scheme gap probes G13 and G14, and the npm audit advisories.
- **UAT.**
  - The plan warns if the window is not 14 days or the allocation is far from about 20.
  - A pilot member is refused once their programme's allocation is full.
  - A failed case needs a defect.
  - Sign-off needs `approve`, OP-UAT1 confirmed, every case passed, no open P0/P1 and pilot members in all five programmes.
- **Migration.**
  - Wallet buckets (Available, Scheme, Redeemed) and TDS Kitty are reconciled separately.
  - Raising exceptions is idempotent and never changes target data.
  - Resolving needs evidence; accepting a difference needs approval.
- **Go-live.**
  - A gate passes only with `approve`, evidence and a sign-off reference, and only when its precondition holds (GL-01 to GL-08).
  - Overall status: a failed or blocked gate means **Blocked**; all passed means **Ready for formal approval**.
  - Nothing deploys.

## 8. Findings during this phase

- **Fixed: View-As render loop.** The read-only member view recorded activity on every render, which
  updated the store and re-rendered the page endlessly (the browser tab hung). Activity is now
  recorded at most every 15 seconds. Found during the browser check.
- **Reported, not changed: temporary hold has no approval workflow.** The `temporary_hold_change`
  request type is not routed by any workflow. Holds are applied directly as a protective action by
  holders of `members:hold` (Phase 5 design). The second-person check on Roles & permissions shows it
  as a gap for OP-RBAC1. Every financial action is covered by Maker-Checker.
- **Carried forward:**
  - Scheme gap probes G13 and G14 (DEF-0001, DEF-0002).
  - Dependency advisories in react-router, vite and esbuild (DEF-0003).
  - All three are untriaged: severity is not assigned without an owner.

## 9. Code-splitting review

Measured with `vite build` on this machine. Sizes are in KB, raw and gzip.

| Chunk | Raw | Gzip |
| --- | --- | --- |
| Entry `index` before Phase 13 (Phase 12 build) | 416 | ~100 |
| Entry `index` after Phase 13 | 427.5 | 103.0 |
| `charts` (Recharts, loaded by chart pages) | 425.0 | 113.8 |
| `react` | 165.2 | 53.9 |
| CSS (all modules) | 139.5 | 24.4 |
| Platform store + catalogues (lazy) | 91.0 | 28.3 |
| `ReadinessPages` (lazy) | 40.9 | 10.9 |
| `ExperiencePages` (lazy) | 25.1 | 7.7 |
| `GovernancePages` (lazy) | 22.9 | 6.5 |
| `AdminPages` (lazy) | 12.2 | 4.0 |

The build has 111 JavaScript chunks.

**Why the entry chunk grew by about 3 KB gzip.** These pieces must exist before the first page renders:

- The View-As session core and permission guard: the guard has to be active before any page can act.
- The banner and the route error boundary.
- The Speed Insights component, added after Phase 12.
- The new RBAC modules, the WF-039 workflow and the platform route table.

The platform catalogues and store are not in the entry chunk.

**Not changed:**
- Route-level lazy loading already covers every module.
- Splitting individual components further would add requests for little gain.
- The largest start-up source is the generated `approvalModuleSteps.ts` (about 111K characters), loaded because the approval store seeds at start-up.

Recommendation: when the approval engine moves to the backend, load module steps from the API
instead of bundling them.

**Added:** `RouteErrorBoundary`.
- A page chunk that fails to download (for example after a new deployment) shows "Reload the portal".
- A page that throws shows "Try again".
- Neither leaves a blank screen.

## 10. Tests

- `npm run test:platform` runs the **126** Phase 13 scenarios from section 30 of the build prompt against
  the real stores. Result: **126/126 passed**.
  - 85 deterministic.
  - 14 blocked-as-expected: gates, sign-off, publish and evidence that must be refused.
  - 27 governance.
- `npm run report:tests` runs every suite and writes `src/data/mock/generated/testRunResults.ts`. The
  Testing & UAT screen shows that file.

Latest run (19 Nov 2026):

| Suite | Result |
| --- | --- |
| test:schemes | 119/119 |
| test:wallet | 92/92 |
| test:comms | 37/37 |
| test:gifts | 85/85 |
| test:risk | 88/88 |
| test:ops | 114/114 |
| test:analytics | 155/155 |
| test:platform | 126/126 |
| **Total** | **816/816** |

The scheme gap probes still confirm the 2 known gaps (G13, G14).

**Browser check** (`vite preview`, background tab):
- All 15 platform sections and their tabs render with no route errors.
- The View-As flow ran as Sales Rep USR-2006 on MBR-EP-0010:
  - The banner is sticky and all eight member actions are disabled.
  - The page and View-As state contain no 12-digit, PAN-pattern or masked-ID values.
  - Exit from the banner ended the session with reason "exit" and a 12-second duration.
- The only console errors are the Speed Insights script 404, which only resolves on Vercel.

## 11. Files

| Area | Files |
| --- | --- |
| Types and catalogues | `types/platform.ts`, `config/platformCatalogue.ts` |
| Services | `features/platform/viewAsSession.ts`, `store.ts`, `usage.ts`, `migration.ts` |
| Guard | `features/access/engine.ts` (`registerSessionGuard`) |
| Pages | `pages/platform/shared.tsx`, `AdminPages.tsx`, `ExperiencePages.tsx`, `GovernancePages.tsx`, `ReadinessPages.tsx` |
| Shell | `components/ViewAsBanner.tsx`, `components/RouteErrorBoundary.tsx`, `styles/platform.css` |
| Wiring | RBAC catalogue and seed, approval catalogue and seed (WF-039), execution handler store, navigation, `App.tsx` routes, `SessionContext` (sign-out ends View-As), Member 360 link |
| Tests | `tests/platform.test.ts`, `scripts/collect-test-results.mjs` |

Storage keys:
- `vg-rishta.platform-store.v1`
- `vg-rishta.view-as.v1`
- Access store bumped to `v15`, approval store to `v12`.
