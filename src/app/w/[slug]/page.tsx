import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { getHomeDashboard } from "@/lib/home/dashboard";
import { hourIn } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { WorkspaceDashboard } from "@/components/dashboard/workspace-dashboard";
import type { DashboardLayout } from "@/app/actions/dashboard";
import type { Role } from "@/lib/rbac";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  const { locale } = await getI18n();
  await connection();
  const now = new Date();
  const hour = hourIn(ws.org.timezone, now);
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = pick(locale, ws.viewer.name, ws.viewer.nameAr).replace(/^(Dr\.|د\.)\s*/, "").split(" ")[0];
  const layout = (ws.membership.dashboardLayout as DashboardLayout | null) ?? null;

  if (ws.orgType === "home") {
    const data = await getHomeDashboard(ws, now);
    return (
      <HomeDashboard slug={slug} data={data} now={now.toISOString()} greeting={greeting} firstName={firstName} canApprove={ws.can("claims.approve")} layout={layout} />
    );
  }

  const [campuses, members] = await Promise.all([
    db.campus.findMany({ where: { orgId: ws.org.id }, orderBy: { name: "asc" }, include: { _count: { select: { memberships: true } } } }),
    db.membership.findMany({ where: { orgId: ws.org.id, status: "active" }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 8 }),
  ]);

  return (
    <WorkspaceDashboard
      slug={slug}
      orgType={ws.orgType}
      role={ws.role}
      stage={ws.orgType === "business" ? "2" : "3"}
      now={now.toISOString()}
      greeting={greeting}
      firstName={firstName}
      layout={layout}
      campuses={campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, code: c.code, color: c.color, members: c._count.memberships }))}
      members={members.map((m) => ({ id: m.id, name: m.user.name, nameAr: m.user.nameAr, avatarColor: m.user.avatarColor, role: m.role as Role, title: m.title, titleAr: m.titleAr }))}
    />
  );
}
