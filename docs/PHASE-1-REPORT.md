# Phase 1 completion report

V-Guard Rishta — Enterprise Operations & Governance Portal
Scope: portal foundation, application shell, navigation, executive dashboard (sections A–P).

## 1. What was built

- A new React + TypeScript + Vite application (the project folder was empty, so there was no
  existing stack to preserve).
- Application shell: grouped, collapsible sidebar; top bar with breadcrumbs, page title, global
  search (Ctrl K), notifications panel, help panel and account menu; sign-out with confirmation.
- Permission-ready navigation: every item declares a permission; the shell checks the signed-in
  user's explicit permission list. Future modules route to an honest "Coming in a subsequent phase"
  page and are styled as planned ("Later"), never as finished features.
- Dashboard with all sixteen sections, grouped into six areas, each collapsible, refreshable and
  driven by the global filters.
- A mock data layer behind a typed data-source contract, ready to be swapped for real APIs.

## 2. Design direction (unslop + UI/UX Pro Max)

> **Superseded by refinement 01.1.** The portal now uses the V-Guard yellow / black / white brand
> theme, glass KPI cards and gradients described in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). The
> notes below record the original Phase 1 direction; data, sections and interactions are unchanged.

| | |
| --- | --- |
| Product | Operations and governance console for the V-Guard Rishta loyalty programmes |
| Character | exact, accountable, calm |
| World | the control panel of an electrical-goods maker: meters, panels, wiring labels |
| Moments | programme distribution (each programme owns one colour) and the daily scan trend |
| Signature | programme code chips — mono code with its colour mark, used wherever a programme appears |

Decisions:

- **Neutrals carry the screen.** Dark ink navigation (`#0e121b`), light graphite content area. One
  accent, V-Guard red, used only for the active nav marker, the primary button and a small marker
  on the figure that needs attention.
- **Red means bad.** Chart colours are ink and slate; red appears only for failures, rejections and
  negative trends, so it is never confused with the brand accent.
- **Type:** IBM Plex Sans for the interface, IBM Plex Mono for codes, IDs and chart axes. Weights
  400/500 (600 only for the wordmark), sentence case, tabular figures, Indian digit grouping
  (12,34,567; crore abbreviated as Cr).
- **Spacing** on a 4px grid; radius 4 (tags) / 8 (controls) / 12 (cards) / 14 (dialogs).
- **KPIs are numbers** — label, figure, comparison, one-line description. No sparklines.
- **Motion** limited to colour/opacity/transform transitions on one curve; respects reduced motion.
- **No glassmorphism or decorative gradients.** The top bar uses a light backdrop blur only for
  legibility while content scrolls under it.
- Python is not installed, so the UI/UX Pro Max search scripts could not run; its built-in rules
  (accessibility, interaction, charts, navigation) were applied directly.

## 3. Dashboard sections

| | Section | Highlights |
| --- | --- | --- |
| A | Platform overview | 12 KPIs in four groups (members, scans today, points & redemption, governance), each clickable |
| B | Programme distribution | Donut, comparable ranked bars with metric picker, programme table with "Focus" to filter |
| C | Registration analytics | Monthly/quarterly/yearly toggle, last-year comparison, quick FY ranges, by programme, by member type, month-on-month table |
| D | Registration & approval status | Status share bar, per-programme status table (n/a where a status is not in that workflow), approval trend, ageing, pending by programme and state |
| E | Active members | DAU (30 days), MAU, unique active, active share, active vs inactive per programme, definition tooltip |
| F | Geography | State → district → branch drill-down, ranked bars, programme-mix bars, "filter dashboard to" action, map note |
| G | Scanning analytics | Totals, daily trend (main chart), success/failure donut, monthly, by programme, category, member type, programme summary, top products |
| H | Points summary | Balances at period end (TDS Kitty separate), period movement, trend, programme table with TDS model |
| I | Redemption & payouts | Totals, pending/failed payouts, status bar, trend, programme table with redemption options |
| J | KYC & verification | Per-check outcome bars (applicable programmes shown), PAN operative status, ageing, programme table — aggregates only |
| K | Scheme performance | Status counts, distribution, points trend, top schemes, table with budget used and open liability |
| L | Gifts & fulfilment | Catalogue figures, fulfilment status, programme table (gift-enabled programmes only) |
| M | TDS & financial | Four separate figures: TDS at accrual, TDS at redemption, TDS Kitty, available points (reference); monthly by model; PAN status; pending activities |
| N | Referral programme | Totals, trend, programme table showing "Not enabled" where referral is off |
| O | Fraud & risk | Summary-only note, category bars, trend, case status, ageing, recent high-priority alerts (masked members) |
| P | Operational performance | Approvals, tickets, SLA, integrations, scheduled jobs, system alerts, paginated activity log |

