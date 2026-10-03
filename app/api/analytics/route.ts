import { computeAnalytics, type Analytics } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { latestInsights, type StoredInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

export interface AnalyticsResponse {
  analytics: Analytics;
  insights: StoredInsights | null;
  stale: boolean; // conversations were logged after the insights were written
}

export async function GET() {
  const db = getDb();
  const analytics = computeAnalytics(db);
  const insights = latestInsights(db);
  const response: AnalyticsResponse = {
    analytics,
    insights,
    stale: !insights || insights.message_count < analytics.message_count,
  };
  return Response.json(response);
}
