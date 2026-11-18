import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Award, Download, Eye, Image, Megaphone, PlusCircle, Send, Upload, Users } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Overlay";
import { Checkbox, MultiSelect, SelectInput, Tabs, TextArea, TextField } from "@/components/form/Form";
import { RankedBars } from "@/components/ui/DataBars";
import { useToast } from "@/context/ToastContext";
import { BONUS_TYPE, CAMPAIGN_TYPE, GAME_KIND, LUCKY_DRAW_EXCLUDED_STATES, REFERRAL_RELATIONSHIP } from "@/config/schemeCatalogue";
import { findBranch } from "@/config/geography";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { campaignStates, emptyBranches, rewardText, validateBonus, validateCampaign, validateGame } from "@/features/schemes/engine";
import { accessContestPhoto, requestBackendRedemption, reviewContestEntry, saveBonus, saveCampaign, saveGame, saveReferralRule, saveTier, submitBonus, submitCampaign, submitGame, submitGiftBatch, submitReferralRule, submitTier, triggerWinnerBanner, uploadGiftBatch } from "@/features/schemes/store";
import type { Bonus, BonusType, Campaign, CampaignType, ContestEntry, GameConfig, GameKind, ReferralRecord, ReferralRelationship, ReferralRule, RewardDef, Tier, TierSnapshot } from "@/types/schemes";
import { ApprovalLink, branchOptions, KpiGrid, stateOptions, ValidationList } from "@/pages/masters/shared";
import { PolicyMessages, SectionTitle } from "@/pages/users/shared";
import { Notice } from "@/pages/approvals/shared";
import { SchemeAuditTable } from "./SchemeDetailPage";
import { BlockerList, DecisionRef, DevValue, KV, RecordStatus, pts, useSchemeView, type SchemeView } from "./shared";

const PROGRAMMES = ["EP", "ST", "CS", "Retailer", "DD"];
type Res = { ok: boolean; errors: string[]; warnings: string[]; id?: string } | null;
const toNum = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
const csvList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const approval = (v: SchemeView, id: string | null) => (id ? v.approvals.requests.find((r) => r.id === id) : undefined);

function RewardFields({ value, onChange, v }: { value: RewardDef; onChange: (r: RewardDef) => void; v: SchemeView }) {
  return (
    <div className="form-grid form-grid--2">
      <SelectInput label="Reward method" value={value.kind} onChange={(k) => onChange({ kind: k as RewardDef["kind"], value: k === "business_formula" ? null : value.value, formulaId: k === "business_formula" ? value.formulaId ?? "FRM-REF" : null })} options={[{ value: "fixed_points", label: "Fixed points (explicit)" }, { value: "points_per_unit", label: "Points per unit (explicit)" }, { value: "business_formula", label: "Business formula (registry)" }]} />
      {value.kind === "business_formula" ? <SelectInput label="Formula" value={value.formulaId ?? ""} onChange={(f) => onChange({ ...value, formulaId: f })} options={v.s.formulas.map((f) => ({ value: f.id, label: `${f.id} · ${f.status}` }))} /> : <TextField label="Points" value={value.value == null ? "" : String(value.value)} onChange={(x) => onChange({ ...value, value: toNum(x) })} inputMode="numeric" hint="No default" />}
    </div>
  );
}

/* ======================= Tiers ======================= */

export function TiersPage() {
  const v = useSchemeView();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const [edit, setEdit] = useState<Tier | null>(null);
  const [result, setResult] = useState<Res>(null);
  const [prog, setProg] = useState("EP");
  const tiers = v.s.tiers.filter((t) => t.programme === prog).sort((a, b) => a.rank - b.rank);
  const snaps = v.s.tierSnapshots.filter((x) => x.programme === prog);
  const run = (r: Res, ok: string) => { setResult(r); if (r?.ok) notify(ok, "positive"); return r; };
  const blank = (): Tier => ({ id: "", code: "", name: "", description: "", programme: prog, rank: tiers.length + 1, threshold: null, thresholdBasis: null, qualification: "", validity: "", branchConfigs: [], benefits: [], status: "draft", version: 1, approvalRequestId: null, updatedBy: v.uid, updatedAt: "" });
  return (
    <>
      <SectionTitle title="Tier management" description="SOW 6.3 / 10.6. Bronze to Diamond are SOW examples; V-Guard's tier master is not assumed" actions={<div className="btn-row"><SelectInput label="Programme" value={prog} onChange={setProg} options={PROGRAMMES.map((p) => ({ value: p, label: p }))} />{v.canOn("tiers", "create", [prog]) && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(blank())}><PlusCircle size={14} aria-hidden="true" />New tier</button>}</div>} />
      <PolicyMessages result={result} />
      <Tabs label="Tier sections" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: "overview", label: "Overview" }, { id: "config", label: "Tier configuration" }, { id: "benefits", label: "Tier benefits" }, { id: "branches", label: "Branch-wise mapping" }, { id: "history", label: "Change history" }]} />
      {tab === "overview" && (
        <>
          <KpiGrid cols={4} items={[
            { id: "t", label: "Tiers configured", value: tiers.length, desc: `${tiers.filter((t) => t.status === "active").length} active`, variant: "primary", icon: Award, onSelect: () => setParams({ tab: "config" }) },
            { id: "m", label: "Members in tiers", value: snaps.reduce((n, x) => n + x.members, 0), desc: "Mock tier service snapshot", variant: "light", icon: Users, onSelect: () => setParams({ tab: "branches" }) },
            { id: "n", label: "Near the next tier", value: snaps.reduce((n, x) => n + x.nearNext, 0), desc: "As reported by the tier service", variant: "light", icon: Users, onSelect: () => setParams({ tab: "branches" }) },
            { id: "c", label: "Tier changes (30 days)", value: snaps.reduce((n, x) => n + x.upgrades30d + x.downgrades30d, 0), desc: `${snaps.reduce((n, x) => n + x.upgrades30d, 0)} up · ${snaps.reduce((n, x) => n + x.downgrades30d, 0)} down`, variant: "light", icon: Users, onSelect: () => setParams({ tab: "history" }) },
          ]} />
          <Notice tone="info">Tier counts come from a development snapshot of a tier service that is not connected. This portal configures tiers; it does not calculate tier membership (no tier rule is invented).</Notice>
          <div className="grid-2">
            <Panel level={3} title="Tier distribution"><RankedBars items={tiers.map((t) => ({ key: t.id, label: t.name, value: snaps.filter((x) => x.tierId === t.id).reduce((n, x) => n + x.members, 0) }))} /></Panel>
            <Panel level={3} title="Branch-wise distribution" padded={false}><DataTable rows={Array.from(new Set(snaps.map((x) => x.branchCode))).map((b) => ({ b, rows: snaps.filter((x) => x.branchCode === b) }))} rowKey={(r) => r.b} caption="Branch distribution" pageSize={6} columns={[{ key: "b", header: "Branch", value: (r) => findBranch(r.b)?.branch.name ?? r.b }, ...tiers.slice(0, 4).map((t) => ({ key: t.id, header: t.name, align: "right" as const, value: (r: { rows: TierSnapshot[] }) => r.rows.find((x) => x.tierId === t.id)?.members ?? 0 }))] as Column<{ b: string; rows: TierSnapshot[] }>[]} /></Panel>
          </div>
        </>
      )}
      {tab === "config" && (
        <Panel level={3} padded={false}>
          <DataTable rows={tiers} rowKey={(t) => t.id} caption="Tiers" searchable={false} onRowClick={(t) => setEdit(structuredClone(t))} rowActionLabel={(t) => `Edit ${t.name}`} columns={[
            { key: "r", header: "Rank", value: (t) => t.rank },
            { key: "n", header: "Tier", value: (t) => t.name, render: (t) => <span><strong>{t.name}</strong> <span className="mono small">{t.code}</span></span> },
            { key: "th", header: "Threshold", align: "right", value: (t) => t.threshold ?? -1, render: (t) => t.threshold == null ? <span className="warn-text small">Not configured</span> : <span className="num">{pts(t.threshold)} <DevValue /></span> },
            { key: "q", header: "Qualification", value: (t) => t.qualification, render: (t) => <span className="small cell-wrap">{t.qualification || "—"}</span> },
            { key: "val", header: "Validity", value: (t) => t.validity },
            { key: "b", header: "Benefits", value: (t) => t.benefits.length },
            { key: "st", header: "Status", value: (t) => t.status, render: (t) => <RecordStatus status={t.status} /> },
            { key: "ap", header: "Approval", value: (t) => t.approvalRequestId ?? "", render: (t) => <ApprovalLink request={approval(v, t.approvalRequestId)} /> },
          ] as Column<Tier>[]} />
        </Panel>
      )}
      {tab === "benefits" && (
        <Panel level={3} title="Tier benefits" subtitle="Sent to the member app through the integration contract (not connected)" padded={false}>
          <DataTable rows={tiers.flatMap((t) => t.benefits.map((b) => ({ ...b, tier: t.name, status: t.status })))} rowKey={(b) => b.id} caption="Benefits" searchable={false} emptyTitle="No benefits" columns={[
            { key: "t", header: "Tier", value: (b) => b.tier },
            { key: "n", header: "Benefit", value: (b) => b.name },
            { key: "d", header: "Description", value: (b) => b.description },
            { key: "e", header: "Eligibility", value: (b) => b.eligibility },
            { key: "r", header: "Redeem-up-to messaging", value: (b) => b.redeemUpTo, render: (b) => <span className="small">{b.redeemUpTo}</span> },
            { key: "br", header: "Branches", value: (b) => (b.branchCodes === "all" ? "All" : b.branchCodes.join(", ")) },
            { key: "v", header: "Validity", value: (b) => b.validity },
          ] as Column<Tier["benefits"][number] & { tier: string; status: string }>[]} />
        </Panel>
      )}
      {tab === "branches" && (
        <>
          <Notice tone="warn">Branch-specific thresholds and branch-specific valuation are configured separately. Whether valuation may differ by branch is open (<DecisionRef id="OP-07" />): valuation is never applied, and tier thresholds are never mixed with wallet point valuation.</Notice>
          <Panel level={3} padded={false}>
            <DataTable rows={tiers.flatMap((t) => t.branchConfigs.map((b) => ({ ...b, tier: t.name, base: t.threshold })))} rowKey={(r) => `${r.tier}-${r.branchCode}`} caption="Branch tier mapping" searchable={false} emptyTitle="No branch-specific configuration" columns={[
              { key: "t", header: "Tier", value: (r) => r.tier },
              { key: "b", header: "Branch", value: (r) => findBranch(r.branchCode)?.branch.name ?? r.branchCode },
              { key: "base", header: "Standard threshold", align: "right", value: (r) => r.base ?? -1, render: (r) => <span className="num">{pts(r.base)}</span> },
              { key: "th", header: "Branch threshold", align: "right", value: (r) => r.threshold ?? -1, render: (r) => <span className="num">{pts(r.threshold)}</span> },
              { key: "val", header: "Branch valuation (OP-07)", value: (r) => r.valuation.note, render: (r) => <span className="small">{r.valuation.configured ? "Recorded, not applied" : "Not configured"} · {r.valuation.note}</span> },
            ] as Column<Tier["branchConfigs"][number] & { tier: string; base: number | null }>[]} />
          </Panel>
        </>
      )}
      {tab === "history" && <SchemeAuditTable rows={v.s.audit.filter((a) => a.entity === "tier")} v={v} name="tier-history" />}
      {edit && <TierDrawer tier={edit} v={v} onClose={() => setEdit(null)} run={run} />}
    </>
  );
}

