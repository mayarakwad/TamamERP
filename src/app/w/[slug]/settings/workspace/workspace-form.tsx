"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, inputClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page-header";
import { BRAND_COLOURS, SETUP_CURRENCIES } from "@/lib/system/options";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import { updateWorkspace, type WorkspaceInput } from "@/app/actions/workspace";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-6 last:border-0 md:grid-cols-[12rem_1fr]">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function WorkspaceForm({ slug, initial, logoUrl, timezones }: { slug: string; initial: WorkspaceInput; logoUrl: string | null; timezones: string[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof WorkspaceInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const currencyName = new Intl.DisplayNames([locale], { type: "currency" });

  const save = () =>
    start(async () => {
      const res = await updateWorkspace(slug, form);
      if (!res.ok) return setErrors({ [res.field ?? "name"]: t(res.error as MessageKey) });
      setErrors({});
      toast.success(t("ws.saved"));
    });

  async function uploadLogo(file: File) {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/w/${slug}/logo`, { method: "POST", body });
    setUploading(false);
    if (!res.ok) return void toast.error(t("settings.uploadFailed"));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("ws.title")}
        subtitle={t("ws.subtitle")}
        actions={
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("common.save")}
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="px-[var(--pad)] sm:px-8">
          <Section title={t("ws.identity")}>
            <Field label={t("signup.orgName")} error={errors.name} htmlFor="w-name">
              <Input id="w-name" value={form.name} onChange={set("name")} />
            </Field>
            <Field label={t("signup.orgNameAr")} htmlFor="w-nameAr">
              <Input id="w-nameAr" dir="rtl" value={form.nameAr} onChange={set("nameAr")} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium">{t("ws.logo")}</p>
              <div className="flex items-center gap-4">
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logoUrl ? <img src={logoUrl} alt="" className="size-full object-contain p-1" /> : <span className="size-full" style={{ background: form.brandColor }} />}
                </span>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />} {t("ws.uploadLogo")}
                    </Button>
                    {logoUrl && (
                      <Button variant="ghost" size="sm" onClick={async () => (await fetch(`/api/w/${slug}/logo`, { method: "DELETE" }), router.refresh())}>
                        <Trash2 className="size-3.5" /> {t("ws.removeLogo")}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted">{t("ws.logoHint")}</p>
                </div>
                <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => (e.target.files?.[0] && uploadLogo(e.target.files[0]), (e.target.value = ""))} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium">{t("setup.brandColour")}</p>
              <div className="flex flex-wrap gap-2.5">
                {BRAND_COLOURS.map((c) => (
                  <button key={c} type="button" aria-label={c} aria-pressed={form.brandColor === c} onClick={() => setForm({ ...form, brandColor: c })} className={cn("grid size-9 place-items-center rounded-full", form.brandColor === c && "ring-2 ring-offset-2 ring-offset-surface")} style={{ background: c, ["--tw-ring-color" as string]: c }}>
                    {form.brandColor === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
                <label className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line">
                  <span aria-hidden className="absolute inset-1 rounded-full" style={{ background: "conic-gradient(from 90deg, #e34948, #eda100, #1baf7a, #2a78d6, #6250d6, #e87ba4, #e34948)" }} />
                  <input type="color" value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("settings.customAccent")} />
                </label>
              </div>
            </div>
          </Section>
          <Section title={t("ws.contact")}>
            <Field label={t("setup.address")} htmlFor="w-address">
              <Input id="w-address" value={form.address} onChange={set("address")} placeholder={t("setup.addressPlaceholder")} />
            </Field>
            <Field label={`${t("setup.address")} (العربية)`} htmlFor="w-addressAr">
              <Input id="w-addressAr" dir="rtl" value={form.addressAr} onChange={set("addressAr")} />
            </Field>
            <Field label={t("setup.phone")} htmlFor="w-phone">
              <Input id="w-phone" dir="ltr" className="text-start" value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label={t("auth.email")} error={errors.email} htmlFor="w-email">
              <Input id="w-email" type="email" dir="ltr" className="text-start" value={form.email} onChange={set("email")} />
            </Field>
            <Field label={t("setup.crNumber")} htmlFor="w-cr">
              <Input id="w-cr" dir="ltr" className="text-start" value={form.crNumber} onChange={set("crNumber")} />
            </Field>
          </Section>
          <Section title={t("ws.regional")}>
            <Field label={t("setup.currency")} htmlFor="w-currency">
              <select id="w-currency" className={inputClass} value={form.currency} onChange={set("currency")}>
                {SETUP_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} · {currencyName.of(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("setup.timezone")} htmlFor="w-tz">
              <select id="w-tz" className={inputClass} value={form.timezone} onChange={set("timezone")} dir="ltr">
                {timezones.map((z) => (
                  <option key={z} value={z}>
                    {z.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("setup.weekend")} htmlFor="w-weekend">
              <select id="w-weekend" className={inputClass} value={form.weekend} onChange={set("weekend")}>
                <option value="5,6">{t("setup.weekendFriSat")}</option>
                <option value="6,0">{t("setup.weekendSatSun")}</option>
                <option value="5">{t("setup.weekendFri")}</option>
              </select>
            </Field>
            <Field label={t("setup.weekStart")} htmlFor="w-weekstart">
              <select id="w-weekstart" className={inputClass} value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: Number(e.target.value) as 0 })}>
                <option value={0}>{t("setup.sunday")}</option>
                <option value={6}>{t("setup.saturday")}</option>
                <option value={1}>{t("setup.monday")}</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium">{t("ws.docLanguage")}</p>
              <Segmented
                label={t("ws.docLanguage")}
                value={form.locale}
                onChange={(l) => setForm({ ...form, locale: l })}
                options={[
                  { value: "en", label: "English" },
                  { value: "ar", label: "العربية" },
                ]}
              />
            </div>
          </Section>
        </Card>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <p className="mb-2 text-xs font-medium text-muted">{t("ws.preview")}</p>
          <div className="rounded-xl border border-line bg-white p-5 text-[#1f1a17] shadow-card" dir={form.locale === "ar" ? "rtl" : "ltr"}>
            <div className="flex items-center justify-between gap-3 border-b-2 pb-3" style={{ borderColor: form.brandColor }}>
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logoUrl ? <img src={logoUrl} alt="" className="size-9 object-contain" /> : <span className="size-9 rounded-lg" style={{ background: form.brandColor }} />}
                <div>
                  <p className="text-sm font-semibold">{form.locale === "ar" && form.nameAr ? form.nameAr : form.name}</p>
                  <p className="text-[0.65rem] text-[#6b625c]">{form.locale === "ar" && form.addressAr ? form.addressAr : form.address}</p>
                </div>
              </div>
              <p className="text-base font-semibold" style={{ color: form.brandColor }}>
                {t("ws.sample")}
              </p>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="h-5 rounded" style={{ background: form.brandColor }} />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("h-4 rounded", i % 2 ? "bg-[#faf8f6]" : "bg-[#f3efec]")} />
              ))}
            </div>
            {form.crNumber && <p className="mt-3 text-[0.65rem] text-[#888]">CR {form.crNumber}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
