"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { canEditEntity } from "@/lib/access";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { nextNumber } from "@/lib/series";
import { notify, membersWithRoles } from "@/lib/notify";
import { indexClaim, removeFromIndex } from "@/lib/search/index-core";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };

const claimInput = z.object({
  amount: z.string().max(20),
  merchant: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidWith: z.enum(["cash", "card", "transfer"]),
  note: z.string().trim().max(500).default(""),
  askApproval: z.boolean().default(false),
});
export type ClaimInput = z.input<typeof claimInput>;

const qar = (dirhams: number) => `QAR ${(dirhams / 100).toLocaleString("en", { minimumFractionDigits: dirhams % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

type Validated =
  | { error: string; field: string }
  | { data: Omit<z.output<typeof claimInput>, "amount" | "spentOn"> & { amount: number; spentOn: Date; category: { id: string } } };

async function validate(orgId: string, raw: ClaimInput): Promise<Validated> {
  const parsed = claimInput.safeParse(raw);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return { error: field === "merchant" ? "errors.required" : "errors.generic", field };
  }
  const amount = parseMoney(parsed.data.amount);
  if (!amount || amount <= 0 || amount > 1_000_000_000) return { error: "claims.amountInvalid", field: "amount" };
  const category = await db.expenseCategory.findFirst({ where: { id: parsed.data.categoryId, orgId, archived: false } });
  if (!category) return { error: "errors.required", field: "categoryId" };
  // Noon in Doha keeps the calendar day stable in every time zone.
  const spentOn = new Date(`${parsed.data.spentOn}T12:00:00+03:00`);
  if (Number.isNaN(spentOn.getTime()) || spentOn.getTime() > Date.now() + 86400_000) return { error: "errors.generic", field: "spentOn" };
  return { data: { ...parsed.data, amount, spentOn, category } };
}

export async function createClaim(slug: string, raw: ClaimInput): Promise<ActionResult<{ id: string; number: string; status: string }>> {
  const ws = await getWorkspace(slug);
  if (!ws.can("claims.submit")) return { ok: false, error: "empty.notAllowed" };
  const v = await validate(ws.org.id, raw);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };
  const d = v.data;
  const auto = ws.can("claims.approve") && !d.askApproval;
  const now = new Date();

  const claim = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx, ws.org.id, "CLM", d.spentOn);
    return tx.claim.create({
      data: {
        orgId: ws.org.id,
        number,
        submittedById: ws.viewer.id,
        categoryId: d.category.id,
        amount: d.amount,
        merchant: d.merchant,
        spentOn: d.spentOn,
        note: d.note || null,
        paidWith: d.paidWith,
        status: auto ? "approved" : "submitted",
        decidedById: auto ? ws.viewer.id : null,
        decidedAt: auto ? now : null,
        decisionNote: auto ? "self" : null,
      },
    });
  });

  await audit({
    orgId: ws.org.id,
    userId: ws.viewer.id,
    action: auto ? "claim.recorded" : "claim.submitted",
    entityType: "claim",
    entityId: claim.id,
    summary: `${auto ? "recorded" : "submitted"} ${claim.number} · ${claim.merchant}`,
    summaryAr: `${auto ? "تسجيل" : "إرسال"} ${claim.number} · ${claim.merchant}`,
    meta: { amount: claim.amount },
  });
  await indexClaim(db, claim.id);

  if (!auto) {
    const approvers = await membersWithRoles(db, ws.org.id, ["owner", "admin"]);
    await notify(db, {
      orgId: ws.org.id,
      userIds: approvers,
      except: ws.viewer.id,
      kind: "claim.submitted",
      title: `${ws.viewer.name} submitted ${claim.number}: ${claim.merchant} (${qar(claim.amount)})`,
      titleAr: `مطالبة جديدة من ${ws.viewer.nameAr ?? ws.viewer.name}: ${claim.number} · ${claim.merchant} (${qar(claim.amount)})`,
      href: `claims/${claim.id}`,
    });
  }
  return { ok: true, id: claim.id, number: claim.number, status: claim.status };
}

export async function updateClaim(slug: string, id: string, raw: ClaimInput): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!(await canEditEntity(ws, "claim", id))) return { ok: false, error: "empty.notAllowed" };
  const v = await validate(ws.org.id, raw);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };
  const before = await db.claim.findUniqueOrThrow({ where: { id } });
  const d = v.data;
  await db.claim.update({
    where: { id },
    data: { amount: d.amount, merchant: d.merchant, categoryId: d.category.id, spentOn: d.spentOn, paidWith: d.paidWith, note: d.note || null },
  });
  const changed = [
    before.amount !== d.amount && `amount ${qar(before.amount)} → ${qar(d.amount)}`,
    before.merchant !== d.merchant && `merchant "${before.merchant}" → "${d.merchant}"`,
    before.categoryId !== d.category.id && "category",
    before.paidWith !== d.paidWith && "payment method",
    (before.note ?? "") !== d.note && "note",
  ].filter(Boolean);
  await audit({
    orgId: ws.org.id,
    userId: ws.viewer.id,
    action: "claim.updated",
    entityType: "claim",
    entityId: id,
    summary: `edited ${before.number}${changed.length ? `: ${changed.join(", ")}` : ""}`,
    summaryAr: `تعديل ${before.number}`,
    meta: { changed: changed as string[] },
  });
  await indexClaim(db, id);
  refresh();
  return { ok: true };
}

export async function deleteClaim(slug: string, id: string): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!(await canEditEntity(ws, "claim", id))) return { ok: false, error: "empty.notAllowed" };
  const c = await db.claim.update({ where: { id }, data: { deletedAt: new Date() } });
  await removeFromIndex(db, "claim", id);
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "claim.deleted", entityType: "claim", entityId: id, summary: `deleted ${c.number}`, summaryAr: `حذف ${c.number}`, sensitive: true });
  return { ok: true };
}

type Decision = "approve" | "reject" | "reimburse" | "reopen";

async function decide(slug: string, id: string, decision: Decision, note?: string): Promise<ActionResult<{ number: string }>> {
  const ws = await getWorkspace(slug);
  if (!ws.can("claims.approve")) return { ok: false, error: "empty.notAllowed" };
  const c = await db.claim.findFirst({ where: { id, orgId: ws.org.id, deletedAt: null }, include: { submittedBy: true } });
  if (!c) return { ok: false, error: "empty.notFound" };

  const from: Record<Decision, string> = { approve: "submitted", reject: "submitted", reimburse: "approved", reopen: "rejected" };
  if (c.status !== from[decision]) return { ok: false, error: "errors.generic" };
  if ((decision === "approve" || decision === "reject") && c.submittedById === ws.viewer.id && ws.role !== "owner") {
    return { ok: false, error: "claims.cantApproveOwn" };
  }
  if (decision === "reject" && !note?.trim()) return { ok: false, error: "errors.required", field: "reason" };

  const now = new Date();
  const status = { approve: "approved", reject: "rejected", reimburse: "reimbursed", reopen: "submitted" }[decision];
  await db.claim.update({
    where: { id },
    data:
      decision === "reimburse"
        ? { status, reimbursedAt: now }
        : decision === "reopen"
          ? { status, decidedById: null, decidedAt: null, decisionNote: null }
          : { status, decidedById: ws.viewer.id, decidedAt: now, decisionNote: note?.trim() || null },
  });

  const words = {
    approve: ["approved", "اعتماد"],
    reject: ["declined", "رفض"],
    reimburse: ["reimbursed", "استرداد"],
    reopen: ["reopened", "إعادة فتح"],
  }[decision];
  await audit({
    orgId: ws.org.id,
    userId: ws.viewer.id,
    action: `claim.${status === "submitted" ? "reopened" : status}`,
    entityType: "claim",
    entityId: id,
    summary: `${words[0]} ${c.number}${decision === "reject" ? `: ${note}` : ""}`,
    summaryAr: `${words[1]} ${c.number}`,
    meta: { amount: c.amount },
  });
  await indexClaim(db, id);

  if (decision !== "reopen") {
    const title =
      decision === "approve"
        ? [`${c.number} was approved (${qar(c.amount)}, ${c.merchant})`, `تم اعتماد ${c.number} (${qar(c.amount)}، ${c.merchant})`]
        : decision === "reject"
          ? [`${c.number} was declined: ${note}`, `تم رفض ${c.number}: ${note}`]
          : [`${c.number} was reimbursed (${qar(c.amount)})`, `تم استرداد ${c.number} (${qar(c.amount)})`];
    await notify(db, { orgId: ws.org.id, userIds: [c.submittedById], except: ws.viewer.id, kind: `claim.${status}`, title: title[0], titleAr: title[1], href: `claims/${id}` });
  }
  refresh();
  return { ok: true, number: c.number };
}

export async function approveClaim(slug: string, id: string, note?: string) {
  return decide(slug, id, "approve", note);
}
export async function rejectClaim(slug: string, id: string, reason: string) {
  return decide(slug, id, "reject", reason);
}
export async function reimburseClaim(slug: string, id: string) {
  return decide(slug, id, "reimburse");
}
export async function reopenClaim(slug: string, id: string) {
  return decide(slug, id, "reopen");
}
