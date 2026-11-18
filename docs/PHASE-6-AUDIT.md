# Phase 6 — quality and financial-integrity audit

Audit date: 10 November 2026 (demo clock 9 November 2026). Scope: Scheme & Incentive Management
against SOW 6.1–6.7, 5.2 and the 10.6 administrative controls, as quoted in Build Prompt 06. The
original SOW document is **not in the repository**, so the brief's requirement text is the baseline.

**Summary.** The configuration, validation, governance and approval layers are largely complete and
tested. The calculation layer is a development mock, and it has defects that would matter in a
financial system:

- 14 probes reproduce a defect, including over-release of held settlement points (G1) and execution
  of a settlement after new reversals appeared (G10).
- Members under a Program Block still earn (G3).
- An approved special-member extension produces no credit (G14).
- Product, date and event targeting is ignored when crediting (G5).

Two items in the Phase 6 report were overstated: special-member extensions, and date / event /
product targeting. This audit supersedes those statements.

## Update — fixes applied (approved 10 Nov 2026)

The five critical / high gaps that needed no business answer are fixed. Their probes now report
"no gap", and regression tests 108–111 guard them. Suite: **111 / 111**. Typecheck and build pass.
Browser check: SCH-0002 now offers 60 points instead of 204; the simulator refuses MBR-EP-0010 under
Temporary Hold RST-0002.

| Gap | Fix | Where |
| --- | --- | --- |
| G1 | A during-scheme tranche brings each accrual up to the **cumulative** share of the partial tranches (60% for 60 / 40). Repeating it releases nothing more; a new check "Release available within the tranche cap" refuses an empty request. The seed builder now uses the same function | `engine.settlementPreview`, `seed.ts` |
| G10 | Execution re-runs every settlement check and confirms the release still equals the approved amount and every accrual is still open. Otherwise nothing is posted, the request is marked Execution failed, and the refusal is audited | `store.executeSettlement` |
| G3 | No credit for an unregistered member (pending, rejected, invited) or a member under a Program Block / Temporary Hold in force on the transaction date (a hold from 8 Nov does not undo earlier credits) | `mockEngine.memberEligible`, `restrictedOn`; restrictions passed from Member Management |
| G4 | Group, segment and Elite conditions refuse credit ("cannot evaluate") until the SFDC retailer master exists | `mockEngine.memberEligible` |
| G5 | Category, sub-category, SKU and date-range targeting are applied to each transaction and to period evaluation. Date ranges are validated as `YYYY-MM-DD..YYYY-MM-DD`. Event targeting is now "not evaluable" (selection rule not confirmed) instead of silently ignored | `mockEngine.txnTargeting`, `engine.validateConfig`, `schemeCatalogue` |

Tests changed with the fixes:

- **29:** now also checks a product targeting condition.
- **31:** now "date range applied, event not evaluable".
- **50:** now expects the cumulative cap.
- **86:** earns a fresh milestone before raising its pending request, since the cap leaves nothing
  further to release.

### Second round (approved 10 Nov 2026)

The medium and low gaps are fixed too. Their probes now report "no gap", and regression tests
112–118 guard them. Suite: **118 / 118**. Typecheck and build pass; 72 scheme routes and tabs render
without console errors.

| Gap | Fix | Where |
| --- | --- | --- |
| G2 | A month-end tranche needs the range to end on the real last day of the month (leap years included) | `engine.lastDayOfMonth`, `settlementPreview` |
| G6 | The quantity period is honoured: quantity is decided in its own windows (`quantityWindows`). If it feeds slabs or a combined rule, its period must match the evaluation windows (validation error) | `engine.quantityWindows` / `quantityAligned`, `mockEngine.runPeriodEvaluation` |
| G7, G8 | Inactive or draft SKUs and inactive branches earn nothing, in transactions and period evaluation; the eligible population also excludes inactive branches | `mockEngine.skuActive` / `branchActive`, `engine.eligiblePopulation` |
| G9 | A sales return counts in the window of the sale it reverses, and only once it has happened | `mockEngine.windowTxns` / `windowNetQuantity` |
| G11 | When milestones are part of a combined rule they wait for the window to close, so the combined relationship applies | `mockEngine.evaluatePeriod` |
| G12 | All slabs must share one achievement basis (validation error) | `engine.validateConfig` |

Behaviour notes:

- **Master status is read as of today.** A SKU or branch deactivated later stops earning, including
  in a backdated run, because the masters keep no status history.
- **Population count:** test 23's expected count dropped from 49 to 47 because two EP members sit at
  the inactive Cuttack branch.

Still open:

- G13: waits on a business answer under SCH-Q10.
- G14: waits on a business answer. Which Base Points value applies to an extended member outside the
  rows' branches?
