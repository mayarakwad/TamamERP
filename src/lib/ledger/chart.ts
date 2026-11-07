// The starting chart of accounts and how automatic postings find their
// accounts. No server-only imports: the seed script uses this too.
//
// Code ranges decide where an account appears in reports:
//   1 assets · 2 liabilities · 3 equity · 4 income · 5 cost of sales · 6–9 expenses

import type { Prisma, PrismaClient } from "../../generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type AccountRole =
  | "cash"
  | "bank"
  | "receivable"
  | "inventory"
  | "advances"
  | "payable"
  | "grni"
  | "salariesPayable"
  | "gratuity"
  | "reimbursements"
  | "capital"
  | "retained"
  | "sales"
  | "services"
  | "otherIncome"
  | "cogs"
  | "stockAdjust"
  | "salaries"
  | "allowances"
  | "otherExpense";

interface ChartRow {
  code: string;
  name: string;
  nameAr: string;
  type: AccountType;
  role?: AccountRole;
}

export const DEFAULT_CHART: ChartRow[] = [
  { code: "1100", name: "Cash on hand", nameAr: "النقد في الصندوق", type: "asset", role: "cash" },
  { code: "1110", name: "Bank current account", nameAr: "الحساب الجاري لدى البنك", type: "asset", role: "bank" },
  { code: "1200", name: "Accounts receivable", nameAr: "ذمم العملاء المدينة", type: "asset", role: "receivable" },
  { code: "1300", name: "Inventory", nameAr: "المخزون", type: "asset", role: "inventory" },
  { code: "1350", name: "Employee advances", nameAr: "سلف الموظفين", type: "asset", role: "advances" },
  { code: "1400", name: "Prepaid expenses", nameAr: "مصروفات مدفوعة مقدماً", type: "asset" },
  { code: "1500", name: "Furniture & equipment", nameAr: "الأثاث والمعدات", type: "asset" },
  { code: "1510", name: "Vehicles", nameAr: "المركبات", type: "asset" },
  { code: "1590", name: "Accumulated depreciation", nameAr: "مجمع الإهلاك", type: "asset" },
  { code: "2100", name: "Accounts payable", nameAr: "ذمم الموردين الدائنة", type: "liability", role: "payable" },
  { code: "2150", name: "Goods received, not yet billed", nameAr: "بضاعة مستلمة لم تصل فواتيرها", type: "liability", role: "grni" },
  { code: "2200", name: "Salaries payable", nameAr: "رواتب مستحقة الدفع", type: "liability", role: "salariesPayable" },
  { code: "2210", name: "End-of-service provision", nameAr: "مخصص مكافأة نهاية الخدمة", type: "liability", role: "gratuity" },
  { code: "2300", name: "Expense claims payable", nameAr: "مطالبات مصروفات مستحقة", type: "liability", role: "reimbursements" },
  { code: "2400", name: "Customer advances", nameAr: "دفعات مقدمة من العملاء", type: "liability" },
  { code: "2500", name: "Accrued expenses", nameAr: "مصروفات مستحقة", type: "liability" },
  { code: "3100", name: "Partners' capital", nameAr: "رأس مال الشركاء", type: "equity", role: "capital" },
  { code: "3200", name: "Retained earnings", nameAr: "الأرباح المحتجزة", type: "equity", role: "retained" },
  { code: "3300", name: "Partners' drawings", nameAr: "مسحوبات الشركاء", type: "equity" },
  { code: "4100", name: "Sales of goods", nameAr: "مبيعات البضائع", type: "income", role: "sales" },
  { code: "4200", name: "Service income", nameAr: "إيرادات الخدمات", type: "income", role: "services" },
  { code: "4300", name: "Other income", nameAr: "إيرادات أخرى", type: "income", role: "otherIncome" },
  { code: "5100", name: "Cost of goods sold", nameAr: "تكلفة البضاعة المباعة", type: "expense", role: "cogs" },
  { code: "5200", name: "Stock adjustments", nameAr: "تسويات المخزون", type: "expense", role: "stockAdjust" },
  { code: "6100", name: "Salaries & wages", nameAr: "الرواتب والأجور", type: "expense", role: "salaries" },
  { code: "6110", name: "Housing & transport allowances", nameAr: "بدلات السكن والمواصلات", type: "expense", role: "allowances" },
  { code: "6120", name: "End-of-service gratuity", nameAr: "مكافأة نهاية الخدمة", type: "expense" },
  { code: "6200", name: "Rent", nameAr: "الإيجار", type: "expense" },
  { code: "6300", name: "Electricity & water", nameAr: "الكهرباء والماء", type: "expense" },
  { code: "6310", name: "Telephone & internet", nameAr: "الهاتف والإنترنت", type: "expense" },
  { code: "6400", name: "Fuel & transport", nameAr: "الوقود والمواصلات", type: "expense" },
  { code: "6450", name: "Travel", nameAr: "السفر", type: "expense" },
  { code: "6500", name: "Marketing & advertising", nameAr: "التسويق والإعلان", type: "expense" },
  { code: "6600", name: "Office supplies", nameAr: "اللوازم المكتبية", type: "expense" },
  { code: "6650", name: "Meals & hospitality", nameAr: "الوجبات والضيافة", type: "expense" },
  { code: "6700", name: "Bank charges", nameAr: "الرسوم البنكية", type: "expense" },
  { code: "6800", name: "Government fees & visas", nameAr: "الرسوم الحكومية والتأشيرات", type: "expense" },
  { code: "6900", name: "Repairs & maintenance", nameAr: "الإصلاح والصيانة", type: "expense" },
  { code: "6950", name: "Other expenses", nameAr: "مصروفات أخرى", type: "expense", role: "otherExpense" },
];