function TierDrawer({ tier, v, onClose, run }: { tier: Tier; v: SchemeView; onClose: () => void; run: (r: Res, ok: string) => Res }) {
  const [t, setT] = useState(tier);
  const locked = t.status === "pending_approval";
  const save = () => { const r = run(saveTier(v.uid, t), "Tier saved as draft"); if (r?.ok) onClose(); };
  const submit = () => { const s = saveTier(v.uid, t); if (!s.ok) { run(s, ""); return; } const r = run(submitTier(v.uid, s.id!), "Tier submitted for approval"); if (r?.ok) onClose(); };
  return (
    <Drawer open onClose={onClose} width={640} title={t.id ? `Tier ${t.name}` : "New tier"} subtitle={locked ? "Pending approval: read-only" : "Draft until approved through WF-016"} footer={!locked && <div className="btn-row"><button type="button" className="btn btn--secondary" onClick={save}>Save draft</button>{v.canOn("tiers", "submit", [t.programme]) && <button type="button" className="btn btn--primary" onClick={submit}><Send size={14} aria-hidden="true" />Submit</button>}</div>}>
      <div className="form-grid form-grid--2">
        <TextField label="Tier name" value={t.name} onChange={(x) => setT({ ...t, name: x })} />
        <TextField label="Tier code" value={t.code} onChange={(x) => setT({ ...t, code: x.toUpperCase() })} />
        <TextField label="Rank" value={String(t.rank)} onChange={(x) => setT({ ...t, rank: toNum(x) ?? t.rank })} inputMode="numeric" />
        <TextField label="Threshold" value={t.threshold == null ? "" : String(t.threshold)} onChange={(x) => setT({ ...t, threshold: toNum(x), thresholdBasis: "points" })} inputMode="numeric" hint="No default" />
      </div>
      <TextArea label="Description" value={t.description} onChange={(x) => setT({ ...t, description: x })} />
      <TextField label="Qualification criteria" value={t.qualification} onChange={(x) => setT({ ...t, qualification: x })} />
      <TextField label="Validity period" value={t.validity} onChange={(x) => setT({ ...t, validity: x })} />
      <h4 className="cfg-sub">Benefits</h4>
      {t.benefits.map((b, i) => (
        <div key={b.id} className="form-grid form-grid--2">
          <TextField label="Benefit" value={b.name} onChange={(x) => setT({ ...t, benefits: t.benefits.map((y, j) => (j === i ? { ...y, name: x } : y)) })} />
          <TextField label="Redeem-up-to messaging" value={b.redeemUpTo} onChange={(x) => setT({ ...t, benefits: t.benefits.map((y, j) => (j === i ? { ...y, redeemUpTo: x } : y)) })} />
        </div>
      ))}
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setT({ ...t, benefits: [...t.benefits, { id: `TB-${Date.now() % 10000}`, name: "", description: "", eligibility: "Members holding this tier", branchCodes: "all", redeemUpTo: "", validity: "While the tier is held" }] })}><PlusCircle size={14} aria-hidden="true" />Add benefit</button>
      <h4 className="cfg-sub">Branch-specific thresholds (valuation separate, OP-07)</h4>
      {t.branchConfigs.map((b, i) => (
        <div key={b.branchCode} className="form-grid form-grid--3">
          <p className="small">{findBranch(b.branchCode)?.branch.name}</p>
          <TextField label="Threshold" value={b.threshold == null ? "" : String(b.threshold)} onChange={(x) => setT({ ...t, branchConfigs: t.branchConfigs.map((y, j) => (j === i ? { ...y, threshold: toNum(x) } : y)) })} inputMode="numeric" />
          <TextField label="Valuation note (not applied)" value={b.valuation.note} onChange={(x) => setT({ ...t, branchConfigs: t.branchConfigs.map((y, j) => (j === i ? { ...y, valuation: { configured: !!x.trim(), note: x } } : y)) })} />
        </div>
      ))}
      <MultiSelect label="Add branch-specific configuration" options={branchOptions()} value={t.branchConfigs.map((b) => b.branchCode)} onChange={(codes) => setT({ ...t, branchConfigs: codes.map((c) => t.branchConfigs.find((b) => b.branchCode === c) ?? { branchCode: c, threshold: null, valuation: { configured: false, note: "OP-07: valuation by branch not confirmed" } }) })} />
    </Drawer>
  );
}

