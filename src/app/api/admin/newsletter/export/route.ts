import { requirePermission } from "@/server/auth/session";
import { exportSubscribersCsv } from "@/server/services/newsletter";
import { audit } from "@/server/services/audit";
import { handle } from "@/server/api";

export const GET = handle(async () => {
  const u = await requirePermission("newsletter.export");
  await audit({ actorId: u.id, action: "newsletter.export", entityType: "NewsletterSubscriber" });
  return new Response(await exportSubscribersCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="qowl-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
});
