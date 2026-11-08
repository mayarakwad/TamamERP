import "server-only";
import { z } from "zod";
import { db } from "../../db";
import { getDataset } from "../../datasets";
import { rawCell } from "../../datasets/format-cell";
import { totalsFor, columnLabel } from "../../datasets/types";
import { claimsWhere } from "../../datasets/claims";
import { searchRecords } from "../../search/query";
import { canViewEntity, canViewStudent } from "../../access";
import { pick } from "../../i18n";
import { getBizDashboard } from "../../biz-dashboard";
import { getHomeDashboard } from "../../home/dashboard";
import { getSchoolDashboard } from "../../school/dashboard";
import { attendanceSummary, studentFees, termResults } from "../../school/profile";
import { sectionName } from "../../school/settings";
import { TABLES } from "./catalog";
import { defineTool, dohaDay, riyals, stripWorkspace, toolError, ymd, type FlowCtx } from "./define";

const MAX_CHARS = 24_000;

/** Keep a tool result within budget by dropping rows from the end. */
function fit<T extends { rows: unknown[] }>(data: T, note: (shown: number) => object): T {
  let out = data;
  while (JSON.stringify(out).length > MAX_CHARS && out.rows.length > 5) {
    const keep = Math.floor(out.rows.length * 0.7);
    out = { ...out, rows: out.rows.slice(0, keep), ...note(keep) };
  }
  return out;
}

const link = (ctx: FlowCtx, href?: string | null) => (href ? `/w/${ctx.slug}/${href.replace(/^\/+/, "")}` : undefined);

// ───────────────────────── search_records ─────────────────────────

export const searchTool = defineTool({
  name: "search_records",
  kind: "read",
  description:
    "Find records by name, number or any text: people, students, guardians, customers, suppliers, items, invoices and other documents, claims, employees, applications, books, bills and things owned. Returns titles with links. Use it to find a record before reading details with get_record.",
  input: z.object({ query: z.string().min(2).max(100).describe("What to look for, in English or Arabic") }),
  available: () => true,
  async run(ctx, { query }) {
    const s = await ctx.school();
    const hits = await searchRecords(ctx.ws, ctx.slug, query, { teachSectionIds: s?.teachSectionIds });
    return {
      content: { query, hits: hits.map((h) => ({ type: h.type, title: h.title, subtitle: h.subtitle, link: h.href })) },
      ui: { label: ctx.t("flow.toolSearch", { query, count: hits.length }), links: hits.slice(0, 5).map((h) => ({ title: h.title, href: h.href })) },
    };
  },
});

// ───────────────────────── query_table ─────────────────────────

function tablesFor(ctx: { ws: FlowCtx["ws"] }) {
  return TABLES.filter((t) => {
    if (!t.types.includes(ctx.ws.orgType)) return false;
    const ds = getDataset(t.id);
    if (!ds) return false;
    if (ds.permissions && !ds.permissions.some((p) => ctx.ws.can(p))) return false;
    if (t.perms && !t.perms.some((p) => ctx.ws.can(p))) return false;
    return true;
  });
}

