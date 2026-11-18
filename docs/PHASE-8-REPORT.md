# Phase 8 — Communication Centre, Notifications, WhatsApp Bot, Helpdesk, Content and Surveys

Completion report and developer handover (Build Prompt 08, SOW Module 7 and 10.8).

> **Development build.** All five channel providers (WhatsApp, SMS, email, push, in-app) are **mock
> adapters**: no message reaches a member. The WhatsApp bot, the member app inbox, the helpdesk
> integration, content storage and the survey provider are not connected. Conversations, queries,
> survey responses and delivery outcomes are development data.

## 1. Summary

| Area | Status |
| --- | --- |
| Communication Centre at Masters & configuration → Communication centre (17 tabs) | Built |
| Overview: 16 KPIs, channel distribution, trends, recent activity | Built |
| Composer: rule-based, scheduled and manual modes; six-step wizard | Built |
| Notification Catalogue N01–N11 (trigger, audience, channels, templates) | Built; enable / disable and configure without a release |
| Templates: per channel × eight languages, variable registry, versioning | Built; language list is a development stand-in (CD-05) |
| Event bridge from Member, KYC, Wallet, Scheme modules (rule-based dispatch) | Built; stable event IDs prevent duplicate sends |
| Delivery monitoring: accepted / dispatched / delivered / failed, callbacks | Built (mock callbacks) |
| WhatsApp primary, SMS fallback for critical entries | Built |
| Retry policy | **Not configured (CD-07)**: retries refused until confirmed |
| Push / in-app preview, inbox categories, deep-link catalogue | Built; member inbox not built |
| WhatsApp bot: role-based menus, safe actions, simulator, monitoring | Configuration and preview only; bot not operational |
| Helpdesk: queue, escalation, assignment, remarks, SLA status | Built on the Tickets & support permission module |
| SLA targets | **Development examples only (CD-06)** |
| Self-service: section FAQs, multi-step How-To, tutorials, testimonials, leaderboard content | Built |
| Banners and home scrollers, named HO Admin publisher | Built |
| Social / contact links | Built; placement open (OP-CONTENT1) |
| Surveys: source configuration, N06 dispatch, responses | Built; authoring and triggers open (OP-SURV1), geofence disabled |
| Profile action configuration (SOW 7.6) | Built as configuration; no consent / KYC simulated |

Tests: **37 / 37** (`npm run test:comms`). Phase 7 92 / 92, Phase 6 119 / 119 and the probes (12 of 14
fixed) are unchanged. Typecheck and production build pass with no warnings. On the production build,
the 30 Communication Centre screens and tabs render with no console errors. Screenshots were not
captured.

## 2. Five channels and dispatch

- **Channels:** WhatsApp, SMS, email, push and in-app share one architecture. The catalogue lists
  each channel's SOW use and contact type.
- **Contact checks before sending:**
  - WhatsApp and SMS need a mobile. WhatsApp reachability is simulated.
  - Email needs an email address.
  - Push needs an app login.
  - In-app needs a member account.
  - A missing contact is recorded as a provider error per recipient, never sent.
- **Dispatch states are kept apart:**
  - queued → request accepted → dispatched → delivered or failed.
  - In-app goes to published.
  - Only a provider callback marks delivery. Duplicate or late callbacks are ignored and audited
    (test G3).
- **Fallback:** WhatsApp → SMS only for entries flagged critical (N01, N07, N09, N11), and only when
  WhatsApp fails or is unavailable. No SMS is sent when WhatsApp succeeds (test C).
- **Idempotency:** every attempt carries a key (`commId|recipient|channel|attempt`).
- **Retries:** need a recorded policy (CD-07). None are invented, and a delivered message is never
  retried.

## 3. N01–N11 coverage

