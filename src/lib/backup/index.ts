import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { db } from "../db";
import { STORAGE_DIR } from "../storage";
import { reindexOrg } from "../search/index-core";

// Workspace backups (.tamam files): a zip with manifest.json, data.json and the
// uploaded files. With a password, data + files are encrypted with AES-256-GCM
// (key from scrypt) and only the manifest stays readable.
//
// The same export/import pipeline powers restore and "duplicate workspace".
// Every id is remapped on import, so a backup can be restored next to the
// original, on another server, or into a sandbox copy.

export const BACKUP_FORMAT = "tamam-backup";
export const BACKUP_VERSION = 1;

type Tx = Prisma.TransactionClient;

interface TableSpec {
  key: string;
  model: string;
  fields: Record<string, string>;
  /** field → table key whose ids it references */
  fk?: Record<string, string>;
  /** rows reference any record through entityType + entityId */
  poly?: boolean;
  dates: string[];
  /** included in a "fresh start" (structure-only) copy */
  structure: boolean;
  /** references whose target table depends on another field, e.g. sourceId by sourceType */
  cond?: { field: string; by: string; map: Record<string, string> }[];
  /** fields that must resolve, or the row is skipped (defaults to the common ones) */
  required?: string[];
}

// Order matters: referenced tables come first.
const TABLES: TableSpec[] = [
  { key: "campus", model: "campus", fields: Prisma.CampusScalarFieldEnum, dates: ["createdAt"], structure: true },
  { key: "membership", model: "membership", fields: Prisma.MembershipScalarFieldEnum, fk: { userId: "user", campusId: "campus" }, dates: ["createdAt"], structure: true },
  { key: "account", model: "account", fields: Prisma.AccountScalarFieldEnum, dates: ["createdAt"], structure: true },
  { key: "category", model: "expenseCategory", fields: Prisma.ExpenseCategoryScalarFieldEnum, fk: { accountId: "account" }, dates: [], structure: true },
  { key: "budget", model: "budget", fields: Prisma.BudgetScalarFieldEnum, fk: { categoryId: "category" }, dates: [], structure: true },
  { key: "claim", model: "claim", fields: Prisma.ClaimScalarFieldEnum, fk: { submittedById: "user", decidedById: "user", categoryId: "category" }, dates: ["spentOn", "decidedAt", "reimbursedAt", "createdAt", "updatedAt", "deletedAt"], structure: false },
  { key: "bill", model: "recurringBill", fields: Prisma.RecurringBillScalarFieldEnum, fk: { categoryId: "category" }, dates: ["nextDue", "createdAt"], structure: true },
  { key: "billPayment", model: "billPayment", fields: Prisma.BillPaymentScalarFieldEnum, fk: { billId: "bill", paidById: "user" }, dates: ["dueOn", "paidOn", "remindedAt"], structure: false },
  { key: "possession", model: "possession", fields: Prisma.PossessionScalarFieldEnum, dates: ["purchasedOn", "warrantyUntil", "warrantyRemindedAt", "createdAt"], structure: true },
  { key: "party", model: "party", fields: Prisma.PartyScalarFieldEnum, dates: ["createdAt"], structure: true },
  { key: "item", model: "item", fields: Prisma.ItemScalarFieldEnum, dates: ["lowStockAlertedAt", "createdAt"], structure: true },
  { key: "employee", model: "employee", fields: Prisma.EmployeeScalarFieldEnum, fk: { userId: "user", campusId: "campus" }, dates: ["qidExpiry", "passportExpiry", "joinedOn", "leftOn", "qidRemindedAt", "passportRemindedAt", "createdAt"], structure: true },
  // Stage 3: the school (structure first, then people, then daily records).
  { key: "academicYear", model: "academicYear", fields: Prisma.AcademicYearScalarFieldEnum, dates: ["startDate", "endDate", "createdAt"], structure: true },
  { key: "term", model: "term", fields: Prisma.TermScalarFieldEnum, fk: { yearId: "academicYear" }, dates: ["startDate", "endDate"], structure: true, required: ["yearId"] },
  { key: "grade", model: "grade", fields: Prisma.GradeScalarFieldEnum, dates: [], structure: true },
  { key: "subject", model: "subject", fields: Prisma.SubjectScalarFieldEnum, dates: [], structure: true },
  { key: "busRoute", model: "busRoute", fields: Prisma.BusRouteScalarFieldEnum, fk: { campusId: "campus" }, dates: [], structure: true, required: ["campusId"] },
  { key: "busStop", model: "busStop", fields: Prisma.BusStopScalarFieldEnum, fk: { routeId: "busRoute" }, dates: [], structure: true, required: ["routeId"] },
  { key: "section", model: "section", fields: Prisma.SectionScalarFieldEnum, fk: { yearId: "academicYear", campusId: "campus", gradeId: "grade", homeroomId: "employee" }, dates: [], structure: true, required: ["yearId", "campusId", "gradeId"] },
  { key: "teachingAssignment", model: "teachingAssignment", fields: Prisma.TeachingAssignmentScalarFieldEnum, fk: { sectionId: "section", subjectId: "subject", teacherId: "employee" }, dates: [], structure: true, required: ["sectionId", "subjectId"] },
  { key: "timetableSlot", model: "timetableSlot", fields: Prisma.TimetableSlotScalarFieldEnum, fk: { sectionId: "section", subjectId: "subject", teacherId: "employee" }, dates: [], structure: true, required: ["sectionId", "subjectId"] },
  { key: "feeRate", model: "feeRate", fields: Prisma.FeeRateScalarFieldEnum, fk: { yearId: "academicYear", gradeId: "grade" }, dates: [], structure: true, required: ["yearId", "gradeId"] },
  { key: "book", model: "book", fields: Prisma.BookScalarFieldEnum, fk: { campusId: "campus" }, dates: ["createdAt"], structure: true },
  { key: "guardian", model: "guardian", fields: Prisma.GuardianScalarFieldEnum, fk: { userId: "user", partyId: "party" }, dates: ["createdAt"], structure: false, required: [] },
  { key: "student", model: "student", fields: Prisma.StudentScalarFieldEnum, fk: { campusId: "campus", gradeId: "grade", sectionId: "section", busStopId: "busStop" }, dates: ["dob", "qidExpiry", "joinedOn", "leftOn", "createdAt"], structure: false, required: ["campusId", "gradeId"] },
  { key: "studentGuardian", model: "studentGuardian", fields: Prisma.StudentGuardianScalarFieldEnum, fk: { studentId: "student", guardianId: "guardian" }, dates: [], structure: false, required: ["studentId", "guardianId"] },
  { key: "application", model: "application", fields: Prisma.ApplicationScalarFieldEnum, fk: { yearId: "academicYear", campusId: "campus", gradeId: "grade", guardianId: "guardian", studentId: "student", createdById: "user" }, dates: ["dob", "stageAt", "assessmentAt", "createdAt"], structure: false, required: ["yearId", "campusId", "gradeId"] },
  { key: "attendanceRoll", model: "attendanceRoll", fields: Prisma.AttendanceRollScalarFieldEnum, fk: { sectionId: "section" }, dates: ["date", "takenAt"], structure: false, required: ["sectionId"] },
  { key: "studentAttendance", model: "studentAttendance", fields: Prisma.StudentAttendanceScalarFieldEnum, fk: { studentId: "student", sectionId: "section" }, dates: ["date", "notifiedAt"], structure: false, required: ["studentId", "sectionId"] },
  { key: "assessment", model: "assessment", fields: Prisma.AssessmentScalarFieldEnum, fk: { termId: "term", sectionId: "section", subjectId: "subject", createdById: "user" }, dates: ["date", "createdAt"], structure: false, required: ["termId", "sectionId", "subjectId"] },
  { key: "mark", model: "mark", fields: Prisma.MarkScalarFieldEnum, fk: { assessmentId: "assessment", studentId: "student" }, dates: ["updatedAt"], structure: false, required: ["assessmentId", "studentId"] },
  { key: "reportCard", model: "reportCard", fields: Prisma.ReportCardScalarFieldEnum, fk: { studentId: "student", termId: "term", sectionId: "section", publishedById: "user" }, dates: ["publishedAt", "updatedAt"], structure: false, required: ["studentId", "termId"] },
  { key: "loan", model: "loan", fields: Prisma.LoanScalarFieldEnum, fk: { bookId: "book", studentId: "student", employeeId: "employee", issuedById: "user" }, dates: ["borrowedOn", "dueOn", "returnedOn", "remindedAt"], structure: false, required: ["bookId", "issuedById"] },
  { key: "announcement", model: "announcement", fields: Prisma.AnnouncementScalarFieldEnum, fk: { campusId: "campus", gradeId: "grade", authorId: "user" }, dates: ["publishedAt"], structure: false, required: ["authorId"] },
  { key: "stockLevel", model: "stockLevel", fields: Prisma.StockLevelScalarFieldEnum, fk: { itemId: "item", campusId: "campus" }, dates: [], structure: false, required: ["itemId", "campusId"] },
  { key: "document", model: "document", fields: Prisma.DocumentScalarFieldEnum, fk: { partyId: "party", campusId: "campus", sourceId: "document", createdById: "user", studentId: "student" }, dates: ["date", "dueDate", "issuedAt", "createdAt", "updatedAt"], structure: false, required: ["partyId"] },
  { key: "documentLine", model: "documentLine", fields: Prisma.DocumentLineScalarFieldEnum, fk: { documentId: "document", itemId: "item", accountId: "account" }, dates: [], structure: false, required: ["documentId"] },
  { key: "payment", model: "payment", fields: Prisma.PaymentScalarFieldEnum, fk: { partyId: "party", accountId: "account", createdById: "user" }, dates: ["date", "voidedAt", "createdAt"], structure: false, required: ["partyId", "accountId"] },
  { key: "allocation", model: "paymentAllocation", fields: Prisma.PaymentAllocationScalarFieldEnum, fk: { paymentId: "payment", documentId: "document" }, dates: [], structure: false, required: ["paymentId", "documentId"] },
  { key: "stockMove", model: "stockMove", fields: Prisma.StockMoveScalarFieldEnum, fk: { itemId: "item", campusId: "campus", createdById: "user" }, cond: [{ field: "sourceId", by: "sourceType", map: { document: "document", void: "document" } }], dates: ["date", "createdAt"], structure: false, required: ["itemId", "campusId"] },
  { key: "attendance", model: "attendanceDay", fields: Prisma.AttendanceDayScalarFieldEnum, fk: { employeeId: "employee" }, dates: ["date"], structure: false, required: ["employeeId"] },
  { key: "leave", model: "leaveRequest", fields: Prisma.LeaveRequestScalarFieldEnum, fk: { employeeId: "employee", requestedById: "user", decidedById: "user" }, dates: ["startDate", "endDate", "decidedAt", "createdAt"], structure: false, required: ["employeeId"] },
  { key: "payrollRun", model: "payrollRun", fields: Prisma.PayrollRunScalarFieldEnum, fk: { createdById: "user", approvedById: "user" }, dates: ["payDate", "approvedAt", "paidAt", "createdAt"], structure: false },
  { key: "payslip", model: "payslip", fields: Prisma.PayslipScalarFieldEnum, fk: { runId: "payrollRun", employeeId: "employee" }, dates: [], structure: false, required: ["runId", "employeeId"] },
  {
    key: "journalEntry",
    model: "journalEntry",
    fields: Prisma.JournalEntryScalarFieldEnum,
    fk: { reversesId: "journalEntry", createdById: "user" },
    cond: [{ field: "sourceId", by: "sourceType", map: { invoice: "document", bill: "document", fee: "document", receipt: "document", payment: "payment", claim: "claim", payroll: "payrollRun" } }],
    dates: ["date", "reversedAt", "createdAt"],
    structure: false,
  },
  { key: "journalLine", model: "journalLine", fields: Prisma.JournalLineScalarFieldEnum, fk: { entryId: "journalEntry", accountId: "account", partyId: "party" }, dates: ["date"], structure: false, required: ["entryId", "accountId"] },
  { key: "comment", model: "comment", fields: Prisma.CommentScalarFieldEnum, fk: { authorId: "user" }, poly: true, dates: ["createdAt"], structure: false },
  { key: "attachment", model: "attachment", fields: Prisma.AttachmentScalarFieldEnum, fk: { uploadedById: "user" }, poly: true, dates: ["createdAt"], structure: true },
  { key: "auditLog", model: "auditLog", fields: Prisma.AuditLogScalarFieldEnum, fk: { userId: "user" }, poly: true, dates: ["createdAt"], structure: false },
  { key: "namingSeries", model: "namingSeries", fields: Prisma.NamingSeriesScalarFieldEnum, dates: [], structure: false },
];

