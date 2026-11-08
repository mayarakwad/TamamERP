"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BadgeDollarSign, CalendarCheck, FileText, IdCard, Pencil, Plane, UserMinus, UserPlus } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Thread } from "@/components/records/thread";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { ThreadItem } from "@/lib/thread";
import { formatIban } from "@/lib/payroll/banks";
import { setEmployeeStatus } from "@/app/actions/hr";
import { EmployeeSheet, type EmployeeData } from "./employee-sheet";

const DAY = 86400_000;

export function EmployeeDetail({
  slug,
  emp,
  number,
  status,
  campusName,
  balance,
  gratuity,
  month,
  payslips,
  leave,
  thread,
  viewerId,
  now,
  canManage,
  showPay,
  campuses,
  departments,
  members,
}: {
  slug: string;
  emp: EmployeeData;
  number: string;
  status: string;
  campusName: string | null;
  balance: { entitlement: number; accrued: number; carried: number; taken: number; pending: number; remaining: number };
  gratuity: { years: number; amount: number };
  month: { present: number; late: number; absent: number; leave: number; overtimeMin: number; days: { date: string; status: string | null; off: boolean }[] };
  payslips: { id: string; month: string; net: number; status: string }[];
  leave: { id: string; number: string; type: string; from: string; to: string; days: number; status: string }[];
  thread: ThreadItem[];
  viewerId: string;
  now: string;
  canManage: boolean;
  showPay: boolean;
  campuses: { id: string; name: string; nameAr: string | null }[];
  departments: string[];
  members: { userId: string; name: string }[];
}) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const nowMs = new Date(now).getTime();
  const expiry = (d: string | null) => {
    if (!d) return null;
    const days = Math.ceil((new Date(d).getTime() - nowMs) / DAY);
    return { days, tone: days < 0 ? ("danger" as const) : days < 60 ? ("warning" as const) : ("success" as const) };
  };
  const qid = expiry(emp.qidExpiry);
  const pp = expiry(emp.passportExpiry);
  const gross = emp.basicSalary + emp.housingAllowance + emp.transportAllowance + emp.foodAllowance + emp.otherAllowance;
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const name = pick(locale, emp.name, emp.nameAr);

  const toggle = () =>
    start(async () => {
      const res = await setEmployeeStatus(slug, emp.id, status === "active" ? "terminated" : "active");
      setLeaveOpen(false);
      if (!res.ok) toast.error(t(res.error as MessageKey));
      else router.refresh();
    });

  const docRow = (label: string, value: string | null, exp: ReturnType<typeof expiry>, expDate: string | null) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-mono text-sm">{value || "—"}</p>
      </div>
      {exp && expDate && (
        <div className="text-end">
          <Badge tone={exp.tone}>{exp.days < 0 ? t("hr.expiredAgo", { days: fmt.number(-exp.days) }) : t("hr.expiresIn", { days: fmt.number(exp.days) })}</Badge>
          <p className="mt-0.5 text-xs text-subtle">{fmt.date(expDate)}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/hr/employees`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("nav.employees")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={emp.name} size={64} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-muted">
              {pick(locale, emp.jobTitle ?? "", emp.jobTitleAr)}
              {emp.department ? ` · ${emp.department}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge className="font-mono">{number}</Badge>
              <StatusBadge status={status} />
              {campusName && <Badge>{campusName}</Badge>}
              {emp.nationality && <Badge>{regions.of(emp.nationality)}</Badge>}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> {t("common.edit")}
            </Button>
            <Button variant="ghost" onClick={() => setLeaveOpen(true)}>
              {status === "active" ? <UserMinus className="size-4" /> : <UserPlus className="size-4" />}
              {t(status === "active" ? "hr.markLeft" : "hr.reactivate")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-3">
        <Card>
          <CardHeader title={t("hr.documents")} icon={<IdCard className="size-4" />} />
          <CardBody className="divide-y divide-line pt-1">
            {docRow(t("hr.qid"), emp.qid, qid, emp.qidExpiry)}
            {docRow(t("hr.passport"), emp.passportNumber, pp, emp.passportExpiry)}
            {emp.visaNumber && docRow(t("hr.visa"), emp.visaNumber, null, null)}
            <div className="py-2 text-sm">
              <p className="text-xs text-muted">{t("hr.colJoined")}</p>
              <p>
                {fmt.date(emp.joinedOn, "long")} · {t("hr.yearsService", { years: fmt.number(Math.floor(gratuity.years * 10) / 10) })}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("hr.leaveBalance")} icon={<Plane className="size-4" />} />
          <CardBody>
            <p className="tabular text-4xl font-semibold">{fmt.number(balance.remaining)}</p>
            <p className="text-sm text-muted">{t("hr.daysLeft")}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (balance.taken / Math.max(1, balance.accrued + balance.carried)) * 100)}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted">
              <dt>{t("hr.entitlement")}</dt>
              <dd className="text-end tabular">{fmt.number(balance.entitlement)}</dd>
              <dt>{t("hr.accrued")}</dt>
              <dd className="text-end tabular">{fmt.number(balance.accrued)}</dd>
              {balance.carried > 0 && (
                <>
                  <dt>{t("hr.carried")}</dt>
                  <dd className="text-end tabular">{fmt.number(balance.carried)}</dd>
                </>
              )}
              <dt>{t("hr.taken")}</dt>
              <dd className="text-end tabular">{fmt.number(balance.taken)}</dd>
              {balance.pending > 0 && (
                <>
                  <dt>{t("hr.pendingDays")}</dt>
                  <dd className="text-end tabular">{fmt.number(balance.pending)}</dd>
                </>
              )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("hr.thisMonth")} icon={<CalendarCheck className="size-4" />} action={<Link href={`/w/${slug}/hr/attendance`} className="text-sm font-medium text-accent hover:underline">{t("common.viewAll")}</Link>} />
          <CardBody>
            <div className="grid grid-cols-7 gap-1">
              {month.days.map((d) => (
                <span
                  key={d.date}
                  title={`${fmt.date(d.date)}${d.status ? ` · ${t(`hr.att_${d.status}` as MessageKey)}` : ""}`}
                  className={cn(
                    "grid aspect-square place-items-center rounded-md text-[0.65rem] tabular",
                    d.off && "text-subtle",
                    d.status === "present" && "bg-success/15 text-success",
                    d.status === "late" && "bg-warning/20 text-warning",
                    d.status === "absent" && "bg-danger/15 text-danger",
                    (d.status === "leave" || d.status === "sick") && "bg-info/15 text-info",
                    d.status === "holiday" && "bg-accent-soft text-accent",
                    !d.status && !d.off && "bg-sunken/60",
                  )}
                >
                  {fmt.number(Number(d.date.slice(8, 10)))}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">{t("hr.monthSummary", { present: fmt.number(month.present), late: fmt.number(month.late), absent: fmt.number(month.absent), leave: fmt.number(month.leave), ot: fmt.number(Math.round(month.overtimeMin / 6) / 10) })}</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-[1fr_22rem]">
        <div className="space-y-[var(--gap)]">
          {showPay && (
            <Card>
              <CardHeader title={t("hr.pay")} icon={<BadgeDollarSign className="size-4" />} />
              <CardBody className="grid gap-6 sm:grid-cols-2">
                <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
                  {(["basicSalary", "housingAllowance", "transportAllowance", "foodAllowance", "otherAllowance"] as const).map((k) =>
                    emp[k] ? (
                      <div key={k} className="contents">
                        <dt className="text-muted">{t(`hr.${k}` as MessageKey)}</dt>
                        <dd className="text-end tabular">{fmt.money(emp[k], { decimals: true })}</dd>
                      </div>
                    ) : null,
                  )}
                  <dt className="border-t border-line pt-1.5 font-semibold">{t("hr.monthlyGross")}</dt>
                  <dd className="border-t border-line pt-1.5 text-end font-semibold tabular">{fmt.money(gross, { decimals: true })}</dd>
                </dl>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted">{t("hr.payMethod")}</p>
                    <p>
                      {emp.payMethod === "bank" ? `${t("hr.payBank")} · ${emp.bankShortName ?? ""}` : t("hr.payCash")}
                    </p>
                    {emp.iban && (
                      <p className="font-mono text-xs" dir="ltr">
                        {formatIban(emp.iban)}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-sunken/70 p-3">
                    <p className="text-xs text-muted">{t("hr.gratuity")}</p>
                    <p className="tabular text-lg font-semibold">{fmt.money(gratuity.amount)}</p>
                    <p className="text-xs text-muted">{t("hr.gratuityHint")}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title={t("nav.leave")} icon={<Plane className="size-4" />} />
            <CardBody className="pt-2">
              {leave.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">{t("hr.noLeave")}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {leave.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2">
                      <span className="w-28 shrink-0 font-mono text-xs">{l.number}</span>
                      <span className="flex-1">
                        {t(`hr.leave_${l.type}` as MessageKey)}
                        <span className="block text-xs text-muted">
                          {fmt.date(l.from)} → {fmt.date(l.to)} · {t("hr.nDays", { n: fmt.number(l.days) })}
                        </span>
                      </span>
                      <StatusBadge status={l.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          {payslips.length > 0 && (
            <Card>
              <CardHeader title={t("payroll.payslips")} icon={<FileText className="size-4" />} />
              <CardBody className="pt-2">
                <ul className="divide-y divide-line text-sm">
                  {payslips.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <span className="flex-1">{fmt.monthName(new Date(`${p.month}-15T12:00:00+03:00`))}</span>
                      {showPay && <span className="tabular font-medium">{fmt.money(p.net, { decimals: true })}</span>}
                      <a href={`/api/w/${slug}/export/payslip?id=${p.id}&format=print`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {t("payroll.viewPayslip")}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
        <Thread slug={slug} entityType="employee" entityId={emp.id} items={thread} now={now} viewerId={viewerId} />
      </div>

      <EmployeeSheet slug={slug} open={editOpen} onOpenChange={setEditOpen} initial={emp} campuses={campuses} departments={departments} members={members} />
      <Modal
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t(status === "active" ? "hr.confirmLeft" : "hr.confirmReactivate", { name })}
        description={status === "active" ? t("hr.confirmLeftBody") : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant={status === "active" ? "danger" : "primary"} onClick={toggle} disabled={pending}>
              {t(status === "active" ? "hr.markLeft" : "hr.reactivate")}
            </Button>
          </>
        }
      />
    </div>
  );
}
