# Phase 6 — Scheme & Incentive Management · completion report

> Development build. Every scheme, transaction, reward, settlement, tier, referral, campaign and
> contest entry is development / demo data held in the browser tab. No V-Guard scheme engine,
> wallet/ledger, SFDC, member app, SMS, email or payment service is connected. Rewards in this build
> are calculated by a **mock** evaluation adapter so traceability can be demonstrated; production
> calculation belongs to the backend scheme engine.

## What was built

| Area | Route | Content |
| --- | --- | --- |
| Overview | `/schemes` | 16 KPIs with drill-down, accrual / status / programme / state / category analytics, participation, budget utilisation, pending settlement |
| Schemes | `/schemes/list` | Directory filtered by status (draft, pending, approved, scheduled, active, completed, deactivated, ending soon, budget alert) and programme; lifecycle check |
| Calendar | `/schemes/calendar` | Month timeline and list; bars follow approval and activation state |
| Builder | `/schemes/new`, `/schemes/scheme/:id/edit` | Eight-step wizard covering the configuration components |
| Scheme detail | `/schemes/scheme/:id` | Configuration, validation and liability, versions and change impact, performance, budget and exposure, settlement, extensions and backdated, concurrency, audit, ledger and simulator |
| Settlement | `/schemes/settlement` | Rules, pending, two-level approval status, history, reconciliation and reward trace |
| Tiers | `/schemes/tiers` | Overview, configuration, benefits, branch-wise mapping, history |
| Referrals | `/schemes/referrals` | Overview, rules, relationships, journey tracking, reward configuration, settlement summary |
| Campaigns & contests | `/schemes/campaigns` | Overview, directory, Display Contest (entries, winners gallery, CSV, regional banner), FOC / Buy-X-Get-Y with gift CSV and backend redemption, performance |
| Gamification & bonuses | `/schemes/gamification` | Badges, streaks, scratch cards, spin wheel, leaderboards, achievement feed, bonuses |
| Governance | `/schemes/governance` | Decision register, formula registry, audit trail, configuration guide template, SOW coverage, integration contracts |

The primary sidebar gained one entry (**Schemes & incentives**), replacing the two planned
placeholders "Scheme builder" and "Campaigns & gamification". Everything else sits in the module's
secondary navigation.

## 1. Scheme engine architecture

```
pages/schemes/*            UI only: renders, collects input, calls the store
features/schemes/engine    pure: validation, applicability, overlap, exclusivity conflicts,
                           eligible population, deterministic rule helpers, exposure, liability
                           interface, settlement preview, field comparison for approvals/audit
features/schemes/mockEngine  mock rule-evaluation + reward-accrual adapter (idempotent ledger
                           posting, budget auto-stop, exclusivity, linked reversals)
features/schemes/store     mutations: RBAC re-check, approval-engine requests, execution
                           handlers, activation adapter, audit events
features/schemes/seed      replays a demo transaction feed through the mock adapter
services/schemeApi         contracts (configuration, liability, lifecycle, accrual, settlement)
                           with mock and not-connected HTTP implementations
config/schemeCatalogue     labels, SOW component map, targeting sources, guide, contracts
```

Mapping to the 20 services in Section 22: UI (pages), configuration service and rule registry
(store + `SchemeConfig`), validation (`validateConfig`), rule evaluation, reward accrual and
wallet/ledger adapters (`mockEngine`, `RewardAccrualAdapter`), eligibility and targeting
(`eligiblePopulation`, `memberEligible`), budget and exposure (`exposureOf`), projected liability
(`projectedLiability`, `ProjectedLiabilityAdapter`), approval adapter (central Phase 3 engine),
activation adapter (`activateScheme` + `activationChecks`), settlement (`createSettlementRequest`,
execution handler), tier, referral, campaign and gamification services (store sections), audit
(append-only `SchemeAuditEvent`), reporting/export (`pages/schemes/exports.ts`).

The engine is one model for all five programmes. Programme-specific behaviour comes from
configuration (programme selection, Base Points rows per programme, Elite only for Retailer) and the
existing programme and SKU masters, not from separate engines.

