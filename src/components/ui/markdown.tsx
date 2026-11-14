import Link from "next/link";
import type { ReactNode } from "react";
import { safeHref } from "@/lib/utils";

/**
 * Restricted Markdown renderer for admin-authored pages. Supports headings
 * (##, ###), paragraphs, bullet/numbered lists, blockquotes, **bold**,
 * *italic* and [links](url). Output is React elements only — raw HTML in the
 * source is shown as text, so stored content cannot inject scripts.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      const safe = safeHref(href);
      if (!safe) out.push(label);
      else if (safe.startsWith("/")) out.push(<Link key={k} href={safe} className="text-forest underline underline-offset-4">{label}</Link>);
      else out.push(<a key={k} href={safe} rel="noopener noreferrer" target="_blank" className="text-forest underline underline-offset-4">{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-charcoal">
      {blocks.map((b, bi) => {
        const t = b.trim();
        if (!t) return null;
        if (t.startsWith("### ")) return <h3 key={bi} className="pt-2 font-serif text-2xl text-obsidian">{inline(t.slice(4), `h${bi}`)}</h3>;
        if (t.startsWith("## ")) return <h2 key={bi} className="pt-4 font-serif text-3xl uppercase text-obsidian">{inline(t.slice(3), `h${bi}`)}</h2>;
        if (t.startsWith("> ")) return <blockquote key={bi} className="border-l-2 border-forest bg-forest/5 px-4 py-3 text-sm">{inline(t.replace(/^> ?/gm, ""), `q${bi}`)}</blockquote>;
        const lines = t.split("\n");
        if (lines.every((l) => /^[-*] /.test(l))) return <ul key={bi} className="list-disc space-y-1 pl-6">{lines.map((l, li) => <li key={li}>{inline(l.slice(2), `u${bi}${li}`)}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={bi} className="list-decimal space-y-1 pl-6">{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\d+\. /, ""), `o${bi}${li}`)}</li>)}</ol>;
        return <p key={bi}>{lines.flatMap((l, li) => (li ? [<br key={`br${li}`} />, ...inline(l, `p${bi}${li}`)] : inline(l, `p${bi}${li}`)))}</p>;
      })}
    </div>
  );
}
