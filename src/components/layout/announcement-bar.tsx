import Link from "next/link";
import { safeHref } from "@/lib/utils";

export function AnnouncementBar({ items }: { items: { id: string; message: string; href: string | null }[] }) {
  if (!items.length) return null;
  const a = items[0]!;
  const href = safeHref(a.href);
  return (
    <div data-announcement-bar className="relative z-[60] h-8 bg-obsidian text-ivory">
      <p className="mx-auto block h-8 max-w-[1440px] truncate px-4 text-center leading-8 text-[10.5px] font-medium uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.2em]">
        {href ? (
          <Link href={href} className="link-underline">{a.message}</Link>
        ) : (
          a.message
        )}
      </p>
    </div>
  );
}