/* ======================= Referrals ======================= */

export function ReferralsPage() {
  const v = useSchemeView();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const [edit, setEdit] = useState<ReferralRule | null>(null);
  const [result, setResult] = useState<Res>(null);
  const run = (r: Res, ok: string) => { setResult(r); if (r?.ok) notify(ok, "positive"); return r; };
  const rules = v.s.referralRules;
  const recs = v.s.referrals;
  return (
    <>
      <SectionTitle title="Referral management" description="SOW 6.4. Active logics: Influencer → Influencer, Retailer → EP, Retailer → ST. Retailer → Consumer is reserved for the future" actions={v.can("referrals:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit({ id: "", name: "", relationship: "influencer_influencer", referrerProgrammes: ["EP"], referredProgramme: "EP", branchScope: { ...emptyBranches(), allBranches: true }, eligibility: "", trigger: null, reward: { kind: "business_formula", value: null, formulaId: "FRM-REF" }, settlementBucket: "referral_unsettled", status: "draft", approvalRequestId: null, updatedBy: v.uid, updatedAt: "" })}><PlusCircle size={14} aria-hidden="true" />New referral rule</button>} />
      <Notice tone="warn">Referral mechanics are open (<DecisionRef id="OP-REF1" />). Rules can be configured and tracked but none can be activated, and no referral reward is calculated.</Notice>
      <PolicyMessages result={result} />
      <Tabs label="Referral sections" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: "overview", label: "Overview" }, { id: "rules", label: "Referral rules" }, { id: "relationships", label: "Relationships" }, { id: "tracking", label: "Referral tracking" }, { id: "rewards", label: "Reward configuration" }, { id: "settlement", label: "Settlement summary" }]} />
      {tab === "overview" && (
        <>
          <KpiGrid cols={4} items={[
            { id: "r", label: "Referral rules", value: rules.length, desc: `${rules.filter((r) => r.status === "active").length} active`, variant: "primary", icon: Users, onSelect: () => setParams({ tab: "rules" }) },
            { id: "j", label: "Referral journeys", value: recs.length, desc: "Captured referrals (development data)", variant: "light", icon: Users, onSelect: () => setParams({ tab: "tracking" }) },
            { id: "f", label: "Flagged by checks", value: recs.filter((r) => r.checks.some((c) => c.result === "flag")).length, desc: "For review; never auto-rejected", variant: "status", tone: "warning", icon: Users, onSelect: () => setParams({ tab: "tracking" }) },
            { id: "b", label: "Rewards blocked", value: recs.filter((r) => r.reward === "blocked").length, desc: "Pending OP-REF1", variant: "status", tone: "negative", icon: Users, onSelect: () => setParams({ tab: "tracking" }) },
          ]} />
          <Panel level={3} title="Referrals by relationship"><RankedBars items={(Object.keys(REFERRAL_RELATIONSHIP) as ReferralRelationship[]).map((k) => ({ key: k, label: REFERRAL_RELATIONSHIP[k].label, value: recs.filter((r) => rules.find((x) => x.id === r.ruleId)?.relationship === k).length }))} /></Panel>
        </>
      )}
      {tab === "rules" && (
        <Panel level={3} padded={false}>
          <DataTable rows={rules} rowKey={(r) => r.id} caption="Referral rules" searchable={false} onRowClick={(r) => setEdit(structuredClone(r))} columns={[
            { key: "id", header: "Rule", value: (r) => r.id, render: (r) => <span><span className="mono small">{r.id}</span> {r.name}</span> },
            { key: "rel", header: "Relationship", value: (r) => REFERRAL_RELATIONSHIP[r.relationship].label },
            { key: "tr", header: "Trigger", value: (r) => r.trigger ?? "", render: (r) => r.trigger ? r.trigger.replace(/_/g, " ") : <span className="warn-text small">Not selected</span> },
            { key: "rw", header: "Reward", value: (r) => rewardText(r.reward, v.s) },
            { key: "bk", header: "Settlement bucket", value: () => "Referral (separate)" },
            { key: "st", header: "Status", value: (r) => r.status, render: (r) => <RecordStatus status={r.status} /> },
            { key: "act", header: "", value: () => "", render: (r) => r.status === "draft" && <button type="button" className="btn btn--secondary btn--xs" onClick={(e) => { e.stopPropagation(); run(submitReferralRule(v.uid, r.id), "Submitted"); }}>Submit</button> },
          ] as Column<ReferralRule>[]} />
        </Panel>
      )}
      {tab === "relationships" && (
        <Panel level={3} padded={false}>
          <DataTable rows={Object.entries(REFERRAL_RELATIONSHIP)} rowKey={([k]) => k} caption="Referral relationships" searchable={false} columns={[
            { key: "l", header: "Relationship", value: ([, r]) => r.label },
            { key: "rr", header: "Referrer", value: ([, r]) => r.referrer.join(", ") },
            { key: "rd", header: "Referred", value: ([, r]) => r.referred },
            { key: "s", header: "Scope", value: ([, r]) => (r.active ? "Active logic (SOW)" : "Future: reserved, not activated"), render: ([, r]) => r.active ? <span className="small">Active logic per SOW; mechanics pending OP-REF1</span> : <span className="small warn-text">Future · inactive unless V-Guard confirms scope</span> },
          ] as Column<[string, (typeof REFERRAL_RELATIONSHIP)[ReferralRelationship]]>[]} />
        </Panel>
      )}
      {tab === "tracking" && (
        <Panel level={3} title="Referral journeys" subtitle="Anti-fraud checks flag for review; no thresholds or new eligibility conditions are invented" padded={false}>
          <DataTable rows={recs} rowKey={(r) => r.id} caption="Referral tracking" exportName={v.can("referrals:export") ? "referrals" : undefined} columns={[
            { key: "id", header: "Reference", value: (r) => r.id, render: (r) => <span className="mono small">{r.id}</span> },
            { key: "rr", header: "Referrer", value: (r) => r.referrerId, render: (r) => <span className="small">{r.referrerId} · {r.referrerProgramme}</span> },
            { key: "rd", header: "Referred", value: (r) => r.referredId, render: (r) => <span className="small">{r.referredId} · {r.referredProgramme}</span> },
            { key: "d", header: "Date", value: (r) => r.date },
            { key: "reg", header: "Registration", value: (r) => r.registration },
            { key: "kyc", header: "KYC", value: (r) => r.kyc },
            { key: "q", header: "Qualification", value: (r) => r.qualification, render: (r) => <RecordStatus status={r.qualification} /> },
            { key: "rw", header: "Reward", value: (r) => r.reward, render: (r) => <RecordStatus status={r.reward} /> },
            { key: "s", header: "Settlement", value: (r) => r.settlement.replace(/_/g, " ") },
            { key: "c", header: "Checks", value: (r) => r.checks.filter((c) => c.result === "flag").length, render: (r) => r.checks.some((c) => c.result === "flag") ? <span className="warn-text small" title={r.checks.filter((c) => c.result === "flag").map((c) => c.detail).join("; ")}>{r.checks.filter((c) => c.result === "flag").map((c) => c.detail).join("; ")}</span> : <span className="small muted">All passed</span> },
          ] as Column<ReferralRecord>[]} />
        </Panel>
      )}
      {tab === "rewards" && (
        <Panel level={3} title="Referral reward configuration" padded={false}>
          <DataTable rows={rules} rowKey={(r) => r.id} caption="Referral rewards" searchable={false} columns={[
            { key: "n", header: "Rule", value: (r) => r.name },
            { key: "rw", header: "Reward", value: (r) => rewardText(r.reward, v.s) },
            { key: "t", header: "Qualification stage", value: (r) => r.trigger?.replace(/_/g, " ") ?? "Not selected" },
            { key: "b", header: "Bucket", value: () => "Referral settlement bucket (never merged with Base or scheme points)" },
          ] as Column<ReferralRule>[]} />
        </Panel>
      )}
      {tab === "settlement" && (
        <Panel level={3} title="Referral settlement summary">
          <KV rows={[["Referral rewards accrued", "0 points: no referral rule is active (OP-REF1)"], ["Pending settlement", "0"], ["Released", "0"], ["Bucket", "Referral settlement buckets are separate from Base Points and scheme settlement"]]} />
        </Panel>
      )}
      {edit && <ReferralDrawer rule={edit} v={v} onClose={() => setEdit(null)} run={run} />}
    </>
  );
}

