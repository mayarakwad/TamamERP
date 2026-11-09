"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, requestMeta } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { parsePrefs } from "@/lib/prefs";
import { writePrefsCookie } from "./prefs";
import { createHomeDefaults } from "@/lib/demo/home";
import { ensureBusinessDefaults } from "@/lib/ledger/chart";
import { ensureSchoolDefaults } from "@/lib/school/defaults";
import { isOrgType } from "@/lib/rbac";
import { getSystem } from "@/lib/system";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 30;

// Verifying against a dummy hash when the email doesn't exist keeps response
// times similar, so attackers can't probe which emails have accounts.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("not-a-real-password-" + Math.random());
  return dummyHash;
}

function safeNext(next: FormDataEntryValue | null): string | null {
  const n = typeof next === "string" ? next : "";
  return (n.startsWith("/w/") || n.startsWith("/invite/")) && !n.startsWith("//") ? n : null;
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email };
  if (!email || !password) return { error: "auth.invalid", values };

  const { ip } = await requestMeta();
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }) : 0,
  ]);
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) {
    await audit({ action: "auth.login_blocked", summary: `Sign-in blocked for ${email} (too many attempts)`, sensitive: true });
    return { error: "auth.tooMany", values };
  }

  const user = await db.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await getDummyHash(), password), false);
  await db.loginAttempt.create({ data: { email, ip, success: ok } });

  if (!user || !ok) {
    await audit({ userId: user?.id, action: "auth.login_failed", summary: `Failed sign-in for ${email}`, sensitive: true });
    return { error: "auth.invalid", values };
  }

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const memberships = await db.membership.findMany({
    where: { userId: user.id, status: "active" },
    include: { org: { select: { id: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  const landing = memberships.find((m) => m.orgId === user.lastOrgId) ?? memberships[0];
  await audit({ orgId: landing?.orgId, userId: user.id, action: "auth.login", summary: "Signed in", summaryAr: "تسجيل الدخول", sensitive: true });
  await writePrefsCookie(parsePrefs(user.preferences));

  redirect(safeNext(formData.get("next")) ?? (landing ? `/w/${landing.org.slug}` : "/signup"));
}

export async function logout() {
  const viewer = await getViewer();
  if (viewer) await audit({ orgId: viewer.lastOrgId, userId: viewer.id, action: "auth.logout", summary: "Signed out", summaryAr: "تسجيل الخروج", sensitive: true });
  await destroySession();
  redirect("/login");
}

const signupSchema = z.object({
  type: z.string().refine(isOrgType),
  orgName: z.string().trim().min(2).max(120),
  orgNameAr: z.string().trim().max(120).optional(),
  campuses: z.string().optional(),
  locale: z.enum(["en", "ar"]),
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(200),
});

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return base || "workspace";
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.organization.findUnique({ where: { slug } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const system = await getSystem();
  if (!system.installed || !system.allowSignup) return { error: "signup.closed" };
  const raw = Object.fromEntries(
    ["type", "orgName", "orgNameAr", "campuses", "locale", "name", "email", "password"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const values = { ...raw, password: "" };
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= key === "email" ? "errors.invalidEmail" : key === "password" ? "signup.passwordHint" : "errors.required";
    }
    return { fieldErrors, values };
  }
  const d = parsed.data;

  if (await db.user.findUnique({ where: { email: d.email } })) {
    return { fieldErrors: { email: "signup.emailTaken" }, values };
  }

  const passwordHash = await hashPassword(d.password);
  const slug = await uniqueSlug(d.orgName);
  const { user, org } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: d.email, name: d.name, passwordHash, preferences: { locale: d.locale } },
    });
    const org = await tx.organization.create({
      data: { type: d.type, name: d.orgName, nameAr: d.orgNameAr || null, slug, locale: d.locale },
    });
    await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: "owner" } });
    if (d.type === "school") {
      const names = (d.campuses ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
      const list = names.length ? names : ["Main campus"];
      for (const [i, name] of list.entries()) {
        await tx.campus.create({ data: { orgId: org.id, name, code: `C${i + 1}` } });
      }
      await ensureSchoolDefaults(tx, org.id);
    }
    if (d.type === "business") {
      await tx.campus.create({ data: { orgId: org.id, name: "Main branch", nameAr: "الفرع الرئيسي", code: "MAIN" } });
      await ensureBusinessDefaults(tx, org.id);
    }
    await tx.user.update({ where: { id: user.id }, data: { lastOrgId: org.id } });
    return { user, org };
  });

  if (d.type === "home") await createHomeDefaults(db, org.id);

  await createSession(user.id);
  await audit({ orgId: org.id, userId: user.id, action: "workspace.created", entityType: "organization", entityId: org.id, summary: `Created ${org.name}`, summaryAr: `إنشاء ${org.nameAr ?? org.name}`, sensitive: true });
  await writePrefsCookie(parsePrefs({ locale: d.locale }));
  // A brand-new workspace starts with its setup guide.
  redirect(`/w/${org.slug}/welcome`);
}

export async function switchWorkspace(slug: string) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const m = await db.membership.findFirst({ where: { userId: viewer.id, org: { slug }, status: "active" } });
  if (m) await db.user.update({ where: { id: viewer.id }, data: { lastOrgId: m.orgId } });
  redirect(`/w/${slug}`);
}
