# Tamam · تمام

**An ERP that feels alive.** Tamam is one app for three kinds of organizations: **businesses**, **schools** and **households**. You pick one when you sign up and the whole app shapes itself around that choice. It's built for Qatar, so it does full Arabic and English with a proper right-to-left layout, uses Qatari riyal by default, and shows Hijri (Umm al-Qura) dates next to Gregorian ones.

> "Tamam" is a working name. It lives in one place (`src/lib/i18n/en.ts` → `app.name`, plus the Arabic file), so renaming is a one-line change.

| | |
|---|---|
| ![Sign in](docs/screenshots/login.jpg) | ![Home dashboard](docs/screenshots/home-dashboard.jpg) |
| ![Arabic, dark mode](docs/screenshots/home-dashboard-ar-dark.jpg) | ![Appearance settings](docs/screenshots/appearance.jpg) |
| ![Claims](docs/screenshots/claims.jpg) | ![A claim with its receipt and comment thread](docs/screenshots/claim-detail.jpg) |
| ![Budgets in Arabic](docs/screenshots/budgets-ar.jpg) | ![Bills in Arabic](docs/screenshots/bills-ar.jpg) |
| ![Business dashboard](docs/screenshots/biz-dashboard.jpg) | ![Business dashboard in Arabic](docs/screenshots/biz-dashboard-ar.jpg) |
| ![An invoice](docs/screenshots/invoice.jpg) | ![An invoice in Arabic](docs/screenshots/invoice-ar.jpg) |
| ![Payroll with WPS check](docs/screenshots/payroll-run.jpg) | ![Profit and loss](docs/screenshots/profit-and-loss.jpg) |
| ![School dashboard](docs/screenshots/school-dashboard.jpg) | ![School dashboard in Arabic](docs/screenshots/school-dashboard-ar.jpg) |
| ![Three campuses side by side](docs/screenshots/campuses.jpg) | ![Admissions board](docs/screenshots/admissions.jpg) |
| ![Timetable builder](docs/screenshots/timetable.jpg) | ![Roll call](docs/screenshots/roll-call.jpg) |
| ![Gradebook](docs/screenshots/gradebook.jpg) | ![Report cards in Arabic](docs/screenshots/report-cards-ar.jpg) |
| ![A bilingual report card](docs/screenshots/report-card.jpg) | ![The parent view](docs/screenshots/parent-view.jpg) |
| ![School fees](docs/screenshots/school-fees.jpg) | ![Bus routes](docs/screenshots/transport.jpg) |
| ![Online application form](docs/screenshots/apply-form.jpg) | ![The parent view on a phone](docs/screenshots/mobile-parent.jpg) |

## Install

You need **Node.js 22 or newer**.

```bash
npm install
npm run setup      # prepares .env, folders and the database, then asks how you want to start
npm run dev        # http://localhost:3000
```

`npm run setup` is a short guided installer:

1. It checks your Node.js version.
2. It creates `.env` with a freshly generated `APP_SECRET`.
3. It creates the `data/` and `storage/` folders and brings the database up to date.
4. It asks how you'd like to start:
   - **Set up my organization in the browser** (recommended). It prints a link such as `http://localhost:3000/setup?key=K7QF-9XZ2-M4PD`.
   - **Explore the demo.** It fills the server with three living demo workspaces.

You can skip the question with `npm run setup -- --wizard` or `npm run setup:demo`.

### The setup wizard

On a fresh server, every page sends you to **/setup**. The wizard has six steps:

