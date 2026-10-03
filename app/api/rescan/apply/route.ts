import { getDb } from "@/lib/db";
import { applyRescan } from "@/lib/scans";
import { errorResponse } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    const { scanId } = (await request.json()) as { scanId?: number };
    applyRescan(getDb(), Number(scanId));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
