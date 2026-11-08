// The people of Sadeem: fifteen staff from eight countries, two months of
// attendance, a year of leave and expense claims, and twelve paid payroll runs
// (each one booked and paid through the same code the app uses).

import type { PrismaClient } from "../../generated/prisma/client";
import { makeIban } from "../payroll/banks";
import { approveRun, generateRun, payRun } from "../payroll/ops";
import { applyLeaveToAttendance, daysBetween, dohaNoon, dohaWeekday, parseWeekend, workingDays, ymdOf } from "../hr/ops";
import { nextNumber } from "../series";
import { postClaimApproval, postClaimReimbursed } from "../claims-ledger";
import { postEntry } from "../ledger/post";
import { addMonths, monthKey } from "../format";
import { rng } from "./random";

type Db = PrismaClient;
const q = (riyals: number) => Math.round(riyals * 100);
const DAY = 86400_000;

interface Person {
  key: string;
  name: string;
  nameAr: string;
  title: string;
  titleAr: string;
  dept: string;
  nat: string;
  pay: [basic: number, housing: number, transport: number, food?: number];
  joined: string;
  bank?: { code: string; iban: string };
  cash?: boolean;
  campus: "showroom" | "warehouse";
  qidDays?: number;
  noQid?: boolean;
  user?: "omar" | "priya" | "joseph";
  left?: string;
  overtime?: boolean;
}

const PEOPLE: Person[] = [
  { key: "omar", name: "Omar Haddad", nameAr: "عمر حداد", title: "Operations Manager", titleAr: "مدير العمليات", dept: "Management", nat: "JO", pay: [12000, 4000, 1000], joined: "2019-03-10", bank: { code: "QNB", iban: "QNBA" }, campus: "showroom", user: "omar" },
  { key: "priya", name: "Priya Nair", nameAr: "بريا ناير", title: "Chief Accountant", titleAr: "رئيسة الحسابات", dept: "Finance", nat: "IN", pay: [9500, 3500, 1000], joined: "2020-09-01", bank: { code: "CBQ", iban: "CBQA" }, campus: "showroom", user: "priya" },
  { key: "abdullah", name: "Abdullah Al-Kaabi", nameAr: "عبدالله الكعبي", title: "Government Relations Officer", titleAr: "مسؤول العلاقات الحكومية", dept: "Management", nat: "QA", pay: [7500, 2500, 1000], joined: "2022-03-01", bank: { code: "QNB", iban: "QNBA" }, campus: "showroom" },
  { key: "rizwan", name: "Mohammed Rizwan Khan", nameAr: "محمد رضوان خان", title: "Senior Sales Executive", titleAr: "مسؤول مبيعات أول", dept: "Sales", nat: "PK", pay: [6000, 2000, 800], joined: "2018-06-01", bank: { code: "QIB", iban: "QISB" }, campus: "showroom" },
  { key: "lina", name: "Lina Saab", nameAr: "لينا صعب", title: "Showroom Sales Executive", titleAr: "مسؤولة مبيعات الصالة", dept: "Sales", nat: "LB", pay: [4800, 1500, 700], joined: "2022-11-20", bank: { code: "CBQ", iban: "CBQA" }, campus: "showroom" },
  { key: "sanjeewa", name: "Sanjeewa Perera", nameAr: "سانجيوا بيريرا", title: "Printer Technician", titleAr: "فني طابعات", dept: "Service", nat: "LK", pay: [4000, 1200, 500], joined: "2019-11-11", bank: { code: "QNB", iban: "QNBA" }, campus: "warehouse", qidDays: 24, overtime: true },
  { key: "fatma", name: "Fatma Abdelrahman", nameAr: "فاطمة عبدالرحمن", title: "Accounts Assistant", titleAr: "مساعدة محاسبة", dept: "Finance", nat: "EG", pay: [3800, 1200, 500], joined: "2023-02-01", bank: { code: "QIB", iban: "QISB" }, campus: "showroom" },
  { key: "joseph", name: "Joseph Mathew", nameAr: "جوزيف ماثيو", title: "Storekeeper", titleAr: "أمين المخزن", dept: "Warehouse", nat: "IN", pay: [3600, 1000, 400], joined: "2021-02-14", bank: { code: "DBQ", iban: "DOHB" }, campus: "warehouse", user: "joseph" },
  { key: "grace", name: "Grace Wanjiru Mwangi", nameAr: "غريس وانجيرو موانجي", title: "Showroom Cashier", titleAr: "أمينة صندوق الصالة", dept: "Sales", nat: "KE", pay: [3000, 900, 300], joined: "2024-07-01", bank: { code: "CBQ", iban: "CBQA" }, campus: "showroom" },
  { key: "ahmed", name: "Ahmed Hassan Osman", nameAr: "أحمد حسن عثمان", title: "Furniture Installer", titleAr: "فني تركيب أثاث", dept: "Service", nat: "SD", pay: [2800, 800, 300], joined: "2020-04-05", bank: { code: "DBQ", iban: "DOHB" }, campus: "warehouse", overtime: true },
  { key: "arnel", name: "Arnel Dela Cruz", nameAr: "أرنيل ديلا كروز", title: "Delivery Driver", titleAr: "سائق توصيل", dept: "Logistics", nat: "PH", pay: [2400, 700, 0, 300], joined: "2021-08-01", bank: { code: "MAR", iban: "MAFR" }, campus: "warehouse", overtime: true, qidDays: 52 },
  { key: "samuel", name: "Samuel Kofi Owusu", nameAr: "صامويل كوفي أووسو", title: "Delivery Driver", titleAr: "سائق توصيل", dept: "Logistics", nat: "GH", pay: [2300, 700, 0, 300], joined: "", bank: { code: "QNB", iban: "QNBA" }, campus: "warehouse", noQid: true },
  { key: "ramesh", name: "Ramesh Bahadur Thapa", nameAr: "راميش بهادور ثابا", title: "Warehouse Assistant", titleAr: "مساعد مستودع", dept: "Warehouse", nat: "NP", pay: [1800, 500, 300, 300], joined: "2023-05-08", bank: { code: "QNB", iban: "QNBA" }, campus: "warehouse" },
  { key: "bishnu", name: "Bishnu Prasad Gurung", nameAr: "بيشنو براساد غورونغ", title: "Warehouse Assistant", titleAr: "مساعد مستودع", dept: "Warehouse", nat: "NP", pay: [1800, 500, 300, 300], joined: "2024-01-15", bank: { code: "QNB", iban: "QNBA" }, campus: "warehouse" },
  { key: "rahim", name: "Rahim Uddin Sheikh", nameAr: "رحيم الدين شيخ", title: "Office Assistant", titleAr: "مساعد مكتبي", dept: "Administration", nat: "BD", pay: [1500, 500, 200, 300], joined: "2022-09-15", cash: true, campus: "showroom" },
  { key: "kevin", name: "Kevin D'Souza", nameAr: "كيفن ديسوزا", title: "Sales Executive", titleAr: "مسؤول مبيعات", dept: "Sales", nat: "IN", pay: [4500, 1500, 700], joined: "2021-05-03", bank: { code: "CBQ", iban: "CBQA" }, campus: "showroom", left: "LEFT" },
];

