import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto py-16 flex flex-col gap-12">
      <div className="flex flex-col gap-6">
        <p className="font-mono text-accent font-bold text-lg uppercase tracking-[0.3em]">The AI merchant for small stores</p>
        <h1 className="text-7xl font-extrabold tracking-tight leading-[1.05]">
          One minute of video, and any small store can sell to <span className="text-gradient">AI shoppers.</span>
        </h1>
        <p className="text-2xl text-muted max-w-3xl leading-snug">
          Shoppers now send AI agents to shop for them. Those agents find anything on Amazon, and nothing on the
          shelf of the gift shop down the street. Shelfie puts that shelf online.
        </p>
      </div>
      <ol className="grid md:grid-cols-3 gap-6">
        {[
          ["Film the shelves", "A vision model turns one video into named, described, priced products."],
          ["Owner approves", "Tap to approve. Say any price the camera can't read."],
          ["Agents shop it", "A store agent on ZooWork sells from what's on the shelf right now, to shopper agents in Band."],
        ].map(([title, body], i) => (
          <li key={title} className="bg-white rounded-2xl border border-line p-6">
            <div className="text-accent text-4xl font-extrabold">{i + 1}</div>
            <h2 className="text-2xl font-bold mt-2">{title}</h2>
            <p className="text-lg text-muted mt-2 leading-snug">{body}</p>
          </li>
        ))}
      </ol>
      <div className="flex gap-4">
        <Link href="/scan" className="px-8 py-4 rounded-xl bg-accent hover:bg-accent-dark text-white text-xl font-bold">
          Scan a shelf
        </Link>
        <Link href="/catalog-admin" className="px-8 py-4 rounded-xl border-2 border-ink text-xl font-bold hover:bg-white">
          View catalog
        </Link>
        <Link href="/shop" className="px-8 py-4 rounded-xl border-2 border-ink text-xl font-bold hover:bg-white">
          Shop with my agent
        </Link>
      </div>
    </div>
  );
}
