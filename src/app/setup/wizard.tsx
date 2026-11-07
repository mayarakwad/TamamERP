"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Database,
  GraduationCap,
  Home,
  ImagePlus,
  KeyRound,
  Loader2,
  LockOpen,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useI18n, usePrefs, useReducedMotion } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, inputClass, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { LogoMark } from "@/components/ui/logo";
import { QuickToggles } from "@/components/appearance/quick-toggles";
import { WallpaperArt } from "@/components/appearance/wallpapers";
import { celebrate } from "@/components/motion/celebrate";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import type { SystemCheck } from "@/lib/system";
import { BRAND_COLOURS, SETUP_CURRENCIES, type SetupCurrency } from "@/lib/system/options";
import { install, recheckSystem, verifySetupKey, type InstallPayload } from "@/app/actions/setup";

type OrgType = "business" | "school" | "home";
const STEPS = ["stepWelcome", "stepPlatform", "stepAdmin", "stepWorkspace", "stepData", "stepReview"] as const;
const TYPE_ICONS = { business: Building2, school: GraduationCap, home: Home };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  installed?: boolean;
  unlocked: boolean;
  initialChecks: SystemCheck[];
  initialKey: string;
  timezones: string[];
}

export function SetupWizard({ installed, unlocked: initiallyUnlocked, initialChecks, initialKey, timezones }: Props) {
  const { t, locale, dir } = useI18n();
  const { update } = usePrefs();
  const reduced = useReducedMotion();

  const [unlocked, setUnlocked] = useState(initiallyUnlocked);
  const [checks, setChecks] = useState(initialChecks);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [platform, setPlatform] = useState<InstallPayload["platform"]>({
    instanceName: "Tamam",
    defaultLanguage: locale,
    timezone: "Asia/Qatar",
    currency: "QAR",
    allowSignup: false,
  });
  const [admin, setAdmin] = useState({ name: "", nameAr: "", email: "", phone: "", password: "", confirm: "" });
  const [ws, setWs] = useState<Omit<InstallPayload["workspace"], "type"> & { type: OrgType | "" }>({
    type: "",
    name: "",
    nameAr: "",
    brandColor: BRAND_COLOURS[0],
    address: "",
    phone: "",
    email: "",
    crNumber: "",
    campuses: "",
    fiscalYearStartMonth: 1,
    weekend: "5,6",
    weekStart: 0,
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [demo, setDemo] = useState(false);

  const [phase, setPhase] = useState<"form" | "installing" | "done">("form");
  const [progress, setProgress] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");

  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);

  const blocked = !unlocked || checks.some((c) => c.status === "fail");
  // The default product name is translated; a custom platform name is shown as typed.
  const displayName = !platform.instanceName.trim() || platform.instanceName === "Tamam" ? t("app.name") : platform.instanceName;
  const Next = dir === "rtl" ? ArrowLeft : ArrowRight;
  const Prev = dir === "rtl" ? ArrowRight : ArrowLeft;

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 1 && platform.instanceName.trim().length < 2) e.instanceName = t("errors.tooShort");
    if (s === 2) {
      if (admin.name.trim().length < 2) e.name = t("errors.tooShort");
      if (!EMAIL.test(admin.email.trim())) e.email = t("errors.invalidEmail");
      if (admin.password.length < 8) e.password = t("signup.passwordHint");
      if (admin.confirm !== admin.password) e.confirm = t("setup.passwordMismatch");
    }
    if (s === 3) {
      if (!ws.type) e.type = t("errors.required");
      if (ws.name.trim().length < 2) e.wsName = t("errors.tooShort");
      if (ws.email && !EMAIL.test(ws.email)) e.wsEmail = t("errors.invalidEmail");
    }
    if (s === 4 && demo && admin.email.trim().toLowerCase().endsWith("@tamam.demo")) e.demo = t("setup.demoEmailClash");
    return e;
  }

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        const e = validate(s);
        if (Object.keys(e).length) {
          setErrors(e);
          setStep(s);
          return;
        }
      }
    }
    setErrors({});
    setStep(to);
    setReached((r) => Math.max(r, to));
  }

  const progressSteps = [
    t("setup.progressAdmin"),
    t("setup.progressWorkspace", { name: ws.name || "…" }),
    t("setup.progressDefaults"),
    ...(demo ? [t("setup.progressDemo")] : []),
    t("setup.progressFinish"),
  ];

  async function runInstall() {
    setPhase("installing");
    setInstallError(null);
    setProgress(0);
    const fd = new FormData();
    const { confirm: _confirm, ...adminData } = admin;
    void _confirm;
    fd.append("payload", JSON.stringify({ platform, admin: adminData, workspace: ws, demo }));
    if (logo) fd.append("logo", logo);
    // Steps advance while the server works; the last one completes when it answers.
    const timer = setInterval(() => setProgress((p) => Math.min(p + 1, progressSteps.length - 1)), 600);
    let res: Awaited<ReturnType<typeof install>>;
    try {
      res = await install(fd);
    } catch {
      res = { ok: false, error: "errors.generic" };
    }
    clearInterval(timer);
    if (res.ok) {
      setProgress(progressSteps.length);
      setSlug(res.slug);
      setTimeout(() => {
        setPhase("done");
        celebrate(reduced);
      }, 450);
    } else {
      setPhase("form");
      setInstallError(t(res.error as MessageKey));
      if (res.field === "email") go(2);
      if (res.field === "logo") go(3);
    }
  }

  if (installed && phase === "form") return <AlreadyInstalled />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[21rem_minmax(0,1fr)]">
      {/* Stepper rail */}
      <aside className="relative hidden overflow-hidden border-e border-line lg:block">
        <div className="absolute inset-0 opacity-70">
          <WallpaperArt id="mashrabiya" />
        </div>
        <div className="relative flex h-full flex-col p-8">
          <div className="flex items-center gap-3">
            <LogoMark size={36} />
            <span className="text-lg font-semibold">{t("setup.title", { name: displayName })}</span>
          </div>
          <ol className="mt-12 space-y-1">
            {STEPS.map((key, i) => {
              const done = i < step || phase !== "form";
              const active = i === step && phase === "form";
              const clickable = phase === "form" && i <= reached && !blocked;
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => go(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm transition-colors",
                      active ? "bg-surface font-semibold text-fg shadow-sm" : clickable ? "text-muted hover:bg-surface/60 hover:text-fg" : "text-subtle",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors",
                        done ? "border-accent bg-accent text-accent-fg" : active ? "border-accent text-accent" : "border-line",
                      )}
                    >
                      {done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {t(`setup.${key}` as MessageKey)}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-auto text-xs text-muted">{t("app.tagline")}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-10">
          <div className="flex items-center gap-3 lg:invisible">
            <LogoMark size={30} />
            <span className="text-sm font-medium text-muted">
              {step + 1} / {STEPS.length}
            </span>
          </div>
          <QuickToggles />
        </header>
        <div className="h-1 bg-sunken lg:hidden" aria-hidden>
          <motion.div className="h-full bg-accent" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-8 sm:px-8">
          <AnimatePresence mode="wait" initial={false}>
            {phase === "done" ? (
              <Done key="done" name={displayName} slug={slug} />
            ) : phase === "installing" ? (
              <Installing key="installing" steps={progressSteps} progress={progress} />
            ) : (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: dir === "rtl" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir === "rtl" ? 20 : -20 }}
                transition={{ duration: 0.22 }}
              >
                {step === 0 && (
                  <StepWelcome
                    unlocked={unlocked}
                    checks={checks}
                    initialKey={initialKey}
                    onUnlocked={(c) => {
                      setUnlocked(true);
                      setChecks(c);
                    }}
                    onRecheck={setChecks}
                    onLanguage={(l) => {
                      update({ locale: l });
                      setPlatform((p) => ({ ...p, defaultLanguage: l }));
                    }}
                  />
                )}
                {step === 1 && <StepPlatform platform={platform} setPlatform={setPlatform} timezones={timezones} errors={errors} />}
                {step === 2 && <StepAdmin admin={admin} setAdmin={setAdmin} errors={errors} />}
                {step === 3 && <StepWorkspace ws={ws} setWs={setWs} logo={logo} logoUrl={logoUrl} setLogo={setLogo} errors={errors} />}
                {step === 4 && <StepData demo={demo} setDemo={setDemo} errors={errors} />}
                {step === 5 && <StepReview platform={platform} admin={admin} ws={ws} logoUrl={logoUrl} demo={demo} onEdit={go} />}

                {installError && (
                  <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl bg-[color-mix(in_oklch,var(--danger)_10%,var(--surface))] px-4 py-3 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {t("setup.installFailed", { reason: installError })}
                  </p>
                )}

                <div className="mt-8 flex items-center justify-between gap-3">
                  {step > 0 ? (
                    <Button variant="ghost" onClick={() => go(step - 1)}>
                      <Prev className="size-4" /> {t("common.back")}
                    </Button>
                  ) : (
                    <span />
                  )}
                  {step < STEPS.length - 1 ? (
                    <Button size="lg" disabled={blocked} onClick={() => go(step + 1)}>
                      {t("common.continue")} <Next className="size-4" />
                    </Button>
                  ) : (
                    <Button size="lg" onClick={runInstall}>
                      <Sparkles className="size-4" /> {t("setup.install")}
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ───────────────────────── Steps ─────────────────────────

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {body && <p className="mt-2 text-muted">{body}</p>}
    </div>
  );
}

function StepWelcome({
  unlocked,
  checks,
  initialKey,
  onUnlocked,
  onRecheck,
  onLanguage,
}: {
  unlocked: boolean;
  checks: SystemCheck[];
  initialKey: string;
  onUnlocked: (checks: SystemCheck[]) => void;
  onRecheck: (checks: SystemCheck[]) => void;
  onLanguage: (l: "en" | "ar") => void;
}) {
  const { t, locale } = useI18n();
  const [key, setKey] = useState(initialKey);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const autoTried = useRef(false);

  async function unlock(value: string) {
    setBusy(true);
    setWrong(false);
    const res = await verifySetupKey(value);
    setBusy(false);
    if (res.ok && res.checks) onUnlocked(res.checks);
    else setWrong(true);
  }

  // A link like /setup?key=ABCD-EFGH-JKLM unlocks straight away.
  useEffect(() => {
    if (!unlocked && initialKey && !autoTried.current) {
      autoTried.current = true;
      void unlock(initialKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Heading title={t("setup.welcomeTitle")} body={t("setup.welcomeBody")} />
      <Field label={t("setup.defaultLanguage")}>
        <div>
          <Segmented
            label={t("setup.defaultLanguage")}
            value={locale}
            onChange={onLanguage}
            options={[
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
          />
        </div>
      </Field>

      {!unlocked ? (
        <Card className="mt-6 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock(key);
            }}
          >
            <Field label={<span className="inline-flex items-center gap-2"><KeyRound className="size-4 text-accent" /> {t("setup.keyTitle")}</span>} hint={t("setup.keyHint")} error={wrong ? t("setup.keyWrong") : undefined} htmlFor="setup-key">
              <div className="flex gap-2">
                <Input
                  id="setup-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  placeholder="ABCD-EFGH-JKLM"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={wrong}
                  className="font-mono tracking-widest"
                />
                <Button type="submit" disabled={busy || key.trim().length < 12}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}
                  {t("setup.keyUnlock")}
                </Button>
              </div>
            </Field>
          </form>
        </Card>
      ) : (
        <Checks checks={checks} onRecheck={onRecheck} />
      )}
    </div>
  );
}

function Checks({ checks, onRecheck }: { checks: SystemCheck[]; onRecheck: (c: SystemCheck[]) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="size-4 text-success" /> {t("setup.keyOk")} · {t("setup.checksTitle")}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const c = await recheckSystem();
            setBusy(false);
            if (c) onRecheck(c);
          }}
        >
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> {t("setup.checkRecheck")}
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {checks.map((c, i) => {
          const Icon = c.status === "ok" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
          const tone = c.status === "ok" ? "text-success" : c.status === "warn" ? "text-warning" : "text-danger";
          const message = c.status === "warn" ? `setup.checkWarn_${c.id}` : c.status === "fail" ? `setup.checkFail_${c.id}` : null;
          return (
            <motion.li key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="flex items-start gap-3 py-2.5">
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />
              <div className="min-w-0 text-sm">
                <p>
                  {t(`setup.check_${c.id}` as MessageKey)}
                  {c.id === "node" && c.detail ? <span className="text-muted"> · {c.detail}</span> : null}
                </p>
                {message && <p className="mt-0.5 text-xs text-muted">{t(message as MessageKey, { detail: c.detail ?? "" })}</p>}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </Card>
  );
}

function StepPlatform({
  platform,
  setPlatform,
  timezones,
  errors,
}: {
  platform: InstallPayload["platform"];
  setPlatform: React.Dispatch<React.SetStateAction<InstallPayload["platform"]>>;
  timezones: string[];
  errors: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const tzLabels = useMemo(() => {
    const now = new Date();
    return timezones.map((tz) => {
      let offset = "";
      try {
        offset = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "";
      } catch {}
      return { tz, label: `${tz.replaceAll("_", " ")}${offset ? ` (${offset})` : ""}` };
    });
  }, [timezones]);
  const currencyName = useMemo(() => new Intl.DisplayNames([locale === "ar" ? "ar" : "en"], { type: "currency" }), [locale]);

  return (
    <div>
      <Heading title={t("setup.platformTitle")} body={t("setup.platformBody")} />
      <div className="grid gap-5">
        <Field label={t("setup.instanceName")} hint={t("setup.instanceNameHint")} error={errors.instanceName} htmlFor="instanceName">
          <Input id="instanceName" value={platform.instanceName} onChange={(e) => setPlatform({ ...platform, instanceName: e.target.value })} aria-invalid={!!errors.instanceName} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("setup.timezone")} htmlFor="timezone">
            <select id="timezone" className={inputClass} value={platform.timezone} onChange={(e) => setPlatform({ ...platform, timezone: e.target.value })} dir="ltr">
              {tzLabels.map((z) => (
                <option key={z.tz} value={z.tz}>
                  {z.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("setup.currency")} htmlFor="currency">
            <select id="currency" className={inputClass} value={platform.currency} onChange={(e) => setPlatform({ ...platform, currency: e.target.value as SetupCurrency })}>
              {SETUP_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} · {currencyName.of(c)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted">{t("setup.currencyHint")}</p>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("setup.signupTitle")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { value: false, title: t("setup.signupClosed"), desc: t("setup.signupClosedDesc") },
              { value: true, title: t("setup.signupOpen"), desc: t("setup.signupOpenDesc") },
            ].map((o) => (
              <ChoiceCard key={String(o.value)} active={platform.allowSignup === o.value} onClick={() => setPlatform({ ...platform, allowSignup: o.value })} title={o.title} desc={o.desc} />
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function StepAdmin({
  admin,
  setAdmin,
  errors,
}: {
  admin: { name: string; nameAr: string; email: string; phone: string; password: string; confirm: string };
  setAdmin: React.Dispatch<React.SetStateAction<{ name: string; nameAr: string; email: string; phone: string; password: string; confirm: string }>>;
  errors: Record<string, string>;
}) {
  const { t } = useI18n();
  const set = (k: keyof typeof admin) => (e: React.ChangeEvent<HTMLInputElement>) => setAdmin({ ...admin, [k]: e.target.value });
  return (
    <div>
      <Heading title={t("setup.adminTitle")} body={t("setup.adminBody")} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("settings.name")} error={errors.name} htmlFor="a-name">
          <Input id="a-name" autoComplete="name" value={admin.name} onChange={set("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label={<>{t("settings.nameAr")} <span className="font-normal text-subtle">({t("common.optional")})</span></>} htmlFor="a-nameAr">
          <Input id="a-nameAr" dir="rtl" value={admin.nameAr} onChange={set("nameAr")} />
        </Field>
        <Field label={t("auth.email")} error={errors.email} htmlFor="a-email">
          <Input id="a-email" type="email" autoComplete="email" dir="ltr" className="text-start" value={admin.email} onChange={set("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label={<>{t("settings.phone")} <span className="font-normal text-subtle">({t("common.optional")})</span></>} htmlFor="a-phone">
          <Input id="a-phone" inputMode="tel" dir="ltr" className="text-start" placeholder="+974 5555 1234" value={admin.phone} onChange={set("phone")} />
        </Field>
        <Field label={t("auth.password")} error={errors.password} hint={t("signup.passwordHint")} htmlFor="a-password">
          <Input id="a-password" type="password" autoComplete="new-password" dir="ltr" value={admin.password} onChange={set("password")} aria-invalid={!!errors.password} />
        </Field>
        <Field label={t("setup.confirmPassword")} error={errors.confirm} htmlFor="a-confirm">
          <Input id="a-confirm" type="password" autoComplete="new-password" dir="ltr" value={admin.confirm} onChange={set("confirm")} aria-invalid={!!errors.confirm} />
        </Field>
      </div>
    </div>
  );
}

type WsState = Omit<InstallPayload["workspace"], "type"> & { type: OrgType | "" };

function StepWorkspace({
  ws,
  setWs,
  logo,
  logoUrl,
  setLogo,
  errors,
}: {
  ws: WsState;
  setWs: React.Dispatch<React.SetStateAction<WsState>>;
  logo: File | null;
  logoUrl: string | null;
  setLogo: (f: File | null) => void;
  errors: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale === "ar" ? "ar-QA" : "en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15)))),
    [locale],
  );
  const set = (k: keyof WsState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setWs({ ...ws, [k]: e.target.value });

  return (
    <div>
      <Heading title={t("setup.workspaceTitle")} body={t("setup.workspaceBody")} />
      <div className="grid gap-3 sm:grid-cols-3">
        {(["business", "school", "home"] as const).map((type) => {
          const Icon = TYPE_ICONS[type];
          const active = ws.type === type;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => setWs({ ...ws, type })}
              className={cn("lift rounded-2xl border bg-surface p-4 text-start shadow-sm", active ? "border-accent ring-4 ring-[var(--ring)]/15" : errors.type ? "border-danger" : "border-line")}
            >
              <span className={cn("grid size-10 place-items-center rounded-xl transition-colors", active ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent")}>
                <Icon className="size-5" />
              </span>
              <span className="mt-3 block font-semibold">{t(`orgTypes.${type}` as MessageKey)}</span>
              <span className="mt-0.5 line-clamp-3 block text-xs text-muted">{t(`orgTypes.${type}Desc` as MessageKey)}</span>
            </button>
          );
        })}
      </div>
      {errors.type && <p className="mt-2 text-xs text-danger">{errors.type}</p>}

      <AnimatePresence>
        {ws.type && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
            <div className="grid gap-5 pt-6 sm:grid-cols-2">
              <Field label={t("signup.orgName")} error={errors.wsName} htmlFor="w-name">
                <Input id="w-name" value={ws.name} onChange={set("name")} placeholder={t(`signup.orgNamePlaceholder_${ws.type}` as MessageKey)} aria-invalid={!!errors.wsName} />
              </Field>
              <Field label={<>{t("signup.orgNameAr")} <span className="font-normal text-subtle">({t("common.optional")})</span></>} htmlFor="w-nameAr">
                <Input id="w-nameAr" dir="rtl" value={ws.nameAr} onChange={set("nameAr")} />
              </Field>

              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium">{t("setup.logo")}</p>
                <div className="flex items-center gap-4">
                  <div
                    className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-[conic-gradient(var(--sunken)_25%,transparent_0_50%,var(--sunken)_0_75%,transparent_0)] bg-[length:16px_16px]"
                    style={!logoUrl ? { background: ws.brandColor } : undefined}
                  >
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="" className="size-full object-contain p-1.5" />
                    ) : (
                      <span className="text-2xl font-semibold text-white">{(ws.name || "T").trim()[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                        <ImagePlus className="size-3.5" /> {t("setup.logoChoose")}
                      </Button>
                      {logo && (
                        <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>
                          {t("setup.logoRemove")}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted">{t("setup.logoHint")}</p>
                    {errors.logo && <p className="text-xs text-danger">{errors.logo}</p>}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setLogo(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium">{t("setup.brandColour")}</p>
                <div className="flex flex-wrap gap-2.5">
                  {BRAND_COLOURS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={ws.brandColor === c}
                      onClick={() => setWs({ ...ws, brandColor: c })}
                      className={cn("grid size-9 place-items-center rounded-full transition-transform hover:scale-110", ws.brandColor === c && "ring-2 ring-offset-2 ring-offset-bg")}
                      style={{ background: c, ["--tw-ring-color" as string]: c }}
                    >
                      {ws.brandColor === c && <Check className="size-4 text-white" />}
                    </button>
                  ))}
                  <label className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line">
                    <span aria-hidden className="absolute inset-1 rounded-full" style={{ background: "conic-gradient(from 90deg, #e34948, #eda100, #1baf7a, #2a78d6, #6250d6, #e87ba4, #e34948)" }} />
                    <input type="color" value={ws.brandColor} onChange={(e) => setWs({ ...ws, brandColor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("settings.customAccent")} />
                  </label>
                </div>
              </div>

              <Field label={t("setup.address")} htmlFor="w-address" className="sm:col-span-2">
                <Input id="w-address" value={ws.address} onChange={set("address")} placeholder={t("setup.addressPlaceholder")} />
              </Field>
              <Field label={t("setup.phone")} htmlFor="w-phone">
                <Input id="w-phone" inputMode="tel" dir="ltr" className="text-start" value={ws.phone} onChange={set("phone")} placeholder="+974 4400 0000" />
              </Field>
              <Field label={t("auth.email")} error={errors.wsEmail} htmlFor="w-email">
                <Input id="w-email" type="email" dir="ltr" className="text-start" value={ws.email} onChange={set("email")} />
              </Field>

              {ws.type !== "home" && (
                <Field label={ws.type === "school" ? t("setup.licenceNumber") : t("setup.crNumber")} htmlFor="w-cr">
                  <Input id="w-cr" dir="ltr" className="text-start" value={ws.crNumber} onChange={set("crNumber")} />
                </Field>
              )}
              {ws.type === "business" && (
                <Field label={t("setup.fiscalYear")} htmlFor="w-fy">
                  <select id="w-fy" className={inputClass} value={ws.fiscalYearStartMonth} onChange={(e) => setWs({ ...ws, fiscalYearStartMonth: Number(e.target.value) })}>
                    {months.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {ws.type === "school" && (
                <Field label={t("signup.campuses")} hint={t("signup.campusesHint")} htmlFor="w-campuses" className="sm:col-span-2">
                  <Textarea id="w-campuses" rows={3} value={ws.campuses} onChange={set("campuses")} placeholder={"Al Waab\nLusail"} />
                </Field>
              )}
              <Field label={t("setup.weekend")} htmlFor="w-weekend">
                <select id="w-weekend" className={inputClass} value={ws.weekend} onChange={(e) => setWs({ ...ws, weekend: e.target.value as WsState["weekend"] })}>
                  <option value="5,6">{t("setup.weekendFriSat")}</option>
                  <option value="6,0">{t("setup.weekendSatSun")}</option>
                  <option value="5">{t("setup.weekendFri")}</option>
                </select>
              </Field>
              <Field label={t("setup.weekStart")} htmlFor="w-weekstart">
                <select id="w-weekstart" className={inputClass} value={ws.weekStart} onChange={(e) => setWs({ ...ws, weekStart: Number(e.target.value) as WsState["weekStart"] })}>
                  <option value={0}>{t("setup.sunday")}</option>
                  <option value={6}>{t("setup.saturday")}</option>
                  <option value={1}>{t("setup.monday")}</option>
                </select>
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChoiceCard({ active, onClick, title, desc, icon }: { active: boolean; onClick: () => void; title: string; desc: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("lift relative flex items-start gap-3 rounded-2xl border bg-surface p-4 text-start shadow-sm", active ? "border-accent ring-4 ring-[var(--ring)]/15" : "border-line")}
    >
      {icon && <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent")}>{icon}</span>}
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{desc}</span>
      </span>
      {active && (
        <span className="absolute end-3 top-3 grid size-5 place-items-center rounded-full bg-accent text-accent-fg">
          <Check className="size-3" />
        </span>
      )}
    </button>
  );
}

function StepData({ demo, setDemo, errors }: { demo: boolean; setDemo: (v: boolean) => void; errors: Record<string, string> }) {
  const { t } = useI18n();
  return (
    <div>
      <Heading title={t("setup.dataTitle")} body={t("setup.dataBody")} />
      <div className="grid gap-3">
        <ChoiceCard active={!demo} onClick={() => setDemo(false)} title={t("setup.dataEmpty")} desc={t("setup.dataEmptyDesc")} icon={<Database className="size-5" />} />
        <ChoiceCard active={demo} onClick={() => setDemo(true)} title={t("setup.dataDemo")} desc={t("setup.dataDemoDesc")} icon={<Sparkles className="size-5" />} />
      </div>
      <AnimatePresence>
        {demo && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 flex items-start gap-2 rounded-xl bg-[color-mix(in_oklch,var(--warning)_12%,var(--surface))] px-4 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t("setup.dataDemoWarn")}
          </motion.p>
        )}
      </AnimatePresence>
      {errors.demo && <p className="mt-3 text-sm text-danger">{errors.demo}</p>}
    </div>
  );
}

function StepReview({
  platform,
  admin,
  ws,
  logoUrl,
  demo,
  onEdit,
}: {
  platform: InstallPayload["platform"];
  admin: { name: string; email: string };
  ws: WsState;
  logoUrl: string | null;
  demo: boolean;
  onEdit: (step: number) => void;
}) {
  const { t } = useI18n();
  const sections: { step: number; title: string; rows: [string, React.ReactNode][] }[] = [
    {
      step: 1,
      title: t("setup.stepPlatform"),
      rows: [
        [t("setup.instanceName"), platform.instanceName],
        [t("setup.defaultLanguage"), platform.defaultLanguage === "ar" ? "العربية" : "English"],
        [t("setup.timezone"), <span key="tz" dir="ltr">{platform.timezone.replaceAll("_", " ")}</span>],
        [t("setup.currency"), platform.currency],
        [t("setup.signupTitle"), platform.allowSignup ? t("setup.signupOpen") : t("setup.signupClosed")],
      ],
    },
    {
      step: 2,
      title: t("setup.stepAdmin"),
      rows: [
        [t("settings.name"), admin.name],
        [t("auth.email"), <span key="e" dir="ltr">{admin.email}</span>],
      ],
    },
    {
      step: 3,
      title: t("setup.stepWorkspace"),
      rows: [
        [t(`orgTypes.${ws.type || "business"}` as MessageKey), ws.nameAr ? `${ws.name} · ${ws.nameAr}` : ws.name],
        [t("setup.weekend"), t(ws.weekend === "5,6" ? "setup.weekendFriSat" : ws.weekend === "6,0" ? "setup.weekendSatSun" : "setup.weekendFri")],
      ],
    },
    { step: 4, title: t("setup.stepData"), rows: [["", demo ? t("setup.dataDemo") : t("setup.dataEmpty")]] },
  ];
  return (
    <div>
      <Heading title={t("setup.reviewTitle")} body={t("setup.reviewBody")} />
      <div className="space-y-3">
        {sections.map((s) => (
          <Card key={s.step} className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {s.step === 3 && (
                  <span className="grid size-6 place-items-center overflow-hidden rounded-md" style={{ background: logoUrl ? undefined : ws.brandColor }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {logoUrl && <img src={logoUrl} alt="" className="size-full object-contain" />}
                  </span>
                )}
                {s.title}
              </h2>
              <button type="button" onClick={() => onEdit(s.step)} className="text-xs font-medium text-accent hover:underline">
                {t("setup.edit")}
              </button>
            </div>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
              {s.rows.map(([k, v], i) => (
                <div key={i} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 truncate">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Installing({ steps, progress }: { steps: string[]; progress: number }) {
  const { t } = useI18n();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-live="polite">
      <Heading title={t("setup.installing")} />
      <ol className="space-y-3">
        {steps.map((s, i) => {
          const done = i < progress;
          const active = i === progress;
          return (
            <li key={s} className={cn("flex items-center gap-3 text-sm transition-colors", done ? "text-fg" : active ? "text-fg" : "text-subtle")}>
              <span className={cn("grid size-7 place-items-center rounded-full border", done ? "border-success bg-success text-white" : active ? "border-accent text-accent" : "border-line")}>
                {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : null}
              </span>
              {s}
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}

function Done({ name, slug }: { name: string; slug: string }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
      <motion.span
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="mx-auto grid size-20 place-items-center rounded-3xl bg-accent text-accent-fg shadow-lift"
      >
        <Check className="size-10" strokeWidth={3} />
      </motion.span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t("setup.doneTitle", { name })}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">{t("setup.doneBody")}</p>
      <Button size="lg" className="mt-8" onClick={() => router.push(`/w/${slug}`)}>
        {t("setup.openDashboard")}
      </Button>
    </motion.div>
  );
}

function AlreadyInstalled() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="page-enter max-w-sm text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <CheckCircle2 className="size-6" />
        </span>
        <p className="mt-5 text-lg font-semibold">{t("setup.alreadyInstalled")}</p>
        <Button className="mt-6" onClick={() => router.push("/")}>
          {t("auth.signIn")}
        </Button>
      </div>
    </div>
  );
}
