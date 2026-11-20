import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { SectionSkeleton } from "@/components/ui/primitives";
import { useSession } from "@/context/SessionContext";
import { storageGet, storageSet } from "@/lib/csv";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

const COLLAPSE_KEY = "vg-rishta.sidebar-collapsed";

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => storageGet(COLLAPSE_KEY, false));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const { signOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMobileOpen(false);
    if (!location.hash) {
      window.scrollTo({ top: 0 });
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      storageSet(COLLAPSE_KEY, !c);
      return !c;
    });

  return (
    <div className={`shell ${collapsed ? "shell--collapsed" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onRequestSignOut={() => setConfirmSignOut(true)} />
      <div className="shell__main">
        <Header onOpenMobileNav={() => setMobileOpen(true)} onRequestSignOut={() => setConfirmSignOut(true)} />
        <main id="main" className="shell__content" ref={mainRef} tabIndex={-1}>
          <RouteErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of the portal"
        body="You will need to sign in again to continue. Filters you set on the dashboard are kept for this browser session."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut();
          navigate("/signed-out", { replace: true });
        }}
      />
    </div>
  );
}

/** Shown while a page's code loads for the first time (route-level code splitting). */
function PageLoading() {
  return (
    <div className="page">
      <p className="sr-only" role="status">
        Loading page
      </p>
      <SectionSkeleton rows={2} />
    </div>
  );
}

/** Standard page frame: title row plus content, capped at the content width. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}

/**
 * Page title row. `variant="hero"` renders the dark brand banner used by the dashboard. Descriptions
 * and eyebrows are accepted for compatibility but not shown: the portal keeps headers to the title.
 */
export function PageHeader({ title, meta, actions, variant = "plain" }: { title: string; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; variant?: "plain" | "hero"; eyebrow?: string }) {
  return (
    <div className={`page-head ${variant === "hero" ? "page-head--hero" : ""}`}>
      <div className="page-head__text">
        <h1 className="page-head__title">{title}</h1>
        {meta && <div className="page-head__meta">{meta}</div>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}
