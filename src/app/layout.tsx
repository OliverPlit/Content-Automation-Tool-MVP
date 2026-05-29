import type { Metadata } from "next";
import "./globals.css";

/**
 * Globaler Apple-Style: SF Pro Stack über system-ui.
 * Kein Google-Font-Import nötig — alle Apple-Devices haben SF Pro nativ,
 * andere fallen auf system-ui zurück (sieht auf allen Plattformen sauber
 * aus, lädt 0 zusätzliche Bytes).
 */

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
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
