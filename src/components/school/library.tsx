"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, BookOpen, BookPlus, Check, Loader2, Search, Undo2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { Field, Input, inputClass } from "@/components/ui/input";
import { FilterChips } from "@/components/ui/filter-chips";
import { cn } from "@/lib/cn";
import { pick, type MessageKey } from "@/lib/i18n";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { ListView, selectClass, useQueryParam } from "@/components/business/list-view";
import { findRiders, lendBook, remindLoan, returnLoan, saveBook, type BookInput } from "@/app/actions/campus";

/** A little generated book cover, so the catalogue isn't a wall of text. */
function Cover({ title, color }: { title: string; color: string | null }) {
  return (
    <span className="relative grid h-10 w-7 shrink-0 place-items-center overflow-hidden rounded-[3px] text-[0.55rem] font-bold leading-none text-white shadow-sm" style={{ background: color ?? "var(--accent)" }} aria-hidden>
      <span className="absolute inset-y-0 start-0 w-1 bg-black/15" />
      {title.replace(/^(The|A)\s+/i, "").slice(0, 2).toUpperCase()}
    </span>
  );
}

export function LibraryView({ slug, query, tab, result, canShare, canManage, stats, loanDays, campuses }: { slug: string; query: string; tab: "catalogue" | "loans" | "overdue"; result: DatasetResult; canShare: boolean; canManage: boolean; stats: { titles: number; copies: number; out: number; overdue: number }; loanDays: number; campuses: { id: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { params, set, hrefWith } = useQueryParam(query);
  const [lending, setLending] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const giveBack = (id: string, title: string) =>
    start(async () => {
      const res = await returnLoan(slug, id);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("library.backIn", { title }));
      router.refresh();
    });
  const remind = (id: string) =>
    start(async () => {
      const res = await remindLoan(slug, id);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("library.reminded"));
      router.refresh();
    });
  const add = canManage && (
    <Button onClick={() => setAdding(true)}>
      <BookPlus className="size-4" /> {t("library.addBook")}
    </Button>
  );
  return (
    <ListView
      slug={slug}
      dataset={tab === "catalogue" ? "books" : "loans"}
      query={tab === "overdue" ? `${query}&view=overdue` : query}
      result={result}
      canShare={canShare}
      title={t("library.title")}
      subtitle={t("library.subtitle", { titles: fmt.number(stats.titles), copies: fmt.number(stats.copies), out: fmt.number(stats.out) })}
      primary={add}
      top={
        canManage && (
          <div className="mb-4">
            <FilterChips
              items={[
                { href: hrefWith("tab", null, ""), label: t("library.catalogue"), active: tab === "catalogue", count: stats.titles },
                { href: hrefWith("tab", "loans", ""), label: t("library.loans"), active: tab === "loans", count: stats.out },
                { href: hrefWith("tab", "overdue", ""), label: t("library.overdueTab"), active: tab === "overdue", count: stats.overdue },
              ]}
            />
          </div>
        )
      }
      filters={
        tab === "catalogue" && (
          <select aria-label={t("library.colLanguage")} className={selectClass} value={params.get("language") ?? ""} onChange={(e) => set("language", e.target.value || null)}>
            <option value="">{t("library.anyLanguage")}</option>
            {(["en", "ar", "fr", "other"] as const).map((l) => (
              <option key={l} value={l}>
                {t(`library.language_${l}`)}
              </option>
            ))}
          </select>
        )
      }
      searchPlaceholder={t("library.search")}
      emptyIcon={<BookOpen className="size-6" />}
      emptyTitle={t("library.emptyTitle")}
      emptyBody={t("library.emptyBody")}
      emptyAction={add}
      renderCell={
        tab === "catalogue"
          ? {
              title: (r: Row) => (
                <span className="flex items-center gap-3">
                  <Cover title={String(r.cells.title)} color={(r.meta?.cover as string) ?? null} />
                  <span className="font-medium" dir="auto">
                    {r.cells.title}
                  </span>
                </span>
              ),
              author: (r: Row) => <span dir="auto">{r.cells.author}</span>,
              available: (r: Row) =>
                canManage ? (
                  <span className="flex items-center justify-end gap-2">
                    <span className={cn("tabular", Number(r.cells.available) === 0 && "text-danger")}>{r.cells.available}</span>
                    <Button size="sm" variant="ghost" disabled={Number(r.cells.available) <= 0} onClick={() => setLending(r)}>
                      {t("library.issue")}
                    </Button>
                  </span>
                ) : (
                  <span className="tabular">{r.cells.available}</span>
                ),
            }
          : {
              title: (r: Row) => (
                <span className="font-medium" dir="auto">
                  {r.cells.title}
                </span>
              ),
              due: (r: Row) => (
                <span className="flex items-center gap-2">
                  <Badge tone={r.meta?.overdue ? "danger" : "neutral"}>{fmt.date(String(r.cells.due), "short")}</Badge>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => giveBack(r.id, String(r.cells.title))}>
                    <Undo2 className="size-3.5" /> {t("library.giveBack")}
                  </Button>
                  {r.meta?.overdue && (
                    <Button size="sm" variant="ghost" disabled={pending || !!r.meta?.reminded} onClick={() => remind(r.id)} title={r.meta?.reminded ? t("library.reminded") : undefined}>
                      <BellRing className="size-3.5" /> {r.meta?.reminded ? <Check className="size-3.5" /> : t("library.remind")}
                    </Button>
                  )}
                </span>
              ),
            }
      }
    >
      {canManage && (
        <>
          <LendModal slug={slug} book={lending} onClose={() => setLending(null)} loanDays={loanDays} />
          <BookSheet slug={slug} open={adding} onClose={() => setAdding(false)} campuses={campuses} />
        </>
      )}
    </ListView>
  );
}

