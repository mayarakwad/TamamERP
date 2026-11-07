"use client";

import { useState, useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import { Check, ClipboardCopy, Copy, Download, FileSpreadsheet, FileText, FileType2, Link2, Loader2, Printer, Share2, Sheet as SheetIcon } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Segmented, Switch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { formatCell, rawCell } from "@/lib/datasets/format-cell";
import type { DatasetResult } from "@/lib/datasets/types";
import { createShareLink } from "@/app/actions/share";
import type { MessageKey } from "@/lib/i18n";

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Export, print, copy and share for any dataset table. */
export function DataToolbar({ slug, dataset, query, result, canShare }: { slug: string; dataset: string; query: string; result: DatasetResult; canShare: boolean }) {
  const { t, fmt, dir, locale } = useI18n();
  const [shareOpen, setShareOpen] = useState(false);
  const href = (format: string) => `/api/w/${slug}/export/${dataset}?${new URLSearchParams([...new URLSearchParams(query), ["format", format]])}`;

  async function copy() {
    const cols = result.columns;
    const tsv = [cols.map((c) => t(c.label)).join("\t"), ...result.rows.map((r) => cols.map((c) => String(rawCell(c, r.cells[c.key], t)).replace(/[\t\n]/g, " ")).join("\t"))].join("\r\n");
    const align = (c: (typeof cols)[number]) => (c.type === "money" || c.type === "number" || c.type === "percent" ? "end" : "start");
    const html = `<table dir="${dir}" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr>${cols
      .map((c) => `<th style="border:1px solid #ddd;background:#f4f1ee;padding:6px 10px;text-align:${align(c)}">${escapeHtml(t(c.label))}</th>`)
      .join("")}</tr></thead><tbody>${result.rows
      .map((r) => `<tr>${cols.map((c) => `<td style="border:1px solid #ddd;padding:6px 10px;text-align:${align(c)}">${escapeHtml(formatCell(c, r.cells[c.key], fmt, t))}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([tsv], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
    } catch {
      await navigator.clipboard.writeText(tsv);
    }
    toast.success(t("toolbar.copied", { count: fmt.number(result.rows.length) }));
  }

  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-sunken";

  return (
    <>
      <div className="flex items-center gap-1.5">
        <DropdownMenu.Root dir={dir}>
          <DropdownMenu.Trigger asChild>
            <Button variant="secondary" size="sm">
              <Download className="size-3.5" /> {t("toolbar.export")}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-xl border border-line bg-surface p-1 shadow-lift data-[state=open]:animate-[pop-in_150ms_ease-out]">
              <DropdownMenu.Item asChild className={item}>
                <a href={href("xlsx")} download>
                  <FileSpreadsheet className="size-4 text-success" /> {t("toolbar.excel")}
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild className={item}>
                <a href={href("csv")} download>
                  <SheetIcon className="size-4 text-muted" /> {t("toolbar.csv")}
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild className={item}>
                <a href={href("docx")} download>
                  <FileType2 className="size-4 text-info" /> {t("toolbar.word")}
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild className={item}>
                <a href={href("pdf")} download>
                  <FileText className="size-4 text-danger" /> {t("toolbar.pdf")}
                </a>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Button variant="ghost" size="sm" onClick={() => window.open(href("print"), "_blank", "noopener")} title={t("toolbar.print")}>
          <Printer className="size-3.5" /> <span className="hidden lg:inline">{t("toolbar.print")}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={copy} title={t("toolbar.copy")}>
          <ClipboardCopy className="size-3.5" /> <span className="hidden lg:inline">{t("toolbar.copy")}</span>
        </Button>
        {canShare && (
          <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)} title={t("toolbar.share")}>
            <Share2 className="size-3.5" /> <span className="hidden lg:inline">{t("toolbar.share")}</span>
          </Button>
        )}
      </div>
      {canShare && <ShareDialog open={shareOpen} onOpenChange={setShareOpen} slug={slug} dataset={dataset} query={query} count={result.rows.length} key={String(shareOpen)} />}
      <span className="sr-only" lang={locale} />
    </>
  );
}

function ShareDialog({ open, onOpenChange, slug, dataset, query, count }: { open: boolean; onOpenChange: (o: boolean) => void; slug: string; dataset: string; query: string; count: number }) {
  const { t, fmt } = useI18n();
  const [days, setDays] = useState<0 | 1 | 7 | 30>(7);
  const [allowDownload, setAllowDownload] = useState(false);
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () =>
    start(async () => {
      const res = await createShareLink(slug, dataset, query, { expiresInDays: days, allowDownload });
      if (res.ok) setLink({ url: `${window.location.origin}${res.url}`, expiresAt: res.expiresAt });
      else setError(t(res.error as MessageKey));
    });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={link ? t("share.ready") : t("share.title")}
      description={link ? (link.expiresAt ? t("share.expiresOn", { date: fmt.dateTime(link.expiresAt) }) : t("share.noExpiry")) : t("share.body", { count: fmt.number(count) })}
      footer={
        link ? (
          <Button onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={create} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {pending ? t("share.creating") : t("share.create")}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex gap-2">
          <Input readOnly value={link.url} dir="ltr" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(link.url);
              setCopied(true);
              toast.success(t("share.copied"));
            }}
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            {t("share.copyLink")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("share.expires")}</p>
            <Segmented
              label={t("share.expires")}
              value={days}
              onChange={setDays}
              options={[
                { value: 1, label: t("share.oneDay") },
                { value: 7, label: t("share.sevenDays", { n: fmt.number(7) }) },
                { value: 30, label: t("share.thirtyDays", { n: fmt.number(30) }) },
                { value: 0, label: t("share.never") },
              ]}
            />
          </div>
          <Switch label={t("share.allowDownload")} checked={allowDownload} onChange={setAllowDownload} />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
