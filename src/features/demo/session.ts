/**
 * Client Demo session (start-up core, kept small). Holds whether a demo session is running, the
 * loaded scenario, its starting baseline, manually ticked steps and history. The heavy parts (state
 * metrics, scan pipeline, snapshots, resets) live in ./store and load only with the Demo Centre or the
 * scenario panel. Session data is development data in sessionStorage.
 */
import { useSyncExternalStore } from "react";
import { demoNow } from "@/features/approvals/store";
import type { DemoMetric } from "@/config/demoScenarios";

export const SESSION_KEY = "vg-rishta.demo-session.v1";
export interface ScenarioRun { scenarioId: string; startedAt: string; endedAt: string | null; completed: number; total: number; reset: boolean }
export interface DemoSession {
  active: boolean;
  startedAt: string | null;
  scenarioId: string | null;
  scenarioStartedAt: string | null;
  baseline: Partial<Record<DemoMetric, number>> | null;
  manualDone: number[];
  currentStep: number;
  lastResetAt: string | null;
  history: ScenarioRun[];
  panelOpen: boolean;
}
const EMPTY: DemoSession = { active: false, startedAt: null, scenarioId: null, scenarioStartedAt: null, baseline: null, manualDone: [], currentStep: 0, lastResetAt: null, history: [], panelOpen: true };

let state: DemoSession = (() => {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as DemoSession) };
  } catch {
    /* default */
  }
  return EMPTY;
})();
const listeners = new Set<() => void>();
export function setSession(next: DemoSession) {
  state = next;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const demoSessionStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useDemoSession = () => useSyncExternalStore(demoSessionStore.subscribe, demoSessionStore.get, demoSessionStore.get);
export const simClock = () => demoNow();

export const startDemoSession = () => setSession({ ...state, active: true, startedAt: simClock() });
export const endDemoSession = () => setSession({ ...state, active: false, scenarioId: null, baseline: null, manualDone: [], currentStep: 0, history: state.history.map((h) => (h.endedAt ? h : { ...h, endedAt: simClock() })) });
export const setStep = (n: number) => setSession({ ...state, currentStep: n });
export const togglePanel = () => setSession({ ...state, panelOpen: !state.panelOpen });
export const toggleManual = (n: number) => setSession({ ...state, manualDone: state.manualDone.includes(n) ? state.manualDone.filter((x) => x !== n) : [...state.manualDone, n] });
