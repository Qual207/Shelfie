import { getDb } from "@/lib/db";
import { runInitialScan } from "@/lib/scans";
import { errorResponse, ingestUpload } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { scanId, frames } = await ingestUpload(db, "initial", await request.formData());
    const count = await runInitialScan(db, scanId, frames);
    return Response.json({ scanId, count });
  } catch (err) {
    return errorResponse(err);
  }
}
