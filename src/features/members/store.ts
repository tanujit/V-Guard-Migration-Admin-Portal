/**
 * MEMBER STORE — in-browser mock repository for Member Management, Registration and KYC.
 * Every action re-checks RBAC (module, action, programme, branch) and writes an append-only member
 * event. Verified-field overrides and reinstatements go through the central approval engine; the
 * registered execution handler applies them only after approval. No MPIN, OTP or full identifier
 * is ever created or stored. Notifications are recorded, never sent.
 */
import { useSyncExternalStore } from "react";
import { PAN_ROUTE, REJECTION_REASONS, RESTRICTION_REASONS } from "@/config/memberProgrammes";
import { findBranch } from "@/config/geography";
import { accessStore } from "@/features/access/store";
import { hasPermission, primaryOrg, type PolicyResult } from "@/features/access/engine";
import { approvalStore, createRequest, demoNow } from "@/features/approvals/store";
import { registerExecutionHandler } from "@/features/approvals/execution";
import { SEED_DOCUMENTS, SEED_IDENTITIES, SEED_MEMBER_DECISIONS, SEED_MEMBER_EVENTS, SEED_MEMBERS, SEED_RESTRICTIONS } from "@/data/mock/memberSeed";
import type { ApprovalRequest } from "@/types/approval";
import type { KycDocument, Member, MemberDecision, MemberEvent, MemberNotification, Restriction, RestrictionType } from "@/types/members";
import { actorRole, canOn, canReviewDocs, canStage1, docsOf, geoOfMember, linkedMembers, memberById, redemptionGaps, type MemberState } from "./engine";

const STORAGE_KEY = "vg-rishta.member-store.v1";
const build = (): MemberState => structuredClone({ members: SEED_MEMBERS, identities: SEED_IDENTITIES, documents: SEED_DOCUMENTS, restrictions: SEED_RESTRICTIONS, events: SEED_MEMBER_EVENTS, notifications: [], mobileChanges: [], mpinResets: [], decisions: SEED_MEMBER_DECISIONS });

