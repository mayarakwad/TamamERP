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

/** Search one workspace's records, returning only what this person may see. */
export async function searchRecords(ws: Viewer, slug: string, query: string): Promise<SearchHit[]> {
  const terms = searchTerms(query);
  if (!terms.length || terms.join("").length < 2) return [];
  const rows = await db.searchIndex.findMany({
    where: { orgId: ws.org.id, AND: terms.map((t) => ({ text: { contains: t } })) },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  // People, customers and items before documents; no single type floods the list.
  const PRIORITY: Record<string, number> = { party: 0, employee: 1, item: 2, member: 3, possession: 4, bill: 5, claim: 6, document: 7 };
  const perType = new Map<string, number>();
  return rows
    .filter((r) => {
      if (r.entityType === "claim") return ws.can("claims.viewAll") || r.restrictedTo === ws.viewer.id;
      if (r.entityType === "member") return ws.can("members.manage");
      if (r.entityType === "party") return ws.can("finance.view");
      if (r.entityType === "item") return ws.can("finance.view") || ws.can("inventory.manage");
      if (r.entityType === "document") return ws.can("finance.view") || (r.restrictedTo === "po" && ws.can("inventory.manage"));
      if (r.entityType === "employee") return ws.can("hr.view");
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
