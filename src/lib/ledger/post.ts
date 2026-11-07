// Writing to the general ledger. Every automatic posting goes through
// postEntry(), which refuses anything that doesn't balance. No server-only
// imports: the seed script posts its history through the same code.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { nextNumber } from "../series";
import { accountIdsByRole, type AccountRole } from "./chart";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PostLine {
  /** An account role (resolved per workspace) or an explicit account id */
  role?: AccountRole;
  accountId?: string | null;
  debit?: number;
  credit?: number;
  partyId?: string | null;
  memo?: string | null;
}

export interface PostInput {
  orgId: string;
  date: Date;
  memo?: string | null;
  sourceType: string;
  sourceId?: string | null;
  createdById?: string | null;
  lines: PostLine[];
}

export class UnbalancedEntry extends Error {}

/** Merge lines on the same account + party + side and drop zeros. */
export function tidyLines<T extends { accountId: string; debit: number; credit: number; partyId: string | null; memo: string | null }>(lines: T[]): T[] {
  const out: T[] = [];
  for (const raw of lines) {
    // Net each line to one side; a negative debit is a credit and vice versa.
    const net = raw.debit - raw.credit;
    if (net === 0) continue;
    const l = { ...raw, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    const same = out.find((o) => o.accountId === l.accountId && o.partyId === l.partyId && (o.debit > 0) === (l.debit > 0) && o.memo === l.memo);
    if (same) {
      same.debit += l.debit;
      same.credit += l.credit;
    } else out.push({ ...l });
  }
  return out;
}

/** Write one balanced journal entry. Returns its id, or null when every line is zero. */
export async function postEntry(db: Db, input: PostInput): Promise<string | null> {
  const roles = input.lines.some((l) => l.role) ? await accountIdsByRole(db, input.orgId) : new Map<string, string>();
  const resolved = tidyLines(
    input.lines.map((l) => {
      const accountId = l.accountId ?? (l.role ? roles.get(l.role) : undefined);
      if (!accountId) throw new Error(`No account for ${l.role ?? "line"}`);
      return { accountId, debit: Math.round(l.debit ?? 0), credit: Math.round(l.credit ?? 0), partyId: l.partyId ?? null, memo: l.memo ?? null };
    }),
  );
  if (!resolved.length) return null;
  const dr = resolved.reduce((s, l) => s + l.debit, 0);
  const cr = resolved.reduce((s, l) => s + l.credit, 0);
  if (dr !== cr) throw new UnbalancedEntry(`Journal entry does not balance: debit ${dr} ≠ credit ${cr} (${input.sourceType})`);

  const number = await nextNumber(db, input.orgId, "JE", input.date);
  const entry = await db.journalEntry.create({
    data: {
      orgId: input.orgId,
      number,
      date: input.date,
      memo: input.memo ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      createdById: input.createdById ?? null,
      lines: { create: resolved.map((l) => ({ ...l, orgId: input.orgId, date: input.date })) },
    },
  });
  return entry.id;
}

/** Cancel every live entry a record created, with mirror-image entries dated `date`. */
export async function reverseSource(db: Db, o: { orgId: string; sourceType: string; sourceId: string; date: Date; createdById?: string | null; memo?: string }) {
  const entries = await db.journalEntry.findMany({
    where: { orgId: o.orgId, sourceType: o.sourceType, sourceId: o.sourceId, reversedAt: null, reversesId: null },
    include: { lines: true },
  });
  for (const e of entries) {
    const number = await nextNumber(db, o.orgId, "JE", o.date);
    await db.journalEntry.create({
      data: {
        orgId: o.orgId,
        number,
        date: o.date,
        memo: o.memo ?? `Reversal of ${e.number}`,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        reversesId: e.id,
        createdById: o.createdById ?? null,
        lines: { create: e.lines.map((l) => ({ orgId: o.orgId, accountId: l.accountId, date: o.date, debit: l.credit, credit: l.debit, partyId: l.partyId, memo: l.memo })) },
      },
    });
    await db.journalEntry.update({ where: { id: e.id }, data: { reversedAt: new Date() } });
  }
  return entries.length;
}
