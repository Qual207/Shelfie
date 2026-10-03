import { roomMessagesFrom, sendToShopper, type RoomMessage } from "@/lib/band-room";
import { getDb } from "@/lib/db";
import { STORE_INFO } from "@/lib/store-info";
import { errorResponse } from "@/lib/upload";

export const dynamic = "force-dynamic";

export interface ShopHold {
  product_name: string;
  price_usd: number | null;
  frame_path: string | null;
  image_path: string | null;
  customer_name: string;
  until_time: string;
  store: string;
}
export interface ShopThread {
  messages: RoomMessage[];
  hold: ShopHold | null;
}

/** The shopper's message goes into the Band room as the human, addressed to the shopper agent. */
export async function POST(request: Request) {
  try {
    const { text } = (await request.json()) as { text?: string };
    if (!text?.trim()) return errorResponse(new Error("Type what you're shopping for"), 400);
    const sentAt = new Date().toISOString();
    return Response.json({ messageId: await sendToShopper(text.trim()), sentAt });
  } catch (err) {
    return errorResponse(err);
  }
}

/** The thread since `from` (a Band message id), plus any hold the store agent placed since `since`. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const since = params.get("since");
    if (!from || !since) return errorResponse(new Error("from and since are required"), 400);
    const hold = getDb()
      .prepare(
        `SELECT p.name AS product_name, p.price_usd, p.frame_path, COALESCE(p.image_path, p.crop_path) AS image_path,
                h.customer_name, h.until_time
         FROM holds h JOIN products p ON p.id = h.product_id
         WHERE h.created_at >= ? ORDER BY h.id DESC LIMIT 1`,
      )
      .get(since) as Omit<ShopHold, "store"> | undefined;
    const thread: ShopThread = {
      messages: await roomMessagesFrom(from),
      hold: hold ? { ...hold, store: STORE_INFO.name } : null,
    };
    return Response.json(thread);
  } catch (err) {
    return errorResponse(err);
  }
}
