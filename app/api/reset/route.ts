import { getDb } from "@/lib/db";
import {
  clearData,
  clearMedia,
  clearsMedia,
  dataSummary,
  restoreSnapshot,
  saveSnapshot,
  type ClearScope,
} from "@/lib/reset";
import { seedCatalog, seedSampleConversations } from "@/lib/seed";
import { errorResponse } from "@/lib/upload";

export const dynamic = "force-dynamic";

export type ResetAction = ClearScope | "save" | "restore" | "sample_catalog" | "sample_conversations";

const SCOPES: ClearScope[] = ["catalog", "holds", "conversations", "reports", "everything"];

export async function GET() {
  return Response.json(dataSummary(getDb()));
}

/** Clears one kind of test data, or saves/restores the starting point, or loads sample data. */
export async function POST(request: Request) {
  try {
    const { action } = (await request.json()) as { action?: ResetAction };
    const db = getDb();
    if (SCOPES.includes(action as ClearScope)) {
      clearData(db, action as ClearScope);
      if (clearsMedia(action as ClearScope)) clearMedia();
    } else if (action === "save") saveSnapshot(db);
    else if (action === "restore") restoreSnapshot(db);
    else if (action === "sample_catalog") {
      clearData(db, "everything");
      clearMedia();
      seedCatalog(db);
    } else if (action === "sample_conversations") seedSampleConversations(db);
    else return errorResponse(new Error(`Unknown action "${action}"`), 400);
    return Response.json(dataSummary(db));
  } catch (err) {
    return errorResponse(err, 400);
  }
}
