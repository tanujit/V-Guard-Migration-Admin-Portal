# Phase 3 — Maker-Checker Approval Engine and Approval Centre

Completion report and developer handover. Everything described here runs in the browser on development data. **No V-Guard system processes these approvals**, no V-Guard or Evolve record is changed, no email or SMS is sent, and no live API endpoint is defined or called.

## 1. Summary

A single approval engine now handles Maker-Checker for every module, and the **Approval Centre** sits at **Governance → Approval Centre** (`/governance/approvals`). Modules hand the engine a change request: the record, its current and proposed values, a reason and evidence. The engine then:

- picks the workflow;
- works out who may decide each stage from the Phase 2 RBAC model;
- enforces separation of duties, explicit status transitions and concurrency checks;
- hands approved requests to execution, which is tracked as its own status;
- writes an immutable audit trail and in-portal notifications.

The operational modules (Wallet, Scheme Builder, Members…) are not built. A **development request composer** stands in for them and calls the same submission entry point they will use.

## 2. Screens and workflows completed

| Area | Route | Notes |
| --- | --- | --- |
| My approval inbox (landing) | `/governance/approvals` | The ten KPIs, the inbox and a recent-activity table |
| All requests | `/all` | Everything the viewer may see. `?status=` and `?period=month` presets come from the KPIs |
| Requests I submitted | `/mine` | Maker view: assigned approver, last updated, edit/view action |
| Returned, Approved, Rejected | `/returned`, `/approved`, `/rejected` | One list component, queue-filtered |
| Awaiting execution | `/execution` | Approved but not yet applied, including failed executions |
| Escalated & overdue | `/overdue` | Past the stage SLA, escalated, or stuck in Pending assignment |
| Request detail (Checker review) | `/request/:id` | Sections A–G, plus routing, execution and admin panels |
| Request composer | `/new`, `/request/:id/edit` | New request, edit a draft, correct and resubmit a returned request |
| Workflow configuration | `/workflows` | Tabs: Templates · Governance decisions · Approval policy · SLA & escalation · Delegation · Notifications |
| Workflow detail | `/workflows/:id` | Scope, policy, stages, live potential approvers, validation gaps |
| Workflow wizard | `/workflows/new`, `/:id/edit`, `/:id/clone` | 7 steps: basics → triggers → stages → approvers → logic → return & reject → review & activate |
| Analytics | `/analytics` | Daily and monthly trends, outcomes, pending by module/programme, by organisation, turnaround, overdue ageing, stage-wise distribution, decisions by stage, audit log |

Inbox filters: request ID/description search, module, request type, programme, Maker organisation, Maker, current stage, priority, ageing, approval status, execution status and a request date range. Filters combine. Tables sort, page and export to CSV.

The header bell now shows the signed-in user's approval notifications next to the system alerts. Read state persists.

## 3. Approval request lifecycle

```
Draft ──submit──▶ Submitted ──route──▶ Pending approval ──open──▶ Under review
                        │                    │ approve (more stages) ▶ Partially approved ─┐
                        │                    │ approve (final) ──────▶ Approved ─▶ execution
                        │                    │ reject ───────────────▶ Rejected (final)
                        │                    │ return ───────────────▶ Returned ─▶ Resubmitted ─▶ route again
                        │                    └ SLA breach ───────────▶ Escalated (still decidable)
                        └ no workflow / no eligible approver ─▶ Pending assignment (nothing approved)
Withdrawn: from Pending assignment, Pending approval, Escalated or Returned, only before any Checker decision on the current version.
```

## 4. Status model

Approval status and execution status are separate fields (`ApprovalRequest.status`, `ApprovalRequest.execution.status`).

- **Approval:** Draft, Submitted, Pending assignment, Pending approval, Under review, Returned for correction, Resubmitted, Partially approved, Approved, Rejected, Withdrawn, Cancelled, Escalated, Expired.
- **Execution:** Not started, Awaiting execution, Executing, Executed, Execution failed, Retry pending.

Every change goes through `canTransition` / `canExecTransition` against the explicit tables in `src/config/approvalCatalogue.ts`. An invalid transition throws inside the engine, so UI components never set a status directly. Cancelled and Expired exist in the model, but no flow produces them yet (no expiry policy is configured).

## 5. Workflow template architecture

`WorkflowTemplate` (`src/types/approval.ts`) holds:

- **Scope:** module, request types, Maker organisations, programmes.
- **Status:** draft, active or inactive, plus a `confirmationRequired` flag with a config note and SOW reference.
- **Trigger conditions:** reusable `{field, op, values}` rows over programme, Maker organisation, Maker role, state, request category and amount.
- **Model and stages:** single or sequential, with ordered `WorkflowStage`s.
- **Separation of duties:** the Maker is always excluded; whether each stage needs a different approver is configurable.
- **Return/reject policy:** whether return is allowed, rejection is always terminal, whether a new request is allowed after rejection, withdrawal permission, resubmission behaviour and an expiry placeholder.
- **SLA:** calendar, escalation threshold, recipients and behaviour.

Nine seed workflows (`src/data/mock/approvalSeed.ts`):

| ID | Workflow | Status |
| --- | --- | --- |
| WF-001 | Points adjustment/reversal (Finance → Client governance) | Active |
| WF-002 | Scheme changes | Active |
| WF-003 | SKU changes | Active |
| WF-004 | Member status, SR/PIC → HO | Draft, business confirmation required |
| WF-005 | Registration/KYC, regional → Evolve verification | Draft, business confirmation required |
| WF-006 | Financial rule changes | Active |
| WF-007 | Redemption cancellation | Active |
| WF-008 | Communication publication (named approver) | Active |
| WF-009 | Scan restriction (named approver whose account is suspended) | Active |

Resolution (`resolveWorkflow`) uses only active templates that are not awaiting confirmation. When several match, the one with the most conditions wins. A tie, a draft-only match or no match becomes a routing exception, never a guess.

Workflow validation (`validateWorkflow`) blocks activation when any of these hold:

- the name or code is missing;
- the code is malformed or already used;
- no request type is chosen;
- there are no stages, or more than one stage on a single-stage model;
- a stage has no approver selection;
- **a stage has no eligible approver**;
- business confirmation is pending.

It warns on overlapping active workflows and on distinct-approver conflicts. Saving a workflow while requests are in flight leaves their routing unchanged; new submissions use the new version.

## 6. Sequential approval

`activateStage` runs one stage at a time. Approving a non-final stage records the decision, activates the next stage (status Partially approved) and notifies the next approvers. Only the final required stage moves the request to Approved. Stages are always mandatory: no escalation or administrator action skips one.

## 7. Routing and eligibility

`eligibleApprovers(state, access, request, stage)` is evaluated live, both when a stage is activated and again at decision time. A candidate must:

1. have an **active account**;
2. match the stage's assignment model (named user, organisation group, role group, programme group or geography group);
3. belong to the stage's approver organisation and hold its eligible roles, if set;
4. fall within the stage's programme and geography, if set;
5. hold a **Checker operational profile** whose modules include the request's module, whose programme and geography cover the request, and which is currently effective;
6. hold **Approve** on that module for the request's programme and location (`hasPermission`);
7. **not be the Maker**, or the submitter of any version;
8. not have approved an earlier stage, where the workflow requires a different approver per stage.

Each excluded candidate is listed with its reason, and workflow administrators see the list on the request. With no eligible approver the request goes to **Pending assignment** and the reason is shown. Administrators are notified and can re-run routing after fixing access. Nothing is assigned to an arbitrary administrator.

## 8. RBAC and separation of duties

- **Who can see a request:**
  - its Maker;
  - an assigned or deciding approver;
  - a user with a Checker profile covering the request's module, programme and location;
  - a business or platform role with Approval Centre View covering the programme and geography.
- Drafts are visible only to their Maker. Scenario G shows a regional Checker blocked from a request outside their scope.
- `canDecide` runs every check, including the concurrency token (`expectedSeq`). The detail screen only shows Approve, Return and Reject when `canDecide` passes. View-only users see an explanation instead.
- Self-approval is blocked by stable user ID, whatever roles the user holds (scenario E: Rahul is Maker and Checker on Product & SKU).
- Evolve Super Admin holds no approve permission. Its "administrative override" is always refused and audited (`admin.override`, override flag set).
- RBAC change from Phase 3: Member management gained Approve/Reject/Return actions (member-status requests need them). Checker profiles keep Approval Centre View for any module they cover.

## 9. Before/after comparison

Section C lists **changed fields only** by default, with a "Show all fields" toggle. Each field is tagged Added, Modified or Removed. Material (financial or member-status) changes are highlighted. The previous value is struck through, and number, points, currency, percent and date values are formatted.

For a new record no current value is invented. The version picker shows any submitted version. When a version follows a return, changed fields show "was X in the previous version" and a summary line lists what changed. The Checker cannot edit values: `opUpdateWorking` accepts only the Maker, and only on a draft or returned request.

