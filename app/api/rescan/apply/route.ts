import { after } from "next/server";
import { getDb } from "@/lib/db";
import { cropPendingProducts } from "@/lib/imaging";
import { applyRescan } from "@/lib/scans";
import { errorResponse } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    const { scanId } = (await request.json()) as { scanId?: number };
    const db = getDb();
    applyRescan(db, Number(scanId));
    after(() => cropPendingProducts(db)); // crop any new products the rescan added
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
