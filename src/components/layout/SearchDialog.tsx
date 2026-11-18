import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, LayoutDashboard, Search } from "lucide-react";
import { ALL_NAV_ITEMS } from "@/config/navigation";
import { DASHBOARD_GROUPS, DASHBOARD_SECTIONS } from "@/config/dashboardSections";
import { useSession } from "@/context/SessionContext";

interface Result {
  id: string;
  label: string;
  meta: string;
  to: string;
  planned: boolean;
  Icon: typeof LayoutDashboard;
}

/**
 * Global search entry point. Phase 1 searches portal modules and dashboard sections; record search
 * (members, scans, tickets) will plug in here once those modules exist.
 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const { can } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo<Result[]>(
    () => [
      ...DASHBOARD_SECTIONS.map((s) => ({ id: `sec-${s.id}`, label: s.title, meta: `Dashboard · ${DASHBOARD_GROUPS.find((g) => g.id === s.group)?.label ?? "Section"}`, to: `/#sec-${s.id}`, planned: false, Icon: s.icon })),
      ...ALL_NAV_ITEMS.filter((i) => can(i.permission) && !i.action).map((i) => ({ id: i.id, label: i.label, meta: i.status === "planned" ? `${i.group.label} · later phase` : i.group.label, to: i.path, planned: i.status === "planned", Icon: i.icon })),
    ],
    [can],
  );

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? all.filter((r) => r.label.toLowerCase().includes(t) || r.meta.toLowerCase().includes(t)) : all).slice(0, 12);
  }, [q, all]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const go = (r: Result) => {
    onClose();
    navigate(r.to);
  };

  return createPortal(
    <div className="overlay overlay--top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search the portal">
        <div className="search-dialog__field">
          <Search size={18} strokeWidth={1.5} aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter" && results[index]) go(results[index]);
            }}
            placeholder="Search modules and dashboard sections"
            aria-label="Search modules and dashboard sections"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={results[index] ? `sr-${results[index].id}` : undefined}
          />
          <kbd className="keycap">Esc</kbd>
        </div>
        <ul id="search-results" className="search-dialog__list" role="listbox">
          {results.map((r, i) => (
            <li key={r.id} id={`sr-${r.id}`} role="option" aria-selected={i === index}>
              <button type="button" className={`search-dialog__item ${i === index ? "is-active" : ""}`} onMouseEnter={() => setIndex(i)} onClick={() => go(r)}>
                <r.Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                <span className="search-dialog__label">{r.label}</span>
                <span className="search-dialog__meta">{r.meta}</span>
                {i === index && <CornerDownLeft size={14} strokeWidth={1.75} aria-hidden="true" className="search-dialog__enter" />}
              </button>
            </li>
          ))}
          {!results.length && <li className="search-dialog__empty">No modules or sections match “{q}”</li>}
        </ul>
        <p className="search-dialog__foot">Member, scan and ticket search arrives with those modules</p>
      </div>
    </div>,
    document.body,
  );
}
