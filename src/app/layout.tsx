import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { SiteAnalytics } from "@/components/site-analytics";
import { getSettings } from "@/server/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(base),
    title: { default: s?.seo.defaultTitle ?? "QOWL", template: s?.seo.titleTemplate ?? "%s | QOWL" },
    description: s?.seo.defaultDescription,
    applicationName: "QOWL",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/brand/favicon-48.png", type: "image/png", sizes: "48x48" },
        { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
      ],
      apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
    },
    openGraph: { type: "website", siteName: "QOWL", locale: "en_IN", images: s?.seo.ogImageUrl ? [s.seo.ogImageUrl] : ["/brand/icon-512.png"] },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = { themeColor: "#073D2D", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:bg-ivory focus:px-4 focus:py-2 focus:text-forest">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <SiteAnalytics />
      </body>
    </html>
  );
}
