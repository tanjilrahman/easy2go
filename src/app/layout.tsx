import type { Metadata, Viewport } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { Agentation } from "agentation";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { AppProviders } from "./providers";
import { PwaRegistration } from "@/components/pwa-registration";

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
  applicationName: "Easy2Go",
  title: "Easy2Go | Dhaka Route Planner",
  description:
    "Mobile-first deterministic bus and metro route finder for Dhaka with local route planning, open maps, and local-first autocomplete.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Easy2Go",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
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
        <PwaRegistration />
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
