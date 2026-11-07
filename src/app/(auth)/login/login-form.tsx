"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, Loader2, Building2, GraduationCap, Home } from "lucide-react";
import { login, type FormState } from "@/app/actions/auth";
import { useI18n } from "@/components/providers";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import type { MessageKey } from "@/lib/i18n";

interface DemoAccount {
  email: string;
  name: string;
  nameAr: string;
  avatarColor: string;
  workspace: "home" | "business" | "school";
  role: string;
}

const typeIcon = { home: Home, business: Building2, school: GraduationCap };

export function LoginForm({ next, demo }: { next: string; demo: DemoAccount[] }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function signInAs(email: string) {
    if (!emailRef.current || !passwordRef.current) return;
    emailRef.current.value = email;
    passwordRef.current.value = "demo1234";
    formRef.current?.requestSubmit();
  }

  return (
    <div className="page-enter">
      <h1 className="text-3xl font-semibold tracking-tight">{t("auth.welcomeBack")}</h1>
      <p className="mt-2 text-muted">{t("auth.signInSubtitle")}</p>

      <form ref={formRef} action={action} className="mt-8 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field label={t("auth.email")} htmlFor="email">
          <Input ref={emailRef} id="email" name="email" type="email" autoComplete="email" dir="ltr" required defaultValue={state.values?.email} className="text-start" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <div className="relative">
            <Input ref={passwordRef} id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr" required className="pe-11 text-start" />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 end-0 grid w-11 place-items-center text-subtle hover:text-fg"
              aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <AnimatePresence>
          {state.error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              role="alert"
              className="rounded-xl bg-[color-mix(in_oklch,var(--danger)_10%,var(--surface))] px-3.5 py-2.5 text-sm text-danger"
            >
              {t(state.error as MessageKey)}
            </motion.p>
          )}
        </AnimatePresence>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("auth.signingIn")}
            </>
          ) : (
            t("auth.signIn")
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          {t("auth.createAccount")}
        </Link>
      </p>

      {demo.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{t("auth.demoTitle")}</h2>
            <p className="text-xs text-subtle">{t("auth.demoHint")}</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {demo.map((d, i) => {
              const Icon = typeIcon[d.workspace];
              const name = locale === "ar" ? d.nameAr : d.name;
              return (
                <motion.button
                  key={d.email}
                  type="button"
                  disabled={pending}
                  onClick={() => signInAs(d.email)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className={buttonClass("secondary", "md", "h-auto justify-start gap-3 py-2.5 text-start lift")}
                >
                  <Avatar name={d.name} color={d.avatarColor} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Icon className="size-3" />
                      {t(`orgTypes.${d.workspace}` as MessageKey)} · {t(`roles.${d.role}` as MessageKey)}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
