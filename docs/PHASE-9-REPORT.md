# Phase 9 — Gift Catalogue, Voucher Management, Physical Gift Fulfilment and Insurance Cards

Completion report and developer handover (Build Prompt 09, SOW Module 8, 10.5 AF03 and 10.8 AF20).

> **Development build.** Voucher providers, fulfilment partners, delivery tracking, the V-Guard.com
> arrangement, insurers and the insurance-card service are **mock adapters**. No real voucher code,
> shipment, address verification or insurance record exists. Voucher codes are masked; insurance
> numbers are masked and never stored in full. Points move only through the Phase 7 wallet service.

## 1. Summary

| Area | Status |
| --- | --- |
| Gift & Fulfilment dashboard (18 KPIs, distribution, fulfilment and insurance analytics, activity) | Done |
| Gift catalogue directory, detail, six-step create / edit wizard, preview | Done |
| Voucher, physical and V-Guard.com gift types | Done |
| Segment point-cost matrix (programme, member type, region, tier, dates), overlap detection | Done; precedence open (GD-04) |
| Programme, state, district, branch and tier segmentation; catalogue channels | Done |
| Gift categories (separate from the Product category master) | Done |
| Fulfilment partners, partner / SKU mapping, integration monitoring | Done (mock) |
| Voucher inventory, issuance monitoring, Issued / Used / Expired, separate delivery status | Done |
| Voucher recovery and reissue through a provider adapter (Finance approval) | Done (mock) |
| Physical orders, address confirmation, Placed → Dispatched → Out for Delivery → Delivered | Done; method and tracking partner open (OP-GIFT1) |
| Delivery exceptions queue, remarks, linked fulfilment issues | Done |
| N09 through the Phase 8 Communication Centre | Done |
| Backend gift redemption: single, paid, FOC, bulk CSV (Phase 7 engine reused) | Done |
| Insurance cards: types, segmentation, CSV upload, validation, Maker-Checker, publication, preview, JPEG / PDF test download, watermark, on / off (AF20), validity | Done; format, fields, authority and watermark open (OP-INS1) |
| RBAC, audit, reports, bulk import history, decision register | Done |
| Tests | 85/85 Phase 9 scenarios; schemes 119/119, wallet 92/92, comms 37/37 still pass; probes unchanged (12/14 fixed) |

Route: `/gifts` (sidebar: Programme operations → Gift & fulfilment). Fifteen tabs: Overview, Gift
catalogue, Point costs, Categories, Partners & SKU mapping, Voucher inventory, Voucher recovery,
Physical orders, Delivery tracking, Backend gift redemption, Insurance cards, Bulk import history,
Fulfilment reports, Audit history, Decisions & settings. Every tab is permission-gated.

Screenshots were not captured for this report; every route was rendered in the production build
(`vite preview`) without runtime or console errors, as the Super Admin and as Rahul (insurance desk).

## 2. Catalogue and point-cost model

- `GiftItem`: type-specific details (voucher partner, denomination where the partner gives it,
  product reference; physical image and delivery; V-Guard.com catalogue reference), optional Phase 4
  SKU reference, availability, inventory (`inventory_service` or `not_supplied`), segmentation,
  channels (Influencer app, Retailer app / SDK, microsite), status, version and history.
- No commercial fields (MRP, purchase price, taxes, margin) and no points-to-rupee conversion.
- Availability is never set to Available from missing data: without inventory data it is "Not
  supplied", and an operator choosing Available is recorded with a warning.
- Editing a live item creates a **draft version**; members keep seeing the approved version until the
  draft is approved (WF-030). Drafts and unapproved items are never visible.
- `PointCostRule`: gift, programme, member type, states, tiers, points, effective dates. Approved
  rules are never overwritten: a change is a new rule that **replaces** the old one from its
  effective date (the old value stays, end-dated). A rule that overlaps a live or pending rule is
  refused; two matching rules give **no cost** (ambiguous) because no precedence is invented (GD-04).
- Tiers come from the Phase 6 Tier master. The tier service does not expose member tiers yet, so
  development tier references are kept in the gift store (Decisions & settings); a member without one
  is not offered tier-restricted items or cards. No tier is guessed.

## 3. Partners and SKU mapping

Partners: the five voucher providers already in the Phase 7 configuration (mock adapters), a mock
courier, the V-Guard.com arrangement and an inactive demo partner. Credentials, secrets and tokens
are refused in partner fields. Mappings are validated for duplicates, missing partner or SKU
references, inactive Product & SKU records and incompatible gift types. Integration monitoring shows
mock connection, last success / failure, sync status and errors — never a live connection.

