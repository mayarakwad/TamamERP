// Keeps the search index (SearchIndex table) in step with records.
// No server-only imports: the seed script uses it too.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { normalizeSearch } from "../text";

type Db = PrismaClient | Prisma.TransactionClient;

interface Doc {
  orgId: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  href: string;
  parts: (string | null | undefined)[];
  restrictedTo?: string | null;
}

async function upsert(db: Db, d: Doc) {
  const text = normalizeSearch([d.title, d.subtitle, ...d.parts].filter(Boolean).join(" "));
  const data = { orgId: d.orgId, title: d.title, subtitle: d.subtitle ?? null, href: d.href, text, restrictedTo: d.restrictedTo ?? null };
  await db.searchIndex.upsert({
    where: { entityType_entityId: { entityType: d.entityType, entityId: d.entityId } },
    create: { entityType: d.entityType, entityId: d.entityId, ...data },
    update: data,
  });
}

export async function removeFromIndex(db: Db, entityType: string, entityId: string) {
  await db.searchIndex.deleteMany({ where: { entityType, entityId } });
}

export async function indexClaim(db: Db, id: string) {
  const c = await db.claim.findUnique({ where: { id }, include: { category: true, submittedBy: true } });
  if (!c || c.deletedAt) return removeFromIndex(db, "claim", id);
  await upsert(db, {
    orgId: c.orgId,
    entityType: "claim",
    entityId: c.id,
    title: `${c.number} · ${c.merchant}`,
    subtitle: `${c.submittedBy.name} · ${c.category.name} · ${(c.amount / 100).toFixed(2)}`,
    href: `claims/${c.id}`,
    parts: [c.note, c.category.nameAr, c.submittedBy.nameAr, String(c.amount / 100)],
    restrictedTo: c.submittedById,
  });
}

export async function indexBill(db: Db, id: string) {
  const b = await db.recurringBill.findUnique({ where: { id } });
  if (!b) return removeFromIndex(db, "bill", id);
  await upsert(db, { orgId: b.orgId, entityType: "bill", entityId: b.id, title: b.name, subtitle: b.provider, href: `bills?bill=${b.id}`, parts: [b.nameAr, b.notes] });
}

export async function indexPossession(db: Db, id: string) {
  const p = await db.possession.findUnique({ where: { id } });
  if (!p) return removeFromIndex(db, "possession", id);
  await upsert(db, {
    orgId: p.orgId,
    entityType: "possession",
    entityId: p.id,
    title: p.name,
    subtitle: [p.brand, p.model, p.room].filter(Boolean).join(" · "),
    href: `things?item=${p.id}`,
    parts: [p.nameAr, p.serial, p.store, p.category, p.notes],
  });
}

export async function indexMember(db: Db, membershipId: string) {
  const m = await db.membership.findUnique({ where: { id: membershipId }, include: { user: true } });
  if (!m) return removeFromIndex(db, "member", membershipId);
  await upsert(db, {
    orgId: m.orgId,
    entityType: "member",
    entityId: m.id,
    title: m.user.name,
    subtitle: m.title ?? m.role,
    href: `settings/members`,
    parts: [m.user.nameAr, m.user.email, m.user.phone, m.titleAr],
  });
}

const DOC_HREF: Record<string, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" };

export async function indexParty(db: Db, id: string) {
  const p = await db.party.findUnique({ where: { id } });
  if (!p || p.archived) return removeFromIndex(db, "party", id);
  await upsert(db, {
    orgId: p.orgId,
    entityType: "party",
    entityId: p.id,
    title: p.name,
    subtitle: [p.isCustomer && "Customer", p.isSupplier && "Supplier", p.contactName, p.phone].filter(Boolean).join(" · "),
    href: `${p.isCustomer ? "sales/customers" : "purchases/suppliers"}/${p.id}`,
    parts: [p.nameAr, p.email, p.crNumber, p.addressAr, p.address],
  });
}

export async function indexItem(db: Db, id: string) {
  const i = await db.item.findUnique({ where: { id } });
  if (!i || i.archived) return removeFromIndex(db, "item", id);
  await upsert(db, { orgId: i.orgId, entityType: "item", entityId: i.id, title: `${i.sku} · ${i.name}`, subtitle: i.category, href: `inventory/items/${i.id}`, parts: [i.nameAr, i.barcode] });
}

export async function indexDocument(db: Db, id: string) {
  const d = await db.document.findUnique({ where: { id }, include: { party: true } });
  if (!d) return removeFromIndex(db, "document", id);
  await upsert(db, {
    orgId: d.orgId,
    entityType: "document",
    entityId: d.id,
    title: `${d.number} · ${d.party.name}`,
    subtitle: `${(d.total / 100).toFixed(2)} · ${d.status}`,
    href: `${DOC_HREF[d.kind]}/${d.id}`,
    parts: [d.party.nameAr, d.reference, d.kind],
    // Purchase orders are visible to storekeepers too; everything else needs finance access.
    restrictedTo: d.kind,
  });
}

export async function indexEmployee(db: Db, id: string) {
  const e = await db.employee.findUnique({ where: { id } });
  if (!e) return removeFromIndex(db, "employee", id);
  await upsert(db, {
    orgId: e.orgId,
    entityType: "employee",
    entityId: e.id,
    title: `${e.name} · ${e.number}`,
    subtitle: [e.jobTitle, e.department].filter(Boolean).join(" · "),
    href: `hr/employees/${e.id}`,
    parts: [e.nameAr, e.jobTitleAr, e.qid, e.phone, e.email],
  });
}

/** Rebuild the whole index for one workspace (seed, restore, duplicate). */
export async function reindexOrg(db: Db, orgId: string) {
  await db.searchIndex.deleteMany({ where: { orgId } });
  for (const c of await db.claim.findMany({ where: { orgId, deletedAt: null }, select: { id: true } })) await indexClaim(db, c.id);
  for (const b of await db.recurringBill.findMany({ where: { orgId }, select: { id: true } })) await indexBill(db, b.id);
  for (const p of await db.possession.findMany({ where: { orgId }, select: { id: true } })) await indexPossession(db, p.id);
  for (const m of await db.membership.findMany({ where: { orgId }, select: { id: true } })) await indexMember(db, m.id);
  for (const p of await db.party.findMany({ where: { orgId, archived: false }, select: { id: true } })) await indexParty(db, p.id);
  for (const i of await db.item.findMany({ where: { orgId, archived: false }, select: { id: true } })) await indexItem(db, i.id);
  for (const d of await db.document.findMany({ where: { orgId }, select: { id: true } })) await indexDocument(db, d.id);
  for (const e of await db.employee.findMany({ where: { orgId }, select: { id: true } })) await indexEmployee(db, e.id);
}
