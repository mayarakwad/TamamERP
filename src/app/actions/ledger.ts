"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { postEntry, reverseSource, UnbalancedEntry } from "@/lib/ledger/post";
import type { ActionResult } from "./claims";

async function financeWs(slug: string) {
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "business" || !ws.can("finance.manage")) return null;
  return ws;
}

const accountInput = z.object({
  code: z.string().trim().regex(/^\d{3,6}$/),
  name: z.string().trim().min(2).max(100),
  nameAr: z.string().trim().max(100).default(""),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
});

export async function saveAccount(slug: string, id: string | null, raw: z.input<typeof accountInput>): Promise<ActionResult<{ id: string }>> {
  const ws = await financeWs(slug);
  if (!ws) return { ok: false, error: "empty.notAllowed" };
  const parsed = accountInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "code" ? "accounts.codeInvalid" : "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const d = parsed.data;
  const clash = await db.account.findFirst({ where: { orgId: ws.org.id, code: d.code, ...(id ? { id: { not: id } } : {}) } });
  if (clash) return { ok: false, error: "accounts.codeTaken", field: "code" };
  let accountId = id;
  if (id) {
    const a = await db.account.findFirst({ where: { id, orgId: ws.org.id } });
    if (!a) return { ok: false, error: "empty.notFound" };
    // System accounts keep their type; postings depend on it.
    await db.account.update({ where: { id }, data: { code: d.code, name: d.name, nameAr: d.nameAr || null, ...(a.isSystem ? {} : { type: d.type }) } });
  } else {
    accountId = (await db.account.create({ data: { orgId: ws.org.id, code: d.code, name: d.name, nameAr: d.nameAr || null, type: d.type } })).id;
  }
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: id ? "account.updated" : "account.created", entityType: "account", entityId: accountId!, summary: `${id ? "updated" : "added"} account ${d.code} ${d.name}`, summaryAr: `${id ? "تعديل" : "إضافة"} الحساب ${d.code}`, sensitive: true });
  refresh();
  return { ok: true, id: accountId! };
}

const entryInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().min(3).max(300),
  kind: z.enum(["manual", "opening"]),
  lines: z.array(z.object({ accountId: z.string().min(1), debit: z.string().max(20), credit: z.string().max(20), memo: z.string().max(200).default("") })).min(2).max(50),
});
export type EntryInput = z.input<typeof entryInput>;

export async function saveJournalEntry(slug: string, raw: EntryInput): Promise<ActionResult<{ id: string }>> {
  const ws = await financeWs(slug);
  if (!ws) return { ok: false, error: "empty.notAllowed" };
  const parsed = entryInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "memo" ? "journals.memoRequired" : "journals.linesInvalid" };
  const d = parsed.data;
  const ids = [...new Set(d.lines.map((l) => l.accountId))];
  if ((await db.account.count({ where: { orgId: ws.org.id, id: { in: ids } } })) !== ids.length) return { ok: false, error: "journals.linesInvalid" };
  const lines = d.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ? parseMoney(l.debit) : 0, credit: l.credit ? parseMoney(l.credit) : 0, memo: l.memo || null }));
  if (lines.some((l) => l.debit === null || l.credit === null || l.debit! < 0 || l.credit! < 0)) return { ok: false, error: "claims.amountInvalid" };
  try {
    const id = await db.$transaction((tx) => postEntry(tx, { orgId: ws.org.id, date: new Date(`${d.date}T12:00:00+03:00`), memo: d.memo, sourceType: d.kind, createdById: ws.viewer.id, lines: lines.map((l) => ({ accountId: l.accountId, debit: l.debit!, credit: l.credit!, memo: l.memo })) }));
    if (!id) return { ok: false, error: "journals.linesInvalid" };
    const total = lines.reduce((s, l) => s + l.debit!, 0);
    await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "journal.posted", entityType: "journal", entityId: id, summary: `posted a ${d.kind} journal entry: ${d.memo} (QAR ${(total / 100).toFixed(2)})`, summaryAr: `قيد يومية: ${d.memo}`, sensitive: true });
    refresh();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof UnbalancedEntry) return { ok: false, error: "journals.unbalanced" };
    throw e;
  }
}

/** Reverse a manual entry (automatic entries are reversed by voiding their document). */
export async function reverseJournalEntry(slug: string, id: string): Promise<ActionResult> {
  const ws = await financeWs(slug);
  if (!ws) return { ok: false, error: "empty.notAllowed" };
  const e = await db.journalEntry.findFirst({ where: { id, orgId: ws.org.id } });
  if (!e) return { ok: false, error: "empty.notFound" };
  if (!["manual", "opening"].includes(e.sourceType) || e.reversedAt || e.reversesId) return { ok: false, error: "journals.cantReverse" };
  await db.$transaction(async (tx) => {
    // Manual entries have no source record, so tag this one to reverse just it.
    await tx.journalEntry.update({ where: { id }, data: { sourceId: id } });
    await reverseSource(tx, { orgId: ws.org.id, sourceType: e.sourceType, sourceId: id, date: new Date(), createdById: ws.viewer.id });
  });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "journal.reversed", entityType: "journal", entityId: id, summary: `reversed journal entry ${e.number}`, summaryAr: `عكس القيد ${e.number}`, sensitive: true });
  refresh();
  return { ok: true };
}
