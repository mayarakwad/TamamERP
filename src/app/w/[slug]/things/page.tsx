import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { possessionsDataset } from "@/lib/datasets/home";
import { attachmentUrl } from "@/lib/attachments";
import { ThingsView } from "./things-view";

export const metadata: Metadata = { title: "Things we own" };

export default async function ThingsPage({ params, searchParams }: PageProps<"/w/[slug]/things">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "home") notFound();
  await connection();
  const sp = await searchParams;
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "item" ? [[k, v]] : [])));
  const { locale, t } = await getI18n();
  const [result, all] = await Promise.all([possessionsDataset.load(ws, query, { locale, t }), db.possession.findMany({ where: { orgId: ws.org.id }, select: { room: true } })]);
  const itemId = typeof sp.item === "string" ? sp.item : null;
  const item = itemId ? await db.possession.findFirst({ where: { id: itemId, orgId: ws.org.id } }) : null;
  const files = item ? await db.attachment.findMany({ where: { orgId: ws.org.id, entityType: "possession", entityId: item.id }, orderBy: { createdAt: "asc" } }) : [];

  return (
    <ThingsView
      slug={slug}
      now={new Date().toISOString()}
      query={query.toString()}
      result={result}
      rooms={[...new Set(all.map((p) => p.room).filter(Boolean))] as string[]}
      canManage={ws.can("possessions.manage")}
      canShare={ws.can("exports.share")}
      item={
        item
          ? {
              id: item.id,
              name: item.name,
              nameAr: item.nameAr,
              category: item.category,
              room: item.room,
              brand: item.brand,
              model: item.model,
              serial: item.serial,
              purchasedOn: item.purchasedOn?.toISOString() ?? null,
              price: item.price,
              store: item.store,
              warrantyUntil: item.warrantyUntil?.toISOString() ?? null,
              notes: item.notes,
              files: files.map((a) => ({ id: a.id, url: attachmentUrl(slug, a.id), thumb: a.thumbPath ? attachmentUrl(slug, a.id, "thumb") : null, fileName: a.fileName, mimeType: a.mimeType })),
            }
          : null
      }
    />
  );
}
