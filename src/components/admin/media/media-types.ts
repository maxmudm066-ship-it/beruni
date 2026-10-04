export type MediaKind = 'image' | 'document' | 'video' | 'audio' | 'other';

export interface PickedMedia {
  id: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  caption: string | null;
  originalName: string;
  filename: string;
  publicUrl: string;
  thumbUrl: string;
  status: string;
  folderId: string | null;
  folderPath: string | null;
  usedIn?: number | null;
  variantCount?: number;
  replacedCount?: number;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaFolderOption {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
