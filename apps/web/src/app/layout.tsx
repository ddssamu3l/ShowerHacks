import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter, Mona_Sans } from "next/font/google";
import { Agentation } from "agentation";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const monaSans = Mona_Sans({ subsets: ["latin"], variable: "--font-mona", axes: ["wdth"] });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Vibecodemaxxing",
  description: "Scrub fast. Type faster. Ship absolutely nothing.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark", inter.variable, monaSans.variable, geistMono.variable)}>
      <body>
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
