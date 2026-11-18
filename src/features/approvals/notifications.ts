/**
 * NOTIFICATION ABSTRACTION.
 * The engine raises events; channels deliver them. Only the in-portal channel is active. Email and
 * SMS are declared so templates and preferences can be designed, but nothing is sent until a real
 * service is configured on the backend.
 */
import type { ApprovalEvent, ApprovalNotification } from "@/types/approval";

export interface NotificationChannel {
  id: "portal" | "email" | "sms";
  label: string;
  active: boolean;
  status: string;
}

export const CHANNELS: NotificationChannel[] = [
  { id: "portal", label: "In-portal notification", active: true, status: "Active (mock, stored in this browser session)" },
  { id: "email", label: "Email", active: false, status: "Not configured. No email service is connected, so nothing is sent" },
  { id: "sms", label: "SMS", active: false, status: "Not configured" },
];

export const EVENT_LABEL: Partial<Record<ApprovalEvent, string>> = {
  "request.submitted": "Request submitted",
  "approver.assigned": "Assigned to you",
  "request.returned": "Returned for correction",
  "request.rejected": "Rejected",
  "stage.completed": "Stage approved",
  "approval.completed": "Approved",
  "request.escalated": "Escalated",
  "request.overdue": "Overdue",
  "execution.completed": "Executed",
  "execution.failed": "Execution failed",
  "routing.exception": "Routing exception",
  "request.withdrawn": "Withdrawn",
};

export function notificationsFor(all: ApprovalNotification[], userId: string) {
  return all.filter((n) => n.recipientId === userId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id.localeCompare(a.id)));
}
