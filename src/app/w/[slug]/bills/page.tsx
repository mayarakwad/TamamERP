import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { billsDataset } from "@/lib/datasets/home";
import { BillsView } from "./bills-view";

export const metadata: Metadata = { title: "Bills" };

export default async function BillsPage({ params, searchParams }: PageProps<"/w/[slug]/bills">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "home") notFound();
  await connection();
  const sp = await searchParams;
  const { locale, t } = await getI18n();
  const [result, bills, categories] = await Promise.all([
    billsDataset.load(ws, new URLSearchParams(), { locale, t }),
    db.recurringBill.findMany({
      where: { orgId: ws.org.id },
      orderBy: [{ active: "desc" }, { nextDue: "asc" }],
      include: { category: true, payments: { orderBy: { dueOn: "desc" }, take: 13 } },
    }),
    db.expenseCategory.findMany({ where: { orgId: ws.org.id, archived: false }, orderBy: { sort: "asc" } }),
  ]);
  return (
    <BillsView
      slug={slug}
      now={new Date().toISOString()}
      result={result}
      openId={typeof sp.bill === "string" ? sp.bill : null}
      canManage={ws.can("bills.manage")}
      canShare={ws.can("exports.share")}
      categories={categories.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, icon: c.icon }))}
      bills={bills.map((b) => ({
        id: b.id,
        name: b.name,
        nameAr: b.nameAr,
        provider: b.provider,
        categoryId: b.categoryId,
        icon: b.category.icon,
        color: b.category.color,
        amount: b.amount,
        variable: b.variable,
        frequency: b.frequency as "monthly" | "quarterly" | "yearly",
        nextDue: b.nextDue.toISOString(),
        remindDaysBefore: b.remindDaysBefore,
        autopay: b.autopay,
        active: b.active,
        notes: b.notes,
        due: b.payments.find((p) => p.status === "due") ? { id: b.payments.find((p) => p.status === "due")!.id, dueOn: b.payments.find((p) => p.status === "due")!.dueOn.toISOString(), amount: b.payments.find((p) => p.status === "due")!.amount } : null,
        history: b.payments.filter((p) => p.status !== "due").map((p) => ({ id: p.id, status: p.status, dueOn: p.dueOn.toISOString(), paidOn: p.paidOn?.toISOString() ?? null, amount: p.amount })),
      }))}
    />
  );
}
