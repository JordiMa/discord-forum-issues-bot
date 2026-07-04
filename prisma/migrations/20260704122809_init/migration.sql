-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Forum" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forumChannelId" TEXT NOT NULL,
    "defaultLabels" TEXT NOT NULL DEFAULT '[]',
    "defaultProject" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guildId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    CONSTRAINT "Forum_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Forum_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssueLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "issueId" BIGINT NOT NULL,
    "issueNumber" INTEGER NOT NULL,
    "embedMessageId" TEXT,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "linkedPrNumber" INTEGER,
    "linkedPrUrl" TEXT,
    "linkedPrMerged" BOOLEAN NOT NULL DEFAULT false,
    "releaseTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "repositoryId" TEXT NOT NULL,
    CONSTRAINT "IssueLink_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueLinkId" TEXT NOT NULL,
    CONSTRAINT "Vote_issueLinkId_fkey" FOREIGN KEY ("issueLinkId") REFERENCES "IssueLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Guild_guildId_key" ON "Guild"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_repo_key" ON "Repository"("owner", "repo");

-- CreateIndex
CREATE UNIQUE INDEX "Forum_forumChannelId_key" ON "Forum"("forumChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLink_threadId_key" ON "IssueLink"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLink_repositoryId_issueNumber_key" ON "IssueLink"("repositoryId", "issueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_issueLinkId_userId_key" ON "Vote"("issueLinkId", "userId");
