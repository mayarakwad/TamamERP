import "server-only";
import { db } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import type { School } from "./scope";

/** Announcements this person should see: by audience, campus and (for parents) their children's grades. */
export async function announcementScope(s: School): Promise<Prisma.AnnouncementWhereInput> {
  const base: Prisma.AnnouncementWhereInput = { orgId: s.ws.org.id };
  if (s.ws.can("school.manage")) return { ...base, OR: [{ campusId: null }, { campusId: { in: s.campusIds } }] };
  if (s.ws.role === "parent") {
    const kids = await db.student.findMany({ where: { id: { in: s.childIds } }, select: { campusId: true, gradeId: true } });
    return {
      ...base,
      audience: { in: ["everyone", "parents"] },
      AND: [{ OR: [{ campusId: null }, { campusId: { in: kids.map((k) => k.campusId) } }] }, { OR: [{ gradeId: null }, { gradeId: { in: kids.map((k) => k.gradeId) } }] }],
    };
  }
  return { ...base, audience: { in: ["everyone", "staff"] }, OR: [{ campusId: null }, { campusId: { in: s.campusIds } }] };
}
