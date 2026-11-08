import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick, type MessageKey } from "../i18n";
import { getSchool, studentScope } from "../school/scope";
import { sectionName } from "../school/settings";
import type { Prisma } from "@/generated/prisma/client";
import type { Column, Dataset, DatasetResult } from "./types";

const DAY = 86400_000;
const ageOf = (dob: Date, now = new Date()) => Math.floor((now.getTime() - dob.getTime()) / (365.25 * DAY));

/** Students in this person's scope, with their class, family and bus. */
export const studentsDataset: Dataset<Workspace> = {
  id: "students",
  permissions: ["school.manage", "school.teach", "finance.view", "transport.manage", "library.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const view = params.get("view");
    const q = params.get("q")?.trim();
    const where: Prisma.StudentWhereInput = {
      ...studentScope(s),
      status: view === "left" ? { in: ["withdrawn", "graduated"] } : view === "upcoming" ? "upcoming" : "active",
      ...(view === "new" ? { joinedOn: { gte: s.year.startDate } } : {}),
      ...(view === "medical" ? { medical: { not: null } } : {}),
      ...(params.get("grade") ? { grade: { level: Number(params.get("grade")) } } : {}),
      ...(params.get("section") ? { sectionId: params.get("section")! } : {}),
      ...(q
        ? { AND: [{ OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { number: { contains: q.toUpperCase() } }, { qid: { contains: q } }, { guardians: { some: { guardian: { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { phone: { contains: q } }] } } } }] }] }
        : {}),
    };
    const rows = await db.student.findMany({
      where,
      include: {
        grade: true,
        section: true,
        campus: true,
        busStop: { include: { route: true } },
        guardians: { where: { primary: true }, include: { guardian: true }, take: 1 },
      },
      orderBy: [{ grade: { level: "asc" } }, { campus: { name: "asc" } }, { section: { name: "asc" } }, { name: "asc" }],
      take: 3000,
    });
    const multiCampus = s.campusIds.length > 1;
    const regions = new Intl.DisplayNames([locale], { type: "region" });
    const seesFamily = ws.can("school.manage") || ws.can("finance.view") || ws.can("transport.manage");
    const columns: Column[] = [
      { key: "number", label: "students.colNumber", type: "text", width: 15 },
      { key: "name", label: "students.colName", type: "text", width: 30 },
      { key: "class", label: "students.colClass", type: "text", width: 9 },
      ...(multiCampus ? [{ key: "campus", label: "students.colCampus" as const, type: "text" as const, width: 16, hideOnMobile: true }] : []),
      { key: "gender", label: "students.colGender", type: "enum", options: { m: "school.gender_m", f: "school.gender_f" }, width: 8, hideOnMobile: true },
      { key: "dob", label: "students.colDob", type: "date", width: 12, exportOnly: true },
      { key: "age", label: "students.colAge", type: "number", width: 6, hideOnMobile: true },
      { key: "nationality", label: "students.colNationality", type: "text", width: 14, exportOnly: true },
      ...(seesFamily
        ? [
            { key: "guardian", label: "students.colGuardian" as const, type: "text" as const, width: 24, hideOnMobile: true },
            { key: "phone", label: "students.colPhone" as const, type: "text" as const, width: 15, exportOnly: true },
          ]
        : []),
      { key: "bus", label: "students.colBus", type: "text", width: 9, hideOnMobile: true },
      { key: "joined", label: "students.colJoined", type: "date", width: 12, exportOnly: true },
    ];
    const subtitle = [
      s.campus ? pick(locale, s.campus.name, s.campus.nameAr) : null,
      view === "new" ? t("students.viewNew") : view === "medical" ? t("students.viewMedical") : view === "left" ? t("students.viewLeft") : view === "upcoming" ? t("students.viewUpcoming") : null,
      params.get("grade") ? rows[0]?.grade && pick(locale, rows[0].grade.name, rows[0].grade.nameAr) : null,
    ].filter(Boolean).join(" · ");
    return {
      title: t("students.title"),
      subtitle: subtitle || undefined,
      columns,
      rows: rows.map((st) => {
        const g = st.guardians[0]?.guardian;
        return {
          id: st.id,
          href: `students/${st.id}`,
          cells: {
            number: st.number,
            name: pick(locale, st.name, st.nameAr),
            class: st.section ? sectionName(locale, st.grade, st.section.name) : pick(locale, st.grade.name, st.grade.nameAr),
            campus: pick(locale, st.campus.name, st.campus.nameAr),
            gender: st.gender,
            dob: st.dob.toISOString(),
            age: ageOf(st.dob),
            nationality: st.nationality ? (regions.of(st.nationality) ?? st.nationality) : "",
            guardian: g ? pick(locale, g.name, g.nameAr) : "",
            phone: g?.phone ?? "",
            bus: st.busStop?.route.code ?? "",
            joined: st.joinedOn.toISOString(),
          },
          meta: { color: st.avatarColor, medical: !!st.medical, gender: st.gender, plainName: st.name },
        };
      }),
    };
  },
};

