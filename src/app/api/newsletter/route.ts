import { z } from "zod";
import { subscribe } from "@/server/services/newsletter";
import { clientIp } from "@/server/request";
import { handle, json, readJson } from "@/server/api";

export const POST = handle(async (req: Request) => {
  const body = z.object({ email: z.string().max(254), consent: z.boolean(), source: z.string().max(40).optional() }).parse(await readJson(req));
  const r = await subscribe(body.email, { ip: await clientIp(), consent: body.consent, source: body.source });
  return json({ pending: r.pending });
});
