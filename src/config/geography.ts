import type { GeoState, ProductCategory } from "@/types/domain";

/**
 * Geography hierarchy (State > District > Branch) — DEVELOPMENT DATA.
 * Branch and pincode masters are owned by SFDC; the portal only reads them for analytics in Phase 1.
 * Weights shape the demo distribution only.
 */
type Raw = [code: string, name: string, weight: number, districts: [string, number, string[]][]];

const RAW: Raw[] = [
  ["KL", "Kerala", 0.17, [["Ernakulam", 0.3, ["Kochi", "Aluva"]], ["Thiruvananthapuram", 0.22, ["Thiruvananthapuram"]], ["Kozhikode", 0.2, ["Kozhikode"]], ["Thrissur", 0.16, ["Thrissur"]], ["Kollam", 0.12, ["Kollam"]]]],
  ["TN", "Tamil Nadu", 0.14, [["Chennai", 0.34, ["Chennai North", "Chennai South"]], ["Coimbatore", 0.26, ["Coimbatore"]], ["Madurai", 0.2, ["Madurai"]], ["Tiruchirappalli", 0.2, ["Tiruchirappalli"]]]],
  ["KA", "Karnataka", 0.11, [["Bengaluru Urban", 0.48, ["Bengaluru East", "Bengaluru West"]], ["Mysuru", 0.2, ["Mysuru"]], ["Dakshina Kannada", 0.17, ["Mangaluru"]], ["Belagavi", 0.15, ["Belagavi"]]]],
  ["MH", "Maharashtra", 0.1, [["Mumbai Suburban", 0.32, ["Mumbai"]], ["Pune", 0.3, ["Pune"]], ["Nagpur", 0.2, ["Nagpur"]], ["Nashik", 0.18, ["Nashik"]]]],
  ["AP", "Andhra Pradesh", 0.08, [["Visakhapatnam", 0.36, ["Visakhapatnam"]], ["Krishna", 0.34, ["Vijayawada"]], ["Guntur", 0.3, ["Guntur"]]]],
  ["TS", "Telangana", 0.07, [["Hyderabad", 0.6, ["Hyderabad Central", "Secunderabad"]], ["Warangal", 0.22, ["Warangal"]], ["Karimnagar", 0.18, ["Karimnagar"]]]],
  ["UP", "Uttar Pradesh", 0.07, [["Lucknow", 0.34, ["Lucknow"]], ["Ghaziabad", 0.26, ["Ghaziabad"]], ["Kanpur Nagar", 0.22, ["Kanpur"]], ["Varanasi", 0.18, ["Varanasi"]]]],
  ["GJ", "Gujarat", 0.06, [["Ahmedabad", 0.42, ["Ahmedabad"]], ["Surat", 0.34, ["Surat"]], ["Vadodara", 0.24, ["Vadodara"]]]],
  ["WB", "West Bengal", 0.05, [["Kolkata", 0.6, ["Kolkata"]], ["Howrah", 0.4, ["Howrah"]]]],
  ["RJ", "Rajasthan", 0.05, [["Jaipur", 0.55, ["Jaipur"]], ["Jodhpur", 0.45, ["Jodhpur"]]]],
  ["DL", "Delhi", 0.04, [["New Delhi", 0.5, ["Delhi Central"]], ["North West Delhi", 0.5, ["Delhi North"]]]],
  ["OD", "Odisha", 0.03, [["Khordha", 0.62, ["Bhubaneswar"]], ["Cuttack", 0.38, ["Cuttack"]]]],
  ["MP", "Madhya Pradesh", 0.02, [["Indore", 0.55, ["Indore"]], ["Bhopal", 0.45, ["Bhopal"]]]],
];

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const GEOGRAPHY: GeoState[] = RAW.map(([code, name, weight, districts]) => ({
  code,
  name,
  weight,
  districts: districts.map(([dName, dWeight, branches]) => ({
    code: `${code}-${slug(dName)}`,
    name: dName,
    weight: dWeight,
    branches: branches.map((b) => ({ code: `${code}-BR-${slug(b)}`, name: `${b} branch`, weight: 1 / branches.length })),
  })),
}));

export function findState(code: string) {
  return GEOGRAPHY.find((s) => s.code === code);
}

export function findDistrict(code: string) {
  for (const s of GEOGRAPHY) {
    const d = s.districts.find((x) => x.code === code);
    if (d) return { state: s, district: d };
  }
  return undefined;
}

export function findBranch(code: string) {
  for (const s of GEOGRAPHY) {
    for (const d of s.districts) {
      const b = d.branches.find((x) => x.code === code);
      if (b) return { state: s, district: d, branch: b };
    }
  }
  return undefined;
}

/** V-Guard product categories used for scan analytics (demo weights and points). */
export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { key: "wires", name: "Wires & cables", weight: 0.31, pointsPerScan: 6 },
  { key: "stabilizers", name: "Voltage stabilizers", weight: 0.17, pointsPerScan: 22 },
  { key: "switchgear", name: "Switchgear", weight: 0.13, pointsPerScan: 8 },
  { key: "fans", name: "Fans", weight: 0.12, pointsPerScan: 14 },
  { key: "pumps", name: "Pumps", weight: 0.09, pointsPerScan: 30 },
  { key: "water_heaters", name: "Water heaters", weight: 0.08, pointsPerScan: 26 },
  { key: "inverters", name: "Inverters & batteries", weight: 0.06, pointsPerScan: 40 },
  { key: "solar", name: "Solar", weight: 0.04, pointsPerScan: 45 },
];

export function findCategory(key: string) {
  return PRODUCT_CATEGORIES.find((c) => c.key === key);
}
