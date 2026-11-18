# Phase 10 — Fraud Detection, Risk Management, Device Security, Data Integrity, Reconciliation and Compliance Monitoring

Completion report and developer handover (Build Prompt 10, SOW Module 9, 3.2 and 10.x AF02 / AF09 /
AF10 / AF12 / AF21).

> **Development build.** The detection services — identity registry, device risk, rule-based anomaly,
> predictive AF02, geo-velocity, geo-validation, QR integrity and SFDC sync — are **mock adapters**.
> No flag in the portal is a detected production fraud. No handset, scan, redemption or SFDC record is
> actually blocked or corrected, and predictive results are simulated (no model is trained).

## 1. What is real and what is mock

| Item | Status in this build |
| --- | --- |
| Review queue, cases, investigation workflow, notes, evidence, decisions | Implemented (frontend + in-browser store) |
| Rule configuration, approval, activation gate, global restriction policy | Implemented; thresholds unconfirmed (OP-02), so nothing activates by default |
| Risk events, identity matches, device data, geo / QR / SFDC outputs | Mock detection outputs (development data, labelled Simulated) |
| Predictive anomaly (AF02) | Service contract plus simulated results; no model |
| Device block / release | Approval workflow implemented; handset enforcement not connected |
| Duplicate-QR rejection, geo-fence, store gate | Adapter contracts reproducing the SOW rules; scan engine not connected |
| SFDC reconciliation | Workflow and ownership tracking; no SFDC connection, neither side overwritten |
| Admin warnings | Real Communication Centre dispatches through mock email providers (nothing is sent) |
| Compliance | Evidence index and status views; no certification claimed |

## 2. Summary

Route `/governance/fraud` (sidebar: Governance → Fraud & risk rules; Device & security opens the
device tab). Sixteen tabs:

1. Overview
2. Review queue
3. Risk cases
4. Risk rules
5. Anomaly detection
6. Devices
7. Duplicate identity
8. QR integrity
9. Geo-velocity & branch
10. Redemption risk
11. Scan rate controls
12. Data integrity
13. SFDC reconciliation
14. Investigation history
15. Configuration & decisions
16. Compliance & audit

Every tab and action checks permissions.

Tests: 88/88 Phase 10 scenarios pass (deterministic 57, blocked-as-expected 9, governance 22).

Earlier suites unchanged:

| Suite | Result |
| --- | --- |
| Schemes | 119/119 |
| Wallet | 92/92 |
| Comms | 37/37 |
| Gifts | 85/85 |
| Gap probes | 12/14 gaps fixed (2 confirmed gaps remain, as before) |

Typecheck and production build are clean. All 34 checked routes rendered in `vite preview` without
runtime or console errors, viewed as Sneha (fraud desk). Screenshots were not captured.

## 3. Governance principles as implemented

- **Detection, case, recommendation, restriction and decision are separate records.** A
  recommendation never restricts anything.
- **Program Block and Temporary Hold** are applied only through Member Management `applyRestriction`
  (Member management: Disable / Temporary hold).
  - Investigators (Sneha, Rahul) can recommend but cannot apply; Anita (Client Admin) can.
  - Scan-only and redemption-only restrictions are not a status in the existing block model. They are
    recorded as *not supported* (OP-BLK1) rather than inventing a new block system.
- **Reinstatement** goes through `submitReinstatementRequest` (member_reinstate, central Approval
  Engine).
- **Nothing is deleted.** Cleared events and closed cases stay, a case cannot close without a
  decision, and notes are append-only.
- **No opaque automatic bans.**
  - Predictive flags never restrict or open cases by themselves.
  - Shared-device logins are never blocked.
  - Duplicates are never merged.
- **Risk scores, severities, priorities, distances and forecasts** appear only when the source
  supplied them ("Not supplied" / "Not available" otherwise).
- **Every mutation writes an audit event** through the store's single, non-exported write path.

## 4. Fraud vector coverage (SOW 9.1)

| SOW vector | Where | Behaviour |
| --- | --- | --- |
| Duplicate accounts | Duplicate identity | Mobile: real time (`mobileDedupCheck`). Aadhaar / PAN / bank: midnight batch (`runNightlyDedup`, refused at other times). Device ID: captured. Masked; no merge or delete |
| Bot / automated scanning | Rules, Scan rate controls | Per-member limits by category and hour / day / week / month (OP-02) |
| Redemption abuse | Redemption risk | Backend block adapter. Admin warning through the Communication Centre. Review queue entry. Release needs approval (WF-034) and is refused while a member restriction remains |
| Geo-velocity | Geo-velocity & branch | Service-supplied distance and time. SOW example (over 500 km in under 2 h) highlighted; no other threshold |
| Scan geo-fencing | Geo tab | Retailer / CS within 100 m of the SFDC location. GPS denial and low accuracy are the service's verdict. Audited override |
| Store geo-validation pending | Geo tab | Retailer / DD / CS: 5 scans, no redemption, message from the sixth scan. Lifts on SFDC validation. No admin reset |
| Cross-programme KYC | Duplicate identity | Linked identities and registry matches only; similar names never trigger a hold |
| Branch leakage | Geo tab | Routed to Data Integrity reconciliation; member branch never changed |
| Duplicate / tampered QR (9.4) | QR integrity | Same-member versus masked other-member messages. Tampered QR escalates to an investigation |

