import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/dal";
import { PREFERRED_TIMEZONES } from "@/lib/system/options";
import { WorkspaceForm } from "./workspace-form";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspaceSettingsPage({ params }: PageProps<"/w/[slug]/settings/workspace">) {
  const { slug } = await params;
  const ws = await requirePermission(slug, "workspace.manage");
  const o = ws.org;
  const all = Intl.supportedValuesOf("timeZone");
  return (
    <WorkspaceForm
      slug={slug}
      logoUrl={o.logoPath ? `/api/w/${slug}/logo?v=${o.updatedAt.getTime()}` : null}
      timezones={[...PREFERRED_TIMEZONES, ...all.filter((z) => !PREFERRED_TIMEZONES.includes(z))]}
      initial={{
        name: o.name,
        nameAr: o.nameAr ?? "",
        address: o.address ?? "",
        addressAr: o.addressAr ?? "",
        phone: o.phone ?? "",
        email: o.email ?? "",
        crNumber: o.crNumber ?? "",
        brandColor: o.brandColor ?? "#8A1538",
        currency: o.currency as "QAR",
        timezone: o.timezone,
        locale: o.locale === "ar" ? "ar" : "en",
        weekend: (["5,6", "6,0", "5"].includes(o.weekend) ? o.weekend : "5,6") as "5,6",
        weekStart: ([0, 1, 6].includes(o.weekStart) ? o.weekStart : 0) as 0,
      }}
    />
  );
}
