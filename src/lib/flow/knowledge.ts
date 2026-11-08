import type { OrgType } from "../rbac";

// What Flow knows about how Tamam works, for "how do I...?" questions. Kept
// short: the page list in the system prompt says where things are, this says
// how they behave. Written in English; Flow answers in the person's language.

const COMMON = `
- Search (Ctrl/⌘ K) finds records across the workspace. Every table downloads as Excel, CSV, Word or PDF, prints with the logo and page numbers, copies to the clipboard, and can be shared as a view-only link that can expire.
- Records with a comment thread: claims, documents, customers, employees, students, applications. People in the thread get notified.
- Settings → Appearance: light/dark, themes, accent colour, wallpaper, font size, layout density, language. Each person's choices follow them to any device.
- Settings → Members (owners/admins): invite people with a role; roles decide what each person sees. One person can be given one extra permission on top of their role.
- Settings → Data (owners): full backup to a .tamam file (optionally password-protected), restore, and duplicate the workspace as a sandbox or a fresh start.
- Settings → Activity: who changed what and when.
- Settings → Flow (owners/admins): the AI key, provider and model, usage, the monthly spending limit, who can use Flow.
- Dates show the Hijri (Umm al-Qura) date next to the Gregorian one. Money is in Qatari riyals (QAR).`;

const HOME = `
- Claims: a family member adds a claim with amount, shop, category, date, how it was paid and a receipt photo. Whoever runs the household (owner/admin) approves or declines it (declining needs a reason), then marks it reimbursed. An approver's own claims are approved automatically unless they tick "ask for approval anyway".
- Budgets: a monthly amount per category; approved and reimbursed claims plus paid bills count against it. Budgets can be copied from last month.
- Bills: recurring bills (Kahramaa, Ooredoo, rent, the helper's salary, school fees) with a reminder some days before each is due. Mark each one paid (with the actual amount if it varies) or skip it.
- Things we own: items with photos, price, store, serial number and warranty date; warranties ending soon are flagged.
- Monthly summary: where the money went by category, compared with the budget and last month.`;

const BUSINESS = `
- Sales: quotation → (convert) invoice → payment. Issuing an invoice takes stock out and posts the sale, cost of sales and receivable. Payments are applied to the oldest open invoices unless chosen otherwise; extra is kept as credit. Voiding a payment reopens what it paid.
- Purchases: purchase order → receive goods (fully or partly, into a warehouse) → create bill → pay. Bills without an order can be booked straight to an expense account.
- Inventory: items (products and services) with SKU, prices, moving-average cost and reorder level. Stock per warehouse (a business's branches), stock counts that book the difference, and transfers. Low-stock alerts go to everyone who manages stock.
- Employees: QID, passport and visa with expiry reminders 30 days ahead; pay split into basic and allowances; IBAN checked; end-of-service gratuity estimate (three weeks' basic per year, Labour Law art. 54); annual leave 21 days, 28 after five years.
- Attendance: self check-in/out for staff with a login (late after 08:10, overtime after nine hours); HR corrects the month grid.
- Leave: requests in working days; an approver approves or declines with a reason.
- Payroll: build the month's payslips from salaries, absences, unpaid leave and overtime (125% of the basic hourly rate); adjust bonuses and deductions; an owner/admin approves; mark paid. The WPS salary file (SIF CSV for Qatar's Wage Protection System) is downloaded from the run, with a check listing anything the bank would reject.
- Accounting: a double-entry ledger behind everything; chart of accounts, journal entries (manual ones can be reversed), account ledgers, and reports: profit & loss, balance sheet, cash flow, trial balance, receivables and payables aging, sales by customer, sales by item, stock valuation.`;

const SCHOOL = `
- Several campuses in one account: the campus switcher in the top bar filters every page; a person tied to one campus only ever sees that campus. Campuses page compares them side by side.
- Admissions: applications (from the office or the public online form) move Applied → Assessment → Offered → Enrolled, or Declined/Withdrawn. Enrolling creates the student, links the guardians, places the child in a class and bills the registration fee.
- Students and guardians: one guardian can have several children (sibling discount). "Invite to the parent app" sends a login; the parent then sees only their own children.
- Classes and timetables: each class has a homeroom teacher, room, capacity and a teacher per subject. The timetable grid refuses to put a teacher in two classes at once; "Fill automatically" completes the week.
- Attendance: the roll for each class each day (everyone starts present; tap to mark absent, late, excused). Parents of absent children are notified. Classes without a roll by the morning cut-off show on the dashboard.
- Exams: assessments per class and subject with maximum score and weight; the gradebook takes typed or pasted marks ("a" or «غ» = absent). Term percentages are weighted; a missed assessment is left out unless the school counts it as zero.
- Report cards: subject percentages and letters, attendance, homeroom and principal comments; publishing freezes them and notifies parents; they print as bilingual A4 pages.
- Fees: a fee structure per grade (tuition, books, registration; transport per route), split into installments (by default 40/30/30). Sibling discounts (5% second child, 10% third, 15% after) or a staff discount/scholarship, whichever is larger. Billing an installment issues one invoice per child to the guardian. Payments are applied to the family's oldest open invoices. Overdue families can be reminded in one go.
- Transport: bus routes with driver, supervisor, capacity, stops and pick-up times, and riders. Library: books, loans with due dates, overdue reminders. Announcements: for everyone, staff or parents; whole school, a campus or a grade.
- New school year (Settings → School): moves every child up a grade keeping classmates together, graduates leavers, creates the new year and can copy timetables and raise fees.
- Staff, staff attendance, leave and payroll work as in the business modules.`;

export function appKnowledge(type: OrgType): string {
  const own = type === "home" ? HOME : type === "business" ? BUSINESS : SCHOOL;
  return `${own.trim()}\n${COMMON.trim()}`;
}
