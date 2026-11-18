# Phase 12 — Business Analytics, Reporting, KPI Dashboards, Member 360 Analytics and Management Intelligence

Completion report and developer handover (Build Prompt 12, SOW Module 13).

> **Development build.** No analytics warehouse, sales source, marketing-spend source or scan
> service is connected. Every figure is read from this browser's module stores (Member Management,
> Wallet & Ledger, Schemes, Fraud & Risk, Communication Centre, Gift & Fulfilment, Masters,
> Integration Monitoring) and is development / demo data. No KPI target is confirmed. The finance
> reports are not validated by Finance and are not statutory filing output.

## 1. Real versus mock

| Item | Status |
| --- | --- |
| KPI dictionary, versioning, Maker-Checker changes (WF-038) | Implemented. Definitions are provisional (OP-KPI1); no targets are set |
| Dashboards (overview and 13 panels), filters, drill-down | Implemented on the analytics service (`features/analytics`) |
| Points, scheme, tier, fraud, support, gift and redemption figures | Read from the owning module stores; never recalculated |
| Scan records (Scan-In / Scan-Out, channel, claim ID) | Mock scan-service adapter built from Wallet ledger credits and Phase 10 rejections |
| Revenue, marketing spend, CAC, LTV, payback, NPS, fraud detection rate | Not calculated: inputs not supplied (shown as Not available) |
| Exports (CSV, Excel, PDF, PNG) | Generated in the browser; permission, scope and audit enforced by the service |
| Scheduled reports and threshold alerts | Implemented. Delivery uses Communication Centre mock email; thresholds stay draft (OP-ALERT1) |
| Member app analytics (SOW 13.2) | Service contracts in `services/analyticsApi.ts`; no member app screens in this portal |

## 2. Navigation

Route `/reports` (sidebar: Intelligence & monitoring → Reports & analytics). The 23 sections are in
three groups, so the main sidebar keeps a single entry.

**Dashboards:**
- Business overview
- Engagement
- Points flow
- Revenue impact
- Fraud
- Scheme performance
- Channels
- Geography
- Tiers
- Support
- Retention & churn
- Acquisition cost
- Redemption by product
- Segmentation

**Member & operational reports:**
- Member 360
- Scan & QR
- Finance reports
- Programme reports

**Catalogue, delivery & governance:**
- Report catalogue
- Scheduled reports
- Threshold alerts
- KPI dictionary
- History & exports (export history, report runs, lineage and freshness, reconciliation, decision register, audit)

Tabs and routes follow permissions. A global filter bar (period presets, comparison, programmes,
state → district → branch, member type, product category, scheme) applies to every compatible
panel. Filters that do not apply to a view are disabled and labelled "Not applicable".

## 3. KPI dictionary (SOW 13.1)

| KPI | SOW definition (stored verbatim) | Calculated in this build |
| --- | --- | --- |
| DAU | Members who did more than one action in the app in a day. | Yes. Members with 2 or more actions (scan, redemption, successful login) on the day; a login alone does not count |
| MAU | SOW 13.3 dashboard measure | Yes. At least one active day in the month (provisional) |
| 90-Day Active | Members who did more than one action in the last 90 days. | Yes. 2 or more actions across the 90 days |
| Points Redemption Rate | Points redeemed ÷ points issued, over 12 months. | Yes. Wallet ledger, rolling 12 months |
| LTV | Average revenue from a member over three years. | No. No revenue source (OP-REV1) |
| CAC | Marketing spend ÷ new members gained. | No. No spend source (OP-CAC1); the formula is implemented and tested |
| Payback | Months to recover CAC from LTV. | No. Needs CAC, LTV and a method |
| Churn (30-day) | Members who went inactive ÷ previous month's active members. | Yes |
| NPS | (Promoters − detractors) ÷ total responses. | No. No survey asks a recommendation question; the formula is tested |
| Scan Success Rate | Successful scans ÷ total scan attempts. | Yes. Scan-Out and Scan-In are calculated separately |
| Fraud Detection Rate | Flagged cases as a share of total incidents, with the amount saved. | No. Total incidents and amount saved are not supplied |

- **What each entry holds:** ID, the SOW wording, an approved definition (empty until confirmed),
  the formula, numerator and denominator, period, aggregation, programmes, source module and
  dataset, refresh, unit, target (kept separate from the formula), owner, status, effective date,
  version and history.
- **Changing a definition or target:** an authorised Maker submits it, it goes to V-Guard approval
  (WF-038), and the confirmed value becomes a new version. General users cannot edit the dictionary.
- **One calculation everywhere:** every panel, report, alert and test calls the same
  `engine.kpiValues()`.

