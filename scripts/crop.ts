// Runs the photo pipeline (crop, retouch, check) now for every product that still needs it,
// e.g. products scanned before the pipeline existed. The web app also does this in the background.
// Usage: pnpm crop   (PHOTO_RETOUCH=off pnpm crop to skip retouching)
import { getDb } from "@/lib/db";
import { processPendingPhotos } from "@/lib/imaging";

const db = getDb();
const pending = "SELECT COUNT(*) AS n FROM products WHERE frame_path IS NOT NULL AND imaged_at IS NULL AND imaging_attempts < 3";
const before = (db.prepare(pending).get() as { n: number }).n;
await processPendingPhotos(db);
const left = (db.prepare(pending).get() as { n: number }).n;
const counts = db
  .prepare(
    `SELECT SUM(crop_path IS NOT NULL) AS cropped, SUM(image_path LIKE '%-retouched.jpg') AS retouched,
            SUM(image_path LIKE '%-enhanced.jpg') AS sharpened, SUM(check_status = 'corrected') AS relabelled, SUM(check_status = 'no_match') AS photo_removed
     FROM products WHERE frame_path IS NOT NULL`,
  )
  .get() as Record<string, number>;
console.log(`Processed ${before - left} of ${before} products. Now: ${JSON.stringify(counts)}${left ? `. ${left} failed and will be retried.` : ""}`);
