import { db } from "@/lib/db";
import { getWorkspaceForApi } from "@/lib/auth/api";
import { searchRecords } from "@/lib/search/query";

/** Records matching ?q= (Arabic-aware), filtered by what the person may see. */
export async function GET(request: Request, { params }: RouteContext<"/api/w/[slug]/search">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return Response.json({ hits: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  // A teacher finds only the students in the classes they teach.
  let teachSectionIds: string[] | undefined;
  if (ws.orgType === "school" && ws.can("school.teach")) {
    const emp = await db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id }, select: { id: true } });
    if (emp) {
      const [home, teach] = await Promise.all([
        db.section.findMany({ where: { orgId: ws.org.id, homeroomId: emp.id, year: { current: true } }, select: { id: true } }),
        db.teachingAssignment.findMany({ where: { teacherId: emp.id, section: { year: { current: true } } }, select: { sectionId: true } }),
      ]);
      teachSectionIds = [...home.map((s) => s.id), ...teach.map((t) => t.sectionId)];
    }
  }
  return Response.json({ hits: await searchRecords(ws, slug, q.slice(0, 100), { teachSectionIds }) });
}
