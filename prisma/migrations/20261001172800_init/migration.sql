-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "isAdminUser" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "twoFactorVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "payload" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "urlPrefix" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tag_translations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "tag_translations_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "content_groups_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "bodyHtml" TEXT,
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

-- CreateTable
CREATE TABLE "content_item_tags" (
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("itemId", "tagId"),
    CONSTRAINT "content_item_tags_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "content_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_item_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_relations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "targetGroupId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'related',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "content_relations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "content_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_relations_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "authorships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "researcherId" TEXT,
    "fullName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'author',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "authorships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_revisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "bodyHtml" TEXT,
    "status" TEXT NOT NULL,
    "changeSummary" TEXT,
    "changedById" TEXT,
    "restoredFrom" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_revisions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "content_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_revisions_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "news" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "eventDate" DATETIME,
    "sourceUrl" TEXT,
    CONSTRAINT "news_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "news_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "journalId" TEXT,
    "doi" TEXT,
    "references" TEXT,
    CONSTRAINT "articles_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "articles_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "journals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT,
    "issn" TEXT,
    "eissn" TEXT,
    "website" TEXT,
    "foundedYear" INTEGER,
    CONSTRAINT "journals_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "isbn" TEXT,
    "publisher" TEXT,
    "place" TEXT,
    "year" INTEGER,
    "pages" INTEGER,
    "volume" TEXT,
    "edition" TEXT,
    CONSTRAINT "books_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "books_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "journalId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'article',
    "isbn" TEXT,
    "doi" TEXT,
    "publisher" TEXT,
    "year" INTEGER,
    "pages" TEXT,
    "issue" TEXT,
    CONSTRAINT "publications_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "publications_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "publications_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "manuscripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
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
    CONSTRAINT "manuscripts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dissertations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "degree" TEXT NOT NULL DEFAULT 'phd',
    "specialtyCode" TEXT,
    "specialty" TEXT,
    "candidateName" TEXT,
    "candidateId" TEXT,
    "supervisor" TEXT,
    "organization" TEXT,
    "defenseDate" DATETIME,
    "defenseTime" TEXT,
    "defensePlace" TEXT,
    "councilCode" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'announced',
    "abstract" TEXT,
    CONSTRAINT "dissertations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dissertation_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dissertationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'attachment',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "dissertation_documents_dissertationId_fkey" FOREIGN KEY ("dissertationId") REFERENCES "dissertations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'conference',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "startTime" TEXT,
    "endTime" TEXT,
    "location" TEXT,
    "venue" TEXT,
    "organizers" TEXT,
    "registrationUrl" TEXT,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "program" TEXT,
    CONSTRAINT "events_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_speakers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "researcherId" TEXT,
    "fullName" TEXT,
    "affiliation" TEXT,
    "topic" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "event_speakers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'official',
    "expiresAt" DATETIME,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "announcements_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "announcements_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "researchers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "userId" TEXT,
    "photoAssetId" TEXT,
    "position" TEXT,
    "leadershipRole" TEXT,
    "degree" TEXT,
    "degreeFull" TEXT,
    "academicTitle" TEXT,
    "specialty" TEXT,
    "interests" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "orcid" TEXT,
    "website" TEXT,
    "links" TEXT,
    "birthYear" INTEGER,
    "departmentId" TEXT,
    "isStaff" BOOLEAN NOT NULL DEFAULT true,
    "isYoungScientist" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "researchers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "researchers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'department',
    "parentId" TEXT,
    "headResearcherId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "room" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "departments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "research_directions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "leadResearcherId" TEXT,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "research_directions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "research_direction_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "directionId" TEXT NOT NULL,
    "researcherGroupId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    CONSTRAINT "research_direction_members_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "research_directions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "research_direction_members_researcherGroupId_fkey" FOREIGN KEY ("researcherGroupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "research_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "directionId" TEXT,
    "code" TEXT,
    "fundingSource" TEXT,
    "budget" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'active',
    "leadResearcherId" TEXT,
    CONSTRAINT "research_projects_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "research_projects_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "research_projects_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "research_directions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "research_project_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "researcherGroupId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    CONSTRAINT "research_project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "research_project_members_researcherGroupId_fkey" FOREIGN KEY ("researcherGroupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "organization" TEXT,
    "country" TEXT,
    "orgType" TEXT NOT NULL DEFAULT 'research_institute',
    "website" TEXT,
    "logoAssetId" TEXT,
    "agreementNumber" TEXT,
    "signedAt" DATETIME,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "partners_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "partners_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "partner_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "researcherGroupId" TEXT,
    CONSTRAINT "partner_projects_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "partner_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "research_projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "partner_projects_researcherGroupId_fkey" FOREIGN KEY ("researcherGroupId") REFERENCES "content_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'standard',
    "showInBreadcrumbs" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pathOverride" TEXT,
    CONSTRAINT "pages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'official',
    "docNumber" TEXT,
    "issuedAt" DATETIME,
    "assetId" TEXT,
    CONSTRAINT "documents_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media_folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "media_folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folderId" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "pageCount" INTEGER,
    "altText" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "description" TEXT,
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "checksum" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error" TEXT,
    "externalUrl" TEXT,
    "uploadedById" TEXT,
    "replacedCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplacedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "media_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "media_folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    CONSTRAINT "media_variants_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "lang" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "media_links_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "media_links_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuId" TEXT NOT NULL,
    "parentId" TEXT,
    "targetType" TEXT NOT NULL DEFAULT 'page',
    "targetUrl" TEXT,
    "contentGroupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT false,
    "isMegaMenu" BOOLEAN NOT NULL DEFAULT false,
    "megaConfig" TEXT,
    "cssClass" TEXT,
    "icon" TEXT,
    CONSTRAINT "menu_items_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "menu_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "menu_items_contentGroupId_fkey" FOREIGN KEY ("contentGroupId") REFERENCES "content_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "menu_item_translations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "label" TEXT,
    CONSTRAINT "menu_item_translations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "menu_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "homepage_section_contents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "heading" TEXT,
    "subheading" TEXT,
    "body" TEXT,
    "buttonText" TEXT,
    "buttonUrl" TEXT,
    "button2Text" TEXT,
    "button2Url" TEXT,
    CONSTRAINT "homepage_section_contents_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "homepage_sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "homepage_section_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "homepage_section_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "homepage_sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "homepage_section_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "content_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "route_seo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lang" TEXT NOT NULL,
    "routePath" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "keywords" TEXT,
    "canonicalUrl" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImageAssetId" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "redirects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "redirectType" TEXT NOT NULL DEFAULT 'permanent',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "label" TEXT,
    "hint" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "setting_translations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settingId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "setting_translations_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "settings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "link_check_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "checkedCount" INTEGER NOT NULL DEFAULT 0,
    "brokenCount" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running'
);

