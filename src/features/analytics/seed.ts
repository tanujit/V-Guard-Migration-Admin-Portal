/**
 * ANALYTICS DEVELOPMENT SEED (Phase 12).
 * The only records built here are the mock scan-service adapter output (Scanning Management is not a
 * connected service in this build) and the parent-child links derived from the eSeal pack mappings.
 * Every Scan-Out that earned points is a Wallet ledger credit; Scan-In records never carry points;
 * failed attempts come from Phase 10 duplicate-QR rejections and geo-fence blocks. Channel and claim
 * IDs are what the mock scan service records — a missing channel stays missing (Unmapped).
 */
import { ANALYTICS_DECISIONS, KPI_SEED } from "@/config/analyticsCatalogue";
import { hash01 } from "@/data/mock/random";
import { fullLedger } from "@/features/wallet/engine";
import type { MasterState } from "@/features/masters/engine";
import type { MemberState } from "@/features/members/engine";
import type { AnalyticsState, ParentChildLink, ScanRecord } from "@/types/analytics";
import type { OpsState } from "@/types/ops";
import type { RiskState } from "@/types/risk";
import type { SchemeState } from "@/types/schemes";
import type { WalletState } from "@/types/wallet";
import { addDays, geoOf } from "./engine";

export interface AnalyticsSources { mem: MemberState; ws: WalletState; ss: SchemeState; ms: MasterState; rs: RiskState; os: OpsState; now: string }

const pad = (n: number, w = 6) => String(n).padStart(w, "0");
const channelOf = (id: string): ScanRecord["channel"] => { const h = hash01(`${id}|channel`); return h < 0.04 ? null : h < 0.12 ? "pos" : h < 0.24 ? "web" : "app"; };