## 5. Review queue and cases

- **One queue** for rule-based, predictive and system-validation signals (`ingestSignal`). A repeated
  source key increments the delivery count instead of creating a new flag.
- **Filters:** vector, source, severity, status, programme, state, restriction status, investigator
  and dates. Exports are scoped to the exporting user.
- **Manual triage** applies where no backend priority is supplied.
- **Cases:**
  - Open from one or several events; group more events and link member, device, QR, scan,
    redemption and ledger references.
  - Assign (needs Fraud & risk rules: Manage; the assignee needs Edit), set priority, and move along
    the state machine (`TRANSITIONS`).
  - Decisions: clear flag or confirm misuse. Recommendations: Program Block, Temporary Hold, device
    block, scan / redemption restriction (recorded only), or continue monitoring.
- **Detail screen:**
  - Summary, events, member context (links to Member 360) and financial impact read from the wallet.
  - Evidence, with sensitive items gated by View sensitive (DG-0006 to Sneha).
  - Notes, decision, restriction impact preview and reinstatement.

## 6. Device governance (SOW 3.2 / 9.2)

- **Directory:** device and IMEI records, masked, with first and last seen, linked accounts,
  programmes, rejected creations, status and investigation state.
- **Views:** a device farming review and a list of members who use several devices.
- **One profile per device:** `profileCreationAttempt` rejects a second profile and logs it.
  `deviceLogin` allows any existing profile on a shared device, and refuses only on a blocked device.
- **Farming signals** come from `deviceRiskSignal`, with the service's own rule. No account or device
  count is assumed (OP-DEV1).
- **Login locations** need Device & security: View sensitive, and are shown as a coordinate plot and
  a table.
- **Block and release:**
  - Every linked account must be impact-reviewed, and a reason is required.
  - Approval goes through WF-036, and the Maker cannot approve.
  - The history keeps the previous and new status.
  - A block is separate from member restrictions; a review can be cleared without blocking.

## 7. Anomaly rules, predictive and global restrictions (9.2, 9.3, AF02, AF21)

- **Rules:** Redemption, Scan-In and Scan-Out, with daily, weekly and monthly limits plus
  category-level hourly controls.
  - Scoped by programme, member type, category, SKU and states, with effective dates and auto-flag.
  - Validation keeps hour ≤ day ≤ week ≤ month.
- **OP-02 gate:**
  - Values are Demo configuration.
  - Approval (WF-034) produces *Approved · inactive*; activation is a separate step.
  - Activation is refused while OP-02 is open or the values are demo.
  - Business values can only be entered once OP-02 is confirmed.
  - The mock rule service flags only through an active, auto-flagging rule; otherwise it reports
    "Simulation only".
- **Predictive:** expected, observed, deviation, window and model reference, as supplied. Results
  are labelled simulated and reach the same queue.
- **Global block rules (block all scan, redemption block):**
  - No toggle. A change needs Fraud & risk rules: Execute and a Maker profile, plus an impact preview
    and a reason.
  - Approval goes through WF-035, with the approver and executor recorded.
  - Trigger conditions are not invented.

## 8. Data integrity and SFDC reconciliation (9.5, OP-64 / OP-20)

- **Mandatory-field validation:**
  - Member name (the SOW 9.5 example) and a valid branch reference (existing hierarchy data).
  - Failing records are never counted as synced. Each failure raises an exception and a
    mandatory-field alert.
- **Exception queue:** assign, remark, record the source correction, reprocess, resolve. Resolving
  needs a source correction and a successful reprocess; records are never repaired with guessed
  values.
- **SFDC reconciliation:**
  - Mismatches from the Phase 4 sync conflicts plus district, branch and missing-branch examples.
  - Side-by-side comparison of State, District, Branch, Pincode and source reference.
  - Impacted members and branch-scoped schemes.
  - Proposed correction, owning system and responsible team, then owner confirmation, platform
    refresh and close.
  - A mismatch cannot close before confirmation and refresh. Neither source is overwritten.

## 9. Compliance and audit (9.6, 9.7)

- **Data protection:**
  - Consent status, time and source; masked Aadhaar.
  - Account closure and KYC retention end (closure + 7 years, the SOW rule; the policy service is not
    connected).
  - Verified-field locks; tokenisation shown as "Not supplied".
  - No raw PII, no export, no delete.
- **Income Tax / 26Q and RBI / payouts:** links to the Phase 7 TDS, payout, reconciliation and limits
  pages, with their open exceptions.
