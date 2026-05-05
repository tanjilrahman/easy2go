import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { AppProviders } from "./providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-syne",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Easy2Go | Dhaka Route Planner",
  description:
    "Mobile-first deterministic bus and metro route finder for Dhaka with local route planning, open maps, and local-first autocomplete.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`h-full scroll-smooth ${dmSans.variable} ${syne.variable} antialiased`}
    >
      <body className="min-h-full font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
