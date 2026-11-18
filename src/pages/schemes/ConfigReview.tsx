import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { BASIS_LABEL, COMPONENT_LABEL, CONTRIBUTION_LABEL, DURATION_LABEL, EVALUATION_LABEL, SCHEME_TYPE, TARGET_DIMENSIONS } from "@/config/schemeCatalogue";
import { categoryById, skuById, type MasterState } from "@/features/masters/engine";
import type { MemberState } from "@/features/members/engine";
import { branchScopeText, eligiblePopulation, productScopeText, refLabel, rewardText, skusInScope, targetingText, validateConfig } from "@/features/schemes/engine";
import type { SchemeConfig, SchemeState } from "@/types/schemes";
import { ValidationList } from "@/pages/masters/shared";
import { BlockerList, DecisionRef, KV, pts } from "./shared";

const Off = () => <span className="muted small">Not used in this scheme</span>;
const Section = ({ n, title, sow, children, decision }: { n: number | string; title: string; sow: string; children: ReactNode; decision?: string }) => (
  <section className="cfg-sec">
    <h3 className="cfg-sec__title"><span className="cfg-sec__n">{n}</span>{title} <span className="muted small">SOW {sow}</span>{decision && <> · <DecisionRef id={decision} /></>}</h3>
    {children}
  </section>
);