/** Parents and guardians with their children and fee balance. */
export const guardiansDataset: Dataset<Workspace> = {
  id: "guardians",
  permissions: ["school.manage", "finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const q = params.get("q")?.trim();
    const view = params.get("view");
    const rows = await db.guardian.findMany({
      where: {
        orgId: ws.org.id,
        children: { some: { student: { campusId: { in: s.campusIds }, status: { in: ["active", "upcoming"] } } } },
        ...(view === "noaccess" ? { userId: null } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { phone: { contains: q } }, { email: { contains: q.toLowerCase() } }, { qid: { contains: q } }] } : {}),
      },
      include: { children: { where: { student: { status: { in: ["active", "upcoming"] } } }, include: { student: { include: { grade: true, section: true } } } } },
      orderBy: { name: "asc" },
      take: 3000,
    });
    const partyIds = rows.map((g) => g.partyId).filter((x): x is string => !!x);
    const open = partyIds.length
      ? await db.document.groupBy({ by: ["partyId"], where: { orgId: ws.org.id, kind: "fee", status: { in: ["issued", "partial"] }, partyId: { in: partyIds } }, _sum: { total: true, paid: true } })
      : [];
    const balance = new Map(open.map((o) => [o.partyId, (o._sum.total ?? 0) - (o._sum.paid ?? 0)]));
    const invited = new Set((await db.invitation.findMany({ where: { orgId: ws.org.id, role: "parent", acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true } })).map((i) => i.email));
    const showMoney = ws.can("finance.view") || ws.can("school.manage");
    const list = rows
      .map((g) => ({ g, due: g.partyId ? (balance.get(g.partyId) ?? 0) : 0 }))
      .filter((x) => view !== "balance" || x.due > 0);
    return {
      title: t("guardians.title"),
      subtitle: view === "balance" ? t("guardians.viewWithBalance") : view === "noaccess" ? t("guardians.viewNoAccess") : undefined,
      columns: [
        { key: "name", label: "guardians.colName", type: "text", width: 28 },
        { key: "phone", label: "guardians.colPhone", type: "text", width: 16 },
        { key: "email", label: "guardians.colEmail", type: "text", width: 28, hideOnMobile: true },
        { key: "children", label: "guardians.colChildren", type: "text", width: 34 },
        { key: "access", label: "guardians.colAccess", type: "enum", options: { on: "guardians.accessOn", invited: "guardians.accessInvited", off: "guardians.accessOff" }, width: 12, hideOnMobile: true },
        ...(showMoney ? [{ key: "balance", label: "guardians.colBalance" as const, type: "money" as const, total: true, width: 14 }] : []),
      ],
      rows: list.map(({ g, due }) => ({
        id: g.id,
        href: `guardians/${g.id}`,
        cells: {
          name: pick(locale, g.name, g.nameAr),
          phone: g.phone ?? "",
          email: g.email ?? "",
          children: g.children.map((c) => `${pick(locale, c.student.name, c.student.nameAr).split(" ")[0]} (${c.student.section ? sectionName(locale, c.student.grade, c.student.section.name) : pick(locale, c.student.grade.name, c.student.grade.nameAr)})`).join(", "),
          access: g.userId ? "on" : g.email && invited.has(g.email) ? "invited" : "off",
          balance: due,
        },
      })),
    };
  },
};

