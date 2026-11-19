/**
 * DATA MIGRATION RECONCILIATION (SOW 14.8, OP-MIG1) — pure comparison of a source snapshot (legacy
 * programme data) with the target platform. No legacy system is connected: `developmentSourceSnapshot`
 * is a DEVELOPMENT TEST SNAPSHOT derived from the current platform with deliberate, labelled
 * differences so every reconciliation path can be exercised. It is not legacy data. Reconciliation
 * reports differences; it never alters target data to force a match. Wallet buckets and the TDS
 * Kitty are compared separately, never summed.
 */
import type { ProgrammeCode } from "@/types/members";

export interface MemberRow { sourceRef: string; targetId: string | null; programme: ProgrammeCode; status: string; kyc: string; branchCode: string }
export interface WalletRow { memberId: string; programme: ProgrammeCode; available: number; scheme: number; redeemed: number }
export interface KittyRow { memberId: string; programme: ProgrammeCode; fy: string; kitty: number }
export interface HistoryRow { memberId: string; scans: string[]; redemptions: string[] }
export interface Snapshot { label: string; takenAt: string; members: MemberRow[]; wallets: WalletRow[]; kitty: KittyRow[]; history: HistoryRow[] }

export function developmentSourceSnapshot(target: Snapshot): Snapshot {
  const members = target.members.map((m) => ({ ...m, sourceRef: `LEG-${m.targetId}` }));
  // Deliberate test differences (labelled): a legacy member with no platform record, a duplicate legacy row and a wrong branch mapping.
  members.push({ sourceRef: "LEG-DEV-ONLY-0001", targetId: null, programme: "EP", status: "active", kyc: "verified", branchCode: "KL-BR-KOCHI" });
  if (members[3]) members.push({ ...members[3], sourceRef: `${members[3].sourceRef}-DUP` });
  if (members[5]) members[5] = { ...members[5], branchCode: "XX-BR-UNKNOWN" };
  const wallets = target.wallets.map((w, i) => (i === 2 ? { ...w, available: w.available + 50 } : i === 4 ? { ...w, scheme: w.scheme + 20 } : { ...w }));
  const kitty = target.kitty.map((k, i) => (i === 1 ? { ...k, kitty: k.kitty + 12 } : { ...k }));
  const dupAt = target.history.findIndex((h, i) => i > 0 && h.redemptions.length > 0);
  const history = target.history.map((h, i) => (i === 0 ? { ...h, scans: [...h.scans, "LEG-SCN-DEV-1", "LEG-SCN-DEV-2"] } : i === dupAt ? { ...h, redemptions: [...h.redemptions, h.redemptions[0]] } : { ...h }));
  return { label: "Development test snapshot (derived from the platform with labelled test differences; not legacy data)", takenAt: target.takenAt, members, wallets, kitty, history };
}

export function reconcileMembers(source: Snapshot, target: Snapshot) {
  const targetIds = new Set(target.members.map((m) => m.targetId));
  const seen = new Map<string, number>();
  source.members.forEach((m) => m.targetId && seen.set(m.targetId, (seen.get(m.targetId) ?? 0) + 1));
  const rows = source.members.map((m) => {
    const t = target.members.find((x) => x.targetId === m.targetId);
    const issues: string[] = [];
    if (!m.targetId || !targetIds.has(m.targetId)) issues.push("missing_member");
    if (m.targetId && (seen.get(m.targetId) ?? 0) > 1) issues.push("duplicate_member");
    if (t && t.branchCode !== m.branchCode) issues.push(m.branchCode.startsWith("XX-") ? "invalid_branch" : "member_mapping");
    if (t && t.programme !== m.programme) issues.push("invalid_programme");
    return { source: m, target: t ?? null, issues };
  });
  return { sourceCount: source.members.length, targetCount: target.members.length, matched: rows.filter((r) => !r.issues.length).length, missing: rows.filter((r) => r.issues.includes("missing_member")).length, duplicates: rows.filter((r) => r.issues.includes("duplicate_member")).length, failed: rows.filter((r) => r.issues.some((x) => x !== "missing_member" && x !== "duplicate_member")).length, rows };
}
/** Per member and per bucket: Available, Scheme and Redeemed are separate comparisons. */
export function reconcileWallets(source: Snapshot, target: Snapshot) {
  const rows = source.wallets.flatMap((s) => {
    const t = target.wallets.find((x) => x.memberId === s.memberId);
    return (["available", "scheme", "redeemed"] as const).map((bucket) => ({ memberId: s.memberId, programme: s.programme, bucket, source: s[bucket], target: t ? t[bucket] : null, difference: t ? t[bucket] - s[bucket] : null }));
  });
  return { rows, matched: rows.filter((r) => r.difference === 0).length, differences: rows.filter((r) => r.difference !== 0) };
}
export function reconcileKitty(source: Snapshot, target: Snapshot) {
  const rows = source.kitty.map((s) => {
    const t = target.kitty.find((x) => x.memberId === s.memberId && x.fy === s.fy);
    return { ...s, target: t?.kitty ?? null, difference: t ? t.kitty - s.kitty : null };
  });
  return { rows, matched: rows.filter((r) => r.difference === 0).length, differences: rows.filter((r) => r.difference !== 0) };
}
export function reconcileHistory(source: Snapshot, target: Snapshot, kind: "scans" | "redemptions") {
  let src = 0, tgt = 0, matched = 0, duplicates = 0;
  const missing: { memberId: string; ref: string }[] = [];
  for (const s of source.history) {
    const t = target.history.find((x) => x.memberId === s.memberId);
    const tset = new Set(t?.[kind] ?? []);
    const seen = new Set<string>();
    src += s[kind].length;
    for (const ref of s[kind]) {
      if (seen.has(ref)) { duplicates++; continue; }
      seen.add(ref);
      if (tset.has(ref)) matched++;
      else missing.push({ memberId: s.memberId, ref });
    }
  }
  target.history.forEach((t) => (tgt += t[kind].length));
  return { source: src, target: tgt, matched, missing, duplicates };
}
