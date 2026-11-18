/**
 * Approval request specifications for Phase 10 risk configuration and device actions. Shared by the
 * store and the precomputed approval scenario steps.
 */
import type { FieldChange, ImpactSummary } from "@/types/approval";
import type { AnomalyRule, Device, GlobalRestriction } from "@/types/risk";

export interface RiskSpec {
  type: string;
  title: string;
  entity: string;
  programme: string | null;
  fields: FieldChange[];
  purpose: string;
  reason: string;
  justification: string;
  impact: ImpactSummary | null;
}
const f = (key: string, label: string, before: string | number | null, after: string | number | null, material = false): FieldChange => ({ key, label, kind: "text", before, after, material });
const lim = (r?: AnomalyRule) => (r ? (["hour", "day", "week", "month"] as const).map((p) => `${p}: ${r.limits[p] ?? "—"}`).join(" · ") : null);
const KIND = { redemption: "Redemption", scan_in: "Scan-In", scan_out: "Scan-Out" } as const;

export function thresholdSpec(r: AnomalyRule, prev: AnomalyRule | undefined): RiskSpec {
  return {
    type: "risk_threshold_change",
    title: `${KIND[r.kind]} rule ${r.id} v${r.version} · ${r.name}`,
    entity: `${r.id} v${r.version}`,
    programme: r.programme,
    fields: [
      f("limits", `Limits (${r.unit})`, lim(prev), lim(r), true),
      f("scope", "Scope", prev ? `${prev.programme ?? "All programmes"} ${prev.categoryId ?? ""}`.trim() : null, `${r.programme ?? "All programmes"} ${r.categoryId ?? ""} ${r.states.join("/")}`.trim()),
      f("effective", "Effective", prev ? `${prev.effectiveFrom} – ${prev.effectiveTo ?? "open"}` : null, `${r.effectiveFrom} – ${r.effectiveTo ?? "open"}`),
      f("autoflag", "Auto-flag to review queue", prev ? String(prev.autoFlag) : null, String(r.autoFlag)),
      f("values", "Value status", null, r.demo ? "Demo configuration (OP-02 open)" : "Business-supplied values", true),
    ],
    purpose: "Rule-based anomaly threshold (SOW 9.3, AF21)",
    reason: r.history[r.history.length - 1]?.detail || "Threshold configuration",
    justification: "Approval records the configuration only. Activation stays blocked until OP-02 thresholds are confirmed",
    impact: { affectedProgrammes: r.programme ? [r.programme] : [] },
  };
}

export function globalSpec(g: GlobalRestriction, target: "active" | "inactive", programmes: string[], reason: string): RiskSpec {
  const label = g.type === "block_all_scan" ? "Block all scanning" : "Block all redemption";
  return {
    type: "global_restriction_change",
    title: `${target === "active" ? "Activate" : "Deactivate"} global restriction: ${label}`,
    entity: `${g.id} ${target}`,
    programme: programmes.length === 1 ? programmes[0] : programmes.length ? programmes.join(" + ") : null,
    fields: [f("status", label, g.status, target, true), f("programmes", "Programmes", g.programmes.join(", ") || null, programmes.join(", "), true), f("conditions", "Trigger conditions", null, g.triggerConditions)],
    purpose: "Global restriction policy (SOW 9.3 global block rules)",
    reason,
    justification: "Sensitive action: impact preview reviewed; executes only after approval",
    impact: { affectedProgrammes: programmes, operationalImpact: target === "active" ? `${label} for ${programmes.join(", ")}` : `${label} lifted` },
  };
}

export function deviceSpec(d: Device, action: "block" | "release", reason: string): RiskSpec {
  return {
    type: action === "block" ? "device_block" : "device_release",
    title: `${action === "block" ? "Block" : "Release"} device ${d.id}`,
    entity: `${d.id} ${action}`,
    programme: null,
    fields: [f("device", "Device", d.identifierMasked, d.identifierMasked), f("status", "Device status", d.status, action === "block" ? "blocked" : "active", true), f("accounts", "Linked accounts", null, d.associations.map((a) => a.memberId).join(", "), true)],
    purpose: "Device governance (SOW 3.2 / 9.2)",
    reason,
    justification: "Impact on every linked account reviewed. Separate from Program Block and Temporary Hold",
    impact: { affectedMembers: d.associations.length, operationalImpact: `${d.associations.length} linked account(s) cannot use this device while blocked` },
  };
}