/** Admissions applications for one academic year. */
export const applicationsDataset: Dataset<Workspace> = {
  id: "applications",
  permissions: ["school.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const yearId = params.get("year") ?? s.year.id;
    const year = await db.academicYear.findFirst({ where: { id: yearId, orgId: ws.org.id } });
    const rows = await db.application.findMany({ where: { orgId: ws.org.id, yearId, campusId: { in: s.campusIds }, ...(params.get("stage") ? { stage: params.get("stage")! } : {}) }, include: { grade: true, campus: true }, orderBy: [{ createdAt: "desc" }] });
    const stages = { applied: "admissions.stage_applied", assessment: "admissions.stage_assessment", offered: "admissions.stage_offered", enrolled: "admissions.stage_enrolled", declined: "admissions.stage_declined", withdrawn: "admissions.stage_withdrawn" } as const;
    const sources = { web: "admissions.source_web", walkin: "admissions.source_walkin", referral: "admissions.source_referral", sibling: "admissions.source_sibling" } as const;
    return {
      title: t("admissions.title"),
      subtitle: year?.name,
      columns: [
        { key: "number", label: "admissions.colNumber", type: "text", width: 15 },
        { key: "child", label: "admissions.colChild", type: "text", width: 28 },
        { key: "grade", label: "admissions.colGrade", type: "text", width: 14 },
        { key: "campus", label: "admissions.colCampus", type: "text", width: 16 },
        { key: "guardian", label: "admissions.colGuardian", type: "text", width: 26 },
        { key: "phone", label: "admissions.colPhone", type: "text", width: 16 },
        { key: "stage", label: "admissions.colStage", type: "enum", options: stages, width: 14 },
        { key: "applied", label: "admissions.colApplied", type: "date", width: 12 },
        { key: "source", label: "admissions.colSource", type: "enum", options: sources, width: 14 },
        { key: "score", label: "admissions.colScore", type: "number", width: 8 },
      ],
      rows: rows.map((a) => ({
        id: a.id,
        href: `admissions?open=${a.id}`,
        cells: {
          number: a.number,
          child: pick(locale, a.childName, a.childNameAr),
          grade: pick(locale, a.grade.name, a.grade.nameAr),
          campus: pick(locale, a.campus.name, a.campus.nameAr),
          guardian: pick(locale, a.guardianName, a.guardianNameAr),
          phone: a.guardianPhone,
          stage: a.stage,
          applied: a.createdAt.toISOString(),
          source: a.source,
          score: a.assessmentScore,
        },
      })),
    };
  },
};

/** A class timetable (or a teacher's week): periods down, days across. Prints on one page. */
export const timetableDataset: Dataset<Workspace> = {
  id: "timetable",
  permissions: ["school.manage", "school.teach", "school.parent"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const sectionId = params.get("section");
    const teacherId = params.get("teacher");
    const sec = sectionId ? await db.section.findFirst({ where: { id: sectionId, orgId: ws.org.id }, include: { grade: true } }) : null;
    const teacher = teacherId ? await db.employee.findFirst({ where: { id: teacherId, orgId: ws.org.id } }) : null;
    // Office staff see any timetable; teachers their classes and their own week; parents their children's classes.
    const allowed =
      ws.can("school.manage") ||
      (sec && (s.teachSectionIds.includes(sec.id) || (s.childIds.length && (await db.student.count({ where: { id: { in: s.childIds }, sectionId: sec.id } })) > 0))) ||
      (teacher && teacher.id === s.employee?.id);
    if (!allowed || (!sec && !teacher)) return { title: t("timetable.title"), columns: [{ key: "period", label: "timetable.periodCol", type: "text" }], rows: [] };
    const slots = await db.timetableSlot.findMany({ where: sec ? { sectionId: sec.id } : { teacherId: teacher!.id, section: { yearId: s.year.id } }, include: { subject: true, teacher: true, section: { include: { grade: true } } } });
    const days = s.settings.days;
    return {
      title: `${t("timetable.title")} · ${sec ? sectionName(locale, sec.grade, sec.name) : pick(locale, teacher!.name, teacher!.nameAr)}`,
      subtitle: s.year.name,
      columns: [
        { key: "period", label: "timetable.periodCol", type: "text", width: 14 },
        ...days.map((d) => ({ key: `d${d}`, label: `timetable.day_${d}` as MessageKey, type: "text" as const, width: 22 })),
      ],
      rows: s.settings.periods.map((p, i) => {
        const cells: Record<string, string> = { period: `${t("timetable.period", { n: i + 1 })} ${p.start}–${p.end}` };
        for (const d of days) {
          const x = slots.find((y) => y.day === d && y.period === i + 1);
          cells[`d${d}`] = x ? `${pick(locale, x.subject.name, x.subject.nameAr)} · ${sec ? (x.teacher ? pick(locale, x.teacher.name, x.teacher.nameAr) : "") : sectionName(locale, x.section.grade, x.section.name)}` : "";
        }
        return { id: String(i), cells };
      }),
    };
  },
};

