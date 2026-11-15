import { indexNowKey } from "@/lib/indexnow";

/** IndexNow ownership file (see src/lib/indexnow.ts). 404 when IndexNow isn't configured. */
export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
