"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getViewer, getWorkspace } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { notify, membersWithRoles } from "@/lib/notify";
import { indexMember, removeFromIndex } from "@/lib/search/index-core";
import { ROLES_BY_TYPE, isRole, type OrgType, type Role } from "@/lib/rbac";
import type { ActionResult } from "./claims";
import type { FormState } from "./auth";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const PRIVILEGED: Role[] = ["owner", "admin"];

/** Owners manage anyone; admins manage everyone below admin. */
function mayManage(actor: Role, targetRole: Role, newRole?: Role) {
  if (actor === "owner") return true;
  if (actor !== "admin") return false;
  return !PRIVILEGED.includes(targetRole) && (!newRole || !PRIVILEGED.includes(newRole));
}

export async function inviteMember(slug: string, input: { email: string; role: string; title: string }): Promise<ActionResult<{ url: string }>> {
  const ws = await getWorkspace(slug);
  if (!ws.can("members.manage")) return { ok: false, error: "empty.notAllowed" };
  const email = z.email().safeParse(input.email.trim().toLowerCase());
  if (!email.success) return { ok: false, error: "errors.invalidEmail", field: "email" };
  if (!isRole(input.role) || !ROLES_BY_TYPE[ws.orgType].includes(input.role) || !mayManage(ws.role, "member", input.role)) return { ok: false, error: "members.cantManage", field: "role" };
  const existing = await db.membership.findFirst({ where: { orgId: ws.org.id, user: { email: email.data } } });
  if (existing) return { ok: false, error: "signup.emailTaken", field: "email" };
  const token = randomBytes(24).toString("base64url");
  await db.invitation.create({
    data: { orgId: ws.org.id, email: email.data, role: input.role, title: input.title.trim() || null, tokenHash: hash(token), invitedById: ws.viewer.id, expiresAt: new Date(Date.now() + 14 * 86400_000) },
  });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "member.invited", summary: `invited ${email.data} as ${input.role}`, summaryAr: `دعوة ${email.data}`, sensitive: true });
  refresh();
  return { ok: true, url: `/invite/${token}` };
}

export async function revokeInvite(slug: string, id: string): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!ws.can("members.manage")) return { ok: false, error: "empty.notAllowed" };
  const inv = await db.invitation.findFirst({ where: { id, orgId: ws.org.id } });
  if (!inv) return { ok: false, error: "empty.notFound" };
  await db.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "member.invite_revoked", summary: `revoked the invitation for ${inv.email}`, summaryAr: `إلغاء دعوة ${inv.email}`, sensitive: true });
  refresh();
  return { ok: true };
}

async function ownersLeft(orgId: string, exceptMembershipId: string) {
  return db.membership.count({ where: { orgId, role: "owner", status: "active", NOT: { id: exceptMembershipId } } });
}

export async function changeRole(slug: string, membershipId: string, role: string): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!ws.can("members.manage")) return { ok: false, error: "empty.notAllowed" };
  const m = await db.membership.findFirst({ where: { id: membershipId, orgId: ws.org.id }, include: { user: true } });
  if (!m || !isRole(role) || !ROLES_BY_TYPE[ws.orgType].includes(role)) return { ok: false, error: "empty.notFound" };
  if (!mayManage(ws.role, m.role as Role, role)) return { ok: false, error: "members.cantManage" };
  if (m.role === "owner" && role !== "owner" && (await ownersLeft(ws.org.id, m.id)) === 0) return { ok: false, error: "members.lastOwner" };
  await db.membership.update({ where: { id: m.id }, data: { role } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "member.role_changed", entityType: "user", entityId: m.userId, summary: `changed ${m.user.name}'s role from ${m.role} to ${role}`, summaryAr: `تغيير دور ${m.user.nameAr ?? m.user.name}`, sensitive: true });
  await indexMember(db, m.id);
  refresh();
  return { ok: true };
}

