# Phase 5 — Member Management, Member 360, Registration and KYC

Completion report and developer handover.

## What is real and what is mock

| Kind | What it covers |
| --- | --- |
| **Implemented frontend** | Every screen and workflow below. They run in the browser against the member store and the shared Phase 2 RBAC and Phase 3 approval engine. |
| **Mock service behaviour** | Identity verification responses (the SR picks the result in the assisted form), penny-less bank results, SFDC invitation/provisioning and sync status, the ledger (points, scans, redemptions, TDS), credential issuance and the MPIN reset service. Notifications are recorded, never sent. |
| **Prepared backend interfaces** | `src/services/memberApi.ts`: `MemberApi` contract, mock implementation, and an HTTP implementation that throws `ApiNotConnectedError`. No endpoints are defined. |
| **Connected production services** | **None.** Aadhaar/DigiLocker/UIDAI, Signzy, NSDL, SFDC, bank verification, OTP, SMS, email and the member mobile apps are not connected. |

All member records are fictional development data. Aadhaar, PAN, bank, UPI and GST values exist **only in masked form**. No MPIN is ever generated, shown or stored. No mobile-app screens were built.

## 1. Summary

Two modules under **Programme operations**:

- **Member management** (`/members`):
  - Overview
  - Member directory
  - Member 360
  - Status & restrictions
  - Activity history
  - MPIN reset
- **Registration & KYC** (`/registration-kyc`):
  - Registration overview
  - Registration queue
  - Programme-specific registration review
  - Assisted EP registration
  - KYC verification (dashboard and queue)
  - Document-wise review
  - KYC exceptions
  - Verification history
  - Decision register

## 2–3. Screens and programme-specific workflows

| Programme | Source | Journey implemented |
| --- | --- | --- |
| EP self | Influencer app | Pending → **Stage 1 SR/PIC approval** → Active (scan enabled, redemption blocked) → bank and KYC → **Stage 2 Evolve document review** → Redemption enabled |
| EP SR-assisted | Portal (Sales Rep) | Registry check → consent → identity verification (mock) → created **Active — scan enabled, redemption blocked**. No Stage 1. Credential issuance recorded; MPIN on first login; Stage 2 still applies |
| ST | SFDC invitation | Invitation, in-app completion and SFDC response status. Field-source mapping configurable, every field "Unconfirmed (OP-ST1)" |
| CS | SFDC invitation | Same concept as ST, but a separate programme config, separate review and separate counts |
| Retailer | SFDC provisioning | No registration workflow. PAN maintained in SFDC; GST eligibility gate from the source; redemption needs PAN verified **and** the GST gate passed |
| DD | SFDC provisioning | Keeps distributor ID, territory, sales targets and per-scheme scan eligibility. DD KYC items are "business confirmation required" (OP-41/42) |

## 4. Member 360

**Header:**

- identity, masked mobile (revealed only with View sensitive), programme, source and status;
- scan and redemption eligibility, each with its reason;
- KYC, restriction, branch and SR;
- quick actions, shown only when permitted.

**Tabs:**

- **Overview:** membership, points, scans, redemption and TDS. TDS is kept separate from points.
- **Profile:** verified fields are locked and show their source.
- **Addresses:** three independent records (Aadhaar home, working location, gift delivery).
- **KYC documents:** document-wise, with permission-checked preview and download.
- **Registration & approvals:** timeline, plus the programme journey and its gates.
- **Points, scans & redemption:** read-only.
- **Blocks & holds**
- **Change history:** append-only, filterable.
- **Consent & retention**

## 5. Data models

`src/types/members.ts`:

- `Member`, with its registration record and a programme block for Retailer, DD or invitations;
- `MemberIdentity`, shared by every membership of the same person;
- `KycDocument`, with its own `DocEvent` history;
- `Address`, `AadhaarConsent`, `StageDecision`;
- `Restriction`, including de-duplication detail and the reinstatement link;
- `MemberEvent` (the audit trail), `MobileChangeRequest`, `MpinReset`, `MemberNotification`, `MemberDecision`.

IDs are stable internal identifiers. Name and mobile are never keys.

## 6. Registration status logic

