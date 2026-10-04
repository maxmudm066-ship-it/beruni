'use client';

import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { MediaPickerProvider, useMediaPicker } from '@/components/admin/media/media-picker';
import type { PickedMedia } from '@/components/admin/media/media-types';
import { Button } from '@/components/ui/button';

export interface ImageFieldLabels {
  pick: string;
  change: string;
  remove: string;
  title: string;
}

function Picker({
  value,
  onChange,
  labels,
}: {
  value: PickedMedia | null;
  onChange: (value: PickedMedia | null) => void;
  labels: ImageFieldLabels;
}) {
  const { pick } = useMediaPicker();

  const choose = async () => {
    const [asset] = await pick({ kinds: ['image'], title: labels.title, selected: value ? [value] : undefined });
    if (asset) onChange(asset);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {value ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={value.thumbUrl}
          alt={value.altText ?? ''}
          className="size-24 shrink-0 rounded-md border object-cover"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => void choose()}>
          <ImagePlus />
          {value ? labels.change : labels.pick}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X />
            {labels.remove}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One image from the Media Library, posted as a single hidden field holding the file id.
 * The picker dialog is the same one material forms use, so uploading works from here too.
 */
export function ImageField({
  name,
  value,
  labels,
  pickerLabels,
}: {
  name: string;
  value: PickedMedia | null;
  labels: ImageFieldLabels;
  pickerLabels: Parameters<typeof MediaPickerProvider>[0]['labels'];
}) {
  const [current, setCurrent] = useState<PickedMedia | null>(value);

  return (
    <MediaPickerProvider labels={pickerLabels}>
      <input type="hidden" name={name} value={current?.id ?? ''} />
      <Picker value={current} onChange={setCurrent} labels={labels} />
    </MediaPickerProvider>
  );
}