## 2–3. SOW components and coverage

All 21 Scheme Builder components are present (Governance → SOW coverage lists each with its screen):

| SOW | Component | Where | Status |
| --- | --- | --- | --- |
| 6.2.1 | Basic configuration | Builder · Basics | Implemented; Level 0/1 recorded only (OP-SB-LVL) |
| 6.2.2 | Base Points | Builder · Base Points matrix | Implemented; overlap and duplicate detection |
| 6.2.3 | Rider Points | Builder · Advanced earning | Configurable; submission and activation blocked (OP-SB-RIDER) |
| 6.2.4 | Cross-selling | Builder · Advanced earning | Implemented with explicit values; formula-based bonus blocked |
| 6.2.5 | Quantity-based | Builder · Advanced earning | Implemented |
| 6.2.6 | Category-specific | Builder · Applicability | Implemented; sub-category covers every SKU beneath it |
| 6.2.7 | Combined rules | Builder · Combined rules | Implemented; precedence not assumed (SCH-Q4) |
| 6.2.8 | Milestone | Builder · Advanced earning | Implemented; multi-level; Rider contribution blocked |
| 6.2.9 | Slabs + downgrade / reversal | Builder · Advanced earning | Implemented; reversal correction pending (SCH-Q7) |
| 6.2.10 | Growth-based | Builder · Advanced earning | Configurable; blocked (OP-01) |
| 6.2.11 | Duration & evaluation | Builder · Basics | Implemented; periodic and cumulative windows use the platform FY |
| 6.2.12 | Eligibility | Builder · Eligibility | Implemented; group / segment / Elite flagged as not connected |
| 6.2.13 | Branch & product applicability | Builder · Applicability | Implemented on Phase 4 masters |
| 6.2.14 | Targeting | Builder · Eligibility | All dimensions configurable; source availability shown |
| 6.2.15 | Backdated + special-member extension | Builder; scheme detail | Implemented as separate approved operations |
| 6.2.16 | Concurrency & exclusivity | Scheme detail · Concurrency | Inclusive by default; explicit rules; conflicts flagged |
| 6.2.17 | Review, validation, projected liability | Builder · Review; detail | Implemented; liability pending formula (OP-SB-LIAB) |
| 6.2.18 | Lifecycle & approval | Detail actions + Approval Centre | Implemented; approval ≠ activation |
| 6.2.19 | Performance tracking | Detail · Performance | Implemented with CSV / Excel / PDF export |
| 6.2.20 | Audit trail | Detail · Audit; Governance | Implemented, append-only |
| 6.2.21 | Configuration guide | Governance · Configuration guide | Template; ownership pending (OP-SB-GUIDE) |
| 6.1 | Scheme engine (all programmes) | Whole module | Common engine, budget control, targeting, backdated |
| 6.3 | Tier system | `/schemes/tiers` | Implemented; branch valuation separate (OP-07) |
| 6.4 | Referral programme | `/schemes/referrals` | Implemented; activation blocked (OP-REF1) |
| 6.5 | Campaigns & contests | `/schemes/campaigns` | Implemented; Lucky Draw TN restriction enforced |
| 6.6 | Gamification & engagement | `/schemes/gamification` | Implemented; allocations and triggers blocked where open |
| 5.2 | Points buckets & settlement | Settlement + detail | Base vs scheme points, partial release, two-level approval |
| 10.6 | Setup of schemes, tiers, bonuses, referrals | All of the above | Covered |

## 4–5. Basic configuration and earning constructs

Every reward is either an **explicit value** typed by the Maker (fixed points, or points per unit)
or a **business formula** from the formula registry. All registry formulas are pending, so any
configuration that relies on one is blocked. No construct has a default value; blank stays blank.

- Base Points: a matrix of rows (category / sub-category / SKU × programme × branches × points).
  Two rows covering the same SKU, branch and programme are an error, at the same or different
  levels, because precedence between levels is not defined (SCH-Q1).
- Quantity and Slab: thresholds, slabs with min / max / priority; overlapping slabs resolve by
  priority, equal priorities on an overlap are an error.
