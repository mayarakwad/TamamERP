import type { Metadata } from "next";
import { connection } from "next/server";
import { i18nFor, toQuery } from "@/lib/biz";
import { schoolPage } from "@/lib/school/scope";
import { feePaymentsDataset } from "@/lib/datasets/school";
import { FeePaymentsView } from "@/components/school/fee-lists";

export const metadata: Metadata = { title: "Fee payments" };

export default async function FeePaymentsPage({ params, searchParams }: PageProps<"/w/[slug]/fees/payments">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["finance.view", "school.manage"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(s.ws);
  await connection();
  const result = await feePaymentsDataset.load(s.ws, query, { locale, t });
  return <FeePaymentsView slug={slug} query={query.toString()} result={result} canShare={s.ws.can("exports.share")} canManage={s.ws.can("finance.manage") || s.ws.can("school.manage")} />;
}