- Branch-based tier benefits: not part of either approved batch.

### Code splitting and seed decoupling (B1, B2; approved 10 Nov 2026)

**B1: seed decoupling.**

- The approval seed no longer builds the master and scheme seeds. The module-raised requests (3
  scanning-configuration requests and 35 scheme, settlement and incentive requests) are recorded as
  replayable steps in `features/approvals/moduleScenarios.ts`.
- `npm run seed:approval-steps` writes the steps to
  `src/data/mock/generated/approvalModuleSteps.ts` (70 kB source).
- `scenarios.ts` replays the steps through the same engine operations. The resulting approval seed
  is byte-identical to the previous one: 101 requests, 1,162 audit events, 538 notifications.
- Test 119 fails if the generated file drifts from the seeds.

**B2: route-level lazy loading.**

- Every page in `App.tsx` is a `React.lazy` import.
- `AppShell` has one Suspense boundary, which shows a skeleton with a "Loading page" status the
  first time a page opens. Later navigations keep the current page on screen until the next one
  is ready (`v7_startTransition` was already on).
- Recharts now loads only with pages that draw charts.

**Execution handlers.** Module stores register their approval execution handler when they load. A
scheme, master or member store may therefore not be loaded when a request is decided on the
Approval Centre. `ensureExecutionHandler` (`approvals/execution.ts`) loads the originating store
before a decision or an execution retry. Browser check in a fresh session: approving
APR-2026-001273 without opening any scheme page loaded the scheme store and executed the request
("SCH-0008 v1 approved. Not active…").

Measured on the production build. JS + CSS downloaded for a first visit, kB raw / gzip / Brotli:

| Page | Before | After |
| --- | --- | --- |
| Start-up (entry + static imports) | 2,071 / 546 / 434 | 655 / 163 / 138 |
| Dashboard | 2,071 / 546 / 434 | 1,183 / 307 / 258 |
| Approval inbox | 2,071 / 546 / 434 | 684 / 174 / 147 |
| User directory | 2,071 / 546 / 434 | 677 / 171 / 145 |
| Products | 2,071 / 546 / 434 | 794 / 206 / 176 |
| Member directory | 2,071 / 546 / 434 | 1,251 / 332 / 281 |
| Scheme detail | 2,071 / 546 / 434 | 1,035 / 278 / 237 |
| Scheme overview | 2,071 / 546 / 434 | 1,417 / 380 / 321 |

All files together come to 2,171 / 607 / 520, slightly more than before because of chunk overhead
and the generated steps; nothing downloads them all at once.

**Start-up work (Node, five runs).** The scheme store (94–179 ms), master store (5–21 ms) and member
store (12–28 ms) no longer run when the dashboard loads. They build when their module first opens.
The approval store still builds at start-up for the header's notification bell: 215–313 ms, almost
all of it the Phase 3 history replay (48 requests).

Checks:

- 119 / 119 tests pass and 12 of 14 probes are clean (G13, G14 unchanged).
- Typecheck and build pass with no warnings.
- On the production build, 71 routes across all modules render with no console errors.
- A cold deep link to `/schemes/scheme/SCH-0002` loads correctly.

Not done in this round:

- **B5 CSS split.** All stylesheets are still imported in `main.tsx` (one 117 kB file, 21 kB gzip).
  Moving them to their modules changes cascade order and needs a visual check of every page.
- **Approval seed start-up cost.** Precompute the Phase 3 history, or load the notification bell's
  data after first paint.

## 1. What changed during this review

During the audit itself no source file under `src/` was changed (the approved fixes above came afterwards). `dist/` and `vite.config.ts` are untouched (the audit build
went to a scratch folder). No Git was initialised.

| File | Change |
| --- | --- |
| `tests/schemes.test.ts` | +20 cases (88–107) for rules fully defined by configuration, then +11 fix regressions (108–118). Suite now 118 / 118 |
| `tests/schemes.gaps.ts` | New: 14 reproducible gap probes (`npm run test:schemes:gaps`, always exits 0) |
| `package.json` | New script `test:schemes:gaps` |
| `docs/PHASE-6-AUDIT.md` | This report |

Project structure (unchanged):

```
src/  config(10) context(4) data/mock(9) features/{access,approvals,masters,members,schemes}
      pages/{approvals,dashboard,masters,members,schemes,users} services(10) styles(10) types(7)
tests/ schemes.test.ts (107 cases) · schemes.gaps.ts (14 probes)
docs/ PHASE-1…6 reports, PHASE-6-AUDIT, DESIGN-SYSTEM, screenshots/phase-3…6
```

