import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMock = vi.hoisted(() => ({
  getLibraryPermissionStatus: vi.fn(),
  requestLibraryPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  scanMedia: vi.fn(),
  pickMedia: vi.fn(),
}));

vi.mock('../lib/native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/native')>();
  return {
    ...actual,
    isNativePlatform: true,
    YutarioNative: nativeMock as unknown as typeof actual.YutarioNative,
  };
});

const { useLibrary } = await import('./library');

const nativeItem = (id: string, kind: 'audio' | 'video' = 'audio') => ({
  uri: `content://media/${kind}/${id}`,
  kind,
  title: `Track ${id}`,
  artist: 'Artist',
  album: 'Album',
  durationMs: 1000,
  sizeBytes: 100,
  dateAdded: 1000,
  mimeType: kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
  source: 'mediastore' as const,
});

const reset = () => {
  useLibrary.setState({
    music: [],
    videos: [],
    permission: null,
    status: 'idle',
    error: null,
    scannedAt: null,
    progressText: { loaded: 0, total: 0 },
    initialized: false,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  reset();
});

describe('media permission handling', () => {
  it('does not scan and stays idle when permission is denied', async () => {
    nativeMock.getLibraryPermissionStatus.mockResolvedValue({
      state: 'denied',
      readAudio: false,
      readVideo: false,
      notifications: false,
      sdk: 33,
    });

    await useLibrary.getState().init();

    expect(useLibrary.getState().permission?.state).toBe('denied');
    expect(useLibrary.getState().status).toBe('idle');
    expect(nativeMock.scanMedia).not.toHaveBeenCalled();
  });

  it('scans only the media types that are allowed', async () => {
    nativeMock.getLibraryPermissionStatus.mockResolvedValue({
      state: 'partial',
      readAudio: true,
      readVideo: false,
      notifications: false,
      sdk: 33,
    });
    nativeMock.scanMedia.mockResolvedValue({ items: [nativeItem('1')], total: 1 });

    await useLibrary.getState().init();

    expect(nativeMock.scanMedia).toHaveBeenCalledTimes(1);
    expect(nativeMock.scanMedia.mock.calls[0][0].kind).toBe('audio');
    expect(useLibrary.getState().music).toHaveLength(1);
    expect(useLibrary.getState().videos).toHaveLength(0);
    expect(useLibrary.getState().status).toBe('ready');
  });

  it('scans both libraries and paginates until the total is reached', async () => {
    nativeMock.getLibraryPermissionStatus.mockResolvedValue({
      state: 'granted',
      readAudio: true,
      readVideo: true,
      notifications: true,
      sdk: 33,
    });
    nativeMock.scanMedia.mockImplementation(async ({ kind, offset }: { kind: string; offset: number }) => {
      if (kind === 'audio') {
        if (offset === 0) return { items: [nativeItem('1'), nativeItem('2')], total: 3 };
        return { items: [nativeItem('3')], total: 3 };
      }
      return { items: [nativeItem('v1', 'video')], total: 1 };
    });

    await useLibrary.getState().init();

    expect(useLibrary.getState().music).toHaveLength(3);
    expect(useLibrary.getState().videos).toHaveLength(1);
    expect(useLibrary.getState().scannedAt).not.toBeNull();
  });

  it('stores a scan error instead of throwing', async () => {
    nativeMock.getLibraryPermissionStatus.mockResolvedValue({
      state: 'granted',
      readAudio: true,
      readVideo: true,
      notifications: true,
      sdk: 33,
    });
    nativeMock.scanMedia.mockRejectedValue(new Error('provider crashed'));

    await useLibrary.getState().init();

    expect(useLibrary.getState().status).toBe('error');
    expect(useLibrary.getState().error).toContain('provider crashed');
  });

  it('refreshes after a permission grant', async () => {
    nativeMock.getLibraryPermissionStatus
      .mockResolvedValueOnce({
        state: 'prompt',
        readAudio: false,
        readVideo: false,
        notifications: false,
        sdk: 33,
      })
      .mockResolvedValue({
        state: 'granted',
        readAudio: true,
        readVideo: true,
        notifications: false,
        sdk: 33,
      });
    await useLibrary.getState().init();
    expect(nativeMock.scanMedia).not.toHaveBeenCalled();

    nativeMock.requestLibraryPermission.mockResolvedValue({
      state: 'granted',
      readAudio: true,
      readVideo: true,
      notifications: false,
      sdk: 33,
    });
    nativeMock.scanMedia.mockResolvedValue({ items: [nativeItem('1')], total: 1 });

    await useLibrary.getState().requestPermission();
    expect(nativeMock.scanMedia).toHaveBeenCalled();
    expect(useLibrary.getState().music).toHaveLength(1);
  });
});

describe('manual file import', () => {
  it('merges selected files into the matching library and deduplicates', async () => {
    nativeMock.pickMedia.mockResolvedValue({
      items: [nativeItem('1'), nativeItem('1'), nativeItem('v1', 'video')],
      total: 3,
    });

    const imported = await useLibrary.getState().importMedia('any');

    expect(imported).toHaveLength(3);
    expect(useLibrary.getState().music).toHaveLength(1);
    expect(useLibrary.getState().videos).toHaveLength(1);
  });
});
