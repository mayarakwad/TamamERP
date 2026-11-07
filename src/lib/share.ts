import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { makeDoc } from "./export/doc";
import type { ShareSnapshot } from "@/app/actions/share";

export type ShareLookup =
  | { state: "ok"; link: { id: string; allowDownload: boolean; expiresAt: Date | null; createdAt: Date }; snapshot: ShareSnapshot }
  | { state: "expired" | "revoked" | "missing" };

export async function lookupShare(token: string): Promise<ShareLookup> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { state: "missing" };
  const link = await db.shareLink.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
  if (!link) return { state: "missing" };
  if (link.revokedAt) return { state: "revoked" };
  if (link.expiresAt && link.expiresAt < new Date()) return { state: "expired" };
  return { state: "ok", link, snapshot: link.snapshot as unknown as ShareSnapshot };
}

export function docFromSnapshot(s: ShareSnapshot) {
  const logoPng = s.org.logo?.startsWith("data:image/png;base64,") ? Buffer.from(s.org.logo.slice(22), "base64") : null;
  return makeDoc({
    title: s.title,
    subtitle: s.subtitle,
    columns: s.columns,
    rows: s.rows,
    brand: { name: s.locale === "ar" ? (s.org.nameAr ?? s.org.name) : s.org.name, address: s.org.address, brandColor: s.org.brandColor, logo: s.org.logo, logoPng },
    locale: s.locale,
    digits: s.digits,
    currency: s.org.currency,
    timeZone: s.org.timezone,
    generatedBy: s.generatedBy,
    appName: s.locale === "ar" ? "تمام" : "Tamam",
    generatedAt: new Date(s.generatedAt),
  });
}
