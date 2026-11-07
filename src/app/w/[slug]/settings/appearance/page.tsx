import type { Metadata } from "next";
import { getWorkspace } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { AppearanceForm } from "./appearance-form";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage({ params }: PageProps<"/w/[slug]/settings/appearance">) {
  const { slug } = await params;
  await getWorkspace(slug);
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("settings.appearanceTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("settings.appearanceSubtitle")}</p>
      <div className="mt-6">
        <AppearanceForm />
      </div>
    </div>
  );
}
