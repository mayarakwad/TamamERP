import type { Metadata } from "next";
import { connection } from "next/server";
import { getWorkspace } from "@/lib/auth/dal";
import { getHomeDashboard } from "@/lib/home/dashboard";
import { hourIn } from "@/lib/format";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { BusinessDashboard } from "@/components/dashboard/business-dashboard";
import { getBizDashboard } from "@/lib/biz-dashboard";
import { SchoolDashboard } from "@/components/dashboard/school-dashboard";
import { getSchoolDashboard } from "@/lib/school/dashboard";
import { getSchool } from "@/lib/school/scope";
import type { DashboardLayout } from "@/app/actions/dashboard";

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

  if (ws.orgType === "business") {
    const data = await getBizDashboard(ws, now);
    return <BusinessDashboard slug={slug} data={data} now={now.toISOString()} greeting={greeting} firstName={firstName} layout={layout} />;
  }

  const data = await getSchoolDashboard(await getSchool(slug), now);
  return <SchoolDashboard slug={slug} data={data} now={now.toISOString()} greeting={greeting} firstName={firstName} layout={layout} />;
}
