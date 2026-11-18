import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Keeps focus inside an overlay, restores it on close and closes on Escape. */
function useOverlayFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute("disabled"));
    (focusables()[0] ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const els = focusables();
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useOverlayFocus(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ref={ref} tabIndex={-1} style={{ width: `min(${width}px, 100vw)` }}>
        <header className="drawer__head">
          <div>
            <h2 id="drawer-title" className="drawer__title">
              {title}
            </h2>
            {subtitle && <div className="drawer__subtitle">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, tone = "default", onConfirm, onCancel }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; tone?: "default" | "danger"; onConfirm: () => void; onCancel: () => void }) {
  const ref = useOverlayFocus(open, onCancel);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay--center" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-body" ref={ref} tabIndex={-1}>
        <h2 id="dialog-title" className="dialog__title">
          {title}
        </h2>
        <div id="dialog-body" className="dialog__body">
          {body}
        </div>
        <div className="dialog__actions">
          <button className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${tone === "danger" ? "btn--danger" : "btn--primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