## 4. Dashboards (SOW 13.3)

| Panel | Built from | Not invented |
| --- | --- | --- |
| A Engagement | Activity adapter (scans, redemptions, logins); DAU, MAU, 90-day active, sign-ups by day, month, programme and source; 7 / 30-day trends; region and category; member drill-down | System events never count as member actions |
| B Points flow | Wallet `balancesFrom` over filtered ledger lines; by category, scheme, programme and member type; daily and monthly curves; ledger drill-down | Accrued, credited, unsettled, settled and available are shown side by side, never summed |
| C Revenue impact | Join cohorts (members acquired) | Revenue, growth and uplift are Business Confirmation Required (OP-REV1) |
| D Fraud | Phase 10 events and cases (flagged, investigating, confirmed, cleared and resolved kept separate), restrictions, district and product heat tables | Detection rate and amount saved not supplied |
| E Scheme scorecard | Phase 6 `exposureOf`, `eligiblePopulation` and `projectedLiability` | Return on spend, scheme CAC and liability are not approved |
| F Channels | App / Web / POS exactly as recorded by the scan service; Unknown / unmapped kept separate | Redemptions have no channel, so they are reported as Unmapped |
| G Geography | State → district → branch tiles (no coordinates) and a table | No member locations |
| H Tiers | Tier Master and tier snapshots | Member-level tier history is not supplied by the Tier service |
| I Support | Helpdesk queries and SLA | Satisfaction not available |
| J Retention | 30 / 60 / 90-day cohort matrix; churn trend, by programme and by state | Cohorts that have not matured show Not yet available |
| K Acquisition | New members by registration source, programme, region and cohort | Spend, CAC and payback not calculated (OP-CAC1) |
| L Redemption by product | Gift orders, inventory and Phase 7 redemptions by method; member type × category | Slow-moving needs a threshold (OP-SLOW1); no recommendations |
| M Segmentation | One rule: days since last login (the Adoption basis) with X (OP-DORM, shared with Phase 11) and Y (OP-SEG1) | Members are not classified until both thresholds are set |

- **Freshness:** each panel shows its source freshness (Live, Near real-time, Scheduled, Stale or
  Unavailable). A stale source keeps the last refresh time and is never replaced by zero.
- **Outage test:** "Simulate outage" under Lineage exercises the stale state.

## 5. Member 360 analytics (SOW 13.4) and member app coverage (SOW 13.2)

- **Member 360 analytics** (Member 360 itself stays in Member Management) shows:
  - lifetime earned, redeemed and available points (wallet);
  - last scan and last redemption;
  - TDS by financial year, with paid ₹, paid points and kitty points kept apart;
  - branch, district, sales rep, registered-by and approved-by;
  - the three addresses, separate and each with its update date;
  - the complete change history.
- **Filters:** role, branch, district, sales rep and programme.
- **Export:** needs Member 360 analytics: Export, keeps the filters and masks the mobile number.
  Opening a member and exporting are both audited.
