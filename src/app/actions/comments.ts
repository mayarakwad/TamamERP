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
