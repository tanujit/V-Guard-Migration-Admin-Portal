# Phase 4 — Master Data Management and Scanning Configuration

Completion report and developer handover. Everything runs in the browser on **development data**:

- no SFDC synchronisation is connected;
- no V-Guard database is written;
- the mobile QR scanning engine is not connected, so nothing here changes live scan behaviour.

Product and SKU codes carry a `DEV-` prefix because the real code formats are not defined.

## 1. Summary

Phase 4 adds four modules under **Masters & configuration**, plus a landing page:

| Module | Route | What it covers |
| --- | --- | --- |
| Master data overview | `/masters` | 12 KPIs, recent activity, the business confirmation register, master audit log |
| Product & SKU master | `/masters/products` | Directory, 5-step creation, detail tabs A–F, single and bulk operations |
| Category & sub-category | `/masters/categories` | Directories, create/edit, dependency-checked activation/deactivation |
| Branch & hierarchy | `/masters/branches` | Dashboard, tree explorer, branch directory/detail, SFDC sync (mock), data ownership |
| Scanning configuration | `/masters/scanning` | Dashboard, Scan-In/Out points, restriction rule builder, simulator, error & exception settings |

Scanning changes run through the **Phase 3 approval engine**. A change is drafted, validated and submitted to the Approval Centre. A Checker approves it, and the module's execution adapter then activates the new version. Approval and activation stay separate steps, and earlier versions are kept.

## 2. Screens and workflows

**Product & SKU master**

- Directory: one row per SKU, with all the columns from the brief.
- Filters: search by name, product code or SKU code; category, sub-category, programme, branch/region, status, scan-configuration status and warranty.
- Sorting, page size, CSV export and clear-all are included.
- Create product: basics → SKUs → category (from the central master, with a hierarchy preview) → warranty & installation → review. The last step offers Save as draft, Create or Cancel.
- Detail tabs:
  - Overview
  - SKUs: add and edit
  - Branch & region: mapping editor
  - Scan points
  - Warranty & installation
  - History
- Bulk import: template download → upload (or a development sample file) → validate → preview → explicit import mode → summary.
- Import history lists every batch.

**Category & sub-category**

- Directories with counts, search, filters, create/edit drawers and activation/deactivation.
- Deactivation shows the impact before it is attempted: products, SKUs, active scan configurations, live rules and sub-categories.

**Branch & hierarchy**

- Nine hierarchy KPIs, plus the last successful sync time.
- Searchable state → district → branch tree.
- Branch directory and branch detail. Detail shows source, sync, mappings, scan references and history.
- SFDC synchronisation view: latest run, history, conflicts and record-level status. A mock sync can be run.
- Data-ownership settings.

**Scanning configuration**

- Dashboard: 10 KPIs and 5 chart panels.
- Scan point configuration: list, 6-step wizard, and detail with version history. From detail you can propose a change, propose retirement, or resubmit after a return.
- Restriction rules: directory with filters; detail with versions, validation and conflicts; 9-step builder.
- Rule simulator.
- Error & exception settings.

## 3. Product and SKU data model

`src/types/masters.ts`:

- **`Product`:** id, code, name, description, categoryId, subCategoryId, status (active/inactive/draft), warranty `{value | null, unit}`, installationRequired, source, plus created/updated stamps.
- **`Sku`:** id, code, name, productId, status, and programmes. An empty programmes list means "not configured", never "all".
- **`ProductBranchMapping`:** maps a product to a branch. It is portal-maintained, not SFDC data.

There are no price, MRP, stock, tax or margin fields. Code uniqueness is case-insensitive across the master; the official format is open item MDR-08.

## 4. Category structure

`Category` and `SubCategory` have stable IDs. Every sub-category belongs to exactly one category.

- The seed mirrors the dashboard's eight product families: 20 sub-categories, plus one inactive legacy category.
- Product screens pick from this master; nothing is duplicated.
- A sub-category cannot move to another parent while products use it.

## 5. Branch hierarchy architecture

- Names and codes for state → district → branch come from `config/geography.ts`, the SFDC mirror shared with Phases 1–3.
- `HierarchyRecord` adds the portal-side fields: source record ID, status, pincodes, sync status, last sync time and last sync error.
- More levels can be added through `HierarchyLevel`; none were invented.

## 6. SFDC synchronisation abstraction

- **Ownership (`OwnershipSetting`):**
  - Hierarchy defaults to **SFDC managed** (read-only).
  - Pincode mapping defaults to **Business confirmation required** (read-only).
  - "Portal managed" is refused until decision MDR-01 (OP-51 / OP-10) is recorded as Confirmed.
  - Branch edits are refused while the data is not portal-managed, whatever Edit permission the user holds.
