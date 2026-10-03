"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STORE_INFO } from "@/lib/store-info";

const LINKS = [
  { href: "/scan", label: "Scan" },
  { href: "/catalog-admin", label: "Catalog" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/insights", label: "Insights" },
] as const;

export function Nav() {
  const pathname = usePathname();
  if (pathname === "/shop") return null; // the shopper's window is not the store's app
  return (
    <header className="sticky top-0 z-20 bg-ink/95 backdrop-blur border-b border-white/10">
      <div className="max-w-[1500px] mx-auto px-6 h-16 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-white">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] animate-pulse" />
          <span>Shelf<span className="text-gradient">ie</span></span>
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-lg text-lg font-semibold ${
                pathname === link.href ? "bg-white/12 text-white ring-1 ring-white/20" : "text-slate-300 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto font-mono text-sm uppercase tracking-widest text-cyan-300">● live · {STORE_INFO.name}</span>
      </div>
    </header>
  );
}
