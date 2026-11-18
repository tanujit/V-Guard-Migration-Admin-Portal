/**
 * MOCK MEMBER DATA — development only. Names, mobiles and addresses are fictional; Aadhaar, PAN,
 * bank, UPI and GST values exist only in masked form and never in full. Fixed records support the
 * Phase 5 scenarios; the rest are generated deterministically.
 */
import { GEOGRAPHY } from "@/config/geography";
import { requirementOf } from "@/config/memberProgrammes";
import { hash01, pick } from "@/data/mock/random";
import type { Address, DocStatus, DocType, KycDocument, Member, MemberDecision, MemberEvent, MemberIdentity, ProgrammeCode, RegistrationSource, RegistrationStatus, Restriction } from "@/types/members";

const BRANCHES = GEOGRAPHY.flatMap((s) => s.districts.flatMap((d) => d.branches.map((b) => ({ code: b.code, name: b.name, district: d.name, state: s.name, stateCode: s.code }))));
const branch = (code: string) => BRANCHES.find((b) => b.code === code)!;
const FIRST = ["Anil", "Biju", "Chandran", "Deepak", "Faisal", "Gopi", "Hari", "Imran", "Jayan", "Kiran", "Lijo", "Manoj", "Naveen", "Prakash", "Rajesh", "Sajan", "Shibu", "Suresh", "Tomy", "Vinod", "Asha", "Bindu", "Divya", "Lekha", "Meena", "Nisha", "Rekha", "Sheela", "Usha", "Vidya"];
const LAST = ["K.", "M.", "P.", "R.", "S.", "T.", "V.", "N.", "A.", "J."];
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const digits = (seed: string, n: number) => String(Math.floor(hash01(seed) * 10 ** n)).padStart(n, "0");

let ev = 1;
const events: MemberEvent[] = [];
const event = (m: Pick<Member, "id" | "programme">, at: string, category: MemberEvent["category"], action: string, by: string, extra: Partial<MemberEvent> = {}) =>
  events.push({ id: `MEV-${pad(ev, 6)}`, memberId: m.id, programme: m.programme, at, category, action, oldValue: null, newValue: null, by, orgId: by === "SYSTEM" || by.startsWith("MEMBER") ? null : by.startsWith("USR-2") ? "ORG-0002" : "ORG-0001", role: by === "SYSTEM" ? "System" : by.startsWith("MEMBER") ? "Member (app)" : extra.role ?? "Portal user", remarks: "", approvalRequestId: null, ref: `MRF-${pad(ev++ + 20000, 6)}`, ...extra });

const addr = (b: ReturnType<typeof branch>, kind: "home" | "working" | "gift", seed: string, source: Address["source"], at: string, verified: boolean): Address => ({
  line: `${kind === "home" ? "House" : kind === "working" ? "Shop" : "Door"} ${1 + Math.floor(hash01(seed + kind) * 180)}, ${pick(seed + kind + "r", ["Market Road", "Church Lane", "Temple Street", "MG Road", "Station Road", "Canal Road"])} (demo)`,
  district: b.district,
  state: b.state,
  pincode: `${pick(seed, ["6", "5", "4"])}${digits(seed + kind + "pin", 5)}`,
  source,
  updatedAt: at,
  locked: kind === "home" && verified,
  verification: kind === "home" ? (verified ? "verified" : "unverified") : kind === "working" ? "geo_validated" : pick(seed + "gift", ["geo_validated", "geo_validated", "territory_mismatch"]),
  ...(kind === "working" ? { lat: 8 + hash01(seed + "lat") * 20, lng: 72 + hash01(seed + "lng") * 16 } : {}),
});

