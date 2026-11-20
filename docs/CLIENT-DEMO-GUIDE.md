# V-Guard Rishta — Client Demonstration Guide

How to run the portal as a working simulation for V-Guard stakeholders (Build Prompt 14A).

> **Everything you do in the demo is simulated.**
> - The yellow **Demo mode** banner is on every page.
> - No V-Guard system, payment gateway, messaging provider, tax system or Siebel is contacted.
> - Demo data lives in the presenter's browser tab only.
> - A completed demo shows how the platform will behave. It does not mean the integrations are live
>   or the platform is production-ready.

## 1. Before the session

1. Open the portal (the Vercel preview, or `npm run preview` locally).
2. Sign in with the development identity picker. Start as **Evolve Super Admin**.
3. Open **Demo centre** in the sidebar, or use the **Demo centre** link in the banner.
4. Choose **Reset demo data / restore initial seed** → **Confirm full reset**. The demo now starts
   from the seeded dataset.
5. Choose **Start demo session**. The session start is used by the event timeline.

## 2. The banner

The banner shows that demo mode is on and, under **Viewing as**, the simulated role. Hover over
**Demo mode** to see the dataset, last reset time and simulation clock.

The **Viewing as** selector switches between the ten simulated roles. Each switch changes:
- the menu;
- the buttons and actions available;
- the programme and geography scope;
- whether sensitive data is masked;
- the approval authority.

| Role | Person | Typical use |
| --- | --- | --- |
| Evolve Super Admin | Tanujit Roy | Configuration, platform administration, Module 12 prototype. Cannot approve |
| Evolve Maker | Rahul Menon | Schemes, gift catalogue, communication, configuration requests |
| V-Guard Client Admin | Anita Krishnan | Governance; Checker for schemes, members, wallet, communication |
| V-Guard Checker (Finance) | Lakshmi Raman | First-stage finance approvals |
| Regional Admin | Joseph Mathew | Karnataka only |
| Branch Manager / PIC | Priya Shenoy | Kochi and Aluva branches |
| Sales Representative | Vikram Rao | Chennai North EP members; registration; View-As |
| Evolve Finance / Operations | Sneha Das | Points adjustments, reversals, KYC review, reinstatement requests |
| Read-only Business Viewer | Demo Viewer | Views dashboards and records; no create, approve, export or sensitive data |
| Technical Operations | Pooja Reddy | Integration monitoring, retries, system health |

## 3. Guided scenarios

Open **Demo centre → Guided scenarios**, pick a scenario and choose **Start scenario**. A
guidance panel then follows you across screens. For each step it shows:
- who performs it, with a **Switch to this role** button;
- why the step matters;
- what changes;
- where the audit record appears;
- a **Go to screen** button.

Steps tick themselves when the change appears in the shared demo data. Viewing-only steps are ticked
with **Mark shown**. **Reset scenario** returns the demo data to the moment the scenario started, so it
can be shown again.

| # | Scenario | Key moments |
| --- | --- | --- |
| SC-01 | New member registration and activation | Sales Rep registers an EP → KYC approve / reject → N01 / N02 → Member 360 |
| SC-02 | Scanning and point credit | Valid Scan-Out credits the ledger and wallet. Duplicate QR, geo-fence and invalid product are rejected. Scan report and N03 |
| SC-03 | Scheme configuration and settlement | Builder → submit → approve → activate → scans accrue → two-level settlement |
| SC-04 | Financial adjustment and reversal | Sneha adds points → self-approval blocked → Lakshmi then Anita approve → reversal as a new ledger line |
| SC-05 | Redemption and payout failure | Member-app redemption → payout fails → automatic reversal (needs FD-05) → N07 |
| SC-06 | Gift redemption and delivery | Gift item → approval → order → milestones → N09 |
| SC-07 | Fraud detection and investigation | Duplicate QR signal → case → restriction through approval → reinstatement |
| SC-08 | Failed integration and retry | Inject SFDC validation error → Failures / trace → retry |
| SC-09 | Maker-Checker governance | Scheme, adjustment and restriction through one engine; reject one, approve others |
| SC-10 | View-As and member support | Read-only member app, masked identity, other branch refused, audited |
| SC-11 | Reporting and management review | Overview → points flow → schemes → fraud → scans → export |
| SC-12 | Proposed technician job (Proposed / Demo only) | Mock Siebel job → confirm → simulated reward; rejection and timeout earn nothing |

