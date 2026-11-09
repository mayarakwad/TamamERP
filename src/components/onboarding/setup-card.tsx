"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Rocket, X } from "lucide-react";
import { useI18n } from "@/components/providers";
import { buttonClass } from "@/components/ui/button";
import { hideSetupCard } from "@/app/actions/onboarding";

/** "Finish setting up": shown on the dashboard until the setup guide is done or hidden. */
export function SetupCard({ slug, name, done, total }: { slug: string; name: string; done: number; total: number }) {
  const { t, dir } = useI18n();
  const [pending, start] = useTransition();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-accent-line bg-accent-soft/50 p-4 sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
        <Rocket className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{t("onboarding.cardTitle", { name })}</div>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted">{t("onboarding.cardBody", { done, total })}</span>
        </div>
      </div>
      <Link href={`/w/${slug}/welcome`} className={buttonClass("primary", "md")}>
        {t("onboarding.cardContinue")} <Arrow className="size-4" />
      </Link>
      <button type="button" disabled={pending} onClick={() => start(async () => void (await hideSetupCard(slug)))} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface" aria-label={t("onboarding.cardHide")} title={t("onboarding.cardHide")}>
        <X className="size-4" />
      </button>
    </div>
  );
}
