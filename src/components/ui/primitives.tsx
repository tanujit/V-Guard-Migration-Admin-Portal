import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Info, RotateCw } from "lucide-react";
import { getProgramme } from "@/config/programmes";
import type { StatusTone } from "@/types/domain";

/* ---------- Programme chip (the portal's signature detail) ---------- */

export function ProgrammeTag({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  const p = getProgramme(code);
  return (
    <span className={`prog-tag prog-tag--${size}`} title={p ? `Programme ${p.name}` : code}>
      <span className="prog-tag__mark" style={{ background: p?.color ?? "var(--chart-neutral-1)" }} aria-hidden="true" />
      {code}
    </span>
  );
}

/* ---------- Status badge ---------- */

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`status status--${tone}`}>
      <span className="status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ---------- Demo data marker ---------- */

export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="demo-badge" title="Development data generated in the browser. Not connected to V-Guard systems.">
      {label}
    </span>
  );
}

/* ---------- Info tooltip (hover, focus and click) ---------- */

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="infotip" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="infotip__btn" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        <Info size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <span role="tooltip" id={id} className="infotip__panel">
          {children}
        </span>
      )}
    </span>
  );
}

/* ---------- States ---------- */

export function EmptyState({ title, children, compact }: { title: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={`state-block ${compact ? "state-block--compact" : ""}`}>
      <Inbox size={18} strokeWidth={1.5} aria-hidden="true" />
      <div>
        <p className="state-block__title">{title}</p>
        {children && <p className="state-block__body">{children}</p>}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block state-block--error" role="alert">
      <AlertTriangle size={18} strokeWidth={1.5} aria-hidden="true" />
      <div>
        <p className="state-block__title">This section could not load</p>
        <p className="state-block__body">{message}</p>
      </div>
      {onRetry && (
        <button className="btn btn--secondary btn--sm" onClick={onRetry}>
          <RotateCw size={14} strokeWidth={1.75} aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius = 6 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function SectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="section-skeleton" aria-busy="true" aria-label="Loading">
      <div className="grid grid--4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel panel--pad">
            <Skeleton width="50%" height={12} />
            <div style={{ height: 12 }} />
            <Skeleton width="70%" height={28} />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="panel panel--pad">
          <Skeleton width="30%" height={14} />
          <div style={{ height: 16 }} />
          <Skeleton height={200} radius={8} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`segmented__opt ${value === o.value ? "is-active" : ""}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Labelled select ---------- */

export function SelectField({ label, value, onChange, options, disabled, hideLabel, id, active, hint }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean; hideLabel?: boolean; id?: string; active?: boolean; hint?: string }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="field">
      <label htmlFor={fieldId} className={hideLabel ? "sr-only" : "field__label"}>
        {label}
      </label>
      <select id={fieldId} className={`select ${active ? "is-set" : ""}`} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} title={disabled ? hint : undefined} aria-describedby={disabled && hint ? `${fieldId}-hint` : undefined}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {disabled && hint && (
        <span id={`${fieldId}-hint`} className="sr-only">
          {hint}
        </span>
      )}
    </div>
  );
}