The EP four-state model applies to EP, and to ST/CS after in-app completion: Pending → Active (scan enabled) → Redemption KYC pending → Redemption enabled. Retailer and DD have their own `provisioned` state and do not use the EP states.

**Scan and redemption eligibility are computed separately** (`scanEligibility` / `redemptionEligibility`), and both take into account:

- restrictions;
- the Retailer GST gate;
- DD per-scheme scanning;
- Stage-2 gaps.

The programme requirement model is in `src/config/memberProgrammes.ts`. For each programme it defines:

- sources and status model;
- each document: mandatory, optional, not applicable, or confirmation required;
- Stage-1 route per source, and the Stage-2 reviewer;
- scan and redemption gates;
- field-source mapping and open points.

## 7. KYC document model and review

Document statuses:

- Not submitted
- Pending
- Under review
- Approved
- Rejected
- Re-upload required
- Verification failed
- Not applicable

Overall KYC is derived from the **mandatory** documents of that programme only. Documents marked "confirmation required" are never counted as pending.

**Review rules:**

- Opening a pending document marks it Under review.
- Approve, Reject and Request re-upload need the matching permission within programme and branch scope.
- Stage-2 documents are reviewed by **Evolve** only.
- Reject and re-upload need a reason from the catalogue plus remarks, and notify the member (in-app and email) and the SR/PIC (email and dashboard). Notifications are recorded, never sent.
- Only the affected document changes. Approved documents cannot be altered.
- When the last mandatory redemption document is approved, Stage 2 completes and redemption is enabled.

## 8. Verification abstractions

- **Aadhaar:** consent required. A verification exception blocks creation and Stage-1 approval:
  - OP-15: member not registered on DigiLocker;
  - OP-16: Aadhaar/mobile mismatch;
  - invalid response.
- **PAN:** route `PAN_ROUTE.configured = null` (OP-17). PAN is stored as Pending and **cannot be approved** until one source of truth is confirmed. Admin entry never marks it verified.
- **Bank:** penny-less verification (mock), with failure shown as an exception. Feeds the redemption unlock.
- **UPI and selfie:** status display only. No admin-side capture flow.

## 9. Program Block and Temporary Hold

| Control | Permission | Applies to |
| --- | --- | --- |
| **Program Block** | Member management: Disable | One programme membership only |
| **Temporary Hold** | Member management: Temporary hold | Every membership of the same identity; new enrolment with that identity is blocked |

- Both show an impact preview, need a reason code and remarks, never change the underlying registration or KYC status, and never delete history.
- De-duplication holds from the identity service are shown with masked identifiers and related member references. No matching engine was built.
- Applying a block is immediate and audited, because it is protective. The `member_block` policy was changed to "Business confirmation required" with that note; lifting a block always needs approval.

## 10. Reinstatement

- A Maker profile on members raises `member_reinstate`, which routes to **WF-012** (V-Guard Checker, single stage).
- The Maker cannot approve it; that is the Phase 3 engine rule.
- After approval, the members execution handler lifts the restriction and records "Reinstatement approved" and "Member reactivated". The original block stays in history.
- If another restriction remains, the member stays restricted and the submission warns about it.
- The detailed SOP is open (OP-BLK1).

## 11. Verified-field locking and override

- Name, date of birth and Aadhaar home address are locked once verified, and ordinary edits are refused.
- An override needs the **Override verified data** permission, a justification, and a Maker profile to raise `member_info_correction`. It routes to **WF-013**.
- The current and proposed values appear in the Checker comparison. After approval the handler applies the change and keeps the old value in history.
- A mobile change needs a support ticket. It is recorded "Awaiting verification" until the backend confirms OTP on both numbers; the number is never changed from the portal.

## 12. MPIN reset

- Needs the Reset credentials permission (Evolve Operations, Super Admin).
- Search by exact Member ID or full mobile; reason and confirmation required.
- The mock service returns a reference. The recovery step is pending OP-MPIN1.
- Refused attempts are recorded. No MPIN value exists anywhere.

## 13. RBAC and geography

New actions:

- `hold` (Temporary hold)
- `reset_credentials` (MPIN reset)
- `override` (Override verified data)
- `download` (Download documents)

