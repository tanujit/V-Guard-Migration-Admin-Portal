import { Fragment, useMemo, useState } from "react";
import { Check, Minus } from "lucide-react";
import { ACTIONS, key, MODULE_CATEGORY_LABEL, MODULES, parseKey } from "@/config/rbacCatalogue";
import { SearchInput } from "@/components/ui/DataTable";
import { SelectField } from "@/components/ui/primitives";
import type { ActionId, ModuleCategory, PermissionKey, RoleCategory } from "@/types/rbac";

const APPROVAL: ActionId[] = ["approve", "reject", "return"];

/**
 * Module × action permission matrix.
 *  - Only actions a module supports can be ticked (others show "–").
 *  - Restricted actions are highlighted.
 *  - Approve / Reject / Return are reserved for operational (Checker) roles.
 *  - With `baseline`, additions and removals are marked for before/after comparison.
 */
export function PermissionMatrix({ value, onChange, readOnly, baseline, roleCategory }: { value: PermissionKey[]; onChange?: (v: PermissionKey[]) => void; readOnly?: boolean; baseline?: PermissionKey[]; roleCategory: RoleCategory }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ModuleCategory | "all">("all");
  const [onlyGranted, setOnlyGranted] = useState(false);
  const set = useMemo(() => new Set(value), [value]);
  const base = useMemo(() => (baseline ? new Set(baseline) : null), [baseline]);
  const total = MODULES.reduce((n, m) => n + m.actions.length, 0);

  const modules = MODULES.filter((m) => (cat === "all" || m.category === cat) && m.label.toLowerCase().includes(q.trim().toLowerCase()) && (!onlyGranted || m.actions.some((a) => set.has(key(m.id, a)))));
  const blockedForRole = (a: ActionId) => roleCategory !== "operational" && APPROVAL.includes(a);

  const toggle = (k: PermissionKey) => {
    if (readOnly || !onChange) return;
    onChange(set.has(k) ? value.filter((x) => x !== k) : [...value, k]);
  };
  const toggleModule = (mid: string) => {
    if (readOnly || !onChange) return;
    const m = MODULES.find((x) => x.id === mid)!;
    const keys = m.actions.filter((a) => !blockedForRole(a)).map((a) => key(mid, a));
    const all = keys.every((k) => set.has(k));
    onChange(all ? value.filter((k) => parseKey(k).module !== mid) : Array.from(new Set([...value, ...keys])));
  };

  return (
    <div className="matrix">
      <div className="matrix__toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search modules" label="Search modules" />
        <SelectField label="Category" hideLabel value={cat} onChange={(v) => setCat(v as ModuleCategory | "all")} options={[{ value: "all", label: "All categories" }, ...(Object.keys(MODULE_CATEGORY_LABEL) as ModuleCategory[]).map((c) => ({ value: c, label: MODULE_CATEGORY_LABEL[c] }))]} />
        <label className="check matrix__only">
          <input type="checkbox" checked={onlyGranted} onChange={(e) => setOnlyGranted(e.target.checked)} />
          Granted only
        </label>
        <span className="matrix__count num" aria-live="polite">
          <strong>{value.length}</strong> of {total} permissions selected
        </span>
      </div>
      <div className="matrix__legend">
        <span>
          <span className="matrix__swatch matrix__swatch--on" aria-hidden="true" /> Granted
        </span>
        <span>
          <span className="matrix__swatch matrix__swatch--restricted" aria-hidden="true" /> Restricted action
        </span>
        {base && (
          <>
            <span>
              <span className="matrix__swatch matrix__swatch--added" aria-hidden="true" /> Added
            </span>
            <span>
              <span className="matrix__swatch matrix__swatch--removed" aria-hidden="true" /> Removed
            </span>
          </>
        )}
        <span>– Not applicable to the module</span>
        {roleCategory !== "operational" && <span>Approve / Reject / Return are granted only through the Checker profile</span>}
      </div>
      <div className="matrix__scroll" tabIndex={0} role="region" aria-label="Permission matrix, scroll horizontally for more actions">
        <table className="matrix__table">
          <caption className="sr-only">Permissions by module and action</caption>
          <thead>
            <tr>
              <th scope="col" className="matrix__module-h">Module</th>
              {ACTIONS.map((a) => (
                <th key={a.id} scope="col" className={a.restricted ? "is-restricted" : ""} title={a.description}>
                  {a.label}
                  {a.sow && <span className="matrix__sow" title="Part of the SOW permission vocabulary">SOW</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(MODULE_CATEGORY_LABEL) as ModuleCategory[]).map((c) => {
              const rows = modules.filter((m) => m.category === c);
              if (!rows.length) return null;
              return (
                <Fragment key={c}>
                  <tr className="matrix__group">
                    <th colSpan={ACTIONS.length + 1} scope="colgroup">
                      {MODULE_CATEGORY_LABEL[c]}
                    </th>
                  </tr>
                  {rows.map((m) => {
                    const granted = m.actions.filter((a) => set.has(key(m.id, a))).length;
                    return (
                      <tr key={m.id}>
                        <th scope="row" className="matrix__module">
                          <span className="matrix__module-name">{m.label}</span>
                          <span className="matrix__module-meta">
                            <span className="num">
                              {granted}/{m.actions.length}
                            </span>
                            {!readOnly && (
                              <button type="button" className="link-btn" onClick={() => toggleModule(m.id)} aria-label={`Toggle all ${m.label} actions`}>
                                {m.actions.filter((a) => !blockedForRole(a)).every((a) => set.has(key(m.id, a))) ? "None" : "All"}
                              </button>
                            )}
                          </span>
                        </th>
                        {ACTIONS.map((a) => {
                          if (!m.actions.includes(a.id))
                            return (
                              <td key={a.id} className="matrix__na" aria-label={`${m.label} ${a.label}: not applicable`}>
                                –
                              </td>
                            );
                          const k = key(m.id, a.id);
                          const on = set.has(k);
                          const was = base?.has(k);
                          const diff = base ? (on && !was ? "added" : !on && was ? "removed" : "") : "";
                          const blocked = blockedForRole(a.id) && !on;
                          return (
                            <td key={a.id} className={`matrix__cell ${a.restricted ? "is-restricted" : ""} ${diff ? `is-${diff}` : ""}`}>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                aria-label={`${m.label}: ${a.label}${diff ? ` (${diff})` : ""}`}
                                className={`matrix__toggle ${on ? "is-on" : ""}`}
                                onClick={() => toggle(k)}
                                disabled={readOnly || blocked}
                                title={blocked ? "Reserved for the Checker operational profile" : a.description}
                              >
                                {on ? <Check size={13} strokeWidth={3} /> : diff === "removed" ? <Minus size={13} strokeWidth={3} /> : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!modules.length && <p className="matrix__empty">No modules match</p>}
      </div>
    </div>
  );
}

/** Lists permissions added and removed between two sets. */
export function PermissionDiff({ before, after }: { before: PermissionKey[]; after: PermissionKey[] }) {
  const added = after.filter((k) => !before.includes(k));
  const removed = before.filter((k) => !after.includes(k));
  const label = (k: PermissionKey) => `${MODULES.find((m) => m.id === parseKey(k).module)?.label}: ${ACTIONS.find((a) => a.id === parseKey(k).action)?.label}`;
  if (!added.length && !removed.length) return <p className="muted small">No permission changes</p>;
  return (
    <div className="diff">
      {added.length > 0 && (
        <div className="diff__col diff__col--added">
          <p className="diff__h">Added ({added.length})</p>
          <ul>
            {added.map((k) => (
              <li key={k}>{label(k)}</li>
            ))}
          </ul>
        </div>
      )}
      {removed.length > 0 && (
        <div className="diff__col diff__col--removed">
          <p className="diff__h">Removed ({removed.length})</p>
          <ul>
            {removed.map((k) => (
              <li key={k}>{label(k)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
