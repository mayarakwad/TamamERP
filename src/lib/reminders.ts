// Reminder sweep: bills coming due and warranties about to end become
// notifications. Runs at server start and then hourly (src/instrumentation.ts).
// Each reminder is sent once (remindedAt / warrantyRemindedAt).

import type { PrismaClient } from "@/generated/prisma/client";
import { membersWithRoles, notify } from "./notify";

const DAY = 86400_000;

function qar(dirhams: number) {
  return `QAR ${(dirhams / 100).toLocaleString("en", { maximumFractionDigits: 2 })}`;
}

export async function runReminders(db: PrismaClient, now = new Date()) {
  let sent = 0;
  const due = await db.billPayment.findMany({
    where: { status: "due", remindedAt: null, dueOn: { lte: new Date(now.getTime() + 31 * DAY) } },
    include: { bill: true },
  });
  for (const p of due) {
    if (!p.bill.active) continue;
    const days = Math.ceil((p.dueOn.getTime() - now.getTime()) / DAY);
    if (days > p.bill.remindDaysBefore) continue;
    const people = await membersWithRoles(db, p.orgId, ["owner", "admin"]);
    const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    const whenAr = days <= 0 ? "اليوم" : days === 1 ? "غداً" : `خلال ${days} أيام`;
    await notify(db, {
      orgId: p.orgId,
      userIds: people,
      kind: "bill.due",
      title: `${p.bill.name} is due ${when} (${qar(p.amount)})`,
      titleAr: `${p.bill.nameAr ?? p.bill.name} مستحقة ${whenAr} (${qar(p.amount)})`,
      href: `bills?bill=${p.billId}`,
    });
    await db.billPayment.update({ where: { id: p.id }, data: { remindedAt: now } });
    sent++;
  }

  const ending = await db.possession.findMany({
    where: { warrantyRemindedAt: null, warrantyUntil: { gte: now, lte: new Date(now.getTime() + 30 * DAY) } },
  });
  for (const item of ending) {
    const people = await membersWithRoles(db, item.orgId, ["owner", "admin"]);
    const days = Math.ceil((item.warrantyUntil!.getTime() - now.getTime()) / DAY);
    await notify(db, {
      orgId: item.orgId,
      userIds: people,
      kind: "warranty.ending",
      title: `${item.name}: warranty ends in ${days} days`,
      titleAr: `${item.nameAr ?? item.name}: ينتهي الضمان خلال ${days} يوماً`,
      href: `things?item=${item.id}`,
    });
    await db.possession.update({ where: { id: item.id }, data: { warrantyRemindedAt: now } });
    sent++;
  }
  // QIDs and passports expiring within 30 days: tell HR once per document.
  const soon = new Date(now.getTime() + 30 * DAY);
  for (const kind of ["qid", "passport"] as const) {
    const field = kind === "qid" ? "qidExpiry" : "passportExpiry";
    const flag = kind === "qid" ? "qidRemindedAt" : "passportRemindedAt";
    const due = await db.employee.findMany({ where: { status: "active", [field]: { gte: now, lte: soon }, [flag]: null } });
    for (const e of due) {
      const until = e[field]!;
      const days = Math.ceil((until.getTime() - now.getTime()) / DAY);
      const label = kind === "qid" ? ["QID", "البطاقة الشخصية"] : ["passport", "جواز السفر"];
      await notify(db, {
        orgId: e.orgId,
        userIds: await membersWithRoles(db, e.orgId, ["owner", "admin"]),
        kind: "employee.document",
        title: `${e.name}'s ${label[0]} expires in ${days} days`,
        titleAr: `ينتهي ${label[1]} للموظف ${e.nameAr ?? e.name} خلال ${days} يوماً`,
        href: `hr/employees/${e.id}`,
      });
      await db.employee.update({ where: { id: e.id }, data: { [flag]: now } });
      sent++;
    }
  }

  return sent;
}