## 4. Vouchers and recovery

- Flow monitored: redemption (Phase 7) → wallet debit → provider issues the e-code → recorded →
  N09 WhatsApp + in-app → Gifts History (`giftsHistory(memberId)`, the member-app contract).
- Voucher status (Issued, Used, Expired; Available, Reserved and Replaced labelled as implementation
  states) is separate from delivery status (Pending, Delivered, Failed), which is read from the
  Communication Centre attempts of the voucher's N09 event.
- Provider callbacks (used / expired) are idempotent by callback ID; an invalid inventory response
  records nothing.
- Codes: lists and exports never show them. "View code" needs Voucher operations: View sensitive
  (direct grant DG-0005 to Sneha) and is audited; the vault reference stands in for the code.
- Recovery: validated against the voucher, the member, status, expiry and provider support; one open
  recovery per voucher. Finance approves (WF-031); execution asks the provider adapter. Outcomes:
  Code retrieved, Reissue successful, Recovery failed, Provider review, Voucher expired, Not
  recoverable. A reissue marks the original Replaced and creates exactly one replacement; a re-send
  creates nothing. Success sends N09 again. Provider reissue behaviour is open (GD-05).

## 5. Physical fulfilment and delivery

- Orders come from Phase 7 product redemptions (seed) and completed backend gift redemptions, each
  with order ID, redemption reference, member, programme, gift, point cost, ledger reference,
  partner and delivery status.
- The delivery address is a **snapshot** of the Member Management gift delivery address (never the
  Aadhaar home or working address). Changes create a new version; earlier versions stay on the order
  and confirmation drops to Reconfirmation required.
- Address confirmation (OP-GIFT1): the method is blank by default and no OTP is assumed. Recording an
  outcome needs a configured development method; outcomes are labelled simulated. Placement and
  dispatch are refused until the address is confirmed.
- Tracking adapter contract: placed, dispatched, out_for_delivery, delivered. Any other partner
  status is kept exactly as reported and becomes an exception (returned, failed delivery or unmapped).
  Duplicate event IDs are recorded and ignored; out-of-sequence events are not applied; operators
  cannot mark an order delivered. Tracking outages raise a Tracking unavailable exception.
- N09: dispatch and delivery events (with the tracking reference) are sent only from accepted partner
  events. For Phase 7 orders, delivery is reported back to the redemption record and its existing
  N09 event ID is reused, so nothing is sent twice.
- The SOW 2–3 day and 30-second targets are shown as indicative targets, not SLAs.

## 6. Backend gift redemption (Phase 7 engine reused)

`submitBackendGift` checks the catalogue (status, availability, segmentation, partner and mapping,
the member's point cost) and calls Phase 7 `submitGift` with the resolved catalogue item (new
optional argument; existing callers unchanged). Finance approves under WF-025; the wallet posts the
debit (or nothing for FOC). The gifts store then fulfils the completed redemption **once**: a voucher
is allocated or an order is created. A repeated completion is ignored.

Bulk CSV uses the Phase 7 header (`catalogue_ref` = Gift Catalogue ID); invalid and duplicate rows
are never processed and identical file content cannot be uploaded twice. A failed fulfilment keeps
the redemption and its debit and opens a fulfilment issue; the refund is raised as a Phase 7
adjustment (`ADJ-GIFT-FULFIL`) linked to the redemption, and goes through wallet approval.

## 7. Insurance cards

- EP, ST and CS only (Retailer and DD not assumed, GD-06). Multiple cards per member and type.
- Card types carry insurer, segmentation (programme, regions, tiers) and an on / off switch per
  programme (AF20): a backend change, no app release.
- CSV: the seven SOW fields keep their names (Name, Number, Qualification, Toll-Free Number,
  Insurance Amount, Validity Dates, Insurer Name) plus two implementation mapping columns
  (`member_id`, `card_type`) to confirm against the contract. Validation covers missing fields,
  formats, invalid dates, amounts, member and segment mapping, unsupported columns, duplicate rows
  and duplicate numbers under the configured rule (per insurer by default, GD-03). No number format or
  amount limit is assumed. The error report masks numbers.
- Policy: atomic by default (a batch with any invalid row cannot be submitted; a re-validation
  failure at processing creates nothing) or row level (development setting).
