// School fees on top of the document engine: each fee invoice is a Document
// (kind "fee") addressed to the family's billing account, posted to the
// ledger by issueFee, and paid with the same payments as any invoice.
// No server-only imports: the seed uses these too.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { issueFee, saveDocument, DocError } from "../docs/ops";
import { QTY } from "../docs/math";
import { childOrders, installmentLines, type FeeLine } from "./fees";
import { installmentDue, schoolSettings } from "./settings";

type Db = PrismaClient | Prisma.TransactionClient;

const COMPONENT_ROLE: Record<FeeLine["component"], string> = { tuition: "tuition", books: "bookFees", transport: "transportFees", registration: "registrationFees" };

const WORDS: Record<FeeLine["component"], [string, string]> = {
  tuition: ["Tuition", "الرسوم الدراسية"],
  books: ["Books & resources", "الكتب والمصادر"],
  transport: ["School bus", "الحافلة المدرسية"],
  registration: ["Registration fee", "رسوم التسجيل"],
};
const REASON: Record<string, [string, string]> = { sibling: ["sibling discount", "خصم الإخوة"], staff: ["staff discount", "خصم أبناء الموظفين"], scholarship: ["scholarship", "منحة دراسية"] };

/** The family's billing account (a Party) for a guardian, created the first time it's needed. */
export async function ensureGuardianParty(db: Db, orgId: string, guardianId: string) {
  const g = await db.guardian.findFirstOrThrow({ where: { id: guardianId, orgId } });
  if (g.partyId) return g.partyId;
  const p = await db.party.create({ data: { orgId, name: g.name, nameAr: g.nameAr, isCustomer: true, phone: g.phone, email: g.email, address: g.address, addressAr: g.addressAr, paymentTerms: 14 } });
  await db.guardian.update({ where: { id: g.id }, data: { partyId: p.id } });
  return p.id;
}

async function feeAccounts(db: Db, orgId: string) {
  const rows = await db.account.findMany({ where: { orgId, role: { in: Object.values(COMPONENT_ROLE) } }, select: { id: true, role: true } });
  const byRole = new Map(rows.map((r) => [r.role, r.id]));
  return (c: FeeLine["component"]) => byRole.get(COMPONENT_ROLE[c]) ?? null;
}

export const installmentKey = (yearName: string, index: number) => `${yearName}/${index + 1}`;

interface IssueInput {
  orgId: string;
  studentId: string;
  partyId: string;
  campusId: string;
  date: Date;
  dueDate: Date;
  installment: string | null;
  lines: { component: FeeLine["component"]; description: string; amount: number; discountPct: number }[];
  userId: string;
  notes?: string | null;
}

/** Create and issue one fee invoice. */
export async function issueFeeInvoice(db: Db, d: IssueInput) {
  const account = await feeAccounts(db, d.orgId);
  const doc = await saveDocument(db, {
    orgId: d.orgId,
    kind: "fee",
    partyId: d.partyId,
    campusId: d.campusId,
    date: d.date,
    dueDate: d.dueDate,
    notes: d.notes ?? null,
    createdById: d.userId,
    lines: d.lines.map((l) => ({ description: l.description, qty: QTY, unitPrice: l.amount, discountPct: l.discountPct, accountId: account(l.component) })),
  });
  await db.document.update({ where: { id: doc.id }, data: { studentId: d.studentId, installment: d.installment } });
  return issueFee(db, d.orgId, doc.id, d.userId, d.date);
}

function describe(c: FeeLine, label: [string, string], ar: boolean, extra?: string | null) {
  const [en, arW] = WORDS[c.component];
  const base = `${ar ? arW : en} · ${ar ? label[1] : label[0]}${extra ? ` · ${extra}` : ""}`;
  if (!c.discountReason) return base;
  const r = REASON[c.discountReason];
  return `${base} (${ar ? r[1] : r[0]})`;
}

/**
 * Bill one installment of the year for every active student in scope who
 * hasn't been billed for it yet. Siblings are ordered eldest first within the
 * whole school, so the family discount follows the family across campuses.
 */