const masked = (t: DocType, seed: string) => (t === "aadhaar" ? `XXXX XXXX ${digits(seed + "a", 4)}` : t === "pan" ? `XXXXX${digits(seed + "p", 4)}X` : t === "bank" ? `XXXXXXXX${digits(seed + "b", 4)}` : t === "upi" ? `9XXXXXX${digits(seed + "u", 3)}@upi` : t === "gst" ? `XXGSTXXXXX${digits(seed + "g", 3)}Z` : null);
const METHOD: Record<DocType, [string, string]> = {
  aadhaar: ["DigiLocker / UIDAI (mock)", "UIDAI"],
  pan: ["OCR + validation route pending OP-17 (mock)", "Route not confirmed"],
  selfie: ["Liveness + face match (mock)", "Liveness service"],
  bank: ["Penny-less verification via Signzy (mock)", "Signzy"],
  upi: ["UPI handle on registered mobile (mock)", "Member app"],
  gst: ["Supplied by SFDC (mock)", "SFDC"],
};

let docN = 1;
function doc(m: Member, type: DocType, status: DocStatus, at: string | null, reviewer: string | null, extra: Partial<KycDocument> = {}): KycDocument {
  const id = `KYC-${pad(docN++, 6)}`;
  const d: KycDocument = { id, memberId: m.id, type, maskedId: status === "not_submitted" || status === "not_applicable" ? null : masked(type, m.identityId), status, submittedAt: status === "not_submitted" || status === "not_applicable" ? null : at, method: METHOD[type][0], source: METHOD[type][1], response: null, reviewedBy: ["approved", "rejected", "reupload_required"].includes(status) ? reviewer : null, reviewedAt: ["approved", "rejected", "reupload_required"].includes(status) ? at : null, rejectionCode: null, rejectionReason: null, resubmissions: 0, latestRef: status === "not_submitted" ? null : `DOC-${id.slice(4)}-1`, exception: null, history: [], ...extra };
  if (d.submittedAt) d.history.push({ at: d.submittedAt, by: type === "gst" || m.registration.source === "sfdc_provisioned" ? "SYSTEM" : `MEMBER:${m.id}`, action: "Submitted", status: "pending", remarks: "", ref: d.latestRef! });
  if (d.reviewedAt) d.history.push({ at: d.reviewedAt, by: d.reviewedBy!, action: status === "approved" ? "Approved" : "Rejected", status, remarks: d.rejectionReason ?? "", ref: `${d.latestRef}-R` });
  return d;
}

const members: Member[] = [];
const identities: MemberIdentity[] = [];
const documents: KycDocument[] = [];