## 4. Interactions

- Global filters: date range (financial year, this month, last 3 months, custom), financial year,
  programme, state → district → branch (cascading), product category. Changes apply in place;
  active filters show as removable chips with Clear all; state persists for the browser session.
- Sections that a filter does not apply to say so ("Not filtered by product category").
- Comparisons only where data exists (same period last FY, previous 3 months, same days last
  month); otherwise "No comparison available".
- KPIs, chart points, donut slices, bars, status counts and table rows open a drill-down panel that
  names the destination module, the filters carried over and the module's planned scope, with a
  link to that module's placeholder page (filters shown there too).
- Chart tooltips, legend toggles (series show/hide), section expand/collapse (remembered),
  section refresh and Refresh all, last-refresh time, search + sort + pagination on tables,
  CSV export (first line marks the file as demo data), loading skeletons, empty states, error
  states with retry, toasts.
- Keyboard: skip link, visible focus, Ctrl K search with arrow keys, Escape closes overlays,
  focus trapped in dialogs and restored on close, clickable table rows reachable by Tab/Enter,
  `aria-sort` on sortable headers, `aria-expanded` on toggles.
- Checked at 1440, 768 and 375 px widths: no horizontal page scroll; sidebar becomes a drawer
  below 1024 px; filters collapse behind a button on phones.

## 5. Data model

- `types/domain.ts` — `ProgrammeConfig` (workflow statuses, KYC checks, TDS model, TDS Kitty flag,
  referral flag, redemption options, point value), geography, product category, `SessionUser`
  with independent organisation, roles, explicit permissions and programme/state scope.
- `types/dashboard.ts` — filters, resolved period, `KpiMetric` (with optional comparison and
  good direction), `DrillTarget`, series/share shapes and one payload type per section.
- `services/dashboardSource.ts` — the `DashboardDataSource` contract (one method per section).
- `services/mockDashboardSource.ts` — demo implementation.
- `services/api.ts` — `DATA_MODE` switch and `httpDashboardSource` placeholder that throws
  `ApiNotConnectedError`. No endpoints are invented.
- `data/mock/engine.ts` — deterministic fact table at programme × state × month with opening
  balances; aggregation respects every filter.

## 6. Dependencies

`react`, `react-dom`, `react-router-dom`, `recharts`, `lucide-react`; dev: `vite`,
`@vitejs/plugin-react`, `typescript`, React type packages. `rollup` is overridden with
`@rollup/wasm-node` because Windows Application Control blocked the native Rollup binary.
No Framer Motion: CSS transitions were sufficient.

## 7. Known limitations

- All data is synthetic and pinned to 9 Nov 2026, 14:30 so figures stay stable.
- Monthly charts exclude the in-progress month (stated in the filter bar); daily charts include
  today as a partial day.
- "Unique active in period" is an approximation in the mock engine.
- TDS amounts use illustrative demo rates (2% at accrual, 5% at redemption) — not business rules.
- No map: a map needs an approved provider and boundary data; the section uses ranked lists.
- Notifications, help content and global record search are placeholders for later phases.
- Recharts 2.x is no longer actively developed; plan a move to Recharts 3 later.

## 8. Needs confirmation from the business / SOW

1. Official names, codes and order of the programmes (EP, ST, CS, Retailer, DD) and what each
   code stands for. "EP/IMP" was mentioned — is IMP a separate programme or an alias?
2. Member/user types per programme (demo: Electrician, Plumber, Retailer, Counter staff,
   Service technician, Distributor).
3. Registration workflow statuses per programme and their exact labels.
4. KYC checks per programme (Aadhaar, PAN, PAN operative status, bank, GST) and when each is
   collected.
5. TDS model per programme (at accrual vs at redemption), rates, thresholds, and DD's treatment.
6. Which programmes hold a TDS Kitty, and how Kitty releases work.
7. Definition of an active member (qualifying actions and window) for DAU and MAU.
8. Point-to-rupee value per programme and the confirmed redemption options (cash, gift).
9. Payout integration and settlement mechanism, and what counts as a failed payout.
10. Whether referral is approved per programme, and the eligible referral combinations.
11. Gift catalogue source and fulfilment partner (no external marketplace assumed).
12. Product categories and SKU master source for scan analytics.
13. Fraud case status workflow (New, Under review, Escalated, Resolved, Dismissed) and risk categories.
14. Whether TDS certificates or statements are in scope.
15. Integrations to monitor (demo lists SFDC sync, KYC, payout, SMS, QR/product feed) and job list.
16. Support desk contact and help content for the Help panel.
17. Approved map provider, if a geographical map is required.
