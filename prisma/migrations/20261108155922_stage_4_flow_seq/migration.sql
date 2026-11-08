/*
  Warnings:

  - Added the required column `seq` to the `FlowMessage` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FlowMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "FlowConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FlowMessage" ("content", "conversationId", "createdAt", "id", "role") SELECT "content", "conversationId", "createdAt", "id", "role" FROM "FlowMessage";
DROP TABLE "FlowMessage";
ALTER TABLE "new_FlowMessage" RENAME TO "FlowMessage";
CREATE UNIQUE INDEX "FlowMessage_conversationId_seq_key" ON "FlowMessage"("conversationId", "seq");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
