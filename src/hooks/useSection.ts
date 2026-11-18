import { useCallback, useEffect, useRef, useState } from "react";
import { useFilters } from "@/context/FilterContext";
import { useSession } from "@/context/SessionContext";
import { loadSection, type SectionKey } from "@/services/dashboardService";
import type { DashboardDataSource } from "@/services/dashboardSource";

type Payload<K extends SectionKey> = Awaited<ReturnType<DashboardDataSource[K]>>;

export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refreshedAt: string | null;
  refresh: () => void;
}

/**
 * Loads a dashboard section and reloads it whenever the global filters, extra args or the page's
 * refresh-all token change. Stale responses are discarded so quick filter changes never show
 * out-of-order data.
 */
export function useSection<K extends SectionKey>(key: K, args: unknown[] = [], refreshToken = 0): SectionState<Payload<K>> {
  const { filters } = useFilters();
  const { user } = useSession();
  const scopeKey = JSON.stringify(user?.scope ?? null);
  const [state, setState] = useState<{ data: Payload<K> | null; loading: boolean; error: string | null; refreshedAt: string | null }>({ data: null, loading: true, error: null, refreshedAt: null });
  const [tick, setTick] = useState(0);
  const lastToken = useRef(refreshToken);
  const manual = useRef(false);
  const argsKey = JSON.stringify(args);

  useEffect(() => {
    let alive = true;
    const isManual = manual.current || lastToken.current !== refreshToken;
    lastToken.current = refreshToken;
    manual.current = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadSection(key, filters, { manual: isManual, args: JSON.parse(argsKey) as unknown[], scope: JSON.parse(scopeKey) ?? undefined })
      .then((res) => alive && setState({ data: res.data as Payload<K>, loading: false, error: null, refreshedAt: res.refreshedAt }))
      .catch((e: unknown) => alive && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Something went wrong" })));
    return () => {
      alive = false;
    };
  }, [key, filters, argsKey, tick, refreshToken, scopeKey]);

  const refresh = useCallback(() => {
    manual.current = true;
    setTick((t) => t + 1);
  }, []);

  return { ...state, refresh };
}
