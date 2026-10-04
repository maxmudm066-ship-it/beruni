'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, FolderOpen, Loader2, Search, Upload } from 'lucide-react';
import { formatBytes, type MediaFolderOption, type MediaKind, type PickedMedia } from './media-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from 'cn';

export interface PickerOptions {
  multiple?: boolean;
  kinds?: MediaKind[];
  title?: string;
  selected?: PickedMedia[];
}

type Resolve = (items: PickedMedia[]) => void;

const MediaPickerContext = createContext<{ pick: (options?: PickerOptions) => Promise<PickedMedia[]> } | null>(null);

export function useMediaPicker() {
  const value = useContext(MediaPickerContext);
  if (!value) throw new Error('useMediaPicker must be used inside <MediaPickerProvider>');
  return value;
}

/**
 * Tiptap renders node views in their own React tree, so they cannot read app context.
 * The provider publishes its `pick` here and the image block calls it from the bridge.
 */
let bridge: ((options?: PickerOptions) => Promise<PickedMedia[]>) | null = null;

export function pickMedia(options?: PickerOptions): Promise<PickedMedia[]> {
  return bridge ? bridge(options) : Promise.resolve([]);
}

const KIND_TABS: { key: 'all' | MediaKind; labelKey: 'all' | 'images' | 'documents' | 'videos' }[] = [
  { key: 'all', labelKey: 'all' },
  { key: 'image', labelKey: 'images' },
  { key: 'document', labelKey: 'documents' },
  { key: 'video', labelKey: 'videos' },
];

export type MediaPickerLabels = Record<
  | 'title'
  | 'search'
  | 'upload'
  | 'empty'
  | 'choose'
  | 'cancel'
  | 'confirm'
  | 'selected'
  | 'allFolders'
  | 'uploading'
  | 'uploadFailed'
  | 'loadMore'
  | 'all'
  | 'images'
  | 'documents'
  | 'videos',
  string
>;

export function MediaPickerProvider({ children, labels }: { children: ReactNode; labels: MediaPickerLabels }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Required<Pick<PickerOptions, 'multiple'>> & PickerOptions>({} as never);
  const resolver = useRef<Resolve | null>(null);

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | MediaKind>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<PickedMedia[]>([]);
  const [folders, setFolders] = useState<MediaFolderOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [picked, setPicked] = useState<Map<string, PickedMedia>>(new Map());
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (mode: 'replace' | 'append') => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ take: '60' });
        if (query.trim()) params.set('q', query.trim());
        if (kind !== 'all') params.set('kind', kind);
        if (folderId) params.set('folderId', folderId);
        const response = await fetch(`/api/admin/media?${params.toString()}`);
        if (!response.ok) return;
        const data = (await response.json()) as { items: PickedMedia[]; total: number };
        setItems((current) => (mode === 'append' ? [...current, ...data.items] : data.items));
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    },
    [query, kind, folderId],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => load('replace'), 220);
    return () => clearTimeout(timer);
  }, [open, load]);

  useEffect(() => {
    if (!open || folders.length) return;
    void (async () => {
      const response = await fetch('/api/admin/media/folders');
      if (response.ok) setFolders(((await response.json()) as { folders: MediaFolderOption[] }).folders);
    })();
  }, [open, folders.length]);

  const pick = useCallback((next: PickerOptions = {}) => {
    setOptions({ multiple: next.multiple ?? false, ...next });
    setPicked(new Map((next.selected ?? []).map((item) => [item.id, item])));
    setQuery('');
    setKind(next.kinds?.length === 1 ? next.kinds[0] : 'all');
    setFolderId(null);
    setOpen(true);
    return new Promise<PickedMedia[]>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const value = useMemo(() => ({ pick }), [pick]);

  useEffect(() => {
    bridge = pick;
    return () => {
      if (bridge === pick) bridge = null;
    };
  }, [pick]);

  const close = (result: PickedMedia[]) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  const toggle = (item: PickedMedia) => {
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else if (options.multiple) next.set(item.id, item);
      else {
        next.clear();
        next.set(item.id, item);
      }
      return next;
    });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        const response = await fetch('/api/admin/media', { method: 'POST', body });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          window.alert(data.error ?? labels.uploadFailed);
          continue;
        }
        const { media } = (await response.json()) as { media: PickedMedia };
        setItems((current) => [media, ...current]);
        setPicked((current) => {
          const next = new Map(current);
          if (!options.multiple) next.clear();
          next.set(media.id, media);
          return next;
        });
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const selected = useMemo(() => Array.from(picked.values()), [picked]);

  return (
    <MediaPickerContext.Provider value={value}>
      {children}

      <Dialog open={open} onOpenChange={(next) => !next && close([])}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{options.title ?? labels.title}</DialogTitle>
            <DialogDescription className="sr-only">{labels.search}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.search}
                className="pl-8"
              />
            </div>

            <input ref={fileInput} type="file" multiple={options.multiple} className="hidden" onChange={(event) => void upload(event.target.files)} />
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {uploading ? labels.uploading : labels.upload}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {KIND_TABS.filter((tab) => !options.kinds?.length || options.kinds.includes(tab.key as MediaKind)).map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  variant={kind === tab.key ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setKind(tab.key)}
                >
                  {labels[tab.labelKey]}
                </Button>
              ))}
            </div>

            {folders.length > 0 ? (
              <div className="ml-auto flex items-center gap-2">
                <FolderOpen className="size-4 text-muted-foreground" />
                <select
                  value={folderId ?? ''}
                  onChange={(event) => setFolderId(event.target.value || null)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">{labels.allFolders}</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.path}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <ScrollArea className="h-[26rem]">
            {loading && items.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-square rounded-lg" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{labels.empty}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => {
                  const isSelected = picked.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggle(item)}
                        className={cn(
                          'group relative w-full overflow-hidden rounded-lg border text-left transition',
                          isSelected ? 'border-primary ring-2 ring-ring/40' : 'border-input hover:border-foreground/40',
                        )}
                      >
                        <span className="flex aspect-square items-center justify-center bg-muted">
                          {item.kind === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbUrl} alt={item.altText ?? item.originalName} className="size-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex flex-col items-center gap-1 px-2 text-center">
                              <span className="rounded bg-background px-2 py-1 font-mono text-[10px] uppercase">{item.filename.split('.').pop()}</span>
                              <span className="line-clamp-2 text-[11px] text-muted-foreground">{item.originalName}</span>
                            </span>
                          )}
                        </span>

                        <span className="block px-2 py-1.5">
                          <span className="line-clamp-1 text-xs font-medium">{item.originalName}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                            {formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </span>

                        {isSelected ? (
                          <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-4" />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {items.length > 0 && items.length < total ? (
              <Button type="button" variant="ghost" size="sm" className="mt-3 w-full" disabled={loading} onClick={() => void load('append')}>
                {loading ? <Loader2 className="animate-spin" /> : null}
                {labels.loadMore}
              </Button>
            ) : null}
          </ScrollArea>

          <p className="text-xs text-muted-foreground">
            {selected.length ? `${labels.selected}: ${selected.length}` : labels.choose}
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close([])}>
              {labels.cancel}
            </Button>
            <Button type="button" disabled={selected.length === 0} onClick={() => close(selected)}>
              {labels.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MediaPickerContext.Provider>
  );
}