## 4. Finding your way around

The sidebar has one entry per area. Areas with related sections show a switcher at the top of the page:

| Sidebar entry | Sections |
| --- | --- |
| Members | Members · Registration & KYC |
| Redemption & gifts | Redemption · Gifts & orders |
| Master data | Overview · Products · Categories · Branches · Scanning |

Pages such as Scan & QR reports, Helpdesk, Devices, Audit trail, App usage and System health are tabs
inside their area. **Search** (Ctrl K) finds any of them by name. Info icons beside headings explain
what a section is for.

## 5. Demo Centre tools

- **Member app simulator → Scan.** One scan goes through, in order:
  - member status and restrictions;
  - product lookup (mock eSeal);
  - scan-point configuration;
  - geo-fence (Retailer / CS);
  - QR integrity;
  - wallet ledger, including the EP TDS Kitty split;
  - active schemes;
  - the scan report.

  **Reuse last QR** shows the duplicate check.
- **Member app simulator → Redemption.**
  - A UPI or bank redemption, validated by the wallet's blockers: balance, minimum, limits, KYC, bank,
    restrictions and the GST gate.
  - Settle the payout on **Redemption → Payouts** using **Simulate (dev)**.
- **Integration outcomes.**
  - Choose one of the ten SOW integrations and an outcome: success, validation error, timeout,
    provider failure or duplicate callback.
  - The event appears in Integration Monitoring, Failures, Retry and Message trace.
- **Event timeline.**
  - Everything that happened in this demo session, from every module, with the simulated user.
  - Needs a role with Platform administration: View.
- **Demo data.** The seed inventory and the functional audit summary.

## 6. Suggested 30-minute running order

1. **SC-02:** scan, duplicate, geo-fence. Shows the wallet, scan report and N03 changing at once.
2. **SC-04:** Maker-Checker adjustment with the self-approval block and two approval stages.
3. **SC-10:** View-As as the Sales Rep, including the blocked other-branch member.
4. **SC-08:** a failed SFDC record and its retry.
5. **SC-11:** management review; the earlier actions appear in the reports.
6. Optional: **SC-12**, labelled Proposed / Demo only.

Reset the scenario or the whole demo between audiences.

## 7. Things to say when asked

- **"Is this connected to Siebel / SFDC / RazorPay?"** No. Every connector is a simulated adapter
  labelled Simulated. Real connections need the contracts and credentials listed in the handover.
- **"Will this tax figure be right?"** Redemption-time TDS for Retailer, ST and CS is Business
  confirmation required (OP-TDS1), so it is not calculated. EP / IMP scan-time TDS to the Kitty uses
  the configured development rate.
- **"Why didn't the automatic reversal run?"** The reversal window is decision FD-05. In the demo the
  presenter can record a demo answer in the Wallet decision register first. That is a demo setting,
  not V-Guard's decision.
- **"Can a Super Admin approve?"** No. Approvals always need a Checker, and the Maker can never approve
  their own request.

## 8. Known demo limitations

- The simulation clock starts at 9 Nov 2026 14:30 and advances with real time. It restarts when the
  page reloads.
- Some seeded gift records are dated December 2026, after the simulation clock. They appear under
  *All events* in the timeline.
- Demo data is per browser tab. A new tab starts a separate demo.
- Speed Insights shows a 404 in the console outside Vercel; this is harmless.
