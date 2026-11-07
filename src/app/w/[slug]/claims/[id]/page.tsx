import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { canEditEntity, canViewEntity } from "@/lib/access";
import { attachmentUrl } from "@/lib/attachments";
import { getThread } from "@/lib/thread";
import { ClaimDetail } from "./claim-detail";

export const metadata: Metadata = { title: "Claim" };

export default async function ClaimPage({ params }: PageProps<"/w/[slug]/claims/[id]">) {
  const { slug, id } = await params;
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "home" || !(await canViewEntity(ws, "claim", id))) notFound();
  await connection();

  const [claim, attachments, thread, categories, canEdit] = await Promise.all([
    db.claim.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        submittedBy: { select: { id: true, name: true, nameAr: true, avatarColor: true } },
        decidedBy: { select: { id: true, name: true, nameAr: true } },
      },
    }),
    db.attachment.findMany({ where: { orgId: ws.org.id, entityType: "claim", entityId: id }, orderBy: { createdAt: "asc" } }),
    getThread(ws.org.id, "claim", id),
    db.expenseCategory.findMany({ where: { orgId: ws.org.id, archived: false }, orderBy: { sort: "asc" } }),
    canEditEntity(ws, "claim", id),
  ]);

  const own = claim.submittedById === ws.viewer.id;
  const canDecide = ws.can("claims.approve") && (!own || ws.role === "owner");

  return (
    <ClaimDetail
      slug={slug}
      now={new Date().toISOString()}
      viewerId={ws.viewer.id}
      claim={{
        id: claim.id,
        number: claim.number,
        amount: claim.amount,
        merchant: claim.merchant,
        spentOn: claim.spentOn.toISOString(),
        paidWith: claim.paidWith as "cash" | "card" | "transfer",
        note: claim.note,
        status: claim.status,
        createdAt: claim.createdAt.toISOString(),
        decidedAt: claim.decidedAt?.toISOString() ?? null,
        decisionNote: claim.decisionNote,
        reimbursedAt: claim.reimbursedAt?.toISOString() ?? null,
        category: { id: claim.category.id, name: claim.category.name, nameAr: claim.category.nameAr, icon: claim.category.icon, color: claim.category.color },
        submittedBy: claim.submittedBy,
        decidedBy: claim.decidedBy,
      }}
      files={attachments.map((a) => ({ id: a.id, url: attachmentUrl(slug, a.id), thumb: a.thumbPath ? attachmentUrl(slug, a.id, "thumb") : null, fileName: a.fileName, mimeType: a.mimeType }))}
      thread={thread}
      categories={categories.map((c) => ({ id: c.id, key: c.key, name: c.name, nameAr: c.nameAr, icon: c.icon }))}
      canEdit={canEdit}
      canDelete={canEdit}
      canDecide={canDecide}
      canApproveAny={ws.can("claims.approve")}
    />
  );
}