Phase 6 code: about 6,800 lines in `types/schemes.ts`, `config/schemeCatalogue.ts`,
`data/mock/schemeSeed.ts`, `features/schemes/{engine,mockEngine,seed,store}.ts`,
`services/schemeApi.ts`, `pages/schemes/*` (9 files) and `styles/schemes.css`.

## 2. Status definitions used

| Status | Meaning in this audit |
| --- | --- |
| Fully Implemented | Portal-owned behaviour (configuration, validation, approval, RBAC, versioning, audit) complete **and** covered by an automated test that checks the outcome |
| Partially Implemented | Works, but part of the requirement is missing or a probe confirms a defect |
| UI Only | Screen or template exists; no behaviour or service behind it |
| Mock Service Only | Logic runs only in the in-browser mock engine / mock data; correct against configuration in tests, but no backend exists |
| Not Implemented | Absent |
| Business Confirmation Required | Configuration exists; calculation or activation blocked pending a SOW decision |

No calculation is Fully Implemented: the authoritative scheme engine and ledger do not exist.

## 3. Requirement traceability matrix

Test numbers refer to `tests/schemes.test.ts`; G-numbers to `tests/schemes.gaps.ts`.

| SOW ref | Requirement | Screen / component | Service / data model | Tests | Status | Gap |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | Rule-based configuration without development | Builder (8 steps) | `SchemeConfig`, `validateConfig`, `saveSchemeDraft` | 1–11, 88–91 | Partially Implemented | Several configured conditions are not applied when crediting (G4, G5); no backend engine |
| 6.1 | Multiple concurrent schemes, inclusive by default | Detail · Concurrency | `overlappingSchemes`, `postCandidates` | 41 | Mock Service Only | — |
| 6.1 / 6.2.16 | Configurable exclusivity | Concurrency tab; WF-002 | `ExclusivityRule`, `exclusivityConflicts` | 42, 43 | Partially Implemented | Rule's product / branch scope stored but not applied; participation not bounded by rule period (G13, SCH-Q10) |
| 6.1 | Budget / exposure tracking | Budget & exposure tab; overview | `exposureOf` | 44, 45, 97 | Mock Service Only | Figures come from the mock ledger |
| 6.1 | Auto-stop at budget cap | — | `postCandidates` | 46, 96 | Mock Service Only | Not concurrency-safe; partial credit SCH-Q2 |
| 6.1 / 10.6 | Behavioural targeting (not scanned / not opened app / decline) | Targeting editor | `TARGET_DIMENSIONS` | 33, 34 | Business Confirmation Required | Source not connected; X / Y required, never defaulted |
| 6.2.1 | Basic configuration, draft save / resume | Builder · Basics | `BasicConfig`, `SchemeVersion` | 1, 7 | Fully Implemented | — |
| 6.2.1 | Scheme Level 0 / 1 | Builder · Basics | `levelUsedInCalculation` blocker | none | Business Confirmation Required | Level blocker has no automated test |
| 6.2.2 | Base Points by category / sub-category / SKU / branch | Builder · Base Points matrix | `BasePointsConfig`, `basePointsFor` | 3, 4, 11, 95, 114 | Mock Service Only | G7, G8 fixed |
| 6.2.3 | Rider Points | Builder · Advanced | `RiderConfig`, `businessBlockers` | 12, 81 | Business Confirmation Required | — |
| 6.2.4 | Cross-selling | Builder · Advanced | `crossSellQualifies` | 13, 106 | Mock Service Only | `combineWithBase` and `contributesToMilestone` flags are stored but unused |
| 6.2.5 | Quantity-based | Builder · Advanced | `quantityQualifies`, `quantityWindows` | 14, 113 | Mock Service Only | G6 fixed; no seeded quantity-only reward to recompute |
| 6.2.6 | Category-specific selection | Builder · Applicability | `skusInScope`, `skuActive` | 15, 114 | Mock Service Only | G7 fixed |
| 6.2.7 | Combined rules | Builder · Combined rules | `combinedQualifies` | 16, 116 | Mock Service Only | G11 fixed; execution precedence SCH-Q4 |
| 6.2.8 | Milestones (multi-level) | Builder · Advanced | `milestonesAchieved`, `milestoneMeasure` | 17, 93, 107 | Mock Service Only | Per-level payout is an interpretation (SCH-Q12); Rider contribution blocked |
| 6.2.9 | Slab selection and priority | Builder · Advanced | `selectSlab` | 18, 92, 94, 117 | Mock Service Only | G12 fixed |
| 6.2.9 | Downgrade / reversal | Ledger · reversals | `reversal_pending` records, `windowTxns` | 19, 58, 115 | Business Confirmation Required | G9 fixed; correction amount SCH-Q7 |
| 6.2.10 | Growth-based | Builder · Advanced | `GrowthConfig` | 20 | Business Confirmation Required | — |
| 6.2.11 | Duration and periodic / cumulative evaluation | Builder · Basics | `evaluationWindows` | 21, 22, 94 | Fully Implemented | — |
| 6.2.12 | Eligibility: branch, geography, selected members, restrictions | Builder · Eligibility | `memberEligible`, `restrictedOn`, `eligiblePopulation` | 5, 27, 90, 108 | Mock Service Only | G3 fixed |
| 6.2.12 | Eligibility: group, segment, Elite | Builder · Eligibility | `memberEligible` refuses | 109 | Business Confirmation Required | G4 fixed: no credit until the SFDC source exists |
| 6.2.13 | Branch → category → sub-category → SKU, overlap / duplicate detection | Builder · Applicability, matrix | `baseOverlaps`, `rowSkus`, `branchActive` | 3, 4, 15, 90, 114 | Mock Service Only | G7, G8 fixed; level precedence SCH-Q1 handled as error |
| 6.2.14 | Targeting: profile, role, state, district, branch, pincode, members | Targeting editor | `memberEligible` | 23–28 | Mock Service Only | Population counted on the development member master |
| 6.2.14 | Targeting: category / sub-category / SKU, date | Targeting editor | `txnTargeting` | 29, 31 | Mock Service Only | G5 fixed |
| 6.2.14 | Targeting: event | Targeting editor | not evaluable | 31 | Business Confirmation Required | Event-selection rule not confirmed |
| 6.2.14 | Targeting: billed-to party, RFM, retailer type, group, segment, Elite | Targeting editor | `TARGET_DIMENSIONS.available=false` | 30, 32 | Business Confirmation Required | Source not connected |
| 6.2.15 | Backdated calculation | Detail · Extensions & backdated | `requestBackdated`, `runBackdated`, idempotency key | 35–38 | Mock Service Only | — |
| 6.2.15 | Special-member extension | Detail · Extensions | `SpecialExtension`, WF-002 | 39, 40, 103 | Partially Implemented | **Member extension earns nothing** when rows are branch-specific (G14); test 39 only checks eligibility |
| 6.2.17 | Review and validation | Builder · Review; Validation tab | `validateConfig`, `businessBlockers` | 2, 4, 12, 33–35 | Fully Implemented | — |
| 6.2.17 | Projected liability | Validation tab | `projectedLiability` interface | 82 | Business Confirmation Required | — |
| 6.2.17 | Estimated participation / expected accrual | Validation tab | shows "Not available" | none | Business Confirmation Required | — |
| 6.2.18 | Lifecycle, Maker-Checker, approval ≠ activation | Detail actions; Approval Centre | store + Phase 3 engine, `activationChecks` | 1, 7–10, 47, 53, 79–81, 83, 88, 99 | Fully Implemented | Activation adapter itself is a mock |
| 6.2.19 | Performance scorecard and export | Detail · Performance | page-level aggregation | none | Partially Implemented | No automated test; baseline comparison only for growth (blocked); exports untested |
| 6.2.20 | Audit trail | Detail · Audit; Governance · Audit | `SchemeAuditEvent` | 84, 87 | Fully Implemented | — |
| 6.2.21 | Configuration guide | Governance · Guide | `GUIDE_SECTIONS` | none | UI Only | Ownership OP-SB-GUIDE |
| 6.3 | Tier configuration and approval | Tiers | `Tier`, WF-016 | 59 | Partially Implemented | No tier calculation (no tier service) |
| 6.3 / 10.6 | Tier benefits, branch-based benefits | Tiers · Benefits | `TierBenefit.branchCodes` | 61 | Partially Implemented | Benefits cannot be set per branch in the UI (always "All") |
| 6.3 / OP-07 | Branch-wise thresholds vs valuation | Tiers · Branch mapping | `TierBranchConfig` | 60 | Business Confirmation Required | Valuation never applied |
| 6.3 | Tier monitoring | Tiers · Overview | `tierSnapshots` | none | Mock Service Only | Seeded snapshot |
| 6.4 | Referral rules and relationships | Referrals · Rules | `ReferralRule`, WF-017 | 62–65 | Business Confirmation Required | OP-REF1 |
| 6.4 | Referral journey and anti-fraud checks | Referrals · Tracking | `ReferralRecord` | none | Mock Service Only | Seeded journeys only |
| 6.4 | Referral settlement buckets | Referrals · Settlement summary | — | none | UI Only | — |
| 6.5 | Campaign types and configuration | Campaigns | `Campaign`, WF-018 | 66 | Partially Implemented | Campaign rewards not calculated |
| 6.5 | Lucky Draw excluded in Tamil Nadu | Campaign drawer | `validateCampaign` | 67 | Fully Implemented | — |
| 6.5 | Display Contest | Campaigns · Display contest | `ContestEntry` | 68, 69 | Mock Service Only | Seeded entries; banner recorded only |
| 6.5 | FOC / Buy-X-Get-Y, bulk gift CSV, backend redemption | Campaigns · FOC | `GiftBatch`, `BackendRedemption` | 70 | Partially Implemented | No issuance or redemption service |
| 6.6 | Badges | Gamification | `GameConfig` | 71 | UI Only | Configuration and approval only |
| 6.6 | Streak, scratch card, spin wheel, leaderboard | Gamification | `validateGame` blockers | 72–75 | Business Confirmation Required | — |
| 6.6 | Bonuses (Welcome, Assured, Mega Scratch) | Gamification · Bonuses | `validateBonus` | 76–78 | Business Confirmation Required | — |
| 6.6 | Achievement feed / member-app contract | Gamification · Overview | contract text | none | UI Only | — |
| 6.7 | Open points register | Governance · Decisions | `SchemeDecision`, `Formula` | 81, 82 | Fully Implemented | — |
| 5.2 | Base vs scheme points buckets | Ledger, Settlement | `RewardAccrual.bucket` | 48, 49, 95 | Mock Service Only | — |
| 5.2 | Partial settlement | Detail · Settlement | `settlementPreview` (cumulative cap) | 50–52, 98, 100, 110, 112 | Mock Service Only | G1, G2 fixed |
| 5.2 | Two-level settlement approval | Approval Centre WF-015 | `createSettlementRequest` | 55, 86 | Fully Implemented | — |
| 5.2 | Release execution and ledger record | Settlement · History | `executeSettlement` (re-validates), `SettlementRelease` | 56, 57, 101, 111 | Mock Service Only | G10 fixed |
| 5.2 | Reconciliation | Settlement · Reconciliation | trace view | 105 | Mock Service Only | — |
| 10.6 | Scheme setup and targeted users | Builder | as above | as above | Mock Service Only | G4, G5, G7, G8 fixed |
| 10.6 | Bonus setup | Gamification · Bonuses | as above | 76–78 | Business Confirmation Required | — |
| 10.6 | Tier setup and branch-based tier benefits | Tiers | as above | 59–61 | Partially Implemented | Branch benefits not editable |
| 10.6 | Scheme settlement rules | Builder · Budget & settlement | `SettlementConfig` | 51, 110 | Mock Service Only | G1 fixed |
| 10.6 | Referral configuration | Referrals | as above | 62–65 | Business Confirmation Required | — |

