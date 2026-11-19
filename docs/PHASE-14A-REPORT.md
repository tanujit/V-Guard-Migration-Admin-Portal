# Phase 14A — Interactive Client Demonstration Environment

Completion report for Build Prompt 14A. How to run the demo: [CLIENT-DEMO-GUIDE.md](CLIENT-DEMO-GUIDE.md).

> **A working simulation, not production readiness.**
> - The portal can be demonstrated end to end: switch roles, create records, approve, watch balances
>   and statuses change, trace transactions and review reports.
> - Every integration is a **simulated adapter**. No live integration exists.
> - No business decision is approved by being demonstrated.
> - The go-live checklist is unchanged: **Not ready**.

## Status legend

| Label | Meaning |
| --- | --- |
| **Operationally simulated** | The action validates, changes the shared demo state, updates related records and is visible in other modules |
| **UI only** | Screen without a working action. None remain in the audited menus |
| **Backend integration prepared** | Contract or configuration exists; not connected (SAML SSO, external providers) |
| **Live integration** | None |
| **Business Confirmation Required** | Built behind an open decision (for example FD-05, OP-TDS1, OP-THEME1) |
| **Proposed scope** | Module 12, prototype only |
| **Production disabled** | Simulation controls are hidden in a production build (`VITE_APP_ENV=production`) |

## 1. Repository functionality audit

The repository was inspected before building.

**Already in place:**
- Every module already ran on stateful stores with one shared source per domain: members, wallet
  ledger, schemes, approvals, gifts, comms, risk, ops, analytics, platform and jobs.
- Each store has a single audited write path. The central Maker-Checker engine executes approved
  requests through registered handlers.
- The Communication event bridge already derives N01–N11 from the source stores, with idempotent
  event IDs.
- This is the shared simulation architecture the prompt asks for, so it was **extended, not rebuilt**.

**Inert controls:**
- Every `<button>` in `src/pages` and `src/components` was scanned for a missing handler.
- No inert buttons were found. The only handler-less buttons are the intentionally disabled View-As
  member actions and a wizard step whose handler sits on another line.

**Placeholder pages:** seven menu items ("planned") opened a placeholder. Six now open their working
screens:

| Menu item | Now opens |
| --- | --- |
| Scanning management | Scan & QR reports |
| Tickets & support | Communication Centre helpdesk |
| Geo & location | Branch & hierarchy |
| Financial configuration | Wallet configuration |
| Content & testimonials | Communication Centre content |
| Audit trail | Platform administration → Audit |

*Profile & preferences* remains planned; it is out of scope.

**Missing workflows** (each piece existed, but no single flow joined them):

| Workflow | Before | Now |
| --- | --- | --- |
| Scan → points | Eligibility, scan-point config, geo-fence, QR integrity, ledger and scheme engine existed separately | One simulated scan chains them; the ledger credit is idempotent per scan reference |
| Member-app redemption | Seeded redemptions only; the portal cannot raise one (in the SOW it starts in the app) | Simulated member-app UPI / DBT redemption validated by the existing blockers |
| Integration outcomes | Seeded request log only | The presenter can create success / failure / timeout / duplicate events on the ten adapters |
| Read-only business viewer | No such role | A Read-only Business Viewer role and demo identity |

## 2. Shared simulation architecture

- **One demo state:** the existing module stores, in `sessionStorage`. There are no per-screen mock
  datasets.
- **New domain adapters**, each idempotent and audited:

  | Adapter | Location | Role |
  | --- | --- | --- |
  | `ingestScanCredit` | `features/wallet/store.ts` | Scan-service ledger credit, with the EP TDS Kitty split |
  | `ingestScanTransaction` | `features/schemes/store.ts` | Scheme engine feed |
  | `recordScan` | `features/analytics/store.ts` | Scan record |
  | `simulateMemberRedemption` | `features/wallet/store.ts` | Member-app redemption |
  | `simulateIntegrationEvent` | `features/ops/store.ts` | Presenter-chosen integration outcome |

- **Demo layer:**
  - `features/demo/session.ts`: start-up core with the session, scenario progress and history.
  - `features/demo/store.ts`, loaded lazily:
    - metrics over the shared stores;
    - the scan pipeline;
    - scenario snapshots;
    - scenario reset and full reset.
- **Events:** each module's audit plus the approval history and the comms event bridge, viewed
  together in the Demo Centre **event timeline** (the central audit aggregator).
