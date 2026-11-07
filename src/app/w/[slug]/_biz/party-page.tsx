import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage } from "@/lib/biz";
import { monthKey, addMonths, monthStart } from "@/lib/format";
import { displayStatus } from "@/lib/datasets/sales";
import { getThread } from "@/lib/thread";
import { PartyDetail } from "@/components/business/party-detail";

/** One customer or supplier: balances, documents, payments, activity. */
export async function PartyPage({ slug, id, which }: { slug: string; id: string; which: "customer" | "supplier" }) {
  const ws = await bizPage(slug, ["finance.view"]);
  await connection();
  const party = await db.party.findFirst({ where: { id, orgId: ws.org.id } });
  if (!party || (which === "customer" ? !party.isCustomer : !party.isSupplier)) notFound();
  const now = new Date();
  const kinds = which === "customer" ? ["quote", "invoice"] : ["po", "bill"];
  const money = which === "customer" ? "invoice" : "bill";
  const thisMonth = monthKey(now, ws.org.timezone);
  const from = monthStart(addMonths(thisMonth, -11));
  const [docs, payments, thread] = await Promise.all([
    db.document.findMany({ where: { orgId: ws.org.id, partyId: id, kind: { in: kinds } }, orderBy: [{ date: "desc" }, { number: "desc" }], take: 200 }),
    db.payment.findMany({ where: { orgId: ws.org.id, partyId: id, direction: which === "customer" ? "in" : "out" }, orderBy: { date: "desc" }, take: 50 }),
    getThread(ws.org.id, "party", id),
  ]);
  const live = docs.filter((d) => d.kind === money && !["draft", "void"].includes(d.status));
  const open = live.filter((d) => d.status !== "paid");
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11));
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const d of live) if (d.date >= from) byMonth.set(monthKey(d.date, ws.org.timezone), (byMonth.get(monthKey(d.date, ws.org.timezone)) ?? 0) + d.total);

  return (
    <PartyDetail
      slug={slug}
      which={which}
      party={{ ...party }}
      stats={{
        open: open.reduce((s, d) => s + d.total - d.paid, 0),
        overdue: open.filter((d) => d.dueDate && d.dueDate < now).reduce((s, d) => s + d.total - d.paid, 0),
        year: live.filter((d) => d.date >= from).reduce((s, d) => s + d.total, 0),
        count: live.length,
      }}
      months={months.map((m) => ({ month: m, total: byMonth.get(m) ?? 0 }))}
      docs={docs.map((d) => ({ id: d.id, kind: d.kind, number: d.number, date: d.date.toISOString(), dueDate: d.dueDate?.toISOString() ?? null, total: d.total, paid: d.paid, status: displayStatus(d, now) }))}
      payments={payments.map((p) => ({ id: p.id, number: p.number, date: p.date.toISOString(), amount: p.amount, method: p.method, reference: p.reference, voided: !!p.voidedAt }))}
      thread={thread}
      viewerId={ws.viewer.id}
      now={now.toISOString()}
      canManage={ws.can("finance.manage")}
    />
  );
}