## 10. Versioning and resubmission

- Submitting locks the version (`locked: true`).
- A return creates a new working version (v n+1) for the Maker. The submitted version stays read-only.
- Resubmission revalidates the request and refuses one identical to the previous version.
- It then applies the workflow's resubmission policy: `restart` from stage 1, or `resume_returning_stage`.
- Earlier decisions stay in the request history and audit trail, and every decision is attached to the version it was taken on.

## 11. Approval and execution separation

The final approval sets the approval status to Approved and the execution status to Awaiting execution, and assigns the idempotency key `EXE-<request id>-V<version>`.

- Execution is a separate step (`opExecStart`, then the adapter, then `opExecFinish`).
- A failure leaves the approval untouched and records the error.
- Retries are capped at 3 attempts and reuse the same key.
- Starting execution twice, or after success, is blocked.

Running or retrying execution needs Execute on the module or platform administration.

## 12. Mock execution adapter

`src/features/approvals/execution.ts` provides one adapter per module. Each states what the real adapter will do and returns a simulated result. Scenario H is flagged `simulate: "fail_once"`: its first attempt fails with a timeout and the retry succeeds. No system is changed.

## 13. SLA, escalation and notifications

- **SLA:** each stage sets its SLA hours. Each workflow sets the calendar, escalation threshold, recipients and behaviour (notify, or notify and mark Escalated). "Business hours" is labelled as not yet configured; it is counted as calendar hours.
- **SLA check:** there is no scheduler. The check runs on demand from **SLA & escalation → Run SLA check (mock)**, and once when the demo data is built. It flags overdue requests, escalates where configured and notifies. It never approves a request or skips a stage.
- **Ageing:** request lists show time since submission, time at the current stage, and Overdue or Due-in. The detail header shows time at stage, SLA remaining or overdue time, and total turnaround. The routing panel shows time spent at each stage.
- **Notifications:** `notifications.ts` defines the channels. Only in-portal is active; email and SMS are shown as not configured. Each event records type, request ID, module, message, recipient, timestamp, read flag and link.
- **Delegation:** built, but disabled by default (governance decision GD-05). When enabled, the delegate must independently hold a Checker profile with Approve on the module, and self-delegation is refused. Delegations end on their end date and are audited. They apply only to named-approver stages.

## 14. Audit events

`ApprovalAuditEvent` records:

- audit ID, request ID, version and timestamp;
- actor user, organisation and the profile they acted under;
- action, module and stage;
- previous and new status, previous and new value;
- remarks, reference, and an override flag.

Events emitted:

- `request.created`, `request.updated`, `request.submitted`, `request.resubmitted`, `request.withdrawn`;
- `workflow.selected`, `routing.exception`, `stage.activated`, `approver.assigned`;
- `request.viewed`, `request.approved`, `request.rejected`, `request.returned`, `stage.completed`;
- `request.escalated`, `request.overdue`, `approval.delegated`, `approval.completed`;
- `execution.started`, `execution.completed`, `execution.failed`, `execution.retried`;
- `decision.blocked` (every refused decision is logged);
- `admin.override` (always blocked);
- `workflow.changed` (templates, policies, governance decisions, delegation setting).

The log is append-only, and no screen edits or deletes it. IP and device context are not captured until an audit service supplies them. The full log is in **Analytics → Approval audit log**, with CSV export.

## 15. Scenarios tested

Every scenario is built by running real engine operations (`src/features/approvals/scenarios.ts`), so its history and audit are consistent. Each was also checked in the browser under the relevant identity.

| Scenario | Request | Result |
| --- | --- | --- |
| A — single stage | APR-2026-001249 scheme change EP/KA | Joseph approved; executed under its key ✔ |
| B — sequential two stage | APR-2026-001261 points adjustment | Lakshmi approved stage 1; Partially approved and waiting for Anita at stage 2 ✔ |
| C — returned | APR-2026-001262 scheme creation | Returned by Anita (multiplier over cap); Rahul's v2 resubmitted; "was 2.5" shown. Anita's approval in the browser moved it to Approved and Awaiting execution ✔ |
| D — rejected | APR-2026-001251 redemption cancellation | Rejected by Lakshmi with a reason; never executed ✔ |
| E — self-approval | APR-2026-001260 SKU change | Rahul sees "You submitted it…" and no decision buttons; Sneha is the only eligible approver ✔ |
| F — no eligible approver | APR-2026-001257 scan restriction | Pending assignment; the named approver is suspended and is listed as excluded ✔ |
| G — scope | APR-2026-001254 scheme change ST/TN | Joseph (EP/KA only) gets "outside your approval scope"; Anita can review ✔ |
| H — execution failed | APR-2026-001255 points reversal | Approved with Execution failed; Tanujit's retry succeeded with the same key (2 of 3 attempts) ✔ |
| I — configuration conflict | APR-2026-001258 member block | Pending assignment: "MEM-STATUS is awaiting business confirmation…" ✔ |