- Milestones: multiple levels with increasing thresholds; contributions Base, Base + Rider,
  Base + Cross-sell, Base + Rider + Cross-sell (Rider variants blocked).
- Cross-sell: participating categories with minimums and a required count.
- Combined rules: participating components, all-of / any-of, dependencies, invalid combinations
  (Rider without Base, Slab without an achievement source) rejected.

## 6. Targeting

All dimensions from 6.2.14 and 10.6 are configurable. Each carries its source:

| Available now (member / product / branch masters) | Configurable, not computable (source not connected) |
| --- | --- |
| Programme, role, state, district, branch, pincode, selected members / Rishta IDs, multi-select, category, sub-category, SKU, date, event | Retailer type, group, segment, Elite, billed-to party, RFM, not scanned for X days, not opened app for X days, business decline Y% over X days |

X and Y are never defaulted. The eligible population is counted only on available attributes; if
any unconnected dimension is used it shows "N+ counted; not computable for …". The mock engine does
not credit rewards on dimensions it cannot evaluate.

## 7–8. Budget, financial exposure and projected liability

The Budget & exposure tab shows the 13 measures of Section 13 separately: budget, projected
liability, accrued liability, credited, unsettled, released, remaining, burn rate, backdated
exposure, extension exposure, and exposure by programme, branch and component. Budgets are in
points; rupee valuation is not set in this module.

Projected liability (OP-SB-LIAB): the service interface exists with inputs, formula ID and version,
timestamp, data source, assumptions, eligibility count, output and validation status. While the
formula is pending it shows **Pending business formula**, outputs nothing, and a financial sign-off
attempt is refused and audited. Approval requests state that no liability figure was available.
Activation applies only to the development engine and is labelled so; production activation stays
blocked.

## 9. Lifecycle and approval

Draft → Review → Pending approval → Approved / Returned / Rejected → Scheduled → Active →
Budget exhausted / Deactivated / Completed → Closed, plus Business confirmation required and
Activation failed.

- Submission goes to the central Approval Centre (`scheme_create`, `scheme_modify`,
  `scheme_budget_change`). Configurations with business-confirmation items cannot be submitted.
- Approval marks the version Approved (or Scheduled if the start date is ahead). It never activates.
- Activation is a separate action (Scheme builder: Activate) through the activation adapter, which
  re-checks the approved version, open decisions, masters, budget and exclusivity conflicts. A
  development flag can make the adapter fail once to demonstrate Activation failed; a failed
  activation leaves the prior active version running.
- Deactivation and closure go through approval. Closure never settles points.
- Approval requests for multi-programme or multi-state schemes route only to Checkers whose scope
  covers every programme and all geography (the access and approval engines now treat
  `"EP + Retailer"` as "must cover both").

New workflows: WF-014 budget and backdated (V-Guard → Finance), WF-015 settlement (V-Guard
programme approval → Finance), WF-016 tiers, WF-017 referrals, WF-018 campaigns / gift batches /
backend redemption, WF-019 gamification and bonuses. WF-002 now also routes deactivation, closure,
extensions and exclusivity. Scheme lifecycle request types are marked Approval required (SOW 6.2.18);
GD-04 stays open on regional sufficiency and minor edits.

## 10. Versioning

Each version holds a full configuration snapshot, rule version, formula versions, creator,
approver, approval reference and effective range. Drafts are editable; submitted versions are
read-only; approved versions are kept; a change to an approved scheme creates a new version; a
new active version supersedes the prior one without rewriting accruals already calculated. The
Versions tab compares any two versions and shows the impact of the pending version against the
active one (members, qualified members, accrued and unsettled points, budget, settlement,
historical calculations, and "Not available" for projected impact).

## 11. Performance scorecards

Per scheme: eligible / participating / qualified members (kept separate); reward accrued, credited
and settled; by component, slab and milestone, category, sub-category, SKU, branch and programme;
budget, exposure, projected liability (pending), actual liability, burn rate, remaining exposure;
baseline comparison only where a baseline is configured (growth pending OP-01). Filters: date
range, programme, branch, category, component, member (needs Member management: View). Export:
CSV, Excel (HTML-table `.xls`) and PDF (browser print), only with Scheme builder: Export; point
columns only with View financial exposure.

