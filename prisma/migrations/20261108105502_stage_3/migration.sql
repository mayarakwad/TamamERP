-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademicYear_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "sort" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    CONSTRAINT "Term_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Term_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "level" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    CONSTRAINT "Grade_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "color" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Subject_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 25,
    "homeroomId" TEXT,
    CONSTRAINT "Section_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Section_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Section_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Section_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Section_homeroomId_fkey" FOREIGN KEY ("homeroomId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeachingAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "periods" INTEGER NOT NULL DEFAULT 4,
    CONSTRAINT "TeachingAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeachingAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeachingAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeachingAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "room" TEXT,
    CONSTRAINT "TimetableSlot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableSlot_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "qid" TEXT,
    "employer" TEXT,
    "address" TEXT,
    "addressAr" TEXT,
    "userId" TEXT,
    "partyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Guardian_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "gender" TEXT NOT NULL,
    "dob" DATETIME NOT NULL,
    "nationality" TEXT,
    "qid" TEXT,
    "qidExpiry" DATETIME,
    "passportNumber" TEXT,
    "campusId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "sectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedOn" DATETIME NOT NULL,
    "leftOn" DATETIME,
    "bloodGroup" TEXT,
    "medical" TEXT,
    "busStopId" TEXT,
    "discountKind" TEXT,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "previousSchool" TEXT,
    "avatarColor" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Student_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Student_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Student_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Student_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Student_busStopId_fkey" FOREIGN KEY ("busStopId") REFERENCES "BusStop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentGuardian" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "StudentGuardian_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "childNameAr" TEXT,
    "gender" TEXT NOT NULL,
    "dob" DATETIME NOT NULL,
    "nationality" TEXT,
    "previousSchool" TEXT,
    "guardianName" TEXT NOT NULL,
    "guardianNameAr" TEXT,
    "guardianRelation" TEXT NOT NULL DEFAULT 'father',
    "guardianPhone" TEXT NOT NULL,
    "guardianEmail" TEXT,
    "guardianId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "stageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentAt" DATETIME,
    "assessmentScore" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'walkin',
    "notes" TEXT,
    "studentId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceRoll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "takenById" TEXT NOT NULL,
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "size" INTEGER NOT NULL,
    "absent" INTEGER NOT NULL DEFAULT 0,
    "late" INTEGER NOT NULL DEFAULT 0,
    "excused" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AttendanceRoll_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRoll_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "minutes" INTEGER,
    "note" TEXT,
    "notifiedAt" DATETIME,
    CONSTRAINT "StudentAttendance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentAttendance_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "kind" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assessment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assessment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assessment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" INTEGER,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mark_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mark_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "teacherComment" TEXT,
    "principalComment" TEXT,
    "subjectComments" JSONB,
    "snapshot" JSONB,
    "publishedAt" DATETIME,
    "publishedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportCard_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportCard_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportCard_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    CONSTRAINT "FeeRate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeeRate_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "AcademicYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeeRate_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "attendantName" TEXT,
    "attendantPhone" TEXT,
    "plate" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "annualFee" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    CONSTRAINT "BusRoute_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BusRoute_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "sort" INTEGER NOT NULL,
    "pickup" TEXT,
    "dropoff" TEXT,
    CONSTRAINT "BusStop_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BusStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "BusRoute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "campusId" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" TEXT,
    "shelf" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "coverColor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Book_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "studentId" TEXT,
    "employeeId" TEXT,
    "borrowedOn" DATETIME NOT NULL,
    "dueOn" DATETIME NOT NULL,
    "returnedOn" DATETIME,
    "remindedAt" DATETIME,
    "issuedById" TEXT NOT NULL,
    CONSTRAINT "Loan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Loan_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Loan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Loan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "campusId" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'everyone',
    "gradeId" TEXT,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "body" TEXT NOT NULL,
    "bodyAr" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "campusId" TEXT,
    "date" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "sourceId" TEXT,
    "studentId" TEXT,
    "installment" TEXT,
    "createdById" TEXT NOT NULL,
    "issuedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("campusId", "createdAt", "createdById", "date", "discount", "dueDate", "id", "issuedAt", "kind", "notes", "number", "orgId", "paid", "partyId", "reference", "sourceId", "status", "subtotal", "terms", "total", "updatedAt") SELECT "campusId", "createdAt", "createdById", "date", "discount", "dueDate", "id", "issuedAt", "kind", "notes", "number", "orgId", "paid", "partyId", "reference", "sourceId", "status", "subtotal", "terms", "total", "updatedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE INDEX "Document_orgId_kind_status_idx" ON "Document"("orgId", "kind", "status");
CREATE INDEX "Document_studentId_idx" ON "Document"("studentId");
CREATE INDEX "Document_partyId_idx" ON "Document"("partyId");
CREATE UNIQUE INDEX "Document_orgId_number_key" ON "Document"("orgId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_orgId_name_key" ON "AcademicYear"("orgId", "name");

-- CreateIndex
CREATE INDEX "Term_yearId_idx" ON "Term"("yearId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_orgId_level_key" ON "Grade"("orgId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_orgId_code_key" ON "Subject"("orgId", "code");

-- CreateIndex
CREATE INDEX "Section_orgId_yearId_idx" ON "Section"("orgId", "yearId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_yearId_campusId_gradeId_name_key" ON "Section"("yearId", "campusId", "gradeId", "name");

-- CreateIndex
CREATE INDEX "TeachingAssignment_teacherId_idx" ON "TeachingAssignment"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingAssignment_sectionId_subjectId_key" ON "TeachingAssignment"("sectionId", "subjectId");

-- CreateIndex
CREATE INDEX "TimetableSlot_teacherId_day_period_idx" ON "TimetableSlot"("teacherId", "day", "period");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_sectionId_day_period_key" ON "TimetableSlot"("sectionId", "day", "period");

-- CreateIndex
CREATE INDEX "Guardian_orgId_idx" ON "Guardian"("orgId");

-- CreateIndex
CREATE INDEX "Guardian_userId_idx" ON "Guardian"("userId");

-- CreateIndex
CREATE INDEX "Student_orgId_status_idx" ON "Student"("orgId", "status");

-- CreateIndex
CREATE INDEX "Student_sectionId_idx" ON "Student"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_orgId_number_key" ON "Student"("orgId", "number");

-- CreateIndex
CREATE INDEX "StudentGuardian_guardianId_idx" ON "StudentGuardian"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardian_studentId_guardianId_key" ON "StudentGuardian"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "Application_orgId_stage_idx" ON "Application"("orgId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Application_orgId_number_key" ON "Application"("orgId", "number");

-- CreateIndex
CREATE INDEX "AttendanceRoll_orgId_date_idx" ON "AttendanceRoll"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRoll_sectionId_date_key" ON "AttendanceRoll"("sectionId", "date");

-- CreateIndex
CREATE INDEX "StudentAttendance_orgId_date_idx" ON "StudentAttendance"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAttendance_studentId_date_key" ON "StudentAttendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "Assessment_sectionId_subjectId_termId_idx" ON "Assessment"("sectionId", "subjectId", "termId");

-- CreateIndex
CREATE INDEX "Assessment_orgId_termId_idx" ON "Assessment"("orgId", "termId");

-- CreateIndex
CREATE INDEX "Mark_studentId_idx" ON "Mark"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_assessmentId_studentId_key" ON "Mark"("assessmentId", "studentId");

-- CreateIndex
CREATE INDEX "ReportCard_sectionId_termId_idx" ON "ReportCard"("sectionId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCard_studentId_termId_key" ON "ReportCard"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeRate_yearId_gradeId_component_key" ON "FeeRate"("yearId", "gradeId", "component");

-- CreateIndex
CREATE UNIQUE INDEX "BusRoute_orgId_code_key" ON "BusRoute"("orgId", "code");

-- CreateIndex
CREATE INDEX "BusStop_routeId_idx" ON "BusStop"("routeId");

-- CreateIndex
CREATE INDEX "Book_orgId_idx" ON "Book"("orgId");

-- CreateIndex
CREATE INDEX "Loan_orgId_returnedOn_idx" ON "Loan"("orgId", "returnedOn");

-- CreateIndex
CREATE INDEX "Loan_bookId_idx" ON "Loan"("bookId");

-- CreateIndex
CREATE INDEX "Announcement_orgId_publishedAt_idx" ON "Announcement"("orgId", "publishedAt");
