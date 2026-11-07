"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Loader2, MailCheck } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { pick, type MessageKey } from "@/lib/i18n";
import { acceptInvite, acceptInviteWithSignup, type inviteDetails } from "@/app/actions/members";
import type { FormState } from "@/app/actions/auth";

type Details = Awaited<ReturnType<typeof inviteDetails>>;

export function InviteAccept({ token, details, viewer }: { token: string; details: Details; viewer: { email: string; name: string } | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, action, signing] = useActionState<FormState, FormData>(acceptInviteWithSignup.bind(null, token), {});

  if (details.state !== "ok") {
    return (
      <Card className="p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-sunken text-muted">
          <Clock className="size-6" />
        </span>
        <p className="mt-4 font-medium">{details.state === "used" ? t("invite.used") : t("invite.expired")}</p>
        <Link href="/login" className={buttonClass("secondary", "md", "mt-6")}>
          {t("auth.signIn")}
        </Link>
      </Card>
    );
  }

  const workspace = pick(locale, details.workspace, details.workspaceAr);
  const role = t(`roles.${details.role}` as MessageKey);
  return (
    <Card className="page-enter p-7">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <MailCheck className="size-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("invite.title")}</h1>
      <p className="mt-2 text-muted">{t("invite.body", { inviter: pick(locale, details.inviter, details.inviterAr), workspace, role })}</p>

      {viewer ? (
        viewer.email === details.email ? (
          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await acceptInvite(token);
                if (!res.ok) return void toast.error(t(res.error as MessageKey, { email: details.email, current: viewer.email }));
                toast.success(t("invite.joined", { workspace }));
                router.push(`/w/${res.slug}`);
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} {t("invite.join", { workspace })}
          </Button>
        ) : (
          <p className="mt-6 rounded-xl bg-[color-mix(in_oklch,var(--warning)_12%,var(--surface))] p-3 text-sm text-warning">{t("invite.wrongAccount", { email: details.email, current: viewer.email })}</p>
        )
      ) : details.hasAccount ? (
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className={buttonClass("primary", "lg", "mt-6 w-full")}>
          {t("invite.signInToJoin")}
        </Link>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          <p className="text-sm font-medium">{t("invite.createAccount")}</p>
          <Field label={t("auth.email")}>
            <Input value={details.email} readOnly dir="ltr" className="text-start text-muted" />
          </Field>
          <Field label={t("signup.yourName")} error={state.fieldErrors?.name ? t(state.fieldErrors.name as MessageKey) : undefined} htmlFor="i-name">
            <Input id="i-name" name="name" autoComplete="name" defaultValue={state.values?.name} required />
          </Field>
          <Field label={t("auth.password")} error={state.fieldErrors?.password ? t(state.fieldErrors.password as MessageKey) : undefined} hint={t("signup.passwordHint")} htmlFor="i-password">
            <Input id="i-password" name="password" type="password" autoComplete="new-password" dir="ltr" required />
          </Field>
          {state.error && <p className="text-sm text-danger">{t(state.error as MessageKey)}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={signing}>
            {signing && <Loader2 className="size-4 animate-spin" />} {t("invite.join", { workspace })}
          </Button>
        </form>
      )}
    </Card>
  );
}
