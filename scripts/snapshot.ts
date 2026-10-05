// Saves the current database and its photos/videos as the starting point that `pnpm reset` restores.
import { getDb } from "@/lib/db";
import { SNAPSHOT_DB, saveSnapshot } from "@/lib/reset";

saveSnapshot(getDb());
console.log(`Saved the starting point to ${SNAPSHOT_DB}.`);
