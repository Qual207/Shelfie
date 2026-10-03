import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/upload";
import { matchSpokenPrice } from "@/lib/vision";

export async function POST(request: Request) {
  try {
    const { transcript } = (await request.json()) as { transcript?: string };
    if (!transcript?.trim()) return errorResponse(new Error("Nothing was heard"), 400);
    const db = getDb();
    const unpriced = db
      .prepare("SELECT id, name FROM products WHERE price_usd IS NULL ORDER BY id")
      .all() as { id: number; name: string }[];
    if (unpriced.length === 0) return errorResponse(new Error("Every product already has a price"), 400);

    const match = await matchSpokenPrice(transcript, unpriced);
    if (match.product_id === null || match.price_usd === null) {
      return errorResponse(new Error(`Couldn't match "${transcript}" to a product and price. Try again or type it.`), 422);
    }
    db.prepare("UPDATE products SET price_usd = ?, price_source = 'owner_voice' WHERE id = ?").run(
      match.price_usd, match.product_id,
    );
    const name = unpriced.find((p) => p.id === match.product_id)!.name;
    return Response.json({ productId: match.product_id, name, price_usd: match.price_usd });
  } catch (err) {
    return errorResponse(err);
  }
}
