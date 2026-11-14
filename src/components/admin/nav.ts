import type { Permission } from "@/server/auth/permissions";

export const ADMIN_NAV: { href: string; label: string; perm: Permission; group: string }[] = [
  { href: "/admin", label: "Overview", perm: "analytics.read", group: "Store" },
  { href: "/admin/orders", label: "Orders", perm: "orders.read", group: "Store" },
  { href: "/admin/returns", label: "Returns & exchanges", perm: "returns.read", group: "Store" },
  { href: "/admin/customers", label: "Customers", perm: "customers.read", group: "Store" },
  { href: "/admin/products", label: "Products", perm: "catalog.read", group: "Catalogue" },
  { href: "/admin/inventory", label: "Inventory", perm: "inventory.read", group: "Catalogue" },
  { href: "/admin/collections", label: "Collections", perm: "catalog.read", group: "Catalogue" },
  { href: "/admin/categories", label: "Categories", perm: "catalog.read", group: "Catalogue" },
  { href: "/admin/discounts", label: "Discounts", perm: "discounts.manage", group: "Marketing" },
  { href: "/admin/content", label: "Homepage & content", perm: "content.manage", group: "Marketing" },
  { href: "/admin/reviews", label: "Reviews", perm: "reviews.moderate", group: "Marketing" },
  { href: "/admin/newsletter", label: "Newsletter", perm: "newsletter.export", group: "Marketing" },
  { href: "/admin/settings", label: "Settings", perm: "settings.manage", group: "System" },
  { href: "/admin/staff", label: "Staff & roles", perm: "staff.manage", group: "System" },
  { href: "/admin/audit", label: "Audit log", perm: "audit.read", group: "System" },
];
