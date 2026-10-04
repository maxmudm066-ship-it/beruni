/*
  Warnings:

  - You are about to drop the column `bodyHtml` on the `content_items` table. All the data in the column will be lost.
  - You are about to drop the column `bodyHtml` on the `content_revisions` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_content_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT,
    "updatedById" TEXT,
    "publishedAt" DATETIME,
    "scheduledAt" DATETIME,
    "submittedForReviewAt" DATETIME,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "rejectReason" TEXT,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "keywords" TEXT,
    "canonicalUrl" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImageAssetId" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "translationNote" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'source',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "content_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_items_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_items_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_content_items" ("archivedAt", "authorId", "body", "canonicalUrl", "createdAt", "deletedAt", "excerpt", "groupId", "id", "keywords", "lang", "noIndex", "ogDescription", "ogImageAssetId", "ogTitle", "origin", "publishedAt", "rejectReason", "reviewedAt", "reviewedById", "revision", "scheduledAt", "seoDescription", "seoTitle", "slug", "status", "submittedForReviewAt", "subtitle", "title", "translationNote", "updatedAt", "updatedById") SELECT "archivedAt", "authorId", "body", "canonicalUrl", "createdAt", "deletedAt", "excerpt", "groupId", "id", "keywords", "lang", "noIndex", "ogDescription", "ogImageAssetId", "ogTitle", "origin", "publishedAt", "rejectReason", "reviewedAt", "reviewedById", "revision", "scheduledAt", "seoDescription", "seoTitle", "slug", "status", "submittedForReviewAt", "subtitle", "title", "translationNote", "updatedAt", "updatedById" FROM "content_items";
DROP TABLE "content_items";
ALTER TABLE "new_content_items" RENAME TO "content_items";
CREATE INDEX "content_items_groupId_lang_idx" ON "content_items"("groupId", "lang");
CREATE INDEX "content_items_status_publishedAt_idx" ON "content_items"("status", "publishedAt");
CREATE INDEX "content_items_lang_status_idx" ON "content_items"("lang", "status");
CREATE UNIQUE INDEX "content_items_lang_slug_key" ON "content_items"("lang", "slug");
CREATE TABLE "new_content_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL,
    "changeSummary" TEXT,
    "changedById" TEXT,
    "restoredFrom" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_revisions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "content_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_revisions_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_content_revisions" ("body", "changeSummary", "changedById", "createdAt", "excerpt", "id", "itemId", "restoredFrom", "slug", "status", "subtitle", "title", "version") SELECT "body", "changeSummary", "changedById", "createdAt", "excerpt", "id", "itemId", "restoredFrom", "slug", "status", "subtitle", "title", "version" FROM "content_revisions";
DROP TABLE "content_revisions";
ALTER TABLE "new_content_revisions" RENAME TO "content_revisions";
CREATE INDEX "content_revisions_itemId_idx" ON "content_revisions"("itemId");
CREATE UNIQUE INDEX "content_revisions_itemId_version_key" ON "content_revisions"("itemId", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
