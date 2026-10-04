'use client';

import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import { ImageBlock } from './image-block';

/**
 * StarterKit already bundles Link and Underline, so configuring them here is the only way to
 * avoid registering the same extension twice.
 */
export function buildExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
    }),
    TableKit.configure({ table: { resizable: true } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Youtube.configure({
      nocookie: true,
      width: 640,
      height: 360,
      HTMLAttributes: { class: 'tiptap-video' },
    }),
    Placeholder.configure({ placeholder }),
    ImageBlock,
  ];
}
