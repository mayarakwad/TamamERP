import type { PrismaClient } from "../src/generated/prisma/client";

/** Delete every row (children first; organizations cascade to most tables). */
export async function wipeAll(db: PrismaClient) {
  await db.systemSetting.deleteMany();
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.comment.deleteMany();
  await db.attachment.deleteMany();
  await db.billPayment.deleteMany();
  await db.claim.deleteMany();
  await db.organization.deleteMany();
  await db.session.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.user.deleteMany();
}
