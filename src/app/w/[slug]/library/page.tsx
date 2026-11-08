import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { i18nFor, toQuery } from "@/lib/biz";
import { schoolPage } from "@/lib/school/scope";
import { booksDataset, loansDataset } from "@/lib/datasets/school";
import { LibraryView } from "@/components/school/library";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({ params, searchParams }: PageProps<"/w/[slug]/library">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["library.manage", "school.manage", "school.teach"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(s.ws);
  await connection();
  const tab = query.get("tab") === "loans" || query.get("tab") === "overdue" ? query.get("tab")! : "catalogue";
  const manage = s.ws.can("library.manage") || s.ws.can("school.manage");
  const loanQuery = new URLSearchParams(query);
  if (tab === "overdue") loanQuery.set("view", "overdue");
  const now = new Date();
  const bookScope = { orgId: s.ws.org.id, OR: [{ campusId: { in: s.campusIds } }, { campusId: null }] };
  const [result, stats, out, overdue] = await Promise.all([
    tab === "catalogue" || !manage ? booksDataset.load(s.ws, query, { locale, t }) : loansDataset.load(s.ws, loanQuery, { locale, t }),
    db.book.aggregate({ where: bookScope, _count: { _all: true }, _sum: { copies: true } }),
    db.loan.count({ where: { orgId: s.ws.org.id, returnedOn: null, student: { campusId: { in: s.campusIds } } } }),
    db.loan.count({ where: { orgId: s.ws.org.id, returnedOn: null, dueOn: { lt: now }, student: { campusId: { in: s.campusIds } } } }),
  ]);
  return (
    <LibraryView
      slug={slug}
      query={query.toString()}
      tab={manage ? (tab as "catalogue" | "loans" | "overdue") : "catalogue"}
      result={result}
      canShare={s.ws.can("exports.share")}
      canManage={manage}
      stats={{ titles: stats._count._all, copies: stats._sum.copies ?? 0, out, overdue }}
      loanDays={s.settings.loanDays}
      campuses={s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)).map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
    />
  );
}
