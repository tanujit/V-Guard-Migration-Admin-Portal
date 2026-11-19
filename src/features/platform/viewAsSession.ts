/**
 * VIEW-AS SESSION CORE (SOW 10.7) — loaded at start-up, kept small.
 * Holds View-As sessions and attempts and registers the read-only guard in the central permission
 * check: while a staff member has an active session, every action other than View is refused for
 * them in every module (service layer, not just hidden buttons). Sessions end on Exit, sign-out or
 * after the configured inactivity period. Records are append-only: no edit or delete is exposed.
 * Starting a session (scope and override checks) lives in features/platform/viewAs.ts.
 */
import { useSyncExternalStore } from "react";
import { registerSessionGuard } from "@/features/access/engine";
import type { ViewAsAttempt, ViewAsSession } from "@/types/platform";

const KEY = "vg-rishta.view-as.v1";
interface State { sessions: ViewAsSession[]; attempts: ViewAsAttempt[]; idleMinutes: number; idleStatus: "development_setting" | "confirmed" }
/** Development value: the SOW does not specify the inactivity period (OP-VIEWAS1). */
export const DEFAULT_IDLE_MINUTES = 15;

let state: State = load();
const listeners = new Set<() => void>();
function load(): State {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* node / blocked storage */
  }
  return { sessions: [], attempts: [], idleMinutes: DEFAULT_IDLE_MINUTES, idleStatus: "development_setting" };
}
function set(next: State) {
  state = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const viewAsStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useViewAsState = () => useSyncExternalStore(viewAsStore.subscribe, viewAsStore.get, viewAsStore.get);

export const clientContext = () => ({
  ip: "Not captured (mock authentication adapter; supplied by the gateway in production)",
  device: typeof navigator !== "undefined" && navigator.userAgent ? (navigator.userAgent.split(") ")[0].split("(")[1] ?? navigator.userAgent).slice(0, 80) : "Node test runner",
});

/** The user's open session, ending it first if it has been idle past the configured period. */
export function activeSession(userId: string, now = Date.now()): ViewAsSession | null {
  const s = state.sessions.find((x) => x.adminId === userId && x.endedAt == null);
  if (!s) return null;
  if (now - s.lastActivityAt > state.idleMinutes * 60_000) {
    endSession(userId, "inactivity_timeout", s.lastActivityAt + state.idleMinutes * 60_000);
    return null;
  }
  return s;
}
/** Activity is recorded at most every 15 seconds: enough for a minutes-long inactivity timeout, and a
 *  render that reads the member view never writes the store again (which would re-render in a loop). */
const TOUCH_GRANULARITY_MS = 15_000;
export function touchSession(userId: string, now = Date.now()) {
  const s = activeSession(userId, now);
  if (s && now - s.lastActivityAt >= TOUCH_GRANULARITY_MS) set({ ...state, sessions: state.sessions.map((x) => (x.id === s.id ? { ...x, lastActivityAt: now } : x)) });
}
export function endSession(userId: string, reason: NonNullable<ViewAsSession["exitReason"]>, now = Date.now()) {
  const s = state.sessions.find((x) => x.adminId === userId && x.endedAt == null);
  if (!s) return null;
  const ended = { ...s, endedAt: now, exitReason: reason };
  set({ ...state, sessions: state.sessions.map((x) => (x.id === s.id ? ended : x)) });
  return ended;
}
/** Internal: used by viewAs.ts after the access decision. */
export function recordSession(s: Omit<ViewAsSession, "id">): ViewAsSession {
  const id = `VAS-${String(state.sessions.length + 1).padStart(5, "0")}`;
  const session = { ...s, id };
  set({ ...state, sessions: [...state.sessions, session] });
  return session;
}
export function recordAttempt(a: Omit<ViewAsAttempt, "id">): ViewAsAttempt {
  const attempt = { ...a, id: `VAA-${String(state.attempts.length + 1).padStart(5, "0")}` };
  set({ ...state, attempts: [...state.attempts, attempt] });
  return attempt;
}
export function setIdleMinutesCore(minutes: number) {
  set({ ...state, idleMinutes: minutes });
}
export const durationSec = (s: ViewAsSession, now = Date.now()) => Math.round(((s.endedAt ?? now) - s.startedAt) / 1000);

/* Read-only guard: only View is allowed while the user's View-As session is open. */
registerSessionGuard((userId, _module, action) => {
  if (action === "view") return null;
  const s = activeSession(userId);
  return s ? `Read-only View-As session ${s.id} (member ${s.memberId}) is active: exit View-As before making any change` : null;
});