## 12. Audit

Every save, field change (old → new), submission, decision, activation, deactivation, closure,
extension, exclusivity rule, backdated run, mock evaluation, settlement, tier, referral, campaign,
contest review, photo access (allowed or denied), decision update and formula change writes an
append-only event with reference, version, user, organisation, time, change type, reason and
approval link. No portal action edits or deletes audit events or prior versions.

## 13–14. Base vs scheme points; settlement and partial release

- Base Points accrue to the **redeemable** bucket (redemption itself remains subject to the Phase 5
  KYC and redemption eligibility). Scheme / milestone / slab / cross-sell points accrue to the
  **unsettled** bucket. The two are never merged.
- Partial release: explicit tranche percentages per scheme (no default split), validated to total
  exactly 100%; percentages apply per accrual and any fraction is held and shown (SCH-Q3).
  Triggers: during the scheme, month end, final settlement.
- A settlement request checks tranche, closure / partial-release criteria, pending reversals,
  completed qualification and unsettled points, then goes through **two-level approval** (WF-015).
  Execution posts a distinct **Settlement Release** entry (ledger and passbook reference, approvers,
  approval reference). Failed executions can be retried under the same approval; a second
  execution is refused.
- Reversals from sales returns are linked records (original accrual, transaction, scheme, version,
  member, ledger, reversal reference) marked pending: the correction formula is open (SCH-Q7) and
  the original entry is never deleted. A pending reversal blocks settlement of that scheme.

## 15–18. Tiers, referrals, campaigns, gamification

- **Tiers:** configuration, benefits with redeem-up-to messaging, branch-specific thresholds, and a
  separate branch valuation note that is never applied (OP-07). Tier membership counts come from a
  development snapshot; no tier rule is invented. Bronze–Diamond are labelled as SOW examples.
- **Referrals:** Influencer → Influencer, Retailer → EP, Retailer → ST configurable and tracked
  (registration, KYC, qualification, reward, settlement, integrity checks that flag without
  thresholds). Retailer → Consumer is reserved and cannot be activated. Referral rewards use a
  separate bucket. All blocked by OP-REF1.
- **Campaigns:** all eight types. Lucky Draw cannot target Tamil Nadu: checked on save, submit and
  execution, including "All states" and TN branches, for every role. Display Contest supports
  entries, photo preview behind a sensitive permission (denials logged), review outcome, winners
  gallery, CSV and a recorded (not published) regional banner; only source-confirmed camera
  captures can win. FOC supports same SKU, different SKU and gift entitlement; X and Y must be
  explicit (SCH-Q6); bulk gift CSV is validated row by row and issued only after approval; backend
  redemption on a member's behalf needs approval.
- **Gamification:** badges, streaks (duration never defaulted), scratch cards and spin wheel (no
  random distribution without an approved allocation), leaderboards (no invented ranking or
  tie-break), achievement feed, and Welcome / Assured Scratch / Mega Scratch bonuses (blocked by
  OP-SB-BONUS). Member-facing screens are not built; the member-app contract is documented.

## 19. RBAC

New actions: Activate, Close, View financial exposure, Configure formula. New modules: Scheme budget &
exposure, Scheme settlement, Tier management, Referral management, Gamification & bonuses
(Campaigns & contests gained Export and View sensitive). Every store action re-checks the
permission for every programme the record covers.

| Persona | Phase 6 access (demo) |
| --- | --- |
| Rahul Menon (Evolve Ops + Maker) | Create, edit, submit across scheme modules; activate / deactivate / close; engine operator (simulator, backdated run) |
| Anita Krishnan (V-Guard Client Admin + Checker) | Views everything; approves scheme, budget stage 1, settlement stage 1, tiers, referrals, campaigns, gamification; **cannot** edit budgets or see contest photos |
| Lakshmi Raman (Finance + Checker) | Views schemes, budget, settlement; approves budget and settlement stage 2 only |
| Joseph Mathew (Checker, schemes, EP · Karnataka) | Cannot approve schemes outside EP / Karnataka, multi-state schemes, or settlements |
| Tanujit Roy (Super Admin) | Configures, but holds no approval right and cannot submit without a Maker profile; cannot bypass approval |

