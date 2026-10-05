// Adds SAMPLE shopper conversations so /insights can be tried without live Band sessions.
// These are invented for testing: clear them from the "Clear test data" dialog, or with
// `pnpm reset` after `pnpm snapshot` on a clean state. Never present them as real shopper history.
import { getDb } from "@/lib/db";
import { seedSampleConversations } from "@/lib/seed";

seedSampleConversations(getDb());
console.log("Added 2 SAMPLE conversations. Open /insights.");
