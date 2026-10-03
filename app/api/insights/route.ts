import { getDb } from "@/lib/db";
import { generateInsights } from "@/lib/insights";
import { errorResponse } from "@/lib/upload";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Runs the analyst agent over the shopping history and stores the report. */
export async function POST() {
  try {
    return Response.json(await generateInsights(getDb()));
  } catch (err) {
    return errorResponse(err);
  }
}
