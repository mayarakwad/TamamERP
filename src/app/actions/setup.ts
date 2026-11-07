"use server";

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { cookies } from "next/headers";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parsePrefs } from "@/lib/prefs";
import { runSystemChecks, type SystemCheck } from "@/lib/system";
import { isInstalled, normalizeSetupKey, removeSetupKeyFile, setupKeyMatches } from "@/lib/system/setup-key";
import { STORAGE_DIR } from "@/lib/storage";
import { createHomeDefaults } from "@/lib/demo/home";
import { DEMO_PASSWORD, DEMO_PEOPLE, seedWorkspaces } from "@/lib/demo/workspaces";
import { writePrefsCookie } from "./prefs";
import { SETUP_CURRENCIES } from "@/lib/system/options";

const SETUP_COOKIE = "tamam_setup";

async function hasSetupAccess(): Promise<boolean> {
  const key = (await cookies()).get(SETUP_COOKIE)?.value;
  if (!key) return false;
  const setting = await db.systemSetting.findUnique({ where: { id: 1 } });
  return setupKeyMatches(key, setting?.setupKeyHash);
}

/** Check the one-time key from the server's terminal and remember it for this browser. */
export async function verifySetupKey(key: string): Promise<{ ok: boolean; checks?: SystemCheck[] }> {
  if (await isInstalled(db)) return { ok: false };
  const setting = await db.systemSetting.findUnique({ where: { id: 1 } });
  if (!setupKeyMatches(key, setting?.setupKeyHash)) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return { ok: false };
  }
  (await cookies()).set(SETUP_COOKIE, normalizeSetupKey(key), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return { ok: true, checks: await runSystemChecks() };
}

export async function recheckSystem(): Promise<SystemCheck[] | null> {
  if (!(await hasSetupAccess())) return null;
  return runSystemChecks();
}

const installSchema = z.object({
  platform: z.object({
    instanceName: z.string().trim().min(2).max(60),
    defaultLanguage: z.enum(["en", "ar"]),
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }),
    currency: z.enum(SETUP_CURRENCIES),
    allowSignup: z.boolean(),
  }),
  admin: z.object({
    name: z.string().trim().min(2).max(100),
    nameAr: z.string().trim().max(100),
    email: z.email().trim().toLowerCase(),
    phone: z.string().trim().max(30),
    password: z.string().min(8).max(200),
  }),
  workspace: z.object({
    type: z.enum(["business", "school", "home"]),
    name: z.string().trim().min(2).max(120),
    nameAr: z.string().trim().max(120),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    address: z.string().trim().max(300),
    phone: z.string().trim().max(30),
    email: z.union([z.email(), z.literal("")]),
    crNumber: z.string().trim().max(40),
    campuses: z.string().max(2000),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    weekend: z.enum(["5,6", "6,0", "5"]),
    weekStart: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  }),
  demo: z.boolean(),
});

export type InstallPayload = z.infer<typeof installSchema>;
export type InstallResult = { ok: true; slug: string } | { ok: false; error: string; field?: string };

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40) || "workspace"
  );
}

