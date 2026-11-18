import type { ReactNode } from "react";
import { InfoTip } from "./primitives";

/**
 * The single container treatment for charts, tables and figure groups.
 * Every dashboard block uses it, so sections never invent their own card style.
 * Headings default to h4 (page h1 > group h2 > section h3 > panel h4).
 */
export function Panel({ title, subtitle, info, actions, children, className = "", span, padded = true, level = 4 }: { title?: string; subtitle?: ReactNode; info?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; span?: number; padded?: boolean; level?: 2 | 3 | 4 }) {
  const Heading = `h${level}` as "h2" | "h3" | "h4";
  return (
    <section className={`panel ${padded ? "panel--pad" : ""} ${span ? `span-${span}` : ""} ${className}`}>
      {(title || actions) && (
        <header className="panel__head">
          <div className="panel__titles">
            {title && (
              <Heading className="panel__title">
                {title}
                {info && <InfoTip label={`About ${title}`}>{info}</InfoTip>}
              </Heading>
            )}
            {subtitle && <p className="panel__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