/** entityType values → the table their entityId points into */
const POLY: Record<string, string> = {
  claim: "claim",
  possession: "possession",
  bill: "bill",
  category: "category",
  organization: "org",
  user: "user",
  party: "party",
  item: "item",
  document: "document",
  payment: "payment",
  employee: "employee",
  leave: "leave",
  payroll: "payrollRun",
  journal: "journalEntry",
  student: "student",
  guardian: "guardian",
  application: "application",
  section: "section",
  route: "busRoute",
  book: "book",
  announcement: "announcement",
  academicYear: "academicYear",
};

const DEFAULT_REQUIRED = ["userId", "submittedById", "authorId", "uploadedById", "billId", "categoryId"];

const USER_FIELDS = ["id", "email", "name", "nameAr", "phone", "avatarColor", "passwordHash", "preferences"] as const;

export interface BackupData {
  organization: Record<string, unknown>;
  users: Record<string, unknown>[];
  tables: Record<string, Record<string, unknown>[]>;
}

export interface Manifest {
  format: string;
  version: number;
  createdAt: string;
  app: string;
  org: { id: string; name: string; nameAr: string | null; type: string };
  counts: Record<string, number>;
  files: number;
  encrypted: boolean;
  crypto?: { kdf: "scrypt"; N: number; r: number; p: number; salt: string; iv: string; tag: string };
}

