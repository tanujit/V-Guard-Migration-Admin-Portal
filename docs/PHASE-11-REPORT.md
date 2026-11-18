# Phase 11 — Integration Management, Data Exchange, System Health, Live Monitoring and Technical Operations

Completion report and developer handover (Build Prompt 11, SOW Module 11 and 10.11).

> **Development build.** Every connection is a **mock adapter** or a **placeholder**. The portal
> never calls SFDC, eSeal, Siebel, RazorPay, DigiLocker, Signzy, WhatsApp, SMS, Google Maps or a
> logistics partner from the browser, and stores no endpoint, credential or secret. Integration
> records are derived from the modules that own the business data; service, crash, queue and
> infrastructure telemetry is simulated and labelled **Simulated**.

## 1. What is real and what is mock

| Item | Status in this build |
| --- | --- |
| Integration directory, ownership metadata, monitoring rules, decision register | Implemented (frontend + in-browser store) |
| Configuration changes (for example the SFDC invitation target frequency) | Approval workflow WF-037 implemented; the backend configuration service is not connected |
| SFDC records, callbacks, sync batches | Derived from Member Management, Master Data syncs, member restrictions and wallet GST records |
| eSeal lookups and pack mappings | Derived from the last 70 scan transactions; eSeal values simulated around the platform SKU |
| RazorPay, DigiLocker / Signzy, WhatsApp / SMS, Maps, logistics | Derived from Phase 7 payouts, KYC documents, Communication Centre attempts, risk geo checks and gift order tracking |
| Siebel | Mock log lookups (ownership and contract not provided) |
| Retry and reprocessing | Mock backend reprocessing contract with idempotency keys; financial records are refused |
| API services, crashes, queues, infrastructure metrics | Simulated telemetry (labelled) |
| Alerts | Real Communication Centre staff dispatches through mock email providers (nothing is sent) |
| Redemption float | Opening balance and top-ups are development values; payouts are the Phase 7 records |
| SOW performance baselines | Shown as targets, **Not evaluated** (no production telemetry or load test) |

## 2. Summary

Route `/monitoring/integrations` (sidebar: Intelligence & monitoring → Integration monitoring;
System health opens the system-health tab, and `/monitoring/health` redirects there). Twenty-two
tabs:

1. Overview: KPIs, volume trend (hourly / daily / weekly / monthly), top failing connections
   (failures, rate, latency, pending), volume by message type and by scheme, connection status, sync
   health alerts
2. Directory: the ten SOW 11.1 integrations and the Channel Check placeholder; integration
   profile with ownership, configuration change request, monitoring rule, jobs, requests and
   payload metadata
3. Connection health: 24 hour or 7 day window, health, counts, failure rate, average, p95, last
   success / failure, primary error
4. SFDC: inbound records, outbound callbacks with retry, sync batches, rejection reason codes
5. eSeal: lookups with eSeal vs platform comparison and the transaction date used, parent-child packs
6. Other connections: RazorPay (with daily reconciliation), DigiLocker, Signzy, WhatsApp, SMS,
   Google Maps, logistics, Siebel
7. Message trace: by member, transaction, scheme or any request / batch / callback reference
8. Data sync: invitation runs, missed and delayed runs, hierarchy syncs, sync alerts
9. Jobs & queues: jobs, runs (retry once / acknowledge), queue aliases and backlog charts
10. Errors & failures: failed requests by category and integration; SOW 11.5 exceptions
11. Retry & reprocessing: candidates, idempotent retry, refusals, history
12. Reconciliation: counts on both sides of each connection
13. System health: API services, dependencies, error categories, SOW baselines (Not evaluated)
14. API performance: average and p95 against the 2 s target, failed requests, stack traces
15. Crashes & errors: crash and non-fatal groups, filters by device model, OS and version
16. Infrastructure: CPU, memory, disk, network in / out, DB pool, queue lag, auto-scaling,
    correlation around a moment and what changed
17. Authentication: login outcomes and reasons, filters by member type, branch, app version, device, OS
18. Member diagnostics: separate permission, reason required, every lookup audited
19. Adoption: never logged in, dormant for X days, branch drill-down, follow-up export
20. Float & kitty: redemption float, committed, burn rate, threshold; TDS Kitty, unsettled scheme
    points and available member points shown separately
21. Alerts & incidents: alert lifecycle; incidents with owner, notes, links, status and snapshot
22. Audit & decisions: integration audit, decision register, monitoring rules, configuration
    changes, portal access log

## 3. Governance principles as implemented

- **No live claims.** Health is classified only from recorded requests over the last 24 hours. No
  request in the window gives **Unknown**; a placeholder gives **Business confirmation required**;
  monitoring not configured gives **Not configured**. Nothing is ever Healthy without a recent
  successful request (`engine.healthOf`).
