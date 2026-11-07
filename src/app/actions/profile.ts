"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { destroyOtherSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import type { FormState } from "./auth";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  nameAr: z.string().trim().max(100),
  phone: z.string().trim().max(30),
});

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    nameAr: formData.get("nameAr") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { fieldErrors: { name: "errors.tooShort" } };
  await db.user.update({
    where: { id: viewer.id },
    data: { name: parsed.data.name, nameAr: parsed.data.nameAr || null, phone: parsed.data.phone || null },
  });
  await audit({ orgId: viewer.lastOrgId, userId: viewer.id, action: "profile.updated", entityType: "user", entityId: viewer.id, summary: "updated their profile", summaryAr: "تحديث الملف الشخصي" });
  refresh();
  return { error: undefined, values: { ok: "1" } };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { fieldErrors: { next: "signup.passwordHint" } };
  const user = await db.user.findUniqueOrThrow({ where: { id: viewer.id } });
  if (!(await verifyPassword(user.passwordHash, current))) {
    await audit({ orgId: viewer.lastOrgId, userId: viewer.id, action: "auth.password_change_failed", summary: "Password change failed (wrong current password)", sensitive: true });
    return { fieldErrors: { current: "settings.wrongPassword" } };
  }
  await db.user.update({ where: { id: viewer.id }, data: { passwordHash: await hashPassword(next) } });
  await destroyOtherSessions(viewer.id);
  await audit({ orgId: viewer.lastOrgId, userId: viewer.id, action: "auth.password_changed", summary: "changed their password", summaryAr: "تغيير كلمة المرور", sensitive: true });
  return { values: { ok: "1" } };
}
