import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { TransportView } from "@/components/school/transport";

export const metadata: Metadata = { title: "Transport" };

export default async function TransportPage({ params }: PageProps<"/w/[slug]/transport">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.manage", "transport.manage"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const routes = await db.busRoute.findMany({
    where: { orgId: s.ws.org.id, campusId: { in: s.campusIds } },
    include: { campus: true, stops: { orderBy: { sort: "asc" }, include: { _count: { select: { students: { where: { status: "active" } } } } } } },
  });
  routes.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  return (
    <TransportView
      slug={slug}
      canManage={s.ws.can("transport.manage") || s.ws.can("school.manage")}
      campuses={s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)).map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
      routes={routes.map((r) => ({
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
        riders: r.stops.reduce((x, st) => x + st._count.students, 0),
        stops: r.stops.map((st) => ({ id: st.id, name: pick(locale, st.name, st.nameAr), rawName: st.name, rawNameAr: st.nameAr, pickup: st.pickup, dropoff: st.dropoff, riders: st._count.students })),
      }))}
    />
  );
}