| ID | Source (authoritative) | Event types | Default channels | Notes |
| --- | --- | --- | --- | --- |
| N01 | Member Management events | registration.received / stage_progress / approved / activated / rejected | WA, push, in-app | EP also notifies the SR/PIC (staff recipient) |
| N02 | KYC document reviews | kyc.document_approved / rejected / reupload_required | in-app, email, WA | Document type and outcome only; no identifiers |
| N03 | Wallet ledger | scan.points_credited | push, in-app | Only completed credits; pending scans never (test F) |
| N04 | Scheme activation × `eligiblePopulation` | scheme.live | WA, push, in-app | One event per eligible member (Phase 6 eligibility service) |
| N05 | Scheme milestone accruals | scheme.milestone_achieved, tier.changed | push, in-app | Tier change events are not yet emitted by the tier service |
| N06 | Surveys | survey.invitation | WA, in-app | Refused without a survey reference / link |
| N07 | Wallet redemptions | redemption.requested / processing / success / failure | WA, push, in-app | Success only after the payout callback (test J) |
| N08 | TDS FY reconciliation, recorded redemption TDS | tds.fy_reconciled, tds.deducted | email, in-app | Blocked (OP-TDS1) outcomes never notified |
| N09 | Vouchers, confirmed deliveries | voucher.issued, gift.dispatched, gift.delivered | WA, in-app | Delivered only when the fulfilment record says so; Phase 9 will add dispatch events |
| N10 | Scheduler, incomplete-KYC audience | kyc.reminder_due | WA | Cadence not set (CD-08): scheduling refused until confirmed |
| N11 | Restrictions applied / lifted | member.blocked / hold / reinstated | WA, SMS, in-app | No internal fraud detail |

- **Event bridge:** `features/comms/events.ts` reads the source stores. Event IDs derive from the
  source record, so a redelivered event is a duplicate: it raises the received count and sends
  nothing (test Y).
- **Disabled entries:** events for a disabled entry are recorded as skipped (test G6).

## 4. Templates and localisation

- **Templates:** one per entry and channel, plus a manual in-app template. English base copy is
  provided.
  - Hindi development translations exist for N03 and N07, marked "needs review".
  - Other languages are deliberately missing, so the missing-translation checks show (test P).
- **Variable registry:** templates may use only the registry variables for their notification
  (`VARIABLES`). Unsupported variables, missing required variables and unapproved deep links are
  errors. Channel length limits are development settings.
- **Versioning:**
  - Editing creates a new draft version, and the active version is never overwritten.
  - WhatsApp versions need mock provider approval.
  - Transactional and critical templates go through WF-026. Test O changes Hindi only: v1 is kept as
    superseded and English is unchanged.
- **Language coverage:** recorded per channel. Push and bot coverage show Unconfirmed (OP-A21).

## 5. Audience, approval and composer

- **Audience builder:** programme, state, branch, role, member status (active, pending KYC,
  redemption eligible, scan enabled) and selected member IDs.
- **Audience preview:** eligible count, distribution by programme, state and language, exclusions,
  out-of-scope count and missing contacts per channel.
  - Members outside the user's programme or geography are never included (test Q).
  - Contact data is never listed.
- **Approval policy per category** is configurable, with development defaults:
  - Manual, scheme, critical, transactional-template, testimonial, survey and bot changes need
    approval.
  - FAQ, social links and banners need publish rights instead.
- **Approval never dispatches:**
  - Sending needs Communication: Execute (test A).
  - Scheduled communications are dispatched by the scheduler.
  - Editing a scheduled or approved communication returns it to draft (test G5).

## 6. WhatsApp bot and helpdesk

- **Menus:** EP, ST, CS, Retailer and DD each have their own versioned menu. Retailers get GST help,
  not the KYC prompt (test R).
- **Safe actions only:**
  - Allowed: read-only balance, schemes, KYC / bank prompts, FAQ, raise query, escalate.
  - Refused: redeem, transfer, add / deduct points and approve KYC, both in validation and when
    saving (test S).
  - Free text asking to redeem is refused with a redirect to the app.
- **Simulator:** reads the balance from the wallet engine and changes nothing.
- **Escalation and helpdesk:**
  - Escalation creates a helpdesk query with a reference.
  - Agents can assign, reassign, add internal remarks, record member communication, resolve and
    reopen.
  - Permissions: Tickets & support Manage / Edit.
  - SLA status (within, overdue, breached, no policy) uses development example targets (CD-06).

## 7. Content, banners, links, surveys

- **FAQs:** organised by app section (Scanning, Wallet & points, Redemption, Profile, Registration &
  KYC, Schemes, Gifts). A partner Maker cannot publish; missing language versions are warned (test U).
- **How-To guides:** multi-step, with media and deep links per step.
- **Tutorials, testimonials and leaderboard content:**
  - Testimonials need a consent reference and approval (test G7).
  - Leaderboard content points at the Phase 6 leaderboard; no ranking is calculated here.
