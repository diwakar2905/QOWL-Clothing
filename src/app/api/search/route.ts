import { searchSuggestions } from "@/server/services/catalog";
import { enforce } from "@/server/services/rate-limit";
import { clientIp } from "@/server/request";
import { handle, json } from "@/server/api";

export const GET = handle(async (req: Request) => {
  await enforce(`search:ip:${await clientIp()}`, 120, 60);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json(await searchSuggestions(q.slice(0, 80)));
});