export const queryTableTool = defineTool({
  name: "query_table",
  kind: "read",
  description: (ws) => {
    const list = tablesFor({ ws })
      .map((t) => `- ${t.id}: ${t.about}${t.params ? ` Filters: ${Object.entries(t.params).map(([k, v]) => `${k} (${v})`).join("; ")}.` : ""}`)
      .join("\n");
    return `Read one of the app's tables or reports, exactly as the person would see it on screen (their permissions apply). Money values are in Qatari riyals. Rows link to their record. Use sort_by with limit for "top N" questions; row_count and totals cover all matching rows, not just those returned.\n\nTables you can read:\n${list}`;
  },
  input: z.object({
    table: z.string().describe("Table id from the list"),
    filters: z.record(z.string(), z.string()).default({}).describe("Filters for this table, e.g. {\"month\": \"2026-10\"}"),
    sort_by: z.string().optional().describe("Column key to sort by"),
    descending: z.boolean().default(true),
    limit: z.number().int().min(1).max(200).default(40),
  }),
  available: () => true,
  async run(ctx, input) {
    const info = tablesFor(ctx).find((t) => t.id === input.table);
    const ds = info && getDataset(info.id);
    if (!info || !ds) return toolError(`Unknown or unavailable table "${input.table}". Use one of: ${tablesFor(ctx).map((t) => t.id).join(", ")}.`, ctx.t("flow.toolTableFailed"));
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(input.filters)) if (v !== "") params.set(k, v);
    const result = await ds.load(ctx.ws, params, { locale: ctx.locale, t: ctx.t });
    let rows = result.rows;
    const sortCol = input.sort_by ? result.columns.find((c) => c.key === input.sort_by) : undefined;
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const x = a.cells[sortCol.key];
        const y = b.cells[sortCol.key];
        const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
        return input.descending ? -cmp : cmp;
      });
    }
    const totals = totalsFor(result);
    const columns = result.columns.map((c) => ({ key: c.key, label: columnLabel(c, ctx.t), type: c.type === "money" ? "money (QAR)" : c.type }));
    const data = fit(
      {
        table: info.id,
        title: result.title,
        subtitle: result.subtitle ?? null,
        row_count: result.rows.length,
        columns,
        totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, result.columns.find((c) => c.key === k)?.type === "money" ? riyals(v) : v])),
        rows: rows.slice(0, input.limit).map((r) => ({
          ...Object.fromEntries(result.columns.map((c) => [c.key, rawCell(c, r.cells[c.key] ?? null, ctx.t)])),
          ...(r.emphasis ? { _row: r.emphasis } : {}),
          ...(r.href ? { link: link(ctx, r.href) } : {}),
        })),
        showing: Math.min(input.limit, rows.length),
      },
      (shown) => ({ showing: shown, note: "Some rows were left out to keep this short; narrow the filters to see more." }),
    );
    return { content: data, ui: { label: ctx.t("flow.toolTable", { title: result.title, count: result.rows.length }) } };
  },
});

// ───────────────────────── spending_summary ─────────────────────────

export const spendingTool = defineTool({
  name: "spending_summary",
  kind: "read",
  description:
    "Total spending from expense claims (and, for households, paid bills) in a date range, grouped by category, person, merchant or month. Counts approved and reimbursed claims; claims still waiting for approval are reported separately; declined claims are left out. People without approval rights only see their own claims. For a company's overall expenses use the pl (profit and loss) table instead.",
  input: z.object({
    from: ymd.describe("Start date YYYY-MM-DD"),
    to: ymd.describe("End date YYYY-MM-DD (inclusive)"),
    group_by: z.enum(["category", "person", "merchant", "month"]).default("category"),
    category: z.string().optional().describe("Only this category (name or key), e.g. groceries"),
  }),
  available: (ws) => ws.can("claims.submit") || ws.can("claims.viewAll"),
  async run(ctx, input) {
    const from = dohaDay(input.from);
    const to = new Date(dohaDay(input.to).getTime() + 86400_000);
    const base = claimsWhere(ctx.ws, new URLSearchParams());
    const claims = await db.claim.findMany({
      where: { ...base, spentOn: { gte: from, lt: to }, status: { in: ["approved", "reimbursed", "submitted"] } },
      include: { category: true, submittedBy: { select: { name: true, nameAr: true } } },
    });
    const bills =
      ctx.ws.orgType === "home" && ctx.ws.can("claims.viewAll")
        ? await db.billPayment.findMany({ where: { orgId: ctx.ws.org.id, status: "paid", paidOn: { gte: from, lt: to } }, include: { bill: { include: { category: true } } } })
        : [];
    const wanted = input.category?.toLowerCase();
    const matchCat = (c: { key: string; name: string; nameAr: string }) => !wanted || c.key.toLowerCase() === wanted || c.name.toLowerCase().includes(wanted) || c.nameAr.includes(input.category!);
    type Entry = { key: string; amount: number; when: Date; cat: { key: string; name: string; nameAr: string }; person: string; merchant: string; waiting: boolean; source: "claim" | "bill" };
    const entries: Entry[] = [
      ...claims.map((c) => ({ key: c.id, amount: c.amount, when: c.spentOn, cat: c.category, person: pick(ctx.locale, c.submittedBy.name, c.submittedBy.nameAr), merchant: c.merchant, waiting: c.status === "submitted", source: "claim" as const })),
      ...bills.map((b) => ({ key: b.id, amount: b.amount, when: b.paidOn!, cat: b.bill.category, person: "—", merchant: b.bill.provider || b.bill.name, waiting: false, source: "bill" as const })),
    ].filter((e) => matchCat(e.cat));
    const groupKey = (e: Entry) =>
      input.group_by === "category" ? pick(ctx.locale, e.cat.name, e.cat.nameAr) : input.group_by === "person" ? e.person : input.group_by === "merchant" ? e.merchant : ctx.fmt.monthName(e.when);
    const groups = new Map<string, { amount: number; count: number; waiting: number }>();
    for (const e of entries) {
      const g = groups.get(groupKey(e)) ?? { amount: 0, count: 0, waiting: 0 };
      if (e.waiting) g.waiting += e.amount;
      else {
        g.amount += e.amount;
        g.count++;
      }
      groups.set(groupKey(e), g);
    }
    const counted = entries.filter((e) => !e.waiting);
    const rows = [...groups.entries()].map(([name, g]) => ({ name, amount: riyals(g.amount), count: g.count, waiting_approval: riyals(g.waiting) })).sort((a, b) => b.amount - a.amount);
    const total = counted.reduce((s, e) => s + e.amount, 0);
    return {
      content: {
        from: input.from,
        to: input.to,
        currency: "QAR",
        total: riyals(total),
        waiting_approval_total: riyals(entries.filter((e) => e.waiting).reduce((s, e) => s + e.amount, 0)),
        claims_counted: counted.filter((e) => e.source === "claim").length,
        bills_counted: counted.filter((e) => e.source === "bill").length,
        groups: rows,
        scope: ctx.ws.can("claims.viewAll") ? "everyone's claims" : "only this person's own claims",
        link: link(ctx, `claims?month=${input.from.slice(0, 7)}`),
      },
      ui: { label: ctx.t("flow.toolSpending", { amount: ctx.fmt.money(total), count: counted.length }) },
    };
  },
});