function delegate(tx: Tx | PrismaClient, model: string) {
  return (tx as unknown as Record<string, { findMany: (a: object) => Promise<Record<string, unknown>[]>; createMany: (a: object) => Promise<unknown>; deleteMany: (a: object) => Promise<unknown> }>)[model];
}

/** Collect everything that belongs to one workspace. */
export async function exportWorkspace(orgId: string, includeFiles: boolean) {
  const organization = (await db.organization.findUniqueOrThrow({ where: { id: orgId } })) as unknown as Record<string, unknown>;
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) tables[t.key] = await delegate(db, t.model).findMany({ where: { orgId } });

  const userIds = new Set<string>();
  for (const t of TABLES) for (const [field, target] of Object.entries(t.fk ?? {})) if (target === "user") for (const r of tables[t.key]) if (r[field]) userIds.add(String(r[field]));
  const users = (await db.user.findMany({ where: { id: { in: [...userIds] } } })).map((u) => Object.fromEntries(USER_FIELDS.map((k) => [k, (u as Record<string, unknown>)[k]])));

  const files: Record<string, Uint8Array> = {};
  if (includeFiles) {
    const paths = [organization.logoPath, ...tables.attachment.flatMap((a) => [a.path, a.thumbPath])].filter(Boolean) as string[];
    for (const p of paths) {
      const buf = await readFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, p)).catch(() => null);
      if (buf) files[p.split(path.sep).join("/")] = new Uint8Array(buf);
    }
  } else {
    tables.attachment = [];
  }
  return { data: { organization, users, tables } satisfies BackupData, files };
}