- **Sync history (`SyncRun`):** six mock runs, including a timeout failure and partial runs.
- **Mock sync:** reports failures, skips records with open conflicts, and never overwrites portal data.
- **Conflicts (`SyncConflict`):** five representative records, one of each kind: pincode mismatch, parent changed, missing in source, duplicate source record, validation failure.
  - A review records a status and a note.
  - "To be corrected in SFDC" leaves the portal value unchanged.
- SFDC record IDs and error details are shown only to users with Branch & hierarchy: Manage.

## 7. Bulk import validation

`validateImport` checks:

- header columns, required fields and formats;
- duplicates, both within the file and against the master;
- product, category and sub-category references, including a sub-category that belongs to another category;
- allowed values for status, warranty unit, installation flag and programmes.

The preview shows totals and a row-level issue table, and the error report downloads as CSV. The import mode must be chosen explicitly:

- **valid records only:** invalid rows are rejected and reported;
- **all or nothing:** the whole batch is rejected on any error.

## 8. Scan-In / Scan-Out model

A `ScanPointConfig` holds a SKU, programmes and an explicit branch set, plus versioned values (`ScanPointVersion`): scanIn and scanOut (nullable, never defaulted to 0), effective from/to, remarks and an optional retire flag.

Validation rejects:

- inactive SKUs or products;
- programmes the SKU is not eligible for;
- inactive branches;
- negative values, more than 2 decimals, or values above the range;
- no value at all;
- an overlap with another live configuration for the same SKU, branch and programme.

Branches outside the product's mapping produce a warning.

## 9. Scan restriction rule schema

`ScanRule` holds the header: code, name, rule type and scan context. Each `RuleVersion` contains:

- **Scope:** explicit products, SKUs, categories, sub-categories, branches and programmes. "All SKUs" and "all branches" are separate explicit flags; an empty selection never means global.
- **Conditions (`RuleGroup`):** a condition tree; see §10.
- **Time, re-scan and parent-child relations:** settings whose values are nullable.
- **Outcome:** "unconfigured" or "source-defined exception".
- **Justification, deactivation flag and timestamps.**

## 10. AND/OR builder

Condition kinds and their operators are defined in `config/scanCatalogue.ts` (`CONDITIONS`): branch, SKU, sub-category, time, re-scan and parent-child.

The builder renders its controls from that schema:

- AND/OR toggles per group;
- conditions added and removed per group;
- nested groups up to three levels deep;
- values picked from the masters.

The readable IF … AND ( … OR … ) THEN structure is shown in the builder, on rule detail and in the Approval Centre comparison.

## 11. Parent-child relationships

A relationship has a parent SKU, child SKUs, a free-text description from the business, and a `confirmed` flag.

- The flag stays false until MDR-03 is confirmed.
- The meaning and the outcome are not inferred.
- Parent-child conditions reference relationships by ID.

## 12. Validation and conflict detection

`validateRule` covers all 15 checks from the brief and returns **errors**, **warnings** and **information**:

- missing or inactive products, SKUs, categories and branches;
- invalid category/sub-category combinations and missing branch scope;
- empty groups, single-item groups and excessive nesting;
- contradictions, such as disjoint "is one of" lists, or in/not-in on the same value in one AND group;
- incomplete time and re-scan settings;
- broken parent-child links;
- duplicates and overlaps.

**Overlap with a live rule of the same type and scan context is an error.** Precedence is unconfirmed (MDR-04), so the rule cannot be submitted or activated. Overlaps between different types are warnings. Warnings must be acknowledged before submission.

## 13. Approval Engine integration

New request types:

| Request type | Policy |
| --- | --- |
| `scan_rule_create`, `scan_rule_modify`, `scan_rule_deactivate` | **Approval required** (the SOW places them under Maker-Checker) |
| `scan_points_change` | **Business confirmation required**; routed as a safeguard |

Two workflows route them to V-Guard Checkers:

- **WF-010 SCN-RULE** for rule changes;
- **WF-011 SCN-POINTS** for scan-point changes.

The scanning module raises requests through the same entry point as the Phase 3 composer. Each request carries:

- before/after fields, including the readable rule logic;
- impact (affected branches, overlaps);
- the version reference, for example `SRR-0003 v2`.

**Execution:** `registerExecutionHandler("scan-config", …)` connects the Phase 3 execution adapter to the masters store.

- After the final approval the system runs execution automatically.
- The handler re-checks for blocking conflicts with active rules.
- It activates the approved version and supersedes the previous one.
- A failed activation leaves the previous active version in place and is recorded as an execution failure.