// ───────────────────────── student_attendance ─────────────────────────

export const attendanceTool = defineTool({
  name: "student_attendance",
  kind: "read",
  description:
    "Student absences in a date range from the class roll calls: days absent, excused and late per student, with their class. Use min_days_away to find students who missed more than N days (days away = absent + excused). Office staff see their campus, teachers their own classes, parents their own children.",
  input: z.object({
    from: ymd,
    to: ymd,
    min_days_away: z.number().int().min(0).max(200).default(1).describe("Only students away at least this many days. 'More than three days' = 4."),
    class: z.string().optional().describe("Only this class, e.g. 5-B"),
  }),
  available: (ws) => ws.orgType === "school" && (ws.can("school.manage") || ws.can("school.teach") || ws.can("school.parent")),
  async run(ctx, input) {
    const s = await ctx.school();
    if (!s) return toolError("Not a school workspace.", ctx.t("flow.toolAttendanceFailed"));
    const studentWhere = ctx.ws.can("school.manage")
      ? { campusId: { in: s.campusIds } }
      : ctx.ws.can("school.teach") && s.teachSectionIds.length
        ? { sectionId: { in: s.teachSectionIds } }
        : { id: { in: s.childIds } };
    const from = dohaDay(input.from);
    const to = new Date(dohaDay(input.to).getTime() + 86400_000);
    const sections = await db.section.findMany({ where: { yearId: s.year.id, campusId: { in: s.campusIds } }, include: { grade: true } });
    const label = new Map(sections.map((x) => [x.id, sectionName(ctx.locale, x.grade, x.name)]));
    const wantClass = input.class?.replace(/\s+/g, "").toLowerCase();
    const classIds = wantClass ? sections.filter((x) => [sectionName("en", x.grade, x.name), sectionName("ar", x.grade, x.name)].some((l) => l.replace(/\s+/g, "").toLowerCase() === wantClass)).map((x) => x.id) : null;
    if (classIds && !classIds.length) return toolError(`No class called "${input.class}".`, ctx.t("flow.toolAttendanceFailed"));
    const marks = await db.studentAttendance.findMany({
      where: { orgId: ctx.ws.org.id, date: { gte: from, lt: to }, student: { ...studentWhere, status: "active" }, ...(classIds ? { sectionId: { in: classIds } } : {}) },
      include: { student: { select: { id: true, name: true, nameAr: true, number: true, sectionId: true } } },
    });
    const rolls = await db.attendanceRoll.findMany({ where: { orgId: ctx.ws.org.id, date: { gte: from, lt: to }, ...(classIds ? { sectionId: { in: classIds } } : { section: { campusId: { in: s.campusIds } } }) }, select: { date: true } });
    const per = new Map<string, { id: string; name: string; number: string; cls: string; absent: number; excused: number; late: number; dates: string[] }>();
    for (const m of marks) {
      const p = per.get(m.studentId) ?? { id: m.student.id, name: pick(ctx.locale, m.student.name, m.student.nameAr), number: m.student.number, cls: label.get(m.student.sectionId ?? "") ?? "", absent: 0, excused: 0, late: 0, dates: [] };
      if (m.status === "absent") p.absent++;
      else if (m.status === "excused") p.excused++;
      else if (m.status === "late") p.late++;
      if (m.status !== "late") p.dates.push(m.date.toISOString().slice(0, 10));
      per.set(m.studentId, p);
    }
    const students = [...per.values()]
      .map((p) => ({ ...p, days_away: p.absent + p.excused }))
      .filter((p) => p.days_away >= input.min_days_away)
      .sort((a, b) => b.days_away - a.days_away || a.name.localeCompare(b.name))
      .map((p) => ({ student: p.name, admission_no: p.number, class: p.cls, days_away: p.days_away, absent: p.absent, excused: p.excused, late: p.late, dates_away: p.dates.sort(), link: link(ctx, `students/${p.id}`) }));
    const data = fit(
      { from: input.from, to: input.to, school_days_with_a_roll: new Set(rolls.map((r) => r.date.toISOString().slice(0, 10))).size, min_days_away: input.min_days_away, count: students.length, rows: students },
      (shown) => ({ showing: shown }),
    );
    return { content: data, ui: { label: ctx.t("flow.toolAttendance", { count: students.length }) } };
  },
});

