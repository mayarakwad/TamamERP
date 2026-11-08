import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { journalsDataset } from "@/lib/datasets/finance";
import { JournalsView } from "@/components/business/accounting";

export const metadata: Metadata = { title: "Journal entries" };

export default async function JournalsPage({ params, searchParams }: PageProps<"/w/[slug]/finance/journals">) {
  const { slug } = await params;
  const ws = await bizPage(slug, ["finance.view"]);
  await connection();
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(ws);
  const [result, accounts] = await Promise.all([journalsDataset.load(ws, query, { locale, t }), db.account.findMany({ where: { orgId: ws.org.id, archived: false }, orderBy: { code: "asc" } })]);
  return <JournalsView slug={slug} query={query.toString()} result={result} canShare={ws.can("exports.share")} canManage={ws.can("finance.manage")} accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, nameAr: a.nameAr, type: a.type, system: a.isSystem }))} />;
}
