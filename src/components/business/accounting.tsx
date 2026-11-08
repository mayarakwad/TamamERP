"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BookText, Loader2, Plus, RotateCcw, Scale, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, inputClass } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/controls";
import { Combobox } from "@/components/ui/combobox";
import { formatCell } from "@/lib/datasets/format-cell";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { parseMoney } from "@/lib/money";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { reverseJournalEntry, saveAccount, saveJournalEntry } from "@/app/actions/ledger";
import { ListView, selectClass, useQueryParam } from "./list-view";

type AccountOpt = { id: string; code: string; name: string; nameAr: string | null; type: string; system: boolean };
const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());

export function AccountsView({ slug, query, result, canShare, canManage, accounts }: { slug: string; query: string; result: DatasetResult; canShare: boolean; canManage: boolean; accounts: AccountOpt[] }) {
  const { t, fmt } = useI18n();
  const [edit, setEdit] = useState<AccountOpt | "new" | null>(null);
  const balCol = result.columns.find((c) => c.key === "balance")!;
  return (
    <ListView
      slug={slug}
      dataset="accounts"
      query={query}
      result={result}
      canShare={canShare}
      title={t("nav.accounts")}
      subtitle={t("accounts.subtitle")}
      primary={
        canManage && (
          <Button onClick={() => setEdit("new")}>
            <Plus className="size-4" /> {t("accounts.new")}
          </Button>
        )
      }
      emptyIcon={<BookText className="size-6" />}
      emptyTitle={t("accounts.empty")}
      renderCell={{
        code: (r: Row) => <span className="font-mono text-xs">{r.cells.code}</span>,
        role: (r: Row) => (r.cells.role ? <Badge>{r.cells.role}</Badge> : null),
        balance: (r: Row) =>
          r.emphasis ? null : (
            <span className="inline-flex items-center gap-2">
              <span className={Number(r.cells.balance) < 0 ? "text-danger" : ""}>{formatCell(balCol, r.cells.balance, fmt, t)}</span>
              {canManage && (
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEdit(accounts.find((a) => a.id === r.id) ?? null);
                  }}
                >
                  {t("common.edit")}
                </button>
              )}
            </span>
          ),
      }}
    >
      <AccountSheet slug={slug} target={edit} onClose={() => setEdit(null)} />
    </ListView>
  );
}

