import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bizPage, bizSettings } from "@/lib/biz";
import type { DocKind } from "@/lib/docs/ops";
import { DOC_PATH } from "@/lib/datasets/sales";
import { DocEditor } from "@/components/business/doc-editor";

/** New or edit page for a quotation, invoice, purchase order or bill. */
export async function EditorPage({ slug, kind, id, sp }: { slug: string; kind: DocKind; id?: string; sp: Record<string, string | string[] | undefined> }) {
  const ws = await bizPage(slug, ["finance.manage"]);
  const sales = kind === "quote" || kind === "invoice";
  const doc = id ? await db.document.findFirst({ where: { id, orgId: ws.org.id, kind }, include: { lines: { orderBy: { sort: "asc" } } } }) : null;
  if (id && !doc) notFound();
  const editable = !doc || doc.status === "draft" || ((kind === "quote" || kind === "po") && doc.status === "sent");
  if (!editable) redirect(`/w/${slug}/${DOC_PATH[kind]}/${id}`);

  const [parties, open, items, accounts] = await Promise.all([
    db.party.findMany({ where: { orgId: ws.org.id, archived: false, ...(sales ? { isCustomer: true } : { isSupplier: true }) }, orderBy: { name: "asc" } }),
    db.document.groupBy({ by: ["partyId"], where: { orgId: ws.org.id, kind: sales ? "invoice" : "bill", status: { in: ["issued", "posted", "partial"] } }, _sum: { total: true, paid: true } }),
    db.item.findMany({ where: { orgId: ws.org.id, archived: false }, orderBy: [{ category: "asc" }, { name: "asc" }], include: { levels: true } }),
    kind === "bill" || kind === "po"
      ? db.account.findMany({ where: { orgId: ws.org.id, archived: false, OR: [{ type: "expense" }, { code: { startsWith: "15" } }, { code: { startsWith: "14" } }] }, orderBy: { code: "asc" } })
      : Promise.resolve([]),
  ]);
  const openBy = new Map(open.map((o) => [o.partyId, (o._sum.total ?? 0) - (o._sum.paid ?? 0)]));
  const settings = bizSettings(ws.org).sales ?? {};
  const presetParty = typeof sp.party === "string" ? sp.party : null;

  return (
    <DocEditor
      slug={slug}
      kind={kind}
      initial={
        doc
          ? {
              id: doc.id,
              number: doc.number,
              partyId: doc.partyId,
              campusId: doc.campusId,
              date: doc.date.toISOString(),
              dueDate: doc.dueDate?.toISOString() ?? null,
              reference: doc.reference,
              notes: doc.notes,
              terms: doc.terms,
              lines: doc.lines.map((l) => ({ itemId: l.itemId, description: l.description, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, accountId: l.accountId })),
            }
          : undefined
      }
      parties={parties.map((p) => ({ id: p.id, name: p.name, nameAr: p.nameAr, phone: p.phone, paymentTerms: p.paymentTerms, creditLimit: p.creditLimit, open: openBy.get(p.id) ?? 0 }))}
      items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, nameAr: i.nameAr, kind: i.kind, unit: i.unit, salePrice: i.salePrice, purchasePrice: i.purchasePrice || i.avgCost, onHand: i.levels.reduce((s, l) => s + l.qty, 0) }))}
      campuses={ws.org.campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }))}
      accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, nameAr: a.nameAr }))}
      defaults={{ notes: kind === "invoice" ? (settings.invoiceNotes ?? "") : "", terms: kind === "invoice" ? (settings.invoiceTerms ?? "") : kind === "quote" ? (settings.quoteTerms ?? "") : "", quoteDays: 15 }}
      presetPartyId={presetParty}
      canAddParty={ws.can("finance.manage")}
    />
  );
}