Returned requests are corrected in the scanning screens and resubmitted. The approval request keeps v1 and v2 read-only.

## 14. Versioning and audit

Rules and scan-point configurations are versioned. Each version records:

- status: draft, submitted, active, superseded, rejected or withdrawn;
- creator and created time;
- approval request ID;
- activation time.

An active version is never edited in place; a change becomes the next version. Historical versions are read-only and listed on each detail page with their approval link.

`MasterAuditEvent` records:

- audit ID, timestamp, actor and organisation;
- module, entity type and entity ID;
- action, previous and new value;
- reason, approval request ID and reference.

Events are emitted for:

- products, SKUs, categories and sub-categories;
- branch mapping, branch edits, ownership changes;
- sync runs and conflict reviews;
- scan-point and rule creation, versioning, submission, activation, deactivation and retirement;
- imports and decisions.

There is no edit or delete path.

## 15. RBAC and geographical scope

- New RBAC module **`scan-config`** (Scanning configuration).
- Branch & hierarchy gains Edit/Manage. Edit stays subordinate to the ownership setting.
- Every store mutation checks module and action permission, and for branch-bound data, geography through the Phase 2 `hasPermission`.
- Lists and details are filtered by geographical scope.
- New seed access:
  - Rahul: Maker on categories and scan-config.
  - Anita: Checker on scan-config.
  - Joseph: Maker on scan-config, Karnataka only (ASG-0036).

## 16. Scenarios tested (browser and dev-server module calls)

| Scenario | Result |
| --- | --- |
| A — create product and SKU | Rahul created PRD-0025 / DEV-FAN-201-A through the wizard; it appears in the directory, with audit ✔ |
| B — bulk upload | Sample file of 9 rows: 3 valid, 6 invalid (duplicate in file, existing code, sub-category in the wrong category, unknown category, bad status/installation, missing code/bad unit). Valid-only import: 3 imported, 6 rejected, summary IMP-0001 ✔ |
| C — category deactivation | "Fans": impact shown (products, SKUs, 2 active scan configurations, 3 sub-categories); deactivation refused ✔ |
| D — hierarchy visibility | Searched "Coimbatore" → Tamil Nadu › Coimbatore › branch; detail shows source, sync, mappings and history ✔ |
| E — SFDC sync failure | Mock run reports 3 failed and 5 skipped with error details; no record overwritten ✔ |
| F — scan points | Joseph (KA Maker): negative points refused; a valid config for two KA branches was saved and submitted (SPC-0014 → APR-2026-001267) ✔ |
| G — AND/OR rule | SRR-0002 shows Branch AND (SKU OR Sub-category) in the builder and in readable form ✔ |
| H — parent-child | SRR-0004 relationship shown; simulator evaluates it and reports that the outcome needs business configuration ✔ |
| I — rule conflict | Draft SRR-0005 overlaps SRR-0002 (same type): blocking error naming the rule and the precedence gap ✔ |
| J — Maker-Checker | Anita approved SRR-0003 v2 in the Approval Centre after comparing old and new conditions → executed automatically → v2 active, v1 superseded ✔ |
| K — returned rule | SRR-0004 returned by Anita; Rahul limited it to ST and described the relationship; resubmitted. Approval versions v1 and v2 are both locked ✔ |
| L — view-only | Anita: no edit buttons; the builder is denied; a direct store call is refused with "You need Scanning configuration: Create" ✔ |
| M — geographical scope | Joseph sees 5 KA configurations only; SPC-0001 is denied; a direct store call with a Kerala branch is refused ✔ |

All 26 Phase 4 screens rendered in a clean tab with no console errors. The Approval Centre and Dashboard still load. `tsc -b` and `vite build` pass.

### Edge cases (brief §22)

| # | Case | Handling |
| --- | --- | --- |
| 1–2 | Duplicate product/SKU code | Refused (form, store and bulk import) |
| 3–4 | Invalid category or foreign sub-category | Refused |
| 5 | Product deactivated with active SKUs | Refused, listing the SKUs |
| 6 | Category with active dependants | Refused with the impact shown |
| 7 | Branch with scan configurations | Branch deactivation refused while active configurations use it |
| 8 | SKU referenced by rules | Code change and deactivation refused; other edits warn |
| 9 | Mapping to an inactive branch | Refused; inactive branches are disabled in pickers |
| 10–11 | Duplicate or partially invalid bulk upload | Reported per row; explicit mode |
| 12–13 | Conflicting SFDC / pincode | Conflict register; never overwritten |
| 14–15 | Invalid points / overlapping configurations | Refused |
| 16–17 | Empty group / contradictions | Errors |
| 18 | Missing parent/child | Error |
| 19 | Overlapping rules | Same type blocks; other types warn |
| 20 | Change while an older version is active | New version; old one stays active until execution |
| 21–22 | Unapproved change / activation without approval | Only the approval execution adapter activates |
| 23 | Editing SFDC-managed data | Refused with the ownership reason |
| 24 | Out-of-scope master change | Refused in the store |
| 25 | Change affecting many configurations | Category change warns and names the affected rules; nothing changed silently |

