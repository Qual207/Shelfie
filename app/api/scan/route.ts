import { after } from "next/server";
import { getDb } from "@/lib/db";
import { processPendingPhotos } from "@/lib/imaging";
import { runInitialScan } from "@/lib/scans";
import { errorResponse, ingestUpload } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { scanId, frames } = await ingestUpload(db, "initial", await request.formData());
    const count = await runInitialScan(db, scanId, frames);
    after(() => processPendingPhotos(db)); // photos crop, retouch and get checked while the owner reviews
    return Response.json({ scanId, count });
  } catch (err) {
    return errorResponse(err);
  }
}
