"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STORE_INFO } from "@/lib/store-info";
import { ResetDialog } from "./reset-dialog";

const LINKS = [
  { href: "/scan", label: "Scan a shelf" },
  { href: "/catalog-admin", label: "Catalog" },
  { href: "/dashboard", label: "Holds and questions" },
  { href: "/insights", label: "Insights" },
] as const;

/** The store owner's sidebar. The landing page and the shopper's window have their own chrome. */
export function Nav() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/shop" || pathname === "/catalog") return null;
  return (
    <aside className="lg:w-64 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 bg-surface border-b lg:border-b-0 lg:border-r border-line flex lg:flex-col">
      <div className="px-5 py-4 lg:py-6 lg:border-b border-line">
        <Link href="/" className="wide text-2xl font-extrabold tracking-tight text-accent">
          Shelfie
        </Link>
        <p className="hidden lg:block text-sm text-muted mt-1 leading-snug">{STORE_INFO.name}</p>
      </div>
      <nav className="flex lg:flex-col gap-1 p-2 lg:p-3 overflow-x-auto flex-1" aria-label="Store">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-2 rounded-md font-semibold whitespace-nowrap ${
                active ? "bg-accent-tint text-accent-dark" : "text-muted hover:text-ink hover:bg-paper"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden lg:flex flex-col gap-2 p-3 border-t border-line">
        <Link href="/shop" target="_blank" className="px-3 py-2 rounded-md font-semibold text-muted hover:text-ink hover:bg-paper">
          Open shopper view
        </Link>
        <ResetDialog trigger="sidebar" />
      </div>
    </aside>
  );
}
