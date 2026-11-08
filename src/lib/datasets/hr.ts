import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick, type MessageKey } from "../i18n";
import { createFormatter, monthKey } from "../format";
import { monthDays, parseWeekend, dohaWeekday, ymdOf } from "../hr/ops";
import type { Column, Dataset, DatasetResult } from "./types";

const DAY = 86400_000;

/** Staff list with document-expiry flags. Salaries only for people who run payroll. */
export const employeesDataset: Dataset<Workspace> = {
  id: "employees",
  permissions: ["hr.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const q = params.get("q")?.trim();
    const view = params.get("view");
    const now = new Date();
    const soon = new Date(now.getTime() + 60 * DAY);
    const emps = await db.employee.findMany({
      where: {
        orgId: ws.org.id,
        status: view === "left" ? "terminated" : "active",
        ...(view === "expiring" ? { OR: [{ qidExpiry: { lte: soon } }, { passportExpiry: { lte: soon } }] } : {}),
        ...(params.get("department") ? { department: params.get("department")! } : {}),
        ...(q ? { AND: [{ OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { number: { contains: q.toUpperCase() } }, { qid: { contains: q } }, { jobTitle: { contains: q } }] }] } : {}),
      },
      orderBy: { number: "asc" },
    });
    const pay = ws.can("payroll.run") || ws.can("hr.manage");
    const campuses = new Map(ws.org.campuses.map((c) => [c.id, pick(locale, c.name, c.nameAr)]));
    const regions = new Intl.DisplayNames([locale === "ar" ? "ar" : "en"], { type: "region" });
    const columns: Column[] = [
      { key: "number", label: "hr.colNumber", type: "text", width: 10 },
      { key: "name", label: "hr.colName", type: "text", width: 28 },
      { key: "title", label: "hr.colTitle", type: "text", width: 22 },
      { key: "department", label: "hr.colDepartment", type: "text", width: 16, hideOnMobile: true },
      { key: "branch", label: "hr.colBranch", type: "text", width: 20, hideOnMobile: true },
      { key: "nationality", label: "hr.colNationality", type: "text", width: 14, hideOnMobile: true },
      { key: "joined", label: "hr.colJoined", type: "date", width: 13, hideOnMobile: true },
      { key: "qidExpiry", label: "hr.colQidExpiry", type: "date", width: 13 },
      ...(pay ? [{ key: "gross", label: "hr.colGross" as const, type: "money" as const, total: true, width: 14 }] : []),
      { key: "docs", label: "hr.colDocs", type: "enum", options: { ok: "hr.docsOk", soon: "hr.docsSoon", expired: "hr.docsExpired" }, width: 14 },
    ];
    const docState = (d: Date | null) => (!d ? "ok" : d < now ? "expired" : d < soon ? "soon" : "ok");
    return {
      title: t("nav.employees"),
      subtitle: view === "expiring" ? t("hr.expiringSoon") : view === "left" ? t("hr.leftView") : undefined,
      columns,
      rows: emps.map((e) => {
        const states = [docState(e.qidExpiry), docState(e.passportExpiry)];
        return {
          id: e.id,
          href: `hr/employees/${e.id}`,
          cells: {
            number: e.number,
            name: pick(locale, e.name, e.nameAr),
            title: pick(locale, e.jobTitle ?? "", e.jobTitleAr),
            department: e.department,
            branch: e.campusId ? (campuses.get(e.campusId) ?? "") : "",
            nationality: e.nationality ? (regions.of(e.nationality) ?? e.nationality) : "",
            joined: e.joinedOn.toISOString(),
            qidExpiry: e.qidExpiry?.toISOString() ?? null,
            gross: e.basicSalary + e.housingAllowance + e.transportAllowance + e.foodAllowance + e.otherAllowance,
            docs: states.includes("expired") ? "expired" : states.includes("soon") ? "soon" : "ok",
          },
          meta: { userId: e.userId },
        };
      }),
    };
  },
};

const STATUS_CODE: Record<string, string> = { present: "P", late: "L", absent: "A", leave: "V", sick: "S", holiday: "H" };

/** One month of attendance: a row per person, a column per day, totals at the end. */
export const attendanceDataset: Dataset<Workspace> = {
  id: "attendance",
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const month = /^\d{4}-\d{2}$/.test(params.get("month") ?? "") ? params.get("month")! : monthKey(new Date(), ws.org.timezone);
    const days = monthDays(month);
    const weekend = parseWeekend(ws.org.weekend);
    const self = !ws.can("hr.view");
    const emps = await db.employee.findMany({ where: { orgId: ws.org.id, status: "active", ...(self ? { userId: ws.viewer.id } : {}) }, orderBy: { number: "asc" } });
    const rows = await db.attendanceDay.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, date: { gte: days[0], lte: days[days.length - 1] } } });
    const byKey = new Map(rows.map((r) => [`${r.employeeId}|${ymdOf(r.date)}`, r]));
    const fmt = createFormatter({ locale, digits: "latn" });
    const today = ymdOf(new Date());
    return {
      title: t("nav.attendance"),
      subtitle: fmt.monthName(days[0]),
      columns: [
        { key: "name", label: "hr.colName", type: "text", width: 24 },
        ...days.map((d) => ({ key: ymdOf(d), label: "hr.colDay" as MessageKey, header: String(Number(ymdOf(d).slice(8))), type: "text" as const, width: 4 })),
        { key: "present", label: "hr.colPresent", type: "number", width: 8 },
        { key: "late", label: "hr.colLate", type: "number", width: 8 },
        { key: "absent", label: "hr.colAbsent", type: "number", width: 8 },
        { key: "leave", label: "hr.colLeaveDays", type: "number", width: 8 },
        { key: "ot", label: "hr.colOvertime", type: "number", width: 8 },
      ],
      rows: emps.map((e) => {
        const cells: Record<string, string | number | null> = { name: pick(locale, e.name, e.nameAr) };
        let present = 0,
          late = 0,
          absent = 0,
          leave = 0,
          ot = 0;
        for (const d of days) {
          const key = ymdOf(d);
          const r = byKey.get(`${e.id}|${key}`);
          const off = weekend.includes(dohaWeekday(d));
          cells[key] = r ? STATUS_CODE[r.status] : off ? "·" : key < today && d >= e.joinedOn ? "A" : "";
          const st = r?.status ?? (!off && key < today && d >= e.joinedOn ? "absent" : null);
          if (st === "present") present++;
          if (st === "late") (late++, present++);
          if (st === "absent") absent++;
          if (st === "leave" || st === "sick") leave++;
          ot += r?.overtimeMin ?? 0;
        }
        Object.assign(cells, { present, late, absent, leave, ot: Math.round((ot / 60) * 10) / 10 });
        return { id: e.id, href: ws.can("hr.view") ? `hr/employees/${e.id}` : undefined, cells, meta: { number: e.number } };
      }),
    };
  },
};