- **Environment:** `config/environment.ts` reads `VITE_APP_ENV` at build time. It is never a browser
  flag. A production build hides the banner, the Demo Centre, the scan simulator and the integration
  outcome controls.
- **Bundle:** the entry chunk is 437 KB (106 KB gzip), up from 430 KB for the banner, session core and
  personas. The Demo Centre (25 KB) and scenario panel (4 KB) load on demand.

## 3. Demo Centre and roles

**Client Demo Centre** (`/governance/demo-centre`, Governance menu, simulation builds only):

| Tab | Contents |
| --- | --- |
| Overview & controls | Status tiles; start / end session; load / clear scenario; full reset with a confirmation that names what is affected; scenario history |
| Guided scenarios | The 12-scenario library with start and reset |
| Simulated roles | The 10 personas with Maker / Checker / sensitive / admin rights and a switch button |
| Member app simulator | Scan and redemption |
| Integration outcomes | The ten SOW integrations × five outcomes |
| Event timeline | Filters by module, user, result, member and date |
| Demo data | Seed inventory and functional audit summary |

**Persistent banner** on every page: "DEMO / SIMULATION MODE — All transactions and integrations are
simulated. No live V-Guard systems are being modified", plus **SIMULATING AS: role — organisation**,
the dataset, last reset, the simulation clock and the role selector.

**Simulated roles:** ten personas, all existing development identities with their real role
assignments (see the guide).
- Role switching uses the existing identity switch, so navigation, actions, scope, masking and approval
  authority all follow the access engine. Audit records the simulated actor.
- Two persona fixes came from the audit:
  - USR-1007 is a **locked** account, so Technical Operations uses USR-3002.
  - Rahul's Maker profile does not cover points adjustments, so finance steps use Sneha.

## 4. Seed data

Synthetic, internally consistent, with masked identifiers; Demo Centre → Demo data shows live counts.