function ReferralDrawer({ rule, v, onClose, run }: { rule: ReferralRule; v: SchemeView; onClose: () => void; run: (r: Res, ok: string) => Res }) {
  const [r, setR] = useState(rule);
  const save = () => { const x = run(saveReferralRule(v.uid, r), "Referral rule saved"); if (x?.ok) onClose(); };
  return (
    <Drawer open onClose={onClose} width={600} title={r.id ? `Referral rule ${r.id}` : "New referral rule"} subtitle="Draft; activation blocked by OP-REF1" footer={<button type="button" className="btn btn--primary" onClick={save}>Save draft</button>}>
      <TextField label="Name" value={r.name} onChange={(x) => setR({ ...r, name: x })} />
      <SelectInput label="Relationship" value={r.relationship} onChange={(x) => { const rel = REFERRAL_RELATIONSHIP[x as ReferralRelationship]; setR({ ...r, relationship: x as ReferralRelationship, referrerProgrammes: rel.referrer, referredProgramme: rel.referred as ReferralRule["referredProgramme"] }); }} options={(Object.keys(REFERRAL_RELATIONSHIP) as ReferralRelationship[]).map((k) => ({ value: k, label: REFERRAL_RELATIONSHIP[k].label }))} />
      <TextField label="Eligibility rule" value={r.eligibility} onChange={(x) => setR({ ...r, eligibility: x })} hint="Describe the confirmed rule; none is assumed" />
      <SelectInput label="Trigger / qualification stage" value={r.trigger ?? ""} onChange={(x) => setR({ ...r, trigger: (x || null) as ReferralRule["trigger"] })} options={[{ value: "", label: "Not selected" }, { value: "registration_approved", label: "Registration approved" }, { value: "kyc_completed", label: "KYC completed" }, { value: "first_qualifying_scan", label: "First qualifying scan" }]} />
      <RewardFields value={r.reward} onChange={(x) => setR({ ...r, reward: x })} v={v} />
      <Checkbox label="All branches" checked={r.branchScope.allBranches} onChange={(x) => setR({ ...r, branchScope: { ...r.branchScope, allBranches: x } })} />
    </Drawer>
  );
}

/* ======================= Campaigns & contests ======================= */

export function CampaignsPage() {
  const v = useSchemeView();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const [edit, setEdit] = useState<Campaign | null>(null);
  const [result, setResult] = useState<Res>(null);
  const run = (r: Res, ok: string) => { setResult(r); if (r?.ok) notify(ok, "positive"); return r; };
  const camps = v.s.campaigns.filter((c) => c.programmes.some((p) => v.canOn("campaigns", "view", [p])));
  const blank = (type: CampaignType = "scan_bonus"): Campaign => ({ id: "", code: "", name: "", description: "", type, programmes: [], allStates: false, stateCodes: [], branchCodes: [], targeting: [], start: v.today, end: v.today, budget: null, reward: { kind: "fixed_points", value: null, formulaId: null }, rewardNote: "", foc: type === "foc" ? { variant: "same_sku", qualifyingSkuIds: [], rewardSkuId: null, giftName: "", qualifyingQty: null, rewardQty: null, formulaId: null } : null, status: "draft", approvalRequestId: null, updatedBy: v.uid, updatedAt: "" });
  return (
    <>
      <SectionTitle title="Campaigns & contests" description="SOW 6.5. Campaigns reuse the scheme engine's targeting and budget model" actions={v.can("campaigns:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(blank())}><PlusCircle size={14} aria-hidden="true" />Create campaign</button>} />
      <PolicyMessages result={result} />
      <Tabs label="Campaign sections" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: "overview", label: "Overview" }, { id: "directory", label: "Campaign directory" }, { id: "contest", label: "Display contest" }, { id: "foc", label: "FOC / Buy-X-Get-Y" }, { id: "performance", label: "Performance" }]} />
      {tab === "overview" && (
        <>
          <KpiGrid cols={4} items={[
            { id: "a", label: "Campaigns", value: camps.length, desc: `${camps.filter((c) => c.status === "active").length} active`, variant: "primary", icon: Megaphone, onSelect: () => setParams({ tab: "directory" }) },
            { id: "s", label: "Scheduled", value: camps.filter((c) => c.status === "scheduled").length, desc: "Published, not started", variant: "light", icon: Megaphone, onSelect: () => setParams({ tab: "directory" }) },
            { id: "d", label: "Draft or blocked", value: camps.filter((c) => c.status === "draft").length, desc: "Includes campaigns waiting on decisions", variant: "light", icon: Megaphone, onSelect: () => setParams({ tab: "directory" }) },
            { id: "e", label: "Contest entries", value: v.s.contestEntries.length, desc: `${v.s.contestEntries.filter((e) => e.status === "winner").length} winners`, variant: "light", icon: Image, onSelect: () => setParams({ tab: "contest" }) },
          ]} />
          <Notice tone="info">Lucky Draw is excluded in Tamil Nadu under the Lottery Act (SOW 6.5). Validation refuses any Lucky Draw whose geography includes Tamil Nadu, including "All states", for every role.</Notice>
          <Panel level={3} title="Campaigns by type"><RankedBars items={(Object.keys(CAMPAIGN_TYPE) as CampaignType[]).map((k) => ({ key: k, label: CAMPAIGN_TYPE[k].label, value: camps.filter((c) => c.type === k).length }))} /></Panel>
        </>
      )}
      {tab === "directory" && (
        <Panel level={3} padded={false}>
          <DataTable rows={camps} rowKey={(c) => c.id} caption="Campaigns" onRowClick={(c) => setEdit(structuredClone(c))} columns={[
            { key: "id", header: "Campaign", value: (c) => c.name, render: (c) => <span><span className="mono small">{c.id}</span> <strong>{c.name}</strong></span> },
            { key: "t", header: "Type", value: (c) => CAMPAIGN_TYPE[c.type].label },
            { key: "p", header: "Programmes", value: (c) => c.programmes.join(", ") },
            { key: "g", header: "Geography", value: (c) => (c.allStates ? "All states" : campaignStates(c).join(", ")) },
            { key: "per", header: "Period", value: (c) => c.start, render: (c) => <span className="small num">{c.start} → {c.end}</span> },
            { key: "v", header: "Validation", value: (c) => validateCampaign(v.s, c).errors.length + validateCampaign(v.s, c).blockers.length, render: (c) => { const x = validateCampaign(v.s, c); return x.errors.length ? <span className="neg small">{x.errors[0]}</span> : x.blockers.length ? <span className="warn-text small">{x.blockers[0].ref}</span> : <span className="small muted">OK</span>; } },
            { key: "st", header: "Status", value: (c) => c.status, render: (c) => <RecordStatus status={c.status} /> },
            { key: "ap", header: "Approval", value: (c) => c.approvalRequestId ?? "", render: (c) => <ApprovalLink request={approval(v, c.approvalRequestId)} /> },
          ] as Column<Campaign>[]} />
        </Panel>
      )}
      {tab === "contest" && <ContestTab v={v} run={run} />}
      {tab === "foc" && <FocTab v={v} run={run} />}
      {tab === "performance" && (
        <Panel level={3} title="Campaign performance" subtitle="Campaign rewards are not calculated by the mock engine in this phase; figures shown are configuration and activity counts" padded={false}>
          <DataTable rows={camps} rowKey={(c) => c.id} caption="Campaign performance" exportName={v.can("campaigns:export") ? "campaign-performance" : undefined} columns={[
            { key: "n", header: "Campaign", value: (c) => c.name },
            { key: "st", header: "Status", value: (c) => c.status, render: (c) => <RecordStatus status={c.status} /> },
            { key: "b", header: "Budget", align: "right", value: (c) => c.budget ?? 0, render: (c) => <span className="num">{v.financial ? pts(c.budget) : "•••"}</span> },
            { key: "e", header: "Entries / gifts", align: "right", value: (c) => v.s.contestEntries.filter((e) => e.campaignId === c.id).length + v.s.giftBatches.filter((g) => g.campaignId === c.id).reduce((n, g) => n + g.rows.filter((r) => !r.error).length, 0) },
            { key: "r", header: "Backend redemptions", align: "right", value: (c) => v.s.backendRedemptions.filter((x) => x.campaignId === c.id).length },
            { key: "acc", header: "Reward accrued", value: () => "Not calculated (no campaign engine connected)" },
          ] as Column<Campaign>[]} />
        </Panel>
      )}
      {edit && <CampaignDrawer campaign={edit} v={v} onClose={() => setEdit(null)} run={run} />}
    </>
  );
}