/** Leave requests: everyone's for HR and approvers, your own otherwise. */
export const leaveDataset: Dataset<Workspace> = {
  id: "leave",
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const all = ws.can("hr.view") || ws.can("leave.approve");
    const status = params.get("status");
    const reqs = await db.leaveRequest.findMany({
      where: { orgId: ws.org.id, ...(all ? {} : { employee: { userId: ws.viewer.id } }), ...(status ? { status } : {}), ...(params.get("type") ? { type: params.get("type")! } : {}) },
      orderBy: [{ startDate: "desc" }],
      include: { employee: { select: { name: true, nameAr: true, number: true, userId: true } } },
      take: 2000,
    });
    return {
      title: t("nav.leave"),
      subtitle: status ? t(`status.${status}` as MessageKey) : undefined,
      columns: [
        { key: "number", label: "hr.colRequest", type: "text", width: 15 },
        ...(all ? [{ key: "employee", label: "hr.colName" as const, type: "text" as const, width: 24 }] : []),
        { key: "type", label: "hr.colLeaveType", type: "enum", options: { annual: "hr.leave_annual", sick: "hr.leave_sick", unpaid: "hr.leave_unpaid", emergency: "hr.leave_emergency", maternity: "hr.leave_maternity", hajj: "hr.leave_hajj" }, width: 14 },
        { key: "from", label: "hr.colFrom", type: "date", width: 13 },
        { key: "to", label: "hr.colTo", type: "date", width: 13 },
        { key: "days", label: "hr.colDays", type: "number", total: true, width: 8 },
        { key: "status", label: "docs.colStatus", type: "enum", options: { submitted: "status.submitted", approved: "status.approved", rejected: "status.rejected", cancelled: "status.cancelled" }, width: 14 },
      ],
      rows: reqs.map((r) => ({
        id: r.id,
        cells: { number: r.number, employee: pick(locale, r.employee.name, r.employee.nameAr), type: r.type, from: r.startDate.toISOString(), to: r.endDate.toISOString(), days: r.days, status: r.status },
        meta: { reason: r.reason, own: r.employee.userId === ws.viewer.id, decisionNote: r.decisionNote },
      })),
    };
  },
};

/** The payslips in one payroll run, for export. */
export const payslipsDataset: Dataset<Workspace> = {
  id: "payslips",
  permissions: ["payroll.run", "hr.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const run = await db.payrollRun.findFirst({ where: { id: params.get("run") ?? "", orgId: ws.org.id }, include: { payslips: { include: { employee: true }, orderBy: { employee: { number: "asc" } } } } });
    const fmt = createFormatter({ locale, digits: "latn" });
    return {
      title: t("payroll.payslips"),
      subtitle: run ? fmt.monthName(new Date(`${run.month}-15T12:00:00+03:00`)) : undefined,
      columns: [
        { key: "number", label: "hr.colNumber", type: "text", width: 10 },
        { key: "name", label: "hr.colName", type: "text", width: 26 },
        { key: "days", label: "payroll.daysPaid", type: "number", width: 9 },
        { key: "basic", label: "hr.basicSalary", type: "money", total: true, width: 13 },
        { key: "allowances", label: "payroll.allowances", type: "money", total: true, width: 13 },
        { key: "overtime", label: "payroll.overtime", type: "money", total: true, width: 12 },
        { key: "bonus", label: "payroll.bonus", type: "money", total: true, width: 12 },
        { key: "deductions", label: "payroll.deductions", type: "money", total: true, width: 13 },
        { key: "net", label: "payroll.netPay", type: "money", total: true, width: 14 },
        { key: "method", label: "hr.payMethod", type: "enum", options: { bank: "hr.payBank", cash: "hr.payCash" }, width: 14 },
      ],
      rows: (run?.payslips ?? []).map((s) => ({
        id: s.id,
        href: `hr/employees/${s.employeeId}`,
        cells: { number: s.employee.number, name: pick(locale, s.employee.name, s.employee.nameAr), days: s.workingDays, basic: s.basic, allowances: s.housing + s.transport + s.food + s.other, overtime: s.overtimePay, bonus: s.bonus, deductions: s.deductions, net: s.net, method: s.employee.payMethod },
      })),
    };
  },
};