- **Media:** metadata only, with type and size validated (development limits).
- **Banners:**
  - Publishing needs `banners:publish`, granted only by direct grant DG-0003 to Anita (named HO
    Admin).
  - Super Admin and Operations Makers are refused, and every publish is audited (test V).
  - Edits return a banner to draft; expired banners show as expired.
- **Social links:** https URLs only (test G8).
- **Surveys:**
  - Source can be external link, external tool or portal (mock); publication goes through WF-028.
  - N06 dispatch carries the survey link.
  - Responses support filters, aggregates and export.
  - Duplicate and out-of-audience responses are refused (test W).
  - The geofence trigger cannot be enabled.

## 8. RBAC and approvals

- **New modules:**
  - `comm-templates`: view, edit, submit, approve, reject, return, disable, publish.
  - `banners`: view, create, edit, disable, publish.
  - `comm-bot`: view, edit, submit, approve, reject, return, publish.
  - `surveys`: view, create, edit, submit, approve, reject, return, publish, export.
- **New action:** `publish`.
- **Extended modules:** `communication` gains cancel, manage and export; `content` gains publish and
  manage.
- **Role grants:**
  - Evolve Operations: content publish / manage, communication cancel / manage, tickets edit.
  - Super Admin: no banner publish.
- **Assignments updated:**
  - Rahul's Maker scope: communication modules.
  - Anita's Checker scope: comm-templates, comm-bot, surveys.
- **Request types:** `comm_template_publish`, `content_publish`, `survey_publish`,
  `bot_menu_publish`.
- **Workflows:** WF-026 to WF-029; WF-008 is reused for manual communications.
- **Seeded pending requests** (COMM-0003, TPL-N07-WA v2, TST-002, SRV-002) are precomputed steps
  appended after the earlier scenarios, so existing request IDs are unchanged.
- **Phase 3 demo requests:** demo `communication_publish` requests (for example COM-ST-1102) have no
  Phase 8 record. Running their execution now fails with "nothing dispatched".
- **Storage keys bumped:** access store v10, approval store v7. New store: `vg-rishta.comms-store.v1`.

## 9. Data models and services

- **Models:** `src/types/comms.ts` — catalogue entry, template and versions and translations,
  audience, communication, delivery attempt, notification event, bot menu and conversation, helpdesk
  query, SLA policy, FAQ, guide, media, rich content, banner, social link, survey and response,
  language config, profile action, decision, audit.
- **Engine:** `features/comms/engine.ts`, pure functions.
- **Event bridge:** `events.ts`.
- **Store:** `store.ts`.
- **Seed:** `seed.ts`.
- **Contracts:** `src/services/commsApi.ts` defines the interfaces, the mock implementation and a
  not-connected HTTP implementation. The 23 services and their status are listed in Configuration →
  Service contracts.

| Layer | Status |
| --- | --- |
| Frontend screens | Built |
| Dispatch | Simulated (mock adapters) |
| Backend interfaces | Prepared, not connected |
| WhatsApp / SMS / email / push providers | None connected |
| Helpdesk / member app inbox / bot | None connected |

## 10. Open decisions (Configuration → Decision register)

| ID | Ref | Question |
| --- | --- | --- |
| CD-01 | OP-A21 | Eight languages for WhatsApp bot and push / system notifications? |
| CD-02 | OP-CHAT1 | In-app chatbot besides the WhatsApp bot? (inactive) |
| CD-03 | OP-CONTENT1 | Social link set / placement; FAQ and How-To content source |
| CD-04 | OP-SURV1 | Survey authoring, targeting, triggers, geofence scope |
| CD-05 | — | The app's eight-language list (development list in use) |
| CD-06 | SOW 7.4 | Helpdesk SLA targets and escalation groups |
| CD-07 | — | Retry count, interval and fallback conditions |
| CD-08 | SOW 7.2 N10 | Incomplete-KYC reminder cadence |
| CD-09 | SOW 10.8 AF06 | Mapping of legacy named HO Admin users (under review) |

## 11. Known limitations

- **Member language preference is derived from the member's state** for development. The member
  master has no language field.
- **No tier-change events:** the tier service does not emit them, so N05 shows milestones only.
- **N09 covers what Phase 7 records:** voucher issue and product delivery. Phase 9 (Gift &
  Fulfilment) adds dispatch and tracking events.
- **One stylesheet:** Phase 8 styles are appended to `wallet.css`, since stylesheets are not yet split
  per route.
- **Media is metadata only**, and the file input does not read image dimensions.
