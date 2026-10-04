'use client';

import { ChevronDown, ChevronUp, Download, Eye, ImagePlus, Paperclip, X } from 'lucide-react';
import { formatBytes, type PickedMedia } from './media-types';
import { useMediaPicker } from './media-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MediaFieldValue } from '@/lib/content/form-types';

export interface MediaFieldLabels {
  pick: string;
  change: string;
  remove: string;
  caption: string;
  alt: string;
  preview: string;
  download: string;
  uploadedOn: string;
  size: string;
}

function Summary({ item }: { item: PickedMedia }) {
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {item.mimeType} · {formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString()}
      {item.altText ? (
        <>
          <br />
          ALT: {item.altText}
        </>
      ) : null}
    </p>
  );
}

export function MainImageField({
  value,
  onChange,
  labels,
}: {
  value: MediaFieldValue | null;
  onChange: (value: MediaFieldValue | null) => void;
  labels: MediaFieldLabels;
}) {
  const { pick } = useMediaPicker();

  const choose = async () => {
    const [asset] = await pick({ kinds: ['image'], title: labels.pick, selected: value ? [value.asset] : undefined });
    if (asset) onChange({ asset, caption: value?.asset.id === asset.id ? value.caption : asset.caption ?? '' });
  };

  if (!value) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void choose()}>
        <ImagePlus />
        {labels.pick}
      </Button>
    );
  }

  return (
    <div className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value.asset.thumbUrl} alt={value.asset.altText ?? ''} className="size-24 shrink-0 rounded-md border object-cover" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => void choose()}>
            {labels.change}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X />
            {labels.remove}
          </Button>
        </div>
        <Input
          value={value.caption}
          onChange={(event) => onChange({ ...value, caption: event.target.value })}
          placeholder={labels.caption}
          aria-label={labels.caption}
          className="h-8 text-sm"
        />
        <Summary item={value.asset} />
      </div>
    </div>
  );
}

export function GalleryField({
  value,
  onChange,
  labels,
}: {
  value: MediaFieldValue[];
  onChange: (value: MediaFieldValue[]) => void;
  labels: MediaFieldLabels;
}) {
  const { pick } = useMediaPicker();

  const add = async () => {
    const picked = await pick({ kinds: ['image'], multiple: true, title: labels.pick, selected: value.map((entry) => entry.asset) });
    const merged = [...value];
    for (const asset of picked) {
      const existing = merged.find((entry) => entry.asset.id === asset.id);
      if (existing) existing.caption = asset.caption ?? existing.caption;
      else merged.push({ asset, caption: asset.caption ?? '' });
    }
    onChange(merged);
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void add()}>
        <ImagePlus />
        {labels.pick}
      </Button>

      {value.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {value.map((entry, index) => (
            <li key={entry.asset.id} className="flex gap-2 rounded-md border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.asset.thumbUrl} alt={entry.asset.altText ?? ''} className="size-16 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input
                  value={entry.caption}
                  onChange={(event) => onChange(value.map((item, position) => (position === index ? { ...item, caption: event.target.value } : item)))}
                  placeholder={labels.caption}
                  aria-label={labels.caption}
                  className="h-7 text-xs"
                />
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="size-7" title={labels.uploadedOn} onClick={() => move(index, -1)} disabled={index === 0}>
                    <ChevronUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => move(index, 1)} disabled={index === value.length - 1}>
                    <ChevronDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7 ml-auto" onClick={() => onChange(value.filter((item) => item.asset.id !== entry.asset.id))}>
                    <X />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AttachmentsField({
  value,
  onChange,
  labels,
}: {
  value: MediaFieldValue[];
  onChange: (value: MediaFieldValue[]) => void;
  labels: MediaFieldLabels;
}) {
  const { pick } = useMediaPicker();

  const add = async () => {
    const picked = await pick({ kinds: ['document', 'video'], multiple: true, title: labels.pick, selected: value.map((entry) => entry.asset) });
    const merged = [...value];
    for (const asset of picked) {
      if (!merged.some((entry) => entry.asset.id === asset.id)) merged.push({ asset, caption: asset.title ?? '' });
    }
    onChange(merged);
  };

  /** Swapping the file keeps the material URL untouched, which is what the requirements ask for. */
  const replace = async (index: number) => {
    const [asset] = await pick({ kinds: ['document', 'video'], title: labels.change });
    if (asset) onChange(value.map((entry, position) => (position === index ? { asset, caption: entry.caption } : entry)));
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void add()}>
        <Paperclip />
        {labels.pick}
      </Button>

      {value.length ? (
        <ul className="divide-y rounded-md border">
          {value.map((entry, index) => (
            <li key={entry.asset.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.asset.originalName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatBytes(entry.asset.sizeBytes)} · {entry.asset.mimeType} · {new Date(entry.asset.createdAt).toLocaleString()}
                </p>
              </div>
              <a href={entry.asset.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                <Eye className="size-3.5" />
                {labels.preview}
              </a>
              <a href={`${entry.asset.publicUrl}?download=1`} download className="inline-flex items-center gap-1 text-xs underline">
                <Download className="size-3.5" />
                {labels.download}
              </a>
              <Button type="button" variant="ghost" size="sm" onClick={() => void replace(index)}>
                {labels.change}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onChange(value.filter((item) => item.asset.id !== entry.asset.id))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
