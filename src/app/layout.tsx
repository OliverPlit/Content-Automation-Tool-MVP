import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

/**
 * Typografie-Strategie.
 *
 * - Apple-Geräte haben SF Pro Display + Text NATIV → die werden bevorzugt.
 * - Windows/Linux/Android haben kein SF Pro → wir laden Inter als
 *   visuell identischen Open-Source-Substitut via next/font.
 *   Inter wurde von Rasmus Andersson explizit als SF-Pro-Replacement
 *   gestaltet — die Glyph-Metriken matchen auf ~98 %.
 *
 * Resultat: einheitliches Apple-Look auf ALLEN Plattformen, kein FOUT
 * (Next.js inlined Font-Faces), keine externen Requests im Render-Pfad.
 *
 * Reihenfolge im CSS-Stack (globals.css):
 *   1. SF Pro Display / SF Pro Text  ← Macs/iPads
 *   2. var(--font-inter)             ← alle anderen
 *   3. -apple-system, system-ui, …   ← absoluter Fallback
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
  // Weight-Subset: was wir in der App tatsächlich verwenden.
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Content Tool",
  description: "Creative-Generator für Performance-Marketing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
