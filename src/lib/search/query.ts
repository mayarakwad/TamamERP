import "server-only";
import { db } from "../db";
import { searchTerms } from "../text";
import type { Permission } from "../rbac";

export interface SearchHit {
  type: string;
  title: string;
  subtitle: string | null;
  href: string;
}

interface Viewer {
  org: { id: string };
  viewer: { id: string };
  can: (p: Permission) => boolean;
}

/** Schools: the classes a teacher teaches (they find only those students). */
export interface SearchScope {
  teachSectionIds?: string[];
}

/** Search one workspace's records, returning only what this person may see. */
export async function searchRecords(ws: Viewer, slug: string, query: string, scope: SearchScope = {}): Promise<SearchHit[]> {
  const terms = searchTerms(query);
  if (!terms.length || terms.join("").length < 2) return [];
  const rows = await db.searchIndex.findMany({
    where: { orgId: ws.org.id, AND: terms.map((t) => ({ text: { contains: t } })) },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  // People, customers and items before documents; no single type floods the list.
  const PRIORITY: Record<string, number> = { student: 0, guardian: 1, party: 2, employee: 3, item: 4, application: 5, member: 6, book: 7, possession: 8, bill: 9, claim: 10, document: 11 };
  const allStudents = ws.can("school.manage") || ws.can("finance.view") || ws.can("transport.manage") || ws.can("library.manage");
  const perType = new Map<string, number>();
  return rows
    .filter((r) => {
      if (r.entityType === "claim") return ws.can("claims.viewAll") || r.restrictedTo === ws.viewer.id;
      if (r.entityType === "member") return ws.can("members.manage");
      if (r.entityType === "party") return ws.can("finance.view");
      if (r.entityType === "item") return ws.can("finance.view") || ws.can("inventory.manage");
      if (r.entityType === "document") return ws.can("finance.view") || (r.restrictedTo === "po" && ws.can("inventory.manage"));
      if (r.entityType === "employee") return ws.can("hr.view");
      if (r.entityType === "student") return allStudents || (ws.can("school.teach") && !!r.restrictedTo && (scope.teachSectionIds ?? []).includes(r.restrictedTo));
      if (r.entityType === "guardian") return ws.can("school.manage") || ws.can("finance.view");
      if (r.entityType === "application") return ws.can("school.manage");
      if (r.entityType === "book") return ws.can("library.manage") || ws.can("school.teach") || ws.can("school.manage");
      return true;
    })
    .sort((a, b) => (PRIORITY[a.entityType] ?? 9) - (PRIORITY[b.entityType] ?? 9))
    .filter((r) => {
      const n = (perType.get(r.entityType) ?? 0) + 1;
      perType.set(r.entityType, n);
      return n <= 8;
    })
    .slice(0, 20)
    .map((r) => ({ type: r.entityType, title: r.title, subtitle: r.subtitle, href: `/w/${slug}/${r.href}` }));
}
