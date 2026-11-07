"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, Check, GraduationCap, Home, Loader2 } from "lucide-react";
import { signup, type FormState } from "@/app/actions/auth";
import { useI18n, usePrefs } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import type { OrgType } from "@/lib/rbac";

const TYPES: { id: OrgType; icon: typeof Home }[] = [
  { id: "business", icon: Building2 },
  { id: "school", icon: GraduationCap },
  { id: "home", icon: Home },
];

function strength(pw: string): 0 | 1 | 2 {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return pw.length < 8 ? 0 : s >= 4 ? 2 : 1;
}

export function SignupForm() {
  const { t, dir } = useI18n();
  const { prefs } = usePrefs();
  const [state, action, pending] = useActionState<FormState, FormData>(signup, {});
  const v = state.values ?? {};
  const [step, setStep] = useState(1);
  const [type, setType] = useState<OrgType | "">((v.type as OrgType) || "");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState({ orgName: v.orgName ?? "", orgNameAr: v.orgNameAr ?? "", campuses: v.campuses ?? "" });
  const [orgTouched, setOrgTouched] = useState(false);
  const orgOk = org.orgName.trim().length >= 2;
  const [lastErrors, setLastErrors] = useState(state.fieldErrors);

  // Jump back to the step that has a server-side error.
  if (state.fieldErrors !== lastErrors) {
    setLastErrors(state.fieldErrors);
    const fe = state.fieldErrors ?? {};
    if (fe.orgName || fe.type) setStep(fe.type ? 1 : 2);
    else if (fe.name || fe.email || fe.password) setStep(3);
  }

  const err = (k: string) => (state.fieldErrors?.[k] ? t(state.fieldErrors[k] as MessageKey) : undefined);
  const Next = dir === "rtl" ? ArrowLeft : ArrowRight;
  const Prev = dir === "rtl" ? ArrowRight : ArrowLeft;
  const s = strength(password);
  const slide = dir === "rtl" ? -1 : 1;

  return (
    <div className="page-enter">
      <p className="text-sm font-medium text-accent">{t("signup.stepOf", { n: step })}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t("signup.title")}</h1>
      <div className="mt-4 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
            <motion.span className="block h-full bg-accent" initial={false} animate={{ width: step >= n ? "100%" : "0%" }} transition={{ duration: 0.35 }} />
          </span>
        ))}
      </div>

      <form action={action} className="mt-8" noValidate>
        {/* Values from every step are submitted together. */}
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="locale" value={prefs.locale} />
        <input type="hidden" name="orgName" value={org.orgName} />
        <input type="hidden" name="orgNameAr" value={org.orgNameAr} />
        <input type="hidden" name="campuses" value={org.campuses} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 * slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 * slide }}
            transition={{ duration: 0.22 }}
          >
            {step === 1 && (
              <fieldset>
                <legend className="text-lg font-semibold">{t("signup.step1")}</legend>
                <p className="mt-1 text-sm text-muted">{t("signup.step1Hint")}</p>
                <div className="mt-5 grid gap-3">
                  {TYPES.map(({ id, icon: Icon }) => {
                    const active = type === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setType(id)}
                        aria-pressed={active}
                        className={cn(
                          "lift relative flex items-start gap-4 rounded-2xl border bg-surface p-4 text-start shadow-sm",
                          active ? "border-accent ring-4 ring-[var(--ring)]/15" : "border-line",
                        )}
                      >
                        <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl transition-colors", active ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent")}>
                          <Icon className="size-6" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{t(`orgTypes.${id}` as MessageKey)}</span>
                          <span className="mt-0.5 block text-sm text-muted">{t(`orgTypes.${id}Desc` as MessageKey)}</span>
                        </span>
                        <AnimatePresence>
                          {active && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              className="absolute end-3 top-3 grid size-6 place-items-center rounded-full bg-accent text-accent-fg"
                            >
                              <Check className="size-3.5" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {step === 2 && (
              <fieldset className="space-y-4">
                <legend className="mb-1 text-lg font-semibold">{t("signup.step2")}</legend>
                <Field label={t("signup.orgName")} htmlFor="orgName" error={err("orgName") ?? (orgTouched && !orgOk ? t("errors.tooShort") : undefined)}>
                  <Input id="orgName" required autoFocus value={org.orgName} onChange={(e) => setOrg({ ...org, orgName: e.target.value })} aria-invalid={orgTouched && !orgOk} placeholder={t(`signup.orgNamePlaceholder_${type || "business"}` as MessageKey)} />
                </Field>
                <Field label={<>{t("signup.orgNameAr")} <span className="font-normal text-subtle">({t("common.optional")})</span></>} htmlFor="orgNameAr">
                  <Input id="orgNameAr" dir="rtl" value={org.orgNameAr} onChange={(e) => setOrg({ ...org, orgNameAr: e.target.value })} />
                </Field>
                {type === "school" && (
                  <Field label={t("signup.campuses")} hint={t("signup.campusesHint")} htmlFor="campuses">
                    <Textarea id="campuses" rows={3} value={org.campuses} onChange={(e) => setOrg({ ...org, campuses: e.target.value })} placeholder={"Al Waab\nLusail"} />
                  </Field>
                )}
              </fieldset>
            )}

            {step === 3 && (
              <fieldset className="space-y-4">
                <legend className="mb-1 text-lg font-semibold">{t("signup.step3")}</legend>
                <Field label={t("signup.yourName")} htmlFor="name" error={err("name")}>
                  <Input id="name" name="name" autoComplete="name" required defaultValue={v.name} />
                </Field>
                <Field label={t("auth.email")} htmlFor="email" error={err("email")}>
                  <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" className="text-start" required defaultValue={v.email} aria-invalid={!!err("email")} />
                </Field>
                <Field label={t("auth.password")} htmlFor="password" error={err("password")} hint={t("signup.passwordHint")}>
                  <Input id="password" name="password" type="password" autoComplete="new-password" dir="ltr" className="text-start" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  {password && (
                    <div className="flex items-center gap-2 pt-1" aria-live="polite">
                      <div className="flex flex-1 gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className={cn("h-1 flex-1 rounded-full transition-colors", i <= s ? (s === 0 ? "bg-danger" : s === 1 ? "bg-warning" : "bg-success") : "bg-sunken")}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted">{t(s === 0 ? "signup.passwordWeak" : s === 1 ? "signup.passwordOk" : "signup.passwordStrong")}</span>
                    </div>
                  )}
                </Field>
              </fieldset>
            )}
          </motion.div>
        </AnimatePresence>

        {state.error && <p className="mt-4 text-sm text-danger">{t(state.error as MessageKey)}</p>}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <Prev className="size-4" /> {t("common.back")}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button
              size="lg"
              disabled={step === 1 && !type}
              onClick={() => {
                if (step === 2 && !orgOk) {
                  setOrgTouched(true);
                  return;
                }
                setStep(step + 1);
              }}
            >
              {t("common.continue")} <Next className="size-4" />
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? t("signup.creating") : t("signup.create")}
            </Button>
          )}
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}
