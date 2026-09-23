import type { Metadata } from "next";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peptime — personlig peptidlogg",
  description: "En lugn, privat och snabb logg för dina egna peptiddata.",
  applicationName: "Peptime",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Peptime" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="sv"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}<PwaUpdatePrompt /></body>
    </html>
  );
}
