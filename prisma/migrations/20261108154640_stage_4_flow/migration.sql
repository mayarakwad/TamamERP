-- CreateTable
CREATE TABLE "FlowSettings" (
    "orgId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL DEFAULT 'claude-opus-5-5',
    "baseUrl" TEXT,
    "keyCipher" TEXT,
    "keyHint" TEXT,
    "keySetAt" DATETIME,
    "keySetById" TEXT,
    "effort" TEXT NOT NULL DEFAULT 'medium',
    "priceIn" INTEGER,
    "priceOut" INTEGER,
    "monthlyLimit" INTEGER,
    "roles" TEXT NOT NULL DEFAULT 'owner,admin,accountant,teacher,employee,member,parent',
    "name" TEXT NOT NULL DEFAULT 'Flow',
    "avatar" TEXT NOT NULL DEFAULT 'orb',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "warned80" TEXT,
    "warned100" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FlowSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "system" TEXT NOT NULL,
    "tools" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "turns" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FlowConversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlowConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "FlowConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "FlowProposal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlowProposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "FlowConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowUsage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FlowConversation_orgId_userId_updatedAt_idx" ON "FlowConversation"("orgId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "FlowMessage_conversationId_createdAt_idx" ON "FlowMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "FlowProposal_conversationId_idx" ON "FlowProposal"("conversationId");

-- CreateIndex
CREATE INDEX "FlowUsage_orgId_createdAt_idx" ON "FlowUsage"("orgId", "createdAt");