let regN = 4100;
function make(id: string, programme: ProgrammeCode, branchCode: string, status: RegistrationStatus, source: RegistrationSource, at: string, opts: { name?: string; identity?: string; docs?: Partial<Record<DocType, DocStatus>>; exception?: Partial<Record<DocType, string>>; stage1By?: string; sr?: string } = {}): Member {
  const b = branch(branchCode);
  const identityId = opts.identity ?? `IDN-${id.slice(4)}`;
  const verified = status !== "invited" && !(opts.docs?.aadhaar && opts.docs.aadhaar !== "approved");
  const m: Member = {
    id,
    identityId,
    programme,
    name: opts.name ?? `${pick(id + "f", FIRST)} ${pick(id + "l", LAST)}`,
    memberType: requirementOf(programme).memberType,
    mobile: `+91 9${digits(id + "m1", 4)} ${digits(id + "m2", 5)}`,
    gender: hash01(id + "g") > 0.3 ? pick(id + "gx", ["Male", "Female"]) : null,
    email: hash01(id + "e") > 0.6 ? `${id.toLowerCase()}@member.example` : null,
    dob: verified ? `19${70 + Math.floor(hash01(id + "dob") * 30)}-0${1 + Math.floor(hash01(id + "mo") * 9)}-1${Math.floor(hash01(id + "d") * 9)}` : null,
    verifiedIdentity: verified,
    branchCode,
    sr: opts.sr ?? (branchCode === "TN-BR-CHENNAI-NORTH" ? "Vikram Rao (USR-2006)" : `SR ${b.name.replace(" branch", "")} (demo)`),
    status,
    registration: {
      ref: `REG-26-${pad(regN++, 6)}`,
      source,
      submittedAt: at,
      registeredBy: source === "self" ? `MEMBER:${id}` : source === "sr_assisted" ? "USR-2006" : "SYSTEM",
      stage1: null,
      stage2: null,
      sfdcRef: source.startsWith("sfdc") ? `SFDC-MOCK-${programme}-${digits(id + "sf", 6)}` : null,
      sfdcSync: source.startsWith("sfdc") ? "synced" : "not_applicable",
      sfdcMessage: null,
      mobileVerified: source !== "sfdc_provisioned" || true,
      registryCheck: "clear",
      mpin: status === "pending" || status === "invited" ? "not_set" : "set",
      credentialIssuedAt: source === "sr_assisted" || source.startsWith("sfdc") ? at : null,
      firstLoginAt: status === "pending" || status === "invited" ? null : at,
    },
    addresses: {
      home: addr(b, "home", id, verified ? "aadhaar" : source.startsWith("sfdc") ? "sfdc" : "member_app", at, verified),
      working: status === "invited" ? null : addr(b, "working", id, source === "sr_assisted" ? "sr_assisted" : source.startsWith("sfdc") ? "sfdc" : "member_app", at, false),
      gift: ["redemption_enabled", "redemption_kyc_pending", "provisioned"].includes(status) ? addr(b, "gift", id, "member_app", at, false) : null,
    },
    createdAt: at,
    updatedAt: at,
  };
  if (programme === "ST" || programme === "CS") m.invite = { ref: `INV-SFDC-${digits(id + "inv", 6)}`, receivedAt: at, completion: status === "invited" ? "awaiting_member" : status === "pending" ? "in_progress" : "completed" };
  if (programme === "Retailer") m.retailer = { gstStatus: "eligible", territory: `${b.district} territory`, panSource: "SFDC" };
  if (programme === "DD") m.dd = { distributorId: `DIST-${digits(id + "dist", 5)}`, territory: `${b.state} — ${b.district}`, salesTarget: `₹${(20 + Math.floor(hash01(id + "t") * 60)) * 1} L / quarter (demo)`, schemeScan: [{ scheme: "DD Festive 2026", enabled: true }, { scheme: "DD Annual Volume", enabled: hash01(id + "sc") > 0.4 }] };

  // Registration stages
  const stage1At = addMinutes(at, 60 * 26);
  if (source === "self" && status !== "pending" && status !== "rejected") m.registration.stage1 = { decision: "approved", by: opts.stage1By ?? "USR-2005", at: stage1At, remarks: "Field check done", ref: `S1-${m.registration.ref.slice(7)}` };
  if (source === "sr_assisted") m.registration.stage1 = { decision: "not_required", by: "SYSTEM", at, remarks: "SR-assisted channel: no separate Stage-1 approval", ref: `S1-${m.registration.ref.slice(7)}` };
  if (source.startsWith("sfdc") && status !== "invited") m.registration.stage1 = { decision: "auto", by: "SYSTEM", at, remarks: source === "sfdc_invite" ? "Activated on in-app completion" : "Provisioned from SFDC", ref: `S1-${m.registration.ref.slice(7)}` };

  // Documents per programme requirement
  const req = requirementOf(programme);
  const reviewAt = addMinutes(at, 60 * 72);
  for (const r of req.documents) {
    let st: DocStatus;
    if (opts.docs?.[r.type]) st = opts.docs[r.type]!;
    else if (r.requirement === "not_applicable") st = "not_applicable";
    else if (r.requirement === "confirmation_required") st = "not_submitted";
    else if (r.type === "aadhaar") st = status === "invited" ? "not_submitted" : "approved";
    else if (r.type === "gst") st = "approved";
    else if (r.type === "pan" && programme === "Retailer") st = "approved";
    else if (status === "redemption_enabled") st = r.requirement === "optional" && hash01(m.id + r.type) > 0.6 ? "not_submitted" : "approved";
    else if (status === "redemption_kyc_pending") st = r.type === "bank" ? "pending" : r.requirement === "optional" ? "not_submitted" : pick(m.id + r.type, ["pending", "under_review", "approved"]);
    else st = "not_submitted";
    const reviewer = r.type === "aadhaar" ? "SYSTEM" : programme === "Retailer" || programme === "DD" ? "SYSTEM" : "USR-1004";
    const d = doc(m, r.type, st, r.type === "aadhaar" ? at : reviewAt, reviewer, opts.exception?.[r.type] ? { exception: opts.exception[r.type]!, response: opts.exception[r.type]! } : {});
    if (r.type === "aadhaar" && st === "approved") d.response = "Verified: name, DOB and address returned by the identity source (mock)";
    documents.push(d);
  }
  if (status === "redemption_enabled" && req.stage2Reviewer === "evolve") m.registration.stage2 = { decision: "approved", by: "USR-1004", at: reviewAt, remarks: "All mandatory redemption documents approved", ref: `S2-${m.registration.ref.slice(7)}` };

  // History
  event(m, at, "registration", source === "self" ? "Registration submitted (self)" : source === "sr_assisted" ? "Assisted registration created by SR" : source === "sfdc_invite" ? "SFDC invitation received" : "Provisioned from SFDC", m.registration.registeredBy, { newValue: m.registration.ref });
  if (m.registration.stage1?.decision === "approved") event(m, stage1At, "registration", "Stage-1 approved: scan enabled", m.registration.stage1.by, { oldValue: "Pending", newValue: "Active — Scan enabled", role: "SR/PIC" });
  if (m.registration.mpin === "set") event(m, addMinutes(at, 90), "mpin", "MPIN set on first login", `MEMBER:${m.id}`);
  if (m.registration.stage2) event(m, reviewAt, "registration", "Stage-2 completed: redemption enabled", "USR-1004", { oldValue: "Redemption KYC pending", newValue: "Redemption enabled", role: "Evolve KYC desk" });
  if (["active_scan", "redemption_kyc_pending", "redemption_enabled", "provisioned"].includes(status)) {
    event(m, addMinutes(at, 60 * 30), "activity", "First scan", "SYSTEM", { newValue: "From the scanning service (mock)" });
    event(m, addMinutes("2026-11-08T10:00", -Math.floor(hash01(m.id + "ls") * 600)), "activity", "Last scan", "SYSTEM");
  }
  if (status === "redemption_enabled") event(m, addMinutes(reviewAt, 60 * 200), "activity", "First redemption", "SYSTEM");

  members.push(m);
  if (!identities.find((x) => x.id === identityId)) identities.push({ id: identityId, maskedAadhaar: masked("aadhaar", identityId), consent: { given: status !== "invited", at: status !== "invited" ? at : null, source: source === "self" ? "member_app" : source === "sr_assisted" ? "sr_assisted" : source.startsWith("sfdc") ? "sfdc" : "not_captured", policyAcknowledged: status !== "invited" }, memberIds: [], accountClosedAt: null });
  identities.find((x) => x.id === identityId)!.memberIds.push(id);
  return m;
}