/** Process an uploaded logo into a 512px PNG (also turns SVG into a safe bitmap). */
async function processLogo(file: File | null): Promise<Buffer | null> {
  if (!file || file.size === 0) return null;
  if (file.size > 4 * 1024 * 1024 || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error("logo");
  return sharp(Buffer.from(await file.arrayBuffer()), { density: 300 })
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}

export async function install(formData: FormData): Promise<InstallResult> {
  if (await isInstalled(db)) return { ok: false, error: "setup.alreadyInstalled" };
  if (!(await hasSetupAccess())) return { ok: false, error: "setup.keyWrong" };

  let payload: InstallPayload;
  try {
    payload = installSchema.parse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch {
    return { ok: false, error: "errors.generic" };
  }
  const { platform, admin, workspace, demo } = payload;

  const failed = (await runSystemChecks()).find((c) => c.status === "fail");
  if (failed) return { ok: false, error: `setup.checkFail_${failed.id}` };

  const demoEmails: string[] = Object.values(DEMO_PEOPLE).map((p) => p.email);
  if (demo && demoEmails.includes(admin.email)) return { ok: false, error: "setup.demoEmailClash", field: "email" };

  let logo: Buffer | null;
  try {
    logo = await processLogo(formData.get("logo") as File | null);
  } catch {
    return { ok: false, error: "settings.uploadFailed", field: "logo" };
  }

  const [passwordHash, demoHash] = await Promise.all([hashPassword(admin.password), demo ? hashPassword(DEMO_PASSWORD) : null]);

  // Everything in one transaction: a failure leaves the server uninstalled, never half-installed.
  const { user, org } = await db.$transaction(
    async (tx) => {
      let demoOrgs: string[] = [];
      if (demo && demoHash) {
        const seeded = await seedWorkspaces(tx, demoHash);
        demoOrgs = [seeded.home.id, seeded.biz.id, seeded.school.id];
      }

      const user = await tx.user.create({
        data: {
          email: admin.email,
          name: admin.name,
          nameAr: admin.nameAr || null,
          phone: admin.phone || null,
          passwordHash,
          isSystemAdmin: true,
          avatarColor: workspace.brandColor,
          preferences: { locale: platform.defaultLanguage },
        },
      });

      const base = slugify(workspace.name);
      let slug = base;
      for (let i = 2; await tx.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

      const org = await tx.organization.create({
        data: {
          type: workspace.type,
          name: workspace.name,
          nameAr: workspace.nameAr || null,
          slug,
          currency: platform.currency,
          timezone: platform.timezone,
          locale: platform.defaultLanguage,
          weekStart: workspace.weekStart,
          weekend: workspace.weekend,
          brandColor: workspace.brandColor,
          address: workspace.address || null,
          phone: workspace.phone || null,
          email: workspace.email || null,
          crNumber: workspace.crNumber || null,
          settings: { fiscalYearStartMonth: workspace.fiscalYearStartMonth },
        },
      });
      await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: "owner", title: "Administrator", titleAr: "المسؤول" } });

      if (workspace.type === "school") {
        const names = workspace.campuses.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
        for (const [i, name] of (names.length ? names : ["Main campus"]).entries()) {
          await tx.campus.create({ data: { orgId: org.id, name, code: `C${i + 1}` } });
        }
      } else if (workspace.type === "business") {
        await tx.campus.create({ data: { orgId: org.id, name: "Main branch", nameAr: "الفرع الرئيسي", code: "MAIN" } });
      } else {
        await createHomeDefaults(tx, org.id);
      }

      // The administrator can look around every demo workspace.
      if (demoOrgs.length) {
        await tx.membership.createMany({
          data: demoOrgs.map((orgId) => ({ userId: user.id, orgId, role: "owner", title: "Administrator", titleAr: "المسؤول" })),
        });
      }

      await tx.user.update({ where: { id: user.id }, data: { lastOrgId: org.id } });
      await tx.systemSetting.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
      await tx.systemSetting.update({
        where: { id: 1 },
        data: {
          instanceName: platform.instanceName,
          defaultLocale: platform.defaultLanguage,
          timezone: platform.timezone,
          currency: platform.currency,
          allowSignup: platform.allowSignup,
          demoData: demo,
          installedAt: new Date(),
          installedById: user.id,
          setupKeyHash: null,
          version: process.env.npm_package_version ?? "0.1.0",
        },
      });
      return { user, org };
    },
    { timeout: 60_000 },
  );

  if (logo) {
    const dir = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, "orgs", org.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(/*turbopackIgnore: true*/ dir, "logo.png"), logo);
    await db.organization.update({ where: { id: org.id }, data: { logoPath: `orgs/${org.id}/logo.png` } });
  }

  await removeSetupKeyFile();
  (await cookies()).delete(SETUP_COOKIE);
  await audit({
    orgId: org.id,
    userId: user.id,
    action: "system.installed",
    entityType: "organization",
    entityId: org.id,
    summary: `Installed ${platform.instanceName} and created ${org.name}${demo ? " (with demo workspaces)" : ""}`,
    summaryAr: `تثبيت ${platform.instanceName} وإنشاء ${org.nameAr ?? org.name}`,
    sensitive: true,
  });
  await createSession(user.id);
  await writePrefsCookie(parsePrefs({ locale: platform.defaultLanguage }));
  return { ok: true, slug: org.slug };
}
