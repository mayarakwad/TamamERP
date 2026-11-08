// Roles and what each one may do. Every permission check on the server goes
// through `can()`, and Flow (stage 4) uses the same function, so the assistant
// can never see more than the person asking.

export const ORG_TYPES = ["business", "school", "home"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ROLES = [
  "owner",
  "admin",
  "accountant",
  "teacher",
  "parent",
  "employee",
  "member",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLES_BY_TYPE: Record<OrgType, Role[]> = {
  business: ["owner", "admin", "accountant", "employee"],
  school: ["owner", "admin", "accountant", "teacher", "parent", "employee"],
  home: ["owner", "admin", "member"],
};

export type Permission =
  | "workspace.manage" // branding, settings
  | "workspace.backup" // download / restore backups, duplicate
  | "members.manage"
  | "audit.view"
  | "flow.configure"
  | "claims.submit"
  | "claims.viewAll"
  | "claims.approve"
  | "budgets.manage"
  | "bills.manage"
  | "possessions.manage"
  | "finance.view" // sales, purchases, stock values, reports
  | "finance.manage" // create documents, record payments, journals
  | "inventory.manage" // receive goods, adjust and transfer stock
  | "leave.approve"
  | "hr.view"
  | "hr.manage"
  | "payroll.run"
  | "school.manage"
  | "school.teach"
  | "school.parent"
  | "transport.manage" // bus routes, stops and riders
  | "library.manage" // catalogue and loans
  | "exports.share";

const GRANTS: Record<Role, Permission[] | "*"> = {
  owner: "*",
  admin: [
    "workspace.manage",
    "members.manage",
    "audit.view",
    "flow.configure",
    "claims.submit",
    "claims.viewAll",
    "claims.approve",
    "budgets.manage",
    "bills.manage",
    "possessions.manage",
    "finance.view",
    "finance.manage",
    "inventory.manage",
    "leave.approve",
    "hr.view",
    "hr.manage",
    "school.manage",
    "transport.manage",
    "library.manage",
    "exports.share",
  ],
  accountant: [
    "claims.submit",
    "claims.viewAll",
    "finance.view",
    "finance.manage",
    "inventory.manage",
    "hr.view",
    "payroll.run",
    "exports.share",
  ],
  teacher: ["school.teach", "claims.submit"],
  parent: ["school.parent"],
  employee: ["claims.submit"],
  member: ["claims.submit", "possessions.manage"],
};

/** Permissions an owner or admin may grant to one person on top of their role. */
export const GRANTABLE: Permission[] = ["inventory.manage", "finance.view", "claims.approve", "leave.approve", "hr.view", "transport.manage", "library.manage"];

export function parseExtras(raw: string | null | undefined): Permission[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((p): p is Permission => (GRANTABLE as string[]).includes(p));
}

export function can(role: Role, permission: Permission, extras: readonly Permission[] = []): boolean {
  const grants = GRANTS[role];
  return grants === "*" || grants.includes(permission) || extras.includes(permission);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isOrgType(value: string): value is OrgType {
  return (ORG_TYPES as readonly string[]).includes(value);
}
