import { useLocation } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";

/**
 * Record identifiers (MBR-EP-0005, SCH-0001, RCS-0003, DEV-00012 …) are uppercase codes that contain a
 * digit. Collapsing them to [id] groups Speed Insights by page instead of by individual record, and
 * keeps member and record IDs out of the reported route. Lower-case route words such as member-360
 * are left alone.
 */
const ID_SEGMENT = /^[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*$/;
export const routePattern = (pathname: string) => pathname.split("/").map((s) => (ID_SEGMENT.test(decodeURIComponent(s)) ? "[id]" : s)).join("/");

/** Vercel Speed Insights (Core Web Vitals). Reports only on Vercel deployments with Speed Insights enabled. */
export function SpeedInsightsRoute() {
  const { pathname } = useLocation();
  return <SpeedInsights route={routePattern(pathname)} />;
}
