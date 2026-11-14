/**
 * Granular permissions. Roles are stored in the database (Role.permissions)
 * and can be edited by a Super Admin; this file is the canonical list of
 * permission keys the server understands. Every admin server action and API
 * route checks one of these on the server.
 */
export const PERMISSIONS = {
  "analytics.read": "View dashboard metrics and reports",
  "catalog.read": "View products, categories and collections",
  "catalog.write": "Create and edit products, categories, collections",
  "catalog.publish": "Publish, schedule and archive products and collections",
  "inventory.read": "View stock levels and movement history",
  "inventory.write": "Adjust, restock and import inventory",
  "orders.read": "View orders, payments and shipping details",
  "orders.update": "Change order status and add notes",
  "orders.fulfill": "Create shipments and update fulfillment",
  "orders.cancel": "Cancel orders",
  "orders.refund": "Initiate and record refunds",
  "returns.read": "View return and exchange requests",
  "returns.manage": "Approve, reject and progress returns/exchanges",
  "returns.inspect": "Record inspection results and restock returns",
  "customers.read": "View the customer directory",
  "customers.pii": "View customer contact details and saved addresses",
  "customers.update": "Edit customer status and support notes",
  "discounts.manage": "Create and manage coupons",
  "content.manage": "Manage homepage, announcements, lookbook, pages",
  "reviews.moderate": "Moderate product reviews",
  "newsletter.export": "View and export newsletter subscribers",
  "settings.manage": "Manage store, payment, shipping, tax and legal settings",
  "staff.manage": "Manage staff accounts and roles",
  "audit.read": "View the audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SYSTEM_ROLES: Record<string, { name: string; description: string; permissions: Permission[] }> = {
  super_admin: { name: "Super Admin", description: "Full access including staff, roles and settings", permissions: ALL_PERMISSIONS },
  store_manager: {
    name: "Store Manager",
    description: "Runs day-to-day commerce operations",
    permissions: [
      "analytics.read", "catalog.read", "catalog.write", "catalog.publish", "inventory.read", "inventory.write",
      "orders.read", "orders.update", "orders.fulfill", "orders.cancel", "orders.refund", "returns.read", "returns.manage",
      "returns.inspect", "customers.read", "customers.pii", "customers.update", "discounts.manage", "content.manage",
      "reviews.moderate", "newsletter.export", "audit.read",
    ],
  },
  fulfillment_staff: {
    name: "Fulfillment Staff",
    description: "Packs, ships and inspects returns",
    permissions: ["orders.read", "orders.fulfill", "inventory.read", "inventory.write", "returns.read", "returns.inspect", "catalog.read"],
  },
  content_manager: {
    name: "Content Manager",
    description: "Manages storefront content and product copy",
    permissions: ["catalog.read", "catalog.write", "content.manage", "reviews.moderate"],
  },
  support_staff: {
    name: "Support Staff",
    description: "Customer support for orders and returns",
    permissions: ["orders.read", "orders.update", "orders.cancel", "customers.read", "customers.pii", "customers.update", "returns.read", "returns.manage", "reviews.moderate"],
  },
};

export function isPermission(p: string): p is Permission {
  return p in PERMISSIONS;
}
