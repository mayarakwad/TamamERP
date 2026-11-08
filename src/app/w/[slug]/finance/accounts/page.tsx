import type { Metadata } from "next";
import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { accountsDataset } from "@/lib/datasets/finance";
import { AccountsView } from "@/components/business/accounting";

export const metadata: Metadata = { title: "Chart of accounts" };

export default async function AccountsPage({ params, searchParams }: PageProps<"/w/[slug]/finance/accounts">) {
  const { slug } = await params;
  const ws = await bizPage(slug, ["finance.view"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(ws);
  const [result, accounts] = await Promise.all([accountsDataset.load(ws, query, { locale, t }), db.account.findMany({ where: { orgId: ws.org.id }, orderBy: { code: "asc" } })]);
  return <AccountsView slug={slug} query={query.toString()} result={result} canShare={ws.can("exports.share")} canManage={ws.can("finance.manage")} accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, nameAr: a.nameAr, type: a.type, system: a.isSystem }))} />;
}
