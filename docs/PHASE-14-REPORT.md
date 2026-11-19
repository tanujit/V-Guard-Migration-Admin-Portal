# Phase 14 — PROPOSED Module 12: Job Management & Field Tooling

Scope assessment and prototype for Build Prompt 14 (V-Guard One App SOW, Module 12, sections
12.1–12.11, pages 143–153).

> **Module 12 is Proposed. It is not approved, not live, and not part of the committed scope.**
> - Completing this phase means the proposal has been assessed, prototyped, documented and made
>   ready for a business decision.
> - No Siebel job API is called, no real job is allocated, no points are credited and no customer
>   is messaged.
> - Only the Evolve Super Admin can open the module.
> - All 12 scope decisions are open.

## 1. Where it is and who can see it

- **Location:** sidebar → **Future scope → Job management & field tooling**
  (`/future/job-management`). It carries a "Proposed" tag and every page has a dashed "proposed"
  frame. No other menu group links to it.
- **Sections:** 22, in five groups:
  - **Overview:** scope overview, operations dashboard, scope decisions.
  - **Jobs:** directory, incoming, allocation, execution, evidence, Siebel verification, rewards.
  - **Technicians:** directory, verification, performance, E-ID card.
  - **Customers:** Happy Points, customer feedback.
  - **Field tooling:** Direct Order assessment, quotations, retailer tagging, visit surveys, work
    location, Sales Executive scope.
- **Permission:** a new RBAC module `proposed-scope` (view, edit, manage, export, view_sensitive).
  - The Evolve Super Admin gets view / edit / manage / export.
  - No business role, Maker or Checker profile receives it.
  - `view_sensitive` is held by nobody, so customer names, contacts and addresses are always masked.
- **Other access rules still apply:** a View-As session still blocks every change.

## 2. Existing versus new functionality

Before building, each reusable capability was inspected in this repository. The full table
(route, component, service, data model, API contract, tests, gap, enhancement) is on the Scope
overview page and exports to CSV.

| Capability | Found | Status | Rebuild |
| --- | --- | --- | --- |
| Siebel customer / warranty lookup | INT-SIEBEL mock adapter in Integration Monitoring | Existing | No — job integration proposed separately |
| Selfie capture | KYC selfie document (Phase 5) | Partially existing | No |
| Geo-location | Member working address lat / lng, geo-validated status | Partially existing | No |
| Completion photos | Campaign photo entries (photoRef, capture source, GPS) | Partially existing | No |
| Points per job type | Scheme Engine earns on `scan` and `sales_return` only | Partially existing | No — needs a job event (OP-56) |
| Technician territory | Branch hierarchy and access scope | Partially existing | No |
| Tiers / certification | Tier Master | Partially existing | No — the flag is separate |
| ST Direct Order & Direct Fulfilment | **Nothing in this repository; legacy build not supplied** | Awaiting confirmation | Not determinable |
| Customer feedback | Member surveys (N06) | Partially existing | No — end-customer audience is new |
| Sales Executive portal + View-As | Sales Rep role, Member 360, View-As | Partially existing | No |

## 3. What the prototype does

**Job lifecycle (SOW 12.2):**
- A mock Siebel adapter delivers demo jobs.
- **Received → pending allocation → assigned → accepted → in progress → completion submitted →
  awaiting Siebel confirmation → confirmed / rejected → reward eligible.**
- Uploading photographs never makes a job reward-eligible. Only a Siebel confirmation does.
- Duplicate Siebel references are identified and not created twice.
- Jobs with missing customer data are held with the issue listed; nothing is filled in.

**Siebel integration (OP-52 / OP-55):**
- A separate proposed record, *Siebel Job Management Integration — Proposed*.
- Draft inbound job and outbound completion contracts, all marked pending.
- Outcomes: pending, confirmed, rejected, integration error, timeout, awaiting manual resolution.
- A timeout raises an exception and leaves the job Awaiting Siebel confirmation with points uncredited.
- Nothing is approved or rejected automatically, and an administrator cannot mark a job confirmed.
- Duplicate submissions and duplicate callbacks are refused or ignored.
- Each job is traceable (inbound, submission, callback, exceptions). The existing Siebel lookup
  integration is unchanged and linked.