const FEE_STATUS = { issued: "status.open", partial: "status.partial", paid: "status.paid", overdue: "status.overdue", void: "status.void" } as const;

/** Fee invoices in scope with what's still owed. */
export const feeInvoicesDataset: Dataset<Workspace> = {
  id: "fee-invoices",
  permissions: ["finance.view", "school.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const status = params.get("status");
    const q = params.get("q")?.trim();
    const now = new Date();
    const where: Prisma.DocumentWhereInput = {
      orgId: ws.org.id,
      kind: "fee",
      status: status === "paid" ? "paid" : status === "void" ? "void" : status === "open" || status === "overdue" ? { in: ["issued", "partial"] } : { not: "draft" },
      ...(status === "overdue" ? { dueDate: { lt: now } } : {}),
      student: { campusId: { in: s.campusIds }, ...(params.get("grade") ? { grade: { level: Number(params.get("grade")) } } : {}) },
      ...(params.get("installment") ? { installment: params.get("installment")! } : {}),
      ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { party: { name: { contains: q } } }, { student: { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }] } }] } : {}),
    };
    const docs = await db.document.findMany({ where, include: { party: true, student: { include: { grade: true, section: true } } }, orderBy: [{ date: "desc" }, { number: "desc" }], take: 3000 });
    const insts = s.settings.installments;
    const instLabel = (key: string | null) => {
      if (!key) return "";
      const [year, part] = key.split("/");
      if (part === "reg") return `${t("fees.component_registration")} ${year}`;
      const i = insts[Number(part) - 1];
      return i ? `${pick(locale, i.label, i.labelAr)} ${year}` : key;
    };
    return {
      title: t("fees.invoices"),
      subtitle: [status ? t(status === "overdue" ? "fees.viewOverdue" : status === "paid" ? "fees.viewPaid" : "fees.viewOpen") : null, params.get("installment") ? instLabel(params.get("installment")) : null].filter(Boolean).join(" · ") || undefined,
      columns: [
        { key: "number", label: "fees.colNumber", type: "text", width: 16 },
        { key: "student", label: "fees.colStudent", type: "text", width: 28 },
        { key: "class", label: "fees.colClass", type: "text", width: 8 },
        { key: "family", label: "fees.colFamily", type: "text", width: 24, hideOnMobile: true },
        { key: "installment", label: "fees.colInstallment", type: "text", width: 18, hideOnMobile: true },
        { key: "due", label: "fees.colDue", type: "date", width: 12, hideOnMobile: true },
        { key: "total", label: "fees.colTotal", type: "money", total: true, width: 14 },
        { key: "balance", label: "fees.colBalance", type: "money", total: true, width: 14 },
        { key: "status", label: "fees.colStatus", type: "enum", options: FEE_STATUS, width: 12 },
      ],
      rows: docs.map((d) => ({
        id: d.id,
        href: `fees/invoices/${d.id}`,
        cells: {
          number: d.number,
          student: d.student ? pick(locale, d.student.name, d.student.nameAr) : "",
          class: d.student ? (d.student.section ? sectionName(locale, d.student.grade, d.student.section.name) : pick(locale, d.student.grade.name, d.student.grade.nameAr)) : "",
          family: pick(locale, d.party.name, d.party.nameAr),
          installment: instLabel(d.installment),
          due: d.dueDate?.toISOString() ?? null,
          total: d.total,
          balance: d.status === "void" ? 0 : d.total - d.paid,
          status: d.status === "issued" || d.status === "partial" ? (d.dueDate && d.dueDate < now ? "overdue" : d.status) : d.status,
        },
      })),
    };
  },
};

