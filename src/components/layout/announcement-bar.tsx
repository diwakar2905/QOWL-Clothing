import Link from "next/link";
import { safeHref } from "@/lib/utils";

export function AnnouncementBar({ items }: { items: { id: string; message: string; href: string | null }[] }) {
  if (!items.length) return null;
  const a = items[0]!;
  const href = safeHref(a.href);
  return (
    <div className="relative z-[60] bg-obsidian text-ivory">
      <p className="mx-auto max-w-[1440px] px-4 py-2 text-center text-[11px] font-medium uppercase tracking-[0.2em]">
        {href ? (
          <Link href={href} className="link-underline">{a.message}</Link>
        ) : (
          a.message
        )}
      </p>
    </div>
  );
}
