import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: "LeoPay — Payments that move your business forward",
    template: "%s · LeoPay",
  },
  description:
    "LeoPay helps Nigerian businesses collect payments, send invoices, run a storefront and understand their finances from one secure workspace.",
  applicationName: "LeoPay",
  keywords: ["payments", "Nigeria", "invoicing", "fintech", "business payments", "payment links"],
  openGraph: {
    title: "LeoPay — Payments that move your business forward",
    description:
      "Collect payments, send invoices, manage your storefront, and understand your business finances from one secure workspace.",
    type: "website",
    locale: "en_NG",
    siteName: "LeoPay",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#070C17" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--brand-foreground)]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