Mapping of the brief's permissions:

| Permission | Implementation |
| --- | --- |
| View, Create, Edit, Export | `members` view/create/edit/export |
| Program Block | `members:disable` |
| Registration review / KYC approve, reject, re-upload | `registration-kyc` approve/reject/return (Checker profile) |
| Sensitive data | `view_sensitive` (preview), `download` (separate) |

Every check is programme- and branch-scoped through `hasPermission` and enforced in the store, not only by hidden buttons.

New seed access:

- Priya (Branch PIC, Kochi/Aluva): Checker on Registration & KYC, for Stage 1.
- Sales Rep role: Member Create, for assisted registration.
- Sneha: direct grant for KYC View sensitive, Download, and Override.
- Client Admin: Disable and Hold.
- Evolve Operations: Reset credentials.

## 14. Approval Engine integration

| Request type | Workflow |
| --- | --- |
| `member_reinstate` | **WF-012** |
| `member_info_correction` | **WF-013** |

The approval engine's registered execution handler for the members module runs automatically after the final approval.

Registration Stage 1 and the KYC document decisions are recorded in the module itself, using the same RBAC eligibility (Checker profile plus scope) and an approver/timestamp record. The Phase 3 draft workflows WF-004 and WF-005 remain "Business confirmation required".

## 15. Notification events

Recorded through the notification abstraction, all with delivery "recorded, not sent":

- credentials issued;
- Stage-1 approved or rejected;
- KYC document approved, rejected, or re-upload required (member and SR/PIC);
- redemption enabled;
- restriction applied;
- MPIN reset initiated.

They are listed under Activity history.

## 16. Audit events

Each `MemberEvent` records:

- member, programme and timestamp;
- actor, organisation and role;
- category and action;
- old and new value;
- remarks, approval request ID and reference.

Events cover:

- **Registration:** creation, assisted registration, Stage 1/Stage 2, SFDC sync and response failures.
- **KYC:** review start, approve/reject/re-upload, document view/download (and refusals).
- **Profile:** changes, overrides (submitted and applied), mobile change requests, address updates.
- **Restrictions:** applied, reinstatement submitted/approved, reactivation.
- **MPIN:** resets and refused resets.

Events are append-only, with no edit or delete path.

## 17. Mock data and scenarios

The seed (`src/data/mock/memberSeed.ts`) has **110 members**: EP 54, ST 17, CS 14, Retailer 17, DD 8. It includes linked identities, an active Program Block, a de-duplication Temporary Hold, and verification exceptions.

Scenarios were exercised through the store functions the screens call, switching actors by user ID. Every screen was also rendered in a clean tab.

| Scenario | Result |
| --- | --- |
| A EP self-registration | Priya approved MBR-EP-0001 → Active — scan enabled, redemption blocked ✔ |
| B SR-assisted | Vikram Rao created MBR-EP-0555: no Stage 1, scan allowed, redemption blocked, PAN Pending (OP-17), MPIN not set. Out-of-scope branch, DigiLocker exception and duplicate EP mobile were all refused ✔ |
| C Stage 2 | Sneha approved selfie and bank on MBR-EP-0003 → Stage 2 completed, redemption enabled ✔ |
| D PAN rejection | MBR-EP-0004: only PAN rejected; Aadhaar, selfie, bank and UPI stay approved ✔ |
| E / F ST and CS | Separate invitation reviews; field sources "Unconfirmed (OP-ST1)"; SFDC response failure shown ✔ |
| G Retailer | MBR-RT-0002: PAN approved in SFDC, GST "not eligible", redemption blocked by the GST gate; no registration flow ✔ |
| H DD | MBR-DD-0001: distributor ID, territory, targets; one scheme's scanning disabled ✔ |
| I Member 360 | All 9 tabs render for MBR-EP-0005 ✔ |
| J Verified edit | Ordinary name edit refused; override routed to WF-013, approved by Anita, applied ✔ |
| K Program Block | EP blocked; linked Retailer still scans and redeems ✔ |
| L Temporary Hold | Both linked memberships held; new enrolment with that identity refused ✔ |
| M Reinstatement | Sneha submitted (WF-012) and her own decision was refused; Anita approved → block lifted. The member stays restricted by the separate hold ✔ |
| N MPIN reset | Rahul triggered MPR-0001; Anita refused and recorded ✔ |
| O Restricted user | Priya sees only her 7 branch members and no export; a Madurai member is denied ✔ |
| P Document access | Anita's preview refused and recorded; Sneha's download recorded ✔ |