/** Money received for fees. */
export const feePaymentsDataset: Dataset<Workspace> = {
  id: "fee-payments",
  permissions: ["finance.view", "school.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const q = params.get("q")?.trim();
    const pays = await db.payment.findMany({
      where: { orgId: ws.org.id, direction: "in", voidedAt: null, allocations: { some: { document: { kind: "fee", student: { campusId: { in: s.campusIds } } } } }, ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { party: { name: { contains: q } } }, { reference: { contains: q } }] } : {}) },
      include: { party: true, allocations: { include: { document: { include: { student: true } } } } },
      orderBy: { date: "desc" },
      take: 3000,
    });
    const methods = { transfer: "fees.method_transfer", card: "fees.method_card", cash: "fees.method_cash", cheque: "fees.method_cheque" } as const;
    return {
      title: t("fees.payments"),
      columns: [
        { key: "number", label: "fees.colNumber", type: "text", width: 16 },
        { key: "date", label: "fees.colDate", type: "date", width: 12 },
        { key: "family", label: "fees.colFamily", type: "text", width: 26 },
        { key: "students", label: "fees.colStudent", type: "text", width: 26, hideOnMobile: true },
        { key: "method", label: "fees.colMethod", type: "enum", options: methods, width: 14 },
        { key: "reference", label: "fees.colReference", type: "text", width: 16, hideOnMobile: true },
        { key: "amount", label: "fees.colAmount", type: "money", total: true, width: 14 },
      ],
      rows: pays.map((p) => ({
        id: p.id,
        cells: {
          number: p.number,
          date: p.date.toISOString(),
          family: pick(locale, p.party.name, p.party.nameAr),
          students: [...new Set(p.allocations.map((a) => (a.document.student ? pick(locale, a.document.student.name, a.document.student.nameAr).split(" ")[0] : "")).filter(Boolean))].join(", "),
          method: p.method,
          reference: p.reference ?? "",
          amount: p.amount,
        },
      })),
    };
  },
};

/** Who rides a bus, stop by stop, with a parent's phone for the bus supervisor. */
export const busRidersDataset: Dataset<Workspace> = {
  id: "bus-riders",
  permissions: ["school.manage", "transport.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const routeId = params.get("route");
    const routes = await db.busRoute.findMany({
      where: { orgId: ws.org.id, campusId: { in: s.campusIds }, ...(routeId ? { id: routeId } : {}) },
      include: { stops: { orderBy: { sort: "asc" }, include: { students: { where: { status: "active" }, include: { grade: true, section: true, guardians: { where: { primary: true }, include: { guardian: true }, take: 1 } }, orderBy: { name: "asc" } } } } },
    });
    routes.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    const one = routes.length === 1 ? routes[0] : null;
    return {
      title: one ? `${one.code} · ${pick(locale, one.name, one.nameAr)}` : t("transport.title"),
      subtitle: one ? [one.driverName, one.driverPhone, one.attendantName].filter(Boolean).join(" · ") : undefined,
      columns: [
        ...(one ? [] : [{ key: "bus", label: "transport.code" as const, type: "text" as const, width: 10 }]),
        { key: "stop", label: "transport.colStop", type: "text", width: 22 },
        { key: "pickup", label: "transport.colPickup", type: "text", width: 9 },
        { key: "student", label: "transport.colStudent", type: "text", width: 28 },
        { key: "class", label: "transport.colClass", type: "text", width: 8 },
        { key: "guardian", label: "transport.colGuardian", type: "text", width: 24 },
        { key: "phone", label: "transport.colPhone", type: "text", width: 16 },
      ],
      rows: routes.flatMap((r) =>
        r.stops.flatMap((st) =>
          st.students.map((x) => ({
            id: x.id,
            href: `students/${x.id}`,
            cells: {
              bus: r.code,
              stop: pick(locale, st.name, st.nameAr),
              pickup: st.pickup ?? "",
              student: pick(locale, x.name, x.nameAr),
              class: x.section ? sectionName(locale, x.grade, x.section.name) : pick(locale, x.grade.name, x.grade.nameAr),
              guardian: x.guardians[0] ? pick(locale, x.guardians[0].guardian.name, x.guardians[0].guardian.nameAr) : "",
              phone: x.guardians[0]?.guardian.phone ?? "",
            },
          })),
        ),
      ),
    };
  },
};

