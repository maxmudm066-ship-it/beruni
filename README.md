# Beruniy Institute of Oriental Studies — CMS and public site

A content-managed rebuild of the institute's website: one Next.js application serving both the
trilingual public site (`/uz`, `/ru`, `/en`) and the `/admin` panel, on the same database. The panel
is written for institute staff without technical training — every text, picture, file, menu,
translation, SEO field and publication time is changed through the interface, never through code.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4, shadcn/ui, Tiptap rich-text editor
- Prisma 7 with a SQLite database (`@prisma/adapter-better-sqlite3`)
- bcryptjs sessions with optional TOTP two-factor sign-in

## Getting started

Requires Node 20 or newer and pnpm.

```bash
cp .env.example .env      # then fill in SESSION_SECRET at minimum
pnpm install              # postinstall runs prisma generate
pnpm db:migrate           # creates prisma/dev.db and applies migrations
pnpm db:seed              # demo content, roles and sign-in accounts
pnpm dev                  # http://localhost:3000
```

Seeded accounts are development conveniences only: the administrator is `admin@beruni.uz`
(`SEED_ADMIN_PASSWORD`, default `ChangeMe123!`) and the role demos use `<username>@beruni.uz`
(`SEED_DEMO_PASSWORD`, default `Demo1234!`). Every one of them must have its password replaced and
the demos disabled before the panel is reachable from outside your own machine.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/(site)` | Public pages under a language prefix: home, listings, material pages, 404 |
| `src/app/admin` | Sign-in, preview, and the whole panel: materials by type, media, menus, homepage builder, reviews, translations, SEO, redirects, broken links, messages, import/export, roles, users, sessions, security, settings, trash |
| `src/app/api` | Endpoints, including `GET`/`POST /api/cron/publish` |
| `src/lib` | Content types, workflow, media handling, SEO, settings, auth |
| `prisma/schema.prisma` | The schema: materials, versions, translations, media, menus, redirects, users and roles |
| `scripts/migrate` | The one-time transfer of the old `beruni.uz` site (see below) |

Content types are declared in `src/lib/content-types.ts` — news, articles, books, publications,
manuscripts, dissertations, events, announcements, researchers, departments, research topics and
projects, partners, documents, pages and journals. Adding a field there gives the panel its input,
the database its column and the public site its output.

## Workflow

A material moves through draft → preview → review → publish, and any save after publication keeps a
restorable version with a human-readable summary of what changed. A publish intent with a future
time becomes a schedule, and the scheduled queue is emptied by `GET /api/cron/publish`, which an
external scheduler may call with `Authorization: Bearer $CRON_SECRET`. Translations are created as
drafts that copy the source text for a person to rewrite; no machine translation runs anywhere.

## Host the application

1. `pnpm install && pnpm build`, then `pnpm start` behind HTTPS. The session cookie is marked
   `secure` in production, so `/admin` does not work over plain HTTP.
2. Put the real domain in both `NEXT_PUBLIC_SITE_URL` and the panel's Settings → SEO → site address;
   the setting wins for canonical URLs and the sitemap, so a mismatch silently publishes the wrong
   address.
3. Keep `DATABASE_URL` pointed at the SQLite file and `UPLOAD_DIR` at a directory on persistent
   storage. Neither `prisma/dev.db` nor `uploads/` is in this repository — they are the site's data
   and must be copied and backed up separately.
4. Run `pnpm db:deploy` on each release, and schedule a call to `/api/cron/publish` every minute or
   two.
5. Native modules (`better-sqlite3`, `sharp`) must be compiled on the host that runs them, so an
   install copied between machines of different platforms needs `pnpm rebuild`.

## Transfer of the old site

`scripts/migrate` moved the content of `beruni.uz` (Joomla/K2) into this CMS in resumable passes. The
old site is treated as a read-only data source, and the raw archive of every fetched page and file
lives outside the repository, so no pass needs to visit the live site twice.

```bash
pnpm exec tsx scripts/migrate/crawl.ts        # pass 1: archive every page of the old site
pnpm exec tsx scripts/migrate/inventory.ts    # build the list of materials from the archive
pnpm exec tsx scripts/migrate/import-drafts.ts # pass 2: archived text -> draft in the CMS
pnpm exec tsx scripts/migrate/fetch-assets.ts # pass 3a: download pictures and PDFs
pnpm exec tsx scripts/migrate/load-media.ts   # pass 3b: files -> media library, attached to texts
pnpm exec tsx scripts/migrate/redirects.ts    # 301 rules for every old address
```

The transfer finished with 1017 materials (771 Uzbek, 159 Russian, 87 English) written as drafts,
1052 redirect rules, 1906 files and 928 file-to-material attachments. Those drafts are the
institute's to review and publish; until an editor does so, the migrated addresses answer 404.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```