## 20–21. Mock data, scenarios and test results

16 demo schemes cover every status: two versions on SCH-0001 (traceable v1 / v2 accruals),
milestones with an executed partial release (SCH-0002), monthly slabs with a pending reversal
(SCH-0003), a completed cross-sell scheme with a pending final settlement (SCH-0004), two inclusive
overlapping schemes (SCH-0003 / SCH-0005), Rider and Growth pilots in Business confirmation
required, a pending, a returned, a draft, a scheduled, an approved-not-active, a deactivated, a
closed-and-settled, a budget-exhausted (auto-stopped) and a backdated scheme. A 688-transaction feed
is replayed through the mock adapter to produce the 538 seeded reward calculations, so seed and live
data follow the same rules. Approval requests for the seed are raised through the real approval
engine (101 requests in total, no routing warnings).

`npm run test:schemes` — **87 / 87 pass** (37 deterministic, 23 blocked-as-expected, 27 governance),
covering every case in Section 20. Deterministic cases use test-fixture values (for example 3 units
× 9 points = 27 on SCH-0001 v2), never business values. Blocked cases assert that unresolved
formulas produce no figure: Rider, Growth, liability, reversal amount, referral, bonus, allocation,
ranking, streak duration, RFM, billed-to party, and inactivity / decline without X or Y.

Browser verification: 113 route / tab combinations render with no console errors; the Phase 2–5
routes still render. At 390 px no page scrolls sideways. Click-through in the UI:

- An incomplete draft's review shows its errors.
- Submitting the Rider pilot is blocked by OP-SB-RIDER.
- Anita approves the CS scheme, which goes to Scheduled, not Active.
- Rahul activates SCH-0016.
- SET-0003 releases nothing after stage 1; after Lakshmi's stage 2 it executes and posts LDG-REL-0003.
- Lucky Draw · South is refused for Tamil Nadu.
- A reward traces from transaction to ledger and settlement.

Fixed during verification:

- The Builder kept one scheme's form state when opening another scheme's editor. It now remounts for each scheme.
- The eight Builder step labels overlapped each other.
- The budget-utilisation list showed a misleading "share" column.
- Phone-width overflow on the Builder and the scheme detail page.
- Milestone labels were doubled ("Milestone Milestone 1").

`npm run build` passes. The main bundle is now about 1.35 MB (from about 1 MB). Route-level code
splitting is the most useful follow-up.

## 22–23. Open decisions and blocked features

All eight SOW points stay **Open** in the in-app register. The build also raised 12 questions of its
own (SCH-Q1 to SCH-Q12). Each has an owner, the configuration it affects, and an activation
restriction.

| Reference | Blocked or restricted |
| --- | --- |
| OP-SB-LVL | Level recorded only; schemes marked as using level semantics cannot be submitted |
| OP-SB-RIDER | Rider Points, Rider milestone contribution, combined rules with Rider |
| OP-01 | Growth-based schemes |
| OP-SB-LIAB | Projected liability figure, financial sign-off, production activation |
| OP-SB-GUIDE | Guide ownership |
| OP-07 | Branch tier valuation (recorded, not applied) |
| OP-SB-BONUS | All bonuses |
| OP-REF1 | All referral rules; Retailer → Consumer reserved |
| SCH-Q1 | Base Points rows at different levels for the same SKU and branch (error) |
| SCH-Q2 | Partial credit when an accrual crosses the cap (mock refuses it) |
| SCH-Q3 | Rounding of partial releases (fractions held) |
| SCH-Q4 | Execution precedence in combined rules |
| SCH-Q5 | Scratch-card / spin allocation; Spin campaigns |
| SCH-Q6 | Buy-X-Get-Y without explicit X / Y |
| SCH-Q7 | Reversal and downgrade correction amounts; settlement of affected schemes |
| SCH-Q8 | Leaderboards without a tie-break rule |
| SCH-Q9 | RFM, inactivity and decline sources |
| SCH-Q10 | Conflicting exclusivity precedence (seeded conflict SCH-0001 / SCH-0015 / SCH-0005 blocks activation of new versions of those schemes) |
| SCH-Q11 | Streak duration |
| SCH-Q12 | Whether milestone levels each pay their reward (mock pays each level once when reached) |