The demo data also includes:

- an escalated points adjustment (Lakshmi can still decide it);
- an overdue redemption whose workflow only notifies;
- an approved communication awaiting execution;
- a withdrawn request and a draft;
- 48 historical requests for analytics.

Also verified in the browser:

- the composer creates nothing from an empty form;
- a draft that fails submission keeps its errors on the edit screen;
- a member reinstatement routes to Pending assignment (workflow not approved);
- the workflow wizard refuses to activate MEM-STATUS;
- an administrative override is blocked;
- all six configuration tabs render without console errors;
- the request detail page has no horizontal scroll at phone width;
- `npm run build` passes.

### Security and edge cases (brief §24)

| # | Case | Handling |
| --- | --- | --- |
| 1 | Maker approves own request | Blocked by user ID in `canDecide`; message shown; attempt audited |
| 2–3 | Decide an already-decided request | `canDecide` rejects non-decidable statuses |
| 4 | No eligible approver | Pending assignment, reasons listed, admins notified, re-run routing |
| 5 | No workflow matches | Routing exception, nothing approved (try the new SOW request types such as Manual points addition) |
| 6 | Several workflows match | The most specific wins; a tie is a routing exception naming both |
| 7 | Workflow deactivated with requests pending | In-flight requests keep their routing; the decision panel warns |
| 8–11 | Approver loses Checker access, scope, programme or account | Eligibility is re-checked at decision time, so the decision is refused |
| 12 | Two Checkers decide at once | `seq` token: the second decision is refused with "changed after you opened it" and a reload button. This is a frontend mock, not a production concurrency guarantee |
| 13–14 | Returned request edited and resubmitted | New version; identical resubmission refused; revalidated |
| 15 | Withdraw after a decision began | Refused |
| 16–17 | Execution fails; retried repeatedly | Approval kept; same key; capped at 3; duplicate run blocked |
| 18 | Duplicate request | An open request for the same type and record blocks submission |
| 19 | Approver edits values | Not possible: no edit path for anyone but the Maker |
| 20–21 | Another organisation's or out-of-scope request | Not visible, and not decidable |
| 22–23 | Workflow with no stages or no eligible approver | Activation blocked by validation |
| 24 | Unresolved business decision | Draft + confirmation flag; requests wait in Pending assignment |
| 25 | SLA exceeded | Overdue flag and notification; escalation where configured; no auto-approval |
| 26 | Administrative bypass | Always refused and audited |

### Acceptance criteria (brief §26)

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Centralised Approval Centre | Done |
| 2 | Makers submit requests | Done (development composer) |
| 3 | Checkers see assigned requests | Done |
| 4 | Detail screen gives business context | Done (sections A–G) |
| 5 | Before/after comparison | Done |
| 6 | Evidence viewable | Metadata only; no file storage, so preview/download is disabled and labelled |
| 7 | Approve, reject, return within permissions | Done |
| 8 | Makers see submissions and history | Done |
| 9 | Correct and resubmit | Done |
| 10 | Versions preserved | Done |
| 11 | Sequential multi-stage | Done |
| 12 | Workflow templates configurable | Done (wizard; see limitations) |
| 13 | Eligibility from RBAC | Done |
| 14 | Programme and geography enforced | Done |
| 15 | Self-approval prevented | Done |
| 16 | Approval and execution separate | Done |
| 17 | Execution failure keeps approval | Done |
| 18 | Mandatory approval policies configurable | Done (registry; financial and member actions cannot be set to Not required) |
| 19 | SLA and escalation configuration | Done (per-stage SLA in the wizard; check runs on demand) |
| 20 | Notifications in mock environment | Done |
| 21 | Structured audit events | Done |
| 22 | Unresolved SOW decisions identified | Done (7 open items) |
| 23 | No auto-approval when no approver | Done |
| 24 | Dashboard and User Management intact | Dashboard (12 KPIs, all sections) and user directory (23 users) load on a fresh tab with no console errors; only the RBAC additions in §8 changed. Deeper Phase 2 flows were not re-run |
| 25 | V-Guard design system | Done |
| 26 | Compiles and runs | Done (`tsc -b` and `vite build` pass) |

