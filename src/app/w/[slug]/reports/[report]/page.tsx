import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, bizSettings, i18nFor, toQuery } from "@/lib/biz";
import { periodOf, REPORT_DATASETS, REPORTS, type ReportId } from "@/lib/datasets/finance";
import { cashFlow } from "@/lib/ledger/reports";
import { pick } from "@/lib/i18n";
import { ReportView } from "@/components/business/reports";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: PageProps<"/w/[slug]/reports/[report]">) {
  const { slug, report } = await params;
  if (!(REPORTS as readonly string[]).includes(report)) notFound();
  const ws = await bizPage(slug, ["finance.view"]);
  await connection();
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(ws);
  const id = report as ReportId;
  const p = periodOf(ws, query);
  const [result, cf, accounts] = await Promise.all([
    REPORT_DATASETS[id].load(ws, query, { locale, t }),
    id === "cf" ? cashFlow(db, ws.org.id, p.from, p.to, ws.org.timezone) : null,
    id === "ledger" ? db.account.findMany({ where: { orgId: ws.org.id }, orderBy: { code: "asc" } }) : null,
  ]);
  return (
    <ReportView
      slug={slug}
      id={id}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      fyStart={bizSettings(ws.org).fiscalYearStartMonth ?? 1}
      months={cf?.months}
      accounts={accounts?.map((a) => ({ id: a.id, label: `${a.code} · ${pick(locale, a.name, a.nameAr)}` }))}
    />
  );
}