function load(): MemberState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MemberState;
  } catch {
    /* seed */
  }
  return build();
}
let state: MemberState = load();
const listeners = new Set<() => void>();
function commit(next: MemberState) {
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const memberStore = { get: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
export const useMemberState = () => useSyncExternalStore(memberStore.subscribe, memberStore.get, memberStore.get);
export const resetMemberDemoData = () => commit(build());

type Res = PolicyResult & { id?: string };
const OK = (id?: string, warnings: string[] = []): Res => ({ ok: true, errors: [], warnings, id });
const NO = (...errors: string[]): Res => ({ ok: false, errors, warnings: [] });
const acc = () => accessStore.get();
const now = () => demoNow();
const pad = (n: number, w = 6) => String(n).padStart(w, "0");

function ev(s: MemberState, m: Pick<Member, "id" | "programme">, uid: string, category: MemberEvent["category"], action: string, extra: Partial<MemberEvent> = {}): MemberState {
  const n = s.events.length + 1;
  const e: MemberEvent = { id: `MEV-${pad(n + 50000)}`, memberId: m.id, programme: m.programme, at: now(), category, action, oldValue: null, newValue: null, by: uid, orgId: uid === "SYSTEM" ? null : (primaryOrg(acc(), uid)?.id ?? null), role: actorRole(acc(), uid), remarks: "", approvalRequestId: null, ref: `MRF-${pad(n + 90000)}`, ...extra };
  return { ...s, events: [...s.events, e] };
}
function notify(s: MemberState, m: Member, event: string, audience: MemberNotification["audience"], channels: MemberNotification["channels"], message: string): MemberState {
  const n: MemberNotification = { id: `MNT-${pad(s.notifications.length + 1)}`, memberId: m.id, event, audience, channels, message, at: now(), delivery: "mock_recorded" };
  return { ...s, notifications: [...s.notifications, n] };
}
const putMember = (s: MemberState, m: Member): MemberState => ({ ...s, members: s.members.map((x) => (x.id === m.id ? { ...m, updatedAt: now() } : x)) });
const putDoc = (s: MemberState, d: KycDocument): MemberState => ({ ...s, documents: s.documents.map((x) => (x.id === d.id ? d : x)) });

/* ======================= Assisted EP registration ======================= */

export interface AssistedInput {
  mobile: string;
  branchCode: string;
  consent: boolean;
  /** Result of the identity verification call. Only "verified" creates a member. */
  aadhaarResult: "verified" | "not_on_digilocker" | "mobile_mismatch" | "invalid_response";
  aadhaarLast4: string;
  verifiedName: string;
  verifiedDob: string;
  verifiedAddress: string;
  verifiedPincode: string;
  workingAddress: string;
  workingPincode: string;
  gender: string;
  email: string;
  panLast4: string;
  bankLast4: string;
}

export function registryCheck(mobile: string) {
  const norm = mobile.replace(/\D/g, "").slice(-10);
  return state.members.filter((m) => m.mobile.replace(/\D/g, "").slice(-10) === norm);
}

export function createAssistedEPRegistration(uid: string, i: AssistedInput): Res & { existingId?: string } {
  const branch = findBranch(i.branchCode);
  if (!branch) return NO("Choose the member's branch");
  const probe = { programme: "EP", branchCode: i.branchCode } as Member;
  if (!canOn(acc(), uid, "members", "create", probe).allowed) return NO("You need Member management: Create for EP in this branch");
  if (!/^\+?91?\s?[6-9]\d{4}\s?\d{5}$/.test(i.mobile.trim())) return NO("Enter a valid 10-digit Indian mobile number");
  if (!i.consent) return NO("Aadhaar consent must be captured before identity verification");
  const dup = registryCheck(i.mobile);
  const sameProg = dup.find((m) => m.programme === "EP");
  if (sameProg) return { ...NO(`This mobile is already registered in EP as ${sameProg.id}. Open the existing profile instead of creating a duplicate`), existingId: sameProg.id };
  const other = dup[0];
  if (other && state.restrictions.some((r) => r.status !== "lifted" && r.type === "temporary_hold" && r.identityId === other.identityId)) return NO(`The linked identity (${other.id}) is under a Temporary Hold. New enrolment in any programme is blocked`);
  if (i.aadhaarResult !== "verified") {
    const why = { not_on_digilocker: "Member is not registered on DigiLocker (OP-15). No fallback route is configured", mobile_mismatch: "Aadhaar-linked mobile does not match (OP-16). Mismatch handling is not confirmed", invalid_response: "Identity source returned an invalid response" }[i.aadhaarResult];
    return NO(`Aadhaar verification did not succeed: ${why}. The registration was not created`);
  }
  if (!/^\d{4}$/.test(i.aadhaarLast4)) return NO("Record the last 4 Aadhaar digits from the verification response (the full number is never stored)");
  if (!i.verifiedName.trim() || !i.verifiedDob || !i.verifiedAddress.trim()) return NO("Verified name, date of birth and address must come from the verification response");
  if (!i.workingAddress.trim()) return NO("Capture the working location");
  if (i.panLast4 && !/^\d{4}$/.test(i.panLast4)) return NO("PAN: record only the 4 digits shown for reference");
  if (i.bankLast4 && !/^\d{4}$/.test(i.bankLast4)) return NO("Bank: record only the last 4 digits");
  const n = state.members.filter((m) => m.programme === "EP").length + 1;
  const id = `MBR-EP-${String(n + 500).padStart(4, "0")}`;
  const identityId = other ? other.identityId : `IDN-${id.slice(4)}`;
  const t = now();
  const addr = (line: string, pin: string, source: "aadhaar" | "sr_assisted", locked: boolean) => ({ line, district: branch.district.name, state: branch.state.name, pincode: pin, source, updatedAt: t, locked, verification: locked ? ("verified" as const) : ("unverified" as const) });
  const m: Member = {
    id, identityId, programme: "EP", name: i.verifiedName.trim(), memberType: "Influencer (IMP)", mobile: i.mobile.trim(), gender: i.gender || null, email: i.email || null, dob: i.verifiedDob, verifiedIdentity: true, branchCode: i.branchCode,
    sr: `${acc().users.find((u) => u.id === uid)?.firstName ?? uid} ${acc().users.find((u) => u.id === uid)?.lastName ?? ""} (${uid})`.trim(),
    status: i.bankLast4 ? "redemption_kyc_pending" : "active_scan",
    registration: { ref: `REG-26-${pad(state.members.length + 9000)}`, source: "sr_assisted", submittedAt: t, registeredBy: uid, stage1: { decision: "not_required", by: "SYSTEM", at: t, remarks: "SR-assisted channel: no separate Stage-1 approval", ref: `S1-${pad(state.members.length + 9000)}` }, stage2: null, sfdcRef: null, sfdcSync: "not_applicable", sfdcMessage: null, mobileVerified: true, registryCheck: other ? "existing_other_programme" : "clear", mpin: "not_set", credentialIssuedAt: t, firstLoginAt: null },
    addresses: { home: addr(i.verifiedAddress.trim(), i.verifiedPincode, "aadhaar", true), working: addr(i.workingAddress.trim(), i.workingPincode, "sr_assisted", false), gift: null },
    createdAt: t, updatedAt: t,
  };
  let docN = state.documents.length + 1;
  const mk = (type: KycDocument["type"], status: KycDocument["status"], maskedId: string | null, extra: Partial<KycDocument> = {}): KycDocument => {
    const did = `KYC-${pad(docN++ + 1000)}`;
    return { id: did, memberId: id, type, maskedId, status, submittedAt: status === "not_submitted" || status === "not_applicable" ? null : t, method: type === "aadhaar" ? "DigiLocker / UIDAI via SR-assisted flow (mock)" : type === "bank" ? "Penny-less verification via Signzy (mock)" : type === "pan" ? "Captured by SR; route pending OP-17" : "Member app", source: type === "aadhaar" ? "UIDAI" : "SR-assisted", response: type === "aadhaar" ? "Verified (mock response)" : null, reviewedBy: type === "aadhaar" ? "SYSTEM" : null, reviewedAt: type === "aadhaar" ? t : null, rejectionCode: null, rejectionReason: null, resubmissions: 0, latestRef: status === "not_submitted" ? null : `DOC-${did.slice(4)}-1`, exception: null, history: status === "not_submitted" || status === "not_applicable" ? [] : [{ at: t, by: uid, action: "Captured in assisted registration", status, remarks: "", ref: `DOC-${did.slice(4)}-1` }], ...extra };
  };
  const docs = [
    mk("aadhaar", "approved", `XXXX XXXX ${i.aadhaarLast4}`),
    mk("pan", i.panLast4 ? "pending" : "not_submitted", i.panLast4 ? `XXXXX${i.panLast4}X` : null, i.panLast4 && !PAN_ROUTE.configured ? { exception: "OP-17: PAN validation route not configured; stored as pending, never as valid" } : {}),
    mk("selfie", "not_submitted", null),
    mk("bank", i.bankLast4 ? "pending" : "not_submitted", i.bankLast4 ? `XXXXXXXX${i.bankLast4}` : null),
    mk("upi", "not_submitted", null),
    mk("gst", "not_applicable", null),
  ];
  let s: MemberState = { ...state, members: [...state.members, m], documents: [...state.documents, ...docs] };
  s = other ? { ...s, identities: s.identities.map((x) => (x.id === identityId ? { ...x, memberIds: [...x.memberIds, id] } : x)) } : { ...s, identities: [...s.identities, { id: identityId, maskedAadhaar: `XXXX XXXX ${i.aadhaarLast4}`, consent: { given: true, at: t, source: "sr_assisted", policyAcknowledged: true }, memberIds: [id], accountClosedAt: null }] };
  s = ev(s, m, uid, "registration", "Assisted registration created by SR", { newValue: `${m.registration.ref} · Active — Scan enabled, Redemption blocked` });
  s = ev(s, m, "SYSTEM", "kyc", "Aadhaar verified (mock identity response)", { newValue: "Name, DOB and home address locked" });
  s = ev(s, m, "SYSTEM", "registration", "Initial credential issuance recorded", { remarks: "Notification service abstraction: recorded, not sent. MPIN is set by the member on first login" });
  s = notify(s, m, "Credentials issued", "member", ["sms"], "Login details for the EP app (mock record; no SMS sent)");
  commit(s);
  return OK(id, [...(other ? [`Mobile already exists in ${other.programme} (${other.id}); the KYC identity is reused and linked`] : []), ...(i.panLast4 && !PAN_ROUTE.configured ? ["PAN stored as Pending: the validation route is not confirmed (OP-17)"] : [])]);
}

/* ======================= Stage 1 ======================= */

export function submitRegistrationDecision(uid: string, memberId: string, decision: "approve" | "reject", remarks: string): Res {
  const m = memberById(state, memberId);
  if (!m) return NO("Member not found");
  const can = canStage1(acc(), uid, m);
  if (!can.ok) return NO(can.reason);
  if (m.status !== "pending") return NO(`Registration is ${m.status.replace(/_/g, " ")}; Stage 1 is not pending`);
  if (docsOf(state, m.id).find((d) => d.type === "aadhaar")?.status !== "approved" && decision === "approve") return NO("Aadhaar is not verified. Stage 1 cannot be approved while the identity check has an exception");
  if (decision === "reject" && !remarks.trim()) return NO("A rejection reason is required");
  const ref = `S1-${m.registration.ref.slice(7)}`;
  const next: Member = { ...m, status: decision === "approve" ? "active_scan" : "rejected", registration: { ...m.registration, stage1: { decision: decision === "approve" ? "approved" : "rejected", by: uid, at: now(), remarks, ref } } };
  let s = putMember(state, next);
  s = ev(s, m, uid, "registration", decision === "approve" ? "Stage-1 approved: scan enabled" : "Stage-1 rejected", { oldValue: "Pending", newValue: decision === "approve" ? "Active — Scan enabled, Redemption blocked" : "Rejected", remarks, ref });
  s = notify(s, next, decision === "approve" ? "Stage-1 approved" : "Stage-1 rejected", "member", ["in_app"], decision === "approve" ? "Your registration is approved. Scanning is enabled; redemption needs bank and KYC verification" : `Registration not approved: ${remarks}`);
  commit(s);
  return OK(memberId);
}

/* ======================= KYC documents ======================= */

export function startDocumentReview(uid: string, docId: string) {
  const d = state.documents.find((x) => x.id === docId);
  const m = d && memberById(state, d.memberId);
  if (!d || !m || d.status !== "pending" || !canReviewDocs(acc(), uid, m, "approve").ok) return;
  let s = putDoc(state, { ...d, status: "under_review", history: [...d.history, { at: now(), by: uid, action: "Review started", status: "under_review", remarks: "", ref: `${d.latestRef}-UR` }] });
  s = ev(s, m, uid, "kyc", `${d.type.toUpperCase()} under review`, { oldValue: "Pending", newValue: "Under review" });
  commit(s);
}

export function reviewDocument(uid: string, docId: string, action: "approve" | "reject" | "reupload", reasonCode: string, remarks: string): Res {
  const d = state.documents.find((x) => x.id === docId);
  const m = d && memberById(state, d.memberId);
  if (!d || !m) return NO("Document not found");
  const perm = canReviewDocs(acc(), uid, m, action === "approve" ? "approve" : action === "reject" ? "reject" : "return");
  if (!perm.ok) return NO(perm.reason);
  if (!["pending", "under_review"].includes(d.status)) return NO(`This document is ${d.status.replace(/_/g, " ")}; only pending documents can be decided. Approved documents cannot be altered`);
  if (action === "approve" && d.type === "pan" && !PAN_ROUTE.configured) return NO("PAN cannot be marked verified: the validation route (Signzy/NSDL or SFDC) is not confirmed (OP-17)");
  if (action === "approve" && d.exception) return NO(`Open verification exception: ${d.exception}`);
  if (action !== "approve") {
    if (!reasonCode) return NO("Choose a reason from the rejection catalogue");
    if (!REJECTION_REASONS.some((r) => r.code === reasonCode)) return NO("Unknown reason code");
    if (!remarks.trim()) return NO("Remarks are mandatory");
  }
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "reupload_required";
  const reason = REJECTION_REASONS.find((r) => r.code === reasonCode)?.label ?? null;
  const nd: KycDocument = { ...d, status, reviewedBy: uid, reviewedAt: now(), rejectionCode: action === "approve" ? null : reasonCode, rejectionReason: action === "approve" ? null : `${reason}: ${remarks}`, history: [...d.history, { at: now(), by: uid, action: action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Re-upload requested", status, remarks, ref: `${d.latestRef}-D${d.history.length}` }] };
  let s = putDoc(state, nd);
  s = ev(s, m, uid, "kyc", `${d.type.toUpperCase()} ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "re-upload required"}`, { oldValue: d.status, newValue: status, remarks: action === "approve" ? remarks : `${reason} · ${remarks}` });
  if (action !== "approve") {
    s = notify(s, m, action === "reject" ? "KYC document rejected" : "Document re-upload required", "member", ["in_app", "email"], `${d.type.toUpperCase()}: ${reason}. ${remarks}`);
    s = notify(s, m, action === "reject" ? "KYC document rejected" : "Document re-upload required", "sr_pic", ["email", "dashboard"], `${m.id} ${d.type.toUpperCase()} needs action: ${reason}`);
  } else {
    s = notify(s, m, "KYC document approved", "member", ["in_app"], `${d.type.toUpperCase()} approved`);
  }
  // Stage 2: redemption unlock once every mandatory redemption document is approved.
  const after = memberById(s, m.id)!;
  const warnings: string[] = [];
  if (action === "approve" && ["active_scan", "redemption_kyc_pending"].includes(after.status) && redemptionGaps(s, after).length === 0) {
    const unlocked: Member = { ...after, status: "redemption_enabled", registration: { ...after.registration, stage2: { decision: "approved", by: uid, at: now(), remarks: "All mandatory redemption documents approved", ref: `S2-${after.registration.ref.slice(7)}` } } };
    s = putMember(s, unlocked);
    s = ev(s, m, uid, "registration", "Stage-2 completed: redemption enabled", { oldValue: REG(after.status), newValue: "Redemption enabled" });
    s = notify(s, m, "Redemption enabled", "member", ["in_app", "email"], "KYC complete. Redemption is now enabled");
    warnings.push("All mandatory redemption documents are approved: Stage 2 completed and redemption enabled");
  }
  commit(s);
  return OK(docId, warnings);
}
const REG = (x: string) => x.replace(/_/g, " ");

/** Sensitive document preview/download: permission-checked and audited, including refusals. */
export function accessDocument(uid: string, docId: string, kind: "preview" | "download"): Res {
  const d = state.documents.find((x) => x.id === docId);
  const m = d && memberById(state, d.memberId);
  if (!d || !m) return NO("Document not found");
  const allowed = canOn(acc(), uid, "registration-kyc", kind === "preview" ? "view_sensitive" : "download", m).allowed;
  const s = ev(state, m, uid, "security", allowed ? `Sensitive ${d.type.toUpperCase()} document ${kind === "preview" ? "viewed" : "downloaded"}` : `Denied: ${d.type.toUpperCase()} document ${kind}`, { newValue: d.latestRef, remarks: allowed ? "Development placeholder; no document content exists" : `Missing Registration & KYC: ${kind === "preview" ? "View sensitive" : "Download documents"}` });
  commit(s);
  return allowed ? OK(docId) : NO(`You need Registration & KYC: ${kind === "preview" ? "View sensitive" : "Download documents"} for this programme and branch. The attempt was recorded`);
}

/* ======================= Profile ======================= */

export interface ProfilePatch {
  name?: string;
  dob?: string;
  homeAddress?: string;
  email?: string;
  gender?: string;
  working?: { line: string; pincode: string };
  gift?: { line: string; pincode: string };
}

export function updateMemberProfile(uid: string, memberId: string, p: ProfilePatch, reason: string): Res {
  const m = memberById(state, memberId);
  if (!m) return NO("Member not found");
  if (!canOn(acc(), uid, "members", "edit", m).allowed) return NO("You need Member management: Edit for this programme and branch");
  const locked = (["name", "dob", "homeAddress"] as const).filter((f) => p[f] !== undefined);
  if (locked.length && m.verifiedIdentity) return NO(`${locked.join(", ")} ${locked.length > 1 ? "are" : "is"} verified through Aadhaar and locked. Use “Request verified-data override”, which needs the override permission and approval`);
  if (!reason.trim()) return NO("Give a reason for the change");
  let next = { ...m };
  let s = state;
  const change = (label: string, oldV: string | null, newV: string | null, category: MemberEvent["category"] = "profile") => {
    if ((oldV ?? "") === (newV ?? "")) return;
    s = ev(s, m, uid, category, `${label} updated`, { oldValue: oldV, newValue: newV, remarks: reason });
  };
  if (p.email !== undefined) { change("Email", m.email, p.email || null); next.email = p.email || null; }
  if (p.gender !== undefined) { change("Gender", m.gender, p.gender || null); next.gender = p.gender || null; }
  if (p.name !== undefined) { change("Name", m.name, p.name); next.name = p.name; }
  if (p.dob !== undefined) { change("Date of birth", m.dob, p.dob); next.dob = p.dob; }
  const upd = (kind: "working" | "gift", v: { line: string; pincode: string }) => {
    if (!/^\d{6}$/.test(v.pincode)) throw new Error("Pincode must be six digits");
    const old = m.addresses[kind];
    change(kind === "working" ? "Working location" : "Gift delivery address", old ? `${old.line}, ${old.pincode}` : null, `${v.line}, ${v.pincode}`, "address");
    const b = findBranch(m.branchCode)!;
    next = { ...next, addresses: { ...next.addresses, [kind]: { line: v.line, pincode: v.pincode, district: old?.district ?? b.district.name, state: old?.state ?? b.state.name, source: "staff", updatedAt: now(), locked: false, verification: "unverified" } } };
  };
  try {
    if (p.working) upd("working", p.working);
    if (p.gift) upd("gift", p.gift);
  } catch (e) {
    return NO((e as Error).message);
  }
  if (s === state) return NO("Nothing changed");
  s = putMember(s, next);
  commit(s);
  return OK(memberId);
}

const OVERRIDE_LABEL = { name: "Name", dob: "Date of birth", homeAddress: "Aadhaar home address" } as const;

export function requestVerifiedFieldOverride(uid: string, memberId: string, field: keyof typeof OVERRIDE_LABEL, proposed: string, justification: string): Res {
  const m = memberById(state, memberId);
  if (!m) return NO("Member not found");
  if (!canOn(acc(), uid, "members", "override", m).allowed) return NO("You need Member management: Override verified data for this programme and branch");
  if (!m.verifiedIdentity) return NO("This identity is not verified yet; use the ordinary profile edit");
  if (!proposed.trim()) return NO("Enter the proposed value");
  if (!justification.trim() || justification.trim().length < 15) return NO("A clear justification (at least 15 characters) is mandatory");
  const current = field === "homeAddress" ? `${m.addresses.home?.line}, ${m.addresses.home?.pincode}` : field === "dob" ? m.dob : m.name;
  if (current === proposed.trim()) return NO("The proposed value is the same as the current one");
  const out = createRequest(uid, { requestType: "member_info_correction", title: `Override verified ${OVERRIDE_LABEL[field].toLowerCase()} · ${m.id}`, entityRef: `${m.id}:${field}`, programme: m.programme, location: geoOfMember(m), amount: null, fields: [{ key: "member", label: "Member", kind: "text", before: `${m.id} · ${m.programme}`, after: `${m.id} · ${m.programme}` }, { key: field, label: `${OVERRIDE_LABEL[field]} (verified)`, kind: field === "dob" ? "date" : "text", material: true, before: current, after: proposed.trim() }], purpose: "Correct verified identity data under the admin override policy", reason: justification, justification, attachments: [], impact: { affectedMembers: 1, operationalImpact: "Changes Aadhaar-verified identity data; the original value stays in history" } }, true);
  if (!out.ok || !out.id) return out;
  const s = ev(state, m, uid, "profile", "Verified-field override submitted", { oldValue: current, newValue: proposed.trim(), remarks: justification, approvalRequestId: out.id });
  commit(s);
  return OK(out.id, out.warnings);
}

export function requestMobileChange(uid: string, memberId: string, ticketRef: string, newMobile: string): Res {
  const m = memberById(state, memberId);
  if (!m) return NO("Member not found");
  if (!canOn(acc(), uid, "members", "edit", m).allowed) return NO("You need Member management: Edit for this programme and branch");
  if (!/^TCK-\d{4,}$/i.test(ticketRef.trim())) return NO("A support ticket reference (TCK-…) is required for a mobile change");
  if (!/^\+?91?\s?[6-9]\d{4}\s?\d{5}$/.test(newMobile.trim())) return NO("Enter a valid 10-digit mobile number");
  if (registryCheck(newMobile).length) return NO("The new mobile is already registered to a member");
  if (state.mobileChanges.some((r) => r.memberId === memberId && r.status === "awaiting_verification")) return NO("A mobile change for this member is already awaiting verification");
  const masked = newMobile.trim().replace(/(\d{2})\d{6}(\d{2})$/, "$1XXXXXX$2");
  const id = `MCR-${pad(state.mobileChanges.length + 1, 4)}`;
  let s: MemberState = { ...state, mobileChanges: [...state.mobileChanges, { id, memberId, ticketRef: ticketRef.trim().toUpperCase(), newMobileMasked: masked, status: "awaiting_verification", requestedBy: uid, requestedAt: now(), note: "OTP verification on the existing and the new number must be completed by the verification service, which is not connected. The mobile number is unchanged" }] };
  s = ev(s, m, uid, "profile", "Mobile change requested", { newValue: masked, remarks: `Ticket ${ticketRef.trim().toUpperCase()} · awaiting dual-number OTP verification` });
  commit(s);
  return OK(id, ["Recorded as Awaiting verification. The number changes only after the backend confirms OTP on both numbers"]);
}

/* ======================= Restrictions ======================= */

export function restrictionImpact(memberId: string, type: RestrictionType) {
  const m = memberById(state, memberId)!;
  const linked = linkedMembers(state, m);
  return { member: m, linked, affected: type === "program_block" ? [m] : linked };
}

export function applyRestriction(uid: string, memberId: string, type: RestrictionType, reasonCode: string, remarks: string): Res {
  const m = memberById(state, memberId);
  if (!m) return NO("Member not found");
  if (!canOn(acc(), uid, "members", type === "program_block" ? "disable" : "hold", m).allowed) return NO(`You need Member management: ${type === "program_block" ? "Disable (Program Block)" : "Temporary hold"} for this programme and branch`);
  if (!RESTRICTION_REASONS.some((r) => r.code === reasonCode && (r.type === type || r.type === "both"))) return NO("Choose a configured reason code");
  if (!remarks.trim()) return NO("Remarks are mandatory");
  const { affected } = restrictionImpact(memberId, type);
  if (state.restrictions.some((r) => r.status !== "lifted" && r.type === type && (type === "program_block" ? r.memberIds.includes(m.id) : r.identityId === m.identityId))) return NO(`An active ${type === "program_block" ? `Program Block on ${m.programme}` : "Temporary Hold"} already exists`);
  const id = `RST-${pad(state.restrictions.length + 1, 4)}`;
  const r: Restriction = { id, type, identityId: m.identityId, memberIds: affected.map((x) => x.id), programme: type === "program_block" ? m.programme : null, reasonCode, remarks, trigger: "manual", dedup: null, appliedAt: now(), appliedBy: uid, status: "active", reinstatement: null };
  let s: MemberState = { ...state, restrictions: [...state.restrictions, r] };
  for (const x of affected) {
    s = ev(s, x, uid, "restriction", type === "program_block" ? `Program Block applied (${x.programme})` : "Temporary Hold applied across linked programmes", { newValue: `${id} · ${reasonCode}`, remarks });
    s = notify(s, x, type === "program_block" ? "Program block applied" : "Temporary hold applied", "admin", ["dashboard"], `${x.id} restricted: ${reasonCode}`);
  }
  commit(s);
  return OK(id, type === "program_block" ? [`Only ${m.programme} is restricted. Other memberships of this identity are unaffected`] : [`${affected.length} linked membership(s) restricted; new enrolment with this identity is blocked`]);
}

export function submitReinstatementRequest(uid: string, restrictionId: string, reason: string, evidence: string): Res {
  const r = state.restrictions.find((x) => x.id === restrictionId);
  if (!r) return NO("Restriction not found");
  const m = memberById(state, r.memberIds[0])!;
  if (r.status !== "active") return NO(`This restriction is ${r.status.replace("_", " ")}`);
  if (!canOn(acc(), uid, "members", "submit", m).allowed) return NO("You need Member management: Submit (a Maker profile) to request reinstatement");
  if (!reason.trim()) return NO("A reinstatement reason is required");
  const others = state.restrictions.filter((x) => x.id !== r.id && x.status !== "lifted" && x.memberIds.some((id) => r.memberIds.includes(id)));
  const out = createRequest(uid, { requestType: "member_reinstate", title: `Lift ${r.type === "program_block" ? `Program Block (${r.programme})` : "Temporary Hold"} · ${m.id}`, entityRef: r.id, programme: r.type === "program_block" ? m.programme : null, location: geoOfMember(m), amount: null, fields: [{ key: "member", label: "Member", kind: "text", before: r.memberIds.join(", "), after: r.memberIds.join(", ") }, { key: "status", label: r.type === "program_block" ? `Program Block · ${r.programme}` : "Temporary Hold · all linked programmes", kind: "status", material: true, before: `Restricted (${r.reasonCode})`, after: "Lifted" }], purpose: "Reinstate a restricted member after review", reason, justification: evidence, attachments: [], impact: { affectedMembers: r.memberIds.length, operationalImpact: others.length ? `Other active restriction(s) remain: ${others.map((o) => o.id).join(", ")}` : "Scan and redemption eligibility are recalculated after execution" } }, true);
  if (!out.ok || !out.id) return out;
  let s: MemberState = { ...state, restrictions: state.restrictions.map((x) => (x.id === r.id ? { ...x, status: "reinstatement_pending", reinstatement: { requestId: out.id!, requestedBy: uid, reason, liftedAt: null, liftedBy: null } } : x)) };
  for (const id of r.memberIds) s = ev(s, memberById(s, id)!, uid, "restriction", "Reinstatement submitted", { newValue: r.id, remarks: reason, approvalRequestId: out.id });
  commit(s);
  return OK(out.id, [...out.warnings, ...(others.length ? [`${others.map((o) => o.id).join(", ")} will still restrict the member after this one is lifted`] : [])]);
}

/* ======================= MPIN ======================= */

export function triggerMpinReset(uid: string, memberId: string, reason: string): Res {
  const m = memberById(state, memberId);
  if (!m) return NO("Member not found");
  const t = now();
  if (!canOn(acc(), uid, "members", "reset_credentials", m).allowed) {
    const s = ev(state, m, uid, "security", "Denied: MPIN reset attempt", { remarks: "Missing Member management: Reset credentials" });
    commit({ ...s, mpinResets: [...s.mpinResets, { id: `MPR-${pad(s.mpinResets.length + 1, 4)}`, memberId, at: t, by: uid, reason, status: "refused", result: "Not authorised" }] });
    return NO("You are not authorised to reset member credentials. The attempt was recorded");
  }
  if (!reason.trim()) return NO("A reason is required");
  if (m.status === "invited") return NO("The member has not set an MPIN yet");
  const id = `MPR-${pad(state.mpinResets.length + 1, 4)}`;
  const result = "Reset initiated with the mock credential service. The member must complete the recovery step defined by OP-MPIN1 (not yet confirmed). No MPIN was generated, shown or stored";
  let s: MemberState = { ...state, mpinResets: [...state.mpinResets, { id, memberId, at: t, by: uid, reason, status: "initiated", result }] };
  s = putMember(s, { ...m, registration: { ...m.registration, mpin: "reset_pending" } });
  s = ev(s, m, uid, "mpin", "MPIN reset initiated", { newValue: id, remarks: reason });
  s = notify(s, m, "MPIN reset initiated", "member", ["in_app"], "A reset of your MPIN was initiated by support (mock record)");
  commit(s);
  return OK(id, [result]);
}

/* ======================= Approval execution ======================= */

function execute(r: ApprovalRequest) {
  if (r.requestType === "member_reinstate") {
    const rs = state.restrictions.find((x) => x.id === r.entityRef);
    if (!rs) return { ok: false, message: `Restriction ${r.entityRef} not found` };
    if (rs.status === "lifted") return { ok: true, message: `${rs.id} was already lifted` };
    const approver = r.stages.map((x) => x.decidedBy).filter(Boolean).pop() ?? "SYSTEM";
    let s: MemberState = { ...state, restrictions: state.restrictions.map((x) => (x.id === rs.id ? { ...x, status: "lifted", reinstatement: { ...(x.reinstatement ?? { requestId: r.id, requestedBy: r.makerId, reason: "" }), liftedAt: now(), liftedBy: approver } } : x)) };
    for (const id of rs.memberIds) {
      const m = memberById(s, id)!;
      s = ev(s, m, "SYSTEM", "restriction", "Reinstatement approved and executed", { oldValue: rs.id, newValue: "Lifted", approvalRequestId: r.id, remarks: `Approved by ${approver}` });
      const still = s.restrictions.some((x) => x.status !== "lifted" && x.memberIds.includes(id));
      if (!still) s = ev(s, m, "SYSTEM", "restriction", "Member reactivated", { approvalRequestId: r.id });
    }
    commit(s);
    return { ok: true, message: `${rs.id} lifted for ${rs.memberIds.join(", ")}. Original restriction and history are preserved (development store)` };
  }
  if (r.requestType === "member_info_correction") {
    const [memberId, field] = r.entityRef.split(":") as [string, "name" | "dob" | "homeAddress"];
    const m = memberById(state, memberId);
    const f = r.versions[r.versions.length - 1].fields.find((x) => x.key === field);
    if (!m || !f) return { ok: false, message: "Member or field not found" };
    const value = String(f.after);
    const next: Member = field === "homeAddress" ? { ...m, addresses: { ...m.addresses, home: { ...m.addresses.home!, line: value.split(",").slice(0, -1).join(",").trim() || value, pincode: value.split(",").pop()!.trim().match(/^\d{6}$/) ? value.split(",").pop()!.trim() : m.addresses.home!.pincode, source: "staff", updatedAt: now() } } } : { ...m, [field]: value };
    let s = putMember(state, next);
    s = ev(s, m, "SYSTEM", "profile", "Verified-field override approved and applied", { oldValue: String(f.before), newValue: value, approvalRequestId: r.id });
    commit(s);
    return { ok: true, message: `${field} updated for ${memberId}; the previous value is kept in history (development store)` };
  }
  return { ok: true, message: "Member restrictions are applied directly in Member Management; nothing to execute" };
}
registerExecutionHandler("members", execute);

/* ======================= Decisions ======================= */

export function updateMemberDecision(uid: string, id: string, patch: Pick<MemberDecision, "status" | "answer">): Res {
  if (!hasPermission(acc(), uid, "users", "manage").allowed) return NO("Only Evolve platform administrators record business decisions");
  if (patch.status === "confirmed" && !patch.answer.trim()) return NO("Record the confirmed answer");
  commit({ ...state, decisions: state.decisions.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  return OK(id, patch.status === "confirmed" ? ["Confirming a decision does not change any configuration by itself"] : []);
}

export const approvalFor = (entityRef: string) => [...approvalStore.get().requests].reverse().find((r) => r.entityRef === entityRef);
