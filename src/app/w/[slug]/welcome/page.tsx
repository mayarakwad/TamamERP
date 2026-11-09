import type { Metadata } from "next";
import { connection } from "next/server";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { bizSettings } from "@/lib/biz";
import { schoolSettings } from "@/lib/school/settings";
import { onboardingState, progress, stepStatuses } from "@/lib/onboarding";
import { ROLES_BY_TYPE } from "@/lib/rbac";
import { WelcomeWizard } from "./welcome-wizard";

export const metadata: Metadata = { title: "Setup guide" };

export default async function WelcomePage({ params, searchParams }: PageProps<"/w/[slug]/welcome">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ws = await requirePermission(slug, "workspace.manage");
  await connection();
  const steps = await stepStatuses(ws);
  const o = ws.org;
  const home = ws.orgType === "home";
  const [categories, budgets, bills] = home
    ? await Promise.all([
        db.expenseCategory.findMany({ where: { orgId: o.id, archived: false }, orderBy: { sort: "asc" } }),
        db.budget.findMany({ where: { orgId: o.id, month: "default" } }),
        db.recurringBill.findMany({ where: { orgId: o.id }, select: { name: true } }),
      ])
    : [[], [], []];
  const sales = bizSettings(o).sales ?? {};
  return (
    <WelcomeWizard
      slug={slug}
      orgType={ws.orgType}
      steps={steps}
      progress={progress(steps)}
      finished={!!onboardingState(o).finishedAt}
      initialStep={typeof sp.step === "string" ? sp.step : null}
      basics={{ name: o.name, nameAr: o.nameAr ?? "", brandColor: o.brandColor ?? "#8A1538", address: o.address ?? "", phone: o.phone ?? "", email: o.email ?? "", crNumber: o.crNumber ?? "", logoUrl: o.logoPath ? `/api/w/${slug}/logo?v=${o.updatedAt.getTime()}` : null }}
      campuses={o.campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr ?? "" }))}
      invoicing={{ bankName: sales.bankName ?? "", iban: sales.iban ?? "", invoiceTerms: sales.invoiceTerms ?? "", invoiceNotes: sales.invoiceNotes ?? "", quoteTerms: sales.quoteTerms ?? "" }}
      admissionsOpen={ws.orgType === "school" ? schoolSettings(o).admissionsOpen : false}
      categories={categories.map((c) => ({ id: c.id, key: c.key, name: c.name, nameAr: c.nameAr, budget: budgets.find((b) => b.categoryId === c.id)?.amount ?? 0 }))}
      billNames={bills.map((b) => b.name)}
      roles={ROLES_BY_TYPE[ws.orgType].filter((r) => r !== "owner")}
    />
  );
}
