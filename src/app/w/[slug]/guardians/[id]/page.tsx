import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { GuardianDetail } from "@/components/school/guardian-detail";

export const metadata: Metadata = { title: "Parent" };

export default async function GuardianPage({ params }: PageProps<"/w/[slug]/guardians/[id]">) {
  const { slug, id } = await params;
  const s = await schoolPage(slug, ["school.manage", "finance.view"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const g = await db.guardian.findFirst({
    where: { id, orgId: s.ws.org.id },
    include: { children: { include: { student: { include: { grade: true, section: true, campus: true } } }, orderBy: { student: { dob: "asc" } } } },
  });
  if (!g) notFound();
  const [docs, user, invite] = await Promise.all([
    g.partyId ? db.document.findMany({ where: { orgId: s.ws.org.id, partyId: g.partyId, kind: "fee", status: { not: "draft" } }, include: { student: { select: { name: true, nameAr: true } } }, orderBy: { date: "desc" }, take: 40 }) : Promise.resolve([]),
    g.userId ? db.user.findUnique({ where: { id: g.userId }, select: { email: true, lastLoginAt: true } }) : Promise.resolve(null),
    g.email ? db.invitation.findFirst({ where: { orgId: s.ws.org.id, email: g.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }) : Promise.resolve(null),
  ]);
  const now = new Date().getTime();
  return (
    <GuardianDetail
      slug={slug}
      guardian={{ id: g.id, name: g.name, nameAr: g.nameAr, phone: g.phone ?? "", email: g.email ?? "", qid: g.qid ?? "", employer: g.employer ?? "", address: g.address ?? "", addressAr: g.addressAr ?? "", partyId: g.partyId }}
      kids={g.children.map((c) => ({
        id: c.studentId,
        name: pick(locale, c.student.name, c.student.nameAr),
        plainName: c.student.name,
        color: c.student.avatarColor,
        className: c.student.section ? sectionName(locale, c.student.grade, c.student.section.name) : pick(locale, c.student.grade.name, c.student.grade.nameAr),
        campus: pick(locale, c.student.campus.name, c.student.campus.nameAr),
        relation: c.relation,
        primary: c.primary,
        status: c.student.status,
      }))}
      invoices={docs.map((d) => ({ id: d.id, number: d.number, date: d.date.toISOString(), due: d.dueDate?.toISOString() ?? null, total: d.total, paid: d.paid, student: d.student ? pick(locale, d.student.name, d.student.nameAr).split(" ")[0] : "", status: d.status !== "paid" && d.status !== "void" && d.dueDate && d.dueDate.getTime() < now ? "overdue" : d.status }))}
      access={user ? { state: "on", email: user.email, lastLoginAt: user.lastLoginAt?.toISOString() ?? null } : invite ? { state: "invited", email: invite.email, lastLoginAt: null } : { state: "off", email: null, lastLoginAt: null }}
      canManage={s.ws.can("school.manage")}
      canInvite={s.ws.can("members.manage")}
      canMoney={s.ws.can("finance.view") || s.ws.can("school.manage")}
    />
  );
}
