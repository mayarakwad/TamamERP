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
import { progress, showSetupCard, stepStatuses } from "@/lib/onboarding";
import { SetupCard } from "@/components/onboarding/setup-card";

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

  // Until the setup guide is done, the dashboard shows how far along it is.
  // (New workspaces are sent to the guide when they're created, never redirected from here.)
  let card: React.ReactNode = null;
  if (showSetupCard(ws, now)) {
    const p = progress(await stepStatuses(ws));
    if (!p.complete) card = <SetupCard slug={slug} name={pick(locale, ws.org.name, ws.org.nameAr)} done={p.finished} total={p.total} />;
  }

  if (ws.orgType === "home") {
    const data = await getHomeDashboard(ws, now);
    return (
      <>
        {card}
        <HomeDashboard slug={slug} data={data} now={now.toISOString()} greeting={greeting} firstName={firstName} canApprove={ws.can("claims.approve")} layout={layout} />
      </>
    );
  }

  if (ws.orgType === "business") {
    const data = await getBizDashboard(ws, now);
    return (
      <>
        {card}
        <BusinessDashboard slug={slug} data={data} now={now.toISOString()} greeting={greeting} firstName={firstName} layout={layout} />
      </>
    );
  }

  const data = await getSchoolDashboard(await getSchool(slug), now);
  return (
    <>
      {card}
      <SchoolDashboard slug={slug} data={data} now={now.toISOString()} greeting={greeting} firstName={firstName} layout={layout} />
    </>
  );
}