### Acceptance criteria (brief §24)

1–28 are met as described above. Two qualifications:

- **#20 Simulation** is a labelled development preview, not the production engine.
- **#26 Existing functionality:** the Dashboard, Approval Centre and User directory load cleanly. Deeper Phase 2 flows were not re-run.

## 17. Open business decisions

These are listed under **Master data overview → Decision register**. Each has status Open, Under review, Confirmed, Deferred or Out of scope.

1. **MDR-01 (OP-51 / OP-10):** Is the pincode and hierarchy data portal-editable, or SFDC-managed?
2. **MDR-02:** What are the time windows and re-scan thresholds?
3. **MDR-03:** What does a parent-child relationship mean, and what is its scan outcome?
4. **MDR-04:** What is the rule precedence for overlaps?
5. **MDR-05:** What is the error/exception catalogue?
6. **MDR-06:** Do product/SKU master changes need approval? They are currently direct and audited.
7. **MDR-07:** Does every scan-point change need approval? Changes are currently routed as a safeguard.
8. **MDR-08:** What are the official code formats?

## 18. Known limitations

- Browser-only state (`sessionStorage`, per tab). Every rule above must be enforced again on the backend.
- The error/exception catalogue is empty, so rule outcomes stay "not configured". No codes were invented.
- Time-window and re-scan values are blank in every seeded rule, pending confirmation.
- The simulator is a mock evaluator.
- Scan-point scope (SKU, branches, programmes) is fixed once a configuration is created; a new scope means a new configuration.
- A rule that is resubmitted after a return updates the same master version. The approval request holds the v1/v2 snapshots.
- Some flows were exercised through the store functions the screens call, rather than by clicking: the scan-point wizard submit (F) and the returned-rule correction (K). The builder and wizard screens were checked visually up to their review steps.
- The main JS bundle is 827 kB. Route-level code splitting is a follow-up. The masters store must stay eagerly loaded, because it registers the execution handler.
- Programme tags in the product directory wrap onto several lines in narrow columns.

## 19. API contracts

`src/services/masterDataApi.ts` defines the `MasterDataApi` contract:

- `getProducts`, `createProduct`, `updateProduct`
- `getSkus`, `saveSku`
- `getCategories`, `getSubCategories`
- `getBranchHierarchy`, `getHierarchySyncHistory`
- `getScanPointConfigurations`, `saveScanPointConfiguration`
- `getScanRestrictionRules`, `validateScanRestrictionRule`, `simulateScanRestrictionRule`
- `submitConfigurationForApproval`, `processBulkImport`

It has a mock implementation and an HTTP implementation that throws `ApiNotConnectedError`. No endpoints are defined.

## 20. Screenshots

Files are in `docs/screenshots/phase-4/`, captured at 1440 px:

- overview KPIs;
- product directory;
- product created in scenario A;
- hierarchy explorer search;
- AND/OR rule builder.

Further screenshots could not be captured after a pane restart: the app window was hidden. The other flows were verified through page text and module calls, as listed in §16.

## Files

- **Models and config:**
  - `src/types/masters.ts`
  - `src/config/scanCatalogue.ts`
  - `src/data/mock/masterSeed.ts`
- **Engine and store:**
  - `src/features/masters/engine.ts`, `store.ts`, `seed.ts`
  - `src/services/masterDataApi.ts`
- **Screens:**
  - `src/pages/masters/` (`shared`, `OverviewPage`, `ProductsPage`, `ImportPage`, `CategoriesPage`, `BranchesPage`, `ScanningPage`, `RulesPage`)
  - `src/styles/masters.css`
- **Touched:**
  - `App.tsx` (routes)
  - `navigation.ts` (overview and scanning items; exact-match flag)
  - `Sidebar.tsx`, `Header.tsx` (longest-path breadcrumb)
  - `rbacCatalogue.ts`, `rbacSeed.ts`
  - `approvalCatalogue.ts`, `approvalSeed.ts` (WF-010/011, policies)
  - `approvals/execution.ts` (handler registry)
  - `approvals/store.ts` (auto-execution)
  - `approvals/scenarios.ts` (seeded scanning requests)
  - store keys bumped to reseed
