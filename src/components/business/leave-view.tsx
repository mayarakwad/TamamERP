"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Plane, Plus, X } from "lucide-react";
import { useI18n, useReducedMotion } from "@/components/providers";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Textarea, inputClass } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { celebrate } from "@/components/motion/celebrate";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { pick, type MessageKey } from "@/lib/i18n";
import { workingDays } from "@/lib/hr/ops";
import { decideLeave, requestLeave } from "@/app/actions/hr";
import { ListView } from "./list-view";

const TYPES = ["annual", "sick", "unpaid", "emergency", "maternity", "hajj"] as const;
const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());

export function LeaveView({
  slug,
  query,
  result,
  canShare,
  canApprove,
  canManage,
  balance,
  employees,
  weekend,
  counts,
  viewerIsOwner,
}: {
  slug: string;
  query: string;
  result: DatasetResult;
  canShare: boolean;
  canApprove: boolean;
  canManage: boolean;
  balance: { remaining: number; taken: number; pending: number; accrued: number } | null;
  employees: { id: string; name: string; nameAr: string | null; number: string }[];
  weekend: number[];
  counts: Record<string, number>;
  viewerIsOwner: boolean;
}) {
  const { t, fmt, locale } = useI18n();
  const reduced = useReducedMotion();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const canRequest = !!balance || canManage;
  const add = canRequest && (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> {t("hr.requestLeave")}
    </Button>
  );
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  const decide = (decision: "approve" | "reject" | "cancel") =>
    start(async () => {
      if (!selected) return;
      const res = await decideLeave(slug, selected.id, decision, note);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t(`hr.leaveDone_${decision}` as MessageKey));
      if (decision === "approve") celebrate(reduced);
      setSelected(null);
      setNote("");
      router.refresh();
    });

  return (
    <ListView
      slug={slug}
      dataset="leave"
      query={query}
      result={{ ...result, rows: result.rows.map((r) => ({ ...r, href: undefined })) }}
      canShare={canShare}
      title={t("nav.leave")}
      subtitle={canApprove ? t("hr.leaveSubtitle", { n: fmt.number(counts.submitted ?? 0) }) : t("hr.leaveSubtitleSelf")}
      primary={add}
      chips={[
        { value: null, label: t("common.all"), count: total },
        { value: "submitted", label: t("status.submitted"), count: counts.submitted ?? 0 },
        { value: "approved", label: t("status.approved"), count: counts.approved ?? 0 },
        { value: "rejected", label: t("status.rejected"), count: counts.rejected ?? 0 },
      ]}
      filters={
        balance && (
          <Card className="ms-auto flex items-center gap-4 px-4 py-2 text-sm">
            <span>
              <span className="tabular text-lg font-semibold">{fmt.number(balance.remaining)}</span> <span className="text-muted">{t("hr.daysLeft")}</span>
            </span>
            <span className="text-xs text-muted">{t("hr.balanceLine", { taken: fmt.number(balance.taken), pending: fmt.number(balance.pending) })}</span>
          </Card>
        )
      }
      emptyIcon={<Plane className="size-6" />}
      emptyTitle={t("hr.leaveEmpty")}
      emptyBody={t("hr.leaveEmptyBody")}
      emptyAction={add}
      renderCell={{
        number: (r) => (
          <button type="button" className="font-mono text-xs text-accent hover:underline" onClick={() => (setSelected(r), setNote(""))}>
            {r.cells.number}
          </button>
        ),
      }}
    >
      <LeaveSheet slug={slug} open={open} onOpenChange={setOpen} employees={canManage ? employees : []} weekend={weekend} balance={balance} />
      <Modal
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? `${selected.cells.number} · ${t(`hr.leave_${selected.cells.type}` as MessageKey)}` : ""}
        description={selected ? `${selected.cells.employee ?? ""} ${fmt.date(String(selected.cells.from))} → ${fmt.date(String(selected.cells.to))} · ${t("hr.nDays", { n: fmt.number(Number(selected.cells.days)) })}` : undefined}
        footer={
          selected && (
            <>
              {(selected.cells.status === "submitted" && (selected.meta?.own || canApprove)) || (selected.cells.status === "approved" && canApprove) ? (
                <Button variant="ghost" onClick={() => decide("cancel")} disabled={pending} className="me-auto">
                  {t("hr.cancelRequest")}
                </Button>
              ) : null}
              {canApprove && selected.cells.status === "submitted" && (!selected.meta?.own || viewerIsOwner) && (
                <>
                  <Button variant="secondary" onClick={() => decide("reject")} disabled={pending || !note.trim()}>
                    <X className="size-4" /> {t("claims.decline")}
                  </Button>
                  <Button onClick={() => decide("approve")} disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("claims.approve")}
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-3 text-sm">
            {selected.meta?.reason && <p className="rounded-xl bg-sunken/70 p-3">{String(selected.meta.reason)}</p>}
            {selected.meta?.decisionNote && (
              <p className="text-muted">
                {t("claims.declineReason")}: {String(selected.meta.decisionNote)}
              </p>
            )}
            {canApprove && selected.cells.status === "submitted" && (!selected.meta?.own || viewerIsOwner) && (
              <Field label={t("hr.declineNote")} htmlFor="lv-note">
                <Input id="lv-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </Modal>
    </ListView>
  );
}

function LeaveSheet({ slug, open, onOpenChange, employees, weekend, balance }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; employees: { id: string; name: string; nameAr: string | null; number: string }[]; weekend: number[]; balance: { remaining: number; pending: number } | null }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]>("annual");
  const [startDate, setStart] = useState(todayInDoha);
  const [endDate, setEnd] = useState(todayInDoha);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setReason("");
    }
  }
  const days = useMemo(() => (endDate >= startDate ? workingDays(new Date(`${startDate}T12:00:00+03:00`), new Date(`${endDate}T12:00:00+03:00`), weekend).length : 0), [startDate, endDate, weekend]);
  const submit = () =>
    start(async () => {
      setError(null);
      const res = await requestLeave(slug, { employeeId, type, start: startDate, end: endDate, reason });
      if (!res.ok) return setError(t(res.error as MessageKey));
      toast.success(t("hr.leaveRequested", { number: res.number }));
      onOpenChange(false);
      router.refresh();
    });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={t("hr.requestLeave")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || days === 0 || (employees.length > 0 && !employeeId && !balance)}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("hr.sendRequest")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {employees.length > 0 && (
          <Field label={t("hr.forEmployee")} hint={balance ? t("hr.forEmployeeHint") : undefined}>
            <Combobox value={employeeId} onChange={setEmployeeId} options={employees.map((e) => ({ value: e.id, label: pick(locale, e.name, e.nameAr), hint: e.number, keywords: [e.name, e.nameAr ?? "", e.number] }))} placeholder={balance ? t("hr.myself") : t("docs.pickParty")} />
          </Field>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {TYPES.map((tp) => (
            <button key={tp} type="button" onClick={() => setType(tp)} aria-pressed={type === tp} className={`rounded-xl border px-2 py-2 text-sm ${type === tp ? "border-accent bg-accent-soft font-medium text-accent" : "border-line hover:bg-sunken"}`}>
              {t(`hr.leave_${tp}` as MessageKey)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("hr.colFrom")} htmlFor="lv-from">
            <Input id="lv-from" type="date" value={startDate} onChange={(e) => (setStart(e.target.value), e.target.value > endDate && setEnd(e.target.value))} />
          </Field>
          <Field label={t("hr.colTo")} htmlFor="lv-to">
            <Input id="lv-to" type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <p className="rounded-xl bg-sunken/70 p-3 text-sm">
          {t("hr.workingDaysCount", { n: fmt.number(days) })}
          {type === "annual" && balance && !employeeId && <span className="block text-xs text-muted">{t("hr.afterThis", { n: fmt.number(balance.remaining - balance.pending - days) })}</span>}
        </p>
        <Field label={t("hr.reason")} htmlFor="lv-reason">
          <Textarea id="lv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("hr.reasonPlaceholder")} className={inputClass} />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
