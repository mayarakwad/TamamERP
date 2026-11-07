import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "../db";
import { readSession } from "./session";
import { parsePrefs, type Prefs } from "../prefs";
import { can, type OrgType, type Permission, type Role } from "../rbac";

// Data Access Layer: the only place that decides who the viewer is and what
// workspace they're in. Pages and actions call these instead of reading
// cookies themselves. `cache` dedupes calls within one request.

export const PREFS_COOKIE = "tamam_prefs";

export const getViewer = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    nameAr: u.nameAr,
    phone: u.phone,
    avatarColor: u.avatarColor,
    lastOrgId: u.lastOrgId,
    prefs: parsePrefs(u.preferences),
  };
});

export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export const getWorkspace = cache(async (slug: string) => {
  const viewer = await requireViewer();
  const membership = await db.membership.findFirst({
    where: { userId: viewer.id, status: "active", org: { slug } },
    include: { org: { include: { campuses: { orderBy: { name: "asc" } } } }, campus: true },
  });
  if (!membership) notFound();
  const role = membership.role as Role;
  return {
    viewer,
    membership,
    org: membership.org,
    orgType: membership.org.type as OrgType,
    role,
    can: (p: Permission) => can(role, p),
  };
});

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;

export async function requirePermission(slug: string, permission: Permission) {
  const ws = await getWorkspace(slug);
  if (!ws.can(permission)) notFound();
  return ws;
}

export const getViewerWorkspaces = cache(async (userId: string) => {
  return db.membership.findMany({
    where: { userId, status: "active" },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      org: {
        select: { id: true, slug: true, name: true, nameAr: true, type: true, isSandbox: true },
      },
    },
  });
});

/** Preferences for this request: the signed-in person's, or the last ones used on this device. */
export const getRequestPrefs = cache(async (): Promise<Prefs> => {
  const viewer = await getViewer();
  if (viewer) return viewer.prefs;
  const raw = (await cookies()).get(PREFS_COOKIE)?.value;
  if (!raw) return parsePrefs({});
  try {
    return parsePrefs(JSON.parse(raw));
  } catch {
    return parsePrefs({});
  }
});