function AccountSheet({ slug, target, onClose }: { slug: string; target: AccountOpt | "new" | null; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const initial = target && target !== "new" ? target : null;
  const [form, setForm] = useState({ code: "", name: "", nameAr: "", type: "expense" as "asset" | "liability" | "equity" | "income" | "expense" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [last, setLast] = useState<unknown>(null);
  if (target !== last) {
    setLast(target);
    setError(null);
    setForm(initial ? { code: initial.code, name: initial.name, nameAr: initial.nameAr ?? "", type: initial.type as typeof form.type } : { code: "", name: "", nameAr: "", type: "expense" });
  }
  const submit = () =>
    start(async () => {
      const res = await saveAccount(slug, initial?.id ?? null, form);
      if (!res.ok) return setError(t(res.error as MessageKey));
      toast.success(t("common.saved"));
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={initial ? t("accounts.edit") : t("accounts.new")}
      description={t("accounts.codeHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[8rem_1fr] gap-4">
          <Field label={t("reports.colCode")} htmlFor="ac-code">
            <Input id="ac-code" dir="ltr" inputMode="numeric" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label={t("parties.name")} htmlFor="ac-name">
            <Input id="ac-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </div>
        <Field label={t("parties.nameAr")} htmlFor="ac-name-ar">
          <Input id="ac-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
        </Field>
        {!initial?.system && (
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("accounts.type")}</p>
            <Segmented
              label={t("accounts.type")}
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              options={(["asset", "liability", "equity", "income", "expense"] as const).map((v) => ({ value: v, label: t(`accounts.type_${v}` as MessageKey) }))}
            />
          </div>
        )}
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

const SOURCE_KEYS = ["manual", "opening", "invoice", "payment", "bill", "receipt", "stock", "claim", "payroll"];

export function JournalsView({ slug, query, result, canShare, canManage, accounts }: { slug: string; query: string; result: DatasetResult; canShare: boolean; canManage: boolean; accounts: AccountOpt[] }) {
  const { t, fmt } = useI18n();
  const { params, set } = useQueryParam(query);
  const [open, setOpen] = useState(false);
  const amountCol = result.columns.find((c) => c.key === "amount")!;
  return (
    <ListView
      slug={slug}
      dataset="journals"
      query={query}
      result={result}
      canShare={canShare}
      title={t("nav.journals")}
      subtitle={result.subtitle}
      primary={
        canManage && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> {t("journals.new")}
          </Button>
        )
      }
      filters={
        <select aria-label={t("journals.colSource")} className={selectClass} value={params.get("source") ?? ""} onChange={(e) => set("source", e.target.value || null)}>
          <option value="">{t("journals.anySource")}</option>
          {SOURCE_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(`journals.src_${k}` as MessageKey)}
            </option>
          ))}
        </select>
      }
      searchPlaceholder={t("journals.search")}
      emptyIcon={<Scale className="size-6" />}
      emptyTitle={t("journals.empty")}
      renderCell={{
        number: (r: Row) => <span className={cn("font-mono text-xs", r.meta?.reversed && "text-subtle line-through")}>{r.cells.number}</span>,
        amount: (r: Row) => <span className="font-medium">{formatCell(amountCol, r.cells.amount, fmt, t)}</span>,
      }}
    >
      <EntrySheet slug={slug} open={open} onOpenChange={setOpen} accounts={accounts} />
    </ListView>
  );
}

function EntrySheet({ slug, open, onOpenChange, accounts }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; accounts: AccountOpt[] }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const blank = () => [
    { accountId: "", debit: "", credit: "", memo: "" },
    { accountId: "", debit: "", credit: "", memo: "" },
  ];
  const [lines, setLines] = useState(blank);
  const [date, setDate] = useState(todayInDoha);
  const [memo, setMemo] = useState("");
  const [kind, setKind] = useState<"manual" | "opening">("manual");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLines(blank());
      setMemo("");
      setError(null);
    }
  }
  const dr = lines.reduce((s, l) => s + (parseMoney(l.debit || "0") ?? 0), 0);
  const cr = lines.reduce((s, l) => s + (parseMoney(l.credit || "0") ?? 0), 0);
  const balanced = dr === cr && dr > 0;
  const opts = accounts.map((a) => ({ value: a.id, label: `${a.code} · ${pick(locale, a.name, a.nameAr)}`, keywords: [a.code, a.name, a.nameAr ?? ""] }));
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const submit = () =>
    start(async () => {
      const res = await saveJournalEntry(slug, { date, memo, kind, lines: lines.filter((l) => l.accountId && (l.debit || l.credit)) });
      if (!res.ok) return setError(t(res.error as MessageKey));
      toast.success(t("journals.posted"));
      onOpenChange(false);
      router.push(`/w/${slug}/finance/journals/${res.id}`);
    });
  return (
    <Sheet
      open={open}
      wide
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={t("journals.new")}
      description={t("journals.newHint")}
      footer={
        <>
          <span className={cn("me-auto text-sm tabular", balanced ? "text-success" : "text-warning")}>
            {t("reports.colDebit")} {fmt.money(dr, { decimals: true })} · {t("reports.colCredit")} {fmt.money(cr, { decimals: true })}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !balanced}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("journals.post")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label={t("docs.colDate")} htmlFor="je-date">
            <Input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("reports.colMemo")} htmlFor="je-memo">
            <Input id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t("journals.memoPlaceholder")} />
          </Field>
        </div>
        <Segmented
          label={t("journals.colSource")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "manual", label: t("journals.src_manual") },
            { value: "opening", label: t("journals.src_opening") },
          ]}
        />
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li key={i} className="grid grid-cols-[1fr_7rem_7rem_2.25rem] items-center gap-2">
              <Combobox compact value={l.accountId || null} onChange={(v) => setLine(i, { accountId: v })} options={opts} placeholder={t("reports.pickAccount")} />
              <Input dir="ltr" inputMode="decimal" placeholder={t("reports.colDebit")} value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="h-9 rounded-lg text-end text-sm tabular" aria-label={t("reports.colDebit")} />
              <Input dir="ltr" inputMode="decimal" placeholder={t("reports.colCredit")} value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="h-9 rounded-lg text-end text-sm tabular" aria-label={t("reports.colCredit")} />
              <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls))} aria-label={t("docs.removeLine")} disabled={lines.length <= 2}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="soft" size="sm" onClick={() => setLines((ls) => [...ls, { accountId: "", debit: "", credit: "", memo: "" }])}>
          <Plus className="size-3.5" /> {t("docs.addLine")}
        </Button>
        {!balanced && dr + cr > 0 && <p className="text-sm text-warning">{t("journals.notBalanced", { diff: fmt.money(Math.abs(dr - cr), { decimals: true }) })}</p>}
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