/** Expense-claim categories for businesses and schools, with the account each books to. */
export const BUSINESS_CLAIM_CATEGORIES = [
  { key: "fuel", name: "Fuel & parking", nameAr: "الوقود والمواقف", icon: "fuel", color: "#5A6B7A", account: "6400" },
  { key: "travel", name: "Travel", nameAr: "السفر", icon: "plane", color: "#2F7DB8", account: "6450" },
  { key: "meals", name: "Client meals", nameAr: "وجبات العملاء", icon: "utensils", color: "#D9644A", account: "6650" },
  { key: "office", name: "Office supplies", nameAr: "لوازم مكتبية", icon: "paperclip", color: "#8E5CC9", account: "6600" },
  { key: "phone", name: "Phone & internet", nameAr: "الهاتف والإنترنت", icon: "smartphone", color: "#0B6E8A", account: "6310" },
  { key: "gov", name: "Government fees", nameAr: "رسوم حكومية", icon: "landmark", color: "#A86B00", account: "6800" },
  { key: "repairs", name: "Repairs", nameAr: "إصلاحات", icon: "wrench", color: "#B5541C", account: "6900" },
  { key: "other", name: "Other", nameAr: "أخرى", icon: "receipt", color: "#7A6E66", account: "6950" },
] as const;

/** Where an account sits in the reports, from its code. */
export function accountGroup(code: string, type: string): "asset" | "liability" | "equity" | "income" | "cogs" | "expense" {
  if (type === "expense" && code.startsWith("5")) return "cogs";
  return type as "asset" | "liability" | "equity" | "income" | "expense";
}

/** Debit-normal accounts grow with debits. */
export function isDebitNormal(type: string) {
  return type === "asset" || type === "expense";
}

/** Create the default chart if this workspace has no accounts yet. Safe to call repeatedly. */
export async function ensureChart(db: Db, orgId: string) {
  const count = await db.account.count({ where: { orgId } });
  if (count > 0) return;
  await db.account.createMany({
    data: DEFAULT_CHART.map((a) => ({ orgId, code: a.code, name: a.name, nameAr: a.nameAr, type: a.type, role: a.role ?? null, isSystem: !!a.role })),
  });
}

/** Defaults every business needs: accounts and expense-claim categories. */
export async function ensureBusinessDefaults(db: Db, orgId: string) {
  await ensureChart(db, orgId);
  if ((await db.expenseCategory.count({ where: { orgId } })) > 0) return;
  const accounts = await db.account.findMany({ where: { orgId }, select: { id: true, code: true } });
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  await db.expenseCategory.createMany({
    data: BUSINESS_CLAIM_CATEGORIES.map((c, i) => ({ orgId, key: c.key, name: c.name, nameAr: c.nameAr, icon: c.icon, color: c.color, sort: i, accountId: byCode.get(c.account) ?? null })),
  });
}

export async function accountIdsByRole(db: Db, orgId: string): Promise<Map<string, string>> {
  await ensureChart(db, orgId);
  const rows = await db.account.findMany({ where: { orgId, role: { not: null } }, select: { id: true, role: true } });
  return new Map(rows.map((r) => [r.role!, r.id]));
}
