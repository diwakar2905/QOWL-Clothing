/** Standard store policies. Always linked from the footer; content lives in Admin → Content → Pages. */
export const POLICIES = [
  { slug: "shipping-policy", title: "Shipping Policy", group: "help" },
  { slug: "returns-and-exchanges", title: "Returns & Exchanges", group: "help" },
  { slug: "privacy-policy", title: "Privacy Policy", group: "legal" },
  { slug: "terms-of-service", title: "Terms of Service", group: "legal" },
  { slug: "grievance-redressal", title: "Grievance Redressal", group: "legal" },
] as const;

export const policyTitle = (slug: string) => POLICIES.find((p) => p.slug === slug)?.title ?? null;