- **No invented contracts.** `authType`, `contractRef`, `retryPolicy`, `credentialRef` and ownership
  are empty unless recorded. Recording a contract reference keeps the contract unconfirmed.
  Ownership text that looks like a secret (`api_key`, `token`, `password`, `bearer`) is refused.
- **No frontend-only retry.** Retry creates a new request through the mock reprocessing contract and
  keeps the original. The idempotency key is `RETRY|integration|businessRef`; a second retry of the
  same record is refused and recorded as a duplicate.
- **Financial records.** RazorPay payouts and the daily reconciliation job are never retried from
  monitoring. The refusal is recorded and points to the Wallet & Redemption idempotent payout
  contract.
- **Restricted execution.** Retry and reprocess need `integrations:execute`. The Evolve Super Admin
  and the Client Admin do not hold it.
- **Sensitive data.** Payloads hold masked metadata only. Personal payload fields, stack traces,
  member diagnostics by mobile number and device IDs in the authentication audit each need their own
  View sensitive permission, and every view is audited. PAN, GSTIN, Aadhaar and UTR are masked or
  shown as "received"; MPIN values are never captured.
- **Separate balances.** The payout float, TDS Kitty, unsettled scheme points and available member
  points are separate figures and are never added together.
- **Queues.** Queue names are aliases. Dead-letter counts show **Not configured**, and the portal
  has no delete or purge operation.
- **Open decisions stay open.** Approving a configuration change, setting X or setting a float
  threshold records a development setting. It does not close the related decision.

## 4. SOW integrations (11.1)

| ID | Integration | Direction | Frequency (SOW) | Data source in this build |
| --- | --- | --- | --- | --- |
| INT-SFDC | Salesforce | Both | Scheduled sync + real-time callbacks | Member Management, Master Data syncs |
| INT-ESEAL | eSeal | Into platform | Real time | Scan transactions |
| INT-SIEBEL | Siebel | Into platform | Real time | Mock log lookups |
| INT-RZP | RazorPay | Both | Real time | Phase 7 payouts (+ card adapter test) |
| INT-DIGI | DigiLocker / UIDAI | Both | Real time | KYC Aadhaar documents |
| INT-SIGNZY | Signzy / NSDL | Both | Real time | KYC PAN and bank documents |
| INT-WA | WhatsApp Business | Out of platform | Real time | Communication Centre attempts |
| INT-SMS | SMS gateway | Out of platform | Real time | Communication Centre attempts |
| INT-MAPS | Google Maps | Into platform | Real time | Risk geo-fence checks, member addresses |
| INT-LOGI | Logistics | Both | Regular polling | Gift order tracking |
| INT-CHANNEL | Channel Check (placeholder) | Into platform | Not confirmed | None (OP-45) |

## 5. SFDC (11.2) and eSeal (11.3)

- **SFDC inbound records:** ST and CS invitations (two received in the current hour and not yet
  synced), retailer records (PAN / GST / geo-location fields received, masked) and DD records
  (active product categories received).
- **SFDC outbound:** registration result callbacks (success and rejection with SOW example reason
  codes), profile status updates from member restrictions, and GST certificate submissions.
- **SFDC failures:** one callback failed twice and stays failed after a retry, because OP-24 is open.
- **Invitation sync:** runs are approximately hourly. The current hour's run is missed and the
  06:00 run was late. The target frequency is configurable through WF-037, and OP-SYNC1 stays open.
- **eSeal transaction date:** the customer-billed date is used; when it is blank or the item is
  stock-out, the manufacturing date is used. With neither date, the scan cannot be date-validated
  and no date is invented.
- **eSeal differences:** SKU and points differences between eSeal and the platform are shown and
  neither side is overwritten.
- **Pack mappings:** parent-child mappings are visible, the mapping source is unconfirmed, and one
  child is missing (OP-32 / OP-44).

## 6. Health rule (development, OP-MON1 open)

Over the last 24 hours, the first matching rule applies:

1. Placeholder → Business confirmation required.
2. No telemetry → Not configured.
3. Disconnected flag → Disconnected.
4. No request → Unknown.
5. No successful request → Failed.
6. A missed or late scheduled run that has not been retried → Delayed.
7. Any failure → Degraded.
8. Otherwise → Healthy.

Statistics (failure rate, average, p95, last success / failure, primary error) cover 7 days.

## 7. RBAC and approvals

| Module | Actions | Notes |
| --- | --- | --- |
| `integrations` | view, edit, submit, approve, reject, return, execute, manage, view_sensitive, export | Sensitive module |
| `health` | view, create, edit, close, execute, manage, view_sensitive, export | Sensitive module |
| `member-diagnostics` | view, view_sensitive | New, sensitive; excluded from the Super Admin |
| `auth-audit` | view, view_sensitive, export | New, sensitive |
| `adoption` | view, manage, export | New |
| `float-monitoring` | view, manage, export | New; manage excluded from the Super Admin |

- **Evolve Super Admin:** no `integrations:execute`, no member diagnostics, no float threshold, and
  no View sensitive on these modules.