- Approval: WF-032 (V-Guard, remarks required); the Maker cannot approve their own batch. Approval
  creates card records **unpublished and inactive**; raw numbers are removed from the batch rows.
- Publication: WF-033 after preview and test download; only published, in-validity cards can be
  activated. Deactivation and reactivation never change validity dates and are audited.
- Preview: photo from Member Management (approved selfie reference; missing or unapproved → invalid
  photo reference), name, ID, masked number, insurer, amount, qualification, toll-free, validity,
  watermark. Needs Insurance cards: View sensitive (DG-0004 to Rahul).
- Test download: the card model is drawn on a canvas as JPEG, and a PDF embeds the same JPEG
  (`buildTestPdf`, DCTDecode). Both are labelled TEST PREVIEW and recorded; needs Insurance cards:
  Download. Production format stays Business Confirmation Required (OP-INS1).
- Watermark: text, position and opacity are development settings, unset by default; nothing is
  rendered until configured.
- Validity monitoring: active, expiring (30 / 60 / 90 / 365 days), expired, members with multiple
  cards. No automatic renewal and no expiry notification is introduced.

## 8. RBAC and approvals

New modules: `gift-catalogue`, `fulfilment-partners`, `vouchers`, `gift-orders`, `insurance`
(vouchers, gift-orders and insurance are sensitive-data modules: Super Admin has no View sensitive or
Download there). Maker and Checker profiles cover them; Evolve Operations gets publish / deactivate /
manage; Client Admin and Finance view and export; Regional Admins see vouchers and orders within
their states. Module limits updated for Rahul, Sneha, Anita and Lakshmi. Direct grants: DG-0004
(Rahul, insurance preview and download), DG-0005 (Sneha, voucher codes).

| Workflow | Request types | Approver |
| --- | --- | --- |
| WF-030 | `gift_catalogue_publish`, `gift_point_cost_change` | V-Guard (Client Admin) |
| WF-031 | `voucher_recovery` | Finance |
| WF-032 | `insurance_batch_upload` | V-Guard (authority to confirm, OP-INS1) |
| WF-033 | `insurance_card_publish` | V-Guard |
| WF-025 (Phase 7) | `gift_redemption` (paid and FOC) | Finance |

Execution handlers load on demand (`ensureExecutionHandler`). Seeded requests: 6 Phase 9 module-raised
requests appended to the precomputed steps (`npm run seed:approval-steps`), so earlier IDs are
unchanged. Storage keys bumped: access v11, approval v8; new `vg-rishta.gifts-store.v1`.

## 9. Files

- Types and config: `src/types/gifts.ts`, `src/config/giftsCatalogue.ts`
- Feature: `src/features/gifts/{engine,seed,requests,store}.ts`
- Pages: `src/pages/gifts/{shared,OverviewPage,CataloguePages,PartnerPages,VoucherPages,OrderPages,BackendGiftPage,InsurancePages,GovernancePages}.tsx`, `src/styles/gifts.css`
- Tests: `tests/gifts.test.ts` (`npm run test:gifts`)
- Changed (additive): RBAC catalogue and seed, approval catalogue and seed, execution map, module
  scenarios and generated steps, navigation, routes, comms N09 event list, wallet store
  (`submitGift` catalogue argument, `updateProductFulfilment`), wallet adjustment reason.

## 10. Open decisions (Gift & fulfilment → Decisions & settings)

| Ref | Decision | Restriction in this build |
| --- | --- | --- |
| OP-GIFT1 | Address confirmation method; tracking API / partner | Configurable, blank by default; simulated outcomes; dispatch blocked until confirmed |
| OP-INS1 | Card fields, JPEG / PDF, upload approval authority, watermark | Both formats prepared; production format BCR; watermark development setting only |
| GD-03 | Insurance number uniqueness | Development setting: per insurer |
| GD-04 | Point-cost precedence | None invented; ambiguous match blocks the item for that member |
| GD-05 | Provider reissue support | Mock re-send by default; never two active vouchers |
| GD-06 | Insurance for Retailer / DD | Out of scope in the current SOW |

## 11. Known limitations

- No real partner, provider, insurer, tracking or verification integration; all outcomes are mock.
- Member tiers are development references until the tier service exposes them.
- Profile photos are references to the approved selfie; the image service is not connected, so the
  card shows initials in place of the photo.
- Redemption TDS for ST, CS and Retailer is still BCR (OP-TDS1), so their backend gifts stay blocked
  at execution, as in Phase 7.
- Screenshots for the handover were not captured.
