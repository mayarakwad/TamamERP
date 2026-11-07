import "server-only";
import { db } from "../db";
import { getViewer } from "./dal";
import { can, parseExtras, type OrgType, type Permission, type Role } from "../rbac";

/**
 * Like getWorkspace(), but for route handlers: returns null instead of
 * redirecting or throwing a 404 page.
 */
export async function getWorkspaceForApi(slug: string) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const membership = await db.membership.findFirst({
    where: { userId: viewer.id, status: "active", org: { slug } },
    include: { org: { include: { campuses: true } }, campus: true },
  });
  if (!membership) return null;
  const role = membership.role as Role;
  const extras = parseExtras(membership.extraPermissions);
  return { viewer, membership, org: membership.org, orgType: membership.org.type as OrgType, role, extras, can: (p: Permission) => can(role, p, extras) };
}
