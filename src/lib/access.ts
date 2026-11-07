import "server-only";
import { db } from "./db";
import type { Workspace } from "./auth/dal";

// Record-level access rules, shared by pages, actions, attachments, comments
// and (later) Flow. Keep every "who may see/change this record" decision here.

export type EntityType = "claim" | "possession" | "bill";

export async function canViewEntity(ws: Workspace, type: string, id: string): Promise<boolean> {
  if (type === "claim") {
    const c = await db.claim.findFirst({ where: { id, orgId: ws.org.id, deletedAt: null }, select: { submittedById: true } });
    return !!c && (c.submittedById === ws.viewer.id || ws.can("claims.viewAll"));
  }
  if (type === "possession") return !!(await db.possession.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "bill") return !!(await db.recurringBill.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  return false;
}

export async function canEditEntity(ws: Workspace, type: string, id: string): Promise<boolean> {
  if (type === "claim") {
    const c = await db.claim.findFirst({ where: { id, orgId: ws.org.id, deletedAt: null }, select: { submittedById: true, status: true } });
    if (!c) return false;
    return (c.submittedById === ws.viewer.id && c.status === "submitted") || ws.can("claims.approve");
  }
  if (type === "possession") return ws.can("possessions.manage") && (await canViewEntity(ws, type, id));
  if (type === "bill") return ws.can("bills.manage") && (await canViewEntity(ws, type, id));
  return false;
}