## 4. Financial-integrity review

"Expected / actual" uses test-fixture values or recomputation from configuration. No business value
is assumed.

| # | Area | Formula implemented | Inputs | Version carried | Tests | Expected vs actual |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Base vs scheme points | `bucket = redeemable` for component `base`, else `unsettled` | component | accrual `schemeVersion`, `ruleVersion` | 48, 49, 95 | All Base credits redeemable, all scheme accruals unsettled · **matches** |
| 2 | Rider Points | None (FRM-RIDER pending) | — | — | 12, 81 | Submission / activation refused · **blocked as required** |
| 3 | Cross-selling | qualified ⇔ count(categories with net qty ≥ minimum) ≥ required count; reward = configured fixed points | net qty per category in window, minima, required count, reward | window `calcRef` + scheme version | 13, 106 | 9 seeded rewards of 250 recomputed · **matches**. Flags `combineWithBase` / `contributesToMilestone` unused |
| 4 | Quantity-based | qualifies ⇔ measure ≥ threshold; reward = fixed, or value × achieved | quantity or scan count, threshold, reward | window + version | 14 | Threshold boundary correct · `quantity.period` ignored (G6); no end-to-end output test |
| 5 | Combined rules | all-of / any-of over component results at window close | component booleans | — | 16 | Correct at window close · milestones bypass it mid-window (G11) |
| 6 | Milestones | measure = Base Points in window (+ cross-sell if configured); every level with threshold ≤ measure accrues its fixed reward once per window | base accruals, levels | window + level id | 17, 93, 107 | 11 rewards match configured values; re-run adds none · **matches**; payout model SCH-Q12 |
| 7 | Slabs | slabs containing x (min ≤ x ≤ max); lowest priority number wins; reward fixed or value × achieved | net quantity in window, slabs | window + slab id | 18, 92, 94 | 21 monthly rewards recomputed from net quantity · **matches**. Downgrade: reversal pending only (19, 58); wrong window (G9); mixed bases (G12) |
| 8 | Growth-based | None (FRM-GROWTH pending) | — | — | 20 | **Blocked as required** |
| 9 | Applicability | SKU ∈ product scope; branch ∈ branch scope; exactly one Base row per SKU × branch × programme | product scope, branch scope, rows | version | 3, 4, 15, 90, 91, 102 | Branch / SKU / DD values correct (DD 3 × 10 = 30) · inactive SKU / branch credited (G7, G8) |
| 10 | Targeting and eligibility | programme ∈ scheme; branch in scope or extension; selected members; available targeting dims | member master attributes | version | 23–28, 88–91 | Correct for programme / geography / member · restricted members earn (G3); Elite / group / segment (G4) and product / date / event (G5) ignored |
| 11 | Concurrency / exclusivity | inclusive unless an active rule and member participates in the partner scheme | active rules, partner accruals | — | 41, 42, 43 | Inclusive and exclusion correct · participation not date-bounded (G13) |
| 12 | Backdated and duplicates | key `source\|member\|scheme\|v\|component\|calcRef` plus a same-source cross-version check | historical transactions, active version | active version | 36–38, 93 | 32 historical credits at 15 / unit; re-run credits 0 · **matches** |
| 13 | Special-member extension | extension widens eligibility; Base row must still match SKU × branch | extension members / branches | base version | 39, 40, 103 | Eligibility correct · **member extension yields 0 credits** (G14) |
| 14 | Budget and auto-stop | consumed = Σ posted points; refuse if consumed + p > cap; stop when consumed ≥ cap | budget, posted accruals | candidate version's budget | 44–46, 96, 97 | 6 + 6 = 12 at a 12 cap, third refused; SCH-0012 400 / 400 · **matches** (mock, not concurrency-safe) |
| 15 | Projected vs actual liability | Projected: none (FRM-LIAB pending). Actual: consumed points | posted accruals | — | 82 | No projected figure, sign-off refused · **as required**; rupee valuation not modelled |
| 16 | Versioning | version chosen by effective range at transaction date | version effective start / end | scheme + rule version | 83, 87, 95 | 22 accruals on v1 (R1.0) / 17 on v2 (R2.0) at the time of the test; every Base credit recomputes from its own version · **matches** |
| 17 | Ledger traceability | every posted reward stores ledger ref, version, rule version, idempotency key, source | — | — | 57, 105 | 547 posted rewards complete · **matches** |
| 18 | Partial settlement | per accrual: release = ⌊(points − released) × share / 100⌋, share = tranche % (final = 100); fractions held | open accruals in range, tranche | settlement request stores version | 50–52, 98, 100 | First release correct · **a second during-scheme request over the same range reaches 84% against 60% (G1)**; month end accepts the 29th (G2) |
| 19 | Two-level approval | WF-015: V-Guard Client Admin then Finance; Maker excluded; distinct approvers | — | approval request version | 55, 86 | Stage 1 releases nothing; stage 2 executes; Joseph / Rahul refused · **matches** |
| 20 | Release and reconciliation | release posted once per request; idempotent retry | request, accruals | `EXE-{req}-V{n}` | 56, 57, 101, 105 | Retry posts once; releases match approved amounts · **execution does not re-run checks (G10)** |

