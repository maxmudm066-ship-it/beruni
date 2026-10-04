'use client';

/**
 * The one editor used by every content type. It is driven entirely by the descriptor the server
 * builds (fields, options, current values, permissions), so a new content type needs no new page.
 *
 * Nothing here exposes identifiers, SQL or file paths: a category is picked by name, an image comes
 * from the Media Library, and a related material is found by its title.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, Star, WandSparkles, X } from 'lucide-react';
import { INITIAL_ACTION_STATE, type ActionState } from '@/lib/admin/action-state';
import { fieldLabel } from '@/lib/admin/field-labels';
import { mediaPickerLabels, statusLabel, type AdminLocale } from '@/lib/admin/labels';
import { slugify } from '@/lib/slug';
import {
  NONE,
  toMediaRef,
  type FormFieldSchema,
  type MaterialFormInit,
  type MediaFieldValue,
  type PersonValue,
  type RefValue,
  type ScalarValue,
} from '@/lib/content/form-types';
import { RichTextEditor } from '@/components/admin/editor/rich-text-editor';
import { AttachmentsField, GalleryField, MainImageField } from '@/components/admin/media/media-fields';
import { MediaPickerProvider } from '@/components/admin/media/media-picker';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Section = FormFieldSchema['section'];
type Labels = MaterialFormInit['labels'];

const SECTION_ORDER: Section[] = ['main', 'taxonomy', 'media', 'relations', 'meta', 'seo'];

/** Fields that need the full width of the card. */
const WIDE = new Set(['textarea', 'json', 'media', 'mediaGallery', 'mediaList', 'authors', 'people', 'contentRef', 'richtext']);

function optionsFor(init: MaterialFormInit, field: FormFieldSchema) {
  if (field.kind === 'category') return init.categoryOptions;
  if (field.name === 'lang') return init.languageOptions;
  if (field.name === 'author') return init.authorOptions;
  return field.options ?? [];
}

/** The rich-text editor is the heaviest field: keep it out of re-renders caused by typing elsewhere. */
const RichField = memo(function RichField({
  name,
  value,
  onChange,
  disabled,
  labels,
}: {
  name: string;
  value: string;
  onChange: (html: string) => void;
  disabled: boolean;
  labels: MaterialFormInit['editorLabels'];
}) {
  return <RichTextEditor value={value} onChange={onChange} labels={labels} disabled={disabled} name={name} />;
});

function PersonRows({
  rows,
  peopleOptions,
  labels,
  disabled,
  onChange,
}: {
  rows: PersonValue[];
  peopleOptions: MaterialFormInit['personOptions'];
  labels: Labels;
  disabled: boolean;
  onChange: (rows: PersonValue[]) => void;
}) {
  const patch = (index: number, next: Partial<PersonValue>) =>
    onChange(rows.map((row, position) => (position === index ? { ...row, ...next } : row)));

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const chosen = row.detailId && peopleOptions.some((person) => person.detailId === row.detailId);
        return (
          <div key={index} className="grid items-start gap-2 rounded-md border bg-background p-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            {peopleOptions.length ? (
              <Select
                disabled={disabled}
                value={chosen ? (row.detailId as string) : NONE}
                onValueChange={(value) => {
                  if (value === NONE) patch(index, { detailId: null, groupId: null });
                  else {
                    const person = peopleOptions.find((entry) => entry.detailId === value);
                    if (person) patch(index, { detailId: person.detailId, groupId: person.groupId, fullName: person.label });
                  }
                }}
              >
                <SelectTrigger aria-label={labels.personFromList}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{labels.personOrType}</SelectItem>
                  {peopleOptions.map((person) => (
                    <SelectItem key={person.detailId} value={person.detailId}>
                      {person.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Input
              disabled={disabled}
              value={row.fullName}
              onChange={(event) => patch(index, { fullName: event.target.value })}
              placeholder={labels.personName}
              aria-label={labels.personName}
            />
            <Input
              disabled={disabled}
              value={row.note}
              onChange={(event) => patch(index, { note: event.target.value })}
              placeholder={labels.personNote}
              aria-label={labels.personNote}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              title={labels.removeRow}
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, position) => position !== index))}
            >
              <X />
            </Button>
          </div>
        );
      })}
      {!disabled ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { detailId: null, groupId: null, fullName: '', note: '' }])}>
          <Plus />
          {labels.addPerson}
        </Button>
      ) : null}
    </div>
  );
}

