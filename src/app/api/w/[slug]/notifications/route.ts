import { db } from "@/lib/db";
import { getWorkspaceForApi } from "@/lib/auth/api";

/** The signed-in person's latest notifications in this workspace. */
export async function GET(_request: Request, { params }: RouteContext<"/api/w/[slug]/notifications">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return Response.json({ unread: 0, items: [] }, { status: 401 });
  const where = { orgId: ws.org.id, userId: ws.viewer.id };
  const [unread, items] = await Promise.all([
    db.notification.count({ where: { ...where, readAt: null } }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  return Response.json({
    unread,
    items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, titleAr: n.titleAr, body: n.body, bodyAr: n.bodyAr, href: n.href ? `/w/${slug}/${n.href}` : null, read: !!n.readAt, at: n.createdAt.toISOString() })),
  });
}

/** Mark some ({ ids }) or all ({ all: true }) as read. */
export async function POST(request: Request, { params }: RouteContext<"/api/w/[slug]/notifications">) {
  const { slug } = await params;
  const ws = await getWorkspaceForApi(slug);
  if (!ws) return Response.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
  await db.notification.updateMany({
    where: { orgId: ws.org.id, userId: ws.viewer.id, readAt: null, ...(body.all ? {} : { id: { in: (body.ids ?? []).slice(0, 100) } }) },
    data: { readAt: new Date() },
  });
  return Response.json({ ok: true });
}
