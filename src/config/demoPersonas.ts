/** Simulated personas for the Client Demo (existing development identities with their real roles). */
export interface DemoPersona { key: string; label: string; userId: string; org: string; note: string }
export const DEMO_PERSONAS: DemoPersona[] = [
  { key: "super_admin", label: "Evolve Super Admin", userId: "USR-1001", org: "Evolve Brands", note: "Platform configuration; no approval rights" },
  { key: "evolve_maker", label: "Evolve Maker", userId: "USR-1003", org: "Evolve Brands", note: "Evolve Operations + Maker for schemes, catalogue, communication and configuration" },
  { key: "client_admin", label: "V-Guard Client Admin", userId: "USR-2001", org: "V-Guard Industries", note: "Client governance; Checker for schemes, members, wallet, communication and more" },
  { key: "vguard_checker", label: "V-Guard Checker (Finance)", userId: "USR-2003", org: "V-Guard Industries", note: "Finance + Checker: approves financial requests" },
  { key: "regional_admin", label: "Regional Admin", userId: "USR-2004", org: "V-Guard Industries", note: "Karnataka only" },
  { key: "branch_manager", label: "Branch Manager / PIC", userId: "USR-2005", org: "V-Guard Industries", note: "Kochi and Aluva branches" },
  { key: "sales_rep", label: "Sales Representative", userId: "USR-2006", org: "V-Guard Industries", note: "Chennai North, EP members" },
  { key: "evolve_finance_ops", label: "Evolve Finance / Operations", userId: "USR-1004", org: "Evolve Brands", note: "Evolve Operations + Maker for finance and member requests (points adjustments, reversals, restrictions)" },
  { key: "business_viewer", label: "Read-only Business Viewer", userId: "USR-2014", org: "V-Guard Industries", note: "View only: no create, approve, export or sensitive data" },
  { key: "tech_ops", label: "Technical Operations", userId: "USR-3002", org: "Evolve Brands", note: "Evolve Operations: integration monitoring, retries and system health" },
];
export const personaOf = (userId: string | undefined) => DEMO_PERSONAS.find((p) => p.userId === userId);
