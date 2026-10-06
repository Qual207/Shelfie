import { after } from "next/server";
import { getDb } from "@/lib/db";
import { processPendingPhotos } from "@/lib/imaging";
import { applyRescan } from "@/lib/scans";
import { errorResponse } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    const { scanId } = (await request.json()) as { scanId?: number };
    const db = getDb();
    applyRescan(db, Number(scanId));
    after(() => processPendingPhotos(db)); // crop, retouch and check any new products
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