- **Evolve Operations:** technical monitoring, retry (execute), integration edit and manage,
  incidents, member diagnostics (view), authentication audit, and adoption including the threshold.
- **Finance:** float monitoring (view, manage, export) and integration view.
- **Client Admin:** view and export for integrations and health, authentication audit and adoption,
  and view of the float.
- **Regional Admin:** adoption in their state scope.
- **Maker / Checker:** Makers can submit integration changes and Checkers can approve them. Rahul
  (Maker) and Anita (Checker) have `integrations` added to their module limits.
- **Direct grant DG-0007 (Rahul):** View sensitive on `integrations`, `health`,
  `member-diagnostics` and `auth-audit`.
- **Workflow WF-037 "Integration configuration change":** request type `integration_config_change`,
  approved by a V-Guard Client Admin. The execution handler records the approved value.
- **Storage keys:** access store v13, approval store v10, new ops store `vg-rishta.ops-store.v1`.

## 8. Alerts (Communication Centre)

The seeded alerts are sent to staff by email (mock providers) and linked from the alert. The seeded
alert types are sync missed, callback failure, bot notification failed, queue backlog,
reconciliation difference, high latency, API 5xx, database error and crash spike.

Setting a float threshold above the current balance raises a float-low alert to Finance. Alert
states are created, assigned, acknowledged, investigating, escalated, resolved and closed. Remarks
are required to escalate or resolve.

## 9. Tests

`npm run test:ops` runs the 114 scenarios of Build Prompt 11 section 27 against the real stores in
Node: **114/114 pass** (86 deterministic, 8 blocked-as-expected for open decisions, 20 governance).

All earlier suites are unchanged:

| Suite | Result |
| --- | --- |
| Schemes | 119/119 |
| Scheme gap probes | 2 of 14 gaps still confirmed (unchanged) |
| Wallet | 92/92 |
| Comms | 37/37 |
| Gifts | 85/85 |
| Risk | 88/88 |

Typecheck and production build are clean. In the browser (production build), all 22 tabs and the
integration detail render without console errors. Tab visibility follows permissions: Float & kitty
shows for Finance, member diagnostics is denied to the Super Admin, and a diagnostic lookup as
Rahul returns a masked view.

## 10. Files

- **Types and config:** `src/types/ops.ts`, `src/config/opsCatalogue.ts`.
- **Logic:** `src/features/ops/engine.ts` (pure functions), `seed.ts` (derived development data) and
  `store.ts` (single audited write path).
- **Screens:** `src/pages/ops/` — `shared`, `OverviewPage`, `DirectoryPages`, `ConnectionPages`,
  `DataPages`, `HealthPages`, `MemberPages`, `GovernancePages`.
- **Styles:** `src/styles/ops.css`.
- **Tests:** `tests/ops.test.ts` (`test:ops`).
- **Changed files:**
  - `src/config/rbacCatalogue.ts`, `src/data/mock/rbacSeed.ts`
  - `src/config/approvalCatalogue.ts`, `src/data/mock/approvalSeed.ts`
  - `src/features/approvals/execution.ts`
  - `src/features/access/store.ts`, `src/features/approvals/store.ts` (storage keys)
  - `src/config/navigation.ts`, `src/App.tsx`, `src/main.tsx`, `package.json`

## 11. Open decisions (Audit & decisions → Decision register)

| Ref | Question | Restriction until confirmed |
| --- | --- | --- |
| OP-24 | SFDC callback contract, reason codes, ownership, retry | Callbacks monitored; codes are SOW examples only |
| OP-SYNC1 | Final invitation sync frequency | Current hourly behaviour shown; target is configurable only |
| OP-32 / OP-44 | Pack mapping source; Sales Office mapping | Mappings shown, source unconfirmed |
| OP-45 | Channel Check data, frequency, purpose | Placeholder; cannot be configured or activated |
| OP-18 / OP-19 / OP-20 | Mobile mismatch source of truth, mobile-already-registered fix, blank name | Exceptions shown, not resolved by rule |
| OP-64 | District / branch reconciliation ownership | Carried from Phase 10 |
| OP-MON1 | Monitoring thresholds and alert rules | Development health rule; rules recorded as BCR |
| OP-DORM | Dormancy X days | Threshold not set: active and dormant not distinguished |
| OP-FLOAT | Low-balance threshold | No alert until a development value is set |

## 12. Known limitations and backend dependencies

- **Backend services:** the integration adapters, the reprocessing service, the scheduler, the
  queue platform, APM / crash reporting and the infrastructure metrics source all need backend
  services. The contracts are the store functions named above.
- **Not built:** SAML / Single Sign-On events for portal staff are not shown, because no identity
  provider is configured.
- **Not forecast:** projected burn and time to threshold for the float need a confirmed forecasting
  rule.
- **Out of scope:** the Analytics & Reporting module (SOW Module 13) was not started in this phase.
