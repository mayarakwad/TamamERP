"use client";

import { useActionState } from "react";
import { CheckCircle2, Laptop, Smartphone } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { updateProfile, changePassword } from "@/app/actions/profile";
import type { FormState } from "@/app/actions/auth";
import type { MessageKey } from "@/lib/i18n";

interface Props {
  viewer: { name: string; nameAr: string; phone: string; email: string; avatarColor: string | null };
  sessions: { id: string; current: boolean; userAgent: string | null; createdAt: string; ip: string | null }[];
}

function device(ua: string | null) {
  if (!ua) return { label: "—", mobile: false };
  const mobile = /iPhone|Android|Mobile/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? (mobile ? "iOS" : "macOS") : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  return { label: [browser, os].filter(Boolean).join(" · "), mobile };
}

export function ProfileForms({ viewer, sessions }: Props) {
  const { t, fmt } = useI18n();
  const [pState, pAction, pPending] = useActionState<FormState, FormData>(updateProfile, {});
  const [wState, wAction, wPending] = useActionState<FormState, FormData>(changePassword, {});
  const err = (s: FormState, k: string) => (s.fieldErrors?.[k] ? t(s.fieldErrors[k] as MessageKey) : undefined);

  return (
    <div className="mt-6 space-y-6">
      <Card className="p-[var(--pad)] sm:p-8">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={viewer.name} color={viewer.avatarColor} size={56} />
          <div>
            <p className="text-xs text-muted">{t("settings.signedInAs")}</p>
            <p className="font-medium" dir="ltr">{viewer.email}</p>
          </div>
        </div>
        <form action={pAction} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.name")} htmlFor="name" error={err(pState, "name")}>
            <Input id="name" name="name" defaultValue={viewer.name} required />
          </Field>
          <Field label={t("settings.nameAr")} htmlFor="nameAr">
            <Input id="nameAr" name="nameAr" defaultValue={viewer.nameAr} dir="rtl" />
          </Field>
          <Field label={t("settings.phone")} htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={viewer.phone} dir="ltr" className="text-start" inputMode="tel" placeholder="+974 5555 1234" />
          </Field>
          <div className="flex items-end gap-3 sm:col-span-2">
            <Button type="submit" disabled={pPending}>{t("common.save")}</Button>
            {pState.values?.ok && !pPending && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="size-4" /> {t("common.saved")}
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-[var(--pad)] sm:p-8">
        <h2 className="text-sm font-semibold">{t("settings.changePassword")}</h2>
        <form action={wAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.currentPassword")} htmlFor="current" error={err(wState, "current")}>
            <Input id="current" name="current" type="password" autoComplete="current-password" dir="ltr" required />
          </Field>
          <Field label={t("settings.newPassword")} htmlFor="next" error={err(wState, "next")} hint={t("signup.passwordHint")}>
            <Input id="next" name="next" type="password" autoComplete="new-password" dir="ltr" required />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" variant="secondary" disabled={wPending}>{t("settings.changePassword")}</Button>
            {wState.values?.ok && !wPending && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="size-4" /> {t("settings.passwordChanged")}
              </span>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-[var(--pad)] sm:p-8">
        <h2 className="text-sm font-semibold">{t("settings.sessions")}</h2>
        <ul className="mt-4 divide-y divide-line">
          {sessions.map((s) => {
            const d = device(s.userAgent);
            const Icon = d.mobile ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 place-items-center rounded-xl bg-sunken text-muted">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className="text-xs text-muted">
                    {fmt.dateTime(s.createdAt)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                </div>
                {s.current && <Badge tone="success">✓</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
