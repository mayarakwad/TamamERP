import "server-only";
import { db } from "../db";
import { pick, type Locale } from "../i18n";
import { sectionName } from "./settings";
import type { School } from "./scope";

export interface ClassOption {
  id: string;
  label: string;
  campusId: string;
  campus: string;
  level: number;
  grade: string;
  count: number;
  capacity: number;
}

export interface StopOption {
  id: string;
  label: string;
  route: string;
  campusId: string;
}

/** Classes in scope this year, for pickers. */
export async function classOptions(s: School, locale: Locale): Promise<ClassOption[]> {
  const rows = await db.section.findMany({
    where: { orgId: s.ws.org.id, yearId: s.year.id, campusId: { in: s.campusIds } },
    include: { grade: true, campus: true, _count: { select: { students: { where: { status: "active" } } } } },
    orderBy: [{ grade: { level: "asc" } }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    label: sectionName(locale, r.grade, r.name),
    campusId: r.campusId,
    campus: pick(locale, r.campus.name, r.campus.nameAr),
    level: r.grade.level,
    grade: pick(locale, r.grade.name, r.grade.nameAr),
    count: r._count.students,
    capacity: r.capacity,
  }));
}

export async function stopOptions(s: School, locale: Locale): Promise<StopOption[]> {
  const routes = await db.busRoute.findMany({ where: { orgId: s.ws.org.id, campusId: { in: s.campusIds } }, include: { stops: { orderBy: { sort: "asc" } } }, orderBy: { code: "asc" } });
  return routes
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .flatMap((r) => r.stops.map((st) => ({ id: st.id, label: `${pick(locale, st.name, st.nameAr)}${st.pickup ? ` · ${st.pickup}` : ""}`, route: `${r.code} · ${pick(locale, r.name, r.nameAr)}`, campusId: r.campusId })));
}