| Area | Content |
| --- | --- |
| Members | 111 (above the 40–60 requested, kept to preserve earlier phases' scenarios), across all five programmes, with pending / rejected KYC, blocks and holds |
| Products | Products and SKUs with scan-point configurations and rules |
| Schemes | 16 schemes in draft, pending, approved, scheduled, active, completed, returned, deactivated and budget-exhausted states |
| Wallet | About 2,600 ledger lines; balances are sums of ledger lines (verified in test 30) |
| Other | Gifts, vouchers, insurance cards, communications, fraud events, devices, integration requests and approval requests |

## 5. Test results

`npm run report:tests` run on 19 Nov 2026:

| Suite | Result |
| --- | --- |
| Schemes | 119/119 |
| Wallet | 92/92 |
| Communication | 37/37 |
| Gifts | 85/85 |
| Risk | 88/88 |
| Integrations | 114/114 |
| Analytics | 155/155 |
| Platform | 126/126 |
| Module 12 | 67/67 |
| **Demo (new)** | **38/38** |
| **Total** | **921/921** |

The scheme gap probes still confirm the 2 known gaps (G13, G14). Typecheck and build are clean.

`tests/demo.test.ts` runs on a browser-like `sessionStorage` shim. `fetch` is replaced by a recorder
and stayed **unused**. Mapping to the section 18 acceptance table:

| Acceptance test | Result (test #) |
| --- | --- |
| Create new member | Pass (1): MBR-EP-0555 in the directory, member events recorded |
| Submit KYC | Pass (2) |
| Approve KYC | Pass (3): approved by the Evolve Finance / Ops reviewer, audit event created |
| Reject KYC | Pass (4): reason recorded, member stays pending |
| Successful Scan-Out | Pass (5): scan record, ledger credit, wallet up, N03 event from the ledger line |
| Duplicate QR | Pass (6): rejected, no credit, fraud review-queue event |
| Create / approve scheme | Pass (10–11): incomplete drafts refused by validation; the pending scheme request approved by the Checker and executed |
| Eligible activity accrues | Pass (12): a simulated scan created a scheme accrual |
| Settle scheme (two-level) | Covered by `test:schemes` settlement cases; demo steps in SC-03 |
| Add manual points / self-approval / Checker approves | Pass (13–15): ledger, wallet and analytics updated |
| Reversal | Pass (16): new ledger line, original kept |
| Create redemption / payout succeeds / payout fails | Pass (17–19): UTR stored; failed payout reversed by a linked ledger line once FD-05 was recorded as a demo decision |
| Issue voucher, deliver physical gift, upload insurance CSV | Covered by `test:gifts` (85 cases on the same services) |
| Generate fraud signal | Pass (6) |
| Approve member restriction | Pass (20–21): restriction blocks scanning; reinstatement through approval lifts it |
| Retry failed integration | Pass (22): trace shows the failed and successful attempts; duplicate reprocessing refused |
| Generate report | Pass (24): the simulated scan appears in the scan report; export recorded |
| Use View-As | Pass (25) |
| Switch Maker to Checker | Pass (26): including the Read-only Viewer and "Super Admin cannot approve" |
| Reset demo scenario / full reset | Pass (34–35): non-demo keys and identity untouched |
| Proposed job flow / Siebel rejection | Pass (27–28) |

Quality checks (section 19), tests 29–38:
- no successful financial transaction without a ledger reference;
- balances reconcile with the ledger;
- idempotent scan credit, payout callback and notification;
- cross-module consistency;
- every scenario step has a persona and a real route;
- no network calls, and the environment comes from the build;
- proposed scope cannot activate;
- no unmasked identifiers.

## 6. Browser workflow results

Built app (`vite preview`), background tab:

- **Banner and role switcher** appear on the dashboard and every page. The six repointed menu items
  open working screens.
- **Maker-Checker through the real screens:**
  - As Sneha, the empty adjustment form showed four inline errors.
  - The valid form created ADJ-0006 (175 points, MBR-EP-0009), pending as APR-2026-001332.
  - The request page told Sneha "You submitted it, so you cannot approve".
  - As Lakshmi, stage 1 was approved after the confirmation dialog.
  - As Anita, stage 2 was approved with mandatory remarks.
  - The request executed: ledger line LED-002593 (`manual_add` +175), and the available balance went
    from 1,502 to 1,677.
- **Scan simulator:** accepted. Reusing the QR gave "You already scanned this code on 2026-11-09".
- **Integration outcome:** an SFDC validation error (REQ-000643) appeared in Integration Monitoring →
  Failures with a Retry link.
- **Event timeline:** showed the session's approval stages, execution, ledger posting, scheme accrual
  and staff alerts.
- **Full reset:** the confirmation named the affected data. Demo stores were cleared, and an unrelated
  key and the identity were kept.
- **Scenario SC-02:** started; the panel followed into the scan simulator. One Scan-Out (+10 points)
  automatically ticked 3 of 5 steps (ledger credit, scan report, N03).

Screenshots were not captured: the check ran in a background tab.

## 7. Fixed during this phase

- **Timeline window:** the default timeline view first filtered on an exact clock minute. The
  simulation clock advances with real time and restarts on reload, so it now shows the session from
  its start (or last reset) through the simulation day.
- **Scan simulator default SKU:** it defaulted to a SKU with Scan-Out 0 points. It now defaults to one
  that credits.

## 8. Known limitations

- **Single tab:** demo state lives in the presenter's browser tab. There is no shared server, so two
  presenters see separate demos.
- **Clock:** the simulation clock is fixed at 9 Nov 2026 14:30 plus elapsed real time, and restarts on
  reload.
- **Future-dated seed data:** some seeded gift records are dated December 2026.
- **Decisions needed to demonstrate:** the automatic payout reversal needs FD-05, and redemption-time
  TDS for Retailer / ST / CS is not calculated (OP-TDS1). Both are open business decisions; the demo
  shows that state, or a clearly labelled demo answer.
- **Not raised from the portal:** scheme creation from scratch and gift / insurance flows are
  demonstrated on their existing screens. Their automated proof is in the module suites.

## 9. Backend integrations still required

None of these is connected:
- SAML SSO;
- SFDC;
- eSeal;
- Siebel (lookup, and the proposed job APIs);
- RazorPay;
- DigiLocker / UIDAI;
- Signzy / NSDL;
- WhatsApp and SMS providers;
- Google Maps;
- logistics partners;
- a ticketing tool;
- app telemetry.

The portal's service contracts are prepared (`src/services`). The backend must re-enforce every rule
now in the engines.

## 10. Production activation dependencies

- A real backend and database replacing `sessionStorage`.
- The live integrations above.
- The open business decisions (including OP-RBAC1, FD-05, OP-TDS1, OP-UAT1 and OP-MIG1).
- UAT sign-off and the eight go-live gates.
- A production build with `VITE_APP_ENV=production`.

Module 12 stays Proposed.