/** A plausible 11-digit Qatar ID: 2/3 + birth year (2 digits) + nationality code + serial. */
function makeQid(r: ReturnType<typeof rng>, nat: string) {
  const codes: Record<string, string> = { QA: "634", IN: "356", NP: "524", PH: "608", PK: "586", LB: "422", EG: "818", LK: "144", KE: "404", SD: "729", GH: "288", BD: "050", JO: "400" };
  const year = r.int(70, 99);
  return `${nat === "QA" ? "2" : "2"}${year}${codes[nat] ?? "999"}${String(r.int(10000, 99999))}`.slice(0, 11).padEnd(11, "0");
}

export async function seedBusinessPeople(db: Db, orgId: string, users: { khalid: string; omar: string; priya: string; joseph: string }, campuses: { showroom: string; warehouse: string }, now = new Date()) {
  const r = rng(974);
  const thisMonth = monthKey(now);
  const firstMonth = addMonths(thisMonth, -12);
  const weekend = parseWeekend("5,6");
  const emp: Record<string, { id: string; p: Person }> = {};

  for (const [i, p] of PEOPLE.entries()) {
    const joined = p.joined ? dohaNoon(p.joined) : new Date(now.getTime() - 27 * DAY);
    const qidExpiry = new Date(now.getTime() + (p.qidDays ?? r.int(120, 700)) * DAY);
    const e = await db.employee.create({
      data: {
        orgId,
        number: `EMP-${String(i + 1).padStart(3, "0")}`,
        userId: p.user ? users[p.user] : null,
        name: p.name,
        nameAr: p.nameAr,
        jobTitle: p.title,
        jobTitleAr: p.titleAr,
        department: p.dept,
        campusId: campuses[p.campus],
        nationality: p.nat,
        phone: `+974 ${r.int(3, 7)}${r.int(100, 999)} ${r.int(1000, 9999)}`,
        qid: p.noQid ? null : makeQid(r, p.nat),
        qidExpiry: p.noQid ? null : dohaNoon(ymdOf(qidExpiry)),
        visaNumber: p.noQid ? `VS${r.int(1000000000, 9999999999)}` : null,
        passportNumber: p.nat === "QA" ? null : `${p.nat === "IN" ? "Z" : p.nat === "PH" ? "P" : "N"}${r.int(1000000, 9999999)}`,
        passportExpiry: p.nat === "QA" ? null : dohaNoon(ymdOf(new Date(now.getTime() + (p.key === "lina" ? 41 : r.int(200, 2200)) * DAY))),
        joinedOn: joined,
        status: p.left ? "terminated" : "active",
        leftOn: p.left ? dohaNoon(`${addMonths(thisMonth, -5)}-30`.replace(/-(02)-30$/, "-$1-28")) : null,
        basicSalary: q(p.pay[0]),
        housingAllowance: q(p.pay[1]),
        transportAllowance: q(p.pay[2]),
        foodAllowance: q(p.pay[3] ?? 0),
        payMethod: p.cash ? "cash" : "bank",
        bankShortName: p.bank?.code ?? null,
        iban: p.bank ? makeIban("QA", `${p.bank.iban}${String(r.int(10000, 99999))}${String(r.int(1000000000, 9999999999))}${String(r.int(100000, 999999))}`) : null,
        annualLeaveDays: joined.getTime() < now.getTime() - 5 * 365 * DAY ? 28 : 21,
        leaveOpening: p.key === "joseph" ? 6 : p.key === "rizwan" ? 9 : 0,
      },
    });
    emp[p.key] = { id: e.id, p };
  }
  const active = Object.values(emp).filter((x) => !x.p.left);

  // ── Leave over the year ──
  const leaves: { who: string; type: string; start: string; days: number; status: string; reason: string }[] = [
    { who: "joseph", type: "annual", start: `${addMonths(thisMonth, -4)}-02`, days: 26, status: "approved", reason: "Annual home leave, Kerala" },
    { who: "priya", type: "annual", start: `${addMonths(thisMonth, -7)}-14`, days: 8, status: "approved", reason: "Family wedding in Kochi" },
    { who: "rizwan", type: "annual", start: `${addMonths(thisMonth, -5)}-05`, days: 18, status: "approved", reason: "Summer leave, Lahore" },
    { who: "arnel", type: "sick", start: `${addMonths(thisMonth, -1)}-12`, days: 2, status: "approved", reason: "Fever, clinic note attached" },
    { who: "lina", type: "annual", start: `${addMonths(thisMonth, -1)}-19`, days: 5, status: "approved", reason: "Trip to Beirut" },
    { who: "ramesh", type: "unpaid", start: `${addMonths(thisMonth, -3)}-08`, days: 3, status: "approved", reason: "Extra days after annual leave" },
    { who: "sanjeewa", type: "emergency", start: `${addMonths(thisMonth, -6)}-21`, days: 4, status: "approved", reason: "Family emergency in Colombo" },
    { who: "bishnu", type: "annual", start: `${addMonths(thisMonth, -2)}-10`, days: 6, status: "rejected", reason: "Dashain festival" },
    { who: "lina", type: "annual", start: `${addMonths(thisMonth, 1)}-21`, days: 7, status: "submitted", reason: "End-of-year family visit" },
    { who: "joseph", type: "annual", start: `${addMonths(thisMonth, 1)}-14`, days: 5, status: "submitted", reason: "Christmas with family" },
    { who: "ahmed", type: "annual", start: `${addMonths(thisMonth, -9)}-03`, days: 21, status: "approved", reason: "Annual leave, Khartoum" },
  ];
  for (const l of leaves) {
    const e = emp[l.who];
    const start = dohaNoon(l.start);
    // Walk forward to cover the requested number of working days.
    let end = start;
    let count = 0;
    for (let t = start.getTime(); count < l.days; t += DAY) {
      end = new Date(t);
      if (!weekend.includes(dohaWeekday(end))) count++;
    }
    const days = workingDays(start, end, weekend).length;
    const number = await nextNumber(db, orgId, "LV", start);
    const req = await db.leaveRequest.create({
      data: {
        orgId,
        number,
        employeeId: e.id,
        type: l.type,
        startDate: start,
        endDate: end,
        days,
        reason: l.reason,
        status: l.status,
        requestedById: e.p.user ? users[e.p.user] : users.omar,
        decidedById: l.status === "submitted" ? null : users.omar,
        decidedAt: l.status === "submitted" ? null : new Date(start.getTime() - 9 * DAY),
        decisionNote: l.status === "rejected" ? "Peak season in the warehouse; please pick dates after the stock count." : null,
        createdAt: new Date(start.getTime() - (l.status === "submitted" ? 3 : 14) * DAY),
      },
    });
    if (l.status === "approved") await applyLeaveToAttendance(db, { orgId, employeeId: e.id, type: l.type, startDate: req.startDate, endDate: req.endDate }, weekend);
  }

  // ── Attendance: last month and this month so far ──
  const today = ymdOf(now);
  const dohaHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", hourCycle: "h23" }).format(now));
  const clock = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  // Ramesh's one no-show: the first working day after the 14th of last month.
  let noShow = dohaNoon(`${addMonths(thisMonth, -1)}-14`);
  while (weekend.includes(dohaWeekday(noShow))) noShow = new Date(noShow.getTime() + DAY);
  const noShowKey = ymdOf(noShow);
  for (const d of daysBetween(dohaNoon(`${addMonths(thisMonth, -1)}-01`), now)) {
    if (weekend.includes(dohaWeekday(d))) continue;
    const key = ymdOf(d);
    if (key === today && dohaHour < 9) continue;
    for (const { id, p } of active) {
      if (d < dohaNoon(p.joined || ymdOf(new Date(now.getTime() - 27 * DAY)))) continue;
      // Joseph checks in himself today (demo of the clock).
      if (key === today && p.key === "joseph") continue;
      const exists = await db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: id, date: d } } });
      if (exists) continue;
      // Ramesh missed a day last month (no call, no show).
      if (p.key === "ramesh" && key === noShowKey) {
        await db.attendanceDay.create({ data: { orgId, employeeId: id, date: d, status: "absent", note: "No call, no show" } });
        continue;
      }
      const late = r.chance(p.key === "bishnu" || p.key === "samuel" ? 0.14 : 0.04);
      const inM = late ? r.int(12, 45) : r.int(-22, 8);
      const inH = 8 + Math.floor(inM / 60) + (inM < 0 ? -1 : 0);
      const ot = p.overtime && r.chance(0.28) ? r.pick([60, 90, 120, 150, 180]) : 0;
      const outMin = 17 * 60 + r.int(0, 14) + ot;
      const done = key !== today || dohaHour >= 17;
      await db.attendanceDay.create({
        data: {
          orgId,
          employeeId: id,
          date: d,
          status: late ? "late" : "present",
          checkIn: clock(inH, ((inM % 60) + 60) % 60),
          checkOut: done ? clock(Math.floor(outMin / 60), outMin % 60) : null,
          overtimeMin: done ? ot : 0,
          note: ot ? r.pick(["Late delivery to Lusail", "Office fit-out, Msheireb", "Stock count", "Printer repair at client"]) : null,
        },
      });
    }
  }

  // ── Expense claims ──
  const cats = new Map((await db.expenseCategory.findMany({ where: { orgId } })).map((c) => [c.key, c.id]));
  const claimants: { user: string; items: [string, string, number, number][] }[] = [
    { user: users.omar, items: [["travel", "Qatar Airways, Dubai trade fair", 2850, 3900], ["meals", "Client lunch, Al Bidda Engineering", 280, 640], ["fuel", "WOQOD fuel", 180, 260]] },
    { user: users.joseph, items: [["fuel", "WOQOD fuel, delivery van", 150, 240], ["repairs", "Pallet jack wheel replacement", 120, 380], ["office", "Label printer tape", 45, 120]] },
    { user: users.priya, items: [["gov", "Commercial registration renewal fee", 1650, 1650], ["office", "Cheque book printing", 90, 150], ["phone", "Ooredoo top-up, roaming", 100, 200]] },
    { user: users.khalid, items: [["meals", "Business dinner with Gulf Paper Trading", 420, 980], ["travel", "Hotel, Riyadh supplier visit", 1450, 2600]] },
  ];
  for (let m = 0; m <= 12; m++) {
    const key = addMonths(firstMonth, m);
    for (const c of claimants) {
      if (!r.chance(c.user === users.khalid ? 0.25 : 0.55)) continue;
      const [cat, merchant, lo, hi] = r.pick(c.items);
      const day = Math.min(28, r.int(2, 27));
      const spentOn = dohaNoon(`${key}-${String(day).padStart(2, "0")}`);
      if (spentOn > now) continue;
      const amount = q(lo === hi ? lo : r.money(lo, hi));
      const age = (now.getTime() - spentOn.getTime()) / DAY;
      const self = c.user === users.khalid;
      const status = self ? (age > 10 ? "reimbursed" : "approved") : age < 6 ? "submitted" : age < 14 ? "approved" : "reimbursed";
      const decidedAt = status === "submitted" ? null : new Date(spentOn.getTime() + 2 * DAY);
      const number = await nextNumber(db, orgId, "CLM", spentOn);
      const claim = await db.claim.create({
        data: {
          orgId,
          number,
          submittedById: c.user,
          categoryId: cats.get(cat)!,
          amount,
          merchant,
          spentOn,
          paidWith: cat === "fuel" || cat === "meals" ? "card" : "transfer",
          status,
          decidedById: decidedAt ? (self ? c.user : users.khalid) : null,
          decidedAt,
          decisionNote: self ? "self" : null,
          reimbursedAt: status === "reimbursed" ? new Date(spentOn.getTime() + 8 * DAY) : null,
          createdAt: new Date(spentOn.getTime() + 3600_000),
        },
      });
      if (decidedAt) await postClaimApproval(db, claim.id, self ? c.user : users.khalid, decidedAt);
      if (status === "reimbursed") await postClaimReimbursed(db, claim.id, users.priya, new Date(spentOn.getTime() + 8 * DAY));
    }
  }

  // A salary advance paid to Arnel in cash, repaid through the next two payrolls.
  await postEntry(db, {
    orgId,
    date: dohaNoon(`${addMonths(thisMonth, -3)}-06`),
    memo: "Salary advance to Arnel Dela Cruz",
    sourceType: "manual",
    createdById: users.priya,
    lines: [{ role: "advances", debit: q(1000) }, { role: "bank", credit: q(1000) }],
  });

  // ── A year of payroll, approved at month end and paid early the next month ──
  for (let m = 0; m < 12; m++) {
    const month = addMonths(firstMonth, m + 1);
    if (month >= thisMonth) break;
    const extras: Record<string, { bonus?: number; advanceDeduction?: number; otherDeduction?: number; notes?: string }> = {};
    const mm = Number(month.slice(5));
    if ([3, 6, 9, 12].includes(mm)) extras[emp.rizwan.id] = { bonus: q(1500), notes: "Quarterly sales bonus" };
    if (mm === 12) extras[emp.lina.id] = { bonus: q(800), notes: "Year-end bonus" };
    if (month === addMonths(thisMonth, -3) || month === addMonths(thisMonth, -2)) extras[emp.arnel.id] = { advanceDeduction: q(500), notes: "Salary advance (QAR 1,000 in two parts)" };
    await generateRun(db, orgId, month, users.priya, extras);
    const run = await db.payrollRun.findUniqueOrThrow({ where: { orgId_month: { orgId, month } } });
    await approveRun(db, orgId, run.id, users.omar);
    const payDate = dohaNoon(`${addMonths(month, 1)}-0${r.int(2, 4)}`);
    if (payDate <= now) {
      // Cash for the one cash-paid wage is drawn from the bank on payday.
      const cashNet = (await db.payslip.findMany({ where: { runId: run.id, employee: { payMethod: "cash" } }, select: { net: true } })).reduce((s, p) => s + p.net, 0);
      if (cashNet > 0) await postEntry(db, { orgId, date: payDate, memo: `Cash withdrawn for wages, ${month}`, sourceType: "manual", createdById: users.priya, lines: [{ role: "cash", debit: cashNet }, { role: "bank", credit: cashNet }] });
      await payRun(db, orgId, run.id, users.priya, payDate);
    }
  }

  return { employees: PEOPLE.length };
}
