import "server-only";
import { db } from "./db";

export interface ThreadItem {
  id: string;
  kind: "comment" | "event";
  at: string;
  user: { id: string; name: string; nameAr: string | null; avatarColor: string | null } | null;
  body: string;
  bodyAr?: string | null;
  action?: string;
}

/** Comments and activity for one record, oldest first. */
export async function getThread(orgId: string, entityType: string, entityId: string): Promise<ThreadItem[]> {
  const [comments, events] = await Promise.all([
    db.comment.findMany({ where: { orgId, entityType, entityId }, include: { author: true } }),
    db.auditLog.findMany({ where: { orgId, entityType, entityId }, orderBy: { createdAt: "asc" } }),
  ]);
  const userIds = [...new Set(events.map((e) => e.userId).filter(Boolean))] as string[];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } } })).map((u) => [u.id, u]));
  const pickUser = (u?: { id: string; name: string; nameAr: string | null; avatarColor: string | null } | null) =>
    u ? { id: u.id, name: u.name, nameAr: u.nameAr, avatarColor: u.avatarColor } : null;
  const items: ThreadItem[] = [
    ...comments.map((c) => ({ id: c.id, kind: "comment" as const, at: c.createdAt.toISOString(), user: pickUser(c.author), body: c.body })),
    ...events.map((e) => ({ id: e.id, kind: "event" as const, at: e.createdAt.toISOString(), user: pickUser(e.userId ? users.get(e.userId) : null), body: e.summary ?? e.action, bodyAr: e.summaryAr, action: e.action })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}
