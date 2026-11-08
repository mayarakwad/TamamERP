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

const DOC_HREF: Record<string, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills", fee: "fees/invoices" };

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

export async function indexStudent(db: Db, id: string) {
  const st = await db.student.findUnique({ where: { id }, include: { grade: true, section: true, guardians: { include: { guardian: true } } } });
  if (!st || st.status === "graduated") return removeFromIndex(db, "student", id);
  await upsert(db, {
    orgId: st.orgId,
    entityType: "student",
    entityId: st.id,
    title: `${st.name} · ${st.number}`,
    subtitle: [st.grade.name, st.section?.name, st.status !== "active" ? st.status : null].filter(Boolean).join(" · "),
    href: `students/${st.id}`,
    parts: [st.nameAr, st.qid, ...st.guardians.flatMap((g) => [g.guardian.name, g.guardian.nameAr, g.guardian.phone])],
    // Teachers find only students in their own classes.
    restrictedTo: st.sectionId,
  });
}

export async function indexGuardian(db: Db, id: string) {
  const g = await db.guardian.findUnique({ where: { id }, include: { children: { include: { student: true } } } });
  if (!g) return removeFromIndex(db, "guardian", id);
  await upsert(db, {
    orgId: g.orgId,
    entityType: "guardian",
    entityId: g.id,
    title: g.name,
    subtitle: g.children.map((c) => c.student.name.split(" ")[0]).join(", "),
    href: `guardians/${g.id}`,
    parts: [g.nameAr, g.phone, g.email, g.qid],
  });
}

export async function indexApplication(db: Db, id: string) {
  const a = await db.application.findUnique({ where: { id }, include: { grade: true } });
  if (!a) return removeFromIndex(db, "application", id);
  await upsert(db, {
    orgId: a.orgId,
    entityType: "application",
    entityId: a.id,
    title: `${a.childName} · ${a.number}`,
    subtitle: `${a.grade.name} · ${a.stage}`,
    href: `admissions?open=${a.id}`,
    parts: [a.childNameAr, a.guardianName, a.guardianNameAr, a.guardianPhone, a.guardianEmail],
  });
}

export async function indexBook(db: Db, id: string) {
  const b = await db.book.findUnique({ where: { id } });
  if (!b) return removeFromIndex(db, "book", id);
  await upsert(db, { orgId: b.orgId, entityType: "book", entityId: b.id, title: b.title, subtitle: b.author, href: `library?book=${b.id}`, parts: [b.isbn, b.category] });
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
  for (const st of await db.student.findMany({ where: { orgId }, select: { id: true } })) await indexStudent(db, st.id);
  for (const g of await db.guardian.findMany({ where: { orgId }, select: { id: true } })) await indexGuardian(db, g.id);
  for (const a of await db.application.findMany({ where: { orgId }, select: { id: true } })) await indexApplication(db, a.id);
  for (const b of await db.book.findMany({ where: { orgId }, select: { id: true } })) await indexBook(db, b.id);
}