export async function runInstallment(db: Db, orgId: string, yearId: string, index: number, opts: { date: Date; userId: string; campusIds?: string[]; studentIds?: string[] }) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const settings = schoolSettings(org);
  const inst = settings.installments[index];
  if (!inst) throw new DocError("errors.required");
  const year = await db.academicYear.findFirstOrThrow({ where: { id: yearId, orgId } });
  const key = installmentKey(year.name, index);
  const ar = org.locale === "ar";
  const [rates, students] = await Promise.all([
    db.feeRate.findMany({ where: { orgId, yearId } }),
    db.student.findMany({
      where: { orgId, status: "active" },
      include: { busStop: { include: { route: true } }, guardians: { where: { primary: true }, take: 1 }, invoices: { where: { installment: key, status: { not: "void" } }, select: { id: true } } },
    }),
  ]);
  const rate = (gradeId: string, component: string) => rates.find((r) => r.gradeId === gradeId && r.component === component)?.amount ?? 0;
  const orders = childOrders(students.map((s) => ({ id: s.id, dob: s.dob, familyKey: s.guardians[0]?.guardianId ?? null })));
  const due = installmentDue(inst, year.startDate.getUTCFullYear());
  let count = 0;
  let total = 0;
  for (const s of students) {
    if (s.invoices.length) continue;
    if (opts.campusIds && !opts.campusIds.includes(s.campusId)) continue;
    if (opts.studentIds && !opts.studentIds.includes(s.id)) continue;
    const guardianId = s.guardians[0]?.guardianId;
    if (!guardianId) continue;
    const lines = installmentLines(
      { childOrder: orders.get(s.id) ?? 0, discountKind: s.discountKind, discountPct: s.discountPct, transportFee: s.busStop?.route.annualFee ?? 0 },
      { tuition: rate(s.gradeId, "tuition"), books: rate(s.gradeId, "books") },
      index,
      settings,
    );
    if (!lines.length) continue;
    const partyId = await ensureGuardianParty(db, orgId, guardianId);
    const label: [string, string] = [`${inst.label} ${year.name}`, `${inst.labelAr || inst.label} ${year.name}`];
    const doc = await issueFeeInvoice(db, {
      orgId,
      studentId: s.id,
      partyId,
      campusId: s.campusId,
      date: opts.date,
      dueDate: due > opts.date ? due : new Date(opts.date.getTime() + 14 * 86400_000),
      installment: key,
      lines: lines.map((l) => ({ component: l.component, description: describe(l, label, ar, l.component === "transport" ? s.busStop?.route.code : null), amount: l.amount, discountPct: l.discountPct })),
      userId: opts.userId,
      notes: `${s.name} · ${s.number}`,
    });
    count++;
    total += doc.total;
  }
  return { count, total, key };
}

/** A student who joins: the registration fee, plus any installment of this year already billed to everyone else. */
export async function billNewStudent(db: Db, orgId: string, studentId: string, userId: string, date: Date) {
  const s = await db.student.findFirstOrThrow({ where: { id: studentId, orgId }, include: { guardians: { where: { primary: true }, take: 1 } } });
  const guardianId = s.guardians[0]?.guardianId;
  if (!guardianId) return;
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const settings = schoolSettings(org);
  const ar = org.locale === "ar";
  const year = s.status === "upcoming" ? await db.academicYear.findFirst({ where: { orgId, startDate: { gt: new Date() } }, orderBy: { startDate: "asc" } }) : await db.academicYear.findFirst({ where: { orgId, current: true } });
  if (!year) return;
  const reg = await db.feeRate.findUnique({ where: { yearId_gradeId_component: { yearId: year.id, gradeId: s.gradeId, component: "registration" } } });
  if (reg && reg.amount > 0) {
    const partyId = await ensureGuardianParty(db, orgId, guardianId);
    await issueFeeInvoice(db, {
      orgId,
      studentId,
      partyId,
      campusId: s.campusId,
      date,
      dueDate: new Date(date.getTime() + 7 * 86400_000),
      installment: `${year.name}/reg`,
      lines: [{ component: "registration", description: `${ar ? WORDS.registration[1] : WORDS.registration[0]} · ${year.name}`, amount: reg.amount, discountPct: 0 }],
      userId,
      notes: `${s.name} · ${s.number}`,
    });
  }
  if (s.status !== "active") return;
  for (const [i] of settings.installments.entries()) {
    const key = installmentKey(year.name, i);
    const run = await db.document.count({ where: { orgId, kind: "fee", installment: key } });
    if (run) await runInstallment(db, orgId, year.id, i, { date, userId, studentIds: [studentId] });
  }
}