Unresolved formulas: FRM-LIAB, FRM-RIDER, FRM-GROWTH, FRM-XSELL (formula variant), FRM-REVERSAL,
FRM-BONUS and FRM-REF. All are Business Confirmation Required. Each blocks submission or activation
and produces no figure; tests 12, 20, 58, 62–65, 76–78, 81 and 82 cover this. No production
financial calculation exists anywhere.

### Confirmed gaps (reproduce with `npm run test:schemes:gaps`)

| Id | Area | Defect | Evidence |
| --- | --- | --- | --- |
| G1 (fixed) | Partial settlement | A during-scheme tranche can be requested again; held share is released early | SCH-0002: second T1 request releases 144 more points; cumulative 84% vs configured 60% |
| G2 (fixed) | Partial settlement | Month-end check is "day ≥ 28" | Range ending 29 Oct passes |
| G3 (fixed) | Eligibility | Program Block / Temporary Hold not checked | MBR-CS-0002 (Program Block) credited 40 points |
| G4 (fixed) | Eligibility | Elite / group / segment not enforced | Elite-only scheme credits a member with no Elite attribute |
| G5 (fixed) | Targeting | Product, date-range, event conditions ignored | Wire scan credited although targeting says stabilizers, January only |
| G6 (fixed) | Quantity | `quantity.period` unused | Monthly quantity period with custom duration → 1 window |
| G7 (fixed) | Applicability | Inactive SKUs credited | DEV-FAN-014-A (inactive) credited 10 points |
| G8 (fixed) | Applicability | Inactive branches credited | MBR-EP-0110 at inactive OD-BR-CUTTACK credited 5 points |
| G9 (fixed) | Reversal | Sales return reduces the window of its own date | October sale returned 2 Nov reduces November from 10 to 8 |
| G10 (fixed) | Settlement | Checks not re-run at execution | SET-0004 executed with 2 reversals pending |
| G11 (fixed) | Combined rules | Milestones accrue mid-window without the combined relationship | 9 milestone rewards with an unreachable quantity condition |
| G12 (fixed) | Slabs | Mixed achievement bases accepted | 0 validation errors |
| G13 | Exclusivity | Participation not bounded by rule period | Interpretation; needs SCH-Q10 |
| G14 | Extension | Member extension earns nothing with branch-specific rows | EXT-0001: 0 credits from in-scope scans |

