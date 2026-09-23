import type { Metadata } from "next";
import { PeptimeApp } from "@/components/peptime-app";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <PeptimeApp />;
}
