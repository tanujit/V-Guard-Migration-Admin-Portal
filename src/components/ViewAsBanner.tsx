import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, LogOut } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { activeSession, useViewAsState, viewAsStore } from "@/features/platform/viewAsSession";

/**
 * Persistent READ-ONLY VIEW-AS MODE banner (SOW 10.7). Shown on every page while the signed-in staff
 * member has an open View-As session; checks inactivity every 30 seconds. Exit goes through the
 * platform service so the end of the session is audited.
 */
export function ViewAsBanner() {
  const { user } = useSession();
  useViewAsState();
  const nav = useNavigate();
  const uid = user?.id ?? "";
  const s = uid ? activeSession(uid) : null;
  useEffect(() => {
    if (!uid) return;
    const t = window.setInterval(() => activeSession(uid), 30_000);
    return () => window.clearInterval(t);
  }, [uid]);
  if (!s) return null;
  const exit = () => import("@/features/platform/store").then((m) => { m.endViewAs(uid, "exit"); nav("/governance/platform/view-as"); });
  return (
    <div className="viewas-banner" role="status" aria-live="polite">
      <Eye size={16} aria-hidden="true" />
      <strong>READ-ONLY VIEW-AS MODE</strong>
      <span>Member <span className="mono">{s.memberId}</span> · started by {uid}{s.override ? " under HO / Admin override" : ""} · ends after {viewAsStore.get().idleMinutes} min of inactivity · every change is blocked</span>
      <Link to="/governance/platform/view-as/session" className="viewas-banner__link">Member view</Link>
      <button type="button" className="viewas-banner__exit" onClick={exit}><LogOut size={14} aria-hidden="true" />Exit View-As</button>
    </div>
  );
}