function LendModal({ slug, book, onClose, loanDays }: { slug: string; book: Row | null; onClose: () => void; loanDays: number }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof findRiders>>>([]);
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const [was, setWas] = useState<Row | null>(null);
  if (book !== was) {
    setWas(book);
    setQ("");
    setHits([]);
    setDue(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date(new Date().getTime() + loanDays * 86400_000)));
  }
  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = setTimeout(() => findRiders(slug, "", q).then(setHits), 250);
    return () => clearTimeout(id);
  }, [q, slug]);
  const lend = (studentId: string, name: string) =>
    start(async () => {
      if (!book) return;
      const res = await lendBook(slug, book.id, studentId, due);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("library.lent", { name, date: fmt.date(`${due}T12:00:00+03:00`) }));
      onClose();
      router.refresh();
    });
  return (
    <Modal open={!!book} onOpenChange={(o) => !o && onClose()} title={book ? t("library.issueTitle", { title: String(book.cells.title) }) : ""}>
      <div className="space-y-3">
        <Field label={t("library.dueOn")} htmlFor="ln-due">
          <Input id="ln-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input autoFocus className="ps-9" placeholder={t("library.pickBorrower")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {hits.map((h) => (
          <button key={h.id} type="button" disabled={pending} onClick={() => lend(h.id, pick(locale, h.name, h.nameAr))} className="flex w-full items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-start text-sm hover:border-accent-line">
            <span className="font-medium">{pick(locale, h.name, h.nameAr)}</span>
            <span className="text-xs text-muted">{h.className}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function BookSheet({ slug, open, onClose, campuses }: { slug: string; open: boolean; onClose: () => void; campuses: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): BookInput => ({ campusId: campuses[0]?.id ?? "", title: "", author: "", isbn: "", language: "en", category: "", shelf: "", copies: 1 });
  const [form, setForm] = useState<BookInput>(blank);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) setForm(blank());
  }
  const submit = () =>
    start(async () => {
      const res = await saveBook(slug, null, form);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("library.saved"));
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !pending && onClose()}
      title={t("library.addBook")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !form.title.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("library.bookTitle")} htmlFor="bk-title">
          <Input id="bk-title" dir="auto" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
        </Field>
        <Field label={t("library.author")} htmlFor="bk-author">
          <Input id="bk-author" dir="auto" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("library.colLanguage")} htmlFor="bk-lang">
            <select id="bk-lang" className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as BookInput["language"] })}>
              {(["en", "ar", "fr", "other"] as const).map((l) => (
                <option key={l} value={l}>
                  {t(`library.language_${l}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("library.category")} htmlFor="bk-cat">
            <Input id="bk-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("library.isbn")} htmlFor="bk-isbn">
            <Input id="bk-isbn" dir="ltr" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
          </Field>
          <Field label={t("library.shelf")} htmlFor="bk-shelf">
            <Input id="bk-shelf" dir="ltr" value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} />
          </Field>
          <Field label={t("library.copies")} htmlFor="bk-copies">
            <Input id="bk-copies" inputMode="numeric" value={form.copies} onChange={(e) => setForm({ ...form, copies: Number(e.target.value.replace(/\D/g, "")) || 1 })} />
          </Field>
        </div>
        {campuses.length > 1 && (
          <Field label={t("school.campus")} htmlFor="bk-campus">
            <select id="bk-campus" className={inputClass} value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Sheet>
  );
}
