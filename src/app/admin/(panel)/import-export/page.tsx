import Link from 'next/link';
import { Download, FileCheck2, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { optionLabel } from '@/lib/admin/field-labels';
import { CONTENT_TYPES, CONTENT_TYPE_MAP } from '@/lib/content-types';
import { adminListPath } from '@/lib/content/routes';
import { ROW_PROBLEM_KEYS, importColumns, rowIssues, type ImportColumn } from '@/lib/admin/import-columns';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { checkImportFile, confirmImport, discardImport } from './actions';
import { IMPORT_NOTICES, IMPORT_PROBLEMS } from './notices';

const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm';
const MAX_ROWS_SHOWN = 60;

const JOB_STATE_KEYS: Record<string, TranslationKey> = {
  validated: 'importExport.jobValidated',
  done: 'importExport.jobDone',
  cancelled: 'importExport.jobCancelled',
  importing: 'importExport.jobImporting',
  failed: 'importExport.jobFailed',
};

const ROW_STATE_KEYS: Record<string, TranslationKey> = {
  valid: 'importExport.stateValid',
  error: 'importExport.stateError',
  duplicate: 'importExport.stateDuplicate',
  imported: 'importExport.stateImported',
  skipped: 'importExport.stateSkipped',
};

/** The title stored with the row, for the report list. */
function titleOf(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as { title?: string };
    return typeof parsed.title === 'string' ? parsed.title : '';
  } catch {
    return '';
  }
}

function headersOf(report: string): string[] {
  try {
    const parsed = JSON.parse(report) as { unknownHeaders?: unknown };
    const list = Array.isArray(parsed.unknownHeaders) ? parsed.unknownHeaders : [];
    return list.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
  } catch {
    return [];
  }
}

function jobQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 40) : '';
}

/** What a person typing this column needs to know. */
function whatToWrite(
  column: ImportColumn,
  locale: AdminLocale,
  t: (key: TranslationKey) => string,
  categoryNames: string[],
): string {
  if (column.field === 'lang') {
    return `${t('importExport.whatSelect')}: ${column.options.map((option) => option.value).join(', ')}`;
  }
  if (column.field === 'slug') return t('importExport.whatSlug');
  if (column.kind === 'url') return t('importExport.whatUrl');
  if (column.kind === 'tags') return t('importExport.whatTags');
  if (column.kind === 'category') {
    return categoryNames.length
      ? `${t('importExport.whatCategory')}: ${categoryNames.join(', ')}`
      : t('importExport.categoryNone');
  }
  switch (column.kind) {
    case 'richtext':
      return t('importExport.whatRich');
    case 'textarea':
      return t('importExport.whatLong');
    case 'number':
      return t('importExport.whatNumber');
    case 'date':
      return t('importExport.whatDate');
    case 'datetime':
      return t('importExport.whatDateTime');
    case 'time':
      return t('importExport.whatTime');
    case 'checkbox':
      return t('importExport.whatYesNo');
    case 'select':
      return `${t('importExport.whatSelect')}: ${column.options
        .map((option) => optionLabel(locale, option.value, option.label))
        .join(', ')}`;
    default:
      return t('importExport.whatText');
  }
}