## 5. Test quality review

107 automated cases, all Node-run against the real store, engines and approval engine. **None tests
UI rendering**: the 113-route render sweep in Phase 6 was a browser script, not part of the suite.

| Category | Cases | What is asserted |
| --- | --- | --- |
| Calculation output (points value checked) | 3, 4, 11, 17, 37, 45, 46, 50, 51, 94, 95, 96, 102, 106, 107 (15) | Exact points against configured values or recomputation |
| Rule logic (qualification, selection, windows, eligibility) | 5, 13–16, 18, 21–28, 41, 42, 52, 89–93, 98 (23) | Boolean / selection outcomes |
| Ledger and settlement invariants | 38, 44, 48, 49, 57, 87, 97, 100, 101, 105 (10) | Integrity across all records |
| Validation only | 2, 6, 29, 31, 35 (5) | Error / warning messages |
| Governance and workflow | 1, 7–10, 36, 39, 40, 43, 47, 53, 55, 56, 67, 68–70, 79, 80, 83–86, 88, 99, 103 (26) | RBAC, approval, versioning, audit |
| Seed / configuration presence only | 59, 61, 66, 71, 104 (5) | Records exist and are configured |
| Blocked as expected | 12, 19, 20, 30, 32–34, 54, 58, 60, 62–65, 72–78, 81, 82 (23) | No figure produced; submission / activation refused |

