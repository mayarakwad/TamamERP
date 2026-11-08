import type { OrgType, Permission } from "../../rbac";

// The tables Flow can read, described for the model. Each one is the same
// dataset that powers the page and its downloads, so Flow sees exactly what
// the person would see on screen (permissions and campus scope included).

export interface TableInfo {
  id: string;
  types: OrgType[];
  /** Shown to the model */
  about: string;
  /** Filter name → description */
  params?: Record<string, string>;
  /** Extra permission gate on top of the dataset's own */
  perms?: Permission[];
}

const DATE_RANGE = { from: "start date YYYY-MM-DD", to: "end date YYYY-MM-DD (inclusive)" };

export const TABLES: TableInfo[] = [
  { id: "claims", types: ["home", "business", "school"], about: "Expense claims (number, date, merchant, category, person, amount, status). People without approval rights only see their own.", params: { month: "YYYY-MM", status: "submitted | approved | reimbursed | rejected", category: "category key, e.g. groceries", q: "text in merchant, number or note" } },
  { id: "budgets", types: ["home"], about: "Monthly budget per category with spent and remaining.", params: { month: "YYYY-MM (default this month)" } },
  { id: "bills", types: ["home"], about: "Recurring household bills (Kahramaa, Ooredoo, rent...) with amount, frequency and next due date." },
  { id: "possessions", types: ["home"], about: "Things the family owns, with price, store and warranty date.", params: { room: "room name", type: "Electronics | Appliances | Furniture | Vehicle | Jewellery | Other", warranty: "active | soon | expired" } },
  { id: "summary", types: ["home"], about: "Monthly summary: where the money went by category, compared with budget.", params: { month: "YYYY-MM" } },
  { id: "customers", types: ["business"], about: "Customers with balance owed, overdue amount and credit limit.", params: { q: "name, phone or CR number" } },
  { id: "suppliers", types: ["business"], about: "Suppliers with what we owe them.", params: { q: "name" } },
  { id: "quotations", types: ["business"], about: "Sales quotations.", params: { status: "open | draft | sent | accepted | declined | converted", q: "number or customer", ...DATE_RANGE } },
  { id: "invoices", types: ["business"], about: "Sales invoices with total, paid and balance.", params: { status: "open | overdue | draft | issued | partial | paid | void", q: "number or customer", ...DATE_RANGE } },
  { id: "purchase-orders", types: ["business"], about: "Purchase orders to suppliers.", params: { status: "open | draft | sent | partial | received | billed", q: "number or supplier", ...DATE_RANGE } },
  { id: "supplier-bills", types: ["business"], about: "Bills from suppliers with balance due.", params: { status: "open | overdue | posted | partial | paid | void", q: "number or supplier", ...DATE_RANGE } },
  { id: "payments-in", types: ["business"], about: "Payments received from customers.", params: { q: "number or customer", ...DATE_RANGE } },
  { id: "payments-out", types: ["business"], about: "Payments made to suppliers.", params: { q: "number or supplier", ...DATE_RANGE } },
  { id: "items", types: ["business"], about: "Products and services with SKU, prices, cost, stock and reorder level.", params: { q: "name or SKU", low: "1 = only low or out of stock", kind: "product | service" } },
  { id: "stock", types: ["business"], about: "Stock per warehouse/branch with value." , params: { q: "name or SKU" } },
  { id: "stock-moves", types: ["business"], about: "Every stock movement in and out.", params: { q: "item name or SKU" } },
  { id: "employees", types: ["business", "school"], about: "Employees/staff with job, department, salary and document expiry dates.", params: { q: "name, number or job", view: "expiring (QID/passport expiring within 60 days) | left", department: "department name" } },
  { id: "attendance", types: ["business", "school"], about: "Staff attendance for a month: days present, late, absent, leave and overtime per employee.", params: { month: "YYYY-MM" } },
  { id: "leave", types: ["business", "school"], about: "Leave requests (type, dates, working days, status). Without HR rights, only the person's own.", params: { status: "submitted (waiting) | approved | rejected | cancelled", type: "annual | sick | unpaid | emergency | maternity | hajj" } },
  { id: "accounts", types: ["business", "school"], about: "Chart of accounts with live balances." },
  { id: "journals", types: ["business", "school"], about: "Journal entries.", params: { q: "number or memo", ...DATE_RANGE } },
  { id: "pl", types: ["business", "school"], about: "Profit and loss report for a period, compared with the period before.", params: DATE_RANGE },
  { id: "bs", types: ["business", "school"], about: "Balance sheet as at the end date.", params: { to: "as-at date YYYY-MM-DD" } },
  { id: "cf", types: ["business", "school"], about: "Cash flow (direct method) for a period.", params: DATE_RANGE },
  { id: "tb", types: ["business", "school"], about: "Trial balance.", params: DATE_RANGE },
  { id: "ar-aging", types: ["business", "school"], about: "Receivables aging: who owes us, by how overdue.", params: { to: "as-at date YYYY-MM-DD" } },
  { id: "ap-aging", types: ["business"], about: "Payables aging: what we owe suppliers, by how overdue.", params: { to: "as-at date YYYY-MM-DD" } },
  { id: "sales-by-customer", types: ["business"], about: "Sales by customer for a period.", params: DATE_RANGE },
  { id: "sales-by-item", types: ["business"], about: "Sales by item with margin for a period.", params: DATE_RANGE },
  { id: "stock-valuation", types: ["business"], about: "Stock valuation by item." },
  { id: "students", types: ["school"], about: "Students (admission number, class, campus, guardians, bus). Teachers see only their classes.", params: { q: "name or admission number", grade: "grade level number, e.g. 5 (KG1 = -1, KG2 = 0)", section: "class id", view: "new | upcoming | left" } },
  { id: "guardians", types: ["school"], about: "Parents and guardians with their children and app access.", params: { q: "name or phone", view: "noaccess (no parent app login yet)" } },
  { id: "applications", types: ["school"], about: "Admission applications this year.", params: { stage: "applied | assessment | offered | enrolled | declined | withdrawn" } },
  { id: "timetable", types: ["school"], about: "A class's weekly timetable.", params: { section: "class id (required)" } },
  { id: "fee-invoices", types: ["school"], about: "School fee invoices per student with balance.", params: { status: "issued | partial | paid | overdue | void", grade: "grade level number", installment: "e.g. 2026-27/2", q: "number, student or family" } },
  { id: "fee-payments", types: ["school"], about: "Fee payments received.", params: { q: "number or family" } },
  { id: "bus-riders", types: ["school"], about: "Bus riders with stop and pick-up time.", params: { route: "route id" } },
  { id: "books", types: ["school"], about: "Library books with copies available.", params: { q: "title, author or ISBN", language: "en | ar" } },
  { id: "loans", types: ["school"], about: "Library loans.", params: { view: "overdue" } },
  { id: "activity", types: ["home", "business", "school"], about: "Activity log: who changed what and when.", params: { month: "YYYY-MM", type: "security" } },
];
