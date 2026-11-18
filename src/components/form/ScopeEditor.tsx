import { useMemo } from "react";
import { GEOGRAPHY, findBranch, findDistrict } from "@/config/geography";
import { PROGRAMMES } from "@/config/programmes";
import { describeScope, geoCovers } from "@/features/access/engine";
import type { AccessScope, GeoCeiling, GeographyScope } from "@/types/rbac";
import { MultiSelect, RadioCards } from "./Form";
import { ProgrammeTag } from "@/components/ui/primitives";

/**
 * Programme + geography scope editor.
 * Geography is chosen State → District → Branch. Picking districts inside a state narrows that
 * state to those districts; picking branches inside a district narrows it to those branches.
 * Options are limited to what the administrator can see (their own scope) — the engine still
 * re-validates the delegation ceiling on save.
 */
export function ScopeEditor({ value, onChange, authority, roleCeiling = "all", idPrefix, parts = "both" }: { value: AccessScope; onChange: (s: AccessScope) => void; authority: { programmes: "all" | string[]; geography: GeographyScope }; roleCeiling?: GeoCeiling; idPrefix: string; parts?: "both" | "programmes" | "geography" }) {
  const showP = parts !== "geography";
  const showG = parts !== "programmes";
  const programmeOptions = PROGRAMMES.filter((p) => authority.programmes === "all" || authority.programmes.includes(p.code));
  const g = value.geography;

  // Expand a stored scope back into the three pickers.
  const picked = useMemo(() => {
    if (g.mode === "all") return { states: [] as string[], districts: [] as string[], branches: [] as string[] };
    const states = new Set(g.states);
    const districts = new Set(g.districts);
    g.districts.forEach((d) => {
      const h = findDistrict(d);
      if (h) states.add(h.state.code);
    });
    g.branches.forEach((b) => {
      const h = findBranch(b);
      if (h) {
        states.add(h.state.code);
        districts.add(h.district.code);
      }
    });
    return { states: [...states], districts: [...districts], branches: [...g.branches] };
  }, [g]);

  const commitGeo = (states: string[], districts: string[], branches: string[]) => {
    // Normalise: the most specific level chosen wins for its parent.
    const ds = districts.filter((d) => states.includes(findDistrict(d)?.state.code ?? ""));
    const bs = branches.filter((b) => ds.includes(findBranch(b)?.district.code ?? ""));
    const geo: GeographyScope = {
      mode: "selected",
      states: states.filter((st) => !ds.some((d) => findDistrict(d)?.state.code === st)),
      districts: ds.filter((d) => !bs.some((b) => findBranch(b)?.district.code === d)),
      branches: bs,
    };
    onChange({ ...value, geography: geo });
  };

  const visibleStates = GEOGRAPHY.filter((st) => authority.geography.mode === "all" || geoCovers(authority.geography, { state: st.code }) || st.districts.some((d) => geoCovers(authority.geography, { district: d.code }) || d.branches.some((b) => geoCovers(authority.geography, { branch: b.code }))));
  const districtOptions = visibleStates.filter((st) => picked.states.includes(st.code)).flatMap((st) => st.districts.map((d) => ({ value: d.code, label: d.name, group: st.name })));
  const branchOptions = visibleStates.flatMap((st) => st.districts.filter((d) => picked.districts.includes(d.code)).flatMap((d) => d.branches.map((b) => ({ value: b.code, label: b.name, group: `${d.name}, ${st.name}` }))));
  const summary = describeScope(value);
  const needs = roleCeiling === "branch" ? "branches" : roleCeiling === "district" ? "districts or branches" : roleCeiling === "state" ? "states or narrower" : null;

  return (
    <div className="scope-editor">
      {showP && <RadioCards
        name={`${idPrefix}-prog`}
        label="Programme access"
        value={value.programmes === "all" ? "all" : "selected"}
        onChange={(v) => onChange({ ...value, programmes: v === "all" ? "all" : programmeOptions.map((p) => p.code).slice(0, 1) })}
        options={[
          { value: "all", label: "All authorised programmes", description: authority.programmes === "all" ? "Every programme, now and future" : "Only programmes you can delegate", disabled: authority.programmes !== "all" },
          { value: "selected", label: "Selected programmes", description: "Choose one or more" },
        ]}
      />}
      {showP && value.programmes !== "all" && (
        <div className="chip-toggle" role="group" aria-label="Programmes">
          {programmeOptions.map((p) => {
            const on = (value.programmes as string[]).includes(p.code);
            return (
              <button key={p.code} type="button" className={`chip-toggle__btn ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => onChange({ ...value, programmes: on ? (value.programmes as string[]).filter((x) => x !== p.code) : [...(value.programmes as string[]), p.code] })}>
                <ProgrammeTag code={p.code} size="sm" />
              </button>
            );
          })}
        </div>
      )}

      {showG && <RadioCards
        name={`${idPrefix}-geo`}
        label="Geographical access"
        value={g.mode}
        onChange={(v) => onChange({ ...value, geography: v === "all" ? { mode: "all" } : { mode: "selected", states: [], districts: [], branches: [] } })}
        options={[
          { value: "all", label: "All authorised geography", description: roleCeiling !== "all" ? `This role must be limited to ${needs}` : authority.geography.mode === "all" ? "Every state, district and branch" : "Not available: your own geography is limited", disabled: roleCeiling !== "all" || authority.geography.mode !== "all" },
          { value: "selected", label: "Selected locations", description: "State → district → branch" },
        ]}
      />}
      {showG && g.mode === "selected" && (
        <div className="geo-pickers">
          <MultiSelect label="States" options={visibleStates.map((s) => ({ value: s.code, label: s.name }))} value={picked.states} onChange={(v) => commitGeo(v, picked.districts, picked.branches)} placeholder="Choose states" />
          <MultiSelect label="Districts (narrows the state)" options={districtOptions} value={picked.districts} onChange={(v) => commitGeo(picked.states, v, picked.branches)} placeholder={picked.states.length ? "Whole state" : "Choose a state first"} disabled={!picked.states.length} emptyText="No districts" />
          <MultiSelect label="Branches (narrows the district)" options={branchOptions} value={picked.branches} onChange={(v) => commitGeo(picked.states, picked.districts, v)} placeholder={picked.districts.length ? "Whole district" : "Choose a district first"} disabled={!picked.districts.length} emptyText="No branches" />
        </div>
      )}
      <p className="scope-editor__summary">
        <strong>Effective scope:</strong> {summary.programmes} · {summary.geography}
      </p>
    </div>
  );
}
