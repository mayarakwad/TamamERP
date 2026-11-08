"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Copy, KeyRound, Loader2, Mail, Pencil, Phone, Printer, Receipt, Star, Users } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { Field, Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { pick, type MessageKey } from "@/lib/i18n";
import { inviteGuardian, saveGuardian, type GuardianInput } from "@/app/actions/school";

interface GuardianData {
  id: string;
  name: string;
  nameAr: string | null;
  phone: string;
  email: string;
  qid: string;
  employer: string;
  address: string;
  addressAr: string;
  partyId: string | null;
}

export function GuardianDetail({
  slug,
  guardian: g,
  kids: children,
  invoices,
  access,
  canManage,
  canInvite,
  canMoney,
}: {
  slug: string;
  guardian: GuardianData;
  kids: { id: string; name: string; plainName: string; color: string | null; className: string; campus: string; relation: string; primary: boolean; status: string }[];
  invoices: { id: string; number: string; date: string; due: string | null; total: number; paid: number; student: string; status: string }[];
  access: { state: "on" | "invited" | "off"; email: string | null; lastLoginAt: string | null };
  canManage: boolean;
  canInvite: boolean;
  canMoney: boolean;
}) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const open = invoices.filter((d) => ["issued", "partial", "overdue"].includes(d.status));
  const balance = open.reduce((s, d) => s + d.total - d.paid, 0);
  const overdue = invoices.filter((d) => d.status === "overdue").reduce((s, d) => s + d.total - d.paid, 0);

  const invite = () =>
    start(async () => {
      const res = await inviteGuardian(slug, g.id);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      if (res.url) {
        setLink(`${window.location.origin}${res.url}`);
        toast.success(t("guardians.inviteSent", { email: g.email }));
      } else toast.success(t("guardians.linked", { email: g.email }));
      router.refresh();
    });

  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/guardians`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("guardians.title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={g.name} size={64} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{pick(locale, g.name, g.nameAr)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
              {g.phone && (
                <a href={`tel:${g.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-accent" dir="ltr">
                  <Phone className="size-3.5" /> {g.phone}
                </a>
              )}
              {g.email && (
                <a href={`mailto:${g.email}`} className="inline-flex items-center gap-1" dir="ltr">
                  <Mail className="size-3.5" /> {g.email}
                </a>
              )}
              {g.employer && <span>{g.employer}</span>}
            </div>
          </div>
        </div>
        {canManage && (
          <Button variant="secondary" onClick={() => setEdit(true)}>
            <Pencil className="size-4" /> {t("common.edit")}
          </Button>
        )}
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-3">
        <div className="space-y-[var(--gap)] lg:col-span-2">
          <Card>
            <CardHeader title={t("guardians.children")} icon={<Users className="size-4" />} />
            <CardBody className="grid gap-2 sm:grid-cols-2">
              {children.map((c) => (
                <Link key={c.id} href={`/w/${slug}/students/${c.id}`} className="lift flex items-center gap-3 rounded-xl border border-line p-3">
                  <Avatar name={c.plainName} color={c.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted">
                      {c.className} · {c.campus} · {t(`school.relation_${c.relation}` as MessageKey)}
                    </p>
                  </div>
                  {c.primary && <Star className="size-4 fill-current text-accent" aria-label={t("students.primary")} />}
                </Link>
              ))}
            </CardBody>
          </Card>
          {canMoney && (
            <Card>
              <CardHeader
                title={t("students.feesTab")}
                icon={<Receipt className="size-4" />}
                action={
                  g.partyId && (
                    <a href={`/api/w/${slug}/export/statement?party=${g.partyId}&format=print`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                      <Printer className="size-4" /> {t("guardians.statement")}
                    </a>
                  )
                }
              />
              <CardBody>
                {invoices.length ? (
                  <ul className="divide-y divide-line">
                    {invoices.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <a href={`/api/w/${slug}/export/document?id=${d.id}&format=print`} target="_blank" rel="noreferrer" className="min-w-0 hover:text-accent">
                          <span className="block font-mono text-xs">{d.number}</span>
                          <span className="block text-xs text-muted">
                            {d.student} · {fmt.date(d.date)}
                          </span>
                        </a>
                        <span className="flex items-center gap-2">
                          <span className="tabular font-medium">{fmt.money(d.total)}</span>
                          <StatusBadge status={d.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-muted">—</p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-[var(--gap)]">
          {canMoney && (
            <Card>
              <CardBody>
                <p className="text-xs text-muted">{t("students.feeBalance")}</p>
                <p className={`text-2xl font-semibold tabular ${overdue ? "text-danger" : ""}`}>{fmt.money(balance)}</p>
                {overdue > 0 && <p className="text-xs text-danger">{t("status.overdue")}: {fmt.money(overdue)}</p>}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title={t("guardians.access")} icon={<KeyRound className="size-4" />} />
            <CardBody className="space-y-3 text-sm">
              <p className="text-muted">{t("guardians.accessBody")}</p>
              {access.state === "on" ? (
                <Badge tone="success">{t("guardians.linked", { email: access.email ?? "" })}</Badge>
              ) : access.state === "invited" ? (
                <Badge tone="info">{t("guardians.accessInvited")}</Badge>
              ) : null}
              {access.state !== "on" && canInvite && (
                <Button variant="secondary" onClick={invite} disabled={pending || !g.email}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  {t("guardians.invite")}
                </Button>
              )}
              {!g.email && access.state === "off" && <p className="text-xs text-warning">{t("guardians.needEmail")}</p>}
              {link && (
                <div className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr">
                    {link}
                  </span>
                  <button type="button" aria-label={t("common.copy")} onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t("common.copied")))} className="grid size-8 place-items-center rounded-lg hover:bg-surface">
                    <Copy className="size-4" />
                  </button>
                </div>
              )}
            </CardBody>
          </Card>
          {(g.address || g.qid) && (
            <Card>
              <CardBody className="space-y-1.5 text-sm">
                {g.qid && (
                  <p className="flex justify-between gap-2">
                    <span className="text-muted">{t("students.qid")}</span>
                    <span className="font-mono text-xs">{g.qid}</span>
                  </p>
                )}
                {g.address && <p className="text-muted">{locale === "ar" && g.addressAr ? g.addressAr : g.address}</p>}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
      {canManage && <GuardianSheet slug={slug} open={edit} onOpenChange={setEdit} initial={g} />}
    </div>
  );
}

function GuardianSheet({ slug, open, onOpenChange, initial }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; initial: GuardianData }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): GuardianInput => ({ name: initial.name, nameAr: initial.nameAr ?? "", phone: initial.phone, email: initial.email, qid: initial.qid, employer: initial.employer, address: initial.address, addressAr: initial.addressAr });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) (setForm(blank()), setErrors({}));
  }
  const submit = () =>
    start(async () => {
      const res = await saveGuardian(slug, initial.id, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else toast.error(t(res.error as MessageKey));
        return;
      }
      toast.success(t("guardians.saved"));
      onOpenChange(false);
      router.refresh();
    });
  const f = (k: keyof GuardianInput, label: string, props: React.ComponentProps<"input"> = {}) => (
    <Field label={label} htmlFor={`g-${k}`} error={errors[k]}>
      <Input id={`g-${k}`} value={(form[k] as string) ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-invalid={!!errors[k]} {...props} />
    </Field>
  );
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={t("guardians.edit")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {f("name", t("guardians.colName"))}
        {f("nameAr", t("students.nameAr"), { dir: "rtl" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {f("phone", t("guardians.colPhone"), { dir: "ltr" })}
          {f("email", t("guardians.colEmail"), { dir: "ltr", type: "email" })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {f("qid", t("students.qid"), { dir: "ltr", inputMode: "numeric" })}
          {f("employer", t("guardians.employer"))}
        </div>
        {f("address", t("guardians.address"))}
        {f("addressAr", t("guardians.addressAr"), { dir: "rtl" })}
      </div>
    </Sheet>
  );
}
