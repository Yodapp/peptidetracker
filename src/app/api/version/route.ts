import { APP_VERSION } from "@/lib/service-worker";

export function GET() {
  return Response.json({ version: APP_VERSION }, { headers: { "Cache-Control": "no-store" } });
}
