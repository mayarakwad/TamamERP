import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { installmentDue } from "@/lib/school/settings";
import { installmentKey } from "@/lib/school/fee-ops";
import { FeesOverview } from "@/components/school/fees-overview";

export const metadata: Metadata = { title: "Fees" };

export default async function FeesPage({ params }: PageProps<"/w/[slug]/fees">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["finance.view", "school.manage"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const now = new Date();
  const scope = { orgId: s.ws.org.id, kind: "fee", status: { notIn: ["draft", "void"] }, student: { campusId: { in: s.campusIds } } };
  const [docs, students] = await Promise.all([
    db.document.findMany({ where: { ...scope, installment: { startsWith: `${s.year.name}/` } }, select: { id: true, total: true, paid: true, discount: true, dueDate: true, installment: true, partyId: true, campusId: true, status: true, student: { select: { name: true, nameAr: true } } } }),
    db.student.count({ where: { orgId: s.ws.org.id, status: "active", campusId: { in: s.campusIds } } }),
  ]);
  const open = docs.filter((d) => d.status === "issued" || d.status === "partial");
  const overdue = open.filter((d) => d.dueDate && d.dueDate < now);
  const startYear = s.year.startDate.getUTCFullYear();
  const installments = s.settings.installments.map((inst, i) => {
    const key = installmentKey(s.year.name, i);
    const mine = docs.filter((d) => d.installment === key);
    return { index: i, label: pick(locale, inst.label, inst.labelAr), due: installmentDue(inst, startYear).toISOString(), count: mine.length, billed: mine.reduce((x, d) => x + d.total, 0), paid: mine.reduce((x, d) => x + d.paid, 0) };
  });
  const campuses = s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)).map((c) => {
    const mine = docs.filter((d) => d.campusId === c.id);
    return { id: c.id, name: pick(locale, c.name, c.nameAr), color: c.color, billed: mine.reduce((x, d) => x + d.total, 0), paid: mine.reduce((x, d) => x + d.paid, 0) };
  });
  const byParty = new Map<string, { amount: number; oldest: Date; children: Set<string> }>();
  for (const d of overdue) {
    const cur = byParty.get(d.partyId) ?? { amount: 0, oldest: d.dueDate!, children: new Set<string>() };
    cur.amount += d.total - d.paid;
    if (d.dueDate! < cur.oldest) cur.oldest = d.dueDate!;
    if (d.student) cur.children.add(pick(locale, d.student.name, d.student.nameAr).split(" ")[0]);
    byParty.set(d.partyId, cur);
  }
  const top = [...byParty.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);
  const parties = new Map((await db.party.findMany({ where: { id: { in: top.map(([id]) => id) } } })).map((p) => [p.id, p]));
  const guardianByParty = new Map((await db.guardian.findMany({ where: { partyId: { in: top.map(([id]) => id) } }, select: { id: true, partyId: true, userId: true } })).map((g) => [g.partyId!, g]));
  return (
    <FeesOverview
      slug={slug}
      yearId={s.year.id}
      yearName={s.year.name}
      students={students}
      totals={{ billed: docs.reduce((x, d) => x + d.total, 0), collected: docs.reduce((x, d) => x + d.paid, 0), outstanding: open.reduce((x, d) => x + d.total - d.paid, 0), overdue: overdue.reduce((x, d) => x + d.total - d.paid, 0), overdueFamilies: byParty.size, discounts: docs.reduce((x, d) => x + d.discount, 0) }}
      installments={installments}
      campuses={campuses.length > 1 ? campuses : []}
      top={top.map(([id, v]) => ({ partyId: id, guardianId: guardianByParty.get(id)?.id ?? null, online: !!guardianByParty.get(id)?.userId, name: pick(locale, parties.get(id)?.name ?? "", parties.get(id)?.nameAr), children: [...v.children].join(", "), amount: v.amount, oldest: v.oldest.toISOString() }))}
      canManage={s.ws.can("finance.manage") || s.ws.can("school.manage")}
    />
  );
}
