import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { RouteDetail } from "@/components/school/transport";

export const metadata: Metadata = { title: "Bus route" };

export default async function RoutePage({ params }: PageProps<"/w/[slug]/transport/[id]">) {
  const { slug, id } = await params;
  const s = await schoolPage(slug, ["school.manage", "transport.manage"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const r = await db.busRoute.findFirst({
    where: { id, orgId: s.ws.org.id, campusId: { in: s.campusIds } },
    include: {
      campus: true,
      stops: {
        orderBy: { sort: "asc" },
        include: { students: { where: { status: "active" }, include: { grade: true, section: true, guardians: { where: { primary: true }, include: { guardian: true }, take: 1 } }, orderBy: { name: "asc" } } },
      },
    },
  });
  if (!r) notFound();
  return (
    <RouteDetail
      slug={slug}
      canManage={s.ws.can("transport.manage") || s.ws.can("school.manage")}
      campuses={s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)).map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
      route={{
        id: r.id,
        code: r.code,
        name: pick(locale, r.name, r.nameAr),
        rawName: r.name,
        rawNameAr: r.nameAr,
        campusId: r.campusId,
        campus: pick(locale, r.campus.name, r.campus.nameAr),
        color: r.color,
        driverName: r.driverName,
        driverPhone: r.driverPhone,
        attendantName: r.attendantName,
        attendantPhone: r.attendantPhone,
        plate: r.plate,
        capacity: r.capacity,
        annualFee: r.annualFee,
        riders: r.stops.reduce((x, st) => x + st.students.length, 0),
        stops: r.stops.map((st) => ({
          id: st.id,
          name: pick(locale, st.name, st.nameAr),
          rawName: st.name,
          rawNameAr: st.nameAr,
          pickup: st.pickup,
          dropoff: st.dropoff,
          riders: st.students.length,
          students: st.students.map((x) => ({ id: x.id, name: pick(locale, x.name, x.nameAr), plainName: x.name, color: x.avatarColor, className: x.section ? sectionName(locale, x.grade, x.section.name) : pick(locale, x.grade.name, x.grade.nameAr), phone: x.guardians[0]?.guardian.phone ?? null, medical: !!x.medical })),
        })),
      }}
    />
  );
}