export function buildScans(src: AnalyticsSources): ScanRecord[] {
  const { mem, ws, ss, ms, rs } = src;
  const lines = fullLedger(ws, ss, mem);
  const byId = new Map(mem.members.map((m) => [m.id, m]));
  const sku = (code: string | null | undefined) => (code ? ms.skus.find((s) => s.code === code || s.id === code) : undefined);
  const prod = (skuId: string | undefined) => (skuId ? ms.products.find((p) => p.id === ms.skus.find((s) => s.id === skuId)?.productId) : undefined);
  const geoScan = new Map(rs.geoFence.map((g) => [g.scan.scanRef, g]));
  const out: ScanRecord[] = [];
  const add = (r: Omit<ScanRecord, "id" | "claimId" | "qrMasked" | "channel" | "location" | "salesperson" | "scannedBy" | "skuId" | "categoryId" | "subCategoryId" | "source"> & { key: string; source?: string }) => {
    const { key, source, ...rest } = r;
    const m = byId.get(rest.memberId);
    if (!m) return;
    const id = `SCT-${pad(out.length + 1)}`;
    const k = sku(rest.skuCode);
    const p = prod(k?.id);
    const g = geoScan.get(key);
    const geo = geoOf(rest.branchCode);
    out.push({
      ...rest, id, claimId: `CLM-${Math.floor(hash01(`${key}|claim`) * 9e8 + 1e8)}`, qrMasked: `QR••••${Math.floor(hash01(`${key}|qr`) * 9000 + 1000)}`,
      channel: channelOf(key), scannedBy: m.id, skuId: k?.id ?? null, categoryId: p?.categoryId ?? null, subCategoryId: p?.subCategoryId ?? null,
      location: g ? { lat: g.scan.lat, lng: g.scan.lng, label: g.scan.location, source: "Device location (scan geo-fence check)" } : { lat: null, lng: null, label: `${geo.districtName}, ${geo.stateName}`, source: "Member branch (no device location supplied)" },
      salesperson: m.sr, source: source ?? "Mock scan-service adapter",
    });
  };

  // Scan-Out that earned points: every scan credit (wallet service) and every scheme base credit (Phase 6 scans).
  for (const l of lines.filter((x) => (x.type === "scan_credit" || x.type === "base_credit") && (x.bucket === "available" || x.bucket === "pending"))) {
    add({ key: l.ref, memberId: l.memberId, programme: l.programme, skuCode: l.skuCode ?? "", type: "scan_out", at: l.at, branchCode: l.branchCode, status: l.status === "pending" ? "pending_validation" : "success", failureReason: null, points: l.gross ?? l.points, ledgerRef: l.id, schemeRef: l.schemeId ?? null });
  }
  // Scheme scans that earned no base points (excluded or out of scope) are still successful scans.
  const credited = new Set(lines.filter((l) => l.type === "base_credit").map((l) => l.ref));
  for (const t of ss.txns.filter((x) => x.kind === "scan" && !credited.has(x.id))) {
    add({ key: t.id, memberId: t.memberId, programme: t.programme as ScanRecord["programme"], skuCode: ms.skus.find((s) => s.id === t.skuId)?.code ?? t.skuId, type: "scan_out", at: `${t.date}T12:00`, branchCode: t.branchCode, status: "success", failureReason: null, points: 0, ledgerRef: null, schemeRef: null });
  }
  // Failed Scan-Out attempts recorded by Phase 10: duplicate QR rejections and geo-fence blocks.
  for (const d of rs.duplicateQr) {
    const m = byId.get(d.attempt.memberId);
    if (m) add({ key: d.rejectionRef, memberId: m.id, programme: d.attempt.programme, skuCode: ms.skus.find((s) => s.id === d.skuId)?.code ?? "", type: "scan_out", at: d.attempt.at, branchCode: d.attempt.branchCode, status: "failed", failureReason: "Duplicate QR: already scanned", points: 0, ledgerRef: null, schemeRef: null, source: "Fraud & Risk duplicate-QR rejection" });
  }
  for (const g of rs.geoFence.filter((x) => x.result === "outside_blocked" || x.result === "gps_denied")) {
    const m = byId.get(g.memberId);
    if (m) add({ key: g.scan.scanRef, memberId: m.id, programme: g.programme, skuCode: "", type: "scan_out", at: g.scan.at, branchCode: g.scan.branchCode ?? m.branchCode, status: "failed", failureReason: g.result === "gps_denied" ? "Location permission denied" : "Outside the 100 m geo-fence", points: 0, ledgerRef: null, schemeRef: null, source: "Fraud & Risk geo-fence check" });
  }
  // Scan-In (stock received) by Retailers and DDs. Scan-In never pays points.
  const outs = out.filter((s) => s.type === "scan_out" && s.status === "success" && (s.programme === "Retailer" || s.programme === "DD"));
  outs.filter((_, i) => i % 2 === 0).forEach((s) => {
    const failed = hash01(`${s.id}|in`) < 0.04;
    add({ key: `${s.id}-IN`, memberId: s.memberId, programme: s.programme, skuCode: s.skuCode, type: "scan_in", at: `${addDays(s.at, -1 - Math.floor(hash01(`${s.id}|lag`) * 3))}T${s.at.slice(11, 16)}`, branchCode: s.branchCode, status: failed ? "failed" : "success", failureReason: failed ? "Product not found in eSeal" : null, points: 0, ledgerRef: null, schemeRef: null });
  });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function buildParentChild(src: AnalyticsSources, scans: ScanRecord[]): ParentChildLink[] {
  const out: ParentChildLink[] = [];
  src.os.packs.forEach((p, i) => {
    for (let pack = 0; pack < 2; pack++) {
      const parentPack = `PPK-${String(i + 1).padStart(3, "0")}-${pack + 1}`;
      const childScans = scans.filter((s) => s.type === "scan_out" && s.skuCode === p.childSku && s.status === "success");
      for (let c = 0; c < 3; c++) {
        const missing = p.status === "missing_child" && c === 2;
        const scan = missing ? undefined : childScans[(pack * 3 + c) % Math.max(1, childScans.length)];
        out.push({ id: `PCL-${String(out.length + 1).padStart(4, "0")}`, parentPack, parentSku: p.parentSku, childUnit: `${parentPack}-C${c + 1}`, childSku: p.childSku, childScanId: scan && c < 2 ? scan.id : null, mappingSource: p.source, status: missing ? "mapping_missing" : scan && c < 2 ? "scanned" : "not_scanned" });
      }
    }
  });
  return out;
}

export function buildAnalyticsSeed(src: AnalyticsSources): AnalyticsState {
  const scans = buildScans(src);
  return {
    kpis: KPI_SEED.map((k) => ({ ...k, versions: [...k.versions] })),
    kpiChanges: [],
    scans,
    parentChild: buildParentChild(src, scans),
    executions: [],
    exports: [],
    schedules: [],
    runs: [],
    thresholds: [],
    alerts: [],
    decisions: ANALYTICS_DECISIONS.map((d) => ({ ...d })),
    config: { churnedDays: null, slowMovingDays: null, salespersonField: "pending_business_confirmation", parentChildVisibility: "pending_business_confirmation", unavailable: [] },
    refreshedAt: src.now,
    audit: [],
  };
}
