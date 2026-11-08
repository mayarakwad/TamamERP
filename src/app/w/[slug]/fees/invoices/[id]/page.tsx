import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { FeeInvoiceView } from "@/components/school/fee-invoice";

export const metadata: Metadata = { title: "Fee invoice" };

export default async function FeeInvoicePage({ params }: PageProps<"/w/[slug]/fees/invoices/[id]">) {
  const { slug, id } = await params;
  const s = await schoolPage(slug, ["finance.view", "school.manage"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const d = await db.document.findFirst({
    where: { id, orgId: s.ws.org.id, kind: "fee", student: { campusId: { in: s.campusIds } } },
    include: { party: true, lines: { orderBy: { sort: "asc" } }, student: { include: { grade: true, section: true } }, allocations: { include: { payment: true } } },
  });
  if (!d) notFound();
  const guardian = await db.guardian.findFirst({ where: { partyId: d.partyId }, select: { id: true } });
  const now = new Date().getTime();
  return (
    <FeeInvoiceView
      slug={slug}
      doc={{
        id: d.id,
        number: d.number,
        date: d.date.toISOString(),
        due: d.dueDate?.toISOString() ?? null,
        status: d.status !== "paid" && d.status !== "void" && d.dueDate && d.dueDate.getTime() < now ? "overdue" : d.status,
        rawStatus: d.status,
        total: d.total,
        paid: d.paid,
        subtotal: d.subtotal,
        discount: d.discount,
        family: pick(locale, d.party.name, d.party.nameAr),
        partyId: d.partyId,
        guardianId: guardian?.id ?? null,
        student: d.student ? { id: d.student.id, name: pick(locale, d.student.name, d.student.nameAr), number: d.student.number, className: d.student.section ? sectionName(locale, d.student.grade, d.student.section.name) : pick(locale, d.student.grade.name, d.student.grade.nameAr) } : null,
        lines: d.lines.map((l) => ({ id: l.id, description: l.description, gross: l.unitPrice, discountPct: l.discountPct, amount: l.amount })),
        payments: d.allocations.filter((a) => !a.payment.voidedAt).map((a) => ({ number: a.payment.number, date: a.payment.date.toISOString(), method: a.payment.method, amount: a.amount })),
      }}
      canManage={s.ws.can("finance.manage") || s.ws.can("school.manage")}
    />
  );
}
