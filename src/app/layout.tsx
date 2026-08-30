import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peptime — personlig peptidlogg",
  description: "En lugn, privat och snabb logg för dina egna peptiddata.",
  applicationName: "Peptime",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Peptime" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="sv"
      className="dark h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