function RefPicker({
  rows,
  options,
  labels,
  disabled,
  onChange,
}: {
  rows: RefValue[];
  options: MaterialFormInit['refOptions'][string];
  labels: Labels;
  disabled: boolean;
  onChange: (rows: RefValue[]) => void;
}) {
  const [query, setQuery] = useState('');
  const labelOf = (detailId: string) => options.find((option) => option.detailId === detailId)?.label ?? detailId;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
    return list.slice(0, 40);
  }, [options, query]);

  const toggle = (detailId: string, groupId: string) => {
    const picked = rows.some((row) => row.detailId === detailId);
    onChange(picked ? rows.filter((row) => row.detailId !== detailId) : [...rows, { detailId, groupId }]);
  };

  return (
    <div className="space-y-2">
      {rows.length ? (
        <ul className="divide-y rounded-md border bg-background">
          {rows.map((row) => (
            <li key={row.detailId} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">{labelOf(row.detailId)}</span>
              {!disabled ? (
                <Button type="button" variant="ghost" size="icon" className="size-7" title={labels.removeRow} onClick={() => toggle(row.detailId, row.groupId)}>
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{labels.noRelated}</p>
      )}

      {!disabled ? (
        <div className="space-y-1.5">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.relatedSearch} aria-label={labels.relatedSearch} className="h-8 text-sm" />
          {visible.length ? (
            <ul className="max-h-44 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
              {visible.map((option) => {
                const picked = rows.some((row) => row.detailId === option.detailId);
                return (
                  <li key={option.detailId}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent ${picked ? 'text-muted-foreground' : ''}`}
                      onClick={() => toggle(option.detailId, option.groupId)}
                    >
                      {picked ? <Check className="size-4 shrink-0" /> : <Plus className="size-4 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MaterialForm({
  init,
  action,
}: {
  init: MaterialFormInit;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const labels = init.labels;
  const locale = init.locale as AdminLocale;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, INITIAL_ACTION_STATE);

  const [scalars, setScalars] = useState<Record<string, ScalarValue>>(() => ({ ...init.scalars }));
  const [bodies, setBodies] = useState<Record<string, string>>(() => ({ ...init.bodies }));
  const [media, setMedia] = useState<Record<string, MediaFieldValue[]>>(() => ({ ...init.mediaValues }));
  const [people, setPeople] = useState<Record<string, PersonValue[]>>(() => ({ ...init.personRefs }));
  const [refs, setRefs] = useState<Record<string, RefValue[]>>(() => ({ ...init.contentRefs }));
  const [slugTouched, setSlugTouched] = useState(Boolean(init.scalars.slug));
  const intentInput = useRef<HTMLInputElement>(null);
  const handled = useRef<ActionState | null>(null);

  const readOnly = init.itemId ? !init.canEdit : !init.canCreate;

  const setBody = useCallback((name: string, html: string) => {
    setBodies((current) => ({ ...current, [name]: html }));
  }, []);
  const setMediaField = useCallback((name: string, rows: MediaFieldValue[]) => {
    setMedia((current) => ({ ...current, [name]: rows }));
  }, []);
  const setPeopleField = useCallback((name: string, rows: PersonValue[]) => {
    setPeople((current) => ({ ...current, [name]: rows }));
  }, []);
  const setRefField = useCallback((name: string, rows: RefValue[]) => {
    setRefs((current) => ({ ...current, [name]: rows }));
  }, []);
  const setScalar = useCallback((name: string, value: ScalarValue) => {
    setScalars((current) => ({ ...current, [name]: value }));
  }, []);

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.open) window.open(state.open, '_blank', 'noopener');
    if (state.next) {
      router.push(state.next);
      return;
    }
    if (state.ok) {
      router.refresh();
    }
  }, [state, router]);

  const savedAt = useMemo(
    () => (state.savedAt ? new Date(state.savedAt).toLocaleTimeString() : null),
    [state.savedAt],
  );

  const chooseIntent = (intent: string) => {
    if (intentInput.current) intentInput.current.value = intent;
  };

  const onTitleChange = (value: string) => {
    setScalars((current) => ({ ...current, title: value, slug: slugTouched ? current.slug : slugify(value) }));
  };

  const fieldsBySection = useMemo(() => {
    const groups = new Map<Section, FormFieldSchema[]>();
    for (const section of SECTION_ORDER) groups.set(section, []);
    for (const field of init.fields) groups.get(field.section)?.push(field);
    return groups;
  }, [init.fields]);

  const seoChecks = useMemo(() => {
    const has = (name: string) => String(scalars[name] ?? '').trim().length > 0;
    const items: { label: string; done: boolean }[] = [
      { label: fieldLabel(locale, 'title'), done: has('title') },
      { label: fieldLabel(locale, 'slug'), done: has('slug') },
      { label: fieldLabel(locale, 'excerpt'), done: has('excerpt') },
      { label: fieldLabel(locale, 'seoTitle'), done: has('seoTitle') },
      { label: fieldLabel(locale, 'seoDescription'), done: has('seoDescription') },
    ];
    if (init.fields.some((field) => field.name === 'mainImage')) {
      items.push({ label: fieldLabel(locale, 'mainImage'), done: (media.mainImage?.length ?? 0) > 0 });
    }
    return items;
  }, [init.fields, locale, media.mainImage, scalars]);

  const seoFilled = seoChecks.filter((item) => item.done).length;
  const seoPercent = Math.round((seoFilled / seoChecks.length) * 100);
  const seoMissing = seoChecks.filter((item) => !item.done).map((item) => item.label);
  const publishDate = String(scalars.publishedAt ?? '');
  const isScheduled = Boolean(publishDate) && new Date(publishDate).getTime() > init.nowMs;

  const textOf = (name: string) => {
    const value = scalars[name];
    return value === null || value === undefined ? '' : String(value);
  };

  const renderField = (field: FormFieldSchema) => {
    const value = scalars[field.name];
    const id = `f-${field.name}`;
    const wide = WIDE.has(field.kind) || field.name === 'title' || field.name === 'slug';
    const required = field.required && !readOnly;

    const label = field.required ? (
      <Label htmlFor={id}>
        {field.label}
        <span className="ml-1 text-destructive">*</span>
      </Label>
    ) : (
      <Label htmlFor={id}>{field.label}</Label>
    );

    if (field.name === 'title' || field.name === 'slug') {
      return (
        <div key={field.name} className={wide ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
          {label}
          <div className="flex gap-2">
            <Input
              id={id}
              name={field.name}
              disabled={readOnly}
              required={field.name === 'title' && required}
              className={field.name === 'slug' ? 'font-mono' : undefined}
              value={textOf(field.name)}
              onChange={(event) => {
                if (field.name === 'title') onTitleChange(event.target.value);
                else {
                  setSlugTouched(true);
                  setScalar('slug', event.target.value);
                }
              }}
            />
            {field.name === 'slug' && !readOnly ? (
              <Button type="button" variant="outline" onClick={() => setScalar('slug', slugify(textOf('title')))}>
                <WandSparkles />
                {labels.autoSlug}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{field.name === 'slug' ? labels.slugHint : field.hint}</p>
        </div>
      );
    }

    const control = (() => {
      switch (field.kind) {
        case 'richtext':
          return (
            <>
              <RichField
                name={field.name}
                value={bodies[field.name] ?? ''}
                disabled={readOnly}
                labels={init.editorLabels}
                onChange={(html) => setBody(field.name, html)}
              />
              <input type="hidden" name={`__body:${field.name}`} value={bodies[field.name] ?? ''} />
            </>
          );

        case 'media':
          return (
            <>
              <MainImageField
                value={media[field.name]?.[0] ?? null}
                labels={labels.media}
                onChange={(next) => setMediaField(field.name, next ? [next] : [])}
              />
              <input type="hidden" name={`__media:${field.name}`} value={JSON.stringify((media[field.name] ?? []).map(toMediaRef))} />
            </>
          );

        case 'mediaGallery':
          return (
            <>
              <GalleryField value={media[field.name] ?? []} labels={labels.media} onChange={(rows) => setMediaField(field.name, rows)} />
              <input type="hidden" name={`__media:${field.name}`} value={JSON.stringify((media[field.name] ?? []).map(toMediaRef))} />
            </>
          );

        case 'mediaList':
          return (
            <>
              <AttachmentsField value={media[field.name] ?? []} labels={labels.media} onChange={(rows) => setMediaField(field.name, rows)} />
              <input type="hidden" name={`__media:${field.name}`} value={JSON.stringify((media[field.name] ?? []).map(toMediaRef))} />
            </>
          );

        case 'authors':
        case 'people':
          return (
            <>
              <PersonRows
                rows={people[field.name] ?? []}
                peopleOptions={init.personOptions}
                labels={labels}
                disabled={readOnly}
                onChange={(rows) => setPeopleField(field.name, rows)}
              />
              <input type="hidden" name={`__people:${field.name}`} value={JSON.stringify(people[field.name] ?? [])} />
            </>
          );

        case 'contentRef': {
          const options = init.refOptions[field.name] ?? [];
          if (field.many) {
            return (
              <>
                <RefPicker
                  rows={refs[field.name] ?? []}
                  options={options}
                  labels={labels}
                  disabled={readOnly}
                  onChange={(rows) => setRefField(field.name, rows)}
                />
                <input type="hidden" name={`__ref:${field.name}`} value={JSON.stringify(refs[field.name] ?? [])} />
              </>
            );
          }
          const current = refs[field.name]?.[0]?.detailId ?? NONE;
          return (
            <Select
              name={field.name}
              disabled={readOnly}
              value={options.some((option) => option.detailId === current) ? current : NONE}
              onValueChange={(next) => setRefField(field.name, next === NONE ? [] : [{ detailId: next, groupId: options.find((option) => option.detailId === next)?.groupId ?? '' }])}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder={labels.choosePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{labels.none}</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option.detailId} value={option.detailId}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        case 'select':
        case 'category': {
          const options = optionsFor(init, field);
          const raw = value === null || value === undefined ? NONE : String(value);
          const current = options.some((option) => option.value === raw) ? raw : NONE;
          const lockLanguage = field.name === 'lang' && Boolean(init.itemId);
          return (
            <Select
              name={field.name}
              disabled={readOnly || lockLanguage}
              value={current}
              onValueChange={(next) => setScalar(field.name, next === NONE ? null : next)}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder={labels.choosePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {field.kind === 'category' ? (
                  <SelectItem value={NONE}>{labels.none}</SelectItem>
                ) : field.required ? null : (
                  <SelectItem value={NONE}>{labels.choosePlaceholder}</SelectItem>
                )}
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        case 'checkbox':
          return (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id={id} disabled={readOnly} checked={value === true} onCheckedChange={(next) => setScalar(field.name, next === true)} />
              <Label htmlFor={id} className="cursor-pointer font-normal">
                {field.label}
              </Label>
              <input type="hidden" name={field.name} value={value === true ? '1' : '0'} readOnly />
            </div>
          );

        case 'textarea':
        case 'json':
          return (
            <Textarea
              id={id}
              name={field.name}
              disabled={readOnly}
              required={required}
              rows={field.rows ?? (field.kind === 'json' ? 4 : 3)}
              value={textOf(field.name)}
              onChange={(event) => setScalar(field.name, event.target.value)}
            />
          );

        case 'number':
          return (
            <Input
              id={id}
              name={field.name}
              type="number"
              disabled={readOnly}
              required={required}
              value={textOf(field.name)}
              onChange={(event) => setScalar(field.name, event.target.value === '' ? null : Number(event.target.value))}
            />
          );

        case 'date':
        case 'time':
        case 'datetime':
          return (
            <Input
              id={id}
              name={field.name}
              type={field.kind === 'datetime' ? 'datetime-local' : field.kind}
              disabled={readOnly}
              required={required}
              value={textOf(field.name)}
              onChange={(event) => setScalar(field.name, event.target.value || null)}
            />
          );

        case 'tags':
          return (
            <Input
              id={id}
              name={field.name}
              disabled={readOnly}
              value={textOf(field.name)}
              onChange={(event) => setScalar(field.name, event.target.value)}
            />
          );

        default:
          return (
            <Input
              id={id}
              name={field.name}
              type={field.kind === 'url' ? 'url' : 'text'}
              disabled={readOnly}
              required={required}
              value={textOf(field.name)}
              onChange={(event) => setScalar(field.name, event.target.value)}
            />
          );
      }
    })();

    return (
      <div key={field.name} className={wide ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
        {field.kind !== 'checkbox' ? label : null}
        {control}
        {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
      </div>
    );
  };

  const buttons = [
    { intent: 'draft', text: labels.saveDraft, variant: 'secondary', show: true },
    { intent: 'preview', text: labels.preview, variant: 'outline', show: true },
    { intent: 'review', text: labels.submitReview, variant: 'outline', show: init.needsReview },
    { intent: 'publish', text: labels.publish, variant: 'default', show: init.canPublish },
  ] as const;

  return (
    <MediaPickerProvider labels={mediaPickerLabels(locale)}>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="type" value={init.typeKey} />
        {init.itemId ? <input type="hidden" name="itemId" value={init.itemId} /> : null}
        <input type="hidden" name="intent" value="draft" readOnly ref={intentInput} />

        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {labels.statusNow}: <StatusPill status={init.status} label={statusLabel(locale, init.status)} className="ml-1 align-middle" />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {labels.revision} {init.revision}
              {savedAt ? ` · ${labels.lastSaved}: ${savedAt}` : ''}
            </p>
          </div>
          <div className="ml-auto flex min-w-56 items-center gap-4">
            <div className="w-40">
              <p className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{labels.seoFilled}</span>
                <span>{seoPercent}%</span>
              </p>
              <Progress value={seoPercent} />
            </div>
            {seoMissing.length ? (
              <p className="max-w-52 text-right text-[11px] text-muted-foreground">
                {seoMissing.join(', ')}
              </p>
            ) : null}
          </div>
        </div>

        {isScheduled ? <p className="text-xs text-violet-700 dark:text-violet-400">{labels.scheduledNote}</p> : null}
        {readOnly ? <p className="text-sm text-muted-foreground">{labels.noEditRight}</p> : null}

        {SECTION_ORDER.map((section) => {
          const fields = fieldsBySection.get(section) ?? [];
          if (!fields.length) return null;
          const isSeo = section === 'seo';
          return (
            <Card key={section}>
              <CardContent className="pt-5">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-sm font-semibold">
                  {isSeo ? <Star className="size-4 text-[oklch(0.72_0.13_85)]" /> : null}
                  {labels.sections[section]}
                </h2>
                <div className="grid gap-5 sm:grid-cols-2">{fields.map(renderField)}</div>
              </CardContent>
            </Card>
          );
        })}

        {state.error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.ok}</p> : null}

        {!readOnly ? (
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            {buttons
              .filter((button) => button.show)
              .map((button) => (
                <Button
                  key={button.intent}
                  type="submit"
                  variant={button.variant}
                  disabled={pending}
                  onClick={() => chooseIntent(button.intent)}
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {button.text}
                </Button>
              ))}
            <Button type="button" variant="ghost" className="ml-auto" onClick={() => router.push(`/admin/${init.typeKey}`)}>
              {labels.back}
            </Button>
          </div>
        ) : null}
      </form>
    </MediaPickerProvider>
  );
}
