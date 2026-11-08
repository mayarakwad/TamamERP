// Expense claims in businesses (and schools) reach the books: approval books
// the expense against "claims payable", reimbursement pays it from the bank.
// Homes don't keep a ledger, so nothing happens for them.
// No server-only imports: the seed uses this too.

import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { postEntry, reverseSource } from "./ledger/post";

type Db = PrismaClient | Prisma.TransactionClient;

async function load(db: Db, id: string) {
  return db.claim.findUnique({ where: { id }, include: { org: { select: { type: true } }, category: true, submittedBy: { select: { name: true } } } });
}

export async function postClaimApproval(db: Db, claimId: string, userId: string, date = new Date()) {
  const c = await load(db, claimId);
  if (!c || c.org.type === "home") return;
  await postEntry(db, {
    orgId: c.orgId,
    date,
    memo: `${c.number} · ${c.merchant} · ${c.submittedBy.name}`,
    sourceType: "claim",
    sourceId: c.id,
    createdById: userId,
    lines: [c.category.accountId ? { accountId: c.category.accountId, debit: c.amount } : { role: "otherExpense", debit: c.amount }, { role: "reimbursements", credit: c.amount }],
  });
}

export async function postClaimReimbursed(db: Db, claimId: string, userId: string, date = new Date()) {
  const c = await load(db, claimId);
  if (!c || c.org.type === "home") return;
  await postEntry(db, {
    orgId: c.orgId,
    date,
    memo: `Reimbursed ${c.number} to ${c.submittedBy.name}`,
    sourceType: "claim",
    sourceId: c.id,
    createdById: userId,
    lines: [{ role: "reimbursements", debit: c.amount }, { role: c.paidWith === "cash" ? "cash" : "bank", credit: c.amount }],
  });
}

/** Undo everything a claim booked (deleted, reopened or edited after approval). */
export async function reverseClaim(db: Db, claimId: string, userId: string) {
  const c = await load(db, claimId);
  if (!c || c.org.type === "home") return;
  await reverseSource(db, { orgId: c.orgId, sourceType: "claim", sourceId: c.id, date: new Date(), createdById: userId });
}