export async function removeMember(slug: string, membershipId: string): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!ws.can("members.manage")) return { ok: false, error: "empty.notAllowed" };
  const m = await db.membership.findFirst({ where: { id: membershipId, orgId: ws.org.id }, include: { user: true } });
  if (!m || m.userId === ws.viewer.id) return { ok: false, error: "empty.notFound" };
  if (!mayManage(ws.role, m.role as Role)) return { ok: false, error: "members.cantManage" };
  if (m.role === "owner" && (await ownersLeft(ws.org.id, m.id)) === 0) return { ok: false, error: "members.lastOwner" };
  await db.membership.delete({ where: { id: m.id } });
  await removeFromIndex(db, "member", m.id);
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "member.removed", entityType: "user", entityId: m.userId, summary: `removed ${m.user.name} (${m.role})`, summaryAr: `إزالة ${m.user.nameAr ?? m.user.name}`, sensitive: true });
  refresh();
  return { ok: true };
}

async function findInvite(token: string) {
  const inv = await db.invitation.findUnique({ where: { tokenHash: hash(token) }, include: { org: true } });
  if (!inv || inv.revokedAt || inv.expiresAt < new Date()) return { state: "expired" as const };
  if (inv.acceptedAt) return { state: "used" as const, inv };
  return { state: "ok" as const, inv };
}

async function join(inv: NonNullable<Awaited<ReturnType<typeof findInvite>>["inv"]>, userId: string, name: string) {
  const m = await db.membership.create({ data: { orgId: inv.orgId, userId, role: inv.role, title: inv.title } });
  await db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  await db.user.update({ where: { id: userId }, data: { lastOrgId: inv.orgId } });
  // Schools: a parent invited by email sees the children of every guardian
  // record with that email; staff are linked to their employee record.
  if (inv.role === "parent") await db.guardian.updateMany({ where: { orgId: inv.orgId, email: inv.email, userId: null }, data: { userId } });
  if (["teacher", "employee", "accountant", "admin"].includes(inv.role)) await db.employee.updateMany({ where: { orgId: inv.orgId, email: inv.email, userId: null }, data: { userId } });
  await indexMember(db, m.id);
  await audit({ orgId: inv.orgId, userId, action: "member.joined", summary: `joined as ${inv.role} (invited)`, summaryAr: "الانضمام عبر دعوة", sensitive: true });
  await notify(db, { orgId: inv.orgId, userIds: await membersWithRoles(db, inv.orgId, ["owner", "admin"]), except: userId, kind: "member.joined", title: `${name} joined the workspace`, titleAr: `انضمام ${name} إلى مساحة العمل` });
}

/** Signed in already: join with the current account (email must match). */
export async function acceptInvite(token: string): Promise<ActionResult<{ slug: string }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.generic" };
  const found = await findInvite(token);
  if (found.state !== "ok") return { ok: false, error: found.state === "used" ? "invite.used" : "invite.expired" };
  if (found.inv.email !== viewer.email) return { ok: false, error: "invite.wrongAccount" };
  if (!(await db.membership.findFirst({ where: { orgId: found.inv.orgId, userId: viewer.id } }))) await join(found.inv, viewer.id, viewer.name);
  return { ok: true, slug: found.inv.org.slug };
}

/** New to Tamam: create the account and join in one step. */
export async function acceptInviteWithSignup(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const found = await findInvite(token);
  if (found.state !== "ok") return { error: found.state === "used" ? "invite.used" : "invite.expired" };
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (name.length < 2) return { fieldErrors: { name: "errors.tooShort" }, values: { name } };
  if (password.length < 8) return { fieldErrors: { password: "signup.passwordHint" }, values: { name } };
  if (await db.user.findUnique({ where: { email: found.inv.email } })) return { error: "signup.emailTaken" };
  const user = await db.user.create({ data: { email: found.inv.email, name, passwordHash: await hashPassword(password), preferences: { locale: found.inv.org.locale } } });
  await join(found.inv, user.id, name);
  await createSession(user.id);
  redirect(`/w/${found.inv.org.slug}`);
}

export async function inviteDetails(token: string) {
  const found = await findInvite(token);
  if (found.state === "expired") return { state: "expired" as const };
  const inviter = await db.user.findUnique({ where: { id: found.inv.invitedById } });
  const hasAccount = !!(await db.user.findUnique({ where: { email: found.inv.email } }));
  return {
    state: found.state,
    email: found.inv.email,
    role: found.inv.role as Role,
    orgType: found.inv.org.type as OrgType,
    workspace: found.inv.org.name,
    workspaceAr: found.inv.org.nameAr,
    inviter: inviter?.name ?? "",
    inviterAr: inviter?.nameAr ?? null,
    hasAccount,
  };
}
