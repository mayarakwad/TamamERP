"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, Lock, Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { pick } from "@/lib/i18n";
import { setCampus } from "@/app/actions/school";
import type { ShellData } from "./types";

/** Schools with several campuses: show all of them, or one. Remembered on this device. */
export function CampusSwitcher({ slug, campus }: { slug: string; campus: NonNullable<ShellData["campus"]> }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = campus.options.find((c) => c.id === campus.selected);
  if (campus.locked && current) {
    return (
      <span className="hidden h-9 items-center gap-2 rounded-xl border border-line bg-surface/70 px-3 text-sm text-muted md:inline-flex" title={t("school.campusLocked", { campus: pick(locale, current.name, current.nameAr) })}>
        <Lock className="size-3.5" />
        <span className="size-2 rounded-full" style={{ background: current.color ?? "var(--accent)" }} />
        {pick(locale, current.name, current.nameAr)}
      </span>
    );
  }
  return (
    <label className="relative hidden h-9 items-center rounded-xl border border-line bg-surface/70 text-sm shadow-sm transition hover:border-accent-line md:inline-flex">
      <span className="pointer-events-none absolute start-3 flex items-center">
        {pending ? <Loader2 className="size-4 animate-spin text-muted" /> : current ? <span className="size-2.5 rounded-full" style={{ background: current.color ?? "var(--accent)" }} /> : <Building className="size-4 text-muted" />}
      </span>
      <span className="sr-only">{t("school.campusSwitch")}</span>
      <select
        value={campus.selected ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setCampus(slug, e.target.value || null);
            router.refresh();
          })
        }
        className="h-full cursor-pointer appearance-none rounded-xl bg-transparent pe-3 ps-8 outline-none"
      >
        <option value="">{t("school.allCampuses")}</option>
        {campus.options.map((c) => (
          <option key={c.id} value={c.id}>
            {pick(locale, c.name, c.nameAr)}
          </option>
        ))}
      </select>
    </label>
  );
}
