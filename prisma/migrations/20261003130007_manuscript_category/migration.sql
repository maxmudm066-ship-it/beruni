-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_manuscripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "repositoryId" TEXT,
    "invNo" TEXT,
    "authorOriginal" TEXT,
    "titleOriginal" TEXT,
    "languageOfText" TEXT,
    "script" TEXT,
    "subject" TEXT,
    "periodLabel" TEXT,
    "dateHijri" TEXT,
    "dateGregorian" TEXT,
    "folios" TEXT,
    "dimensions" TEXT,
    "material" TEXT,
    "colophon" TEXT,
    "incipit" TEXT,
    "explicit" TEXT,
    "bibliographicInfo" TEXT,
    "digitalCopyNote" TEXT,
    "hasDigitalCopy" BOOLEAN NOT NULL DEFAULT false,
    "century" INTEGER,
    CONSTRAINT "manuscripts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "manuscripts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_manuscripts" ("authorOriginal", "bibliographicInfo", "century", "colophon", "dateGregorian", "dateHijri", "digitalCopyNote", "dimensions", "explicit", "folios", "groupId", "hasDigitalCopy", "id", "incipit", "invNo", "languageOfText", "material", "periodLabel", "repositoryId", "script", "subject", "titleOriginal") SELECT "authorOriginal", "bibliographicInfo", "century", "colophon", "dateGregorian", "dateHijri", "digitalCopyNote", "dimensions", "explicit", "folios", "groupId", "hasDigitalCopy", "id", "incipit", "invNo", "languageOfText", "material", "periodLabel", "repositoryId", "script", "subject", "titleOriginal" FROM "manuscripts";
DROP TABLE "manuscripts";
ALTER TABLE "new_manuscripts" RENAME TO "manuscripts";
CREATE UNIQUE INDEX "manuscripts_groupId_key" ON "manuscripts"("groupId");
CREATE INDEX "manuscripts_subject_idx" ON "manuscripts"("subject");
CREATE INDEX "manuscripts_languageOfText_idx" ON "manuscripts"("languageOfText");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