// ───────────────────────── get_record ─────────────────────────

const ID = "([A-Za-z0-9_-]+)";

export const recordTool = defineTool({
  name: "get_record",
  kind: "read",
  description:
    "Read one record in detail from its link (as returned by search_records or query_table), e.g. /w/<workspace>/students/<id>, sales/invoices/<id>, claims/<id>, hr/employees/<id>. Students include attendance and results this term, and fees when the person may see them. Documents include their lines.",
  input: z.object({ link: z.string().min(3).max(300) }),
  available: () => true,
  async run(ctx, { link: raw }) {
    const path = stripWorkspace(raw, ctx.slug);
    const failed = ctx.t("flow.toolRecordFailed");
    const deny = () => toolError("That record doesn't exist or this person isn't allowed to see it.", failed);
    const org = ctx.ws.org.id;
    let m: RegExpMatchArray | null;

    if ((m = path.match(new RegExp(`^claims/${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "claim", m[1]))) return deny();
      const c = await db.claim.findFirst({ where: { id: m[1], orgId: org }, include: { category: true, submittedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } });
      if (!c) return deny();
      return ok(ctx, c.number, { type: "claim", number: c.number, merchant: c.merchant, amount: riyals(c.amount), category: pick(ctx.locale, c.category.name, c.category.nameAr), spent_on: c.spentOn.toISOString().slice(0, 10), paid_with: c.paidWith, status: c.status, submitted_by: c.submittedBy.name, decided_by: c.decidedBy?.name ?? null, decision_note: c.decisionNote, note: c.note, link: link(ctx, path) });
    }

    if ((m = path.match(new RegExp(`^(?:sales/(?:invoices|quotations)|purchases/(?:orders|bills)|fees/invoices)/${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "document", m[1]))) return deny();
      const d = await db.document.findFirst({ where: { id: m[1], orgId: org }, include: { party: true, lines: { orderBy: { sort: "asc" } }, student: { select: { name: true, nameAr: true } } } });
      if (!d) return deny();
      return ok(ctx, d.number, {
        type: d.kind === "quote" ? "quotation" : d.kind === "po" ? "purchase order" : d.kind === "bill" ? "supplier bill" : d.kind === "fee" ? "fee invoice" : "invoice",
        number: d.number,
        status: d.status,
        party: pick(ctx.locale, d.party.name, d.party.nameAr),
        student: d.student ? pick(ctx.locale, d.student.name, d.student.nameAr) : undefined,
        date: d.date.toISOString().slice(0, 10),
        due: d.dueDate?.toISOString().slice(0, 10) ?? null,
        reference: d.reference,
        lines: d.lines.map((l) => ({ description: l.description, qty: l.qty / 100, unit_price: riyals(l.unitPrice), discount_pct: l.discountPct / 100, amount: riyals(l.amount) })),
        subtotal: riyals(d.subtotal),
        discount: riyals(d.discount),
        total: riyals(d.total),
        paid: riyals(d.paid),
        balance: riyals(d.total - d.paid),
        notes: d.notes,
        link: link(ctx, path),
      });
    }

    if ((m = path.match(new RegExp(`^(?:sales/customers|purchases/suppliers)/${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "party", m[1])) || !ctx.ws.can("finance.view")) return deny();
      const p = await db.party.findFirst({ where: { id: m[1], orgId: org } });
      if (!p) return deny();
      const open = await db.document.findMany({ where: { orgId: org, partyId: p.id, status: { in: ["issued", "posted", "partial"] } }, select: { number: true, kind: true, total: true, paid: true, dueDate: true } });
      const now = ctx.now.getTime();
      return ok(ctx, p.name, {
        type: p.isCustomer ? (p.isSupplier ? "customer and supplier" : "customer") : "supplier",
        name: pick(ctx.locale, p.name, p.nameAr),
        contact: p.contactName,
        phone: p.phone,
        email: p.email,
        cr_number: p.crNumber,
        payment_terms_days: p.paymentTerms,
        credit_limit: p.creditLimit ? riyals(p.creditLimit) : null,
        open_documents: open.map((d) => ({ number: d.number, kind: d.kind, balance: riyals(d.total - d.paid), due: d.dueDate?.toISOString().slice(0, 10) ?? null, overdue: !!d.dueDate && d.dueDate.getTime() < now })),
        balance: riyals(open.reduce((s, d) => s + d.total - d.paid, 0)),
        link: link(ctx, path),
      });
    }

    if ((m = path.match(new RegExp(`^inventory/items/${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "item", m[1]))) return deny();
      const i = await db.item.findFirst({ where: { id: m[1], orgId: org } });
      if (!i) return deny();
      const stock = await db.stockLevel.findMany({ where: { itemId: i.id }, include: { campus: true } });
      const prices = ctx.ws.can("finance.view");
      return ok(ctx, i.sku, {
        type: "item",
        sku: i.sku,
        name: pick(ctx.locale, i.name, i.nameAr),
        kind: i.kind,
        unit: i.unit,
        ...(prices ? { sale_price: riyals(i.salePrice), purchase_price: riyals(i.purchasePrice), average_cost: riyals(i.avgCost) } : {}),
        reorder_level: i.reorderLevel != null ? i.reorderLevel / 100 : null,
        stock: stock.map((s) => ({ warehouse: pick(ctx.locale, s.campus.name, s.campus.nameAr), qty: s.qty / 100 })),
        link: link(ctx, path),
      });
    }

    if ((m = path.match(new RegExp(`^hr/employees/${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "employee", m[1]))) return deny();
      const e = await db.employee.findFirst({ where: { id: m[1], orgId: org } });
      if (!e) return deny();
      const hr = ctx.ws.can("hr.view");
      return ok(ctx, e.name, {
        type: "employee",
        number: e.number,
        name: pick(ctx.locale, e.name, e.nameAr),
        job: e.jobTitle,
        department: e.department,
        joined: e.joinedOn.toISOString().slice(0, 10),
        status: e.status,
        ...(hr ? { qid_expiry: e.qidExpiry?.toISOString().slice(0, 10) ?? null, passport_expiry: e.passportExpiry?.toISOString().slice(0, 10) ?? null, basic_salary: riyals(e.basicSalary), allowances: riyals(e.housingAllowance + e.transportAllowance + e.otherAllowance) } : {}),
        link: link(ctx, path),
      });
    }

    if ((m = path.match(new RegExp(`^students/${ID}`)))) {
      const s = await ctx.school();
      if (!s || !(await canViewStudent(ctx.ws, m[1]))) return deny();
      const st = await db.student.findFirst({
        where: { id: m[1], orgId: org },
        include: { grade: true, section: true, campus: true, busStop: { include: { route: true } }, guardians: { include: { guardian: true } } },
      });
      if (!st) return deny();
      const office = ctx.ws.can("school.manage") || ctx.ws.can("finance.view");
      const parent = s.childIds.includes(st.id);
      const [att, results, fees] = await Promise.all([
        attendanceSummary(st.id, st.sectionId, s.term.startDate, new Date(Math.min(ctx.now.getTime(), s.term.endDate.getTime() + 86400_000))),
        st.sectionId ? termResults(st.id, st.sectionId, s.term.id, s.settings) : Promise.resolve([]),
        office || parent ? studentFees(org, st.id) : Promise.resolve(null),
      ]);
      return ok(ctx, st.name, {
        type: "student",
        name: pick(ctx.locale, st.name, st.nameAr),
        admission_no: st.number,
        gender: st.gender === "f" ? "girl" : "boy",
        class: st.section ? sectionName(ctx.locale, st.grade, st.section.name) : pick(ctx.locale, st.grade.name, st.grade.nameAr),
        class_id: st.sectionId,
        campus: pick(ctx.locale, st.campus.name, st.campus.nameAr),
        status: st.status,
        guardians: st.guardians.map((g) => ({ name: pick(ctx.locale, g.guardian.name, g.guardian.nameAr), relation: g.relation, ...(office ? { phone: g.guardian.phone } : {}) })),
        bus: st.busStop ? { route: st.busStop.route.code, stop: st.busStop.name, pickup: st.busStop.pickup, dropoff: st.busStop.dropoff } : null,
        medical_note: st.medical ? (office || parent ? st.medical : "has a medical note") : null,
        term: pick(ctx.locale, s.term.name, s.term.nameAr),
        attendance_this_term: { school_days: att.days, absent: att.absent, excused: att.excused, late: att.late, rate_percent: att.rate, recent: att.exceptions.slice(0, 10) },
        results_this_term: results.map((r) => ({ subject: pick(ctx.locale, r.name, r.nameAr), percent: r.percent, letter: r.letter, class_average: r.classAverage })),
        ...(fees ? { fees: { balance: riyals(fees.balance), overdue: riyals(fees.overdue), invoices: fees.invoices.slice(0, 8).map((i) => ({ number: i.number, installment: i.installment, total: riyals(i.total), paid: riyals(i.paid), status: i.status, due: i.due?.slice(0, 10) ?? null })) } } : {}),
        link: link(ctx, path),
      });
    }

    if ((m = path.match(new RegExp(`^guardians/${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "guardian", m[1]))) return deny();
      const g = await db.guardian.findFirst({ where: { id: m[1], orgId: org }, include: { children: { include: { student: { include: { grade: true, section: true } } } } } });
      if (!g) return deny();
      return ok(ctx, g.name, {
        type: "guardian",
        name: pick(ctx.locale, g.name, g.nameAr),
        phone: g.phone,
        email: g.email,
        has_parent_app: !!g.userId,
        children: g.children.map((c) => ({ name: pick(ctx.locale, c.student.name, c.student.nameAr), class: c.student.section ? sectionName(ctx.locale, c.student.grade, c.student.section.name) : null, relation: c.relation, link: link(ctx, `students/${c.studentId}`) })),
        link: link(ctx, path),
      });
    }

    if ((m = path.match(new RegExp(`^admissions\\?open=${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "application", m[1]))) return deny();
      const a = await db.application.findFirst({ where: { id: m[1], orgId: org }, include: { grade: true, campus: true } });
      if (!a) return deny();
      return ok(ctx, a.number, { type: "application", number: a.number, child: a.childName, grade: pick(ctx.locale, a.grade.name, a.grade.nameAr), campus: pick(ctx.locale, a.campus.name, a.campus.nameAr), stage: a.stage, guardian: a.guardianName, phone: a.guardianPhone, applied: a.createdAt.toISOString().slice(0, 10), link: link(ctx, path) });
    }

    if ((m = path.match(new RegExp(`^things\\?item=${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "possession", m[1]))) return deny();
      const p = await db.possession.findFirst({ where: { id: m[1], orgId: org } });
      if (!p) return deny();
      return ok(ctx, p.name, { type: "thing we own", name: pick(ctx.locale, p.name, p.nameAr), category: p.category, room: p.room, brand: p.brand, model: p.model, purchased: p.purchasedOn?.toISOString().slice(0, 10) ?? null, price: p.price != null ? riyals(p.price) : null, store: p.store, warranty_until: p.warrantyUntil?.toISOString().slice(0, 10) ?? null, link: link(ctx, path) });
    }

    if ((m = path.match(new RegExp(`^bills\\?bill=${ID}`)))) {
      if (!(await canViewEntity(ctx.ws, "bill", m[1]))) return deny();
      const b = await db.recurringBill.findFirst({ where: { id: m[1], orgId: org }, include: { payments: { orderBy: { dueOn: "desc" }, take: 6 }, category: true } });
      if (!b) return deny();
      return ok(ctx, b.name, { type: "recurring bill", name: pick(ctx.locale, b.name, b.nameAr), provider: b.provider, amount: riyals(b.amount), frequency: b.frequency, next_due: b.nextDue.toISOString().slice(0, 10), autopay: b.autopay, category: pick(ctx.locale, b.category.name, b.category.nameAr), recent: b.payments.map((p) => ({ due: p.dueOn.toISOString().slice(0, 10), status: p.status, amount: riyals(p.amount), paid_on: p.paidOn?.toISOString().slice(0, 10) ?? null })), link: link(ctx, path) });
    }

    return toolError("This kind of link isn't supported. Try search_records or query_table instead.", failed);
  },
});

function ok(ctx: FlowCtx, title: string, data: Record<string, unknown>) {
  return { content: data, ui: { label: ctx.t("flow.toolRecord", { title }), links: typeof data.link === "string" ? [{ title, href: data.link }] : undefined } };
}

// ───────────────────────── todays_briefing ─────────────────────────

const MONEY_KEYS = new Set(["amount", "total", "net", "revenue", "revenueLast", "netProfit", "cash", "receivable", "overdue", "payableSoon", "inflow", "outflow", "spent", "budget", "paid", "balance", "collected", "billed", "due"]);

/** Dashboard data for the model: amounts in riyals, ids and colours dropped. */
function clean(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => clean(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/^(id|color|avatarColor|icon|plainName|sectionId|subjectId|employeeId)$/.test(k)) continue;
      out[k] = clean(v, k);
    }
    return out;
  }
  if (typeof value === "number" && MONEY_KEYS.has(key)) return riyals(value);
  return value;
}

export const briefingTool = defineTool({
  name: "todays_briefing",
  kind: "read",
  description:
    "Today's morning briefing and key numbers from the person's dashboard: what needs attention (approvals, overdue money, rolls not taken, full buses, expiring documents, bills due...), what's waiting for them, and the main figures. Money values are in Qatari riyals. Use it for 'what needs my attention?' or 'how are we doing?'.",
  input: z.object({}),
  available: () => true,
  async run(ctx) {
    let data: unknown;
    if (ctx.ws.orgType === "business") data = await getBizDashboard(ctx.ws, ctx.now);
    else if (ctx.ws.orgType === "school") {
      const s = await ctx.school();
      data = s ? await getSchoolDashboard(s, ctx.now) : null;
    } else data = await getHomeDashboard(ctx.ws, ctx.now);
    const content = clean(data) as Record<string, unknown>;
    // Long chart series aren't needed to talk about today.
    for (const k of ["trend", "sales", "cashMonths", "activity", "byGrade"]) if (k in content) delete content[k];
    if (content.finance && typeof content.finance === "object") for (const k of ["sales", "cashMonths"]) delete (content.finance as Record<string, unknown>)[k];
    return { content: { currency: "QAR", ...content }, ui: { label: ctx.t("flow.toolBriefing") } };
  },
});

export const READ_TOOLS = [searchTool, queryTableTool, spendingTool, attendanceTool, recordTool, briefingTool];
