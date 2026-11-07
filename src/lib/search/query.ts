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
    take: 60,
  });
  return rows
    .filter((r) => {
      if (r.entityType === "claim") return ws.can("claims.viewAll") || r.restrictedTo === ws.viewer.id;
      if (r.entityType === "member") return ws.can("members.manage");
      return true;
    })
    .slice(0, 20)
    .map((r) => ({ type: r.entityType, title: r.title, subtitle: r.subtitle, href: `/w/${slug}/${r.href}` }));
}