**Allocation (OP-53):**
- The workbench compares candidates on territory, verified flag, skill and workload.
- Skill is "Unknown": no skill mapping exists.
- No score, no weights, no automatic allocation.
- Manual demo assignment only, with no notification sent.
- Out-of-territory assignment is refused.
- Decline and no-response return the job to manual allocation; the real rule is pending.

**Evidence:**
- Job start needs a selfie reference and GPS.
- Completion needs at least one photo reference. The mandatory count and types are for V-Guard to define.
- The portal shows references only, never images or exact coordinates.

**Rewards (OP-56):**
- Reward configurations are drafts and cannot be activated.
- After a (mock) Siebel confirmation, processing is **simulated**: the existing Wallet service is
  checked for an active wallet and a `SIM-LED-…` reference is recorded with the wallet and Siebel
  confirmation references.
- Nothing is posted to the ledger, and production crediting is refused.
- Scheme Engine assessment:
  - Product, territory, campaign period and ledger crediting can be reused.
  - A **job-confirmed earning event and a job-type dimension are missing**.
  - Recommendation: extend the Scheme Engine rather than build a second engine.

**Verified / Exclusive flag (OP-58):**
- Grant and revoke need `manage`, a reason, an effective date and an optional expiry. History is kept.
- The flag is separate from tiers.
- The capability mappings (jobs, communications, customer opportunities) are all inactive.

**Happy Points (OP-57):**
- A microsite preview (rating, optional comment, job and technician references).
- Links can only be prepared for confirmed jobs and are **never sent**.
- Submissions are simulated and linked to job and technician.
- Happy Points stay "pending decision": no rating-to-points conversion exists.
- This is kept separate from N06.

**E-ID card (OP-59):**
- A card preview with name, technician ID, V-Guard branding and the demo flag. It shows no mobile,
  address or photo content.
- Delivery attempts are recorded with consent fields (status, time, source, purpose, record,
  withdrawal) and **blocked**.

**Direct Order (OP-63):** assessment only (see section 2). No second implementation exists.

**Quotations (OP-29):**
- Drafts hold an electrician, a customer reference and a description.
- Price, amount, tax and similar fields are refused.
- Drafts cannot be issued.
- A preview framework exists; the output format is pending.

**Retailer tagging (OP-27):**
- Demo tags by pincode or address, using Member Management locations.
- The radius stays blank and inactive; no default is invented.
- Proximity is calculated only where both locations have valid coordinates, and is otherwise "Not
  calculable". Exact coordinates are not shown.

**Retailer visit surveys (OP-28):** rule drafts are inactive, and triggering is refused until
OP-27 and OP-28 are confirmed.

**Work location (OP-26):**
- Changes are recorded for review with the previous location kept.
- The member record, branch mapping, retailer tags and geo-scheme eligibility are unchanged.
- An impact preview says what would need re-evaluation.

**Sales Executive (OP-36 / OP-37):**
- A mapped-member workspace inside the portal for a chosen Sales Rep, using the access engine's
  scope and the existing member, wallet and scheme services.
- Each row links to Member 360 and View-As.
- No separate app or PWA is built.

**Governance:**
- The 12-item decision register: status, evidence, owners and restrictions.
- 12 feature gates, all inactive. "Try to activate" is refused, and recording a decision does not
  activate anything.
- A prototype audit of every consequential action and refusal.

## 4. Open decisions

All open:
- OP-52 / OP-55
- OP-53
- OP-56
- OP-58
- OP-57
- OP-59
- OP-63
- OP-29
- OP-27
- OP-28
- OP-26
- OP-36 / OP-37

Each records the business question, affected function, technical dependency, known owners and the
restriction in force. See the Proposed scope decisions page.

## 5. Security and privacy assessment

The 34 conditions in section 22 of the build prompt are handled as follows:

- **Refused:**
  - Duplicate job, duplicate assignment, job start without a selfie or GPS, and missing completion
    evidence.
  - Duplicate completion submission, reward before confirmation, and reward activation.
  - Customer messaging, E-ID delivery and financial quotation fields.
  - Visit-survey triggering, feature activation, and access by anyone but the Super Admin.
- **Identified and held:**
  - Incomplete customer data and no eligible technician (the territory comparison).
  - Missing verified flag or skill mapping (shown as No or Unknown).
  - Workload: derived from demo jobs only.
