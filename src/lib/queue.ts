import type { RepeatMode } from './types';

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return Math.floor(index);
}

export function computeNextIndex(index: number, length: number, repeat: RepeatMode): number | null {
  if (length === 0) return null;
  if (repeat === 'one') return clampIndex(index, length);
  if (index < length - 1) return index + 1;
  if (repeat === 'all') return 0;
  return null;
}

export function computePreviousIndex(index: number, length: number, repeat: RepeatMode): number {
  if (length === 0) return 0;
  if (index > 0) return index - 1;
  if (repeat === 'all') return length - 1;
  return 0;
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items.slice();
  if (from < 0 || from >= items.length) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items.slice();
  const target = Math.max(0, Math.min(next.length, to));
  next.splice(target, 0, moved);
  return next;
}

export function removeAt<T>(items: T[], index: number): T[] {
  if (index < 0 || index >= items.length) return items.slice();
  const next = items.slice();
  next.splice(index, 1);
  return next;
}

/** Builds a shuffle order that always starts at the current track. */
export function buildShuffleOrder(length: number, currentIndex: number, random: () => number = Math.random): number[] {
  const rest: number[] = [];
  for (let i = 0; i < length; i += 1) {
    if (i !== currentIndex) rest.push(i);
  }
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = rest[i];
    rest[i] = rest[j];
    rest[j] = temp;
  }
  const start = clampIndex(currentIndex, length);
  return length > 0 && currentIndex < length ? [start, ...rest] : rest;
}

export interface QueueSummary {
  total: number;
  position: number;
  remaining: number;
}

export function summarizeQueue(length: number, index: number): QueueSummary {
  const position = clampIndex(index, length);
  return {
    total: length,
    position: length === 0 ? 0 : position + 1,
    remaining: Math.max(0, length - position - 1),
  };
}