- **Evidence register:** eleven controls.
- **Platform audit:** a read-only aggregation of what each module already records. Covers access
  logs, data-change, configuration and financial records.
  - Access logs come from the new `accessLog`: sign-in, identity switch and sign-out. Location reads
    "Not captured" because the mock authentication adapter has no IP.
  - Sources are user & role management, Member Management, masters, wallet, communication, gifts,
    fraud & risk, and approval history.
  - Filters: type, module, user, member, reference and date. Records open in an old / new comparison.

## 10. Alerts (Communication Centre)

`sendStaffAlert`, new in the comms store, dispatches an internal email to portal users through the
mock providers. Alert IDs are stable, so a repeated backend event never re-sends.

Alerts are raised for:

- Redemption blocks (mandatory; each block records its warning reference)
- High-priority cases and escalations
- Device farming, device blocked and device released
- Scan-rate, geo-velocity, duplicate identity, tampered QR and branch leakage flags
- SFDC exceptions and mandatory-field failures
- Member reinstatement

## 11. RBAC and approvals

- **`fraud-rules`:** gains manage, view_sensitive and export, and moves to the Governance category.
- **`devices`:** gains submit, approve, reject, return, view_sensitive and export.
- **Sensitive modules:** both are now sensitive-data modules, so Super Admin has no View sensitive on
  them.
- **Role grants:**
  - Evolve Operations: fraud edit, manage, execute and export; device view, edit, disable and manage.
  - Client Admin, Regional Admin and Finance: view and export, with Regional Admins scoped to their
    states.
  - Maker and Checker profiles cover devices.
- **Module limits:** Sneha gains devices; Anita gains fraud-rules and devices.
- **New grant:** DG-0006 gives Sneha fraud-rules and devices View sensitive.

| Workflow | Request types | Approver |
| --- | --- | --- |
| WF-034 | `risk_threshold_change`, `risk_block_release` | V-Guard (Client Admin), remarks required |
| WF-035 | `global_restriction_change` | V-Guard HO, remarks required |
| WF-036 | `device_block`, `device_release` | V-Guard, remarks required |
| Existing | `member_reinstate` (reinstatement), WF-009 `scan_restriction_change` (unchanged, still simulated) | — |

- **Seeded request:** one pending threshold request is appended to the precomputed approval steps
  (159 steps).
- **Storage keys:** access v12 and approval v9 (existing tabs reseed); new `vg-rishta.risk-store.v1`
  and `vg-rishta.access-log.v1`.

## 12. Files

- Types and config: `src/types/risk.ts`, `src/config/riskCatalogue.ts`
- Feature: `src/features/risk/{engine,seed,requests,store}.ts`, `src/features/access/accessLog.ts`
- Pages: `src/pages/fraud/{shared,OverviewPage,QueuePages,RulePages,DevicePages,VectorPages,DataPages,GovernancePages,GeoPlot}.tsx`, `src/styles/risk.css`
- Tests: `tests/risk.test.ts` (`npm run test:risk`)
- Changed (additive):
  - RBAC catalogue and seed; approval catalogue and seed; execution map; module scenarios and
    generated steps; scenario replay.
  - Navigation (Fraud & risk moved to Governance and made live; Device & security made live) and
    routes.
  - Session context (access logging) and comms store (`sendStaffAlert`).

## 13. Open decisions (Configuration & decisions tab)

| Ref | Decision | Restriction in this build |
| --- | --- | --- |
| OP-02 | Rule + predictive vs custom ML; Scan-In / Scan-Out / redemption thresholds | Demo values only; approved rules stay inactive; predictive simulated |
| OP-QR1 | Tampered-QR workflow, PIN-sharing responsibility, daily duplicate-QR digest | Responsibility recorded, not adjudicated; digest inactive |
| OP-64 / OP-20 | SFDC / platform correction ownership, cadence, cleanup owner, SFDC name validation | Ownership per mismatch; close only after confirmation; no overwrite |
| OP-BLK1 | Reinstatement SOP; scan-only / redemption-only restrictions | Only Program Block / Temporary Hold applied |
| OP-DEV1 | Device farming definition and block authority | Service rule decides; impact review + approval |
| OP-GEO1 | GPS accuracy threshold, override authority, SFDC geo-validation integration | Backend verdict displayed; audited override |
| RK-SLA | Investigation SLA | Not configured: no case reported overdue |

## 14. Known limitations and backend dependencies

- **Backend services still to connect:** identity registry (de-duplication), device risk and device
  enforcement, rule-based anomaly service, predictive AF02 model, geo-velocity and geo-validation,
  QR integrity at scan time, redemption risk blocking, SFDC hierarchy and store geo-validation, and
  the policy service for retention and tokenisation.
- **Location data:** coordinates are development values, and the plot is a simple frame without map
  tiles.
- **Test-only OP-02 confirmation:** the test suite confirms OP-02 with a test-only answer to exercise
  activation. The seeded app keeps OP-02 open.
- **Screenshots:** handover screenshots were not captured.