function CampaignDrawer({ campaign, v, onClose, run }: { campaign: Campaign; v: SchemeView; onClose: () => void; run: (r: Res, ok: string) => Res }) {
  const [c, setC] = useState(campaign);
  const locked = !["draft", "returned", "rejected"].includes(c.status);
  const val = validateCampaign(v.s, c);
  const save = () => { const r = run(saveCampaign(v.uid, c), "Campaign saved"); if (r?.ok) onClose(); };
  const submit = () => { const s = saveCampaign(v.uid, c); if (!s.ok) { run(s, ""); return; } const r = run(submitCampaign(v.uid, s.id!), "Campaign submitted"); if (r?.ok) onClose(); };
  const tnSelected = c.type === "lucky_draw" && campaignStates(c).some((x) => LUCKY_DRAW_EXCLUDED_STATES.includes(x));
  return (
    <Drawer open onClose={onClose} width={680} title={c.id ? `${c.id} · ${c.name}` : "Create campaign"} subtitle={locked ? `${c.status.replace(/_/g, " ")}: read-only` : "Draft; publication goes through WF-018"} footer={!locked && <div className="btn-row"><button type="button" className="btn btn--secondary" onClick={save}>Save draft</button>{v.canOn("campaigns", "submit", c.programmes) && <button type="button" className="btn btn--primary" onClick={submit}><Send size={14} aria-hidden="true" />Submit for publication</button>}</div>}>
      <div className="form-grid form-grid--2">
        <TextField label="Campaign name" value={c.name} onChange={(x) => setC({ ...c, name: x })} />
        <SelectInput label="Campaign type" value={c.type} onChange={(x) => setC({ ...c, type: x as CampaignType, foc: x === "foc" ? c.foc ?? { variant: "same_sku", qualifyingSkuIds: [], rewardSkuId: null, giftName: "", qualifyingQty: null, rewardQty: null, formulaId: null } : null })} options={(Object.keys(CAMPAIGN_TYPE) as CampaignType[]).map((k) => ({ value: k, label: CAMPAIGN_TYPE[k].label }))} hint={CAMPAIGN_TYPE[c.type].note} />
      </div>
      <TextArea label="Description" value={c.description} onChange={(x) => setC({ ...c, description: x })} />
      <MultiSelect label="Applicable programmes" options={PROGRAMMES.map((p) => ({ value: p, label: p }))} value={c.programmes} onChange={(x) => setC({ ...c, programmes: x })} />
      <Checkbox label="All states" checked={c.allStates} onChange={(x) => setC({ ...c, allStates: x })} />
      {!c.allStates && <div className="form-grid form-grid--2"><MultiSelect label="States" options={stateOptions()} value={c.stateCodes} onChange={(x) => setC({ ...c, stateCodes: x })} /><MultiSelect label="Branches" options={branchOptions()} value={c.branchCodes} onChange={(x) => setC({ ...c, branchCodes: x })} /></div>}
      {tnSelected && <Notice tone="danger">Lucky Draw cannot target Tamil Nadu (Lottery Act). This cannot be overridden by any permission.</Notice>}
      <div className="form-grid form-grid--3">
        <TextField label="Start" type="date" value={c.start} onChange={(x) => setC({ ...c, start: x })} />
        <TextField label="End" type="date" value={c.end} onChange={(x) => setC({ ...c, end: x })} />
        <TextField label="Budget (points)" value={c.budget == null ? "" : String(c.budget)} onChange={(x) => setC({ ...c, budget: toNum(x) })} inputMode="numeric" />
      </div>
      {c.type !== "foc" && <><RewardFields value={c.reward} onChange={(r) => setC({ ...c, reward: r })} v={v} /><TextField label="Reward configuration note" value={c.rewardNote} onChange={(x) => setC({ ...c, rewardNote: x })} /></>}
      {c.type === "foc" && c.foc && (
        <>
          <h4 className="cfg-sub">FOC / Buy-X-Get-Y</h4>
          <SelectInput label="Variant" value={c.foc.variant} onChange={(x) => setC({ ...c, foc: { ...c.foc!, variant: x as NonNullable<Campaign["foc"]>["variant"] } })} options={[{ value: "same_sku", label: "Free item, same SKU" }, { value: "different_sku", label: "Free item, different SKU" }, { value: "gift_entitlement", label: "Redeemable gift entitlement" }]} />
          <MultiSelect label="Qualifying item(s)" options={v.ms.skus.filter((k) => k.status === "active").map((k) => ({ value: k.id, label: `${k.code} · ${k.name}` }))} value={c.foc.qualifyingSkuIds} onChange={(x) => setC({ ...c, foc: { ...c.foc!, qualifyingSkuIds: x } })} />
          {c.foc.variant !== "gift_entitlement" ? <SelectInput label="Reward item" value={c.foc.rewardSkuId ?? ""} onChange={(x) => setC({ ...c, foc: { ...c.foc!, rewardSkuId: x || null } })} options={[{ value: "", label: "Select" }, ...v.ms.skus.filter((k) => k.status === "active").map((k) => ({ value: k.id, label: k.code }))]} /> : <TextField label="Gift entitlement" value={c.foc.giftName} onChange={(x) => setC({ ...c, foc: { ...c.foc!, giftName: x } })} />}
          <div className="form-grid form-grid--2">
            <TextField label="Buy X (qualifying quantity)" value={c.foc.qualifyingQty == null ? "" : String(c.foc.qualifyingQty)} onChange={(x) => setC({ ...c, foc: { ...c.foc!, qualifyingQty: toNum(x) } })} inputMode="numeric" hint="Explicit; without it the campaign is blocked (SCH-Q6)" />
            <TextField label="Get Y (reward quantity)" value={c.foc.rewardQty == null ? "" : String(c.foc.rewardQty)} onChange={(x) => setC({ ...c, foc: { ...c.foc!, rewardQty: toNum(x) } })} inputMode="numeric" />
          </div>
        </>
      )}
      <ValidationList v={{ errors: val.errors, warnings: val.warnings, info: [] }} />
      <BlockerList blockers={val.blockers} />
    </Drawer>
  );
}

