import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, bizSettings } from "@/lib/biz";
import type { DocKind } from "@/lib/docs/ops";
import { DOC_PATH, displayStatus } from "@/lib/datasets/sales";
import { getThread } from "@/lib/thread";
import { DocView } from "@/components/business/doc-view";

/** One quotation, invoice, purchase order or bill. */
export async function DocPage({ slug, kind, id }: { slug: string; kind: Exclude<DocKind, "fee">; id: string }) {
  const ws = await bizPage(slug, kind === "po" ? ["finance.view", "inventory.manage"] : ["finance.view"]);
  await connection();
  const doc = await db.document.findFirst({
    where: { id, orgId: ws.org.id, kind },
    include: { party: true, lines: { orderBy: { sort: "asc" }, include: { item: { select: { sku: true, unit: true, kind: true } } } }, allocations: { include: { payment: true } } },
  });
  if (!doc) notFound();
  const sourceTypes = kind === "po" ? ["receipt"] : [kind];
  const [source, derived, thread, entries, accounts] = await Promise.all([
    doc.sourceId ? db.document.findFirst({ where: { id: doc.sourceId, orgId: ws.org.id }, select: { id: true, kind: true, number: true } }) : null,
    db.document.findMany({ where: { orgId: ws.org.id, sourceId: doc.id }, select: { id: true, kind: true, number: true, status: true } }),
    getThread(ws.org.id, "document", doc.id),
    ws.can("finance.view")
      ? db.journalEntry.findMany({ where: { orgId: ws.org.id, sourceType: { in: [...sourceTypes, "payment"] }, sourceId: { in: [doc.id, ...doc.allocations.map((a) => a.paymentId)] } }, orderBy: { createdAt: "asc" }, include: { lines: { include: { account: true } } } })
      : Promise.resolve([]),
    db.account.findMany({ where: { orgId: ws.org.id }, select: { id: true, code: true, name: true, nameAr: true } }),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a]));
  const s = bizSettings(ws.org).sales ?? {};
  const campus = ws.org.campuses.find((c) => c.id === doc.campusId);
  const now = new Date();
  return (
    <DocView
      slug={slug}
      now={now.toISOString()}
      viewerId={ws.viewer.id}
      doc={{
        id: doc.id,
        kind,
        number: doc.number,
        status: doc.status,
        shownStatus: displayStatus(doc, now),
        date: doc.date.toISOString(),
        dueDate: doc.dueDate?.toISOString() ?? null,
        reference: doc.reference,
        notes: doc.notes,
        terms: doc.terms,
        subtotal: doc.subtotal,
        discount: doc.discount,
        total: doc.total,
        paid: doc.paid,
        campus: campus ? { id: campus.id, name: campus.name, nameAr: campus.nameAr } : null,
        party: { id: doc.party.id, name: doc.party.name, nameAr: doc.party.nameAr, address: doc.party.address, addressAr: doc.party.addressAr, phone: doc.party.phone, email: doc.party.email, crNumber: doc.party.crNumber },
        lines: doc.lines.map((l) => ({ id: l.id, sku: l.item?.sku ?? null, unit: l.item?.unit ?? null, product: l.item?.kind === "product", description: l.description, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, amount: l.amount, received: l.received, account: l.accountId ? (accountName.get(l.accountId) ?? null) : null })),
        payments: doc.allocations.map((a) => ({ id: a.paymentId, number: a.payment.number, date: a.payment.date.toISOString(), amount: a.amount, method: a.payment.method, voided: !!a.payment.voidedAt })),
      }}
      org={{ name: ws.org.name, nameAr: ws.org.nameAr, address: ws.org.address, addressAr: ws.org.addressAr, phone: ws.org.phone, email: ws.org.email, crNumber: ws.org.crNumber, logoUrl: ws.org.logoPath ? `/api/w/${slug}/logo?v=${ws.org.updatedAt.getTime()}` : null, bankName: s.bankName ?? null, iban: s.iban ?? null }}
      source={source ? { id: source.id, number: source.number, href: `${DOC_PATH[source.kind as DocKind]}/${source.id}` } : null}
      derived={derived.map((d) => ({ id: d.id, number: d.number, status: d.status, href: `${DOC_PATH[d.kind as DocKind]}/${d.id}` }))}
      entries={entries.map((e) => ({ id: e.id, number: e.number, date: e.date.toISOString(), memo: e.memo, reversed: !!e.reversedAt || !!e.reversesId, lines: e.lines.map((l) => ({ code: l.account.code, name: l.account.name, nameAr: l.account.nameAr, debit: l.debit, credit: l.credit })) }))}
      campuses={ws.org.campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }))}
      thread={thread}
      canManage={ws.can("finance.manage")}
      canReceive={ws.can("inventory.manage")}
    />
  );
}
