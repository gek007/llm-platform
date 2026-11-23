import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Noto_Sans_Hebrew } from "next/font/google";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { TutorWidget } from "@/components/tutor/tutor-widget";
import { ClerkClientProvider } from "@/components/providers/clerk-client-provider";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { siteConfig } from "@/config/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

// Geist and Fraunces have no Hebrew glyphs; this is the fallback for Hebrew course content.
const notoSansHebrew = Noto_Sans_Hebrew({
  variable: "--font-noto-hebrew",
  subsets: ["hebrew"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${notoSansHebrew.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkClientProvider>
          <ConvexClientProvider>
            <SiteHeader />
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
            <TutorWidget />
          </ConvexClientProvider>
        </ClerkClientProvider>
      </body>
    </html>
  );
}