/** The library catalogue with copies on the shelf. */
export const booksDataset: Dataset<Workspace> = {
  id: "books",
  permissions: ["library.manage", "school.manage", "school.teach"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const q = params.get("q")?.trim();
    const books = await db.book.findMany({
      where: { orgId: ws.org.id, OR: [{ campusId: { in: s.campusIds } }, { campusId: null }], ...(params.get("language") ? { language: params.get("language")! } : {}), ...(q ? { AND: [{ OR: [{ title: { contains: q } }, { author: { contains: q } }, { isbn: { contains: q } }, { category: { contains: q } }] }] } : {}) },
      include: { _count: { select: { loans: { where: { returnedOn: null } } } } },
      orderBy: { title: "asc" },
      take: 3000,
    });
    const campus = new Map(ws.org.campuses.map((c) => [c.id, pick(locale, c.name, c.nameAr)]));
    const langs = { en: "library.language_en", ar: "library.language_ar", fr: "library.language_fr", other: "library.language_other" } as const;
    return {
      title: t("library.catalogue"),
      columns: [
        { key: "title", label: "library.colTitle", type: "text", width: 36 },
        { key: "author", label: "library.colAuthor", type: "text", width: 24 },
        { key: "category", label: "library.colCategory", type: "text", width: 16, hideOnMobile: true },
        { key: "language", label: "library.colLanguage", type: "enum", options: langs, width: 10, hideOnMobile: true },
        ...(s.campusIds.length > 1 ? [{ key: "campus", label: "school.campus" as const, type: "text" as const, width: 16, hideOnMobile: true }] : []),
        { key: "shelf", label: "library.colShelf", type: "text", width: 8, hideOnMobile: true },
        { key: "copies", label: "library.colCopies", type: "number", width: 8, total: true },
        { key: "available", label: "library.colAvailable", type: "number", width: 10, total: true },
      ],
      rows: books.map((b) => ({
        id: b.id,
        cells: { title: b.title, author: b.author ?? "", category: b.category ?? "", language: b.language, campus: b.campusId ? (campus.get(b.campusId) ?? "") : "", shelf: b.shelf ?? "", copies: b.copies, available: b.copies - b._count.loans },
        meta: { cover: b.coverColor },
      })),
    };
  },
};

/** Books out on loan (or only the overdue ones). */
export const loansDataset: Dataset<Workspace> = {
  id: "loans",
  permissions: ["library.manage", "school.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const s = await getSchool(ws.org.slug);
    const now = new Date();
    const overdue = params.get("view") === "overdue";
    const q = params.get("q")?.trim();
    const loans = await db.loan.findMany({
      where: { orgId: ws.org.id, returnedOn: null, ...(overdue ? { dueOn: { lt: now } } : {}), student: { campusId: { in: s.campusIds } }, ...(q ? { OR: [{ book: { title: { contains: q } } }, { student: { name: { contains: q } } }, { student: { nameAr: { contains: q } } }] } : {}) },
      include: { book: true, student: { include: { grade: true, section: true } } },
      orderBy: { dueOn: "asc" },
      take: 3000,
    });
    return {
      title: overdue ? t("library.overdueTab") : t("library.loans"),
      columns: [
        { key: "title", label: "library.colTitle", type: "text", width: 34 },
        { key: "borrower", label: "library.colBorrower", type: "text", width: 26 },
        { key: "class", label: "school.section", type: "text", width: 8 },
        { key: "borrowed", label: "library.colBorrowed", type: "date", width: 12, hideOnMobile: true },
        { key: "due", label: "library.colDue", type: "date", width: 12 },
      ],
      rows: loans.map((l) => ({
        id: l.id,
        cells: {
          title: l.book.title,
          borrower: l.student ? pick(locale, l.student.name, l.student.nameAr) : "",
          class: l.student ? (l.student.section ? sectionName(locale, l.student.grade, l.student.section.name) : pick(locale, l.student.grade.name, l.student.grade.nameAr)) : "",
          borrowed: l.borrowedOn.toISOString(),
          due: l.dueOn.toISOString(),
        },
        meta: { overdue: l.dueOn < now, reminded: !!l.remindedAt, studentId: l.studentId },
      })),
    };
  },
};