function ContestTab({ v, run }: { v: SchemeView; run: (r: Res, ok: string) => Res }) {
  const entries = v.s.contestEntries;
  const winners = entries.filter((e) => e.status === "winner");
  const regions = Array.from(new Set(entries.map((e) => e.region)));
  return (
    <>
      <Notice tone="info">Display Contest is for Retailer and CS. Entries arrive from the member app with a live photo, GPS and timestamp (camera-only capture). This portal does not capture photos; an entry is shown as a live capture only when the source service confirms it.</Notice>
      <Panel level={3} title="Submissions" padded={false}>
        <DataTable rows={entries} rowKey={(e) => e.id} caption="Display contest entries" columns={[
          { key: "id", header: "Entry", value: (e) => e.id, render: (e) => <span className="mono small">{e.id}</span> },
          { key: "m", header: "Member", value: (e) => e.memberId, render: (e) => <span className="small">{e.memberId} · {e.programme}</span> },
          { key: "r", header: "Region", value: (e) => e.region },
          { key: "cap", header: "Capture", value: (e) => e.capture, render: (e) => e.capture === "camera_verified" ? <span className="small">Live camera (source-confirmed)</span> : <span className="small warn-text">Source not confirmed</span> },
          { key: "gps", header: "GPS", value: (e) => (e.gps ? `${e.gps.lat}, ${e.gps.lng}` : ""), render: (e) => <span className="small mono">{e.gps ? `${e.gps.lat.toFixed(2)}, ${e.gps.lng.toFixed(2)}` : "Not supplied"}</span> },
          { key: "t", header: "Captured / submitted", value: (e) => e.submittedAt, render: (e) => <span className="small">{formatDateTime(e.capturedAt)} / {formatDateTime(e.submittedAt)}</span> },
          { key: "st", header: "Status", value: (e) => e.status, render: (e) => <RecordStatus status={e.status} /> },
          { key: "act", header: "Review", value: () => "", render: (e) => (
            <div className="btn-row" onClick={(ev) => ev.stopPropagation()}>
              <button type="button" className="btn btn--ghost btn--xs" onClick={() => run(accessContestPhoto(v.uid, e.id), `Photo ${e.photoRef}: development placeholder, no image stored`)}><Eye size={12} aria-hidden="true" />Photo</button>
              {v.canOn("campaigns", "edit", [e.programme]) && <SelectInput label="Outcome" value={e.status} onChange={(x) => run(reviewContestEntry(v.uid, e.id, x as ContestEntry["status"], "Reviewed"), "Outcome recorded")} options={["submitted", "under_review", "shortlisted", "winner", "not_selected"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />}
            </div>
          ) },
        ] as Column<ContestEntry>[]} />
      </Panel>
      <Panel level={3} title="Winners gallery" actions={<div className="btn-row"><button type="button" className="btn btn--secondary btn--xs" onClick={() => downloadCsv("display-contest-winners", [{ header: "Entry", value: (e: ContestEntry) => e.id }, { header: "Member", value: (e) => e.memberId }, { header: "Programme", value: (e) => e.programme }, { header: "Region", value: (e) => e.region }, { header: "Captured", value: (e) => e.capturedAt }, { header: "Photo reference", value: (e) => e.photoRef }], winners)}><Download size={12} aria-hidden="true" />CSV</button></div>}>
        <div className="gallery">{winners.map((w) => <figure key={w.id} className="gallery__item"><div className="gallery__ph" aria-hidden="true"><Image size={28} /></div><figcaption><strong>{w.memberId}</strong><br /><span className="small muted">{w.region} · {w.capturedAt.slice(0, 10)} · {w.photoRef}</span></figcaption></figure>)}</div>
        <div className="btn-row">{regions.map((r) => <button key={r} type="button" className="btn btn--ghost btn--sm" onClick={() => run(triggerWinnerBanner(v.uid, "CMP-0003", r), `${r} banner recorded (not published)`)}><Megaphone size={14} aria-hidden="true" />Trigger {r} winner banner</button>)}</div>
        <p className="small muted">Banner triggers are recorded only; the member app is not connected. {v.s.bannerTriggers.length} recorded.</p>
      </Panel>
    </>
  );
}

function FocTab({ v, run }: { v: SchemeView; run: (r: Res, ok: string) => Res }) {
  const gifts = v.s.campaigns.filter((c) => c.type === "foc");
  const giftCamps = gifts.filter((c) => c.foc?.variant === "gift_entitlement");
  const [camp, setCamp] = useState(giftCamps[0]?.id ?? "");
  const [text, setText] = useState("member_id,gift,qty\nMBR-RT-0001,Festive gift hamper (demo),1");
  const [member, setMember] = useState("");
  const [ent, setEnt] = useState("");
  const [reason, setReason] = useState("");
  return (
    <>
      <Panel level={3} title="FOC / Buy-X-Get-Y campaigns" padded={false}>
        <DataTable rows={gifts} rowKey={(c) => c.id} caption="FOC campaigns" searchable={false} columns={[
          { key: "n", header: "Campaign", value: (c) => c.name },
          { key: "v", header: "Variant", value: (c) => c.foc?.variant.replace(/_/g, " ") ?? "" },
          { key: "q", header: "Qualifying", value: (c) => c.foc?.qualifyingSkuIds.map((k) => v.ms.skus.find((x) => x.id === k)?.code).join(", ") ?? "" },
          { key: "x", header: "Buy X / get Y", value: (c) => `${c.foc?.qualifyingQty ?? "—"} / ${c.foc?.rewardQty ?? "—"}`, render: (c) => <span>{c.foc?.qualifyingQty ?? "—"} / {c.foc?.rewardQty ?? "—"} <DevValue /></span> },
          { key: "r", header: "Reward", value: (c) => c.foc?.giftName || v.ms.skus.find((k) => k.id === c.foc?.rewardSkuId)?.code || "" },
          { key: "st", header: "Status", value: (c) => c.status, render: (c) => <RecordStatus status={c.status} /> },
        ] as Column<Campaign>[]} />
      </Panel>
      <div className="grid-2">
        <Panel level={3} title="Bulk gift CSV" subtitle="Validated in the browser; issued only after approval (WF-018)">
          <SelectInput label="Gift-entitlement campaign" value={camp} onChange={setCamp} options={giftCamps.map((c) => ({ value: c.id, label: c.name }))} />
          <TextArea label="CSV content (member_id,gift,qty)" value={text} onChange={setText} rows={5} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => run(uploadGiftBatch(v.uid, camp, "gift-upload.csv", text), "Batch validated")}><Upload size={14} aria-hidden="true" />Validate batch</button>
          <ul className="batch-list">{v.s.giftBatches.map((b) => <li key={b.id}><span className="mono small">{b.id}</span> · {b.rows.length} rows, {b.rows.filter((r) => r.error).length} errors · <RecordStatus status={b.status} /> {b.status === "validated" && <button type="button" className="btn btn--ghost btn--xs" onClick={() => run(submitGiftBatch(v.uid, b.id), "Batch submitted")}>Submit</button>}{b.rows.filter((r) => r.error).map((r, i) => <div key={i} className="small neg">{r.memberId || "(blank)"}: {r.error}</div>)}</li>)}</ul>
        </Panel>
        <Panel level={3} title="Backend redemption on behalf of a member" subtitle="Needs approval; recorded in the development store only">
          <SelectInput label="Campaign" value={camp} onChange={setCamp} options={giftCamps.map((c) => ({ value: c.id, label: c.name }))} />
          <TextField label="Member ID" value={member} onChange={(x) => setMember(x.trim().toUpperCase())} />
          <TextField label="Entitlement" value={ent} onChange={setEnt} />
          <TextArea label="Reason" value={reason} onChange={setReason} />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => run(requestBackendRedemption(v.uid, camp, member, ent, reason), "Backend redemption submitted")}>Submit for approval</button>
          <ul className="batch-list">{v.s.backendRedemptions.map((b) => <li key={b.id}><span className="mono small">{b.id}</span> · {b.memberId} · {b.entitlement} · <RecordStatus status={b.status} /></li>)}</ul>
        </Panel>
      </div>
    </>
  );
}

