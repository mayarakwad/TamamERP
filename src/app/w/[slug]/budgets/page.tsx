import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorkspace } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { budgetsDataset } from "@/lib/datasets/home";
import { monthKey } from "@/lib/format";
import { BudgetsView } from "./budgets-view";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ params, searchParams }: PageProps<"/w/[slug]/budgets">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "home") notFound();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthKey(new Date(), ws.org.timezone);
  const { locale, t } = await getI18n();
  const result = await budgetsDataset.load(ws, new URLSearchParams({ month }), { locale, t });
  return <BudgetsView slug={slug} month={month} currentMonth={monthKey(new Date(), ws.org.timezone)} result={result} canManage={ws.can("budgets.manage")} canShare={ws.can("exports.share")} />;
}