function addMinutes(iso: string, mins: number) {
  const d = new Date(new Date(iso).getTime() + mins * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- Scenario records ---------------- */
make("MBR-EP-0001", "EP", "KL-BR-KOCHI", "pending", "self", "2026-11-08T11:20", { name: "Anil Varghese (demo)" });
make("MBR-EP-0002", "EP", "TN-BR-MADURAI", "pending", "self", "2026-11-07T15:40", { name: "Ramesh Pandian (demo)" });
make("MBR-EP-0003", "EP", "KL-BR-KOCHI", "redemption_kyc_pending", "self", "2026-10-20T10:00", { name: "Biju Thomas (demo)", docs: { selfie: "pending", bank: "pending", pan: "approved", upi: "not_submitted" } });
make("MBR-EP-0004", "EP", "KL-BR-ALUVA", "redemption_enabled", "self", "2026-09-12T10:00", { name: "Deepa Mohan (demo)", docs: { selfie: "approved", bank: "approved", pan: "pending", upi: "approved" } });
make("MBR-EP-0005", "EP", "KL-BR-KOCHI", "redemption_enabled", "sr_assisted", "2025-06-02T10:00", { name: "Sajan Mathew (demo)", identity: "IDN-SHARED-01", docs: { selfie: "approved", bank: "approved", pan: "approved", upi: "approved" } });
make("MBR-RT-0001", "Retailer", "KL-BR-KOCHI", "provisioned", "sfdc_provisioned", "2025-08-14T10:00", { name: "Sajan Mathew (demo) — Mathew Electricals", identity: "IDN-SHARED-01" });
make("MBR-EP-0006", "EP", "KA-BR-MYSURU", "pending", "self", "2026-11-06T09:30", { name: "Kiran Gowda (demo)", docs: { aadhaar: "verification_failed" }, exception: { aadhaar: "OP-15: member is not registered on DigiLocker. No fallback route is configured" } });
make("MBR-EP-0007", "EP", "MH-BR-PUNE", "pending", "self", "2026-11-05T14:10", { name: "Sunil Patil (demo)", docs: { aadhaar: "verification_failed" }, exception: { aadhaar: "OP-16: Aadhaar-linked mobile differs from the registered mobile. Mismatch handling not confirmed" } });
make("MBR-EP-0008", "EP", "KL-BR-THIRUVANANTHAPURAM", "redemption_kyc_pending", "self", "2026-10-02T10:00", { name: "Lijo Joseph (demo)", docs: { bank: "verification_failed", selfie: "approved", pan: "not_submitted" }, exception: { bank: "Penny-less verification failed: account name does not match (mock response)" } });
make("MBR-EP-0009", "EP", "TN-BR-COIMBATORE", "redemption_kyc_pending", "self", "2026-10-11T10:00", { name: "Murugan S. (demo)", docs: { pan: "pending", selfie: "approved", bank: "under_review" }, exception: { pan: "OP-17: PAN validation source unavailable (route not confirmed). PAN cannot be marked verified" } });
make("MBR-EP-0010", "EP", "TN-BR-CHENNAI-NORTH", "redemption_enabled", "sr_assisted", "2025-11-20T10:00", { name: "Karthik R. (demo)", identity: "IDN-SHARED-02" });
make("MBR-ST-0003", "ST", "TN-BR-CHENNAI-NORTH", "active_scan", "sfdc_invite", "2026-03-04T10:00", { name: "Karthik R. (demo)", identity: "IDN-SHARED-02" });
make("MBR-ST-0001", "ST", "KA-BR-BENGALURU-EAST", "invited", "sfdc_invite", "2026-11-04T10:00", { name: "Praveen Hegde (demo)" });
make("MBR-ST-0002", "ST", "KA-BR-BENGALURU-WEST", "pending", "sfdc_invite", "2026-10-28T10:00", { name: "Ravi Shetty (demo)" });
make("MBR-CS-0001", "CS", "KL-BR-KOZHIKODE", "pending", "sfdc_invite", "2026-11-02T10:00", { name: "Fasil P. (demo)" });
make("MBR-CS-0002", "CS", "TS-BR-HYDERABAD-CENTRAL", "redemption_enabled", "sfdc_invite", "2025-12-01T10:00", { name: "Srikanth Rao (demo)" });
make("MBR-RT-0002", "Retailer", "TN-BR-CHENNAI-SOUTH", "provisioned", "sfdc_provisioned", "2025-10-01T10:00", { name: "Lakshmi Stores (demo)", docs: { gst: "verification_failed" } });
make("MBR-RT-0003", "Retailer", "AP-BR-VIJAYAWADA", "provisioned", "sfdc_provisioned", "2026-11-08T02:10", { name: "Sri Sai Electricals (demo)", docs: { pan: "pending" } });
make("MBR-DD-0001", "DD", "KA-BR-BENGALURU-EAST", "provisioned", "sfdc_provisioned", "2025-05-10T10:00", { name: "Prime Power Distributors (demo)" });

const get = (id: string) => members.find((m) => m.id === id)!;
get("MBR-RT-0002").retailer!.gstStatus = "not_eligible";
get("MBR-RT-0003").retailer!.gstStatus = "pending";
get("MBR-RT-0003").registration.sfdcSync = "conflict";
get("MBR-RT-0003").registration.sfdcMessage = "Incomplete record: PAN missing in payload and branch differs from the pincode mapping. Held; existing data not overwritten";
get("MBR-ST-0002").registration.sfdcSync = "failed";
get("MBR-ST-0002").registration.sfdcMessage = "SFDC registration callback rejected (mock). Response contract pending OP-24";
get("MBR-DD-0001").dd!.schemeScan[1].enabled = false;
get("MBR-EP-0002").registration.registryCheck = "existing_other_programme";
get("MBR-EP-0005").registration.credentialIssuedAt = "2025-06-02T10:05";
event(get("MBR-EP-0005"), "2026-02-14T12:10", "address", "Gift delivery address updated", "MEMBER:MBR-EP-0005", { oldValue: "Door 12, Church Lane (demo)", newValue: "Door 44, MG Road (demo)" });
event(get("MBR-EP-0005"), "2026-05-03T09:40", "profile", "Branch mapping changed", "USR-1003", { oldValue: "KL-BR-ALUVA", newValue: "KL-BR-KOCHI", remarks: "Member moved shop to Kochi", role: "Evolve Operations" });
event(get("MBR-RT-0003"), "2026-11-08T02:10", "sfdc", "SFDC sync conflict", "SYSTEM", { remarks: get("MBR-RT-0003").registration.sfdcMessage! });
event(get("MBR-ST-0002"), "2026-11-02T10:00", "sfdc", "SFDC response failure", "SYSTEM", { remarks: get("MBR-ST-0002").registration.sfdcMessage! });

/* ---------------- Generated population ---------------- */
const PLAN: [ProgrammeCode, string, number][] = [["EP", "EP", 44], ["ST", "ST", 14], ["CS", "CS", 12], ["Retailer", "RT", 14], ["DD", "DD", 7]];
for (const [prog, short, n] of PLAN) {
  for (let i = 0; i < n; i++) {
    const id = `MBR-${short}-${pad(100 + i)}`;
    const b = pick(id + "b", BRANCHES).code;
    const daysAgo = Math.floor(hash01(id + "age") * 520);
    const at = addMinutes(`2026-11-09T${pad(8 + Math.floor(hash01(id + "h") * 10), 2)}:00`, -daysAgo * 1440);
    const roll = hash01(id + "st");
    let status: RegistrationStatus;
    let source: RegistrationSource;
    if (prog === "EP") {
      source = hash01(id + "src") > 0.6 ? "sr_assisted" : "self";
      status = daysAgo < 6 && source === "self" ? "pending" : roll < 0.55 ? "redemption_enabled" : roll < 0.75 ? "redemption_kyc_pending" : roll < 0.95 ? "active_scan" : "rejected";
      if (source === "sr_assisted" && status === "rejected") status = "active_scan";
    } else if (prog === "ST" || prog === "CS") {
      source = "sfdc_invite";
      status = daysAgo < 8 ? "invited" : roll < 0.6 ? "redemption_enabled" : roll < 0.8 ? "redemption_kyc_pending" : roll < 0.9 ? "active_scan" : "pending";
    } else {
      source = "sfdc_provisioned";
      status = "provisioned";
    }
    const m = make(id, prog, b, status, source, at);
    if (status === "rejected") {
      m.registration.stage1 = { decision: "rejected", by: "USR-2005", at: addMinutes(at, 1500), remarks: "Shop not found at the working location", ref: `S1-${m.registration.ref.slice(7)}` };
      event(m, addMinutes(at, 1500), "registration", "Stage-1 rejected", "USR-2005", { remarks: "Shop not found at the working location", role: "SR/PIC" });
    }
    if (prog === "Retailer" && hash01(id + "gst") > 0.75) m.retailer!.gstStatus = "not_eligible";
  }
}

/* ---------------- Restrictions ---------------- */
export const SEED_RESTRICTIONS: Restriction[] = [
  { id: "RST-0001", type: "program_block", identityId: get("MBR-CS-0002").identityId, memberIds: ["MBR-CS-0002"], programme: "CS", reasonCode: "FRAUD_SUSPECTED", remarks: "Repeated scans of the same carton labels (fraud review FR-2611)", trigger: "manual", dedup: null, appliedAt: "2026-11-04T16:20", appliedBy: "USR-2001", status: "active", reinstatement: null },
  { id: "RST-0002", type: "temporary_hold", identityId: "IDN-SHARED-02", memberIds: ["MBR-EP-0010", "MBR-ST-0003"], programme: null, reasonCode: "DUPLICATE_IDENTITY", remarks: "Nightly de-duplication batch: PAN matches another identity", trigger: "dedup_batch", dedup: { match: "pan", masked: `XXXXX${digits("IDN-SHARED-02p", 4)}X`, relatedMemberIds: ["MBR-EP-0117"], detectedAt: "2026-11-08T02:40" }, appliedAt: "2026-11-08T02:41", appliedBy: "SYSTEM", status: "active", reinstatement: null },
];
event(get("MBR-CS-0002"), "2026-11-04T16:20", "restriction", "Program Block applied (CS)", "USR-2001", { newValue: "RST-0001 · FRAUD_SUSPECTED", remarks: SEED_RESTRICTIONS[0].remarks, role: "V-Guard Client Admin" });
["MBR-EP-0010", "MBR-ST-0003"].forEach((id) => event(get(id), "2026-11-08T02:41", "restriction", "Temporary Hold applied by de-duplication batch", "SYSTEM", { newValue: "RST-0002 · PAN match", remarks: "Identifier shown masked only" }));

export const SEED_MEMBERS = members;
export const SEED_IDENTITIES = identities;
export const SEED_DOCUMENTS = documents;
export const SEED_MEMBER_EVENTS = events;

export const SEED_MEMBER_DECISIONS: MemberDecision[] = [
  { id: "MMD-01", ref: "OP-14", question: "Is the Member ID a composed business code or a UUID?", treatment: "Stable internal ID (MBR-<programme>-<n>); display format configurable pending confirmation", status: "open", answer: "" },
  { id: "MMD-02", ref: "OP-ST1", question: "Which ST/CS KYC fields come from SFDC and which are completed in-app?", treatment: "Configurable field-source mapping; every ST/CS field shows “unconfirmed”", status: "open", answer: "" },
  { id: "MMD-03", ref: "OP-24", question: "What is the SFDC registration response/callback contract?", treatment: "Mock sync and response status only", status: "open", answer: "" },
  { id: "MMD-04", ref: "OP-RET1", question: "Does the Retailer have any in-app KYC action?", treatment: "SFDC-provisioned model; Retailer selfie/bank shown as “business confirmation required”", status: "open", answer: "" },
  { id: "MMD-05", ref: "OP-15", question: "How are members not registered on DigiLocker handled?", treatment: "Shown as a verification exception; no fallback invented", status: "open", answer: "" },
  { id: "MMD-06", ref: "OP-16", question: "What happens on an Aadhaar/mobile linkage mismatch?", treatment: "Shown as a verification exception; no decision invented", status: "open", answer: "" },
  { id: "MMD-07", ref: "OP-17", question: "Is PAN validated through Signzy/NSDL or SFDC?", treatment: "Configurable route, currently unset; PAN is never auto-verified and no admin entry marks it verified", status: "open", answer: "" },
  { id: "MMD-08", ref: "OP-BLK1", question: "What is the reinstatement SOP for Program Block and Temporary Hold?", treatment: "Second-person approval through WF-012 (SOW minimum); reason codes and pre-conditions pending", status: "open", answer: "" },
  { id: "MMD-09", ref: "OP-MPIN1", question: "What is the MPIN reset verification method, length and lockout policy?", treatment: "Controlled reset trigger only; recovery step shown as pending policy", status: "open", answer: "" },
  { id: "MMD-10", ref: "OP-41 / OP-42", question: "How are DD and Retailer data merged, and who owns which fields?", treatment: "DD kept as its own programme with distributor attributes; DD KYC items marked confirmation required", status: "open", answer: "" },
];
