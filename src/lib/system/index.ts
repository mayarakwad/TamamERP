import "server-only";
import { cache } from "react";
import { access, constants, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { db } from "../db";
import { ensureDir, STORAGE_DIR } from "../storage";
import { isInstalled } from "./setup-key";

export interface SystemInfo {
  installed: boolean;
  instanceName: string;
  defaultLocale: "en" | "ar";
  timezone: string;
  currency: string;
  allowSignup: boolean;
  demoData: boolean;
}

/** Installation state for this request (cheap: one or two indexed queries). */
export const getSystem = cache(async (): Promise<SystemInfo> => {
  const [setting, installed] = await Promise.all([db.systemSetting.findUnique({ where: { id: 1 } }), isInstalled(db)]);
  return {
    installed,
    instanceName: setting?.instanceName || "Tamam",
    defaultLocale: setting?.defaultLocale === "ar" ? "ar" : "en",
    timezone: setting?.timezone ?? "Asia/Qatar",
    currency: setting?.currency ?? "QAR",
    allowSignup: setting?.allowSignup ?? true,
    // Legacy databases seeded before the wizard: demo users present means demo data.
    demoData: setting ? setting.demoData : (await db.user.count({ where: { email: { endsWith: "@tamam.demo" } } })) > 0,
  };
});

export type CheckStatus = "ok" | "warn" | "fail";
export interface SystemCheck {
  id: "database" | "storage" | "secret" | "node" | "images" | "calendar" | "https";
  status: CheckStatus;
  detail?: string;
}

/** What the setup wizard verifies before installing. "fail" blocks installation. */
export async function runSystemChecks(): Promise<SystemCheck[]> {
  const checks: SystemCheck[] = [];

  try {
    await db.systemSetting.count();
    checks.push({ id: "database", status: "ok" });
  } catch {
    checks.push({ id: "database", status: "fail" });
  }

  try {
    await ensureDir();
    const probe = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, `.write-test-${process.pid}`);
    await writeFile(probe, "ok");
    await access(probe, constants.R_OK);
    await rm(probe, { force: true });
    checks.push({ id: "storage", status: "ok", detail: STORAGE_DIR });
  } catch {
    checks.push({ id: "storage", status: "fail", detail: STORAGE_DIR });
  }

  const secret = process.env.APP_SECRET ?? "";
  checks.push({ id: "secret", status: secret.length >= 32 && !secret.startsWith("change-me") ? "ok" : "warn" });

  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ id: "node", status: major >= 22 ? "ok" : "warn", detail: process.versions.node });

  try {
    const sharp = (await import("sharp")).default;
    await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } }).png().toBuffer();
    checks.push({ id: "images", status: "ok" });
  } catch {
    checks.push({ id: "images", status: "warn" });
  }

  try {
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric", timeZone: "Asia/Qatar" }).format(new Date());
    checks.push({ id: "calendar", status: /\d|[٠-٩]/.test(hijri) ? "ok" : "warn" });
  } catch {
    checks.push({ id: "calendar", status: "warn" });
  }

  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
  const proto = h.get("x-forwarded-proto") ?? "http";
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  checks.push({ id: "https", status: proto === "https" || local ? "ok" : "warn", detail: `${proto}://${host}` });

  return checks;
}
