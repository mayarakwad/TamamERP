import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/dal";
import { ROLES_BY_TYPE } from "@/lib/rbac";
import { MembersView } from "./members-view";

export const metadata: Metadata = { title: "Members & roles" };

export default async function MembersPage({ params }: PageProps<"/w/[slug]/settings/members">) {
  const { slug } = await params;
  const ws = await requirePermission(slug, "members.manage");
  const [members, invites] = await Promise.all([
    db.membership.findMany({ where: { orgId: ws.org.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { orgId: ws.org.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <MembersView
      slug={slug}
      viewerId={ws.viewer.id}
      viewerRole={ws.role}
      roles={ROLES_BY_TYPE[ws.orgType]}
      now={new Date().toISOString()}
      members={members.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, nameAr: m.user.nameAr, email: m.user.email, avatarColor: m.user.avatarColor, role: m.role as never, title: m.title, titleAr: m.titleAr, joined: m.createdAt.toISOString(), lastLogin: m.user.lastLoginAt?.toISOString() ?? null }))}
      invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role as never, expiresAt: i.expiresAt.toISOString() }))}
    />
  );
}