- **Recorded, not acted on:**
  - Decline and no acceptance (back to manual).
  - Siebel timeout or rejection (exception, evidence kept).
  - Duplicate callback (ignored).
  - Work-location changes (no downstream change).
- **Masked:** customer name, contact and address. Evidence shows references only. The E-ID preview
  has no contact data.
- **Scope:** Sales Executive visibility follows the access engine; an out-of-branch member is not
  visible.

Every consequential action and refusal is audited in the prototype audit.

## 6. Data models and service contracts

- **Models:** `src/types/jobs.ts` — proposed entities only. Members, products, branches, wallets,
  schemes and surveys are referenced by ID and never copied:
  - ProposedJob with the Siebel payload, timeline and evidence.
  - Assignment, SiebelSubmission, SiebelCallback, IntegrationException.
  - JobRewardConfig, JobReward, VerificationFlag.
  - FeedbackLink, FeedbackSubmission, EidDelivery.
  - QuotationDraft, RetailerTag, RadiusConfig, VisitSurveyRule, WorkLocationChange.
  - ProposedDecision, ProposedAudit.
- **Service:** `src/features/jobs/store.ts` (storage key `vg-rishta.jobs-store.v1`).
- **Catalogue:** `src/config/jobsCatalogue.ts` — draft contracts, gates, the assessment and the
  indicative workstreams.
- **Endpoints:** no production endpoints are defined.

## 7. Tests

`npm run test:jobs` runs the **67** scenarios from section 23 of the build prompt. Result:
**67/67 passed**.
- 40 deterministic.
- 14 blocked-as-expected.
- 13 governance.

Full run with `npm run report:tests` (19 Nov 2026):

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
| Module 12 | 67 |
| **Total** | **883/883** |

The scheme gap probes still confirm the 2 known gaps. Typecheck and build are clean.

**Bundle:** the entry chunk is 430 KB (104 KB gzip), up 3 KB for the route table, RBAC module and
sidebar tag. The Module 12 pages and store load only when opened (JobPages 37 KB, FieldPages 22 KB,
TechnicianPages 18 KB).

**Browser check** (`vite preview`, background tab):
- All 23 routes render with no console errors.
- The sidebar shows the "Proposed" tag.
- On a rejected job, "Mark confirmed manually" is refused with the OP-52 / OP-55 reason.
- "Send to customer" is refused with the OP-57 reason.
- As Evolve Operations (USR-1003), the module is denied, absent from the sidebar and shows no job data.

Screenshots were not captured: the check ran in a background tab.

## 8. Indicative workstreams

These are relative sizes under stated assumptions, not effort or cost estimates. Full table on the
decisions page.

| Workstream | Size | Depends on |
| --- | --- | --- |
| Siebel two-way job integration | Large | OP-52 / OP-55 |
| Job lifecycle and allocation | Large | OP-53 |
| Technician app job screens | Large | OP-52, evidence rules |
| Scheme Engine job earning event | Medium | OP-56 |
| Verified flag | Small | OP-58 |
| Happy Points microsite and customer messaging | Medium | OP-57, OP-59 |
| E-ID card | Small | OP-59 |
| Direct Order review | Not estimable | OP-63 (legacy build needed) |
| Quotations | Medium | OP-29 |
| Retailer tagging, proximity and visit surveys | Medium | OP-27, OP-28 |
| Work-location governance | Small | OP-26 |
| Sales Executive app | Not estimable | OP-36 / OP-37 |

## 9. Excluded from this prototype

- Member-app screens: technician job list, accept, start and completion. The portal shows
  administrative views and contracts only.
- A public microsite.
- Real customer messaging.
- A Siebel connection.
- Ledger postings.
- A Direct Order implementation.
- A separate Sales Executive app.

## 10. Production dependencies

Before anything can go live:
1. V-Guard approval of the Module 12 scope.
2. Confirmation of all 12 decisions.
3. Siebel job APIs and their payloads.
4. A skill / territory master for technicians.
5. A Scheme Engine job event.
6. A DPDP-compliant consent mechanism and approved customer-messaging templates.
7. The legacy Direct Order build.
8. A retailer location source.
9. A change request.
