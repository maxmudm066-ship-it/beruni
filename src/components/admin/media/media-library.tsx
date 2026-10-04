'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatBytes, type MediaFolderOption, type MediaKind, type PickedMedia } from './media-types';
import type { MediaLibraryLabels } from '@/lib/admin/labels';
import { cn } from '@/lib/utils';

export interface MediaLibraryInit {
  items: PickedMedia[];
  total: number;
  counts: Record<string, number>;
  folders: MediaFolderOption[];
  filters: { q: string; kind: string; folderId: string; status: string };
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const PAGE = 60;

const KIND_TABS: { key: string; label: keyof MediaLibraryLabels }[] = [
  { key: '', label: 'all' },
  { key: 'image', label: 'images' },
  { key: 'document', label: 'documents' },
  { key: 'video', label: 'videos' },
];

function StatusBadge({ item, labels }: { item: PickedMedia; labels: MediaLibraryLabels }) {
  if (item.status === 'failed') return <Badge variant="destructive">{labels.statusFailed}</Badge>;
  if (item.status === 'processing') return <Badge variant="outline">{labels.statusProcessing}</Badge>;
  return <Badge variant="secondary">{labels.statusReady}</Badge>;
}

export function MediaLibrary({ init, labels }: { init: MediaLibraryInit; labels: MediaLibraryLabels }) {
  const [items, setItems] = useState(init.items);
  const [total, setTotal] = useState(init.total);
  const [counts, setCounts] = useState(init.counts);
  const [folders, setFolders] = useState(init.folders);
  const [filters, setFilters] = useState(init.filters);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<PickedMedia | null>(null);
  const [draft, setDraft] = useState({ altText: '', title: '', caption: '' });
  const [saving, setSaving] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (mode: 'replace' | 'append', override?: Partial<typeof filters>) => {
      setLoading(true);
      try {
        const merged = { ...filters, ...override };
        const params = new URLSearchParams({ take: String(PAGE) });
        if (merged.q.trim()) params.set('q', merged.q.trim());
        if (merged.kind) params.set('kind', merged.kind);
        if (merged.folderId) params.set('folderId', merged.folderId);
        if (merged.status) params.set('status', merged.status);
        if (mode === 'append') params.set('skip', String(items.length));

        const response = await fetch(`/api/admin/media?${params.toString()}`);
        if (!response.ok) return;
        const data = (await response.json()) as { items: PickedMedia[]; total: number; counts: Record<string, number> };
        setItems((current) => (mode === 'append' ? [...current, ...data.items] : data.items));
        setTotal(data.total);
        setCounts(data.counts);
      } finally {
        setLoading(false);
      }
    },
    [filters, items.length],
  );

