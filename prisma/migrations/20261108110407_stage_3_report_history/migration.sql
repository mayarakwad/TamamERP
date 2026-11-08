-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReportCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "sectionId" TEXT,
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
    CONSTRAINT "ReportCard_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReportCard" ("id", "orgId", "principalComment", "publishedAt", "publishedById", "sectionId", "snapshot", "status", "studentId", "subjectComments", "teacherComment", "termId", "updatedAt") SELECT "id", "orgId", "principalComment", "publishedAt", "publishedById", "sectionId", "snapshot", "status", "studentId", "subjectComments", "teacherComment", "termId", "updatedAt" FROM "ReportCard";
DROP TABLE "ReportCard";
ALTER TABLE "new_ReportCard" RENAME TO "ReportCard";
CREATE INDEX "ReportCard_sectionId_termId_idx" ON "ReportCard"("sectionId", "termId");
CREATE UNIQUE INDEX "ReportCard_studentId_termId_key" ON "ReportCard"("studentId", "termId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
