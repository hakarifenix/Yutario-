import type { MediaItem, MediaKind } from './types';
import { stripExtension } from './format';

/** Opens a native browser file dialog. Used only by the web preview build. */
export function pickBrowserFiles(kind: MediaKind | 'any'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = kind === 'audio' ? 'audio/*' : kind === 'video' ? 'video/*' : 'audio/*,video/*';
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

export function fileToMediaItem(file: File): MediaItem {
  const kind: MediaKind = file.type.startsWith('video') ? 'video' : 'audio';
  const uri = URL.createObjectURL(file);
  return {
    id: uri,
    uri,
    kind,
    title: stripExtension(file.name),
    durationMs: 0,
    sizeBytes: file.size,
    mimeType: file.type || undefined,
    dateAdded: file.lastModified || Date.now(),
    source: 'web',
  };
}