  const debouncedSearch = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debouncedSearch.current) clearTimeout(debouncedSearch.current);
    debouncedSearch.current = setTimeout(() => void load('replace'), 320);
    return () => {
      if (debouncedSearch.current) clearTimeout(debouncedSearch.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.kind, filters.folderId, filters.status]);

  const setFilter = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }));

  const upload = useCallback(
    async (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : [];
      if (!list.length) return;
      setUploading(true);
      let ok = 0;
      for (const file of list) {
        const body = new FormData();
        body.append('file', file);
        if (filters.folderId) body.append('folderId', filters.folderId);
        const response = await fetch('/api/admin/media', { method: 'POST', body });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? `${labels.uploadFailed} ${file.name}`);
          continue;
        }
        const { media } = (await response.json()) as { media: PickedMedia };
        setItems((current) => [media, ...current]);
        setTotal((current) => current + 1);
        ok += 1;
      }
      setUploading(false);
      if (ok) toast.success(`${labels.uploadedNow} (${ok})`);
      if (fileInput.current) fileInput.current.value = '';
    },
    [filters.folderId, labels.uploadFailed, labels.uploadedNow],
  );

  const togglePick = (item: PickedMedia) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const openDetail = (item: PickedMedia) => {
    setDetail(item);
    setDraft({ altText: item.altText ?? '', title: item.title ?? '', caption: item.caption ?? '' });
  };

  const saveDetail = async () => {
    if (!detail) return;
    setSaving(true);
    const response = await fetch(`/api/admin/media/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ altText: draft.altText, title: draft.title, caption: draft.caption }),
    });
    setSaving(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? labels.uploadFailed);
      return;
    }
    const { media } = (await response.json()) as { media: PickedMedia };
    setItems((current) => current.map((item) => (item.id === media.id ? media : item)));
    setDetail(media);
    toast.success(labels.saved);
  };

  const replaceFile = async (file: File | undefined) => {
    if (!file || !detail) return;
    setBusy(detail.id);
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`/api/admin/media/${detail.id}`, { method: 'POST', body });
    setBusy(null);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? labels.uploadFailed);
      return;
    }
    const { media } = (await response.json()) as { media: PickedMedia };
    setItems((current) => current.map((item) => (item.id === media.id ? media : item)));
    setDetail(media);
    toast.success(labels.saved);
    if (replaceInput.current) replaceInput.current.value = '';
  };

  const remove = async (ids: string[]) => {
    let removed = 0;
    for (const id of ids) {
      setBusy(id);
      const response = await fetch(`/api/admin/media/${id}`, { method: 'DELETE' });
      setBusy(null);
      if (response.status === 409) {
        toast.error(labels.deleteBlocked);
        continue;
      }
      if (!response.ok) {
        toast.error(labels.uploadFailed);
        continue;
      }
      removed += 1;
      setItems((current) => current.filter((item) => item.id !== id));
      setSelection((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setDetail((current) => (current && current.id === id ? null : current));
    }
    if (removed) toast.success(`${labels.deleted} (${removed})`);
  };

  const moveSelected = async (folderId: string) => {
    const ids = Array.from(selection);
    if (!ids.length) return;
    setBusy(ids[0]);
    let moved = 0;
    for (const id of ids) {
      const response = await fetch(`/api/admin/media/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      if (response.ok) moved += 1;
    }
    setBusy(null);
    if (moved < ids.length) toast.error(labels.uploadFailed);
    else toast.success(labels.saved);
    if (!moved) return;
    setSelection(new Set());
    void load('replace');
  };

  const createFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    const response = await fetch('/api/admin/media/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId: filters.folderId || null }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? labels.uploadFailed);
      return;
    }
    const { folder } = (await response.json()) as { folder: { id: string; name: string; parentId: string | null } };
    const parent = folders.find((entry) => entry.id === folder.parentId);
    setFolders((current) => [...current, { ...folder, path: parent ? `${parent.path}/${folder.name}` : folder.name }]);
    setNewFolder('');
  };

  const copyUrl = async (item: PickedMedia) => {
    const url = new URL(item.publicUrl, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success(labels.copied);
    } catch {
      toast.error(url);
    }
  };

  const selectedCount = selection.size;
  const shownCounts = useMemo(
    () => ({ all: counts.all ?? 0, failed: counts.failed ?? 0 }),
    [counts],
  );

  return (
    <div
      className="grid gap-5 lg:grid-cols-[14rem_1fr]"
      onDragOver={(event) => {
        if (!init.canUpload) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        if (!init.canUpload) return;
        event.preventDefault();
        setDragOver(false);
        void upload(event.dataTransfer.files);
      }}
    >
      <aside className="space-y-4">
        <div className="rounded-lg border p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="size-3.5" />
            {labels.folders}
          </p>
          <ul className="space-y-0.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => setFilter({ folderId: '' })}
                className={cn('w-full truncate rounded px-2 py-1 text-left hover:bg-muted', !filters.folderId && 'bg-muted font-medium')}
              >
                {labels.allFolders}
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setFilter({ folderId: 'none' })}
                className={cn('w-full truncate rounded px-2 py-1 text-left hover:bg-muted', filters.folderId === 'none' && 'bg-muted font-medium')}
              >
                {labels.noFolder}
              </button>
            </li>
            {folders.map((folder) => (
              <li key={folder.id}>
                <button
                  type="button"
                  onClick={() => setFilter({ folderId: folder.id })}
                  className={cn('w-full truncate rounded px-2 py-1 pl-4 text-left text-xs hover:bg-muted', filters.folderId === folder.id && 'bg-muted font-medium')}
                >
                  {folder.path}
                </button>
              </li>
            ))}
          </ul>

          {init.canEdit ? (
            <div className="mt-3 flex gap-1.5">
              <Input
                value={newFolder}
                onChange={(event) => setNewFolder(event.target.value)}
                placeholder={labels.folderName}
                aria-label={labels.folderName}
                className="h-8 text-sm"
              />
              <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" title={labels.createFolder} onClick={() => void createFolder()}>
                <FolderPlus />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{labels.count}: {shownCounts.all}</p>
          <button type="button" className="hover:underline" onClick={() => setFilter({ status: 'failed' })}>
            {labels.statusFailed}: {shownCounts.failed}
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filters.q} onChange={(event) => setFilter({ q: event.target.value })} placeholder={labels.search} aria-label={labels.search} className="pl-8" />
          </div>

          <select
            value={filters.status}
            onChange={(event) => setFilter({ status: event.target.value })}
            aria-label={labels.allStatuses}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">{labels.allStatuses}</option>
            <option value="ready">{labels.statusReady}</option>
            <option value="processing">{labels.statusProcessing}</option>
            <option value="failed">{labels.statusFailed}</option>
          </select>

          {init.canUpload ? (
            <>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
              <Button type="button" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {uploading ? labels.uploading : labels.upload}
              </Button>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {KIND_TABS.map((tab) => {
            const active = filters.kind === tab.key;
            const count = tab.key ? (counts[tab.key as MediaKind] ?? 0) : (counts.all ?? 0);
            return (
              <Button key={tab.key || 'all'} type="button" variant={active ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter({ kind: tab.key })}>
                {labels[tab.label]}
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>
              </Button>
            );
          })}

          <span className="ml-auto text-xs text-muted-foreground">{total}</span>
        </div>

        {dragOver ? (
          <p className="rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 px-4 py-8 text-center text-sm text-muted-foreground">
            {labels.dropHere}
          </p>
        ) : null}

        {items.length === 0 && !loading ? (
          <p className="rounded-lg border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => {
              const isSelected = selection.has(item.id);
              return (
                <li key={item.id} className={cn('relative overflow-hidden rounded-lg border transition', isSelected ? 'border-primary ring-2 ring-ring/40' : 'border-input hover:border-foreground/30')}>
                  <button type="button" onClick={() => openDetail(item)} className="block w-full text-left">
                    <span className="flex aspect-square items-center justify-center bg-muted">
                      {item.kind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbUrl} alt={item.altText ?? item.originalName} loading="lazy" className="size-full object-cover" />
                      ) : (
                        <span className="flex flex-col items-center gap-1.5 px-2 text-center">
                          <FileText className="size-7 text-muted-foreground" />
                          <span className="rounded bg-background px-2 py-0.5 font-mono text-[10px] uppercase">{item.filename.split('.').pop()}</span>
                        </span>
                      )}
                    </span>
                    <span className="block px-2 py-1.5">
                      <span className="line-clamp-1 text-xs font-medium">{item.originalName}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                        {formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => togglePick(item)}
                    aria-label={labels.selected}
                    className={cn(
                      'absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded border bg-background/90 text-muted-foreground transition hover:border-foreground/40',
                      isSelected && 'border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    {isSelected ? <Check className="size-4" /> : null}
                  </button>

                  {item.status === 'failed' ? (
                    <span className="absolute top-1.5 right-1.5 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                      {labels.statusFailed}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {items.length < total ? (
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={loading} onClick={() => void load('append')}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            {labels.loadMore}
          </Button>
        ) : null}

        {selectedCount > 0 ? (
          <div className="sticky bottom-4 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
            <span className="px-1 text-sm text-muted-foreground">
              {labels.selected}: {selectedCount}
            </span>

            {init.canEdit ? (
              <select
                aria-label={labels.moveSelected}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value=""
                onChange={(event) => void moveSelected(event.target.value === '__root' ? '' : event.target.value)}
              >
                <option value="" disabled>
                  {labels.moveSelected}…
                </option>
                <option value="__root">{labels.noFolder}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.path}
                  </option>
                ))}
              </select>
            ) : null}

            {init.canDelete ? (
              <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => void remove(Array.from(selection))}>
                <Trash2 />
                {labels.deleteSelected}
              </Button>
            ) : null}

            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setSelection(new Set())}>
              <X />
              {labels.clearSelection}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="truncate text-base">{detail.originalName}</DialogTitle>
                <DialogDescription className="truncate">{detail.filename}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {detail.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={detail.thumbUrl} alt={detail.altText ?? ''} className="max-h-64 w-full object-contain" />
                    ) : (
                      <FileText className="size-16 text-muted-foreground" />
                    )}
                  </div>

                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">{labels.fileType}</dt>
                    <dd>{detail.mimeType}</dd>
                    <dt className="text-muted-foreground">{labels.size}</dt>
                    <dd className="tabular-nums">{formatBytes(detail.sizeBytes)}</dd>
                    {detail.width ? (
                      <>
                        <dt className="text-muted-foreground">{labels.dimensions}</dt>
                        <dd className="tabular-nums">
                          {detail.width} × {detail.height}
                        </dd>
                      </>
                    ) : null}
                    <dt className="text-muted-foreground">{labels.uploadedOn}</dt>
                    <dd>{new Date(detail.createdAt).toLocaleString()}</dd>
                    <dt className="text-muted-foreground">{labels.variants}</dt>
                    <dd className="tabular-nums">{detail.variantCount ?? 0}</dd>
                    <dt className="text-muted-foreground">{labels.replaced}</dt>
                    <dd className="tabular-nums">{detail.replacedCount ?? 0}</dd>
                    <dt className="text-muted-foreground">{labels.usedIn}</dt>
                    <dd className="tabular-nums">{detail.usedIn ?? 0}</dd>
                  </dl>

                  <div className="flex items-center gap-2">
                    <StatusBadge item={detail} labels={labels} />
                    {detail.error ? <span className="truncate text-[11px] text-destructive">{detail.error}</span> : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <a href={detail.publicUrl} target="_blank" rel="noreferrer">
                      <Button type="button" variant="outline" size="sm">
                        <ExternalLink />
                        {labels.preview}
                      </Button>
                    </a>
                    <a href={`${detail.publicUrl}?download=1`} download>
                      <Button type="button" variant="outline" size="sm">
                        <Download />
                        {labels.download}
                      </Button>
                    </a>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void copyUrl(detail)}>
                      <Copy />
                      {labels.copyUrl}
                    </Button>
                  </div>
                </div>

                <ScrollArea className="max-h-[26rem] pr-3">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="media-alt">{labels.alt}</Label>
                      <Input
                        id="media-alt"
                        value={draft.altText}
                        disabled={!init.canEdit}
                        onChange={(event) => setDraft({ ...draft, altText: event.target.value })}
                        placeholder={labels.altHint}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="media-title">{labels.details}</Label>
                      <Input id="media-title" value={draft.title} disabled={!init.canEdit} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="media-caption">{labels.captionLabel}</Label>
                      <Input id="media-caption" value={draft.caption} disabled={!init.canEdit} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="media-folder">{labels.folders}</Label>
                      <select
                        id="media-folder"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                        value={detail.folderId ?? ''}
                        disabled={!init.canEdit}
                        onChange={async (event) => {
                          const value = event.target.value;
                          const response = await fetch(`/api/admin/media/${detail.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ folderId: value || null }),
                          });
                          if (!response.ok) return;
                          const { media } = (await response.json()) as { media: PickedMedia };
                          setDetail(media);
                          setItems((current) => current.map((item) => (item.id === media.id ? media : item)));
                        }}
                      >
                        <option value="">{labels.noFolder}</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.path}
                          </option>
                        ))}
                      </select>
                    </div>

                    {init.canEdit ? (
                      <Button type="button" size="sm" disabled={saving} onClick={() => void saveDetail()}>
                        {saving ? <Loader2 className="animate-spin" /> : <Save />}
                        {labels.save}
                      </Button>
                    ) : null}

                    {init.canUpload ? (
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">{labels.replaceKeepsUrl}</p>
                        <input ref={replaceInput} type="file" className="hidden" onChange={(event) => void replaceFile(event.target.files?.[0])} />
                        <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy === detail.id} onClick={() => replaceInput.current?.click()}>
                          {busy === detail.id ? <Loader2 className="animate-spin" /> : <Upload />}
                          {labels.replaceFile}
                        </Button>
                      </div>
                    ) : null}

                    {init.canDelete ? (
                      <div className="rounded-md border border-destructive/40 p-3">
                        <p className="text-xs text-muted-foreground">{labels.deleteConfirm}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 text-destructive"
                          disabled={busy === detail.id}
                          onClick={() => void remove([detail.id])}
                        >
                          <Trash2 />
                          {labels.deleteFile}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDetail(null)}>
                  {labels.cancel}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
