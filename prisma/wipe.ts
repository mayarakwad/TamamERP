import type { PrismaClient } from "../src/generated/prisma/client";

/** Delete every row (children first; organizations cascade to most tables). */
export async function wipeAll(db: PrismaClient) {
  // Uploaded files belong to the workspaces being deleted.
  const { rmSync } = await import("node:fs");
  const path = await import("node:path");
  rmSync(path.resolve(process.env.STORAGE_DIR ?? "./storage", "orgs"), { recursive: true, force: true });
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
  await db.searchIndex.deleteMany();
  await db.shareLink.deleteMany();
  await db.invitation.deleteMany();
}