/* ======================= Gamification & bonuses ======================= */

export function GamificationPage() {
  const v = useSchemeView();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "overview") as GameKind | "overview" | "bonus";
  const [edit, setEdit] = useState<GameConfig | null>(null);
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const [result, setResult] = useState<Res>(null);
  const run = (r: Res, ok: string) => { setResult(r); if (r?.ok) notify(ok, "positive"); return r; };
  const games = v.s.games;
  const blank = (kind: GameKind): GameConfig => ({ id: "", kind, name: "", description: "", programmes: [], scope: { skuIds: [], categoryIds: [], branchCodes: [], geoFencePincodes: [] }, settings: Object.fromEntries(GAME_KIND[kind].settings.map((s) => [s.key, null])), options: [], budget: null, start: v.today, end: v.today, status: "draft", approvalRequestId: null, updatedBy: v.uid, updatedAt: "" });
  const kinds = Object.keys(GAME_KIND) as GameKind[];
  return (
    <>
      <SectionTitle title="Gamification & bonuses" description="SOW 6.6. Configured here by SKU, branch and geo-fence; member-facing screens belong to the mobile app (not built in this portal)" />
      <PolicyMessages result={result} />
      <Tabs label="Gamification sections" value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: "overview", label: "Overview" }, ...kinds.map((k) => ({ id: k, label: GAME_KIND[k].label, count: games.filter((g) => g.kind === k).length })), { id: "bonus", label: "Bonuses", count: v.s.bonuses.length }]} />
      {tab === "overview" && (
        <>
          <Panel level={3} title="Configurations by type"><RankedBars items={kinds.map((k) => ({ key: k, label: GAME_KIND[k].label, value: games.filter((g) => g.kind === k).length }))} onSelect={(i) => setParams({ tab: i.key })} /></Panel>
          <Notice tone="warn">Random reward distribution (scratch cards, spin wheel) is disabled until an allocation is approved (<DecisionRef id="SCH-Q5" />). Leaderboard ranking and tie-break are not invented (<DecisionRef id="SCH-Q8" />). Bonus triggers are open (<DecisionRef id="OP-SB-BONUS" />).</Notice>
          <Panel level={3} title="Member-app integration contract">
            <KV rows={[["Tier progression, milestone progress, achievement feed, active schemes", "GET /members/{memberId}/scheme-progress (prepared, not connected)"], ["Rule", "The app shows only schemes and achievements the member qualifies for"]]} />
          </Panel>
        </>
      )}
      {kinds.includes(tab as GameKind) && (
        <Panel level={3} title={GAME_KIND[tab as GameKind].label} actions={v.can("gamification:create") && <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(blank(tab as GameKind))}><PlusCircle size={14} aria-hidden="true" />New {GAME_KIND[tab as GameKind].label.toLowerCase()}</button>} padded={false}>
          <DataTable rows={games.filter((g) => g.kind === tab)} rowKey={(g) => g.id} caption={GAME_KIND[tab as GameKind].label} searchable={false} onRowClick={(g) => setEdit(structuredClone(g))} emptyTitle="None configured" columns={[
            { key: "n", header: "Name", value: (g) => g.name, render: (g) => <span><span className="mono small">{g.id}</span> {g.name}</span> },
            { key: "p", header: "Programmes", value: (g) => g.programmes.join(", ") },
            { key: "s", header: "Settings", value: (g) => Object.values(g.settings).join(" "), render: (g) => <span className="small cell-wrap">{GAME_KIND[g.kind].settings.map((s) => `${s.label}: ${g.settings[s.key] ?? "not configured"}`).join(" · ")}</span> },
            { key: "sc", header: "Scope", value: (g) => g.scope.branchCodes.length, render: (g) => <span className="small">{g.scope.categoryIds.length + g.scope.skuIds.length ? `${g.scope.categoryIds.length + g.scope.skuIds.length} product item(s)` : "All products"} · {g.scope.branchCodes.length ? `${g.scope.branchCodes.length} branch(es)` : "all branches"}{g.scope.geoFencePincodes.length ? ` · ${g.scope.geoFencePincodes.length} pincode(s)` : ""}</span> },
            { key: "v", header: "Blocking", value: (g) => validateGame(v.s, g).blockers.length, render: (g) => { const b = validateGame(v.s, g).blockers; return b.length ? <span className="warn-text small">{b.map((x) => x.ref).join(", ")}</span> : <span className="muted small">None</span>; } },
            { key: "st", header: "Status", value: (g) => g.status, render: (g) => <RecordStatus status={g.status} /> },
          ] as Column<GameConfig>[]} />
        </Panel>
      )}
      {tab === "bonus" && (
        <Panel level={3} title="Bonus configuration" subtitle="Welcome Bonus, Assured Scratch and Mega Scratch (SOW 6.6). Triggers and eligibility pending OP-SB-BONUS" padded={false}>
          <DataTable rows={v.s.bonuses} rowKey={(b) => b.id} caption="Bonuses" searchable={false} onRowClick={(b) => setBonus(structuredClone(b))} columns={[
            { key: "n", header: "Bonus", value: (b) => b.name },
            { key: "t", header: "Type", value: (b) => BONUS_TYPE[b.type] },
            { key: "tr", header: "Trigger", value: (b) => b.trigger ?? "", render: (b) => b.trigger ?? <span className="warn-text small">Not configured</span> },
            { key: "e", header: "Eligibility", value: (b) => b.eligibility ?? "", render: (b) => b.eligibility ?? <span className="warn-text small">Not configured</span> },
            { key: "r", header: "Reward", value: (b) => rewardText(b.reward, v.s) },
            { key: "b", header: "Budget", align: "right", value: (b) => b.budget ?? 0, render: (b) => <span className="num">{v.financial ? pts(b.budget) : "•••"}</span> },
            { key: "st", header: "Status", value: (b) => b.status, render: (b) => <RecordStatus status={b.status} /> },
          ] as Column<Bonus>[]} />
        </Panel>
      )}
      {edit && <GameDrawer game={edit} v={v} onClose={() => setEdit(null)} run={run} />}
      {bonus && <BonusDrawer bonus={bonus} v={v} onClose={() => setBonus(null)} run={run} />}
    </>
  );
}

