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

type Block =
  | { kind: "h2" | "h3"; text: string }
  | { kind: "ul" | "ol" | "quote" | "p"; lines: string[] };

/**
 * Line-based block parser: a heading always ends at its line break, and a list
 * or quote starts a new block even without a blank line before it (the way most
 * people write Markdown).
 */
function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let cur: Extract<Block, { lines: string[] }> | null = null;
  const kindOf = (l: string): "ul" | "ol" | "quote" | "p" => (/^[-*] /.test(l) ? "ul" : /^\d+\. /.test(l) ? "ol" : /^> ?/.test(l) ? "quote" : "p");
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const l = raw.trim();
    if (!l) { cur = null; continue; }
    if (l.startsWith("### ")) { blocks.push({ kind: "h3", text: l.slice(4) }); cur = null; continue; }
    if (l.startsWith("## ")) { blocks.push({ kind: "h2", text: l.slice(3) }); cur = null; continue; }
    const k = kindOf(l);
    if (!cur || cur.kind !== k) { cur = { kind: k, lines: [] }; blocks.push(cur); }
    cur.lines.push(l);
  }
  return blocks;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-charcoal">
      {parseBlocks(source).map((b, bi) => {
        switch (b.kind) {
          case "h3":
            return <h3 key={bi} className="pt-2 font-serif text-2xl text-obsidian">{inline(b.text, `h${bi}`)}</h3>;
          case "h2":
            return <h2 key={bi} className="pt-4 font-serif text-3xl uppercase text-obsidian">{inline(b.text, `h${bi}`)}</h2>;
          case "quote":
            return <blockquote key={bi} className="border-l-2 border-forest bg-forest/5 px-4 py-3 text-sm">{inline(b.lines.map((l) => l.replace(/^> ?/, "")).join(" "), `q${bi}`)}</blockquote>;
          case "ul":
            return <ul key={bi} className="list-disc space-y-1 pl-6">{b.lines.map((l, li) => <li key={li}>{inline(l.slice(2), `u${bi}${li}`)}</li>)}</ul>;
          case "ol":
            return <ol key={bi} className="list-decimal space-y-1 pl-6">{b.lines.map((l, li) => <li key={li}>{inline(l.replace(/^\d+\. /, ""), `o${bi}${li}`)}</li>)}</ol>;
          default:
            return <p key={bi}>{b.lines.flatMap((l, li) => (li ? [<br key={`br${li}`} />, ...inline(l, `p${bi}${li}`)] : inline(l, `p${bi}${li}`)))}</p>;
        }
      })}
    </div>
  );
}
