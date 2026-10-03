"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STORE_INFO } from "@/lib/store-info";

const LINKS = [
  { href: "/scan", label: "Scan" },
  { href: "/catalog-admin", label: "Catalog" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="bg-white border-b border-line">
      <div className="max-w-[1500px] mx-auto px-6 h-16 flex items-center gap-8">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Shelf<span className="text-accent">ie</span>
        </Link>
        <nav className="flex gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-lg text-lg font-semibold ${
                pathname === link.href ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-muted font-medium">{STORE_INFO.name}</span>
      </div>
    </header>
  );
}