Confirming a decision does not unblock anything by itself. A Super Admin records the decision, then
a holder of Configure formula records the confirmed formula version, then the scheme is revalidated
and resubmitted.

## 24. Known limitations

- The mock adapter runs in one browser tab. Its budget auto-stop, idempotency and exclusivity
  handling show the intended behaviour. They are **not** production-safe concurrent enforcement.
- Quantity, slab and cross-sell rewards are evaluated when a window closes, or on "Run period
  evaluation". Milestones accrue when reached. A backend engine may schedule this differently.
- Tier membership, referral journeys and contest entries are seeded snapshots; no tier, referral or
  contest service exists.
- Campaign rewards are not calculated (no campaign engine is connected).
- "Excel" export is an HTML-table `.xls`; "PDF" uses the browser's print-to-PDF.
- Rupee valuation of points is not modelled here.
- Group, segment, Elite, billed-to party, RFM and behavioural attributes have no data source, so
  populations that depend on them are lower bounds.
- Scheme detail pages compute validation and exposure in the browser; large datasets will need
  server-side aggregation.
- Phase 3 demo requests that reference older `SCH-*-*` codes are kept. Their execution only
  records "Not a Scheme Builder record".
- Bundle size (see above).

## 25. Backend contracts

Interfaces live in `src/services/schemeApi.ts`; proposed paths and idempotency keys are listed in
Governance → Integration contracts (`SERVICE_CONTRACTS`). The reward idempotency key is
`sourceRef | memberId | schemeId | v{version} | component | calculationRef`. Settlement and other
approved executions use the approval engine's `EXE-{request}-V{version}` key. The member-app read
contract is `GET /members/{memberId}/scheme-progress`. None of these is connected, and none is
presented as a live endpoint.

## Implemented vs mock vs prepared vs connected

| Category | Items |
| --- | --- |
| Implemented frontend functionality | All screens, validation, RBAC checks, approval integration, versioning, audit, exports |
| Mock evaluation behaviour | Reward calculation, ledger posting, budget auto-stop, exclusivity enforcement, backdated runs, settlement posting, tier / referral / contest data |
| Prepared backend interfaces | `schemeApi.ts` contracts, `SERVICE_CONTRACTS`, member-app progress contract |
| Actual connected backend services | **None** |
| Confirmed business formulas | **None.** Only explicit Maker-entered values (fixed points, points per unit) are calculated |
| Unconfirmed business formulas | FRM-LIAB, FRM-RIDER, FRM-GROWTH, FRM-XSELL, FRM-REVERSAL, FRM-BONUS, FRM-REF; allocation, ranking, Buy-X-Get-Y without explicit values |

## 26. Screenshots

`docs/screenshots/phase-6/`:

1. `01-scheme-overview.jpg`: KPIs after the click-through
2. `02-builder-review-validation.jpg`: Builder review step with blocking errors and the liability notice
3. `03-base-points-matrix.jpg`: Base Points matrix (SCH-0001, new version)
4. `04-rider-blocked.jpg`: Rider pilot submission blocked by OP-SB-RIDER
5. `05-activation-liability.jpg`: activation in the development engine and the pending liability service
6. `06-settlement-history.jpg`: two-level settlement releases, shown as Finance sees them
7. `07-lucky-draw-tamil-nadu.jpg`: Lucky Draw refused for Tamil Nadu
8. `08-performance-scorecard.jpg`: scheme scorecard with export
9. `09-reconciliation-trace.jpg`: a reward traced from transaction to settlement
10. `10-decision-register.jpg`: open decision register