export default async function ImportExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('importexport.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const query = await searchParams;

  const noticeKey = typeof query.notice === 'string' ? IMPORT_NOTICES[query.notice] : undefined;
  const problemKey = typeof query.bad === 'string' ? IMPORT_PROBLEMS[query.bad] : undefined;

  const jobId = jobQuery(query.job);
  const [languages, job, jobs] = await Promise.all([
    prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    jobId
      ? prisma.importJob.findUnique({
          where: { id: jobId },
          include: { rows: { orderBy: { rowNumber: 'asc' } }, createdBy: { select: { displayName: true } } },
        })
      : Promise.resolve(null),
    prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        contentType: true,
        filename: true,
        status: true,
        totalRows: true,
        validRows: true,
        importedRows: true,
        createdAt: true,
      },
    }),
  ]);

  const languageOptions = languages.map((language) => ({ code: language.code, name: language.nativeName }));
  const codes = new Set(languages.map((language) => language.code));
  const fromQuery = typeof query.type === 'string' ? query.type : '';
  const typeKey = CONTENT_TYPE_MAP.has(fromQuery)
    ? fromQuery
    : job && CONTENT_TYPE_MAP.has(job.contentType)
      ? job.contentType
      : 'news';
  const def = CONTENT_TYPE_MAP.get(typeKey)!;

  const echoLang = typeof query.lang === 'string' && codes.has(query.lang) ? query.lang : (languages[0]?.code ?? 'ru');

  const columns = importColumns(def, locale, languageOptions);
  const categories = def.categoryScope
    ? await prisma.category.findMany({
        where: { scope: def.categoryScope, isActive: true },
        include: { translations: true },
        orderBy: { sortOrder: 'asc' },
      })
    : [];
  // Names in the language of the panel, since the importer accepts a rubric in any language.
  const categoryNames = categories.map(
    (category) =>
      category.translations.find((entry) => entry.lang === locale)?.name ??
      category.translations[0]?.name ??
      category.slug,
  );

  // A report belongs to the type of its own file, even when the selector above has moved on.
  const labelOf = new Map<string, string>();
  if (job && CONTENT_TYPE_MAP.has(job.contentType)) {
    for (const column of importColumns(CONTENT_TYPE_MAP.get(job.contentType)!, locale, languageOptions)) {
      labelOf.set(column.field, column.label);
    }
  }

  const rows = job?.rows ?? [];
  const shownRows = rows.slice(0, MAX_ROWS_SHOWN);
  const unknownHeaders = job ? headersOf(job.report ?? '') : [];
  const skippedCount = rows.filter((row) => row.status === 'skipped').length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('importExport.title')} description={t('importExport.subtitle')} />

      {noticeKey ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {t(noticeKey)}
        </p>
      ) : null}

      {problemKey ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {t(problemKey)}
        </p>
      ) : null}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form action="/admin/import-export" method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <label htmlFor="type" className="text-xs text-muted-foreground">
                {t('importExport.type')}
              </label>
              <select id="type" name="type" defaultValue={typeKey} className={selectClass}>
                {CONTENT_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>
                    {translate(locale, `type.${type.key}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-9">
              {t('importExport.showColumns')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t('importExport.export')}</CardTitle>
          <CardDescription>{t('importExport.exportHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/admin/import-export/export" method="get" className="space-y-4">
            <input type="hidden" name="type" value={typeKey} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="export-lang" className="text-xs text-muted-foreground">
                  {t('importExport.exportLang')}
                </label>
                <select id="export-lang" name="lang" defaultValue="all" className={selectClass}>
                  <option value="all">{t('importExport.allLangs')}</option>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.nativeName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="export-subset" className="text-xs text-muted-foreground">
                  {t('importExport.exportWhich')}
                </label>
                <select id="export-subset" name="subset" defaultValue="published" className={selectClass}>
                  <option value="published">{t('importExport.whichPublished')}</option>
                  <option value="unpublished">{t('importExport.whichUnpublished')}</option>
                  <option value="all">{t('importExport.whichAll')}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="export-template" className="text-xs text-muted-foreground">
                  {t('importExport.exportKind')}
                </label>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <input id="export-template" type="checkbox" name="template" value="1" className="size-4 rounded border-input" />
                  {t('importExport.template')}
                </label>
                <p className="text-xs text-muted-foreground">{t('importExport.templateHint')}</p>
              </div>
            </div>
            <Button type="submit" size="sm">
              <Download />
              {t('importExport.download')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t('importExport.columns')}</CardTitle>
          <CardDescription>{t('importExport.filesNote')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <ul className="divide-y">
            {columns.map((column) => (
              <li key={column.field} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,220px)_1fr]">
                <span className="text-sm font-medium">
                  {column.label}
                  {column.required ? <span className="ml-1 text-destructive">*</span> : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {whatToWrite(column, locale, t, categoryNames)}
                  <span className="ml-2 text-xs">
                    · {column.required ? t('importExport.columnRequired') : t('importExport.columnOptional')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t('importExport.import')}</CardTitle>
          <CardDescription>{t('importExport.importHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={checkImportFile} encType="multipart/form-data" className="space-y-4">
            <input type="hidden" name="type" value={typeKey} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="import-file" className="text-xs text-muted-foreground">
                  {t('importExport.file')} · {translate(locale, `type.${def.key}` as TranslationKey)}
                </label>
                <Input
                  id="import-file"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm"
                />
                <p className="text-xs text-muted-foreground">{t('importExport.fileHint')}</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="import-lang" className="text-xs text-muted-foreground">
                  {t('importExport.defaultLang')}
                </label>
                <select id="import-lang" name="lang" defaultValue={echoLang} className={selectClass}>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.nativeName}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t('importExport.defaultLangHint')}</p>
              </div>
            </div>
            <Button type="submit" size="sm">
              <FileCheck2 />
              {t('importExport.check')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {job ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              {t('importExport.report')} · {translate(locale, `type.${job.contentType}` as TranslationKey)}
            </CardTitle>
            <CardDescription>
              {job.filename} · {formatDateTime(job.createdAt, locale)} · {t('importExport.jobBy')}: {job.createdBy?.displayName ?? '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                {t('importExport.rowsTotal')}: {job.totalRows}
              </Badge>
              <Badge variant="secondary">
                {t('importExport.rowsReady')}: {job.validRows}
              </Badge>
              <Badge variant="outline">
                {t('importExport.rowsProblems')}: {job.errorRows}
              </Badge>
              <Badge variant="outline">
                {t('importExport.rowsDuplicates')}: {job.duplicateRows}
              </Badge>
              {job.status in JOB_STATE_KEYS ? <Badge variant="outline">{t(JOB_STATE_KEYS[job.status])}</Badge> : null}
            </div>

            {unknownHeaders.length ? (
              <p className="text-sm text-muted-foreground">
                {t('importExport.unknownColumns')}: {unknownHeaders.join(', ')}
              </p>
            ) : null}

            {job.status === 'validated' ? (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <p className="text-sm">{t('importExport.confirmHint')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {job.validRows > 0 ? (
                    <form action={confirmImport}>
                      <input type="hidden" name="job" value={job.id} />
                      <Button type="submit" size="sm">
                        {t('importExport.confirm')} ({job.validRows})
                      </Button>
                    </form>
                  ) : null}
                  <form action={discardImport}>
                    <input type="hidden" name="job" value={job.id} />
                    <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                      <Trash2 />
                      {t('importExport.cancel')}
                    </Button>
                  </form>
                </div>
              </div>
            ) : null}

            {job.status === 'done' ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  {t('importExport.createdCount')}: {job.importedRows}
                </span>
                {skippedCount > 0 ? (
                  <span className="text-muted-foreground">
                    {t('importExport.skippedCount')}: {skippedCount}
                  </span>
                ) : null}
                <Button asChild size="sm" variant="outline">
                  <Link href={`${adminListPath(job.contentType)}?status=draft`}>{t('importExport.openList')}</Link>
                </Button>
              </div>
            ) : null}

            {shownRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">{t('importExport.line')}</TableHead>
                    <TableHead>{t('importExport.whatRow')}</TableHead>
                    <TableHead className="w-40">{t('importExport.rowState')}</TableHead>
                    <TableHead className="w-64">{t('importExport.rowProblem')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownRows.map((row) => {
                    const issues = rowIssues(row.message);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                        <TableCell className="max-w-md truncate">{titleOf(row.payload) || '—'}</TableCell>
                        <TableCell>
                          {row.status in ROW_STATE_KEYS ? (
                            <Badge variant={row.status === 'valid' || row.status === 'imported' ? 'secondary' : 'outline'}>
                              {t(ROW_STATE_KEYS[row.status])}
                            </Badge>
                          ) : (
                            row.status
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {issues.length ? (
                            <ul className="space-y-1">
                              {issues.map((issue) => (
                                <li key={`${issue.problem}:${issue.field}`}>
                                  {issue.field ? `${labelOf.get(issue.field) ?? issue.field}: ` : ''}
                                  {t(ROW_PROBLEM_KEYS[issue.problem])}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}

            {rows.length > shownRows.length ? (
              <p className="text-xs text-muted-foreground">{t('importExport.moreRows')}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('importExport.jobs')}</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('importExport.jobsEmpty')}</p>
          ) : (
            <ul className="divide-y">
              {jobs.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {entry.filename} · {translate(locale, `type.${entry.contentType}` as TranslationKey)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt, locale)} · {t('importExport.rowsTotal')}: {entry.totalRows} ·{' '}
                      {t('importExport.rowsReady')}: {entry.validRows} ·{' '}
                      {JOB_STATE_KEYS[entry.status] ? t(JOB_STATE_KEYS[entry.status]) : entry.status}
                      {entry.status === 'done' ? ` · ${t('importExport.createdCount')}: ${entry.importedRows}` : ''}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/import-export?job=${entry.id}&type=${entry.contentType}`}>{t('importExport.open')}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
