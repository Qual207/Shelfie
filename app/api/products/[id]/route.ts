import { getProductRow } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/upload";

/** Owner review: approve, edit name/description/category, or type a price. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    const id = Number((await ctx.params).id);
    const db = getDb();
    if (!getProductRow(db, id)) return errorResponse(new Error("Product not found"), 404);
    const body = (await request.json()) as {
      status?: "approved";
      name?: string;
      description?: string;
      category?: string;
      price_usd?: number | null;
    };

    if (body.price_usd !== undefined) {
      const price = body.price_usd === null ? null : Number(body.price_usd);
      if (price !== null && !(price > 0)) return errorResponse(new Error("Enter a price above $0"), 400);
      db.prepare("UPDATE products SET price_usd = ?, price_source = ? WHERE id = ?").run(
        price, price === null ? null : "owner_typed", id,
      );
    }
    for (const field of ["name", "description", "category"] as const) {
      const value = body[field]?.trim();
      if (value !== undefined) {
        if (field === "name" && !value) return errorResponse(new Error("Name can't be empty"), 400);
        db.prepare(`UPDATE products SET ${field} = ? WHERE id = ?`).run(value, id);
      }
    }
    if (body.status === "approved") db.prepare("UPDATE products SET status = 'approved' WHERE id = ?").run(id);
    return Response.json(getProductRow(db, id));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    getDb().prepare("DELETE FROM products WHERE id = ?").run(Number((await ctx.params).id));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
