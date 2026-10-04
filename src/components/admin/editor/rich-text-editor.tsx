'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Code,
  Columns3,
  FileText,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Redo2,
  Rows3,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
  Unlink,
  Video,
  X,
} from 'lucide-react';
import { buildExtensions } from './extensions';
import { setImageBlockLabels } from './image-block';
import './editor.css';
import { useMediaPicker } from '@/components/admin/media/media-picker';
import type { EditorLabels } from '@/lib/admin/labels';
import { isValidYoutubeUrl } from '@tiptap/extension-youtube';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  onChange: (html: string) => void;
  labels: EditorLabels;
  disabled?: boolean;
  name?: string;
}

function ToolButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title} aria-pressed={active} data-active={active ? 'true' : undefined} className="tiptap-toolbar-button">
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, labels, disabled = false, name }: Props) {
  const { pick } = useMediaPicker();
  const [panel, setPanel] = useState<'none' | 'link' | 'video'>('none');
  const [draftUrl, setDraftUrl] = useState('');
  const [videoError, setVideoError] = useState(false);
  const lastPushed = useRef(value ?? '');

  useEffect(() => {
    setImageBlockLabels({
      pick: labels.image,
      replace: labels.replace,
      caption: labels.caption,
      alt: labels.imageHint,
      remove: labels.remove,
      alignLeft: labels.alignLeft,
      alignCenter: labels.alignCenter,
      alignRight: labels.alignRight,
    });
  }, [labels]);

  const editor = useEditor({
    extensions: buildExtensions(labels.placeholder),
    content: value ?? '',
    editable: !disabled,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'tiptap', 'aria-label': name ?? labels.placeholder } },
    onUpdate: ({ editor: instance }) => {
      lastPushed.current = instance.getHTML();
      onChange(lastPushed.current);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || value === lastPushed.current) return;
    lastPushed.current = value ?? '';
    editor.commands.setContent(value ?? '', { emitUpdate: false });
  }, [value, editor]);

  const insertImage = useCallback(async () => {
    if (!editor) return;
    const [asset] = await pick({ kinds: ['image'], title: labels.pickerTitle });
    if (!asset) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: 'imageBlock', attrs: { src: asset.publicUrl, alt: asset.altText ?? asset.originalName, mediaId: asset.id } })
      .run();
  }, [editor, pick, labels.pickerTitle]);

  const insertFile = useCallback(async () => {
    if (!editor) return;
    const [asset] = await pick({ kinds: ['document', 'video'], title: labels.pickerTitle });
    if (!asset) return;
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'paragraph' },
        { type: 'text', text: asset.originalName, marks: [{ type: 'link', attrs: { href: asset.publicUrl, target: '_blank', rel: 'noopener noreferrer' } }] },
      ])
      .run();
  }, [editor, pick, labels.pickerTitle]);

  const applyLink = () => {
    if (!editor) return;
    const href = draftUrl.trim();
    if (!href) return editor.chain().focus().unsetLink().run();
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: href.startsWith('http') || href.startsWith('/') ? href : `https://${href}`, target: '_blank', rel: 'noopener noreferrer' })
      .run();
    setPanel('none');
    setDraftUrl('');
  };

  const applyVideo = () => {
    if (!editor) return;
    const src = draftUrl.trim();
    if (!isValidYoutubeUrl(src)) {
      setVideoError(true);
      return;
    }
    editor.chain().focus().setYoutubeVideo({ src, width: 640, height: 360 }).run();
    setPanel('none');
    setDraftUrl('');
    setVideoError(false);
  };

  const openPanel = (next: 'link' | 'video') => {
    if (!editor) return;
    setDraftUrl(next === 'link' ? (editor.getAttributes('link').href ?? '') : '');
    setVideoError(false);
    setPanel(panel === next ? 'none' : next);
  };

  if (!editor) {
    return <div className="tiptap-editor"><div className="min-h-[22rem] px-3.5 py-3 text-sm text-muted-foreground">{labels.placeholder}</div></div>;
  }

  const stats = statsFor(editor);

  return (
    <div className="tiptap-editor">
      <div className="tiptap-toolbar">
        <div className="tiptap-toolbar-group">
          <select
            aria-label={labels.paragraph}
            className="h-7 rounded border border-input bg-transparent px-1.5 text-xs"
            value={
              editor.isActive('heading', { level: 1 }) ? '1'
                : editor.isActive('heading', { level: 2 }) ? '2'
                : editor.isActive('heading', { level: 3 }) ? '3'
                : editor.isActive('heading', { level: 4 }) ? '4'
                : '0'
            }
            onChange={(event) => {
              const level = Number(event.target.value);
              const chain = editor.chain().focus();
              if (level === 0) chain.setParagraph().run();
              else chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run();
            }}
          >
            <option value="0">{labels.paragraph}</option>
            {labels.headings.map((label, index) => (
              <option key={label} value={String(index + 1)}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <span className="tiptap-toolbar-sep" />

        <div className="tiptap-toolbar-group">
          <ToolButton title={labels.bold} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></ToolButton>
          <ToolButton title={labels.italic} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></ToolButton>
          <ToolButton title={labels.underline} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline /></ToolButton>
          <ToolButton title={labels.strike} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough /></ToolButton>
          <ToolButton title={labels.code} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}><Code /></ToolButton>
        </div>

        <span className="tiptap-toolbar-sep" />

        <div className="tiptap-toolbar-group">
          <ToolButton title={labels.bulletList} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List /></ToolButton>
          <ToolButton title={labels.orderedList} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolButton>
          <ToolButton title={labels.quote} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote /></ToolButton>
          <ToolButton title={labels.codeBlock} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode /></ToolButton>
        </div>

        <span className="tiptap-toolbar-sep" />

        <div className="tiptap-toolbar-group">
          <ToolButton title={labels.alignLeft} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft /></ToolButton>
          <ToolButton title={labels.alignCenter} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter /></ToolButton>
          <ToolButton title={labels.alignRight} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight /></ToolButton>
          <ToolButton title={labels.alignJustify} active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify /></ToolButton>
        </div>

        <span className="tiptap-toolbar-sep" />

        <div className="tiptap-toolbar-group">
          <ToolButton title={labels.link} active={editor.isActive('link') || panel === 'link'} onClick={() => openPanel('link')}><Link2 /></ToolButton>
          <ToolButton title={labels.unlink} disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()}><Unlink /></ToolButton>
          <ToolButton title={labels.image} onClick={() => void insertImage()}><Plus /></ToolButton>
          <ToolButton title={labels.video} active={panel === 'video'} onClick={() => openPanel('video')}><Video /></ToolButton>
          <ToolButton title={labels.file} onClick={() => void insertFile()}><FileText /></ToolButton>
          <ToolButton title={labels.divider} onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus /></ToolButton>
        </div>

        <span className="tiptap-toolbar-sep" />

        <div className="tiptap-toolbar-group">
          {editor.isActive('table') ? (
            <>
              <ToolButton title={labels.addRow} onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 /></ToolButton>
              <ToolButton title={labels.addColumn} onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 /></ToolButton>
              <ToolButton title={labels.deleteTable} onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 /></ToolButton>
            </>
          ) : (
            <ToolButton
              title={labels.table}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              }
            >
              <TableIcon />
            </ToolButton>
          )}
        </div>

        <span className="tiptap-toolbar-sep" />

        <div className="tiptap-toolbar-group">
          <ToolButton title={labels.undo} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 /></ToolButton>
          <ToolButton title={labels.redo} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 /></ToolButton>
        </div>
      </div>

      {panel !== 'none' ? (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Input
            autoFocus
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (panel === 'link') applyLink();
                else applyVideo();
              }
              if (event.key === 'Escape') setPanel('none');
            }}
            placeholder={panel === 'link' ? labels.linkHint : labels.videoHint}
            className="h-8 text-sm"
          />
          <Button type="button" size="sm" onClick={panel === 'link' ? applyLink : applyVideo}>
            <Check />
            {labels.apply}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPanel('none')}>
            <X />
          </Button>
          {videoError ? <span className="text-xs text-destructive">{labels.videoBad}</span> : null}
        </div>
      ) : null}

      <EditorContent editor={editor} />

      <div className="tiptap-status">
        <span>
          {stats.words} {labels.words} · {stats.characters} {labels.characters}
        </span>
      </div>
    </div>
  );
}

function statsFor(editor: Editor) {
  const text = editor.getText();
  const trimmed = text.trim();
  return {
    characters: text.length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
  };
}
