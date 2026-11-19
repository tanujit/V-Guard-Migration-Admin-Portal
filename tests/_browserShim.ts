/**
 * Test shim: gives the module stores a browser-like sessionStorage, and replaces fetch with a recorder
 * that fails the call — so the suite can prove persistence, snapshots and resets, and that no simulated
 * action reaches the network. Imported first by tests/demo.test.ts.
 */
class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
export const networkCalls: string[] = [];
const g = globalThis as unknown as Record<string, unknown>;
g.window = { sessionStorage: new MemoryStorage(), localStorage: new MemoryStorage(), location: { reload() {} }, navigator: { userAgent: "Node test runner" } };
g.fetch = (url: unknown) => { networkCalls.push(String(url)); return Promise.reject(new Error("Network disabled in the simulation test")); };
