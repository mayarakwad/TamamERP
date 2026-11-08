import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { getSystem } from "@/lib/system";
import { getI18n } from "@/lib/i18n/server";
import { pick } from "@/lib/i18n";
import { NATIONALITIES, schoolSettings } from "@/lib/school/settings";
import { ApplyForm } from "./apply-form";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/apply/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const org = await db.organization.findUnique({ where: { slug }, select: { name: true, type: true } });
  return { title: org?.type === "school" ? `Apply · ${org.name}` : "Apply" };
}

/** The public admissions form: no account needed. */
export default async function ApplyPage({ params }: PageProps<"/apply/[slug]">) {
  const { slug } = await params;
  await connection();
  const org = await db.organization.findUnique({ where: { slug }, include: { campuses: { orderBy: { name: "asc" } } } });
  if (!org || org.type !== "school") notFound();
  const { locale, t } = await getI18n();
  const system = await getSystem();
  const brand = await getBranding(org);
  const now = new Date();
  const [years, grades] = await Promise.all([
    db.academicYear.findMany({ where: { orgId: org.id, endDate: { gte: now } }, orderBy: { startDate: "asc" } }),
    db.grade.findMany({ where: { orgId: org.id }, orderBy: { level: "asc" } }),
  ]);
  return (
    <ApplyForm
      slug={slug}
      open={schoolSettings(org).admissionsOpen}
      school={pick(locale, org.name, org.nameAr)}
      logo={brand.logo}
      color={org.brandColor}
      appName={system.instanceName === "Tamam" ? t("app.name") : system.instanceName}
      years={years.map((y) => ({ id: y.id, name: y.name, current: y.current }))}
      campuses={org.campuses.map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
      grades={grades.map((g) => ({ id: g.id, name: pick(locale, g.name, g.nameAr) }))}
      nationalities={(() => {
        // Named on the server so the page hydrates with exactly the same text.
        const regions = new Intl.DisplayNames([locale], { type: "region" });
        return NATIONALITIES.map((code) => ({ code, name: regions.of(code) ?? code }));
      })()}
    />
  );
}
