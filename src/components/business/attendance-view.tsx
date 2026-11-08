"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, Loader2, LogIn, LogOut } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DataToolbar } from "@/components/data/toolbar";
import { celebrate } from "@/components/motion/celebrate";
import { addMonths, monthStart } from "@/lib/format";
import type { DatasetResult } from "@/lib/datasets/types";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { clock, setAttendance } from "@/app/actions/hr";

const CODE_STATUS: Record<string, string> = { P: "present", L: "late", A: "absent", V: "leave", S: "sick", H: "holiday" };
const TONE: Record<string, string> = {
  P: "bg-success/15 text-success",
  L: "bg-warning/20 text-warning",
  A: "bg-danger/15 text-danger",
  V: "bg-info/15 text-info",
  S: "bg-info/15 text-info",
  H: "bg-accent-soft text-accent",
  "·": "text-subtle",
};
const STATUSES = ["present", "late", "absent", "leave", "sick", "holiday"] as const;

export function AttendanceView({
  slug,
  month,
  thisMonth,
  query,
  result,
  canShare,
  canManage,
  me,
  records,
}: {
  slug: string;
  month: string;
  thisMonth: string;
  query: string;
  result: DatasetResult;
  canShare: boolean;
  canManage: boolean;
  /** The signed-in person's own employee record, for the clock */
  me: { id: string; checkIn: string | null; checkOut: string | null } | null;
  /** Check-in details for the editor: employeeId|day → record */
  records: Record<string, { status: string; checkIn: string | null; checkOut: string | null; overtimeMin: number; note: string | null }>;
}) {
  const { t, fmt, dir } = useI18n();
  const reduced = useReducedMotion();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<{ employeeId: string; name: string; day: string } | null>(null);
  const [form, setForm] = useState({ status: "present", checkIn: "", checkOut: "", overtime: "", note: "" });
  const dayCols = result.columns.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.key));
  const totals = result.columns.filter((c) => c.type === "number");
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const base = `/w/${slug}/hr/attendance`;

  const openCell = (employeeId: string, name: string, day: string) => {
    if (!canManage) return;
    const r = records[`${employeeId}|${day}`];
    setForm({ status: r?.status ?? "present", checkIn: r?.checkIn ?? "", checkOut: r?.checkOut ?? "", overtime: r?.overtimeMin ? String(r.overtimeMin / 60) : "", note: r?.note ?? "" });
    setEdit({ employeeId, name, day });
  };
  const save = (clear = false) =>
    start(async () => {
      if (!edit) return;
      const res = await setAttendance(slug, edit.employeeId, edit.day, { status: clear ? "clear" : (form.status as (typeof STATUSES)[number]), checkIn: form.checkIn, checkOut: form.checkOut, overtimeMin: Math.round((Number(form.overtime) || 0) * 60), note: form.note });
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      setEdit(null);
      router.refresh();
    });
  const tap = () =>
    start(async () => {
      const res = await clock(slug);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      if (res.kind === "in") {
        toast.success(t(res.late ? "hr.checkedInLate" : "hr.checkedIn", { time: res.at }));
        if (!res.late) celebrate(reduced);
      } else toast.success(t("hr.checkedOut", { time: res.at }));
      router.refresh();
    });

  return (
    <div className="space-y-[var(--gap)]">
      <PageHeader title={t("nav.attendance")} subtitle={t("hr.attendanceSubtitle")} actions={<DataToolbar slug={slug} dataset="attendance" query={query} result={result} canShare={canShare} />} />

      {me && month === thisMonth && (
        <Card glass>
          <CardBody className="flex flex-wrap items-center gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Clock className="size-6" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">{me.checkIn ? (me.checkOut ? t("hr.doneForToday") : t("hr.atWorkSince", { time: me.checkIn })) : t("hr.notCheckedIn")}</p>
              <p className="text-sm text-muted">{me.checkIn && me.checkOut ? t("hr.workedFromTo", { from: me.checkIn, to: me.checkOut }) : t("hr.shiftHint")}</p>
            </div>
            {!me.checkOut && (
              <Button size="lg" onClick={tap} disabled={pending}>
                {pending ? <Loader2 className="size-5 animate-spin" /> : me.checkIn ? <LogOut className="size-5" /> : <LogIn className="size-5" />}
                {t(me.checkIn ? "hr.checkOut" : "hr.checkIn")}
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Link href={`${base}?month=${addMonths(month, -1)}`} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-sunken" aria-label={t("hr.prevMonth")}>
          <Prev className="size-5" />
        </Link>
        <p className="min-w-40 text-center text-lg font-semibold">{fmt.monthName(monthStart(month))}</p>
        <Link href={`${base}?month=${addMonths(month, 1)}`} className={cn("grid size-9 place-items-center rounded-xl text-muted hover:bg-sunken", month >= thisMonth && "pointer-events-none opacity-30")} aria-label={t("hr.nextMonth")}>
          <Next className="size-5" />
        </Link>
        <div className="ms-auto hidden flex-wrap gap-3 text-xs text-muted md:flex">
          {(["P", "L", "A", "V", "H"] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className={cn("grid size-5 place-items-center rounded text-[0.6rem] font-semibold", TONE[c])}>{c}</span>
              {t(`hr.att_${CODE_STATUS[c]}` as MessageKey)}
            </span>
          ))}
        </div>
      </div>

      {result.rows.length === 0 ? (
        <EmptyState icon={<Clock className="size-6" />} title={t("hr.noAttendance")} body={t("hr.noAttendanceBody")} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-sunken/90">
              <tr>
                <th className="sticky start-0 z-10 bg-sunken px-3 py-2 text-start font-semibold whitespace-nowrap text-muted">{t("hr.colName")}</th>
                {dayCols.map((c) => (
                  <th key={c.key} className="w-7 px-0.5 py-2 text-center font-semibold text-muted tabular">
                    {fmt.number(Number(c.header))}
                  </th>
                ))}
                {totals.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-end font-semibold whitespace-nowrap text-muted">
                    {t(c.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="sticky start-0 z-10 bg-surface px-3 py-1.5 font-medium whitespace-nowrap">
                    {r.href ? <Link href={`/w/${slug}/${r.href}`} className="hover:text-accent">{r.cells.name}</Link> : r.cells.name}
                  </td>
                  {dayCols.map((c) => {
                    const code = String(r.cells[c.key] ?? "");
                    return (
                      <td key={c.key} className="p-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => openCell(r.id, String(r.cells.name), c.key)}
                          disabled={!canManage || code === "·"}
                          title={`${fmt.date(`${c.key}T12:00:00+03:00`)}${code && CODE_STATUS[code] ? ` · ${t(`hr.att_${CODE_STATUS[code]}` as MessageKey)}` : ""}`}
                          className={cn("grid h-7 w-full place-items-center rounded-md font-semibold", TONE[code] ?? "text-subtle", canManage && code !== "·" && "hover:ring-2 hover:ring-accent-line")}
                        >
                          {code}
                        </button>
                      </td>
                    );
                  })}
                  {totals.map((c) => (
                    <td key={c.key} className={cn("px-2 py-1.5 text-end tabular", c.key === "absent" && Number(r.cells.absent) > 0 && "font-semibold text-danger")}>
                      {fmt.number(Number(r.cells[c.key] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit ? edit.name : ""}
        description={edit ? fmt.date(`${edit.day}T12:00:00+03:00`, "long") : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => save(true)} disabled={pending} className="me-auto">
              {t("hr.clearDay")}
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => save()} disabled={pending}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1.5">
            {STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, status: s }))} aria-pressed={form.status === s} className={cn("rounded-xl border px-2 py-2 text-sm", form.status === s ? "border-accent bg-accent-soft font-medium text-accent" : "border-line hover:bg-sunken")}>
                {t(`hr.att_${s}` as MessageKey)}
              </button>
            ))}
          </div>
          {(form.status === "present" || form.status === "late") && (
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("hr.checkIn")} htmlFor="att-in">
                <Input id="att-in" type="time" value={form.checkIn} onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))} />
              </Field>
              <Field label={t("hr.checkOut")} htmlFor="att-out">
                <Input id="att-out" type="time" value={form.checkOut} onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))} />
              </Field>
              <Field label={t("hr.overtimeHours")} htmlFor="att-ot">
                <Input id="att-ot" dir="ltr" inputMode="decimal" value={form.overtime} onChange={(e) => setForm((f) => ({ ...f, overtime: e.target.value }))} />
              </Field>
            </div>
          )}
          <Field label={t("claims.note")} htmlFor="att-note">
            <Input id="att-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
