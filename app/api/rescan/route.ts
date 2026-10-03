import { getDb } from "@/lib/db";
import { runRescan } from "@/lib/scans";
import { errorResponse, ingestUpload } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { scanId, frames } = await ingestUpload(db, "rescan", await request.formData());
    const diff = await runRescan(db, scanId, frames);
    return Response.json({ scanId, diff });
  } catch (err) {
    return errorResponse(err);
  }
}
