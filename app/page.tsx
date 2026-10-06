import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { STORE_INFO } from "@/lib/store-info";
import { seenAgo } from "@/lib/time";
import { Price } from "@/components/price";

export const dynamic = "force-dynamic";

// Facings stand at different heights, like real stock on a real shelf.
const HEIGHTS = ["h-44", "h-36", "h-48", "h-32", "h-40", "h-36", "h-44"];

const STEPS = [
  ["Film the shelf", "A minute of phone video. Vision names, describes and prices every product it can see."],
  ["Approve it", "Fix a name, say a price the camera couldn't read, and tap approve."],
  ["Agents shop it", "Your store agent answers shopper agents in Band, from what is on the shelf right now."],
];

export default function Home() {
  const products = getDb()
    .prepare("SELECT * FROM products WHERE status = 'approved' AND on_shelf = 1 ORDER BY id LIMIT 7")
    .all() as Product[];
  const latest = products.reduce<string | null>((a, p) => (!a || p.last_seen_at > a ? p.last_seen_at : a), null);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-6xl w-full mx-auto px-6 py-5 flex items-center gap-6">
        <span className="wide text-2xl font-extrabold text-accent">Shelfie</span>
        <nav className="ml-auto flex items-center gap-2">
          <Link href="/shop" className="btn border-transparent bg-transparent hidden sm:inline-flex">
            Shopper view
          </Link>
          <Link href="/scan" className="btn btn-primary">
            Open the back office
          </Link>
        </nav>
      </header>

      <section className="max-w-6xl w-full mx-auto px-6 pt-10 pb-12">
        <h1 className="text-5xl md:text-7xl leading-[1.02] max-w-[16ch]">One minute of video, and any small store can sell to AI shoppers.</h1>
        <p className="text-xl md:text-2xl text-muted max-w-[52ch] mt-6 leading-snug">
          Shopper agents can find anything on Amazon and nothing on the shelf of the gift shop down the street. Shelfie
          puts that shelf online, and keeps it true.
        </p>
      </section>

      <section className="max-w-6xl w-full mx-auto px-6" aria-label={`On the shelf at ${STORE_INFO.name}`}>
        <p className="text-muted mb-3">
          {products.length > 0
            ? `On the shelf at ${STORE_INFO.name}, last seen ${latest ? seenAgo(latest) : "recently"}`
            : `The shelf at ${STORE_INFO.name} is empty`}
        </p>
        {/* One scroller for products and tags, so each tag stays under its product on narrow screens. */}
        <div className="overflow-x-auto pb-3">
          <div className={products.length ? "min-w-max" : ""}>
            <div className="flex items-end gap-3 md:gap-5 px-4 md:px-6 min-h-52">
              {products.map((p, i) => {
                const photo = p.image_path ?? p.crop_path;
                return (
                  <div key={p.id} className={`shrink-0 w-28 md:w-32 ${HEIGHTS[i % HEIGHTS.length]} flex items-end`}>
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- photos are served from data/
                      <img src={`/api/media/${photo}`} alt={p.name} className="w-full h-full object-contain object-bottom" />
                    ) : (
                      <div className="w-full h-full panel rounded-b-none border-b-0 p-3 flex flex-col justify-end">
                        <span className="text-sm text-muted">{p.category}</span>
                        <span className="font-semibold leading-tight">{p.name}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {products.length === 0 && (
                <div className="flex-1 self-center text-center text-lg text-muted py-10">
                  Products appear here once you scan and approve a shelf.
                </div>
              )}
            </div>
            {/* The shelf edge with its label channel; each tag sits under its product. */}
            <div className="bg-[#2c3a35] rounded-sm px-4 md:px-6 py-2 flex gap-3 md:gap-5 shadow-[0_10px_0_-4px_#d4d9d4]">
              {products.map((p) => (
                <div key={p.id} className="shrink-0 w-28 md:w-32">
                  {p.price_usd === null ? (
                    <span className="tag opacity-80">Ask</span>
                  ) : (
                    <Price usd={p.price_usd} className="text-2xl" />
                  )}
                </div>
              ))}
              {products.length === 0 && <div className="h-8" />}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl w-full mx-auto px-6 py-16 grid md:grid-cols-3 gap-8 md:gap-12">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="border-t-2 border-ink pt-4">
            <h2 className="text-xl">
              <span className="text-muted mr-2">{i + 1}</span>
              {title}
            </h2>
            <p className="text-muted mt-2 leading-snug max-w-[40ch]">{body}</p>
          </div>
        ))}
      </section>

      <section className="max-w-6xl w-full mx-auto px-6 pb-20 flex flex-wrap gap-3">
        <Link href="/scan" className="btn btn-primary btn-lg">
          Scan a shelf
        </Link>
        <Link href="/catalog-admin" className="btn btn-lg">
          See the catalog
        </Link>
        <Link href="/shop" className="btn btn-lg">
          Shop with an agent
        </Link>
      </section>
    </div>
  );
}
