// The school's money: fee rates, the term fee runs, families paying (most on
// time, some late, a few not yet), three paid payroll runs, rent and utilities.
// Everything that touches the books goes through the app's own functions.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { postEntry } from "../ledger/post";
import { recordPayment } from "../docs/ops";
import { approveRun, generateRun, payRun } from "../payroll/ops";
import { runInstallment, issueFeeInvoice, ensureGuardianParty } from "../school/fee-ops";
import { dohaNoon, ymdOf } from "../hr/ops";
import { stageOf } from "../school/settings";
import type { Rng } from "./random";
import { cid, type SchoolSeedCtx } from "./school";

type Db = PrismaClient | Prisma.TransactionClient;
const DAY = 86400_000;
const q = (riyals: number) => Math.round(riyals * 100);

/** Yearly tuition by grade level (riyals). */
export function tuitionFor(level: number) {
  if (level <= -1) return 28500;
  if (level === 0) return 29800;
  return 32000 + (level - 1) * 1650 + (level >= 9 ? 1500 : 0);
}
const BOOKS = { kg: 1200, primary: 1850, middle: 2300, secondary: 2750 } as const;
const REGISTRATION = 3000;

export async function seedSchoolMoney(db: Db, ctx: SchoolSeedCtx, r: Rng) {
  const { orgId, now, users, startYear } = ctx;
  const fatima = users.fatima;
  const rami = users.rami;

  // ── Fee rates: this year, and next year 3.5% higher ──
  const rates: Prisma.FeeRateCreateManyInput[] = [];
  for (const g of ctx.grades) {
    for (const [yearId, factor] of [[ctx.year.id, 1], [ctx.nextYear.id, 1.035]] as const) {
      rates.push({ id: cid(), orgId, yearId, gradeId: g.id, component: "tuition", amount: q(Math.round((tuitionFor(g.level) * factor) / 50) * 50) });
      rates.push({ id: cid(), orgId, yearId, gradeId: g.id, component: "books", amount: q(BOOKS[stageOf(g.level)]) });
      rates.push({ id: cid(), orgId, yearId, gradeId: g.id, component: "registration", amount: q(REGISTRATION) });
    }
  }
  await db.feeRate.createMany({ data: rates });

  const accounts = await db.account.findMany({ where: { orgId } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!.id;
  const bank = acc("1110");
  const cash = acc("1100");

  // ── Opening balances on 1 August ──
  const open = dohaNoon(`${startYear}-08-01`);
  await postEntry(db, {
    orgId,
    date: open,
    memo: "Opening balances",
    sourceType: "manual",
    createdById: rami,
    lines: [
      { accountId: bank, debit: q(3200000) },
      { accountId: cash, debit: q(25000) },
      { accountId: acc("1500"), debit: q(1650000) },
      { accountId: acc("1510"), debit: q(2400000) },
      { accountId: acc("1590"), credit: q(720000) },
      { accountId: acc("2210"), credit: q(1480000) },
      { accountId: acc("3100"), credit: q(3000000) },
      { accountId: acc("3200"), credit: q(2075000) },
    ],
  });

  // ── Registration fees for this year's new students (paid on the day) ──
  const yearName = (await db.academicYear.findUniqueOrThrow({ where: { id: ctx.year.id } })).name;
  const students = await db.student.findMany({ where: { orgId, status: "active" }, include: { guardians: { where: { primary: true }, take: 1 } } });
  const newcomers = students.filter((s) => s.joinedOn >= ctx.year.startDate);
  for (const s of newcomers) {
    const guardianId = s.guardians[0]?.guardianId;
    if (!guardianId) continue;
    const partyId = await ensureGuardianParty(db, orgId, guardianId);
    const date = new Date(s.joinedOn.getTime() - r.int(20, 60) * DAY);
    const doc = await issueFeeInvoice(db, { orgId, studentId: s.id, partyId, campusId: s.campusId, date, dueDate: new Date(date.getTime() + 7 * DAY), installment: `${yearName}/reg`, lines: [{ component: "registration", description: `Registration fee · ${yearName}`, amount: q(REGISTRATION), discountPct: 0 }], userId: rami, notes: `${s.name} · ${s.number}` });
    await recordPayment(db, { orgId, direction: "in", partyId, date: new Date(date.getTime() + r.int(0, 5) * DAY), amount: doc.total, method: r.pick(["card", "transfer", "card"]), accountId: bank, allocations: [{ documentId: doc.id, amount: doc.total }], createdById: rami });
  }

  // ── Term 1 fees: billed on 1 August, due 15 August ──
  await runInstallment(db, orgId, ctx.year.id, 0, { date: dohaNoon(`${startYear}-08-01`), userId: rami });
  // ── Term 2 fees: billed on 1 November, due 1 December ──
  const nov1 = dohaNoon(`${startYear}-11-01`);
  if (now >= nov1) await runInstallment(db, orgId, ctx.year.id, 1, { date: nov1, userId: rami });

  // ── Families pay ──
  const fees = await db.document.findMany({ where: { orgId, kind: "fee", status: "issued" }, orderBy: { date: "asc" } });
  const byFamily = new Map<string, typeof fees>();
  for (const d of fees) byFamily.set(`${d.partyId}|${d.installment}`, [...(byFamily.get(`${d.partyId}|${d.installment}`) ?? []), d]);
  const lateFamilies = new Set<string>();
  for (const [key, docs] of byFamily) {
    const [partyId, inst] = key.split("|");
    const isT1 = inst.endsWith("/1");
    const total = docs.reduce((s, d) => s + d.total, 0);
    const roll = r.next();
    let paid = 0;
    let date: Date;
    if (isT1) {
      // Most pay by the due date; some a few weeks late; a few in two halves; a few still owe.
      if (roll < 0.06) {
        lateFamilies.add(partyId);
        continue;
      }
      date = new Date(dohaNoon(`${startYear}-08-01`).getTime() + (roll < 0.7 ? r.int(2, 14) : r.int(15, 50)) * DAY);
      paid = roll < 0.12 ? Math.round(total / 2 / 100) * 100 : total;
    } else {
      if (roll > 0.24) continue;
      date = new Date(nov1.getTime() + r.int(0, Math.max(0, Math.floor((now.getTime() - nov1.getTime()) / DAY) - 1)) * DAY);
      paid = total;
    }
    if (date > now) date = new Date(now.getTime() - DAY);
    let left = paid;
    const allocations = docs.map((d) => {
      const a = Math.min(left, d.total);
      left -= a;
      return { documentId: d.id, amount: a };
    }).filter((a) => a.amount > 0);
    const method = r.pick(["transfer", "transfer", "transfer", "card", "card", "cheque"]);
    await recordPayment(db, { orgId, direction: "in", partyId, date, amount: paid, method, accountId: bank, reference: method === "cheque" ? `CHQ ${r.int(100000, 999999)}` : method === "transfer" ? `FT${r.int(10000000, 99999999)}` : null, allocations, createdById: rami });
  }

  // ── Payroll: August to last month, approved by the director and paid on the 28th ──
  const months: string[] = [];
  for (let m = 8; ; m++) {
    const y = m > 12 ? startYear + 1 : startYear;
    const key = `${y}-${String(((m - 1) % 12) + 1).padStart(2, "0")}`;
    if (dohaNoon(`${key}-28`) >= now) break;
    months.push(key);
  }
  for (const month of months) {
    const run = await generateRun(db as PrismaClient, orgId, month, rami);
    await approveRun(db as PrismaClient, orgId, run.id, fatima, dohaNoon(`${month}-26`));
    await payRun(db as PrismaClient, orgId, run.id, rami, dohaNoon(`${month}-28`));
  }

  // ── Running costs: rent for the leased campuses, utilities, buses, cleaning ──
  const costs: [code: string, memo: string, amount: (m: number) => number][] = [
    ["6200", "Rent · Lusail campus", () => 185000],
    ["6200", "Rent · Al Wakra campus", () => 95000],
    ["6300", "Kahramaa · electricity and water", (m) => [92000, 88400, 71250, 54800][m] ?? 50000],
    ["6310", "Ooredoo · internet and phones", () => 7850],
    ["6170", "Bus fuel and maintenance", (m) => 39000 + m * 1200],
    ["6950", "Cleaning and security contract", () => 64000],
    ["6160", "Classroom resources", (m) => [41000, 26500, 18700, 9800][m] ?? 15000],
  ];
  const costMonths = [...months];
  for (const [i, month] of costMonths.entries()) {
    for (const [code, memo, amount] of costs) {
      await postEntry(db, { orgId, date: dohaNoon(`${month}-${code === "6200" ? "01" : String(r.int(5, 25)).padStart(2, "0")}`), memo: `${memo} · ${month}`, sourceType: "manual", createdById: rami, lines: [{ accountId: acc(code), debit: q(amount(i)) }, { accountId: bank, credit: q(amount(i)) }] });
    }
  }
  // This month's rent has gone out already.
  const thisMonth = ymdOf(now).slice(0, 7);
  for (const [code, memo, amount] of costs.filter((c) => c[0] === "6200")) {
    await postEntry(db, { orgId, date: dohaNoon(`${thisMonth}-01`), memo: `${memo} · ${thisMonth}`, sourceType: "manual", createdById: rami, lines: [{ accountId: acc(code), debit: q(amount(0)) }, { accountId: bank, credit: q(amount(0)) }] });
  }
  return { lateFamilies: lateFamilies.size };
}
