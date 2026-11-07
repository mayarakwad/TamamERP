import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { activityDataset } from "@/lib/datasets/activity";
import { addMonths, monthKey } from "@/lib/format";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activity log" };

export default async function ActivityPage({ params, searchParams }: PageProps<"/w/[slug]/settings/activity">) {
  const { slug } = await params;
  const ws = await requirePermission(slug, "audit.view");
  const sp = await searchParams;
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const { locale, t } = await getI18n();
  const [result, members] = await Promise.all([
    activityDataset.load(ws, query, { locale, t }),
    db.membership.findMany({ where: { orgId: ws.org.id }, include: { user: { select: { id: true, name: true, nameAr: true } } } }),
  ]);
  const now = monthKey(new Date(), ws.org.timezone);
  return <ActivityView slug={slug} query={query.toString()} result={result} people={members.map((m) => m.user)} months={Array.from({ length: 6 }, (_, i) => addMonths(now, -i))} canShare={ws.can("exports.share")} />;
}
