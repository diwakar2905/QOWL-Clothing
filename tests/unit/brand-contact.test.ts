import { describe, it, expect } from "vitest";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { renderEmail } from "@/server/notifications/templates";

describe("official contact email", () => {
  it("is support@qowlstore.com", () => {
    expect(SUPPORT_EMAIL).toBe("support@qowlstore.com");
  });
  it("appears once in every transactional email (text and HTML)", () => {
    const { text, html } = renderEmail("Order {{orderNumber}}", "Hi {{name}},\n\nThanks for your order.", { name: "Priya", orderNumber: "QWL-1" });
    expect(text.endsWith("Questions? Write to support@qowlstore.com")).toBe(true);
    expect(html.match(/support@qowlstore\.com/g)?.length).toBe(2); // mailto href + visible text, in the footer only
    expect(html).toContain('href="mailto:support@qowlstore.com"');
    expect(html).not.toContain("Questions? Write to");
  });
});
