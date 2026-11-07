import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface NotifyInput {
  orgId: string;
  userIds: string[];
  kind: string;
  title: string;
  titleAr?: string;
  body?: string;
  bodyAr?: string;
  /** Path inside the workspace, e.g. "claims/abc" */
  href?: string;
  /** Skip this person (usually whoever caused the event) */
  except?: string | null;
}

export async function notify(db: Db, n: NotifyInput) {
  const ids = [...new Set(n.userIds)].filter((id) => id && id !== n.except);
  if (!ids.length) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ orgId: n.orgId, userId, kind: n.kind, title: n.title, titleAr: n.titleAr, body: n.body, bodyAr: n.bodyAr, href: n.href })),
  });
}

/** Everyone in a workspace with one of these roles. */
export async function membersWithRoles(db: Db, orgId: string, roles: string[]) {
  const rows = await db.membership.findMany({ where: { orgId, status: "active", role: { in: roles } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}
