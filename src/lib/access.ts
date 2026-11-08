import "server-only";
import { db } from "./db";
import type { Workspace } from "./auth/dal";

// Record-level access rules, shared by pages, actions, attachments, comments
// and (later) Flow. Keep every "who may see/change this record" decision here.

export type EntityType = "claim" | "possession" | "bill" | "party" | "document" | "item" | "employee" | "leave" | "payroll" | "student" | "guardian" | "application";

export async function canViewEntity(ws: Workspace, type: string, id: string): Promise<boolean> {
  if (type === "claim") {
    const c = await db.claim.findFirst({ where: { id, orgId: ws.org.id, deletedAt: null }, select: { submittedById: true } });
    return !!c && (c.submittedById === ws.viewer.id || ws.can("claims.viewAll"));
  }
  if (type === "possession") return !!(await db.possession.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "bill") return !!(await db.recurringBill.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "party") {
    if (!(await db.party.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }))) return false;
    if (ws.can("finance.view") || (ws.orgType === "school" && ws.can("school.manage"))) return true;
    // A parent may print their own family's fee statement.
    return ws.can("school.parent") && (await db.guardian.count({ where: { partyId: id, userId: ws.viewer.id } })) > 0;
  }
  if (type === "item") return (ws.can("finance.view") || ws.can("inventory.manage")) && !!(await db.item.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "document") {
    const d = await db.document.findFirst({ where: { id, orgId: ws.org.id }, select: { kind: true, studentId: true } });
    if (!d) return false;
    if (ws.can("finance.view") || (d.kind === "po" && ws.can("inventory.manage"))) return true;
    // School fees: the office, and the parents of that child.
    if (d.kind === "fee" && ws.can("school.manage")) return true;
    if (d.kind === "fee" && d.studentId && ws.can("school.parent")) return (await db.studentGuardian.count({ where: { studentId: d.studentId, guardian: { userId: ws.viewer.id } } })) > 0;
    return false;
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
  if (type === "student") return canViewStudent(ws, id);
  if (type === "guardian") return (ws.can("school.manage") || ws.can("finance.view")) && !!(await db.guardian.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  if (type === "application") return ws.can("school.manage") && !!(await db.application.findFirst({ where: { id, orgId: ws.org.id }, select: { id: true } }));
  return false;
}

/** Office staff see every student; a teacher sees their classes; a parent sees their own children. */
export async function canViewStudent(ws: Workspace, id: string): Promise<boolean> {
  const st = await db.student.findFirst({ where: { id, orgId: ws.org.id }, select: { sectionId: true, campusId: true } });
  if (!st) return false;
  if (ws.can("school.manage") || ws.can("finance.view") || ws.can("transport.manage") || ws.can("library.manage")) return !ws.membership.campusId || ws.membership.campusId === st.campusId;
  if (ws.can("school.teach") && st.sectionId) {
    const emp = await db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id }, select: { id: true } });
    if (emp && (await db.section.count({ where: { id: st.sectionId, OR: [{ homeroomId: emp.id }, { assignments: { some: { teacherId: emp.id } } }] } }))) return true;
  }
  if (ws.can("school.parent")) return (await db.studentGuardian.count({ where: { studentId: id, guardian: { userId: ws.viewer.id } } })) > 0;
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
  if (type === "student" || type === "guardian" || type === "application") return ws.can("school.manage") && (await canViewEntity(ws, type, id));
  return false;
}
