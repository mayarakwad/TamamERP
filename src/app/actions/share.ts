"use server";

import { randomBytes, createHash } from "node:crypto";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { getDataset } from "@/lib/datasets";
import { getBranding } from "@/lib/branding";
import { createT } from "@/lib/i18n";
import { audit } from "@/lib/audit";
import type { ActionResult } from "./claims";

export interface ShareSnapshot {
  title: string;
  subtitle?: string;
  columns: import("@/lib/datasets/types").Column[];
  rows: { id: string; cells: Record<string, string | number | null> }[];
  org: { name: string; nameAr: string | null; logo: string | null; brandColor: string; currency: string; timezone: string; address: string | null };
  locale: "en" | "ar";
  digits: "latn" | "arab";
  generatedAt: string;
  generatedBy: string;
}

export const hashShareToken = async (token: string) => createHash("sha256").update(token).digest("hex");

/** Freeze the current rows of a table into a view-only link. */
export async function createShareLink(
  slug: string,
  dataset: string,
  query: string,
  opts: { expiresInDays: 0 | 1 | 7 | 30; allowDownload: boolean },
): Promise<ActionResult<{ url: string; expiresAt: string | null }>> {
  const ws = await getWorkspace(slug);
  if (!ws.can("exports.share")) return { ok: false, error: "empty.notAllowed" };
  const ds = getDataset(dataset);
  if (!ds || (ds.permissions && !ds.permissions.some((p) => ws.can(p)))) return { ok: false, error: "empty.notFound" };

  const locale = ws.viewer.prefs.locale;
  const result = await ds.load(ws, new URLSearchParams(query), { locale, t: createT(locale) });
  const brand = await getBranding(ws.org);
  const snapshot: ShareSnapshot = {
    title: result.title,
    subtitle: result.subtitle,
    columns: result.columns,
    rows: result.rows.map((r) => ({ id: r.id, cells: r.cells, ...(r.emphasis ? { emphasis: r.emphasis } : {}) })),
    org: { name: brand.name, nameAr: brand.nameAr, logo: brand.logo, brandColor: brand.brandColor, currency: brand.currency, timezone: brand.timezone, address: locale === "ar" ? (brand.addressAr ?? brand.address) : brand.address },
    locale,
    digits: ws.viewer.prefs.digits,
    generatedAt: new Date().toISOString(),
    generatedBy: locale === "ar" ? (ws.viewer.nameAr ?? ws.viewer.name) : ws.viewer.name,
  };

  const token = randomBytes(24).toString("base64url");
  const expiresAt = opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86400_000) : null;
  const link = await db.shareLink.create({
    data: {
      orgId: ws.org.id,
      tokenHash: await hashShareToken(token),
      dataset,
      title: [result.title, result.subtitle].filter(Boolean).join(" · "),
      snapshot: snapshot as object,
      allowDownload: opts.allowDownload,
      expiresAt,
      createdById: ws.viewer.id,
    },
  });
  await audit({
    orgId: ws.org.id,
    userId: ws.viewer.id,
    action: "share.created",
    entityType: "share",
    entityId: link.id,
    summary: `shared "${link.title}" (${result.rows.length} rows${expiresAt ? `, expires ${expiresAt.toISOString().slice(0, 10)}` : ", no expiry"}${opts.allowDownload ? ", downloads allowed" : ""})`,
    summaryAr: `مشاركة «${link.title}»`,
    sensitive: true,
  });
  return { ok: true, url: `/s/${token}`, expiresAt: expiresAt?.toISOString() ?? null };
}

export async function revokeShareLink(slug: string, id: string): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!ws.can("exports.share")) return { ok: false, error: "empty.notAllowed" };
  const link = await db.shareLink.findFirst({ where: { id, orgId: ws.org.id } });
  if (!link) return { ok: false, error: "empty.notFound" };
  await db.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "share.revoked", entityType: "share", entityId: id, summary: `revoked the link to "${link.title}"`, summaryAr: `إلغاء رابط «${link.title}»`, sensitive: true });
  refresh();
  return { ok: true };
}
