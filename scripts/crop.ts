// Crops every product photo that is still the whole shelf frame (e.g. after an older scan).
// Usage: pnpm crop
import { getDb } from "@/lib/db";
import { cropPendingProducts } from "@/lib/imaging";

const db = getDb();
const before = (db.prepare("SELECT COUNT(*) AS n FROM products WHERE frame_path IS NOT NULL AND crop_path IS NULL").get() as { n: number }).n;
await cropPendingProducts(db);
const left = (db.prepare("SELECT COUNT(*) AS n FROM products WHERE frame_path IS NOT NULL AND crop_path IS NULL").get() as { n: number }).n;
console.log(`Cropped ${before - left} of ${before} products.${left ? ` ${left} could not be located; they keep the full frame.` : ""}`);