Weak or mislabelled cases:

- 29 "Product targeting" tests product applicability, not targeting conditions (see G5).
- 31 checks validation only; the engine ignores date / event (G5).
- 39 asserts eligibility, not a credit (G14).
- 50 tests only the first release (G1).
- 52 passes because of the crude check (G2).
- 59, 61, 66, 71 and 104 confirm seed or configuration presence only.

Programme coverage: EP (most cases), Retailer (17, 40, 50, 51, 88), ST (53, 55, 106), CS (80),
DD (102, a cloned scheme). Seeded rewards exist for EP, ST, CS and Retailer; **no DD scheme earns in
the seed**.

Financial edge cases still missing:

- Behaviour once G1–G14 are fixed.
- A rejected or returned settlement freeing its locked accruals.
- A version switch on the same day as a transaction.
- A backdated run after budget exhaustion.
- Exclusivity combined with backdated runs.
- A budget increase on a budget-exhausted scheme.
- A Level 0 / 1 blocker test.
- A Performance-tab aggregation test.
- Export content and RBAC.

Rounding (SCH-Q3), partial credit at the cap (SCH-Q2) and every pending formula can't be tested
until confirmed.

## 6. Bundle analysis

The figures in this section are the baseline before code splitting. The section "Code splitting and
seed decoupling" at the top has the results after B1 and B2.

Production build with source maps (scratch folder; identical hashes to `npm run build`):

| File | Raw | gzip | Brotli | Loaded at start |
| --- | --- | --- | --- | --- |
| `index-*.js` (all app code) | 1,320 kB | 352 kB | 270 kB | Yes |
| `charts-*.js` (Recharts) | 415 kB | 111 kB | 91 kB | Yes (modulepreload) |
| `react-*.js` | 161 kB | 53 kB | 46 kB | Yes |
| `index-*.css` | 114 kB | 20 kB | 17 kB | Yes |
| `icons-*.js` (lucide) | 60 kB | 11 kB | 9 kB | Yes |
| **Total = initial load** | **2,071 kB** | **546 kB** | **434 kB** | Everything |

The "1.35 MB" figure is the app chunk alone; the full initial JavaScript is about 1.96 MB raw
(about 526 kB gzip).

Largest contents of the app chunk (minified bytes attributed through source maps):

