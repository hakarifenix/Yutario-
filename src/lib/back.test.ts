import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasBackHandlers, pushBackHandler, runBackHandlers } from './back';

let releases: (() => void)[] = [];

function register(handler: () => boolean) {
  const release = pushBackHandler(handler);
  releases.push(release);
  return release;
}

afterEach(() => {
  for (const release of releases.reverse()) release();
  releases = [];
});

describe('back handler stack', () => {
  it('runs only the newest handler', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    register(first);
    register(second);

    expect(runBackHandlers()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('unregisters handlers and reveals the previous one', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    register(first);
    const releaseSecond = register(second);
    releaseSecond();
    releases = releases.filter((release) => release !== releaseSecond);

    expect(hasBackHandlers()).toBe(true);
    expect(runBackHandlers()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('reports when nothing handled the event', () => {
    expect(runBackHandlers()).toBe(false);
    const decline = vi.fn(() => false);
    register(decline);
    expect(runBackHandlers()).toBe(false);
    expect(decline).toHaveBeenCalled();
  });

  it('survives a throwing handler', () => {
    register(() => {
      throw new Error('boom');
    });
    expect(runBackHandlers()).toBe(false);
  });
});
