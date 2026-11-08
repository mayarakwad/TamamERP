import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { i18nFor, toQuery } from "@/lib/biz";
import { schoolPage } from "@/lib/school/scope";
import { installmentKey } from "@/lib/school/fee-ops";
import { feeInvoicesDataset } from "@/lib/datasets/school";
import { FeeInvoicesView } from "@/components/school/fee-lists";

export const metadata: Metadata = { title: "Fee invoices" };

export default async function FeeInvoicesPage({ params, searchParams }: PageProps<"/w/[slug]/fees/invoices">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["finance.view", "school.manage"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(s.ws);
  await connection();
  const now = new Date();
  const base = { orgId: s.ws.org.id, kind: "fee", student: { campusId: { in: s.campusIds } } };
  const [result, open, overdue, paid, grades] = await Promise.all([
    feeInvoicesDataset.load(s.ws, query, { locale, t }),
    db.document.count({ where: { ...base, status: { in: ["issued", "partial"] } } }),
    db.document.count({ where: { ...base, status: { in: ["issued", "partial"] }, dueDate: { lt: now } } }),
    db.document.count({ where: { ...base, status: "paid" } }),
    db.grade.findMany({ where: { orgId: s.ws.org.id }, orderBy: { level: "asc" } }),
  ]);
  return (
    <FeeInvoicesView
      slug={slug}
      query={query.toString()}
      result={result}
      canShare={s.ws.can("exports.share")}
      canManage={s.ws.can("finance.manage") || s.ws.can("school.manage")}
      counts={{ open, overdue, paid }}
      installments={[...s.settings.installments.map((inst, i) => ({ key: installmentKey(s.year.name, i), label: `${pick(locale, inst.label, inst.labelAr)} ${s.year.name}` })), { key: `${s.year.name}/reg`, label: `${t("fees.component_registration")} ${s.year.name}` }]}
      grades={grades.map((g) => ({ level: g.level, name: pick(locale, g.name, g.nameAr) }))}
    />
  );
}
