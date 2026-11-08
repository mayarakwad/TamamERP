import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "../db";
import { getWorkspace, type Workspace } from "../auth/dal";
import type { Permission } from "../rbac";
import { schoolSettings } from "./settings";
import { ensureSchoolDefaults } from "./defaults";
import type { Prisma } from "@/generated/prisma/client";

// Who sees what in a school: which campuses (a principal may be tied to one),
// which classes a teacher teaches, which children belong to a parent. Pages,
// datasets and actions all ask here, so the rules live in one place.

export const campusCookie = (orgId: string) => `tamam_campus_${orgId}`;

export const getSchool = cache(async (slug: string) => {
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "school") notFound();
  let year = await db.academicYear.findFirst({ where: { orgId: ws.org.id, current: true }, include: { terms: { orderBy: { sort: "asc" } } } });
  if (!year) {
    await ensureSchoolDefaults(db, ws.org.id);
    year = await db.academicYear.findFirst({ where: { orgId: ws.org.id }, orderBy: { startDate: "desc" }, include: { terms: { orderBy: { sort: "asc" } } } });
  }
  if (!year) notFound();
  const now = new Date();
  const term = year.terms.find((t) => now >= t.startDate && now <= new Date(t.endDate.getTime() + 86400_000)) ?? [...year.terms].reverse().find((t) => t.startDate <= now) ?? year.terms[0];

  // Campus scope: a membership tied to a campus only ever sees that campus.
  const locked = ws.membership.campusId;
  const picked = locked ? null : (await cookies()).get(campusCookie(ws.org.id))?.value;
  const selected = locked ?? (picked && ws.org.campuses.some((c) => c.id === picked) ? picked : null);
  const campusIds = selected ? [selected] : ws.org.campuses.map((c) => c.id);

  // A teacher (or anyone on staff) is linked through their employee record.
  const employee = await db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id, status: "active" } });
  let teachSectionIds: string[] = [];
  let homeroomIds: string[] = [];
  if (employee) {
    const [home, teach] = await Promise.all([
      db.section.findMany({ where: { yearId: year.id, homeroomId: employee.id }, select: { id: true } }),
      db.teachingAssignment.findMany({ where: { teacherId: employee.id, section: { yearId: year.id } }, select: { sectionId: true } }),
    ]);
    homeroomIds = home.map((s) => s.id);
    teachSectionIds = [...new Set([...homeroomIds, ...teach.map((t) => t.sectionId)])];
  }

  // A parent is linked through their guardian record(s).
  let childIds: string[] = [];
  let guardianIds: string[] = [];
  if (ws.can("school.parent")) {
    const gs = await db.guardian.findMany({ where: { orgId: ws.org.id, userId: ws.viewer.id }, include: { children: { select: { studentId: true } } } });
    guardianIds = gs.map((g) => g.id);
    childIds = [...new Set(gs.flatMap((g) => g.children.map((c) => c.studentId)))];
  }

  return {
    ws,
    settings: schoolSettings(ws.org),
    year,
    term,
    campusIds,
    campus: selected ? ws.org.campuses.find((c) => c.id === selected)! : null,
    locked: !!locked,
    employee,
    teachSectionIds,
    homeroomIds,
    childIds,
    guardianIds,
  };
});

export type School = Awaited<ReturnType<typeof getSchool>>;

/** The school context, or a 404 when the person lacks every listed permission. */
export async function schoolPage(slug: string, perms: Permission[] = []) {
  const s = await getSchool(slug);
  if (perms.length && !perms.some((p) => s.ws.can(p))) notFound();
  return s;
}

/** Can this person see every student in their campus scope? */
export const seesAllStudents = (ws: Workspace) => ws.can("school.manage") || ws.can("finance.view") || ws.can("transport.manage") || ws.can("library.manage");

/** Students this person may see. */
export function studentScope(s: School): Prisma.StudentWhereInput {
  const base: Prisma.StudentWhereInput = { orgId: s.ws.org.id };
  if (seesAllStudents(s.ws)) return { ...base, campusId: { in: s.campusIds } };
  if (s.ws.can("school.teach")) return { ...base, sectionId: { in: s.teachSectionIds } };
  if (s.ws.can("school.parent")) return { ...base, id: { in: s.childIds } };
  return { ...base, id: "__none__" };
}

/** Classes this person may see. */
export function sectionScope(s: School): Prisma.SectionWhereInput {
  const base: Prisma.SectionWhereInput = { orgId: s.ws.org.id, yearId: s.year.id };
  if (s.ws.can("school.manage")) return { ...base, campusId: { in: s.campusIds } };
  if (s.ws.can("school.teach")) return { ...base, id: { in: s.teachSectionIds } };
  return { ...base, id: "__none__" };
}

/** May this person change marks and attendance for this class? */
export function canTeach(s: School, sectionId: string) {
  return s.ws.can("school.manage") || (s.ws.can("school.teach") && s.teachSectionIds.includes(sectionId));
}

export async function canSeeStudent(s: School, studentId: string) {
  return (await db.student.count({ where: { ...studentScope(s), id: studentId } })) > 0;
}
