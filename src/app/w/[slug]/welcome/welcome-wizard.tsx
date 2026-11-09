"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCog,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  GraduationCap,
  ImageUp,
  Landmark,
  Loader2,
  Package,
  PiggyBank,
  Plus,
  Receipt,
  SkipForward,
  Sparkles,
  Store,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { celebrate } from "@/components/motion/celebrate";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import type { OrgType, Role } from "@/lib/rbac";
import type { StepId, StepStatus } from "@/lib/onboarding";
import { confirmStep, finishOnboarding, saveBasics, saveCampus, saveInvoicing, setAdmissionsOpen, skipStep, startOnboarding } from "@/app/actions/onboarding";
import { inviteMember } from "@/app/actions/members";
import { saveBill, setBudget } from "@/app/actions/home";

const ICONS: Record<StepId, LucideIcon> = {
  basics: Building2,
  branches: Store,
  invoicing: Landmark,
  catalog: Package,
  staff: Users,
  campuses: Building2,
  year: CalendarCog,
  fees: Wallet,
  classes: GraduationCap,
  admissions: ClipboardList,
  budgets: PiggyBank,
  bills: Receipt,
  things: Armchair,
  people: UserPlus,
  flow: Sparkles,
};

interface Props {
  slug: string;
  orgType: OrgType;
  steps: StepStatus[];
  progress: { finished: number; total: number; complete: boolean };
  finished: boolean;
  initialStep: string | null;
  basics: { name: string; nameAr: string; brandColor: string; address: string; phone: string; email: string; crNumber: string; logoUrl: string | null };
  campuses: { id: string; name: string; nameAr: string }[];
  invoicing: { bankName: string; iban: string; invoiceTerms: string; invoiceNotes: string; quoteTerms: string };
  admissionsOpen: boolean;
  categories: { id: string; key: string; name: string; nameAr: string | null; budget: number }[];
  billNames: string[];
  roles: Role[];
}