function deriveKey(password: string, salt: Buffer) {
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/** Build the .tamam file. */
export async function createBackup(orgId: string, opts: { password?: string; includeFiles: boolean }): Promise<{ buffer: Buffer; manifest: Manifest }> {
  const { data, files } = await exportWorkspace(orgId, opts.includeFiles);
  const org = data.organization;
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    app: process.env.npm_package_version ?? "0.1.0",
    org: { id: String(org.id), name: String(org.name), nameAr: (org.nameAr as string) ?? null, type: String(org.type) },
    counts: Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length])),
    files: Object.keys(files).length,
    encrypted: !!opts.password,
  };
  const payload: Zippable = { "data.json": strToU8(JSON.stringify(data)) };
  for (const [p, bytes] of Object.entries(files)) payload[`files/${p}`] = [bytes, { level: 0 }];

  if (!opts.password) {
    return { buffer: Buffer.from(zipSync({ "manifest.json": strToU8(JSON.stringify(manifest, null, 2)), ...payload }, { level: 6 })), manifest };
  }
  const inner = Buffer.from(zipSync(payload, { level: 6 }));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(opts.password, salt), iv);
  const enc = Buffer.concat([cipher.update(inner), cipher.final()]);
  manifest.crypto = { kdf: "scrypt", N: 32768, r: 8, p: 1, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
  return { buffer: Buffer.from(zipSync({ "manifest.json": strToU8(JSON.stringify(manifest, null, 2)), "payload.enc": [new Uint8Array(enc), { level: 0 }] })), manifest };
}

export class BackupError extends Error {
  constructor(public code: "badFile" | "wrongPassword" | "needsPassword") {
    super(code);
  }
}

