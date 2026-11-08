"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { canViewEntity } from "@/lib/access";
import { notify } from "@/lib/notify";
import type { ActionResult } from "./claims";

/** Add a comment to a record's conversation and let the other participants know. */
export async function addComment(slug: string, entityType: string, entityId: string, body: string): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  const text = body.trim().slice(0, 2000);
  if (!text) return { ok: false, error: "errors.required" };
  if (!(await canViewEntity(ws, entityType, entityId))) return { ok: false, error: "empty.notAllowed" };
  // Notes on a student record are a staff conversation.
  if (entityType === "student" && !(ws.can("school.manage") || ws.can("school.teach"))) return { ok: false, error: "empty.notAllowed" };

  await db.comment.create({ data: { orgId: ws.org.id, entityType, entityId, authorId: ws.viewer.id, body: text } });

  // Participants: the record's owner, whoever decided on it, and earlier commenters.
  const participants = new Set<string>();
  let title = "";
  let href = "";
  if (entityType === "claim") {
    const c = await db.claim.findUniqueOrThrow({ where: { id: entityId } });
    participants.add(c.submittedById);
    if (c.decidedById) participants.add(c.decidedById);
    else (await db.membership.findMany({ where: { orgId: ws.org.id, role: { in: ["owner", "admin"] }, status: "active" } })).forEach((m) => participants.add(m.userId));
    title = c.number;
    href = `claims/${entityId}`;
  }
  if (entityType === "document") {
    const d = await db.document.findUniqueOrThrow({ where: { id: entityId } });
    participants.add(d.createdById);
    title = d.number;
    href = `${{ quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" }[d.kind]}/${entityId}`;
  }
  if (entityType === "leave") {
    const l = await db.leaveRequest.findUniqueOrThrow({ where: { id: entityId }, include: { employee: true } });
    participants.add(l.requestedById);
    if (l.employee.userId) participants.add(l.employee.userId);
    if (l.decidedById) participants.add(l.decidedById);
    title = l.number;
    href = `hr/leave?request=${entityId}`;
  }
  if (entityType === "student") {
    // Notes about a child reach the class teacher and the office (never the parents).
    const st = await db.student.findUniqueOrThrow({ where: { id: entityId }, include: { section: { include: { homeroom: true } } } });
    if (st.section?.homeroom?.userId) participants.add(st.section.homeroom.userId);
    (await db.membership.findMany({ where: { orgId: ws.org.id, role: { in: ["owner", "admin"] }, status: "active", OR: [{ campusId: null }, { campusId: st.campusId }] } })).forEach((m) => participants.add(m.userId));
    title = st.name;
    href = `students/${entityId}`;
  }
  if (entityType === "application") {
    const a = await db.application.findUniqueOrThrow({ where: { id: entityId } });
    (await db.membership.findMany({ where: { orgId: ws.org.id, role: { in: ["owner", "admin"] }, status: "active", OR: [{ campusId: null }, { campusId: a.campusId }] } })).forEach((m) => participants.add(m.userId));
    title = `${a.number} · ${a.childName}`;
    href = `admissions?open=${entityId}`;
  }
  (await db.comment.findMany({ where: { entityType, entityId }, select: { authorId: true } })).forEach((c) => participants.add(c.authorId));

  if (title) {
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    await notify(db, {
      orgId: ws.org.id,
      userIds: [...participants],
      except: ws.viewer.id,
      kind: "comment",
      title: `${ws.viewer.name} commented on ${title}`,
      titleAr: `تعليق جديد من ${ws.viewer.nameAr ?? ws.viewer.name} على ${title}`,
      body: preview,
      bodyAr: preview,
      href,
    });
  }
  refresh();
  return { ok: true };
}
