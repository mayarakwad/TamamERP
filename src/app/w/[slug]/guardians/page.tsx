import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { i18nFor, toQuery } from "@/lib/biz";
import { schoolPage } from "@/lib/school/scope";
import { guardiansDataset } from "@/lib/datasets/school";
import { GuardiansView } from "@/components/school/guardians-view";

export const metadata: Metadata = { title: "Parents" };

export default async function GuardiansPage({ params, searchParams }: PageProps<"/w/[slug]/guardians">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.manage", "finance.view"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(s.ws);
  await connection();
  const inScope = { orgId: s.ws.org.id, children: { some: { student: { campusId: { in: s.campusIds }, status: { in: ["active", "upcoming"] } } } } };
  const [result, all, noAccess, families] = await Promise.all([
    guardiansDataset.load(s.ws, query, { locale, t }),
    db.guardian.count({ where: inScope }),
    db.guardian.count({ where: { ...inScope, userId: null } }),
    db.studentGuardian.findMany({ where: { primary: true, orgId: s.ws.org.id, student: { campusId: { in: s.campusIds }, status: "active" } }, distinct: ["guardianId"], select: { guardianId: true } }),
  ]);
  const withBalance = await db.document.groupBy({ by: ["partyId"], where: { orgId: s.ws.org.id, kind: "fee", status: { in: ["issued", "partial"] }, student: { campusId: { in: s.campusIds } } } });
  return <GuardiansView slug={slug} query={query.toString()} result={result} canShare={s.ws.can("exports.share")} canManage={s.ws.can("school.manage")} counts={{ all, balance: withBalance.length, noAccess }} families={families.length} />;
}