/** Open a .tamam file (decrypting if needed). */
export function readBackup(buffer: Buffer, password?: string): { manifest: Manifest; data: BackupData; files: Record<string, Uint8Array> } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new BackupError("badFile");
  }
  if (!entries["manifest.json"]) throw new BackupError("badFile");
  const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as Manifest;
  if (manifest.format !== BACKUP_FORMAT || manifest.version > BACKUP_VERSION) throw new BackupError("badFile");

  if (manifest.encrypted) {
    if (!password) throw new BackupError("needsPassword");
    try {
      const c = manifest.crypto!;
      const decipher = createDecipheriv("aes-256-gcm", deriveKey(password, Buffer.from(c.salt, "base64")), Buffer.from(c.iv, "base64"));
      decipher.setAuthTag(Buffer.from(c.tag, "base64"));
      const inner = Buffer.concat([decipher.update(entries["payload.enc"]), decipher.final()]);
      entries = unzipSync(new Uint8Array(inner));
    } catch {
      throw new BackupError("wrongPassword");
    }
  }
  if (!entries["data.json"]) throw new BackupError("badFile");
  const data = JSON.parse(strFromU8(entries["data.json"])) as BackupData;
  const files: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(entries)) if (name.startsWith("files/")) files[name.slice(6)] = bytes;
  return { manifest, data, files };
}

const newId = () => `c${randomBytes(12).toString("hex")}`;

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .slice(0, 40) || "workspace"
  );
}

export interface ImportOptions {
  mode: "new" | "replace";
  /** existing workspace to replace (mode "replace") */
  targetOrgId?: string;
  name?: string;
  sandbox?: boolean;
  structureOnly?: boolean;
  /** "all" keeps everyone's memberships; "me" makes the acting person the only member */
  members: "all" | "me";
  actingUserId: string;
}

