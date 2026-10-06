import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

// Archivo's width axis does the typographic work: expanded headings, condensed price tags.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Shelfie",
  description: "One shelf video becomes an agent-ready catalog for small stores.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${archivo.variable}`}>
      <body className="min-h-full lg:flex">
        <Nav />
        <main className="flex-1 min-w-0">{children}</main>
      </body>
    </html>
  );
}