| Step | What happens |
|---|---|
| **Welcome** | Pick the language, unlock with the setup key, and see a system check: database, storage, encryption secret, Node.js, image processing, Hijri calendar support, HTTPS |
| **Platform** | Platform name (white-label: shown on sign-in and in the browser tab), time zone, currency, and whether anyone may sign up or only invited people |
| **Administrator** | Your account. You own the first workspace and manage the installation |
| **Workspace** | Business, school or home; names in English and Arabic; logo; brand colour; address; CR or licence number; campuses; financial year; weekend and first day of the week |
| **Starting data** | Start clean, or also install the demo workspaces (you're added as owner of each) |
| **Review** | Check everything, then install. Progress is shown step by step and ends with a small celebration |

How the wizard is protected:
- **Setup key.** Only someone who can see the server can install it, so the first stranger to find a new server can't claim the admin account. The key is printed in the terminal when the server starts and saved in `data/setup-key.txt`.
- **All or nothing.** Installation runs in one database transaction, so a failure leaves the server uninstalled, never half-installed.
- **Locked afterwards.** Once installed, the wizard locks itself and the key file is deleted.

To try the wizard again on a test machine, run `npm run reset:fresh`. It deletes everything after asking you to type `reset`.

| | |
|---|---|
| ![Setup wizard in Arabic](docs/screenshots/setup-welcome-ar.jpg) | ![Workspace step](docs/screenshots/setup-workspace.jpg) |

### The demo

After `npm run setup:demo`, open <http://localhost:3000> and click any account under **Explore the demo**. Every demo account uses the password `demo1234`.

| Person | Workspace | Role | What to look at |
|---|---|---|---|
| Hessa Al-Mansouri | Al-Mansouri Home + Al Manara | Owner / Parent | The Home dashboard: 5 claims waiting (approve one), a busy grocery week, dining over budget, bills due this week, a TV warranty ending soon. Every page under **Settings**. At Al Manara she's a **parent**: Ahmed (7-A) and Mariam (3-B), their attendance, marks, fees and report cards, and nothing else. |
| Maria Santos | Al-Mansouri Home | Family member | The family-member view: new claim from a phone, her own claims and their comment threads, no admin pages. Search only finds her own claims. |
| Khalid Al-Mansouri | Sadeem (business) + Home | Owner / Admin | One login, two workspaces. At Sadeem: the business dashboard, a year of sales, purchases and payroll, every report. |
| Priya Nair | Sadeem | Accountant | Invoices, payments, supplier bills, journals and reports. She prepares payroll; an admin approves it. |
| Omar Haddad | Sadeem | Admin | Approves leave, expense claims and payroll. Sign in with `omar@tamam.demo`. |
| Joseph Mathew | Sadeem | Employee + stock access | The storekeeper: checks in from his phone, receives deliveries, counts stock, sees no sales or prices. Sign in with `joseph@tamam.demo`. |
| Dr. Fatima Al-Sulaiti | Al Manara International School | Owner (group director) | Three campuses (Al Waab, Lusail, Al Wakra) and 735 students. The morning briefing (5-B's roll not taken, Bus 4 full, overdue fees, new applications), **Campuses** side by side, the campus switcher in the top bar, admissions, timetables, fees, and **Settings → School → New school year**. |
| Sarah Mitchell | Al Manara | Admin, Lusail only | A principal tied to one campus: every list, count, export and search shows Lusail only. Sign in with `sarah@tamam.demo`. |
| Rami Khoury | Al Manara | Accountant | Fees: the term 2 run, overdue families, recording a payment (watch for the celebration), reminders, the fee structure, and the school's books. Sign in with `rami@tamam.demo`. |
| Aisha Rahman | Al Manara | Teacher | Grade 5-B's homeroom teacher and the science teacher for Grade 5. Her dashboard shows her day; take 5-B's roll, finish the science mid-term marks (type or paste from Excel), and write report card comments. She only sees her own classes. |
| Khalid Al-Mansouri | Al Manara | Parent | The same family seen by the other parent. |
| Yousef Al-Emadi | Al Manara | Employee + transport access | The transport coordinator: bus routes, stops and riders, without the rest of the office. Sign in with `yousef@tamam.demo`. |

`npm run db:seed` resets the demo at any time, with dates relative to today so it always looks current.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` then `npm start` | Production build and server |
| `npm run setup` | Guided installer (env, secret, folders, database, then wizard or demo) |
| `npm run setup:demo` | Same, straight to the demo data |
| `npm run reset:fresh` | Wipe everything and return to the setup wizard (asks first) |
| `npm run db:seed` | Reset the demo data |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| `npm test` | Unit tests: formatting, money, permissions, preferences, setup key, CSV and filename safety, document maths, amounts in words (English and Arabic), IBANs, payroll and the WPS file |
| `npm run test:e2e` | Browser tests: setup wizard, sign-in, roles, Arabic, signup, lockout, claims, exports, share links, search, notifications, invitations, backups; and for businesses: invoicing and payments, quote to invoice, receiving and billing, storekeeper access, payroll and WPS, leave, balanced statements, backup of a business. On a new machine, run `npx playwright install chromium` first |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

### Configuration (`.env`)

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `file:./data/tamam.db` for SQLite. For Postgres, see below. |
| `APP_SECRET` | Long random string (`npm run setup` generates one). Used to encrypt organization AI keys (stage 4). |
| `STORAGE_DIR` | Where uploads (receipts, logos, wallpapers) and safety backups are kept. Default `./storage`. |
| `CHROMIUM_PATH` | Optional. The Chrome or Chromium used to make PDFs. If unset, the one from `npx playwright install chromium` is used. Without either, PDF downloads say so politely and everything else still works. |
| `SHOW_DEMO_LOGINS=0` | Hides the demo accounts on the sign-in page even when demo data is installed. They're already hidden on servers set up without the demo. |
| `INSECURE_COOKIES=1` | Only for testing a production build over plain HTTP on a LAN address. Never set it on the internet. |

## What's built

### Stage 1a · foundations


- **Installation:** a guided terminal installer and a six-step browser setup wizard, protected by a one-time key (see [Install](#install)).
- **Sign in, sign up, roles.** Signup is a three-step flow: pick Business, School or Home, name it, then create your account.
  - Passwords are hashed with Argon2id. Sessions are stored in the database, and the browser only holds a random token.
  - Five failed attempts in 15 minutes locks that email. Lockouts and other sensitive actions are written to the audit log.
- **Roles decide what you see.** Owner, admin, accountant, teacher, parent, employee and family member each see only their own pages. Every check runs on the server (`src/lib/rbac.ts`, `src/lib/auth/dal.ts`), so a hidden page is a 404 rather than an empty screen.
- **Arabic and English.**
  - Arabic is a true RTL layout. Charts run right-to-left too.
  - QAR formatting, plus a choice of Western (123) or Arabic-Indic (١٢٣) digits.
  - Hijri dates appear next to Gregorian ones, and all times use Doha time.
- **Theming.** Every choice is saved to your account, so it follows you to any device:
  - light, dark or system mode
  - six themes (Pearl, Corniche, Oasis, Dunes, Majlis, Lantern) plus any custom accent colour
  - dashboard wallpapers: a built-in gallery or your own photo, with dim and blur sliders
  - text size, comfortable or compact layout, and a motion setting
- **The shell.**
  - The sidebar adapts to the workspace type and your role.
  - A workspace switcher, and a ⌘K command palette for pages, workspaces and preferences.
  - The Flow panel (it explains what's coming in stage 4).
  - A mobile drawer.
- **A living Home dashboard.**
  - a morning briefing
  - numbers that count up, a sparkline and a trend chart that draw themselves in
  - budget bars that show pending claims, upcoming bills, warranties ending soon, and recent activity
  - drag-and-drop widgets you can hide and reorder; the layout is saved per person, per workspace
- **Motion.** Pages fade in, cards lift on hover, and loading shows skeletons instead of spinners. When the device asks for reduced motion, or you choose it, movement stops and only fades remain.
- **Pages from later stages** already appear in the menu. Each one explains what it will do instead of showing a dead end.

### Stage 1b · Home, plus the kit every workspace will share

![New claim on a phone](docs/screenshots/mobile-new-claim.jpg)

**For the household**
- **Claims.**
  - Snap the receipt with the phone camera or upload photos and PDFs. Several pages per claim are fine. Images are shrunk on the phone before upload and stored as WebP with small thumbnails.
  - Each claim gets a number (`CLM-2026-00215`). It moves from waiting to approved or declined (a reason is required) to reimbursed, and can be reopened.
  - Whoever runs the household approves. Their own claims are approved straight away unless they tick "ask for approval anyway". Nobody else can approve their own claim.
  - Every claim has a comment thread mixed with its history. Everyone in the thread is notified of new comments.
  - Approval ends with a small celebration (skipped when motion is reduced).
  - Filter by status, month, category and person. Search by shop, note or number.
  - **Print voucher** gives a one-page claim voucher with the receipt images and signature lines.
- **Budgets.** A monthly limit per category, with a standing default and per-month overrides. Bars show spent and waiting amounts, with a warning when a category goes over. Click an amount to change it; one click copies last month's budgets.
- **Bills.** Monthly, quarterly or yearly, fixed or estimated amounts, autopay flags. **Mark paid** (with the real amount for estimated bills) or **Skip** moves the bill to its next date. Paid bills count against their category's budget. A reminder goes out a few days before each bill is due (three by default, set per bill; checked hourly).
- **Things we own.** Possessions with room, brand, model, serial number, price, receipt and warranty date. Warranties ending within 90 days are flagged, and a reminder goes out 30 days before the end.
- **Monthly summary.** A few plain sentences about the month, then spending by category against budget, the change from last month, the biggest claims, who spent what, bills paid and a day-by-day chart. Prints well and exports like any other page.

**For every workspace**
- **Downloads.** Every table and report downloads as **Excel, CSV, Word or PDF**, in the language you're using.
  - Excel: real numbers and dates, QAR number format, totals as formulas, frozen header with filters, right-to-left sheets in Arabic.
  - Word: right-to-left tables in Arabic, a header row repeated on every page, landscape for wide tables.
  - Every file has the organization's logo, the title, the date and page numbers.
- **Print.** A clean print layout with logo, title, date and "Page X of Y", and no app buttons.
- **Copy** puts the table on the clipboard as both plain text and a formatted table, so it pastes properly into Excel, Word or an email.
- **Share links.** View-only links to a snapshot of the table. They expire after a day, a week, a month or never, can allow or block downloads, count views, and can be revoked at any time.
- **Search across everything.** ⌘K now finds records as well as pages: claims, bills, possessions and people. Arabic search ignores the differences between أ/إ/آ/ا, ة/ه, ى/ي, diacritics and Arabic-Indic digits. Results respect permissions: a family member only finds their own claims.
- **Notifications.** A bell with an unread count: claims to approve, decisions on your claims, comments, bills due, warranties ending.
- **Activity log.** Who did what and when, with filters, and an export. Sign-ins, exports, backups and role changes are marked as sensitive.
- **Workspace settings.** Names in both languages, logo (SVG is converted to PNG), brand colour, address, CR or licence number, financial year and weekend. The logo and colour appear on everything printed or downloaded.
- **Members and roles.** Invite by link (valid for 14 days; there's no email sending yet, so you copy the link). Change roles, remove people, revoke invitations. Admins can't change owners, and the last owner can't be removed.
- **Data and backups.**
  - **Back up** downloads one `.tamam` file with every record and uploaded file, optionally locked with a password (AES-256-GCM).
  - **Restore** either as a new workspace or over this one. Replacing asks you to type the workspace name, and saves a safety copy first.
  - **Duplicate** the workspace as a sandbox (everything, clearly marked "Sandbox") or a fresh start (setup only, no records), for example a new school year.

### Stage 2 · Business

**Sales and purchases**
- **Customers and suppliers** (one record can be both) with contacts, CR number, payment terms and a credit limit. Each has a page with what they owe or are owed, what's overdue, twelve months of sales or purchases as a chart, their documents, payments and a printable **statement** with a running balance.
- **Quotations → invoices → payments.** One editor for quotations, invoices, purchase orders and supplier bills: pick or add the customer inline, add items from a searchable list (stock shown as you type, with a warning when there isn't enough), discounts per line, totals and the amount in words as you go. A quotation converts to an invoice in one click. Issuing an invoice takes the stock out and posts the sale, cost of sales and receivable.
- **Purchase orders → receiving → supplier bills → payments.** Orders are received into a warehouse, partly or in full. "Create bill" makes a bill for exactly what arrived, at the ordered prices. Bills without an order can book straight to an expense account (rent, Kahramaa, Ooredoo).
- **Payments** received or made, applied to open documents (oldest first, or the one you opened it from), with any rest kept as credit. Voiding a payment reopens what it paid.
- **Printed documents**: invoices, quotations, orders and bills print and download as PDF with logo, CR number, both dates (Gregorian and Hijri), the amount in words in English or Arabic (e.g. «فقط ثمانية آلاف وثمانمئة وأربعة وثلاثون ريالاً قطرياً لا غير»), bank details and signature lines.

**Inventory**
- Items (products and services) with SKU, units, prices, moving-average cost and reorder levels. Stock per warehouse (a business's branches are its warehouses), every movement in and out, **stock counts** that book the difference, and **transfers** between warehouses.
- **Low-stock alerts** go to everyone who looks after stock, once per dip below the reorder level.

**People**
- **Employees** with QID, passport and visa numbers, expiry badges and reminders 30 days before a QID or passport expires; pay broken into basic and allowances; IBAN checked as you type (and the bank recognised from it); an end-of-service **gratuity estimate** (three weeks' basic pay per year, Labour Law art. 54) and annual leave balance (21 days, 28 after five years).
- **Attendance**: a month grid for HR (click a day to correct it), and a **check-in / check-out** button for anyone whose login is linked to their employee record. Late after 08:10; overtime counted after nine hours.
- **Leave**: requests (annual, sick, unpaid, emergency, maternity, Hajj) counted in working days, with balances, approval or decline with a reason, and approved leave marked on the attendance sheet.
- **Expense claims** for business staff use the same claim screens as households; approving books the expense to its account, reimbursing pays it from the bank.
- **Payroll**: one click builds the month's payslips from salaries, absences, unpaid leave and overtime (125% of the basic hourly rate). Adjust bonuses, advance repayments and other deductions; an owner or admin approves (salaries, allowances and deductions are booked), then it's marked paid. Employees see their payslips under **My payslips**.
- **WPS salary file**: the CSV the bank uploads to Qatar's Wage Protection System, built to the published file format (header, record layout, field types, `SIF_<EID>_<BANK>_<YYYYMMDD>_<HHMM>.csv`, deduction reason codes). Every run shows a check that lists anything the bank would reject (missing QID, a name with one part, a wrong IBAN, deductions without a reason code). Staff paid in cash are left out, with a note saying so.

**Accounting and reports**
- A **double-entry ledger** behind everything: invoices, payments, bills, receipts, stock counts, approved claims and payroll each post a balanced journal entry automatically, and nothing that doesn't balance can be saved. Starts with a chart of accounts suited to a Qatari trading company.
- **Chart of accounts** with live balances, **journal entries** (manual entries for opening balances, depreciation and corrections, which can be reversed), and an **account ledger** for any account.
- **Reports**: profit & loss (compared with the period before), balance sheet, cash flow (direct method: customers, suppliers, salaries, claims, other), trial balance, receivables and payables aging, sales by customer, sales by item with margin, and stock valuation. Each has period shortcuts (this month, last month, quarter, year to date, last year, custom), and downloads, prints and shares like every other table, with headings and totals kept bold in Excel, Word and PDF.
- **The business dashboard**: a morning briefing (overdue invoices, money in since yesterday, low stock, expiring documents, payroll not yet prepared), what's waiting for you, key numbers that count up, twelve months of sales and cash in/out, top customers, low stock and the people panel. An employee sees their own day instead: check-in, leave left, last payslip.

**Extra access on top of a role.** An owner or admin can give one person a single extra permission (stock, finance view, approving claims or leave, HR view) without changing their role. The demo storekeeper is an employee with stock access.

**How the exports were checked:** each format was downloaded and opened, not just generated. Excel files were read back cell by cell (direction, number types, formats, formulas). Excel and Word files were opened in LibreOffice and rendered to images to check Arabic letter shaping, right-to-left order and page numbers. PDFs and the print layout were checked the same way in Chromium.

### Stage 3 · School

**Admissions and records**
- **Admissions board**: applications move through Applied → Assessment → Offered → Enrolled (or Declined / Withdrawn), by dragging a card or with buttons. Each one has the child, the guardians, documents, notes and a comment thread. **Enrol** creates the student, links or creates the guardians, puts the child in a class and bills the registration fee.
- **Online application form** at `/apply/<school>`: a public, bilingual page families fill in from a phone. It gives a reference number (`APP-2026-00042`) and lands on the board. It is rate-limited and has a hidden honeypot field to stop spam bots. It can be closed in the school settings.
- **Students** with admission number, QID, nationality, date of birth, campus, class, guardians, bus stop, medical notes and discounts. Each student page shows attendance this term, results by subject compared with the class average, published report cards, fees and a staff-only notes thread. You can move a student to another class or campus, withdraw them or mark them graduated.
- **Guardians** (one record can be the parent of several children, which drives the sibling discount). **Invite to the parent app** sends a login. When they accept, their account is linked to their children automatically.
- **Staff** use the business HR module (employees, documents, attendance, leave and payroll). Teachers are employees with teaching assignments.

**Classes, timetables and attendance**
- **Classes** (5-A, KG1-B, 5-ب in Arabic) per campus with a homeroom teacher, a room, capacity, and a teacher for each subject.
- **Timetable builder**: a week grid. Click a period to place a subject; any choice that would put a teacher in two rooms at once is greyed out with the reason ("Mr Haddad is teaching 6-B"). **Fill automatically** completes the week: core subjects in the morning, at most two periods of a subject a day, and no teacher clashes across the whole school. It places all 1,720 periods in the demo. Timetables download as Excel.
- **Roll call** built for a phone: everyone starts present, one tap marks absent, two marks late, three marks excused. Save shows "Roll saved · 2 absent", and parents of absent children get a notification. The dashboard flags classes whose roll isn't taken by 08:30.

**Exams, gradebook and report cards**
- **Assessments** per class and subject (quizzes, homework, projects, mid-terms, finals) with a maximum score and a weight. **Schedule an exam** creates it for every class in a grade at once.
- **Gradebook**: a spreadsheet-like grid. Arrow keys and Enter move between cells. It accepts Arabic digits (١٨) and commas (17,5), "a" or «غ» for absent, and **paste a block straight from Excel**. Changes save on their own. Each column shows its average, median, min and max. Term percentages are weighted, and an assessment a child missed is left out rather than counted as zero (a school setting).
- **Report cards**: per-subject percentage and letter (A–F on a scale you set), attendance, a homeroom comment and a principal's comment. Comment suggestions match the result, in English and in Arabic with the right gender for the child. **Publish** freezes a copy and notifies parents. Each card prints as one bilingual A4 page (English and Arabic together), as do whole classes as one PDF.

**Fees**
- A **fee structure** per grade: tuition, books and registration, with transport per bus route. It splits into installments (40 / 30 / 30 by default, due 15 Aug, 1 Dec, 1 Mar) in whole riyals that add back up.
- **Discounts** applied automatically: sibling (5% for the second child, 10% third, 15% after), a staff discount (50%), or a scholarship. The child gets the larger one, not both.
- **Billing an installment** issues one invoice per child for a campus or the whole school, addressed to the guardian. Each invoice posts to the school's own income accounts (tuition, transport, books, registration) in the same double-entry ledger as stage 2.
- **Recording a payment** finds the family, shows every open invoice for all their children, and applies the amount oldest first. When a family's fees are paid in full there's a small celebration. Also: overdue lists with one-click reminders, voiding, printable fee invoices and family statements, and the receivables, P&L and other reports.

**Transport, library, announcements**
- **Bus routes** with driver, supervisor, capacity, stops in order with pick-up times, and riders. The dashboard warns when a bus is full ("Bus 4 is full · 26 of 26"). Rider lists download for the driver.
- **Library**: books with ISBN, copies and shelf location, loans to students or staff with a due date (14 days by default), overdue reminders and returns.
- **Announcements** for everyone, staff only or parents only, to the whole school, one campus or one grade, pinned or not.

**The parent view**
- A parent signs in and sees **only their own children**: whether they're at school today, the next lesson and the week's timetable, attendance and results this term, published report cards to print, fees due and overdue with a statement, the bus with pick-up and drop-off times, library books, and on the dashboard the announcements meant for them. Arabic or English, on a phone or a computer. Staff pages and other children aren't shown at all.

**Several campuses, one account**
- The **campus switcher** in the top bar filters every page, count and export to one campus, or shows them all. Someone tied to one campus (like the Lusail principal) is locked to it everywhere, including search and downloads.
- **Campuses side by side**: students and how full each campus is, present today, fees collected and overdue, term average, staff, classes, buses and applications, plus attendance by campus over the last four weeks.
- **The school dashboard**: a morning briefing (rolls not taken, a full bus, overdue fees, new applications, birthdays, expiring staff documents, marks or comments due), key numbers, attendance over the last weeks, students per grade and campus, and what's waiting for you. A teacher sees their day instead (today's periods, rolls to take, marks to enter); a parent sees their children.

**New school year**
- **Settings → School → New school year** previews and then runs the rollover: every child moves up a grade and keeps their classmates; if a class is full the rest go to the emptier one. Leavers graduate, and children whose campus stops at their grade move to one that continues. Applicants accepted for next year join their class. It creates the new year and terms, copies classes, teaching assignments and (if you choose) timetables, and can raise fees by a percentage. **Duplicate workspace** (stage 1a) is still there for a full sandbox copy.

**Data, search, backups.** Students, guardians, applications, timetables, fee invoices and payments, bus riders, books and loans all download as Excel, CSV, Word and PDF and can be shared like every other table. Search finds students (only those a teacher teaches), guardians, applications and books, in Arabic or English. Backups and restores include every school table, and a restored school's books still balance.

**How it was checked:** the end-to-end tests take a roll, type and paste marks, apply online and enrol the child, record a payment, open a parent's report card, check the Lusail lock, check the timetable refuses a clash, and restore a backup with its books balanced. The report card and class PDFs, the Arabic fee invoice PDF (with the amount in Arabic words), the Arabic student list in Excel and the fees list in Word were downloaded and opened.

## Roadmap

| Stage | Contents |
|---|---|
| ~~1a · Foundations~~ | Done |
| ~~1b · Home~~ | Done |
| ~~2 · Business~~ | Done |
| ~~3 · School~~ | Done |
| **4 · Flow** | The AI assistant, using each organization's own key (encrypted on the server), with provider and model choice, usage tracking and a spending limit. It reads freely and proposes changes you confirm with one click. |

## How it's put together

```
prisma/schema.prisma        Data model. Every business row has orgId; money is whole dirhams (Int)
prisma/seed.ts              Demo data entry point → src/lib/demo/*
src/proxy.ts                Optimistic sign-in gate (Next 16's renamed middleware)
src/instrumentation.ts      Server start: prints the setup link on a fresh install
src/app/setup/              The installation wizard
src/lib/system/             Installation state, setup key, system checks
scripts/                    Terminal installer (setup.ts) and reset-fresh.ts
src/lib/auth/               Password hashing, sessions, and the Data Access Layer (who you are, what workspace)
src/lib/rbac.ts             Roles → permissions. The single source of truth for access
src/lib/modules.ts          Navigation registry: pages per workspace type, role and build stage
src/lib/format.ts           QAR, numbers, Gregorian + Hijri dates, relative times (pure, same on server and client)
src/lib/i18n/               English + Arabic messages (TypeScript checks both have the same keys)
src/lib/prefs.ts            Personal preferences schema with safe fallbacks
src/app/themes.css          Theme colour tokens (light + dark for each theme)
src/app/(auth)/             Sign in and sign up
src/app/w/[slug]/           A workspace: layout (shell), dashboard, Home pages, settings, and "coming soon" pages
src/app/actions/            Server actions (claims, comments, home, members, workspace, share, ...)
src/app/api/w/[slug]/       File routes: export, attachments, logo, backup, restore, search, notifications
src/app/s/[token]/          Public view-only share pages
src/app/invite/[token]/     Accept an invitation (sign in or create an account)
src/lib/datasets/           One definition per table or report: the page, every download, copy and share use it
src/lib/export/             Excel, CSV, Word, PDF, print, claim vouchers, business documents, statements, payslips, report cards
src/lib/ledger/             Chart of accounts, balanced posting and reversals, financial statements
src/lib/docs/               Document maths and what happens when a document changes state (with its postings)
src/lib/inventory/          Stock movements, moving-average cost, low-stock alerts
src/lib/hr/, payroll/       Working days, leave balances, payslip maths, payroll runs, IBANs, the WPS file
src/lib/words.ts            Amounts in words, English and Arabic
src/app/w/[slug]/_biz/      Shared server pages for the business modules
src/lib/school/             School settings, grading, fee maths, timetable solver, campus scope, rollover, report cards
src/app/apply/[slug]/       The public online application form
src/lib/backup/             Backup file format, restore with id remapping, duplicate
src/lib/search/             Search index with Arabic normalization
src/lib/demo/               Demo workspaces (a year of trading for Sadeem, a three-campus school group), receipt photos and logos
src/components/             Shell, dashboard widgets, data table and toolbar, record threads, UI primitives
src/components/school/      Admissions board, timetable grid, roll call, gradebook, report cards, fees, parent view
tests/                      Vitest unit tests and Playwright end-to-end tests
```

**Stack:**
- Next.js 16 (App Router, server actions, Cache Components), React 19 and TypeScript
- Tailwind CSS 4 with direction-aware utilities, Radix UI primitives, Motion and Recharts
- Prisma 7 on SQLite (better-sqlite3 driver)
- Argon2id password hashing and Zod validation

### Moving to Postgres later

The schema avoids anything SQLite-specific: no enums, no floats, and money stored as integers. To switch:

1. In `prisma/schema.prisma`, set `provider = "postgresql"`.
2. Run `npm install @prisma/adapter-pg pg`, and in `src/lib/db-core.ts` (and `prisma/seed.ts`) swap `PrismaBetterSqlite3` for `PrismaPg({ connectionString })`.
3. Point `DATABASE_URL` at your Postgres, delete `prisma/migrations`, and run `npm run db:migrate -- --name init`.

### Deploying

Tamam needs a normal Node server, for example Docker on a VPS. It doesn't suit serverless hosting because of the SQLite file, the uploaded files on disk, and headless Chromium for Arabic PDFs (run `npx playwright install --with-deps chromium` on the server, or set `CHROMIUM_PATH`). Run `npm run build && npm start` behind HTTPS, and back up the `data/` and `storage/` folders.

## Extras I added that weren't in the brief

- **One login, many workspaces.** The same person can be an employee at a company, a parent at a school and the head of their home.
- **Morning briefing card**, built from simple rules, so it works with no AI key.
- **Wallpapers drawn as SVG** (mashrabiya, dunes, Corniche skyline, Sadu weave, pearls, contours, desert night). They take their colours from the theme, so there are no image files or licences to worry about.
- **Believable demo data**: Zone/Street/Building addresses, real Doha merchants, a household helper paying cash for groceries, and a comment thread on a pending claim.
- **Gender-neutral Arabic activity lines** ("اعتماد CLM-…" rather than a conjugated verb), because the app doesn't know anyone's gender.
- **Active sessions on the profile page.** Changing your password signs out every other device.
- **Claim vouchers**: a printable one-page voucher per claim with receipts and signature lines, which is how many Qatari households and offices file reimbursements.
- **Self-approval rule**: approvers' own claims go straight through, with an "ask for approval anyway" box for anyone who wants a second pair of eyes.
- **Paid bills count against budgets**, so the budget shows the whole month, not just claims.
- **Safety copy before a replace-restore**, kept in `storage/safety-backups`.
- **Sandbox duplicates** are marked with a banner so nobody mistakes them for the real workspace.
- **Amounts in words in Arabic and English** on invoices and payslips, with the right Arabic counted-noun forms (ريالان، ريالات، ريالاً).
- **A WPS check on every payroll run**, so problems show up before the bank rejects the file.
- **Gratuity estimate** on each employee, and **document expiry reminders** for QIDs and passports.
- **Self check-in** from the phone for staff with a login.
- **Customer statements** with a running balance, and **credit-limit warnings** while invoicing.
- **Extra permissions per person** on top of their role (e.g. a storekeeper with stock access).
- **A believable demo business**: a year of Sadeem's trading (office fit-outs ordered back-to-back from the furniture supplier, a slow-paying logistics customer, rent, Kahramaa and Ooredoo bills, an 8% price rise), 15 staff from eight countries (one new arrival paid on a visa number, one paid in cash), and books that balance to the dirham.
- **Generated receipt photos** in the demo (crumpled paper, real Doha shops, an Arabic thank-you line), so the claims pages look lived-in without stock images.
- **Bilingual report cards on one page** (English and Arabic together), because that's what many Qatari private schools send home, plus Arabic comment suggestions that agree with the child's gender.
- **Gradebook paste from Excel**, Arabic-digit input and «غ» for absent, because teachers often keep marks in a spreadsheet first.
- **A timetable solver** that fills the week across the whole school with no teacher clashes, and greys out any period that would cause one.
- **Parents told about an absence** as soon as the roll is saved, and when a report card is published.
- **A Lusail-only principal**: staff can be tied to one campus, and everything (lists, counts, search, downloads) follows.
- **A public online application form** with spam protection and a reference number.
- **A "new school year" preview** before anything changes, with classmates kept together, full classes overflowing into the emptier one, and transfers when a campus stops at a grade.
- **A believable demo school**: 735 students across three campuses, 105 staff, real Qatari family structures with siblings, a term of attendance and marks, last year's report cards, two fee runs with some families behind, a full bus, about 44 applications at every stage, and the Al-Mansouri children so the same family runs through the home and school demos.
