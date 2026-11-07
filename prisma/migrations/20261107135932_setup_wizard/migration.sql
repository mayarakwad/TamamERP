-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "instanceName" TEXT NOT NULL DEFAULT 'Tamam',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Qatar',
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "allowSignup" BOOLEAN NOT NULL DEFAULT true,
    "demoData" BOOLEAN NOT NULL DEFAULT false,
    "setupKeyHash" TEXT,
    "installedAt" DATETIME,
    "installedById" TEXT,
    "version" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "avatarColor" TEXT,
    "preferences" JSONB,
    "lastOrgId" TEXT,
    "lastLoginAt" DATETIME,
    "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatarColor", "createdAt", "email", "id", "lastLoginAt", "lastOrgId", "name", "nameAr", "passwordHash", "phone", "preferences", "updatedAt") SELECT "avatarColor", "createdAt", "email", "id", "lastLoginAt", "lastOrgId", "name", "nameAr", "passwordHash", "phone", "preferences", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