-- CreateTable
CREATE TABLE "link_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "pagePath" TEXT,
    "pageGroupId" TEXT,
    "errorMessage" TEXT,
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "link_checks_runId_fkey" FOREIGN KEY ("runId") REFERENCES "link_check_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "report" TEXT,
    "confirmedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_job_rows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "payload" TEXT NOT NULL,
    CONSTRAINT "import_job_rows_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "import_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'ru',
    "stage" TEXT NOT NULL DEFAULT 'new',
    "ip" TEXT,
    "handledById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contact_messages_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scheduled_publish_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_ip_createdAt_idx" ON "login_attempts"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "languages_urlPrefix_key" ON "languages"("urlPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "categories_scope_slug_key" ON "categories"("scope", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_categoryId_lang_key" ON "category_translations"("categoryId", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tag_translations_tagId_lang_key" ON "tag_translations"("tagId", "lang");

-- CreateIndex
CREATE INDEX "content_groups_type_deletedAt_idx" ON "content_groups"("type", "deletedAt");

-- CreateIndex
CREATE INDEX "content_items_groupId_lang_idx" ON "content_items"("groupId", "lang");

-- CreateIndex
CREATE INDEX "content_items_status_publishedAt_idx" ON "content_items"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "content_items_lang_status_idx" ON "content_items"("lang", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_lang_slug_key" ON "content_items"("lang", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "content_relations_itemId_targetGroupId_reason_key" ON "content_relations"("itemId", "targetGroupId", "reason");

-- CreateIndex
CREATE INDEX "authorships_groupId_idx" ON "authorships"("groupId");

-- CreateIndex
CREATE INDEX "content_revisions_itemId_idx" ON "content_revisions"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "content_revisions_itemId_version_key" ON "content_revisions"("itemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "news_groupId_key" ON "news"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "articles_groupId_key" ON "articles"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "journals_groupId_key" ON "journals"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "books_groupId_key" ON "books"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "publications_groupId_key" ON "publications"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "manuscripts_groupId_key" ON "manuscripts"("groupId");

-- CreateIndex
CREATE INDEX "manuscripts_subject_idx" ON "manuscripts"("subject");

-- CreateIndex
CREATE INDEX "manuscripts_languageOfText_idx" ON "manuscripts"("languageOfText");

-- CreateIndex
CREATE UNIQUE INDEX "dissertations_groupId_key" ON "dissertations"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "events_groupId_key" ON "events"("groupId");

-- CreateIndex
CREATE INDEX "events_startDate_idx" ON "events"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "announcements_groupId_key" ON "announcements"("groupId");

-- CreateIndex
CREATE INDEX "announcements_expiresAt_idx" ON "announcements"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "researchers_groupId_key" ON "researchers"("groupId");

-- CreateIndex
CREATE INDEX "researchers_leadershipRole_idx" ON "researchers"("leadershipRole");

-- CreateIndex
CREATE INDEX "researchers_departmentId_idx" ON "researchers"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_groupId_key" ON "departments"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "research_directions_groupId_key" ON "research_directions"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "research_direction_members_directionId_researcherGroupId_key" ON "research_direction_members"("directionId", "researcherGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "research_projects_groupId_key" ON "research_projects"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "research_project_members_projectId_researcherGroupId_key" ON "research_project_members"("projectId", "researcherGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "partners_groupId_key" ON "partners"("groupId");

-- CreateIndex
CREATE INDEX "partners_country_idx" ON "partners"("country");

-- CreateIndex
CREATE UNIQUE INDEX "partner_projects_partnerId_projectId_key" ON "partner_projects"("partnerId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "pages_groupId_key" ON "pages"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_groupId_key" ON "documents"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "media_folders_parentId_name_key" ON "media_folders"("parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "media_storagePath_key" ON "media"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "media_publicUrl_key" ON "media"("publicUrl");

-- CreateIndex
CREATE INDEX "media_kind_status_idx" ON "media"("kind", "status");

-- CreateIndex
CREATE INDEX "media_folderId_idx" ON "media"("folderId");

-- CreateIndex
CREATE INDEX "media_createdAt_idx" ON "media"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_storagePath_key" ON "media_variants"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_publicUrl_key" ON "media_variants"("publicUrl");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_mediaId_role_width_key" ON "media_variants"("mediaId", "role", "width");

-- CreateIndex
CREATE INDEX "media_links_groupId_role_idx" ON "media_links"("groupId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "menus_key_key" ON "menus"("key");

-- CreateIndex
CREATE INDEX "menu_items_menuId_parentId_sortOrder_idx" ON "menu_items"("menuId", "parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_translations_itemId_lang_key" ON "menu_item_translations"("itemId", "lang");

-- CreateIndex
CREATE INDEX "homepage_sections_sortOrder_idx" ON "homepage_sections"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_section_contents_sectionId_lang_key" ON "homepage_section_contents"("sectionId", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_section_items_sectionId_groupId_key" ON "homepage_section_items"("sectionId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "route_seo_lang_routePath_key" ON "route_seo"("lang", "routePath");

-- CreateIndex
CREATE UNIQUE INDEX "redirects_sourcePath_key" ON "redirects"("sourcePath");

-- CreateIndex
CREATE INDEX "redirects_targetPath_idx" ON "redirects"("targetPath");

-- CreateIndex
CREATE UNIQUE INDEX "settings_group_key_key" ON "settings"("group", "key");

-- CreateIndex
CREATE UNIQUE INDEX "setting_translations_settingId_lang_key" ON "setting_translations"("settingId", "lang");

-- CreateIndex
CREATE INDEX "link_checks_status_idx" ON "link_checks"("status");

-- CreateIndex
CREATE INDEX "link_checks_url_idx" ON "link_checks"("url");

-- CreateIndex
CREATE INDEX "import_job_rows_jobId_status_idx" ON "import_job_rows"("jobId", "status");

-- CreateIndex
CREATE INDEX "contact_messages_stage_createdAt_idx" ON "contact_messages"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "scheduled_publish_logs_itemId_idx" ON "scheduled_publish_logs"("itemId");
