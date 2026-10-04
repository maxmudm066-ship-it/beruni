'use client';

import { Node, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { type CSSProperties } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, Trash2 } from 'lucide-react';
import { pickMedia } from '@/components/admin/media/media-picker';

export interface ImageBlockLabels {
  pick: string;
  replace: string;
  caption: string;
  alt: string;
  remove: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
}

const DEFAULT_LABELS: ImageBlockLabels = {
  pick: 'Image',
  replace: 'Replace',
  caption: 'Add a caption',
  alt: 'Describe the image',
  remove: 'Remove image',
  alignLeft: 'Left',
  alignCenter: 'Center',
  alignRight: 'Right',
};

/** Kept outside the component so the Tiptap node definition stays referentially stable. */
const labelsRef: { current: ImageBlockLabels } = { current: DEFAULT_LABELS };

export function setImageBlockLabels(labels: ImageBlockLabels) {
  labelsRef.current = labels;
}

const WIDTHS: (number | null)[] = [280, 480, 720, null];

function ImageBlockView({ node, editor, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const labels = labelsRef.current;
  const { src, alt, caption, align, width, mediaId } = node.attrs as Record<string, string | number | null>;

  const choose = async () => {
    const [asset] = await pickMedia({ kinds: ['image'], title: labels.pick });
    if (!asset) return;
    updateAttributes({
      src: asset.publicUrl,
      alt: asset.altText ?? asset.originalName,
      mediaId: asset.id,
    });
  };

  const cycleWidth = () => {
    const index = WIDTHS.indexOf(typeof width === 'number' ? width : null);
    updateAttributes({ width: WIDTHS[(index + 1) % WIDTHS.length] });
  };

  const style: CSSProperties = {
    textAlign: align as CSSProperties['textAlign'],
    maxWidth: width ? `${width}px` : undefined,
  };

  return (
    <NodeViewWrapper as="div" className="tiptap-figure-shell" data-selected={selected ? 'true' : undefined}>
      <figure data-image style={style}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={String(src)}
            alt={String(alt ?? '')}
            data-media-id={mediaId ? String(mediaId) : undefined}
          />
        ) : (
          <button type="button" onClick={choose} className="tiptap-figure-empty">
            <ImagePlus />
            {labels.pick}
          </button>
        )}

        <figcaption>
          <input
            value={String(caption ?? '')}
            onChange={(event) => updateAttributes({ caption: event.target.value })}
            placeholder={labels.caption}
            aria-label={labels.caption}
          />
        </figcaption>
      </figure>

      {selected && editor.isEditable ? (
        <div className="tiptap-figure-toolbar" contentEditable={false}>
          <button type="button" onClick={choose} title={labels.replace}>
            <ImagePlus />
          </button>
          <button type="button" onClick={() => updateAttributes({ align: 'left' })} title={labels.alignLeft}>
            <AlignLeft />
          </button>
          <button type="button" onClick={() => updateAttributes({ align: 'center' })} title={labels.alignCenter}>
            <AlignCenter />
          </button>
          <button type="button" onClick={() => updateAttributes({ align: 'right' })} title={labels.alignRight}>
            <AlignRight />
          </button>
          <button type="button" onClick={cycleWidth} title="Width">
            W
          </button>
          <button type="button" onClick={deleteNode} title={labels.remove} className="tiptap-figure-remove">
            <Trash2 />
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      caption: { default: '' },
      align: { default: 'center' },
      width: { default: null },
      mediaId: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-image]',
        getAttrs: (element) => {
          const figure = element as HTMLElement;
          const img = figure.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') ?? '',
            mediaId: img.getAttribute('data-media-id') ?? null,
            caption: figure.querySelector('figcaption')?.textContent?.trim() ?? '',
            align: figure.style.textAlign || 'center',
            width: figure.style.maxWidth ? Number.parseInt(figure.style.maxWidth, 10) : null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, caption, align, width, mediaId } = node.attrs as Record<string, string | number | null>;
    return [
      'figure',
      {
        'data-image': '',
        class: 'tiptap-figure',
        style: `text-align:${align ?? 'center'}${width ? `;max-width:${width}px` : ''}`,
      },
      ['img', { src, alt, ...(mediaId ? { 'data-media-id': String(mediaId) } : {}) }],
      ['figcaption', {}, caption ?? ''],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});
