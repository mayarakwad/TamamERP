"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, ImagePlus, Loader2, Monitor, Moon, RotateCcw, Sun, Type } from "lucide-react";
import { useI18n, usePrefs } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented, Slider, Switch } from "@/components/ui/controls";
import { WallpaperArt, WALLPAPERS } from "@/components/appearance/wallpapers";
import { CountUp } from "@/components/motion/count-up";
import { THEMES } from "@/lib/themes";
import { DEFAULT_PREFS, FONT_SCALES, type WallpaperId } from "@/lib/prefs";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";

const ACCENTS = ["#8A1538", "#0E7490", "#15803D", "#1D4ED8", "#6D28D9", "#BE185D", "#B45309", "#334155"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-6 last:border-0 md:grid-cols-[14rem_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function AppearanceForm() {
  const { t, locale, fmt } = useI18n();
  const { prefs, update, saving } = usePrefs();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isDarkNow = prefs.mode === "dark" || (prefs.mode === "system" && typeof document !== "undefined" && document.documentElement.dataset.scheme === "dark");

  async function upload(file: File) {
    setUploading(true);
    setUploadError(false);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/me/wallpaper", { method: "POST", body });
    setUploading(false);
    if (!res.ok) return setUploadError(true);
    const { url } = (await res.json()) as { url: string };
    update({ wallpaper: "upload", wallpaperUpload: url });
  }

  const wallpaperIds: WallpaperId[] = ["none", ...(Object.keys(WALLPAPERS) as WallpaperId[])];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="px-[var(--pad)] sm:px-8">
        <Section title={t("settings.mode")}>
          <Segmented
            label={t("settings.mode")}
            value={prefs.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: "light", label: t("shell.lightMode"), icon: <Sun className="size-4" /> },
              { value: "dark", label: t("shell.darkMode"), icon: <Moon className="size-4" /> },
              { value: "system", label: t("shell.systemMode"), icon: <Monitor className="size-4" /> },
            ]}
          />
        </Section>

        <Section title={t("settings.theme")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {THEMES.map((th) => {
              const active = prefs.theme === th.id;
              const sw = isDarkNow ? th.swatchDark : th.swatch;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => update({ theme: th.id })}
                  aria-pressed={active}
                  className={cn("lift group relative overflow-hidden rounded-2xl border p-2 text-start", active ? "border-accent ring-4 ring-[var(--ring)]/15" : "border-line")}
                >
                  <div className="relative h-16 overflow-hidden rounded-xl" style={{ background: sw[0] }}>
                    <div className="absolute inset-y-2 start-2 w-1/3 rounded-lg" style={{ background: sw[1] }} />
                    <div className="absolute end-2 top-2 h-3 w-10 rounded-full" style={{ background: sw[2] }} />
                    <div className="absolute end-2 bottom-2 h-5 w-14 rounded-lg" style={{ background: sw[1] }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between px-1">
                    <span className="text-sm font-medium">{locale === "ar" ? th.nameAr : th.name}</span>
                    {active && <Check className="size-4 text-accent" />}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title={t("settings.accent")} hint={t("settings.accentHint")}>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => update({ accent: null })}
              className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm", !prefs.accent ? "border-accent text-accent" : "border-line text-muted hover:text-fg")}
            >
              {!prefs.accent && <Check className="size-3.5" />}
              {t("settings.useThemeAccent")}
            </button>
            {ACCENTS.map((c) => {
              const active = prefs.accent?.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => update({ accent: c })}
                  aria-label={c}
                  aria-pressed={active}
                  className={cn("grid size-9 place-items-center rounded-full transition-transform hover:scale-110", active && "ring-2 ring-offset-2 ring-offset-surface")}
                  style={{ background: c, ["--tw-ring-color" as string]: c }}
                >
                  {active && <Check className="size-4 text-white" />}
                </button>
              );
            })}
            <label className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line text-xs text-muted hover:border-accent-line" title={t("settings.customAccent")}>
              <span aria-hidden className="absolute inset-1 rounded-full" style={{ background: "conic-gradient(from 90deg, #e34948, #eda100, #1baf7a, #2a78d6, #6250d6, #e87ba4, #e34948)" }} />
              <input type="color" value={prefs.accent ?? "#8a1538"} onChange={(e) => update({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("settings.customAccent")} />
            </label>
          </div>
        </Section>

        <Section title={t("settings.wallpaper")} hint={t("settings.wallpaperHint")}>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {wallpaperIds.map((id) => {
              const active = prefs.wallpaper === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => update({ wallpaper: id })}
                  aria-pressed={active}
                  className={cn("lift relative aspect-[4/3] overflow-hidden rounded-xl border bg-bg", active ? "border-accent ring-4 ring-[var(--ring)]/15" : "border-line")}
                >
                  <span className="absolute inset-0">{id === "none" ? null : <WallpaperArt id={id} />}</span>
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 pt-4 pb-1 text-start text-[0.7rem] font-medium text-white">{t(`wallpapers.${id}` as MessageKey)}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => (prefs.wallpaperUpload ? update({ wallpaper: "upload" }) : fileRef.current?.click())}
              aria-pressed={prefs.wallpaper === "upload"}
              className={cn(
                "lift relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-dashed bg-cover bg-center text-muted",
                prefs.wallpaper === "upload" ? "border-accent ring-4 ring-[var(--ring)]/15" : "border-line",
              )}
              style={prefs.wallpaperUpload ? { backgroundImage: `url("${prefs.wallpaperUpload}")` } : undefined}
            >
              {!prefs.wallpaperUpload && (uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />)}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 pt-4 pb-1 text-start text-[0.7rem] font-medium text-white">{t("wallpapers.upload")}</span>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
              {uploading ? t("settings.uploading") : t("settings.upload")}
            </Button>
            {uploadError && <p className="text-xs text-danger">{t("settings.uploadFailed")}</p>}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Slider label={t("settings.dim")} min={0} max={90} value={prefs.wallpaperDim} onChange={(v) => update({ wallpaperDim: v })} format={(v) => fmt.percent(v / 100)} />
            <Slider label={t("settings.blur")} min={0} max={24} value={prefs.wallpaperBlur} onChange={(v) => update({ wallpaperBlur: v })} format={(v) => `${fmt.number(v)} px`} />
          </div>
          <div className="mt-4">
            <Switch label={t("settings.everywhere")} checked={prefs.wallpaperEverywhere} onChange={(v) => update({ wallpaperEverywhere: v })} />
          </div>
        </Section>

        <Section title={t("settings.textSize")}>
          <Segmented
            label={t("settings.textSize")}
            value={prefs.fontScale}
            onChange={(fontScale) => update({ fontScale })}
            options={FONT_SCALES.map((s, i) => ({
              value: s,
              label: <span style={{ fontSize: `${0.75 + i * 0.12}rem` }}>{locale === "ar" ? "أ" : "A"}</span>,
            }))}
          />
        </Section>

        <Section title={t("settings.density")}>
          <Segmented
            label={t("settings.density")}
            value={prefs.density}
            onChange={(density) => update({ density })}
            options={[
              { value: "comfortable", label: t("settings.comfortable") },
              { value: "compact", label: t("settings.compact") },
            ]}
          />
        </Section>

        <Section title={t("settings.language")} hint={t("settings.digitsHint")}>
          <div className="flex flex-wrap gap-3">
            <Segmented
              label={t("settings.language")}
              value={prefs.locale}
              onChange={(l) => update({ locale: l })}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: "العربية" },
              ]}
            />
            <Segmented
              label={t("settings.digits")}
              value={prefs.digits}
              onChange={(digits) => update({ digits })}
              options={[
                { value: "latn", label: t("settings.digitsLatn") },
                { value: "arab", label: t("settings.digitsArab") },
              ]}
            />
          </div>
          <div className="mt-4 max-w-md">
            <Switch label={t("settings.hijri")} checked={prefs.showHijri} onChange={(v) => update({ showHijri: v })} />
          </div>
        </Section>

        <Section title={t("settings.motion")} hint={t("settings.motionHint")}>
          <Segmented
            label={t("settings.motion")}
            value={prefs.motion}
            onChange={(motion) => update({ motion })}
            options={[
              { value: "system", label: t("settings.motionSystem") },
              { value: "full", label: t("settings.motionFull") },
              { value: "reduced", label: t("settings.motionReduced") },
            ]}
          />
        </Section>

        <div className="flex items-center justify-between py-5">
          <Button variant="ghost" size="sm" onClick={() => update({ ...DEFAULT_PREFS, locale: prefs.locale, wallpaperUpload: prefs.wallpaperUpload })}>
            <RotateCcw className="size-3.5" /> {t("settings.resetAll")}
          </Button>
          <span className={cn("text-xs text-muted transition-opacity", saving ? "opacity-100" : "opacity-0")} aria-live="polite">
            {t("common.loading")}
          </span>
        </div>
      </Card>

      <Preview />
    </div>
  );
}

function Preview() {
  const { t, fmt } = useI18n();
  const { prefs } = usePrefs();
  return (
    <div className="xl:sticky xl:top-24 xl:self-start">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Type className="size-3.5" /> {t("settings.preview")}
      </p>
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg p-4 shadow-card">
        {prefs.wallpaper !== "none" && (
          <div aria-hidden className="absolute inset-0">
            <div className="absolute -inset-4" style={{ filter: prefs.wallpaperBlur ? `blur(${prefs.wallpaperBlur / 2}px)` : undefined, backgroundImage: prefs.wallpaper === "upload" && prefs.wallpaperUpload ? `url("${prefs.wallpaperUpload}")` : undefined, backgroundSize: "cover" }}>
              {prefs.wallpaper !== "upload" && <WallpaperArt id={prefs.wallpaper} />}
            </div>
            <div className="wallpaper-dim absolute inset-0" style={{ ["--wp-dim" as string]: prefs.wallpaperDim }} />
          </div>
        )}
        <div className="relative space-y-3">
          <Card glass lift className="p-[var(--pad)]">
            <p className="text-xs font-medium text-muted">{t("settings.previewCard")}</p>
            <p className="mt-1 text-2xl font-semibold">
              <CountUp value={321450} format={(n) => fmt.money(n)} />
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken">
              <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: "71%" }} transition={{ duration: 0.9 }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">{t("dashboard.ofBudget", { amount: fmt.money(450000) })}</p>
          </Card>
          <div className="flex gap-2">
            <Button size="sm">{t("common.save")}</Button>
            <Button size="sm" variant="secondary">
              {t("common.cancel")}
            </Button>
          </div>
          <p className="inline-block rounded-lg bg-glass px-2 py-1 text-xs text-muted backdrop-blur">
            {fmt.date(new Date("2026-11-07T09:00:00Z"), "long")}
            {prefs.showHijri && <> · {fmt.hijri(new Date("2026-11-07T09:00:00Z"))}</>}
          </p>
        </div>
      </div>
    </div>
  );
}
