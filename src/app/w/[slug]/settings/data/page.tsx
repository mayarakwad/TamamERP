import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/dal";
import { DataView } from "./data-view";

export const metadata: Metadata = { title: "Data & backups" };

export default async function DataPage({ params }: PageProps<"/w/[slug]/settings/data">) {
  const { slug } = await params;
  const ws = await requirePermission(slug, "workspace.backup");
  await connection();
  const links = await db.shareLink.findMany({ where: { orgId: ws.org.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const users = new Map((await db.user.findMany({ where: { id: { in: links.map((l) => l.createdById) } } })).map((u) => [u.id, u]));
  const now = new Date();
  return (
    <DataView
      slug={slug}
      orgName={ws.org.name}
      now={now.toISOString()}
      links={links.map((l) => ({
        id: l.id,
        title: l.title,
        views: l.views,
        createdAt: l.createdAt.toISOString(),
        expiresAt: l.expiresAt?.toISOString() ?? null,
        state: l.revokedAt ? "revoked" : l.expiresAt && l.expiresAt < now ? "expired" : "active",
        by: users.get(l.createdById)?.name ?? "",
        byAr: users.get(l.createdById)?.nameAr ?? null,
      }))}
    />
  );
}
