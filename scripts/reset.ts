// Restores the starting point saved by `pnpm snapshot` (or "Save starting point" in the app).
// Safe while the app is running; the agents start fresh conversations on their next message.
import { getDb } from "@/lib/db";
import { dataSummary, restoreSnapshot } from "@/lib/reset";

const db = getDb();
try {
  restoreSnapshot(db);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
console.log(`Restored the starting point (${dataSummary(db).products} products).`);
