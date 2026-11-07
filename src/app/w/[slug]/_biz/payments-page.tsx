import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { paymentsInDataset, paymentsOutDataset } from "@/lib/datasets/sales";
import { monthKey, monthStart } from "@/lib/format";
import { PaymentsView } from "@/components/business/payments-view";

export async function PaymentsPage({ slug, direction, sp }: { slug: string; direction: "in" | "out"; sp: Record<string, string | string[] | undefined> }) {
  const ws = await bizPage(slug, ["finance.view"]);
  const query = toQuery(sp);
  const { locale, t } = await i18nFor(ws);
  const [result, month] = await Promise.all([
    (direction === "in" ? paymentsInDataset : paymentsOutDataset).load(ws, query, { locale, t }),
    db.payment.aggregate({ where: { orgId: ws.org.id, direction, voidedAt: null, date: { gte: monthStart(monthKey(new Date(), ws.org.timezone)) } }, _sum: { amount: true } }),
  ]);
  return <PaymentsView slug={slug} direction={direction} query={query.toString()} result={result} canShare={ws.can("exports.share")} canManage={ws.can("finance.manage")} monthTotal={month._sum.amount ?? 0} />;
}
