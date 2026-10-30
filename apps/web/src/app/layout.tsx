import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Newsreader } from "next/font/google";
import { cookies } from "next/headers";

import { SiteHeader } from "@/components/layout";
import { ReadingPreferenceSync } from "@/components/ReadingPreferenceSync";
import { OfflineScreen } from "@/features/offline/OfflineScreen";
import {
  TEXT_SIZE_COOKIE,
  textSizeOrStandard,
  textSizeScale,
} from "@/lib/reading-preference";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auteur Education",
  description:
    "Personalized theoretical education through structured courses in text and audio.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const textSize = textSizeOrStandard(cookieStore.get(TEXT_SIZE_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-text-size={textSize}
      style={{ ["--ft" as string]: String(textSizeScale(textSize)) }}
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col md:flex-row">
        <SiteHeader />
        <div className="flex min-h-full min-w-0 flex-1 flex-col">{children}</div>
        <OfflineScreen />
        <ReadingPreferenceSync />
      </body>
    </html>
  );
}
