import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/ui/markdown";

const html = (src: string) => renderToStaticMarkup(<Markdown source={src} />);

describe("Markdown renderer", () => {
  it("ends a heading at its line break", () => {
    const out = html("## The oversized fit\nDropped shoulders and a relaxed body.");
    expect(out).toMatch(/<h2[^>]*>The oversized fit<\/h2>/);
    expect(out).toMatch(/<p>Dropped shoulders and a relaxed body.<\/p>/);
  });
  it("starts a list directly under a paragraph", () => {
    const out = html("Care tips:\n- **Wash** cold\n- Dry flat\n\n1. One\n2. Two");
    expect(out).toContain("<p>Care tips:</p>");
    expect(out).toMatch(/<ul[^>]*><li><strong>Wash<\/strong> cold<\/li><li>Dry flat<\/li><\/ul>/);
    expect(out).toMatch(/<ol[^>]*><li>One<\/li><li>Two<\/li><\/ol>/);
  });
  it("keeps multi-line paragraphs, quotes and safe links", () => {
    const out = html("Line one\nLine two\n> Quoted\n\nSee the [size guide](/size-guide) or [bad](javascript:alert(1)).");
    expect(out).toContain("<p>Line one<br/>Line two</p>");
    expect(out).toMatch(/<blockquote[^>]*>Quoted<\/blockquote>/);
    expect(out).toContain('href="/size-guide"');
    expect(out).not.toContain("javascript:");
  });
  it("renders raw HTML as text", () => {
    expect(html("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });
});
