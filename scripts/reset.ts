// Restores the pre-demo snapshot saved by `pnpm snapshot`. Safe while the app is running:
// tables are replaced inside one transaction instead of swapping the database file.
import { existsSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, getDb } from "@/lib/db";

const snapshot = path.join(DATA_DIR, "snapshot.db");
if (!existsSync(snapshot)) {
  console.error("No snapshot yet. Run `pnpm snapshot` once the catalog is in its pre-demo state.");
  process.exit(1);
}

const db = getDb();
db.prepare("ATTACH DATABASE ? AS snap").run(snapshot);
db.transaction(() => {
  for (const table of ["holds", "questions", "products", "scans"]) db.exec(`DELETE FROM main.${table}`);
  for (const table of ["scans", "products", "holds", "questions"]) {
    db.exec(`INSERT INTO main.${table} SELECT * FROM snap.${table}`);
  }
})();
db.exec("DETACH DATABASE snap");

const { n } = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
console.log(`Restored the demo snapshot (${n} products).`);
console.log("Restart `pnpm demo` too, so both agents start fresh ZooWork conversations.");
