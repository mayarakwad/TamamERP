import type { PrismaClient } from "../src/generated/prisma/client";

/** Delete every row (children first; organizations cascade to most tables). */
export async function wipeAll(db: PrismaClient) {
  // Uploaded files belong to the workspaces being deleted.
  const { rmSync } = await import("node:fs");
  const path = await import("node:path");
  rmSync(path.resolve(process.env.STORAGE_DIR ?? "./storage", "orgs"), { recursive: true, force: true });
  await db.systemSetting.deleteMany();
  await db.flowUsage.deleteMany();
  await db.flowProposal.deleteMany();
  await db.flowMessage.deleteMany();
  await db.flowConversation.deleteMany();
  await db.flowSettings.deleteMany();
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.comment.deleteMany();
  await db.attachment.deleteMany();
  await db.billPayment.deleteMany();
  await db.claim.deleteMany();
  // Stage 3 tables (students and classes are referenced without cascades).
  await db.loan.deleteMany();
  await db.book.deleteMany();
  await db.announcement.deleteMany();
  await db.reportCard.deleteMany();
  await db.mark.deleteMany();
  await db.assessment.deleteMany();
  await db.studentAttendance.deleteMany();
  await db.attendanceRoll.deleteMany();
  await db.application.deleteMany();
  await db.studentGuardian.deleteMany();
  await db.document.updateMany({ data: { studentId: null } });
  await db.student.deleteMany();
  await db.guardian.deleteMany();
  await db.timetableSlot.deleteMany();
  await db.teachingAssignment.deleteMany();
  await db.section.deleteMany();
  await db.busStop.deleteMany();
  await db.busRoute.deleteMany();
  await db.feeRate.deleteMany();
  await db.subject.deleteMany();
  await db.grade.deleteMany();
  await db.term.deleteMany();
  await db.academicYear.deleteMany();
  // Stage 2 tables, children before parents (some references don't cascade).
  await db.payslip.deleteMany();
  await db.payrollRun.deleteMany();
  await db.leaveRequest.deleteMany();
  await db.attendanceDay.deleteMany();
  await db.employee.deleteMany();
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.paymentAllocation.deleteMany();
  await db.payment.deleteMany();
  await db.documentLine.deleteMany();
  await db.document.deleteMany();
  await db.stockMove.deleteMany();
  await db.stockLevel.deleteMany();
  await db.item.deleteMany();
  await db.party.deleteMany();
  await db.recurringBill.deleteMany();
  await db.expenseCategory.deleteMany();
  await db.account.deleteMany();
  await db.organization.deleteMany();
  await db.session.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.user.deleteMany();
  await db.searchIndex.deleteMany();
  await db.shareLink.deleteMany();
  await db.invitation.deleteMany();
}