| Group | kB | Group | kB |
| --- | --- | --- | --- |
| pages/schemes | 168 | pages/approvals | 107 |
| pages/masters | 151 | features/approvals | 63 |
| data/mock (all seeds) | 132 | config | 62 |
| pages/users | 122 | pages/dashboard | 62 |
| features/schemes | 114 | features/masters | 55 |
| pages/members | 108 | features/access | 43 |

Largest modules: `features/schemes/store.ts` 57 kB, `IncentivePages.tsx` 43 kB,
`SchemeDetailPage.tsx` 43 kB, `features/schemes/engine.ts` 38 kB, `BuilderPage.tsx` 35 kB.
Largest dependencies: recharts 263 kB plus its d3 / lodash / decimal stack (about 150 kB),
react-dom 127 kB, lucide-react 58 kB.

Loading behaviour:

- **No route is lazy.** `App.tsx` imports every page statically, and there is no `React.lazy` or
  `Suspense`.
- **The dashboard downloads all Scheme Builder, Tier, Referral, Campaign and Gamification code**,
  about 280 kB minified for schemes alone, plus Recharts.
- **Startup work:** the header's notification bell imports the approval store. The approval seed
  (`approvals/scenarios.ts`) now builds the master and scheme seeds, which replay 688 transactions.
  Measured in Node: approval store initialisation 276 ms, scheme store 89 ms. This runs on the first
  load of every browser session, on any page, and is likely slower on low-end phones.
- Splitting routes alone would **not** move the scheme engine and seed out of the start-up path
  while `scenarios.ts` imports them.

## 7. Recommendations

### A. Functional / financial-integrity gaps to fix before acceptance

| Priority | Gap | Fix scope |
| --- | --- | --- |
| Critical | G1 over-release of held settlement share | Cap a during-scheme tranche at its cumulative share of each accrual's points (`engine.settlementPreview`) |
| Critical | G10 settlement executes without re-checking | Re-run checks at execution; fail if any check fails or the amount differs from the approved amount |
| Critical | G3 restricted members earn | Check Phase 5 restrictions and registration status in `memberEligible` |
| High | G14 member extension earns nothing | Decide which Base row applies to an extended member outside the rows' branches (needs a business answer: scheme rows, or explicit rows for the extension) |
| High | G5 product / date / event targeting ignored | Apply these conditions in evaluation, or mark them "not evaluable" like unconnected sources |
| High | G4 Elite / group / segment ignored | Treat as "cannot evaluate" (no credit) until the SFDC source exists |
| Medium | G7, G8 inactive SKUs / branches credited | Exclude inactive master records in evaluation, as validation already states |
| Medium | G11 milestones bypass combined rules | Apply the combined relationship to milestone accrual, or defer milestones to window close when combined |
| Medium | G9 return attributed to the wrong window | Attribute returns to the original sale's window; correction amount stays pending (SCH-Q7) |
| Medium | G6 quantity period unused | Honour it or remove the field |
| Medium | Branch-based tier benefits (10.6) | Allow benefit branch selection in the tier editor |
| Low | G2 month-end check | Compare with the real last day of the month |
| Low | G12 mixed slab bases | Validation error |
| Confirm | G13 exclusivity period | Business answer under SCH-Q10 |
| Housekeeping | Tests 29, 31, 39, 50, 52 | Strengthen to assert credits / cumulative release once the fixes land; add a Performance-tab test and the edge cases in section 5 |
| Housekeeping | Phase 6 report | Correct the extension and targeting claims |

All fixes are contained in `features/schemes/engine.ts`, `mockEngine.ts` and `store.ts` plus one
editor; none needs a refactor.

### B. Performance optimisation opportunities

1. **Decouple the approval seed from the scheme and master seeds**: precompute, or seed those
   requests when their module first loads. This is a prerequisite for B2 to help schemes.
2. **Route-level lazy loading** per module (`React.lazy` + `Suspense`): schemes, masters, users,
   members, approvals. Estimated dashboard JavaScript after B1 + B2: about 0.9 MB raw / 270 kB gzip
   (react, icons, charts, shell, access and dashboard), down from about 1.96 MB / 526 kB. This is an
   estimate from the attribution above, not a measurement.
3. **Load Recharts only on pages with charts**: remove its modulepreload from pages that don't use
   it.
4. **Lazy store initialisation**: build each mock seed when its module is first opened. This saves
   about 0.3 s of start-up work per session.
5. CSS splits per route automatically once B2 lands (114 kB single file today).

### Recommendation

**Route-level code splitting should not be the next task.** Fix the critical and high items in list
A first (G1, G10, G3, G14, G5, G4). They affect money movement and eligibility, are small and local,
and two need a short business answer (G14, plus G13 for confirmation). Then do code splitting
together with B1, because splitting without decoupling the seeds would leave the scheme engine and
its seed replay on the dashboard's start-up path.
