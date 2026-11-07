"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { exportWorkspace, importWorkspace } from "@/lib/backup";
import { SETUP_CURRENCIES } from "@/lib/system/options";
import type { ActionResult } from "./claims";

const wsInput = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120),
  address: z.string().trim().max(300),
  addressAr: z.string().trim().max(300),
  phone: z.string().trim().max(30),
  email: z.union([z.email(), z.literal("")]),
  crNumber: z.string().trim().max(40),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  currency: z.enum(SETUP_CURRENCIES),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }),
  locale: z.enum(["en", "ar"]),
  weekend: z.enum(["5,6", "6,0", "5"]),
  weekStart: z.union([z.literal(0), z.literal(1), z.literal(6)]),
});
export type WorkspaceInput = z.input<typeof wsInput>;

export async function updateWorkspace(slug: string, raw: WorkspaceInput): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!ws.can("workspace.manage")) return { ok: false, error: "empty.notAllowed" };
  const p = wsInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "errors.required", field: String(p.error.issues[0]?.path[0] ?? "") };
  const d = p.data;
  const before = ws.org;
  await db.organization.update({
    where: { id: ws.org.id },
    data: { ...d, nameAr: d.nameAr || null, address: d.address || null, addressAr: d.addressAr || null, phone: d.phone || null, email: d.email || null, crNumber: d.crNumber || null },
  });
  const changed = (Object.keys(d) as (keyof typeof d)[]).filter((k) => String((before as Record<string, unknown>)[k] ?? "") !== String(d[k] ?? ""));
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "workspace.updated", entityType: "organization", entityId: ws.org.id, summary: `updated workspace settings (${changed.join(", ") || "no changes"})`, summaryAr: "تعديل إعدادات مساحة العمل", sensitive: true });
  refresh();
  return { ok: true };
}

/** Copy this workspace: a full sandbox (only you) or a fresh start (structure + members). */
export async function duplicateWorkspace(slug: string, mode: "sandbox" | "structure", name: string): Promise<ActionResult<{ slug: string; name: string }>> {
  const ws = await getWorkspace(slug);
  if (!ws.can("workspace.backup")) return { ok: false, error: "empty.notAllowed" };
  const { data, files } = await exportWorkspace(ws.org.id, true);
  const result = await importWorkspace(data, files, {
    mode: "new",
    name: name.trim() || `${ws.org.name} (${mode === "sandbox" ? "sandbox" : "copy"})`,
    sandbox: mode === "sandbox",
    structureOnly: mode === "structure",
    members: mode === "sandbox" ? "me" : "all",
    actingUserId: ws.viewer.id,
  });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "workspace.duplicated", entityType: "organization", entityId: result.orgId, summary: `duplicated this workspace as "${result.name}" (${mode})`, summaryAr: `نسخ مساحة العمل باسم «${result.name}»`, sensitive: true });
  await audit({ orgId: result.orgId, userId: ws.viewer.id, action: "workspace.created", entityType: "organization", entityId: result.orgId, summary: `created as a ${mode === "sandbox" ? "sandbox copy" : "fresh start"} of "${ws.org.name}"`, summaryAr: `إنشاء كنسخة من «${ws.org.nameAr ?? ws.org.name}»`, sensitive: true });
  return { ok: true, slug: result.slug, name: result.name };
}
