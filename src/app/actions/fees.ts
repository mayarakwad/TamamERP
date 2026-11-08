"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { DocError, recordPayment, voidDocument } from "@/lib/docs/ops";
import { notify } from "@/lib/notify";
import { indexDocument } from "@/lib/search/index-core";
import { getSchool, type School } from "@/lib/school/scope";
import { runInstallment } from "@/lib/school/fee-ops";
import { FEE_COMPONENTS } from "@/lib/school/settings";
import type { ActionResult } from "./claims";

const dohaNoon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const qar = (d: number) => `QAR ${(d / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function attempt<R extends ActionResult<object>>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DocError) return { ok: false, error: e.code };
    throw e;
  }
}

/** Fees are run by finance (accountant) or the school office. */
async function finance(slug: string, manage = true) {
  const s = await getSchool(slug);
  if (!(s.ws.can(manage ? "finance.manage" : "finance.view") || s.ws.can("school.manage"))) throw new DocError("empty.notAllowed");
  return s;
}

const log = (s: School, action: string, entityType: string, entityId: string | undefined, summary: string, summaryAr: string, sensitive = false) =>
  audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action, entityType, entityId, summary, summaryAr, sensitive });

const ratesInput = z.object({ yearId: z.string(), rates: z.array(z.object({ gradeId: z.string(), component: z.enum(FEE_COMPONENTS), amount: z.string().max(20) })).max(200) });

export async function saveFeeRates(slug: string, raw: z.input<typeof ratesInput>): Promise<ActionResult> {
  return attempt(async () => {
    const s = await finance(slug);
    const d = ratesInput.parse(raw);
    const year = await db.academicYear.findFirst({ where: { id: d.yearId, orgId: s.ws.org.id } });
    if (!year) return { ok: false, error: "empty.notFound" };
    const grades = new Set((await db.grade.findMany({ where: { orgId: s.ws.org.id }, select: { id: true } })).map((g) => g.id));
    await db.$transaction(async (tx) => {
      for (const r of d.rates) {
        if (!grades.has(r.gradeId)) continue;
        const amount = r.amount.trim() ? parseMoney(r.amount) : 0;
        if (amount == null || amount < 0) throw new DocError("claims.amountInvalid");
        await tx.feeRate.upsert({ where: { yearId_gradeId_component: { yearId: year.id, gradeId: r.gradeId, component: r.component } }, create: { orgId: s.ws.org.id, yearId: year.id, gradeId: r.gradeId, component: r.component, amount }, update: { amount } });
      }
    });
    await log(s, "fees.structure_saved", "academicYear", year.id, `updated the fee structure for ${year.name}`, `تحديث هيكل الرسوم للعام ${year.name}`, true);
    refresh();
    return { ok: true };
  });
}

export async function billInstallment(slug: string, yearId: string, index: number, date: string): Promise<ActionResult<{ count: number; total: number }>> {
  return attempt(async () => {
    const s = await finance(slug);
    if (!ymd.safeParse(date).success) return { ok: false, error: "errors.required" };
    const year = await db.academicYear.findFirst({ where: { id: yearId, orgId: s.ws.org.id } });
    if (!year) return { ok: false, error: "empty.notFound" };
    const res = await db.$transaction((tx) => runInstallment(tx, s.ws.org.id, year.id, index, { date: dohaNoon(date), userId: s.ws.viewer.id, campusIds: s.campusIds }), { timeout: 120_000 });
    const inst = s.settings.installments[index];
    await log(s, "fees.billed", "academicYear", year.id, `billed ${inst?.label ?? "an installment"} ${year.name}: ${res.count} invoices, ${qar(res.total)}`, `فوترة ${inst?.labelAr ?? ""} ${year.name}: ${res.count} فاتورة`, true);
    const docs = await db.document.findMany({ where: { orgId: s.ws.org.id, kind: "fee", installment: res.key }, select: { id: true } });
    for (const d of docs) await indexDocument(db, d.id);
    refresh();
    return { ok: true, count: res.count, total: res.total };
  });
}

/** Families: search by parent or child, for the payment sheet. */
export async function findFamilies(slug: string, q: string) {
  const s = await finance(slug, false);
  const term = q.trim();
  if (term.length < 2) return [];
  const guardians = await db.guardian.findMany({
    where: {
      orgId: s.ws.org.id,
      partyId: { not: null },
      OR: [{ name: { contains: term } }, { nameAr: { contains: term } }, { phone: { contains: term } }, { children: { some: { student: { OR: [{ name: { contains: term } }, { nameAr: { contains: term } }, { number: { contains: term.toUpperCase() } }] } } } }],
    },
    include: { children: { include: { student: { select: { name: true } } } } },
    take: 10,
  });
  return guardians.map((g) => ({ partyId: g.partyId!, name: g.name, children: g.children.map((c) => c.student.name.split(" ")[0]).join(", ") }));
}

/** What a family owes, oldest first, and where the money can go. */
export async function familyAccount(slug: string, partyId: string) {
  const s = await finance(slug, false);
  const party = await db.party.findFirst({ where: { id: partyId, orgId: s.ws.org.id } });
  const [docs, accounts] = await Promise.all([
    db.document.findMany({ where: { orgId: s.ws.org.id, partyId, kind: "fee", status: { in: ["issued", "partial"] } }, include: { student: { select: { name: true, nameAr: true } } }, orderBy: [{ dueDate: "asc" }, { date: "asc" }] }),
    db.account.findMany({ where: { orgId: s.ws.org.id, role: { in: ["bank", "cash"] } }, orderBy: { code: "asc" } }),
  ]);
  return {
    name: party ? (s.ws.viewer.prefs.locale === "ar" ? (party.nameAr ?? party.name) : party.name) : "",
    invoices: docs.map((d) => ({ id: d.id, number: d.number, student: d.student?.name ?? "", studentAr: d.student?.nameAr ?? null, due: d.dueDate?.toISOString() ?? null, open: d.total - d.paid, installment: d.installment })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, nameAr: a.nameAr, role: a.role })),
  };
}

const paymentInput = z.object({
  partyId: z.string(),
  date: ymd,
  amount: z.string().max(20),
  method: z.enum(["transfer", "card", "cash", "cheque"]),
  accountId: z.string(),
  reference: z.string().trim().max(60).default(""),
  allocations: z.array(z.object({ documentId: z.string(), amount: z.number().int().min(0) })).max(40),
});

export async function recordFeePayment(slug: string, raw: z.input<typeof paymentInput>): Promise<ActionResult<{ number: string; fullyPaid: string[] }>> {
  return attempt(async () => {
    const s = await finance(slug);
    const parsed = paymentInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    const amount = parseMoney(d.amount);
    if (!amount || amount <= 0) return { ok: false, error: "claims.amountInvalid", field: "amount" };
    const pay = await db.$transaction((tx) => recordPayment(tx, { orgId: s.ws.org.id, direction: "in", partyId: d.partyId, date: dohaNoon(d.date), amount, method: d.method, accountId: d.accountId, reference: d.reference || null, allocations: d.allocations.filter((a) => a.amount > 0), createdById: s.ws.viewer.id }));
    const paidDocs = await db.document.findMany({ where: { id: { in: d.allocations.map((a) => a.documentId) }, status: "paid" }, include: { student: true } });
    for (const doc of paidDocs) await indexDocument(db, doc.id);
    // Thank the parents who can see the parent view.
    const guardians = await db.guardian.findMany({ where: { orgId: s.ws.org.id, partyId: d.partyId, userId: { not: null } } });
    const party = await db.party.findUniqueOrThrow({ where: { id: d.partyId } });
    await notify(db, { orgId: s.ws.org.id, userIds: guardians.map((g) => g.userId!), kind: "fees.paid", title: `Payment received: ${qar(amount)}`, titleAr: `استلمنا دفعتك: ${qar(amount)}`, body: `Receipt ${pay.number}. Thank you.`, bodyAr: `الإيصال ${pay.number}. شكراً لك.`, href: "children" });
    await log(s, "fees.payment", "party", d.partyId, `recorded ${qar(amount)} from ${party.name} (${pay.number})`, `تسجيل دفعة ${qar(amount)} من ${party.nameAr ?? party.name}`, true);
    refresh();
    return { ok: true, number: pay.number, fullyPaid: [...new Set(paidDocs.map((x) => x.student?.name.split(" ")[0]).filter((x): x is string => !!x))] };
  });
}

export async function voidFeeInvoice(slug: string, id: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await finance(slug);
    const doc = await db.document.findFirst({ where: { id, orgId: s.ws.org.id, kind: "fee" } });
    if (!doc) return { ok: false, error: "empty.notFound" };
    await db.$transaction((tx) => voidDocument(tx, s.ws.org.id, id, s.ws.viewer.id));
    await indexDocument(db, id);
    await log(s, "fees.voided", "document", id, `voided ${doc.number}`, `إلغاء ${doc.number}`, true);
    refresh();
    return { ok: true };
  });
}

/** Remind families with overdue fees (in-app for parents with the parent view). */
export async function sendFeeReminders(slug: string): Promise<ActionResult<{ count: number; offline: number }>> {
  return attempt(async () => {
    const s = await finance(slug);
    const now = new Date();
    const overdue = await db.document.findMany({ where: { orgId: s.ws.org.id, kind: "fee", status: { in: ["issued", "partial"] }, dueDate: { lt: now }, student: { campusId: { in: s.campusIds } } }, include: { student: true }, orderBy: { dueDate: "asc" } });
    const byParty = new Map<string, typeof overdue>();
    for (const d of overdue) byParty.set(d.partyId, [...(byParty.get(d.partyId) ?? []), d]);
    let count = 0;
    let offline = 0;
    for (const [partyId, docs] of byParty) {
      const guardians = await db.guardian.findMany({ where: { orgId: s.ws.org.id, partyId, userId: { not: null } } });
      if (!guardians.length) {
        offline++;
        continue;
      }
      const amount = docs.reduce((x, d) => x + d.total - d.paid, 0);
      const oldest = docs[0].dueDate!;
      const names = [...new Set(docs.map((d) => d.student?.name.split(" ")[0]).filter(Boolean))].join(", ");
      const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Qatar" }).format(oldest);
      await notify(db, { orgId: s.ws.org.id, userIds: guardians.map((g) => g.userId!), kind: "fees.reminder", title: `Fee reminder: ${names}`, titleAr: `تذكير بالرسوم: ${names}`, body: `${qar(amount)} is overdue since ${date}. Please pay at the school office or by bank transfer.`, bodyAr: `مبلغ ${qar(amount)} متأخر منذ ${date}. يرجى السداد في مكتب المدرسة أو بالتحويل البنكي.`, href: "children" });
      count++;
    }
    await log(s, "fees.reminders", "organization", s.ws.org.id, `sent fee reminders to ${count} families`, `إرسال تذكيرات الرسوم إلى ${count} أسرة`);
    refresh();
    return { ok: true, count, offline };
  });
}
