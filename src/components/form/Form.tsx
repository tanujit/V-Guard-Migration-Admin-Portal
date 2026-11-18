import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

/* ---------------- Text inputs ---------------- */

interface BaseField {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
}

function FieldShell({ id, label, error, hint, required, children }: BaseField & { id: string; children: ReactNode }) {
  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {required && (
          <span className="field__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <span id={`${id}-err`} className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextField({ label, value, onChange, error, hint, required, type = "text", placeholder, autoComplete, disabled, inputMode }: BaseField & { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; autoComplete?: string; disabled?: boolean; inputMode?: "email" | "tel" | "text" | "numeric" }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} disabled={disabled} inputMode={inputMode} aria-invalid={!!error} aria-required={required} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} />
    </FieldShell>
  );
}

export function TextArea({ label, value, onChange, error, hint, required, rows = 3, placeholder }: BaseField & { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <textarea id={id} className="input input--area" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error} aria-required={required} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} />
    </FieldShell>
  );
}

export function SelectInput({ label, value, onChange, options, error, hint, required, disabled }: BaseField & { value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; disabled?: boolean }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <select id={id} className={`select ${value ? "" : "is-empty"}`} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-invalid={!!error} aria-required={required}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, checked, onChange, description, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`checkbox ${disabled ? "is-disabled" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="checkbox__box" aria-hidden="true">
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="checkbox__text">
        <span className="checkbox__label">{label}</span>
        {description && <span className="checkbox__desc">{description}</span>}
      </span>
    </label>
  );
}

export function RadioCards<T extends string>({ name, value, onChange, options, label }: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; description?: string; disabled?: boolean }[]; label: string }) {
  return (
    <fieldset className="radio-cards">
      <legend className="field__label">{label}</legend>
      <div className="radio-cards__grid">
        {options.map((o) => (
          <label key={o.value} className={`radio-card ${value === o.value ? "is-checked" : ""} ${o.disabled ? "is-disabled" : ""}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} disabled={o.disabled} />
            <span className="radio-card__label">{o.label}</span>
            {o.description && <span className="radio-card__desc">{o.description}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------------- Multi-select ---------------- */

export interface MultiOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
}

/** Searchable checkbox list in a popover. Keyboard: Enter/Space toggles, Esc closes. */
export function MultiSelect({ label, options, value, onChange, placeholder = "Select", disabled, error, hint, emptyText = "No options" }: BaseField & { options: MultiOption[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean; emptyText?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())), [options, q]);
  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={`field multi ${error ? "field--error" : ""}`} ref={ref} onKeyDown={onKey}>
      <span className="field__label" id={`${id}-label`}>
        {label}
      </span>
      <button type="button" className={`select multi__trigger ${value.length ? "is-set" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen((o) => !o)} disabled={disabled}>
        <span id={`${id}-value`} className="multi__value">
          {selectedLabels.length === 0 ? <span className="muted">{placeholder}</span> : selectedLabels.length <= 2 ? selectedLabels.join(", ") : `${selectedLabels.length} selected`}
        </span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="multi__panel" role="listbox" aria-multiselectable="true" aria-labelledby={`${id}-label`}>
          {options.length > 6 && (
            <div className="multi__search">
              <Search size={14} strokeWidth={2} aria-hidden="true" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${label}`} />
            </div>
          )}
          <div className="multi__bulk">
            <button type="button" className="link-btn" onClick={() => onChange(Array.from(new Set([...value, ...filtered.filter((o) => !o.disabled).map((o) => o.value)])))}>
              Select all{q ? " shown" : ""}
            </button>
            <button type="button" className="link-btn" onClick={() => onChange([])} disabled={!value.length}>
              Clear
            </button>
          </div>
          <ul className="multi__list">
            {filtered.map((o, i) => (
              <li key={o.value}>
                {o.group && o.group !== filtered[i - 1]?.group && <span className="multi__group">{o.group}</span>}
                <Checkbox label={o.label} checked={value.includes(o.value)} onChange={() => toggle(o.value)} disabled={o.disabled} />
              </li>
            ))}
            {!filtered.length && <li className="multi__empty">{emptyText}</li>}
          </ul>
        </div>
      )}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

/* ---------------- Stepper & tabs ---------------- */

export function Stepper({ steps, current, onSelect, maxReached }: { steps: string[]; current: number; onSelect: (i: number) => void; maxReached: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i === current ? "current" : i < current || i <= maxReached ? "done" : "todo";
        return (
          <li key={s} className={`stepper__step is-${state}`}>
            <button type="button" onClick={() => onSelect(i)} disabled={i > maxReached} aria-current={i === current ? "step" : undefined}>
              <span className="stepper__num">{i < current ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : i + 1}</span>
              <span className="stepper__label">{s}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; label: string }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1} className={`tabs__tab ${value === t.id ? "is-active" : ""}`} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}
          {t.count !== undefined && <span className="tabs__count num">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