## 16. Known limitations

- Frontend only. State lives in `sessionStorage`, one copy per browser tab. Every rule must be re-implemented on the backend (`src/services/approvalApi.ts` documents the contract; `httpApprovalApi` throws `ApiNotConnectedError`).
- The demo clock starts at 9 Nov 2026 14:30 and advances in real time, so SLA timers move during a session.
- Attachments are metadata only. Nothing is uploaded or stored.
- Business-hours SLA has no working calendar yet, so it is counted as calendar hours. Priority-based SLA is not modelled separately.
- Backup-approver routing is a declared behaviour and is not exercised. Parallel and quorum models are deliberately not offered.
- Cancelled and Expired statuses exist, but no flow produces them yet.
- Not exercised end to end in the browser: saving or activating a new workflow through the wizard, enabling delegation, the SLA-check button and policy edits. All are wired to engine functions covered by the Node scenario run. Mobile was checked on the request detail page only.
- The main JS bundle exceeds 500 kB; route-level code splitting is a follow-up.
- Resubmission with `restart` rebuilds the stage list. Earlier stage decisions remain in history and audit, not in the stage list.

## 17. Open business decisions

These are listed in-app under **Workflow configuration → Governance decisions** and are not answered here:

1. **GD-01:** Is the SR or the Branch PIC the first reviewer for member block and reinstatement? (WF-004)
2. **GD-02:** Does Evolve run a second KYC verification after regional registration approval? (WF-005)
3. **GD-03:** Do all manual points adjustments need Client Admin sign-off, or only those above a threshold? (WF-001)
4. **GD-04:** Which scheme changes need approval, and is a regional approval enough? (WF-002)
5. **GD-05:** Is temporary delegation required?
6. **GD-06:** Who may retry a failed execution, and after how many failures is a new approval needed?
7. **GD-07:** Is there an emergency override, and who holds it?

Approval requirements for every configuration-type action (schemes, SKU, communication, scan restrictions, gift catalogue) are also **Business confirmation required** in the policy registry. Until confirmed, they are routed for approval as a safeguard.

## 18. Screenshots

Captured from the running build at 1440 px, using development data (`docs/screenshots/phase-3/`):

| Journey | File |
| --- | --- |
| Checker: inbox with the ten KPIs | `01-checker-inbox-kpis.jpg` |
| Checker: review screen and decision panel | `02-checker-review-decision.jpg` |
| Checker: comparison (changed fields), impact, execution | `03-comparison-impact-execution.jpg` |
| Operator: failed execution retried under the same key | `04-execution-failed-then-retried.jpg` |
| Super Admin: override refused | `05-admin-override-blocked.jpg` |
| Maker: requests I submitted | `06-maker-submitted-requests.jpg` |
| Maker: v2 after return, no decision rights | `07-maker-view-version-2-after-return.jpg` |
| Admin: workflow templates | `08-workflow-templates.jpg` |
| Governance decisions | `09-governance-decisions.jpg` |
| Analytics | `10-analytics.jpg` |

## Files

- **Models and config:**
  - `src/types/approval.ts`
  - `src/config/approvalCatalogue.ts` (request types, statuses, transitions)
  - `src/data/mock/approvalSeed.ts` (workflows, policies, decisions)
- **Engine and services:**
  - `src/features/approvals/engine.ts`, `execution.ts`, `notifications.ts`, `scenarios.ts`, `store.ts`
  - `src/services/approvalApi.ts`
- **Screens:**
  - `src/pages/approvals/` (`shared.tsx`, `RequestListPage.tsx`, `RequestDetailPage.tsx`, `RequestComposerPage.tsx`, `WorkflowConfigPage.tsx`, `WorkflowWizardPage.tsx`, `AnalyticsPage.tsx`)
  - `src/styles/approvals.css`
- **Touched:**
  - `src/App.tsx` (routes)
  - `src/components/layout/Header.tsx` (notification bell)
  - `src/config/rbacCatalogue.ts` (member approval actions)
  - `src/data/mock/rbacSeed.ts` (Phase 3 Maker/Checker assignments)
  - `src/features/access/engine.ts` (Checker profiles keep Approval Centre View)
  - `src/features/access/store.ts` (storage key bumped to reseed)