/** Write backup data into a new or existing workspace, remapping every id. */
export async function importWorkspace(data: BackupData, files: Record<string, Uint8Array>, o: ImportOptions): Promise<{ orgId: string; slug: string; name: string }> {
  const ids: Record<string, Map<string, string>> = { org: new Map(), user: new Map() };
  const src = data.organization;
  const orgId = o.mode === "replace" ? o.targetOrgId! : newId();
  ids.org.set(String(src.id), orgId);

  const result = await db.$transaction(
    async (tx) => {
      // People: match by email on this server, create the ones that don't exist yet.
      for (const u of data.users) {
        const existing = await tx.user.findUnique({ where: { email: String(u.email) } });
        if (existing) ids.user.set(String(u.id), existing.id);
        else if (o.members === "all") {
          const id = newId();
          await tx.user.create({ data: { id, email: String(u.email), name: String(u.name), nameAr: (u.nameAr as string) ?? null, phone: (u.phone as string) ?? null, avatarColor: (u.avatarColor as string) ?? null, passwordHash: String(u.passwordHash), preferences: (u.preferences as object) ?? undefined } });
          ids.user.set(String(u.id), id);
        }
      }

      let slug: string;
      const name = o.name?.trim() || String(src.name);
      const orgFields = Object.keys(Prisma.OrganizationScalarFieldEnum).filter((f) => !["id", "slug", "createdAt", "updatedAt", "logoPath"].includes(f));
      const orgData = Object.fromEntries(orgFields.filter((f) => f in src).map((f) => [f, src[f]])) as Record<string, unknown>;
      orgData.name = name;
      orgData.isSandbox = !!o.sandbox;
      if (orgData.settings === null) delete orgData.settings;

      if (o.mode === "replace") {
        const target = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
        slug = target.slug;
        for (const t of [...TABLES].reverse()) await delegate(tx, t.model).deleteMany({ where: { orgId } });
        await tx.searchIndex.deleteMany({ where: { orgId } });
        // Replacing contents doesn't change what this workspace is (e.g. a sandbox stays a sandbox).
        await tx.organization.update({ where: { id: orgId }, data: { ...orgData, name, isSandbox: target.isSandbox, logoPath: null } as Prisma.OrganizationUpdateInput });
      } else {
        const base = slugify(name);
        slug = base;
        for (let i = 2; await tx.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
        await tx.organization.create({ data: { ...orgData, id: orgId, slug, name } as Prisma.OrganizationCreateInput });
      }

      // Assign new ids first, so references can be resolved in any order.
      const included = TABLES.filter((t) => !o.structureOnly || t.structure);
      for (const t of included) {
        ids[t.key] = new Map();
        for (const r of data.tables[t.key] ?? []) if (r.id) ids[t.key].set(String(r.id), newId());
      }

      for (const t of included) {
        const allowed = new Set(Object.keys(t.fields));
        let rows = data.tables[t.key] ?? [];
        if (o.structureOnly && t.key === "attachment") rows = rows.filter((r) => r.entityType === "possession");
        if (t.key === "membership" && o.members === "me") rows = [];
        const out: Record<string, unknown>[] = [];
        for (const r of rows) {
          const row: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r)) if (allowed.has(k)) row[k] = v;
          row.orgId = orgId;
          if (row.id) row.id = ids[t.key].get(String(r.id));
          let ok = true;
          for (const [field, target] of Object.entries(t.fk ?? {})) {
            if (row[field] == null) continue;
            const mapped = ids[target]?.get(String(row[field]));
            if (mapped) row[field] = mapped;
            else if ((t.required ?? DEFAULT_REQUIRED).includes(field) && t.key !== "auditLog") ok = false;
            else row[field] = null;
          }
          for (const c of t.cond ?? []) {
            const target = c.map[String(row[c.by])];
            if (!target || row[c.field] == null) continue;
            row[c.field] = ids[target]?.get(String(row[c.field])) ?? null;
          }
          if (t.poly && row.entityType) {
            const target = POLY[String(row.entityType)];
            const mapped = target ? ids[target]?.get(String(row.entityId)) : undefined;
            if (mapped) row.entityId = mapped;
            else if (t.key !== "auditLog") ok = false;
          }
          for (const d of t.dates) if (typeof row[d] === "string") row[d] = new Date(row[d] as string);
          if (t.key === "attachment") {
            for (const pf of ["path", "thumbPath"]) {
              const old = row[pf] as string | null;
              if (!old) continue;
              const bytes = files[old.split(path.sep).join("/")];
              const ext = path.extname(old);
              const rel = path.join("orgs", orgId, "attachments", `${row.id}${pf === "thumbPath" ? "-thumb" : ""}${ext}`);
              if (bytes) {
                await mkdir(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, path.dirname(rel)), { recursive: true });
                await writeFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, rel), bytes);
              }
              row[pf] = rel;
            }
          }
          if (t.key === "billPayment" && o.structureOnly && row.status !== "due") ok = false;
          // A fresh start keeps people and prices but no history.
          if (o.structureOnly && t.key === "item") Object.assign(row, { avgCost: row.avgCost, lowStockAlertedAt: null });
          if (o.structureOnly && t.key === "employee") Object.assign(row, { qidRemindedAt: null, passportRemindedAt: null, leaveOpening: 0 });
          if (ok) out.push(row);
        }
        if (out.length) await delegate(tx, t.model).createMany({ data: out });
      }

      // The person restoring or duplicating always ends up as an owner.
      const mine = await tx.membership.findFirst({ where: { orgId, userId: o.actingUserId } });
      if (!mine) await tx.membership.create({ data: { orgId, userId: o.actingUserId, role: "owner" } });
      else if (mine.role !== "owner") await tx.membership.update({ where: { id: mine.id }, data: { role: "owner" } });

      return { slug, name };
    },
    { timeout: 120_000 },
  );

  // Logo
  if (src.logoPath && files[String(src.logoPath).split(path.sep).join("/")]) {
    const rel = path.join("orgs", orgId, "logo.png");
    await mkdir(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, "orgs", orgId), { recursive: true });
    await writeFile(path.join(/*turbopackIgnore: true*/ STORAGE_DIR, rel), files[String(src.logoPath).split(path.sep).join("/")]);
    await db.organization.update({ where: { id: orgId }, data: { logoPath: rel.split(path.sep).join("/") } });
  }
  await reindexOrg(db, orgId);
  return { orgId, ...result };
}

/** Remove files under the workspace folder that no attachment points to any more (after a replace). */
export async function pruneOrphanFiles(orgId: string) {
  const dir = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, "orgs", orgId, "attachments");
  const keep = new Set((await db.attachment.findMany({ where: { orgId }, select: { path: true, thumbPath: true } })).flatMap((a) => [path.basename(a.path), a.thumbPath ? path.basename(a.thumbPath) : ""]));
  const { rm } = await import("node:fs/promises");
  for (const f of await readdir(dir).catch(() => [] as string[])) if (!keep.has(f)) await rm(path.join(/*turbopackIgnore: true*/ dir, f), { force: true });
}
