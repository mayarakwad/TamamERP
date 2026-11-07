"use client";

import { Languages, Moon, Sun, SunMoon } from "lucide-react";
import { usePrefs, useI18n } from "@/components/providers";
import { cn } from "@/lib/cn";

/** Language + light/dark switches, used on the sign-in pages and in the top bar. */
export function QuickToggles({ className }: { className?: string }) {
  const { prefs, update } = usePrefs();
  const { t } = useI18n();
  const nextMode = prefs.mode === "light" ? "dark" : prefs.mode === "dark" ? "system" : "light";
  const ModeIcon = prefs.mode === "light" ? Sun : prefs.mode === "dark" ? Moon : SunMoon;
  const modeLabel = prefs.mode === "light" ? t("shell.lightMode") : prefs.mode === "dark" ? t("shell.darkMode") : t("shell.systemMode");
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => update({ locale: prefs.locale === "ar" ? "en" : "ar" })}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-sunken hover:text-fg"
        aria-label={t("shell.language")}
      >
        <Languages className="size-4" />
        <span>{prefs.locale === "ar" ? "English" : "العربية"}</span>
      </button>
      <button
        type="button"
        onClick={() => update({ mode: nextMode })}
        className="inline-grid size-9 place-items-center rounded-xl text-muted transition hover:bg-sunken hover:text-fg"
        aria-label={`${t("settings.mode")}: ${modeLabel}`}
        title={modeLabel}
      >
        <ModeIcon className="size-4" />
      </button>
    </div>
  );
}
