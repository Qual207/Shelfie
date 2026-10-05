// Replaces the catalog with a JSON fixture, for testing without a store video.
// Usage: pnpm seed [fixture.json]   (default: fixtures/seed-catalog.json)
import { getDb } from "@/lib/db";
import { SAMPLE_CATALOG, seedCatalog } from "@/lib/seed";

const file = process.argv[2] ?? SAMPLE_CATALOG;
console.log(`Seeded ${seedCatalog(getDb(), file)} products from ${file}.`);
