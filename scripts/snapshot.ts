// Saves the current database as the pre-demo snapshot that `pnpm reset` restores.
import { rmSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, getDb } from "@/lib/db";

const target = path.join(DATA_DIR, "snapshot.db");
rmSync(target, { force: true });
getDb().prepare("VACUUM INTO ?").run(target);
console.log(`Saved the demo snapshot to ${target}.`);
