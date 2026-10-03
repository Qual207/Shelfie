import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shelfie",
  description: "One shelf video becomes an agent-ready catalog for small stores.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1 w-full max-w-[1500px] mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
