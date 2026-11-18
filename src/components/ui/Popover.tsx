import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Anchored menu/panel that closes on outside click and Escape, returning focus to its trigger. */
export function Popover({ trigger, children, align = "end", label, width = 320 }: { trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode; children: (close: () => void) => ReactNode; align?: "start" | "end"; label: string; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (ref.current?.querySelector("[data-popover-trigger]") as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="popover" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open && (
        <div id={id} className={`popover__panel popover__panel--${align}`} role="dialog" aria-label={label} style={{ width: `min(${width}px, calc(100vw - 32px))` }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
