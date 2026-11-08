import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { announcementScope } from "@/lib/school/announcements";
import { AnnouncementsView } from "@/components/school/announcements";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ params }: PageProps<"/w/[slug]/announcements">) {
  const { slug } = await params;
  const s = await schoolPage(slug);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const rows = await db.announcement.findMany({ where: await announcementScope(s), orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }], take: 100 });
  const authors = new Map((await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } }, select: { id: true, name: true, nameAr: true } })).map((u) => [u.id, pick(locale, u.name, u.nameAr)]));
  const grades = await db.grade.findMany({ where: { orgId: s.ws.org.id }, orderBy: { level: "asc" } });
  const campus = new Map(s.ws.org.campuses.map((c) => [c.id, pick(locale, c.name, c.nameAr)]));
  const grade = new Map(grades.map((g) => [g.id, pick(locale, g.name, g.nameAr)]));
  return (
    <AnnouncementsView
      slug={slug}
      canManage={s.ws.can("school.manage")}
      items={rows.map((a) => ({
        id: a.id,
        title: pick(locale, a.title, a.titleAr),
        body: pick(locale, a.body, a.bodyAr),
        audience: a.audience,
        campus: a.campusId ? (campus.get(a.campusId) ?? null) : null,
        grade: a.gradeId ? (grade.get(a.gradeId) ?? null) : null,
        pinned: a.pinned,
        author: authors.get(a.authorId) ?? "",
        publishedAt: a.publishedAt.toISOString(),
      }))}
      campuses={s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)).map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
      grades={grades.map((g) => ({ id: g.id, name: pick(locale, g.name, g.nameAr) }))}
    />
  );
}