function ScopeFields({ scope, onChange, v }: { scope: GameConfig["scope"]; onChange: (s: GameConfig["scope"]) => void; v: SchemeView }) {
  return (
    <div className="form-grid form-grid--2">
      <MultiSelect label="Categories" options={v.ms.categories.filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name }))} value={scope.categoryIds} onChange={(x) => onChange({ ...scope, categoryIds: x })} />
      <MultiSelect label="SKUs" options={v.ms.skus.filter((k) => k.status === "active").map((k) => ({ value: k.id, label: k.code }))} value={scope.skuIds} onChange={(x) => onChange({ ...scope, skuIds: x })} />
      <MultiSelect label="Branches" options={branchOptions()} value={scope.branchCodes} onChange={(x) => onChange({ ...scope, branchCodes: x })} />
      <TextField label="Geo-fence pincodes (comma separated)" value={scope.geoFencePincodes.join(", ")} onChange={(x) => onChange({ ...scope, geoFencePincodes: csvList(x) })} />
    </div>
  );
}

function GameDrawer({ game, v, onClose, run }: { game: GameConfig; v: SchemeView; onClose: () => void; run: (r: Res, ok: string) => Res }) {
  const [g, setG] = useState(game);
  const val = validateGame(v.s, g);
  const save = () => { const r = run(saveGame(v.uid, g), "Saved"); if (r?.ok) onClose(); };
  const submit = () => { const s = saveGame(v.uid, g); if (!s.ok) { run(s, ""); return; } const r = run(submitGame(v.uid, s.id!), "Submitted"); if (r?.ok) onClose(); };
  return (
    <Drawer open onClose={onClose} width={640} title={g.id ? `${GAME_KIND[g.kind].label} · ${g.name}` : `New ${GAME_KIND[g.kind].label.toLowerCase()}`} subtitle="Draft until approved through WF-019" footer={<div className="btn-row"><button type="button" className="btn btn--secondary" onClick={save}>Save draft</button>{v.canOn("gamification", "submit", g.programmes) && <button type="button" className="btn btn--primary" onClick={submit}><Send size={14} aria-hidden="true" />Submit</button>}</div>}>
      <TextField label="Name" value={g.name} onChange={(x) => setG({ ...g, name: x })} />
      <TextArea label="Description" value={g.description} onChange={(x) => setG({ ...g, description: x })} />
      <MultiSelect label="Programmes" options={PROGRAMMES.map((p) => ({ value: p, label: p }))} value={g.programmes} onChange={(x) => setG({ ...g, programmes: x })} />
      {GAME_KIND[g.kind].settings.map((s) => <TextField key={s.key} label={s.label} value={g.settings[s.key] == null ? "" : String(g.settings[s.key])} onChange={(x) => setG({ ...g, settings: { ...g.settings, [s.key]: x === "" ? null : s.kind === "number" ? toNum(x) : x } })} inputMode={s.kind === "number" ? "numeric" : undefined} hint={s.kind === "number" ? "No default" : undefined} />)}
      {(g.kind === "scratch_card" || g.kind === "spin_wheel") && (
        <>
          <h4 className="cfg-sub">Reward options and allocation</h4>
          {g.options.map((o, i) => (
            <div key={o.id} className="form-grid form-grid--3">
              <TextField label="Option" value={o.label} onChange={(x) => setG({ ...g, options: g.options.map((y, j) => (j === i ? { ...y, label: x } : y)) })} />
              <TextField label="Points" value={o.reward.value == null ? "" : String(o.reward.value)} onChange={(x) => setG({ ...g, options: g.options.map((y, j) => (j === i ? { ...y, reward: { ...y.reward, value: toNum(x) } } : y)) })} inputMode="numeric" />
              <TextField label="Allocation %" value={o.probabilityPct == null ? "" : String(o.probabilityPct)} onChange={(x) => setG({ ...g, options: g.options.map((y, j) => (j === i ? { ...y, probabilityPct: toNum(x) } : y)) })} inputMode="numeric" hint="Only once approved (SCH-Q5)" />
            </div>
          ))}
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setG({ ...g, options: [...g.options, { id: `O${g.options.length + 1}`, label: "", reward: { kind: "fixed_points", value: null, formulaId: null }, probabilityPct: null }] })}><PlusCircle size={14} aria-hidden="true" />Add option</button>
          <TextField label="Budget (points)" value={g.budget == null ? "" : String(g.budget)} onChange={(x) => setG({ ...g, budget: toNum(x) })} inputMode="numeric" />
        </>
      )}
      <ScopeFields scope={g.scope} onChange={(s) => setG({ ...g, scope: s })} v={v} />
      <div className="form-grid form-grid--2"><TextField label="Start" type="date" value={g.start} onChange={(x) => setG({ ...g, start: x })} /><TextField label="End" type="date" value={g.end} onChange={(x) => setG({ ...g, end: x })} /></div>
      <ValidationList v={{ errors: val.errors, warnings: val.warnings, info: [] }} />
      <BlockerList blockers={val.blockers} />
    </Drawer>
  );
}

function BonusDrawer({ bonus, v, onClose, run }: { bonus: Bonus; v: SchemeView; onClose: () => void; run: (r: Res, ok: string) => Res }) {
  const [b, setB] = useState(bonus);
  const val = validateBonus(v.s, b);
  const save = () => { const r = run(saveBonus(v.uid, b), "Saved"); if (r?.ok) onClose(); };
  return (
    <Drawer open onClose={onClose} width={600} title={`${BONUS_TYPE[b.type]} · ${b.name}`} subtitle="Activation blocked until OP-SB-BONUS is confirmed" footer={<div className="btn-row"><button type="button" className="btn btn--secondary" onClick={save}>Save draft</button><button type="button" className="btn btn--primary" onClick={() => run(submitBonus(v.uid, b.id), "Submitted")}><Send size={14} aria-hidden="true" />Submit</button></div>}>
      <TextField label="Name" value={b.name} onChange={(x) => setB({ ...b, name: x })} />
      <SelectInput label="Bonus type" value={b.type} onChange={(x) => setB({ ...b, type: x as BonusType })} options={(Object.keys(BONUS_TYPE) as BonusType[]).map((k) => ({ value: k, label: BONUS_TYPE[k] }))} />
      <TextField label="Trigger" value={b.trigger ?? ""} onChange={(x) => setB({ ...b, trigger: x || null })} hint="Not invented; describe the confirmed trigger" />
      <TextField label="Eligibility" value={b.eligibility ?? ""} onChange={(x) => setB({ ...b, eligibility: x || null })} />
      <MultiSelect label="Programmes" options={PROGRAMMES.map((p) => ({ value: p, label: p }))} value={b.programmes} onChange={(x) => setB({ ...b, programmes: x })} />
      <RewardFields value={b.reward} onChange={(r) => setB({ ...b, reward: r })} v={v} />
      <TextField label="Budget (points)" value={b.budget == null ? "" : String(b.budget)} onChange={(x) => setB({ ...b, budget: toNum(x) })} inputMode="numeric" />
      <ScopeFields scope={b.scope} onChange={(s) => setB({ ...b, scope: s })} v={v} />
      <div className="form-grid form-grid--2"><TextField label="Start" type="date" value={b.start} onChange={(x) => setB({ ...b, start: x })} /><TextField label="End" type="date" value={b.end} onChange={(x) => setB({ ...b, end: x })} /></div>
      <BlockerList blockers={val.blockers} />
    </Drawer>
  );
}

