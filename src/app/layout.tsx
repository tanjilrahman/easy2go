import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";

import "./globals.css";
import { AppProviders } from "./providers";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Easy2Go | Dhaka Route Planner",
  description:
    "Mobile-first deterministic bus and metro route finder for Dhaka with Google place search and transit map previews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${outfit.variable} h-full scroll-smooth`}
    >
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
