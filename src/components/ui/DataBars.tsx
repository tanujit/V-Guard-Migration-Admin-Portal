import { formatCompact, formatCount, formatPercent } from "@/lib/format";
import type { ShareItem } from "@/types/dashboard";

/** Fills for semantic tones. Strong variants: these are shapes, not text. */
const TONE_COLOR: Record<string, string> = {
  positive: "var(--positive-strong)",
  negative: "var(--negative-strong)",
  warning: "var(--warning-strong)",
  info: "var(--info-strong)",
  neutral: "var(--chart-neutral-1)",
  accent: "var(--grad-yellow)",
};

/** Default bar fill is the brand yellow gradient; explicit colours (programmes) and tones win. */
const BRAND_FILL = "var(--grad-amber)";
const MUTED_FILL = "var(--chart-neutral-2)";

function colorOf(item: ShareItem, fallback = BRAND_FILL) {
  return item.color ?? (item.tone ? TONE_COLOR[item.tone] : fallback);
}

/**
 * Ranked list with thin bars — the quiet companion to a main chart.
 * Rows are buttons when `onSelect` is given so every category drills down.
 */
export function RankedBars({ items, onSelect, highlightKey, valueFormat = formatCount, max }: { items: ShareItem[]; onSelect?: (item: ShareItem) => void; highlightKey?: string; valueFormat?: (n: number) => string; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const totalValue = items.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <ul className="ranked">
      {items.map((item) => {
        const inner = (
          <>
            <span className="ranked__label">{item.label}</span>
            <span className="ranked__value num">{valueFormat(item.value)}</span>
            <span className="ranked__share num">{formatPercent(item.value / totalValue, 0)}</span>
            <span className="ranked__track" aria-hidden="true">
              <span className="ranked__fill" style={{ width: `${(item.value / top) * 100}%`, background: highlightKey && item.key !== highlightKey ? MUTED_FILL : colorOf(item) }} />
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {onSelect ? (
              <button type="button" className="ranked__row ranked__row--btn" onClick={() => onSelect(item)}>
                {inner}
              </button>
            ) : (
              <div className="ranked__row">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One stacked bar for a share (status distribution), with a legend that doubles as drill targets. */
export function ShareBar({ items, onSelect, label }: { items: ShareItem[]; onSelect?: (item: ShareItem) => void; label: string }) {
  const totalValue = items.reduce((a, b) => a + b.value, 0);
  if (!totalValue) return null;
  return (
    <div className="sharebar">
      <div className="sharebar__bar" role="img" aria-label={`${label}: ${items.map((i) => `${i.label} ${formatCount(i.value)}`).join(", ")}`}>
        {items.map((i) => (i.value > 0 ? <span key={i.key} style={{ flexGrow: i.value, background: colorOf(i) }} title={`${i.label}: ${formatCount(i.value)}`} /> : null))}
      </div>
      <ul className="sharebar__legend">
        {items.map((i) => {
          const content = (
            <>
              <span className="legend-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />
              <span className="sharebar__name">{i.label}</span>
              <span className="sharebar__val num">{formatCompact(i.value)}</span>
              <span className="sharebar__pct num">{formatPercent(i.value / totalValue, 1)}</span>
            </>
          );
          return (
            <li key={i.key}>
              {onSelect ? (
                <button type="button" className="sharebar__item sharebar__item--btn" onClick={() => onSelect(i)}>
                  {content}
                </button>
              ) : (
                <div className="sharebar__item">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Compact label/value list for secondary figures. */
export function StatList({ items }: { items: { label: string; value: string; note?: string; onSelect?: () => void }[] }) {
  return (
    <dl className="statlist">
      {items.map((i) => (
        <div key={i.label} className="statlist__row">
          <dt>
            {i.onSelect ? (
              <button type="button" className="link-btn" onClick={i.onSelect}>
                {i.label}
              </button>
            ) : (
              i.label
            )}
            {i.note && <span className="statlist__note">{i.note}</span>}
          </dt>
          <dd className="num">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A row of small figures inside a panel (not cards — numbers separated by hairlines). */
export function FigureRow({ items }: { items: { label: string; value: string; sub?: string; tone?: "accent" | "negative" | "positive"; onSelect?: () => void }[] }) {
  return (
    <div className="figrow" style={{ ["--cols" as string]: items.length }}>
      {items.map((i) => {
        const body = (
          <>
            <span className="figrow__label">{i.label}</span>
            <span className={`figrow__value num ${i.tone ? `figrow__value--${i.tone}` : ""}`}>{i.value}</span>
            {i.sub && <span className="figrow__sub">{i.sub}</span>}
          </>
        );
        return i.onSelect ? (
          <button key={i.label} type="button" className="figrow__item figrow__item--btn" onClick={i.onSelect}>
            {body}
          </button>
        ) : (
          <div key={i.label} className="figrow__item">
            {body}
          </div>
        );
      })}
    </div>
  );
}