/** The complete configuration in reading order (SOW 6.2.17 review). */
export function ConfigReview({ c, s, ms, mem, financial }: { c: SchemeConfig; s: SchemeState; ms: MasterState; mem: MemberState; financial: boolean }) {
  const pop = eligiblePopulation(mem, ms, c);
  const skuCount = skusInScope(ms, c.products).size;
  return (
    <div className="cfg-review">
      <Section n={1} title="Scheme details" sow="6.2.1" decision="OP-SB-LVL">
        <KV rows={[["Name", c.basic.name || "—"], ["Code", <span className="mono">{c.basic.code || "—"}</span>], ["Type", SCHEME_TYPE[c.basic.type]], ["Level", c.basic.level ? `${c.basic.level === "L0" ? "Level 0" : "Level 1"} · meaning pending, no effect on calculation${c.basic.levelUsedInCalculation ? " · marked as used in a calculation (blocked)" : ""}` : "Not selected"], ["Programmes", c.basic.programmes.join(", ") || "—"], ["Description", c.basic.description || "—"]]} />
      </Section>
      <Section n={11} title="Duration & evaluation" sow="6.2.11">
        <KV rows={[["Period", `${c.duration.start || "—"} to ${c.duration.end || "—"}`], ["Duration type", DURATION_LABEL[c.duration.type]], ["Evaluation", `${EVALUATION_LABEL[c.duration.evaluation].label}: ${EVALUATION_LABEL[c.duration.evaluation].meaning}`]]} />
      </Section>
      <Section n="6 · 13" title="Product & branch applicability" sow="6.2.6 / 6.2.13">
        <KV rows={[["Products", productScopeText(ms, c.products)], ["Resolved SKUs", `${skuCount} SKU(s) (a sub-category covers every SKU beneath it)`], ["Branches", branchScopeText(c.eligibility.branchScope)]]} />
      </Section>
      <Section n="12 · 14" title="Eligibility & targeting" sow="6.2.12 / 6.2.14">
        <KV rows={[["Selected members", c.eligibility.selectedMemberIds.join(", ") || "Any in scope"], ["Group / segment", [...c.eligibility.groups, ...c.eligibility.segments].join(", ") || "Any"], ["Elite classification", c.eligibility.elite === "any" ? "Any" : c.eligibility.elite === "elite_only" ? "Elite only" : "Exclude Elite"], ["Targeting", c.targeting.length ? c.targeting.map((t) => `${targetingText(t)}${TARGET_DIMENSIONS[t.dimension].available ? "" : " (source not connected)"}`).join("; ") : "None"], ["Eligible members", pop.count != null ? `${pop.count} in the development member master` : `${pop.lowerBound}+ counted; not computable for ${pop.notComputable.join(", ")}`]]} />
      </Section>
      <Section n={2} title="Base Points" sow="6.2.2">
        {c.base.enabled ? (
          <table className="cfg-matrix">
            <thead><tr><th>Level</th><th>Category / sub-category / SKU</th><th>Programme</th><th>Branches</th><th className="num">Points per unit</th></tr></thead>
            <tbody>{c.base.rows.map((r) => <tr key={r.id}><td>{r.level.replace("_", "-")}</td><td>{refLabel(ms, r)}</td><td>{r.programme}</td><td>{r.branchCodes === "all" ? "All" : `${r.branchCodes.length} branch(es)`}</td><td className="num">{r.points ?? <span className="neg">Not set</span>}</td></tr>)}</tbody>
          </table>
        ) : <Off />}
        {c.base.enabled && <p className="small muted">Qualifying: {c.base.qualifyingCriteria || "—"}. Credited redeemable, subject to KYC and redemption eligibility. Never merged with scheme points.</p>}
      </Section>
      <Section n={3} title="Rider Points" sow="6.2.3" decision="OP-SB-RIDER">
        {c.rider.enabled ? <KV rows={[["Base condition", `${c.rider.baseCondition?.replace(/_/g, " ") ?? "—"} ≥ ${c.rider.baseThreshold ?? "—"}`], ["Activation", c.rider.activationCondition || "—"], ["Eligibility", c.rider.eligibility || "—"], ["Reward", rewardText(c.rider.reward, s)], ["Counts toward milestones", c.rider.contributesToMilestone ? "Yes" : "No"]]} /> : <Off />}
      </Section>
      <Section n={4} title="Cross-selling" sow="6.2.4">
        {c.crossSell.enabled ? <KV rows={[["Participating categories", c.crossSell.categories.map((x) => `${categoryById(ms, x.categoryId)?.name ?? x.categoryId}: ${BASIS_LABEL[x.basis]} ≥ ${x.minimum ?? "—"}`).join("; ")], ["Categories that must qualify", c.crossSell.requiredCategoryCount ?? "—"], ["Bonus", rewardText(c.crossSell.reward, s)], ["With Base Points / milestones", `${c.crossSell.combineWithBase ? "Combined with Base Points" : "Separate"} · ${c.crossSell.contributesToMilestone ? "counts toward milestones" : "not counted toward milestones"}`]]} /> : <Off />}
      </Section>
      <Section n={5} title="Quantity-based" sow="6.2.5">
        {c.quantity.enabled ? <KV rows={[["Basis", BASIS_LABEL[c.quantity.basis]], ["Threshold / target", `${c.quantity.threshold ?? "—"} / ${c.quantity.target ?? "—"}`], ["Period", c.quantity.period.replace(/_/g, " ")], ["Reward", c.quantity.useSlabs ? "From the slab table" : rewardText(c.quantity.reward, s)]]} /> : <Off />}
      </Section>
      <Section n={8} title="Milestones" sow="6.2.8">
        {c.milestone.enabled ? (
          <>
            <KV rows={[["Contribution", CONTRIBUTION_LABEL[c.milestone.contribution]], ["Measure", BASIS_LABEL[c.milestone.measure]], ["Member-facing progress", c.milestone.memberProgress ? "Shared through the member-app contract" : "Not shared"]]} />
            <ol className="ladder">{c.milestone.levels.map((l) => <li key={l.id}><strong>{l.name}</strong> at {pts(l.threshold)} → {rewardText(l.reward, s)}</li>)}</ol>
          </>
        ) : <Off />}
      </Section>
      <Section n={9} title="Slabs" sow="6.2.9">
        {c.slab.enabled ? (
          <>
            <table className="cfg-matrix">
              <thead><tr><th>Priority</th><th>Slab</th><th>Range</th><th>Achievement</th><th>Reward</th><th>Rule</th></tr></thead>
              <tbody>{[...c.slab.slabs].sort((a, b) => (a.min ?? 0) - (b.min ?? 0)).map((x) => <tr key={x.id}><td className="num">{x.priority}</td><td>{x.name}</td><td className="num">{x.min ?? "—"} – {x.max ?? "∞"}</td><td>{BASIS_LABEL[x.achievement]}</td><td>{rewardText(x.reward, s)}</td><td className="small">{x.qualificationRule}</td></tr>)}</tbody>
            </table>
            <p className="small">Downgrade / reversal: {c.slab.reversal.eligible == null ? "Not configured" : c.slab.reversal.eligible ? `${c.slab.reversal.downgradeOutcome || "Re-evaluate on net activity"} · correction formula ${c.slab.reversal.adjustmentFormulaId ?? "—"} (pending SCH-Q7: reversals are linked and recorded as pending)` : "Not eligible for reversal"}</p>
          </>
        ) : <Off />}
      </Section>
      <Section n={10} title="Growth-based" sow="6.2.10" decision="OP-01">
        {c.growth.enabled ? <KV rows={[["Baseline", `${c.growth.baselineFrom || "—"} to ${c.growth.baselineTo || "—"}`], ["Comparison", `${c.growth.comparisonFrom || "—"} to ${c.growth.comparisonTo || "—"}`], ["Required growth", c.growth.requiredGrowthPct == null ? "Not configured" : `${c.growth.requiredGrowthPct}%`], ["Basis", c.growth.basis ? BASIS_LABEL[c.growth.basis] : "—"], ["Programme applicability", c.growth.programmeApplicability.join(", ") || "Not selected"], ["Reward", rewardText(c.growth.reward, s)]]} /> : <Off />}
      </Section>
      <Section n={7} title="Combined rules" sow="6.2.7">
        {c.combined.enabled ? <p>{c.combined.relation === "all_of" ? "All of" : "Any of"}: <strong>{c.combined.components.map((k) => COMPONENT_LABEL[k]).join(" + ")}</strong>{c.combined.dependencies.length ? ` · ${c.combined.dependencies.map((d) => `${COMPONENT_LABEL[d.component]} depends on ${COMPONENT_LABEL[d.dependsOn]}`).join("; ")}` : ""}. Execution precedence is not assumed (SCH-Q4).</p> : <Off />}
      </Section>
      <Section n={15} title="Backdated calculation" sow="6.2.15">
        {c.backdated.enabled ? <KV rows={[["Announced", c.backdated.announcementDate], ["Effective from", c.duration.start], ["Historical transactions", `${c.backdated.historicalFrom} to ${c.backdated.historicalTo}`], ["How it runs", "Separate approved backend operation (two-level), idempotent per transaction"], ["Estimated exposure", "Not available: OP-SB-LIAB"]]} /> : <Off />}
      </Section>
      <Section n="Budget" title="Budget & settlement" sow="6.1 / 5.2">
        <KV rows={[["Budget cap", financial ? `${pts(c.budget.amount)} points` : "Restricted"], ["Auto-stop at cap", c.budget.autoStop ? "Yes (mock engine; production enforcement not connected)" : "No"], ["Alert at", c.budget.alertPct == null ? "Not set" : `${c.budget.alertPct}% utilisation`], ["Settlement", c.settlement.tranches.map((t) => `${t.label}: ${t.pct ?? "—"}% (${t.trigger.replace(/_/g, " ")})`).join(" · ")], ["Projected liability", <span>Pending business formula · <DecisionRef id="OP-SB-LIAB" /></span>]]} />
      </Section>
    </div>
  );
}

export function ValidationPanel({ c, s, ms, mem, schemeId, today }: { c: SchemeConfig; s: SchemeState; ms: MasterState; mem: MemberState; schemeId: string | null; today: string }) {
  const v = validateConfig(s, ms, schemeId, c, { today, members: mem });
  return (
    <Panel level={3} title="Validation" subtitle="Errors block submission. Warnings and business-confirmation items are shown to the Checker">
      <ValidationList v={{ errors: v.errors, warnings: v.warnings, info: v.info }} />
      <BlockerList blockers={v.blockers} />
    </Panel>
  );
}

export const skuText = (ms: MasterState, id: string) => skuById(ms, id)?.code ?? id;