export function JournalEntryView({ slug, entry, canReverse }: { slug: string; entry: { id: string; number: string; date: string; memo: string | null; source: string; sourceHref: string | null; reversed: boolean; reverses: string | null; createdBy: string | null; lines: { id: string; code: string; name: string; nameAr: string | null; accountId: string; debit: number; credit: number; memo: string | null }[] }; canReverse: boolean }) {
  const { t, fmt, locale, dir } = useI18n();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const total = entry.lines.reduce((s, l) => s + l.debit, 0);
  const reverse = () =>
    start(async () => {
      const res = await reverseJournalEntry(slug, entry.id);
      setConfirm(false);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("journals.reversed"));
      router.refresh();
    });
  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/finance/journals`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("nav.journals")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted">{entry.number}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{entry.memo ?? t("journals.entry")}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{t(`journals.src_${entry.source}` as MessageKey)}</Badge>
            <Badge>{fmt.date(entry.date, "long")}</Badge>
            {entry.reversed && <Badge tone="warning">{t("journals.reversedBadge")}</Badge>}
            {entry.reverses && <Badge tone="info">{t("journals.reversalOf", { number: entry.reverses })}</Badge>}
          </div>
          {entry.createdBy && <p className="mt-2 text-sm text-muted">{t("journals.by", { name: entry.createdBy })}</p>}
        </div>
        <div className="flex gap-2">
          {entry.sourceHref && (
            <Link href={`/w/${slug}/${entry.sourceHref}`} className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-sunken">
              {t("journals.openSource")}
            </Link>
          )}
          {canReverse && (
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              <RotateCcw className="size-4" /> {t("journals.reverse")}
            </Button>
          )}
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-sunken/90 text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 text-start font-semibold">{t("reports.colAccount")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("reports.colMemo")}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t("reports.colDebit")}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t("reports.colCredit")}</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className={cn("px-4 py-2.5", l.credit > 0 && "ps-10")}>
                  <Link href={`/w/${slug}/reports/ledger?account=${l.accountId}`} className="hover:text-accent">
                    <span className="font-mono text-xs text-muted">{l.code}</span> {pick(locale, l.name, l.nameAr)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted">{l.memo}</td>
                <td className="px-4 py-2.5 text-end tabular">{l.debit ? fmt.money(l.debit, { decimals: true }) : ""}</td>
                <td className="px-4 py-2.5 text-end tabular">{l.credit ? fmt.money(l.credit, { decimals: true }) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-line bg-sunken/60 font-semibold">
            <tr>
              <td className="px-4 py-2.5" colSpan={2}>
                {t("payroll.total")}
              </td>
              <td className="px-4 py-2.5 text-end tabular">{fmt.money(total, { decimals: true })}</td>
              <td className="px-4 py-2.5 text-end tabular">{fmt.money(total, { decimals: true })}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <CardBody className="text-xs text-muted">{t("journals.balancedNote")}</CardBody>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={t("journals.confirmReverse", { number: entry.number })}
        description={t("journals.confirmReverseBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={reverse} disabled={pending}>
              {t("journals.reverse")}
            </Button>
          </>
        }
      />
    </div>
  );
}
