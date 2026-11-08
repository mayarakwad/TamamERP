// Navigation registry: which pages exist for each kind of workspace, who can
// see them, and which build stage delivers them. The sidebar, the command
// palette and the "coming soon" pages all read from here.

import {
  BarChart3,
  BookOpen,
  Bus,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Contact,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HandCoins,
  History,
  LayoutDashboard,
  Megaphone,
  Package,
  Palette,
  PiggyBank,
  Receipt,
  ReceiptText,
  School,
  ShieldCheck,
  Sparkles,
  Truck,
  User,
  UserCog,
  UserRoundCheck,
  Users,
  Wallet,
  Warehouse,
  DatabaseBackup,
  Building,
  BadgeDollarSign,
  Banknote,
  BookText,
  Scale,
  Armchair,
  NotebookPen,
  CalendarClock,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "./i18n";
import { can, type OrgType, type Permission, type Role } from "./rbac";

export interface NavItem {
  id: string;
  /** Path under /w/[slug]; "" is the dashboard. */
  path: string;
  label: MessageKey;
  desc?: MessageKey;
  icon: LucideIcon;
  group: MessageKey;
  types: OrgType[];
  /** Visible if the role has ANY of these permissions (or always, when omitted). */
  perms?: Permission[];
  /** Only for these roles, even if others have the permission (e.g. a parent's own view). */
  roles?: Role[];
  /** Build stage that delivers the page. */
  stage: "1a" | "1b" | "2" | "3" | "4";
}

const ALL: OrgType[] = ["business", "school", "home"];

export const NAV: NavItem[] = [
  // ── Home ──
  { id: "home-dashboard", path: "", label: "nav.today", icon: LayoutDashboard, group: "nav.groupMain", types: ["home"], stage: "1a" },
  { id: "claims", path: "claims", label: "nav.claims", desc: "modules.claims", icon: Receipt, group: "nav.groupFamily", types: ["home"], stage: "1b" },
  { id: "budgets", path: "budgets", label: "nav.budgets", desc: "modules.budgets", icon: PiggyBank, group: "nav.groupFamily", types: ["home"], stage: "1b" },
  { id: "bills", path: "bills", label: "nav.bills", desc: "modules.bills", icon: CalendarDays, group: "nav.groupFamily", types: ["home"], stage: "1b" },
  { id: "things", path: "things", label: "nav.things", desc: "modules.things", icon: Armchair, group: "nav.groupFamily", types: ["home"], stage: "1b" },
  { id: "summary", path: "summary", label: "nav.summary", desc: "modules.summary", icon: NotebookPen, group: "nav.groupFamily", types: ["home"], perms: ["claims.viewAll"], stage: "1b" },

  // ── Business ──
  { id: "biz-dashboard", path: "", label: "nav.dashboard", icon: LayoutDashboard, group: "nav.groupMain", types: ["business"], stage: "1a" },
  { id: "customers", path: "sales/customers", label: "nav.customers", desc: "modules.customers", icon: Contact, group: "nav.groupSales", types: ["business"], perms: ["finance.view"], stage: "2" },
  { id: "quotations", path: "sales/quotations", label: "nav.quotations", desc: "modules.quotations", icon: FileText, group: "nav.groupSales", types: ["business"], perms: ["finance.view"], stage: "2" },
  { id: "invoices", path: "sales/invoices", label: "nav.invoices", desc: "modules.invoices", icon: ReceiptText, group: "nav.groupSales", types: ["business"], perms: ["finance.view"], stage: "2" },
  { id: "payments-in", path: "sales/payments", label: "nav.paymentsIn", desc: "modules.paymentsIn", icon: HandCoins, group: "nav.groupSales", types: ["business"], perms: ["finance.view"], stage: "2" },
  { id: "suppliers", path: "purchases/suppliers", label: "nav.suppliers", desc: "modules.suppliers", icon: Truck, group: "nav.groupPurchases", types: ["business"], perms: ["finance.view"], stage: "2" },
  { id: "purchase-orders", path: "purchases/orders", label: "nav.purchaseOrders", desc: "modules.purchaseOrders", icon: ClipboardList, group: "nav.groupPurchases", types: ["business"], perms: ["finance.view", "inventory.manage"], stage: "2" },
  { id: "purchase-bills", path: "purchases/bills", label: "nav.purchaseBills", desc: "modules.purchaseBills", icon: FileSpreadsheet, group: "nav.groupPurchases", types: ["business"], perms: ["finance.view"], stage: "2" },
  { id: "payments-out", path: "purchases/payments", label: "nav.paymentsOut", desc: "modules.paymentsOut", icon: Banknote, group: "nav.groupPurchases", types: ["business"], perms: ["finance.view"], stage: "2" },
  { id: "items", path: "inventory/items", label: "nav.items", desc: "modules.items", icon: Package, group: "nav.groupInventory", types: ["business"], perms: ["finance.view", "inventory.manage"], stage: "2" },
  { id: "stock", path: "inventory/stock", label: "nav.stock", desc: "modules.stock", icon: Warehouse, group: "nav.groupInventory", types: ["business"], perms: ["finance.view", "inventory.manage"], stage: "2" },
  { id: "expenses", path: "claims", label: "nav.expenses", desc: "modules.expenses", icon: Wallet, group: "nav.groupFinance", types: ["business", "school"], perms: ["claims.submit"], stage: "2" },
  { id: "reports", path: "reports", label: "nav.reports", desc: "modules.reports", icon: BarChart3, group: "nav.groupFinance", types: ["business", "school"], perms: ["finance.view"], stage: "2" },
  { id: "accounts", path: "finance/accounts", label: "nav.accounts", desc: "modules.accounts", icon: BookText, group: "nav.groupFinance", types: ["business", "school"], perms: ["finance.view"], stage: "2" },
  { id: "journals", path: "finance/journals", label: "nav.journals", desc: "modules.journals", icon: Scale, group: "nav.groupFinance", types: ["business", "school"], perms: ["finance.view"], stage: "2" },
  { id: "employees", path: "hr/employees", label: "nav.employees", desc: "modules.employees", icon: Users, group: "nav.groupPeople", types: ["business"], perms: ["hr.view"], stage: "2" },
  { id: "attendance", path: "hr/attendance", label: "nav.attendance", desc: "modules.attendance", icon: CalendarCheck, group: "nav.groupPeople", types: ["business"], stage: "2" },
  { id: "leave", path: "hr/leave", label: "nav.leave", desc: "modules.leave", icon: CalendarRange, group: "nav.groupPeople", types: ["business", "school"], perms: ["claims.submit", "hr.view"], stage: "2" },
  { id: "payroll", path: "hr/payroll", label: "nav.payroll", desc: "modules.payroll", icon: BadgeDollarSign, group: "nav.groupPeople", types: ["business", "school"], perms: ["payroll.run", "hr.manage"], stage: "2" },
  { id: "payslips", path: "hr/payslips", label: "nav.payslips", desc: "modules.payslips", icon: FileText, group: "nav.groupPeople", types: ["business", "school"], roles: ["employee", "accountant", "admin", "teacher"], stage: "2" },

  // ── School ──
  { id: "school-dashboard", path: "", label: "nav.dashboard", icon: LayoutDashboard, group: "nav.groupMain", types: ["school"], stage: "1a" },
  { id: "campuses", path: "campuses", label: "nav.campuses", desc: "modules.campuses", icon: Building, group: "nav.groupMain", types: ["school"], perms: ["school.manage"], stage: "3" },
  { id: "my-children", path: "children", label: "nav.myChildren", desc: "modules.myChildren", icon: UserRoundCheck, group: "nav.groupMain", types: ["school"], roles: ["parent"], stage: "3" },
  { id: "announcements", path: "announcements", label: "nav.announcements", desc: "modules.announcements", icon: Megaphone, group: "nav.groupMain", types: ["school"], stage: "3" },
  { id: "admissions", path: "admissions", label: "nav.admissions", desc: "modules.admissions", icon: ClipboardList, group: "nav.groupAcademics", types: ["school"], perms: ["school.manage"], stage: "3" },
  { id: "students", path: "students", label: "nav.students", desc: "modules.students", icon: GraduationCap, group: "nav.groupAcademics", types: ["school"], perms: ["school.manage", "school.teach", "finance.view"], stage: "3" },
  { id: "guardians", path: "guardians", label: "nav.guardians", desc: "modules.guardians", icon: Contact, group: "nav.groupAcademics", types: ["school"], perms: ["school.manage", "finance.view"], stage: "3" },
  { id: "classes", path: "classes", label: "nav.classes", desc: "modules.classes", icon: School, group: "nav.groupAcademics", types: ["school"], perms: ["school.manage", "school.teach"], stage: "3" },
  { id: "student-attendance", path: "attendance", label: "nav.studentAttendance", desc: "modules.studentAttendance", icon: CalendarCheck, group: "nav.groupAcademics", types: ["school"], perms: ["school.manage", "school.teach"], stage: "3" },
  { id: "exams", path: "exams", label: "nav.exams", desc: "modules.exams", icon: FileSpreadsheet, group: "nav.groupAcademics", types: ["school"], perms: ["school.manage", "school.teach"], stage: "3" },
  { id: "transport", path: "transport", label: "nav.transport", desc: "modules.transport", icon: Bus, group: "nav.groupCampus", types: ["school"], perms: ["school.manage", "transport.manage"], stage: "3" },
  { id: "library", path: "library", label: "nav.library", desc: "modules.library", icon: BookOpen, group: "nav.groupCampus", types: ["school"], perms: ["school.manage", "school.teach", "library.manage"], stage: "3" },
  { id: "fees", path: "fees", label: "nav.fees", desc: "modules.fees", icon: Receipt, group: "nav.groupFinance", types: ["school"], perms: ["finance.view", "school.manage"], stage: "3" },
  { id: "staff", path: "hr/employees", label: "nav.staff", desc: "modules.staff", icon: Users, group: "nav.groupPeople", types: ["school"], perms: ["hr.view"], stage: "3" },
  { id: "staff-attendance", path: "hr/attendance", label: "nav.staffAttendance", desc: "modules.staffAttendance", icon: CalendarClock, group: "nav.groupPeople", types: ["school"], perms: ["hr.view", "school.teach", "claims.submit"], stage: "3" },

  // ── Settings (every workspace) ──
  { id: "appearance", path: "settings/appearance", label: "nav.appearance", icon: Palette, group: "nav.groupSettings", types: ALL, stage: "1a" },
  { id: "profile", path: "settings/profile", label: "nav.profile", icon: User, group: "nav.groupSettings", types: ALL, stage: "1a" },
  { id: "workspace", path: "settings/workspace", label: "nav.workspace", desc: "modules.workspace", icon: UserCog, group: "nav.groupSettings", types: ALL, perms: ["workspace.manage"], stage: "1b" },
  { id: "members", path: "settings/members", label: "nav.members", desc: "modules.members", icon: ShieldCheck, group: "nav.groupSettings", types: ALL, perms: ["members.manage"], stage: "1b" },
  { id: "activity", path: "settings/activity", label: "nav.activity", desc: "modules.activity", icon: History, group: "nav.groupSettings", types: ALL, perms: ["audit.view"], stage: "1b" },
  { id: "data", path: "settings/data", label: "nav.data", desc: "modules.data", icon: DatabaseBackup, group: "nav.groupSettings", types: ALL, perms: ["workspace.backup"], stage: "1b" },
  { id: "school-setup", path: "settings/school", label: "nav.schoolSetup", desc: "modules.schoolSetup", icon: SlidersHorizontal, group: "nav.groupSettings", types: ["school"], perms: ["school.manage"], stage: "3" },
  { id: "flow", path: "settings/flow", label: "nav.flow", desc: "modules.flow", icon: Sparkles, group: "nav.groupSettings", types: ALL, perms: ["flow.configure"], stage: "4" },
];

/** Pages already built (everything else shows a "coming in stage N" page). */
export const READY = new Set([
  "home-dashboard", "biz-dashboard", "school-dashboard", "appearance", "profile", "claims", "budgets", "bills", "things", "summary", "workspace", "members", "activity", "data",
  "customers", "quotations", "invoices", "payments-in", "suppliers", "purchase-orders", "purchase-bills", "payments-out", "items", "stock", "expenses", "reports", "accounts", "journals", "employees", "attendance", "leave", "payroll", "payslips",
  "students", "guardians", "staff", "staff-attendance", "school-setup", "admissions", "classes", "student-attendance", "exams", "fees", "transport", "library", "announcements", "my-children", "campuses", "flow",
]);

const GROUP_ORDER: MessageKey[] = [
  "nav.groupMain",
  "nav.groupFamily",
  "nav.groupSales",
  "nav.groupPurchases",
  "nav.groupInventory",
  "nav.groupAcademics",
  "nav.groupCampus",
  "nav.groupFinance",
  "nav.groupPeople",
  "nav.groupSettings",
];

/** Pages this role can open in this kind of workspace, in sidebar order. */
export function navFor(type: OrgType, role: Role, extras: readonly Permission[] = []): NavItem[] {
  return NAV.filter(
    (n) =>
      n.types.includes(type) &&
      (!n.roles || n.roles.includes(role)) &&
      (!n.perms || n.perms.some((p) => can(role, p, extras))),
  ).sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

export function findNav(type: OrgType, path: string): NavItem | undefined {
  return NAV.find((n) => n.types.includes(type) && n.path === path);
}