Also checked:

- PAN approval is blocked (OP-17).
- Priya cannot do Stage-2 review (Evolve only).
- A mobile change needs a ticket and leaves the number unchanged.
- Member 360 has no horizontal scroll at phone width.
- `tsc -b` and `vite build` pass. The Dashboard, Approval Centre and Masters routes still render.

**Bug found and fixed during testing:** mobile masking did not match the seed's number format, so a user without View sensitive saw full numbers. The masking is now format-independent and keeps only the last 4 digits.

### Edge cases (brief §22)

Covered as described above:

- **Duplicates and identity:** 1–6 (same/other-programme mobile; Aadhaar/PAN/bank duplicates via de-duplication hold display).
- **Verification exceptions:** 7–11 (exceptions, the OP-17 block).
- **Document decisions:** 12–14 (approved documents immutable, single-document rejection, bank failure).
- **Eligibility:** 15–18 (separate scan and redemption gates, GST gate, DD scheme).
- **Profile changes:** 19–20 (lock, ticket and OTP requirement).
- **Restrictions:** 21–25 (per-programme block versus hold, de-duplication hold, remaining restriction after a lift, approval required).
- **Separation of duties:** 26 (Maker self-approval refused).
- **Eligibility without redemption:** 27 (active but no redemption).
- **Re-upload:** 28 (re-upload status).
- **Unauthorised actions:** 29–31 (MPIN, sensitive data, export scope).
- **SFDC data quality:** 32 (incomplete or conflicting SFDC record held, existing data not overwritten).

## 18. Open business decisions

These are listed under Registration & KYC → Decision register:

- **OP-14:** Member ID composition, or UUID?
- **OP-ST1:** Which ST/CS fields come from SFDC and which are completed in-app?
- **OP-24:** What is the SFDC callback contract?
- **OP-RET1:** Does the Retailer have any in-app KYC?
- **OP-15:** How are members not on DigiLocker handled?
- **OP-16:** What happens on an Aadhaar/mobile mismatch?
- **OP-17:** Which PAN source is the single source of truth?
- **OP-BLK1:** What is the reinstatement SOP?
- **OP-MPIN1:** What are the MPIN recovery method, length and lockout?
- **OP-41/42:** How are DD and Retailer merged, and who owns which fields?

## 19. Known limitations

- Browser-only state (`sessionStorage`, per tab). The backend must enforce every rule.
- Identity, bank, SFDC and ledger data are mock. The assisted form lets the SR choose the mock verification outcome, which is clearly labelled.
- The "approved versus pending" and trend figures come from seed dates.
- A re-upload cannot be simulated from the portal, because the member uploads in the app.
- Programme Block and Temporary Hold are applied immediately; whether applying them also needs approval is part of OP-BLK1.
- The JS bundle is now about 1 MB. Route-level code splitting is recommended. The members, masters and approval stores must stay eagerly loaded, because they register execution handlers.
- Not every edge case has its own seeded record: duplicate Aadhaar/bank are represented by the PAN de-duplication hold pattern.

## 20. API contract

`src/services/memberApi.ts` (`MemberApi`):

- `getMembers`, `getMember360`, `getMemberActivityHistory`
- `createAssistedEPRegistration`, `submitRegistrationDecision`
- `getKycQueue`, `approveKycDocument`, `rejectKycDocument`, `requestDocumentReupload`
- `updateMemberProfile`, `requestVerifiedFieldOverride`, `requestMobileChange`
- `applyRestriction`, `submitReinstatementRequest`
- `triggerMpinReset`
- `getProgrammeKycRequirements`

## 21. Screenshots

Files are in `docs/screenshots/phase-5/`:

- Member 360 for a cross-programme identity, with masked mobile and eligibility;
- KYC verification KPIs.

Other journeys were verified through page text and store calls, as listed in §17.
