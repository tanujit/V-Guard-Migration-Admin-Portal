/**
 * ACCESS LOG — who signed in, when and from where (SOW 9.6 access logs). Development build: the mock
 * authentication adapter has no IP address or device fingerprint, so location and device context say
 * so instead of inventing values. Append-only; kept in sessionStorage with the other mock stores.
 */
export interface AccessLogEvent {
  id: string;
  at: string;
  userId: string;
  action: "sign_in" | "identity_switch" | "sign_out";
  location: string;
  device: string;
  sessionRef: string;
}

const KEY = "vg-rishta.access-log.v1";
let memory: AccessLogEvent[] = [];
function read(): AccessLogEvent[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AccessLogEvent[]) : memory;
  } catch {
    return memory;
  }
}
export function accessLog(): AccessLogEvent[] {
  return read();
}
/** Records an access event. `at` defaults to the browser clock (access happens in real time). */
export function recordAccess(userId: string, action: AccessLogEvent["action"], at = new Date().toISOString().slice(0, 16)): AccessLogEvent {
  const list = read();
  const e: AccessLogEvent = { id: `ACL-${String(list.length + 1).padStart(6, "0")}`, at, userId, action, location: "Not captured (mock authentication adapter)", device: typeof navigator !== "undefined" ? navigator.userAgent.split(") ")[0].split("(")[1] ?? "Browser" : "Node test runner", sessionRef: `SES-${Math.abs(hash(`${userId}|${at}|${list.length}`)).toString(36).toUpperCase()}` };
  memory = [...list, e];
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* node */
  }
  return e;
}
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
