import type { Metadata, Viewport } from "next";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peptime — personlig peptidlogg",
  description: "En lugn, privat och snabb logg för dina egna peptiddata.",
  applicationName: "Peptime",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // "default" follows the system appearance; "black-translucent" always draws
  // white status bar text, which is unreadable in light mode.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Peptime" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="sv"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}<PwaUpdatePrompt /></body>
    </html>
  );
}
