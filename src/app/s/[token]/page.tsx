import type { Metadata } from "next";
import { connection } from "next/server";
import { Clock, Download, Eye, Link2Off } from "lucide-react";
import { db } from "@/lib/db";
import { lookupShare, docFromSnapshot } from "@/lib/share";
import { formatCell } from "@/lib/datasets/format-cell";
import { columnLabel } from "@/lib/datasets/types";
import { isNumeric, generatedLine } from "@/lib/export/doc";
import { getI18n } from "@/lib/i18n/server";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Shared view", robots: { index: false, follow: false } };
export const instant = false;

/** Public, view-only page for a share link: a frozen copy of a table. */
export default async function SharedPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  await connection();
  const found = await lookupShare(token);

  if (found.state !== "ok") {
    const { t } = await getI18n();
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-sunken text-muted">{found.state === "expired" ? <Clock className="size-6" /> : <Link2Off className="size-6" />}</span>
          <h1 className="mt-5 text-xl font-semibold">{found.state === "expired" ? t("share.expiredTitle") : t("share.revokedTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("share.goneBody")}</p>
        </div>
      </main>
    );
  }

  await db.shareLink.update({ where: { id: found.link.id }, data: { views: { increment: 1 }, lastViewedAt: new Date() } });
  const doc = docFromSnapshot(found.snapshot);
  const { t, fmt } = doc;

  return (
    <main dir={doc.dir} lang={doc.locale} className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 pb-4" style={{ borderColor: doc.brand.brandColor }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {doc.brand.logo && <img src={doc.brand.logo} alt="" className="size-12 rounded-xl object-contain" />}
          <div>
            <p className="font-semibold">{doc.brand.name}</p>
            {doc.brand.address && <p className="text-xs text-muted">{doc.brand.address}</p>}
          </div>
        </div>
        <div className="text-end">
          <h1 className="text-2xl font-semibold" style={{ color: doc.brand.brandColor }}>
            {doc.title}
          </h1>
          {doc.subtitle && <p className="text-sm text-muted">{doc.subtitle}</p>}
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <p className="inline-flex items-center gap-1.5">
          <Eye className="size-3.5" /> {t("share.readOnly")} · {generatedLine(doc)}
          {found.link.expiresAt && <> · {t("share.expiresOn", { date: fmt.dateTime(found.link.expiresAt) })}</>}
        </p>
        {found.link.allowDownload && (
          <div className="flex gap-2">
            <a href={`/s/${token}/download?format=xlsx`} className={buttonClass("secondary", "sm")}>
              <Download className="size-3.5" /> Excel
            </a>
            <a href={`/s/${token}/download?format=csv`} className={buttonClass("ghost", "sm")}>
              CSV
            </a>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: doc.brand.brandColor }}>
              {doc.columns.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap text-white ${isNumeric(c) ? "text-end" : "text-start"}`}>
                  {columnLabel(c, t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {doc.rows.map((r) => (
              <tr key={r.id} className={r.emphasis === "heading" ? "bg-sunken/70 font-semibold" : r.emphasis === "total" ? "border-t-2 border-line bg-sunken/60 font-bold" : r.emphasis === "subtotal" ? "font-semibold" : "even:bg-sunken/40"}>
                {doc.columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 ${isNumeric(c) ? "tabular text-end whitespace-nowrap" : ""}`}>
                    {formatCell(c, r.cells[c.key], fmt, t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {Object.keys(doc.totals).length > 0 && (
            <tfoot className="border-t-2 font-semibold" style={{ borderColor: doc.brand.brandColor }}>
              <tr className="bg-sunken/60">
                {doc.columns.map((c, i) => (
                  <td key={c.key} className={`px-4 py-2.5 ${isNumeric(c) ? "tabular text-end" : ""}`}>
                    {i === 0 ? `${t("toolbar.total")} · ${t("toolbar.rows", { count: fmt.number(doc.rows.length) })}` : c.total ? formatCell(c, doc.totals[c.key], fmt, t) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-6 text-center text-xs text-subtle">{doc.appName}</p>
    </main>
  );
}
