import { describe, expect, it } from 'vitest';
import {
  buildShuffleOrder,
  clampIndex,
  computeNextIndex,
  computePreviousIndex,
  dedupeById,
  moveItem,
  removeAt,
} from './queue';

describe('queue navigation', () => {
  it('advances until the end when repeat is off', () => {
    expect(computeNextIndex(0, 3, 'off')).toBe(1);
    expect(computeNextIndex(1, 3, 'off')).toBe(2);
    expect(computeNextIndex(2, 3, 'off')).toBeNull();
  });

  it('wraps with repeat all and stays with repeat one', () => {
    expect(computeNextIndex(2, 3, 'all')).toBe(0);
    expect(computeNextIndex(1, 3, 'one')).toBe(1);
  });

  it('handles an empty queue', () => {
    expect(computeNextIndex(0, 0, 'all')).toBeNull();
    expect(computePreviousIndex(0, 0, 'off')).toBe(0);
  });

  it('walks backwards and wraps only for repeat all', () => {
    expect(computePreviousIndex(2, 3, 'off')).toBe(1);
    expect(computePreviousIndex(0, 3, 'off')).toBe(0);
    expect(computePreviousIndex(0, 3, 'all')).toBe(2);
  });

  it('clamps out-of-range indexes', () => {
    expect(clampIndex(-4, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(Number.NaN, 5)).toBe(0);
    expect(clampIndex(1, 0)).toBe(0);
  });
});

describe('queue mutations', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'b' }];

  it('deduplicates by stable id', () => {
    expect(dedupeById(items).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('moves an item without mutating the source', () => {
    const source = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const moved = moveItem(source, 0, 2);
    expect(moved.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(source.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('removes an item by index', () => {
    expect(removeAt([{ id: 'a' }, { id: 'b' }], 1).map((item) => item.id)).toEqual(['a']);
    expect(removeAt([{ id: 'a' }], 5).map((item) => item.id)).toEqual(['a']);
  });
});

describe('shuffle order', () => {
  it('starts at the current track and contains every index once', () => {
    const order = buildShuffleOrder(6, 3, () => 0.5);
    expect(order[0]).toBe(3);
    expect(order.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('is deterministic with an injected random source', () => {
    const a = buildShuffleOrder(5, 0, () => 0.25);
    const b = buildShuffleOrder(5, 0, () => 0.25);
    expect(a).toEqual(b);
  });

  it('handles empty and single-item queues', () => {
    expect(buildShuffleOrder(0, 0)).toEqual([]);
    expect(buildShuffleOrder(1, 0)).toEqual([0]);
  });
});
