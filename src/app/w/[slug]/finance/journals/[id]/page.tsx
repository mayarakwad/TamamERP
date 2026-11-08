import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { bizPage } from "@/lib/biz";
import { JournalEntryView } from "@/components/business/accounting";

export const metadata: Metadata = { title: "Journal entry" };

const DOC_PATH: Record<string, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" };

export default async function JournalEntryPage({ params }: PageProps<"/w/[slug]/finance/journals/[id]">) {
  const { slug, id } = await params;
  const ws = await bizPage(slug, ["finance.view"], ["business", "school"]);
  const e = await db.journalEntry.findFirst({ where: { id, orgId: ws.org.id }, include: { lines: { include: { account: true }, orderBy: { debit: "desc" } } } });
  if (!e) notFound();
  let sourceHref: string | null = null;
  if (e.sourceId && ["invoice", "bill", "receipt"].includes(e.sourceType)) {
    const d = await db.document.findUnique({ where: { id: e.sourceId }, select: { kind: true } });
    if (d) sourceHref = `${DOC_PATH[d.kind]}/${e.sourceId}`;
  } else if (e.sourceId && e.sourceType === "claim") sourceHref = `claims/${e.sourceId}`;
  else if (e.sourceId && e.sourceType === "payroll") sourceHref = `hr/payroll/${e.sourceId}`;
  else if (e.sourceId && e.sourceType === "payment") {
    const pay = await db.payment.findUnique({ where: { id: e.sourceId }, select: { direction: true } });
    if (pay) sourceHref = pay.direction === "in" ? "sales/payments" : "purchases/payments";
  }
  const [reverses, creator] = await Promise.all([e.reversesId ? db.journalEntry.findUnique({ where: { id: e.reversesId }, select: { number: true } }) : null, e.createdById ? db.user.findUnique({ where: { id: e.createdById }, select: { name: true } }) : null]);
  return (
    <JournalEntryView
      slug={slug}
      entry={{
        id: e.id,
        number: e.number,
        date: e.date.toISOString(),
        memo: e.memo,
        source: e.sourceType,
        sourceHref,
        reversed: !!e.reversedAt,
        reverses: reverses?.number ?? null,
        createdBy: creator?.name ?? null,
        lines: e.lines.map((l) => ({ id: l.id, code: l.account.code, name: l.account.name, nameAr: l.account.nameAr, accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo })),
      }}
      canReverse={ws.can("finance.manage") && ["manual", "opening"].includes(e.sourceType) && !e.reversedAt && !e.reversesId}
    />
  );
}
