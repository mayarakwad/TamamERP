# Changelog

## 1.0.0 · 2026-11-09

The first release: one app for businesses, schools and households in Qatar, in Arabic and English.

### Installing
- One-step installers for macOS/Linux (`install.sh`) and Windows (`install.ps1`): check Node.js, download, install, prepare the database, build, start and open the setup wizard.
- Docker image and `docker-compose.yml` for servers, with the database and uploads in volumes and a generated secret that survives restarts.
- The browser setup wizard for a new server (`/setup`), and the terminal installer (`npm run setup`).
- **New:** a setup guide for each new workspace (business, school or home), with progress from real data, skip and resume, and a dashboard card until it's done. It adds branch and campus management and the bank details printed on invoices.

### Foundations
- Sign-up with a choice of business, school or home; roles (owner, admin, accountant, teacher, parent, employee, family member) that only see what belongs to them; hashed passwords and an activity log.
- Full Arabic and English with a real right-to-left layout, Qatari riyal by default, Hijri dates next to Gregorian ones.
- Themes, dark mode, accent colours, wallpapers, font size, density and drag-and-drop dashboard widgets, saved per person.
- Every table and report downloads as Excel, CSV, Word or PDF, prints with the logo and page numbers, copies cleanly, and shares as an expiring view-only link.
- Notifications, comment threads, search across everything, backups (optionally password-protected), restore and duplicate.

### Home
- Expense claims with receipt photos and approvals, monthly budgets, recurring bills with reminders, things you own with warranty dates, and a monthly summary.

### Business
- Customers and suppliers, quotations, invoices, purchase orders, receiving and supplier bills, payments; inventory with low-stock alerts; employees, attendance, leave, payroll and the WPS salary file; a double-entry ledger with profit & loss, balance sheet, cash flow and more.

### School
- Admissions with a public application form, students and guardians, classes and a clash-free timetable builder, roll call, gradebook and bilingual report cards, fees with installments and sibling discounts, bus routes, the library, announcements, a parent view, and several campuses side by side.

### Flow, the AI assistant
- A side panel from anywhere that answers from the organization's own data (as the person asking), explains the page on screen, drafts messages and reports (copy or Word), fills in open forms, and prepares changes that only happen when confirmed.
- Each organization's own key (Claude, OpenAI, Gemini or any OpenAI-compatible service), encrypted on the server; usage per person and model, a monthly spending limit, role access, and a personal name, look and tone.

### Known limitations
- Flow hasn't yet been tried with a real AI model (no key was available while building); the provider connections were checked as far as "key refused".
- Office files were checked part by part and in LibreOffice, not yet in Microsoft Office.
- No email or SMS sending yet: invitations and reminders are links and in-app notifications.