- **Member app contracts** (`analyticsApi`): `memberWallet` (date window), `memberEarningsByCategory`,
  `memberScanHistory` (latest first, claim ID, geo-tag), `memberPassbook` (date, scheme, category,
  status, channel and region filters), `memberStatement` (CSV rows; the PDF layout belongs to the
  statement service) and `memberSchemeProgress` (the scheme engine's milestone rule).
- **Contract check:** the coverage tab lists these contracts and can run a check against them. That
  check is a service response, not a member app screen.

## 6. Scan & QR reporting (SOW 13.5)

- **Tabs:** QR / scan report, Scan-Out, Scan-In, Combined view (two separate series) and
  Parent-child tracking.
- **Report contents:** every SOW column; QR references masked; filters for every listed field;
  search, sort, pagination, page size, Clear all; CSV and Excel export; and a scan drill-down
  (request, validation, ledger credit, scheme, failure).
- **Points:** only Scan-Out carries points. Scan-Out points equal the Wallet scan and base credits
  exactly (test 107).
- **Restricted fields:** precise coordinates and the salesperson field need Scan reports: View
  sensitive. Without it, location is district-level only.
- **Salesperson:** comes only from the Member Management sales-rep mapping and is never invented
  (OP-62).
- **Parent-child tracking:** built from the Phase 11 eSeal pack mappings. One missing child is
  flagged, and the mapping source is unconfirmed (OP-62 / OP-32).

## 7. Finance reports (SOW 13.6)

- **Points ageing:**
  - As-on date, district, branch, role, category and programme filters.
  - One row per member and product category, with FY2021-22 to FY2026-27 buckets and totals.
  - Allocation treats the oldest earned points as spent first. This is a development method and is
    labelled OP-AGE1.
  - Each member's ageing total equals the wallet's available balance at the as-on date (every member
    checked, tests 113–114).
  - No provision is calculated.
  - Excel and CSV exports keep the pivot structure, with a Filters sheet in Excel and a header line
    in CSV.
- **TDS monthly liability:**
  - Month, financial year, role, branch and programme filters.
  - EP shows kitty points held at scan; Retailer, ST and CS show recorded redemption TDS; DD shows
    Not configured.
  - Taxable value shows "Not supplied" (OP-TAXV).
  - PAN is masked by default. The PAN reference held by KYC is shown, or exported unmasked, only
    with Finance reports: View sensitive (direct grant DG-0008 to the Finance user), and each such
    view or export is audited.
  - The monthly total reconciles with the Phase 7 TDS records.
- **Other finance reports** link to the Phase 7 screens: quarterly TDS, 26Q, scheme-wise TDS,
  passbook, settlement, payout and reconciliation.

## 8. Programme reporting (SOW 13.7)

- **Programme tabs:** EP, ST, CS and Retailer each show members, points, scan success, categories,
  top members and schemes.
- **Direct Dealer:** a separate area with the same common figures, a reference to the DD slab
  schemes, and DD-specific outputs marked Business Confirmation Required (OP-43).
- **Sales executive:** members mapped through Member Management, limited to the viewer's scope.
  Each one opens in Member 360.
- **View-As:** the portal has no View-As feature. This is noted on the screen, and the header
  identity switcher is a development tool only.
- **Job dashboard:** marked Proposed / change request required (Module 12). It is not built and
  cannot be scheduled.

## 9. Exports, scheduling and alerts (SOW 13.8)

- **Dashboard exports:**
  - PDF and PNG of the visible view.
  - The image carries the filters, comparison period, export reference, user, source timestamp and
    the demo-data label, plus the KPI tiles and charts.
  - Checked in the browser: a filtered overview gave a valid PNG (133 KB) and PDF (121 KB).
- **Report exports:**
  - CSV and Excel (SpreadsheetML: a Report sheet plus a Filters sheet).
  - The service re-checks Reports: Export, the report's own permission and the module export
    permission before generating anything.
  - Refusals are recorded, and exports containing member, identity or financial data are audited as
    sensitive.
- **Export history:** reference, report, format, user, time, filters, records, source timestamp and
  status. You see your own exports; Reports: Manage sees all.
- **Report runs:** each run records its filters, scope, KPI versions and a checksum, so it can be
  reproduced.
- **Scheduled reports:**
  - Daily, weekly or monthly, at a day and time, with a date range, format and start date.
  - There are no default recipients.
  - Each recipient must be able to open the report and is checked again at every run.
  - Delivery is a Communication Centre staff email (mock).
  - The same slot never runs twice.
  - Delivery history, last status and failure reason are kept.
- **Threshold alerts:**
  - Conditions: below, above, % change or variance, with a value, period, programme scope and
    recipients. Each threshold is versioned.
  - All thresholds stay draft. Activation is refused while OP-ALERT1 is open, and evaluating a draft
    records "Evaluation only · not sent" without dispatching.

## 10. Lineage, consistency and reconciliation

- **Lineage:** the authoritative source per domain (§25.2) is held in `LINEAGE` and shown under
  History → Lineage with live freshness.
- **Reconciliation** (History → Reconciliation): every check currently shows Matched, compared
  against the module itself.

  | Check | Compared with |
  | --- | --- |
  | Points issued | Wallet member lifetime balances |
  | Points redeemed | Wallet redeemed bucket |
  | Scheme points | Scheme accruals |
  | Redemption TDS | Phase 7 recorded TDS |
  | Successful Scan-Out | Wallet scan and base credits |
  | DAU | KPI dictionary |

  A difference would show as an exception; totals are never forced to match.

## 11. RBAC, approvals and audit

| Module | Actions | Notes |
| --- | --- | --- |
| `analytics` | view, export | Dashboards; export is PDF and PNG only |
| `reports` | view, export, execute, create, manage | Catalogue, runs, exports, schedules |
| `member-analytics` | view, export, view_sensitive | Sensitive module |
| `finance-reports` | view, export, view_sensitive, view_financial | Sensitive; unmasked PAN needs view_sensitive |
| `scan-reports` | view, export, view_sensitive | Sensitive; precise location and salesperson need view_sensitive |
| `kpi-governance` | view, edit, submit, approve, reject, return, manage | Maker-Checker (WF-038) |

- **Roles:**

  | Role | Access |
  | --- | --- |
  | Super Admin | No View sensitive on the new sensitive modules, and no approvals |
  | Evolve Operations | Dashboards, Member 360 analytics, scan reports, schedules, KPI governance (manage); no finance reports |
  | Finance | Dashboards and finance reports |
  | Client Admin | Views; finance reports view-only |
  | Regional Admin | State scope |
  | Sales Rep | Member 360 analytics in their branch only |

- **Maker / Checker:** Makers and Checkers carry `kpi-governance`. Rahul (Maker) and Anita
  (Checker) have it added to their module limits.
- **Direct grants:**
  - DG-0008 (Finance user): `finance-reports:view_sensitive`.
  - DG-0009 (technical lead): `scan-reports:view_sensitive` and `member-analytics:view_sensitive`.
- **Storage keys:** access store v14, approval store v11, new `vg-rishta.analytics-store.v1`.

## 12. Tests and checks

`npm run test:analytics`: **155/155 pass** (103 deterministic, 20 blocked-as-expected for open
decisions, 32 governance). SOW calculations are also tested on synthetic activity. All earlier
suites are unchanged:

| Suite | Result |
| --- | --- |
| Schemes | 119/119 |
| Scheme gap probes | 2 of 14 gaps still confirmed (unchanged) |
| Wallet | 92/92 |
| Comms | 37/37 |
| Gifts | 85/85 |
| Risk | 88/88 |
| Integration monitoring | 114/114 |

Typecheck and production build are clean.

**Browser check (production build):**
- All 23 sections and their sub-tabs render without console errors.
- Finance reports are refused to Evolve Operations and open for Finance.
- The overview renders in about 150 ms after its chunk loads.
- A layout overlap between the group row and the sub-navigation was found and fixed.

## 13. Files

- **Types and config:** `src/types/analytics.ts`, `src/config/analyticsCatalogue.ts` (KPI seed,
  decisions, lineage, report catalogue, FY buckets).
- **Logic:**
  - `src/features/analytics/engine.ts`: the pure calculations, including the member app contracts.
  - `seed.ts`: the scan adapter and parent-child links.
  - `store.ts`: scoped queries, governance, exports, schedules, alerts and reconciliation.
- **Service contract:** `src/services/analyticsApi.ts` (mock implementation, plus an HTTP version
  that refuses because nothing is connected).
- **Screens:** `src/pages/analytics/` — `shared`, `OverviewPage`, `DashboardPages`, `ReportPages`,
  `GovernancePages`.
- **Styles and tests:** `src/styles/analytics.css`, `tests/analytics.test.ts`.
- **Changed files:**
  - `src/config/rbacCatalogue.ts`, `src/data/mock/rbacSeed.ts`
  - `src/config/approvalCatalogue.ts`, `src/data/mock/approvalSeed.ts` (WF-038)
  - `src/features/approvals/execution.ts`
  - `src/features/access/store.ts`, `src/features/approvals/store.ts` (storage keys)
  - `src/config/navigation.ts`, `src/App.tsx`, `src/main.tsx`, `package.json`

## 14. Open decisions (History → Decision register)

| Ref | Decision | Restriction until confirmed |
| --- | --- | --- |
| OP-KPI1 | KPI definitions and targets (DAU target, acceptable churn) | Provisional SOW definitions; no targets |
| OP-62 / OP-32 | Salesperson Name in the QR report; parent-child detail and visibility | Field only where mapped and only to sensitive viewers |
| OP-43 | DD-specific reports | Common figures only; DD-specific outputs pending |
| OP-ALERT1 | Thresholds and scheduled-report recipients | Draft thresholds only; no default recipients |
| OP-REV1 | Revenue attribution method | No revenue figures |
| OP-CAC1 | Marketing spend source, channel master, payback assumptions | No CAC or payback |
| OP-SEG1 | Dormant / churned thresholds (Dormant shares OP-DORM) | Members not classified |
| OP-AGE1 | Points ageing allocation and provisioning | Oldest-first development method; no provision |
| OP-SLOW1 | Slow-moving stock threshold | Items not classified |
| OP-TAXV | Taxable value and DD TDS model | Taxable value Not supplied; DD Not configured |
| Module 12 | Technician job dashboard | Proposed; not built |

## 15. Known limitations

- **Services to connect:** the analytics warehouse, scan service, activity service, sales and
  marketing-spend sources, the statement PDF service, and server-side export storage and scheduling.
- **Exports:** generated in the browser when requested. The history keeps metadata only, not files.
- **Dashboard images:** charts are rasterised from their SVG; CSS colour variables become a neutral
  colour in the image.
- **View-As:** not built, and is not part of Module 13.
- **Scan sample:** the scan dataset is a development adapter, so channel, claim ID and Scan-In
  records are illustrative.
