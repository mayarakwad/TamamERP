import "server-only";
import { notFound } from "next/navigation";
import { getWorkspace } from "./auth/dal";
import { getI18n } from "./i18n/server";
import type { OrgType, Permission } from "./rbac";

// Shared helpers for business (and later school) pages.

/** The workspace, or a 404 when the type or permissions don't fit. */
export async function bizPage(slug: string, perms: Permission[] = [], types: OrgType[] = ["business"]) {
  const ws = await getWorkspace(slug);
  if (!types.includes(ws.orgType) || (perms.length && !perms.some((p) => ws.can(p)))) notFound();
  return ws;
}

export function toQuery(sp: Record<string, string | string[] | undefined>) {
  return new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
}

export function i18nFor(ws: { org: { currency: string; timezone: string } }) {
  return getI18n({ currency: ws.org.currency, timeZone: ws.org.timezone });
}

export interface BizSettings {
  fiscalYearStartMonth?: number;
  sales?: { bankName?: string; iban?: string; invoiceNotes?: string; invoiceTerms?: string; quoteTerms?: string };
  payroll?: { employerEid?: string; payerEid?: string; bankShortName?: string; iban?: string };
}

export function bizSettings(org: { settings: unknown }): BizSettings {
  return org.settings && typeof org.settings === "object" ? (org.settings as BizSettings) : {};
}

export const dohaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());