function useReduced() {
  const [r] = useState(() => typeof window !== "undefined" && (document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  return r;
}

export function WelcomeWizard(p: Props) {
  const { t, dir } = useI18n();
  const router = useRouter();
  const reduced = useReduced();
  const ids = p.steps.map((s) => s.id);
  const firstOpen = p.steps.find((s) => !s.done && !s.skipped)?.id;
  const [current, setCurrent] = useState<StepId | "finish">(() => (p.initialStep && (ids as string[]).includes(p.initialStep) ? (p.initialStep as StepId) : (firstOpen ?? (p.finished ? ids[0] : "finish"))));
  const [pending, start] = useTransition();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startOnboarding(p.slug);
  }, [p.slug]);

  const index = current === "finish" ? ids.length : ids.indexOf(current);
  const status = p.steps.find((s) => s.id === current);
  const Next = dir === "rtl" ? ArrowLeft : ArrowRight;
  const Prev = dir === "rtl" ? ArrowRight : ArrowLeft;

  const go = (to: number) => {
    const target = to >= ids.length ? "finish" : ids[Math.max(0, to)];
    setCurrent(target);
    if (target === "finish") {
      start(async () => {
        await finishOnboarding(p.slug);
        celebrate(reduced);
      });
    }
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };
  const advance = () => {
    router.refresh();
    go(index + 1);
  };
  const confirmAndNext = (step: StepId) =>
    start(async () => {
      await confirmStep(p.slug, step);
      advance();
    });
  const skip = (step: StepId) =>
    start(async () => {
      await skipStep(p.slug, step);
      advance();
    });

  const pct = Math.round((p.progress.finished / p.progress.total) * 100);
  const orgName = p.basics.name;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.title", { name: orgName })}</h1>
          <p className="mt-1 text-sm text-muted">{t(`onboarding.subtitle_${p.orgType}`)}</p>
        </div>
        <Link href={`/w/${p.slug}`} className="text-sm font-medium text-muted hover:text-fg">
          {t("onboarding.later")}
        </Link>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>{t("onboarding.progress", { done: p.progress.finished, total: p.progress.total })}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sunken">
          <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <nav aria-label={t("onboarding.nav")} className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {p.steps.map((s, i) => {
            const Icon = ICONS[s.id];
            const active = s.id === current;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrent(s.id)}
                aria-current={active ? "step" : undefined}
                className={cn("flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition", active ? "border-accent-line bg-accent-soft font-medium" : "border-transparent hover:bg-sunken")}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", s.done ? "bg-success/15 text-success" : active ? "bg-accent text-accent-fg" : "bg-sunken text-muted")}>
                  {s.done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{stepTitle(t, s.id, p.orgType)}</span>
                  <span className="block text-xs text-muted">{s.done ? t("onboarding.done") : s.skipped ? t("onboarding.skipped") : s.optional ? t("onboarding.optional") : `${i + 1}/${p.steps.length}`}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <Card className="min-h-[24rem] p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={current} initial={{ opacity: 0, x: dir === "rtl" ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.2 }}>
              {current === "finish" ? (
                <Finish slug={p.slug} name={orgName} open={p.steps.filter((s) => !s.done && !s.optional).length} pending={pending} />
              ) : (
                <>
                  <StepHeader id={current} orgType={p.orgType} status={status} />
                  <div className="mt-6">
                    <StepBody {...p} step={current} pending={pending} onDone={advance} onConfirm={() => confirmAndNext(current)} />
                  </div>
                  <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                    {index > 0 && (
                      <Button variant="ghost" onClick={() => go(index - 1)}>
                        <Prev className="size-4" /> {t("onboarding.back")}
                      </Button>
                    )}
                    <div className="ms-auto flex flex-wrap gap-2">
                      {!status?.done && (
                        <Button variant="ghost" onClick={() => skip(current)} disabled={pending}>
                          <SkipForward className="size-4" /> {t("onboarding.skip")}
                        </Button>
                      )}
                      {(status?.done || LINK_ONLY.includes(current)) && (
                        <Button onClick={() => (CONFIRMABLE.includes(current) && !status?.done ? confirmAndNext(current) : go(index + 1))} disabled={pending}>
                          {pending && <Loader2 className="size-4 animate-spin" />} {CONFIRMABLE.includes(current) && !status?.done ? t("onboarding.looksRight") : t("onboarding.continue")} <Next className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}

/** Steps whose form has its own save button; the footer only offers Continue once they're done. */
const LINK_ONLY: StepId[] = ["catalog", "staff", "fees", "classes", "things", "flow", "year", "branches", "campuses", "admissions", "people", "bills"];
/** Steps the data can't confirm: "Looks right" marks them done. */
const CONFIRMABLE: StepId[] = ["year", "branches", "campuses", "admissions"];

function stepTitle(t: ReturnType<typeof useI18n>["t"], id: StepId, type: OrgType): string {
  if (id === "basics") return t(`onboarding.basics_${type}`);
  return t(`onboarding.${id}` as MessageKey);
}

function StepHeader({ id, orgType, status }: { id: StepId; orgType: OrgType; status?: StepStatus }) {
  const { t } = useI18n();
  const Icon = ICONS[id];
  const body: MessageKey = id === "basics" ? "onboarding.basicsBody" : id === "people" ? `onboarding.peopleBody_${orgType}` : (`onboarding.${id}Body` as MessageKey);
  const countsKey: Partial<Record<StepId, MessageKey>> = { catalog: "onboarding.catalogCounts", staff: "onboarding.staffCounts", fees: "onboarding.feesCounts", classes: "onboarding.classesCounts", bills: "onboarding.billsCounts", things: "onboarding.thingsCounts", people: "onboarding.peopleCounts" };
  return (
    <div className="flex items-start gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{stepTitle(t, id, orgType)}</h2>
          {status?.done ? <Badge tone="success">{t("onboarding.done")}</Badge> : status?.optional ? <Badge>{t("onboarding.optional")}</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">{t(body)}</p>
        {countsKey[id] && status && <p className="mt-2 text-sm font-medium">{t(countsKey[id]!, Object.fromEntries(Object.entries(status.counts).map(([k, v]) => [k, v])))}</p>}
      </div>
    </div>
  );
}

function OpenLink({ href, page }: { href: string; page: string }) {
  const { t } = useI18n();
  return (
    <Link href={href} className={buttonClass("secondary", "md")}>
      <ExternalLink className="size-4" /> {t("onboarding.open", { page })}
    </Link>
  );
}

function StepBody(props: Props & { step: StepId; pending: boolean; onDone: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  const { step, slug } = props;
  const base = `/w/${slug}`;
  switch (step) {
    case "basics":
      return <BasicsForm {...props} />;
    case "branches":
    case "campuses":
      return <CampusList slug={slug} campuses={props.campuses} school={props.orgType === "school"} />;
    case "invoicing":
      return <InvoicingForm slug={slug} initial={props.invoicing} onDone={props.onDone} />;
    case "catalog":
      return (
        <div className="flex flex-wrap gap-2">
          <OpenLink href={`${base}/inventory/items`} page={t("nav.items")} />
          <OpenLink href={`${base}/sales/customers`} page={t("nav.customers")} />
        </div>
      );
    case "staff":
      return (
        <div className="flex flex-wrap gap-2">
          <OpenLink href={`${base}/hr/employees`} page={t("nav.employees")} />
          <OpenLink href={`${base}/hr/payroll`} page={t("nav.payroll")} />
        </div>
      );
    case "year":
      return <OpenLink href={`${base}/settings/school`} page={t("nav.schoolSetup")} />;
    case "fees":
      return <OpenLink href={`${base}/fees/structure`} page={t("nav.fees")} />;
    case "classes":
      return (
        <div className="flex flex-wrap gap-2">
          <OpenLink href={`${base}/hr/employees`} page={t("nav.staff")} />
          <OpenLink href={`${base}/classes`} page={t("nav.classes")} />
          <OpenLink href={`${base}/students`} page={t("nav.students")} />
        </div>
      );
    case "admissions":
      return <Admissions slug={slug} open={props.admissionsOpen} />;
    case "budgets":
      return <Budgets slug={slug} categories={props.categories} onDone={props.onDone} />;
    case "bills":
      return <Bills slug={slug} categories={props.categories} existing={props.billNames} />;
    case "things":
      return <OpenLink href={`${base}/things`} page={t("nav.things")} />;
    case "people":
      return <Invite slug={slug} roles={props.roles} />;
    case "flow":
      return props.steps.find((s) => s.id === "flow")?.done ? (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" /> {t("onboarding.flowConnected")}
        </p>
      ) : (
        <Link href={`${base}/settings/flow`} className={buttonClass("primary", "md")}>
          <Sparkles className="size-4" /> {t("onboarding.flowConnect")}
        </Link>
      );
  }
}

function BasicsForm({ slug, orgType, basics, onDone }: Props & { onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState(basics);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const upload = async (file: File) => {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/w/${slug}/logo`, { method: "POST", body });
    setUploading(false);
    if (!res.ok) return toast.error(t("errors.generic"));
    router.refresh();
  };
  const save = () =>
    start(async () => {
      const r = await saveBasics(slug, { name: f.name, nameAr: f.nameAr, brandColor: f.brandColor, address: f.address, phone: f.phone, email: f.email, crNumber: f.crNumber });
      if (!r.ok) return void toast.error(t(r.error as MessageKey));
      toast.success(t("onboarding.saved"));
      onDone();
    });
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <span className="grid size-16 place-items-center overflow-hidden rounded-2xl border border-line bg-sunken">
          {basics.logoUrl ? <img src={basics.logoUrl} alt="" className="size-full object-contain" /> : <ImageUp className="size-6 text-muted" />}
        </span>
        <div>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} {basics.logoUrl ? t("onboarding.logoChange") : t("onboarding.logoUpload")}
          </Button>
          <p className="mt-1 text-xs text-muted">{t("onboarding.logoHint")}</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("onboarding.name")} htmlFor="ob-name">
          <Input id="ob-name" value={f.name} onChange={set("name")} />
        </Field>
        <Field label={t("onboarding.nameAr")} htmlFor="ob-name-ar">
          <Input id="ob-name-ar" dir="rtl" value={f.nameAr} onChange={set("nameAr")} />
        </Field>
        {orgType !== "home" && (
          <>
            <Field label={t("onboarding.address")} htmlFor="ob-address">
              <Input id="ob-address" value={f.address} onChange={set("address")} />
            </Field>
            <Field label={t(orgType === "school" ? "onboarding.crNumber_school" : "onboarding.crNumber_business")} htmlFor="ob-cr">
              <Input id="ob-cr" dir="ltr" value={f.crNumber} onChange={set("crNumber")} />
            </Field>
            <Field label={t("onboarding.phone")} htmlFor="ob-phone">
              <Input id="ob-phone" dir="ltr" value={f.phone} onChange={set("phone")} placeholder="+974" />
            </Field>
            <Field label={t("onboarding.email")} htmlFor="ob-email">
              <Input id="ob-email" dir="ltr" type="email" value={f.email} onChange={set("email")} />
            </Field>
          </>
        )}
        <Field label={t("onboarding.brandColor")} htmlFor="ob-color">
          <div className="flex items-center gap-2">
            <input id="ob-color" type="color" value={f.brandColor} onChange={set("brandColor")} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface" />
            <span className="font-mono text-sm text-muted" dir="ltr">{f.brandColor}</span>
          </div>
        </Field>
      </div>
      <Button onClick={save} disabled={pending || f.name.trim().length < 2}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("onboarding.saveContinue")}
      </Button>
    </div>
  );
}

function CampusList({ slug, campuses, school }: { slug: string; campuses: Props["campuses"]; school: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", nameAr: "" });
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const save = (id: string | null) =>
    start(async () => {
      const r = await saveCampus(slug, id, draft);
      if (!r.ok) return void toast.error(t(r.error as MessageKey));
      setEditing(null);
      setAdding(false);
      setDraft({ name: "", nameAr: "" });
      router.refresh();
    });
  const form = (id: string | null) => (
    <div className="grid gap-2 rounded-xl border border-accent-line bg-accent-soft/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <Input aria-label={t("onboarding.campusName")} placeholder={t("onboarding.campusName")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
      <Input aria-label={t("onboarding.campusNameAr")} placeholder={t("onboarding.campusNameAr")} dir="rtl" value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} />
      <Button onClick={() => save(id)} disabled={pending || draft.name.trim().length < 2}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("common.save")}
      </Button>
    </div>
  );
  return (
    <div className="space-y-2">
      {campuses.map((c) =>
        editing === c.id ? (
          <div key={c.id}>{form(c.id)}</div>
        ) : (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <Building2 className="size-4 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {c.name}
              {c.nameAr && <span className="ms-2 text-muted" dir="rtl">{c.nameAr}</span>}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(c.id);
                setAdding(false);
                setDraft({ name: c.name, nameAr: c.nameAr });
              }}
            >
              {t("onboarding.rename")}
            </Button>
          </div>
        ),
      )}
      {adding ? (
        form(null)
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setAdding(true);
            setEditing(null);
            setDraft({ name: "", nameAr: "" });
          }}
        >
          <Plus className="size-4" /> {t(school ? "onboarding.addCampus" : "onboarding.addBranch")}
        </Button>
      )}
    </div>
  );
}

function InvoicingForm({ slug, initial, onDone }: { slug: string; initial: Props["invoicing"]; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await saveInvoicing(slug, f);
      if (!r.ok) return void setError(t(r.error as MessageKey));
      toast.success(t("onboarding.saved"));
      onDone();
    });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("onboarding.bankName")} htmlFor="ob-bank">
          <Input id="ob-bank" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} placeholder="QNB" />
        </Field>
        <Field label={t("onboarding.iban")} htmlFor="ob-iban" error={error}>
          <Input id="ob-iban" dir="ltr" value={f.iban} onChange={(e) => (setF({ ...f, iban: e.target.value }), setError(null))} placeholder="QA00 XXXX 0000 0000 0000 0000 0000 0" className="font-mono" />
        </Field>
      </div>
      <Field label={t("onboarding.invoiceTerms")} htmlFor="ob-terms">
        <Textarea id="ob-terms" rows={2} value={f.invoiceTerms} onChange={(e) => setF({ ...f, invoiceTerms: e.target.value })} placeholder={t("onboarding.invoiceTermsPlaceholder")} />
      </Field>
      <Field label={t("onboarding.invoiceNotes")} htmlFor="ob-notes">
        <Input id="ob-notes" value={f.invoiceNotes} onChange={(e) => setF({ ...f, invoiceNotes: e.target.value })} placeholder={t("onboarding.invoiceNotesPlaceholder")} />
      </Field>
      <Field label={t("onboarding.quoteTerms")} htmlFor="ob-quote">
        <Input id="ob-quote" value={f.quoteTerms} onChange={(e) => setF({ ...f, quoteTerms: e.target.value })} placeholder={t("onboarding.quoteTermsPlaceholder")} />
      </Field>
      <Button onClick={save} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("onboarding.saveContinue")}
      </Button>
    </div>
  );
}

function Admissions({ slug, open }: { slug: string; open: boolean }) {
  const { t } = useI18n();
  const [on, setOn] = useState(open);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  const path = `/apply/${slug}`;
  return (
    <div className="space-y-4">
      <Switch
        checked={on}
        onChange={(v) => {
          setOn(v);
          start(async () => void (await setAdmissionsOpen(slug, v)));
        }}
        label={<span className="font-medium">{t("onboarding.admissionsOpen")}</span>}
      />
      <div>
        <div className="mb-1.5 text-sm font-medium">{t("onboarding.admissionsLink")}</div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-sunken/50 px-3 py-2">
          <a href={path} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-xs text-accent hover:underline" dir="ltr">
            {path}
          </a>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(`${location.origin}${path}`).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? t("onboarding.copied") : t("onboarding.copyLink")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Budgets({ slug, categories, onDone }: { slug: string; categories: Props["categories"]; onDone: () => void }) {
  const { t, locale, fmt } = useI18n();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(categories.map((c) => [c.id, c.budget ? String(c.budget / 100) : ""])));
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      for (const c of categories) {
        const v = values[c.id] ?? "";
        if (v !== (c.budget ? String(c.budget / 100) : "")) {
          const r = await setBudget(slug, c.id, "default", v);
          if (!r.ok) return void toast.error(t(r.error as MessageKey));
        }
      }
      await confirmStep(slug, "budgets");
      toast.success(t("onboarding.saved"));
      onDone();
    });
  const total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {categories.map((c) => (
          <label key={c.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{locale === "ar" ? (c.nameAr ?? c.name) : c.name}</span>
            <Input dir="ltr" inputMode="decimal" value={values[c.id] ?? ""} onChange={(e) => setValues({ ...values, [c.id]: e.target.value.replace(/[^\d.]/g, "") })} className="h-9 w-28 text-end tabular-nums" />
          </label>
        ))}
      </div>
      <p className="text-sm text-muted">
        {t("onboarding.budgetsHint")} · <span className="font-medium text-fg">{fmt.money(Math.round(total * 100))}</span>
      </p>
      <Button onClick={save} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("onboarding.saveContinue")}
      </Button>
    </div>
  );
}

const PRESETS = [
  { id: "kahramaa", category: "bills", provider: "Kahramaa", amount: 650, frequency: "monthly", variable: true },
  { id: "ooredoo", category: "bills", provider: "Ooredoo", amount: 450, frequency: "monthly", variable: false },
  { id: "rent", category: "bills", provider: "", amount: 12000, frequency: "monthly", variable: false },
  { id: "helper", category: "other", provider: "", amount: 1800, frequency: "monthly", variable: false },
  { id: "school", category: "school", provider: "", amount: 9000, frequency: "quarterly", variable: false },
] as const;

function nextMonthFirst() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

function Bills({ slug, categories, existing }: { slug: string; categories: Props["categories"]; existing: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [added, setAdded] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, { amount: string; due: string }>>(() => Object.fromEntries(PRESETS.map((p) => [p.id, { amount: String(p.amount), due: nextMonthFirst() }])));
  const [pending, start] = useTransition();
  const add = (p: (typeof PRESETS)[number]) =>
    start(async () => {
      const cat = categories.find((c) => c.key === p.category) ?? categories[0];
      if (!cat) return;
      const name = t(`onboarding.preset_${p.id}`);
      const r = await saveBill(slug, null, { name, nameAr: "", provider: p.provider, categoryId: cat.id, amount: values[p.id].amount, variable: p.variable, frequency: p.frequency, nextDue: values[p.id].due, remindDaysBefore: 3, autopay: false, notes: "" });
      if (!r.ok) return void toast.error(t(r.error as MessageKey));
      setAdded((a) => [...a, p.id]);
      router.refresh();
    });
  return (
    <div className="space-y-2.5">
      {PRESETS.map((p) => {
        const name = t(`onboarding.preset_${p.id}`);
        const done = added.includes(p.id) || existing.includes(name);
        return (
          <div key={p.id} className={cn("grid items-center gap-2 rounded-xl border px-3.5 py-2.5 sm:grid-cols-[1fr_7rem_9.5rem_auto]", done ? "border-success/40 bg-success/5" : "border-line")}>
            <span className="text-sm font-medium">{name}</span>
            <Input aria-label={`${name} · ${t("onboarding.billAmount")}`} dir="ltr" inputMode="decimal" disabled={done} value={values[p.id].amount} onChange={(e) => setValues({ ...values, [p.id]: { ...values[p.id], amount: e.target.value.replace(/[^\d.]/g, "") } })} className="h-9 text-end tabular-nums" />
            <Input aria-label={`${name} · ${t("onboarding.billNextDue")}`} type="date" disabled={done} value={values[p.id].due} onChange={(e) => setValues({ ...values, [p.id]: { ...values[p.id], due: e.target.value } })} className="h-9" />
            {done ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                <Check className="size-4" /> {t("onboarding.billAdded")}
              </span>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => add(p)} disabled={pending || !values[p.id].amount}>
                <Plus className="size-4" /> {t("onboarding.billAdd")}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Invite({ slug, roles }: { slug: string; roles: Role[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState({ email: "", role: roles.includes("member") ? "member" : roles.includes("teacher") ? "teacher" : roles.includes("employee") ? "employee" : roles[0], title: "" });
  const [links, setLinks] = useState<{ email: string; url: string }[]>([]);
  const [pending, start] = useTransition();
  const visibleRoles = useMemo(() => roles.filter((r) => r !== "parent"), [roles]);
  const send = () =>
    start(async () => {
      const r = await inviteMember(slug, f);
      if (!r.ok) return void toast.error(t(r.error as MessageKey));
      setLinks((l) => [{ email: f.email, url: `${location.origin}${r.url}` }, ...l]);
      setF({ ...f, email: "", title: "" });
      router.refresh();
    });
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_1fr_auto]">
        <Input aria-label={t("onboarding.inviteEmail")} placeholder={t("onboarding.inviteEmail")} type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <select aria-label={t("onboarding.inviteRole")} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
          {visibleRoles.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
        <Input aria-label={t("onboarding.inviteTitle")} placeholder={t("onboarding.inviteTitle")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Button onClick={send} disabled={pending || !f.email.includes("@")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} {t("onboarding.invite")}
        </Button>
      </div>
      {links.map((l) => (
        <div key={l.url} className="rounded-xl border border-success/40 bg-success/5 p-3 text-sm">
          <div className="font-medium">
            {l.email} · {t("onboarding.invited")}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs" dir="ltr">
              {l.url}
            </code>
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(l.url).catch(() => {})}>
              <Copy className="size-4" /> {t("onboarding.copyLink")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Finish({ slug, name, open, pending }: { slug: string; name: string; open: number; pending: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="grid size-16 place-items-center rounded-2xl bg-success/15 text-success">
        <CheckCircle2 className="size-8" />
      </motion.span>
      <h2 className="mt-5 text-2xl font-semibold">{t("onboarding.finishTitle")}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">{t("onboarding.finishBody", { name })}</p>
      {open > 0 && <p className="mt-2 text-sm text-muted">{t("onboarding.finishUnfinished", { count: open })}</p>}
      <Link href={`/w/${slug}`} className={cn(buttonClass("primary", "lg"), "mt-6", pending && "pointer-events-none opacity-60")}>
        {t("onboarding.toDashboard")}
      </Link>
    </div>
  );
}
