# Tamam · تمام

**An ERP that feels alive.** Tamam is one app for three kinds of organizations: **businesses**, **schools** and **households**. You pick one when you sign up and the whole app shapes itself around that choice. It's built for Qatar, so it does full Arabic and English with a proper right-to-left layout, uses Qatari riyal by default, and shows Hijri (Umm al-Qura) dates next to Gregorian ones.

> "Tamam" is a working name. It lives in one place (`src/lib/i18n/en.ts` → `app.name`, plus the Arabic file), so renaming is a one-line change.

| | |
|---|---|
| ![Sign in](docs/screenshots/login.jpg) | ![Home dashboard](docs/screenshots/home-dashboard.jpg) |
| ![Arabic, dark mode](docs/screenshots/home-dashboard-ar-dark.jpg) | ![Appearance settings](docs/screenshots/appearance.jpg) |
| ![Claims](docs/screenshots/claims.jpg) | ![A claim with its receipt and comment thread](docs/screenshots/claim-detail.jpg) |
| ![Budgets in Arabic](docs/screenshots/budgets-ar.jpg) | ![Bills in Arabic](docs/screenshots/bills-ar.jpg) |

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
| Hessa Al-Mansouri | Al-Mansouri Home | Owner | The Home dashboard: 5 claims waiting (approve one), a busy grocery week, dining over budget, bills due this week, a TV warranty ending soon. Every page under **Settings**. She's also a **parent** at Al Manara (try the workspace switcher). |
| Maria Santos | Al-Mansouri Home | Family member | The family-member view: new claim from a phone, her own claims and their comment threads, no admin pages. Search only finds her own claims. |
| Khalid Al-Mansouri | Sadeem (business) + Home | Owner / Admin | One login, two workspaces. |
| Priya Nair | Sadeem | Accountant | The business layout and navigation. |
| Dr. Fatima Al-Sulaiti | Al Manara International School | Owner | The school group with three campuses. |
| Aisha Rahman | Al Manara | Teacher | Teachers only see their own classes' pages. |

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
| `npm test` | Unit tests: formatting, money, permissions, preferences, setup key, CSV and filename safety |
| `npm run test:e2e` | Browser tests: setup wizard, sign-in, roles, Arabic, signup, lockout, claims from submit to approval, exports, share links, search, notifications, invitations, backups. On a new machine, run `npx playwright install chromium` first |
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

**How the exports were checked:** each format was downloaded and opened, not just generated. Excel files were read back cell by cell (direction, number types, formats, formulas). Excel and Word files were opened in LibreOffice and rendered to images to check Arabic letter shaping, right-to-left order and page numbers. PDFs and the print layout were checked the same way in Chromium.

## Roadmap

| Stage | Contents |
|---|---|
| ~~1a · Foundations~~ | Done |
| ~~1b · Home~~ | Done |
| **2 · Business** | Customers, quotations → invoices → payments; purchase orders → receiving → supplier bills; inventory with low-stock alerts; expenses; HR (employees, attendance, leave, payroll, WPS salary file); a double-entry ledger behind profit & loss, cash flow, balance sheet and aging reports. |
| **3 · School** | Admissions board, students and guardians, staff, classes and timetable, attendance, exams, gradebook and report cards, fees with installments, bus routes, library, parent view, and side-by-side campuses. |
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
src/lib/datasets/           One definition per table: the page, every download, copy and share use it
src/lib/export/             Excel, CSV, Word, PDF, print and claim voucher writers
src/lib/backup/             Backup file format, restore with id remapping, duplicate
src/lib/search/             Search index with Arabic normalization
src/lib/demo/               Demo workspaces, generated receipt photos and logos
src/components/             Shell, dashboard widgets, data table and toolbar, record threads, UI primitives
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
- **Generated receipt photos** in the demo (crumpled paper, real Doha shops, an Arabic thank-you line), so the claims pages look lived-in without stock images.
