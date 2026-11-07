import "server-only";
import { db } from "./db";
import type { Workspace } from "./auth/dal";

// Record-level access rules, shared by pages, actions, attachments, comments
// and (later) Flow. Keep every "who may see/change this record" decision here.

export type EntityType = "claim" | "possession" | "bill" | "party" | "document" | "item" | "employee" | "leave" | "payroll";

export async function canViewEntity(ws: Workspace, type: string, id: string): Promise<boolean> {
  if (type === "claim") {
    const c = await db.claim.findFirst({ where: { id, orgId: ws.org.id, deletedAt: null }, select: { submittedById: true } });
    return !!c && (c.submittedById === ws.viewer.id || ws.can("claims.viewAll"));
  }
  if (type === "possession") return !!(await db.possession.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "bill") return !!(await db.recurringBill.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "party") return ws.can("finance.view") && !!(await db.party.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "item") return (ws.can("finance.view") || ws.can("inventory.manage")) && !!(await db.item.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "document") {
    const d = await db.document.findFirst({ where: { id, orgId: ws.org.id }, select: { kind: true } });
    return !!d && (ws.can("finance.view") || (d.kind === "po" && ws.can("inventory.manage")));
  }
  if (type === "employee") {
    const e = await db.employee.findFirst({ where: { id, orgId: ws.org.id }, select: { userId: true } });
    return !!e && (ws.can("hr.view") || e.userId === ws.viewer.id);
  }
  if (type === "leave") {
    const l = await db.leaveRequest.findFirst({ where: { id, orgId: ws.org.id }, select: { employee: { select: { userId: true } } } });
    return !!l && (ws.can("hr.view") || ws.can("leave.approve") || l.employee.userId === ws.viewer.id);
  }
  if (type === "payroll") return (ws.can("payroll.run") || ws.can("hr.manage")) && !!(await db.payrollRun.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
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
  if (type === "party" || type === "document") return ws.can("finance.manage") && (await canViewEntity(ws, type, id));
  if (type === "item") return (ws.can("finance.manage") || ws.can("inventory.manage")) && (await canViewEntity(ws, type, id));
  if (type === "employee") return ws.can("hr.manage") && (await canViewEntity(ws, type, id));
  return false;
}
