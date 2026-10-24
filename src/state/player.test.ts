import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineState, MediaItem } from '../lib/types';

const engineMock = {
  isNative: false,
  play: vi.fn(async () => undefined),
  toggle: vi.fn(async () => undefined),
  resume: vi.fn(async () => undefined),
  pause: vi.fn(async () => undefined),
  next: vi.fn(async () => undefined),
  previous: vi.fn(async () => undefined),
  seek: vi.fn(async () => undefined),
  setRepeat: vi.fn(async () => undefined),
  setShuffle: vi.fn(async () => undefined),
  setSpeed: vi.fn(async () => undefined),
  addToQueue: vi.fn(async () => undefined),
  removeFromQueue: vi.fn(async () => undefined),
  moveInQueue: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  getState: vi.fn(async () => null),
  setSleepTimer: vi.fn(async () => undefined),
  subscribe: vi.fn(() => () => undefined),
};

vi.mock('../lib/engine', () => ({ engine: engineMock }));

const { usePlayer } = await import('./player');
const { useCollections } = await import('./collections');

const track = (id: string, title = id): MediaItem => ({
  id,
  uri: `content://media/audio/${id}`,
  kind: 'audio',
  title,
  artist: 'Artist',
  album: 'Album',
  durationMs: 180000,
  source: 'mediastore',
});

function engineState(partial: Partial<EngineState> = {}): EngineState {
  return {
    queueIds: [],
    index: 0,
    isPlaying: false,
    playWhenReady: false,
    isBuffering: false,
    positionMs: 0,
    durationMs: 0,
    bufferedMs: 0,
    repeat: 'off',
    shuffle: false,
    speed: 1,
    ended: false,
    error: null,
    sleepTimerEndsAt: null,
    stopAfterTrack: false,
    ...partial,
  };
}

const resetPlayer = () => {
  usePlayer.setState({
    queue: [],
    index: 0,
    isPlaying: false,
    buffering: false,
    positionMs: 0,
    durationMs: 0,
    bufferedMs: 0,
    repeat: 'off',
    shuffle: false,
    speed: 1,
    error: null,
    ended: false,
    sleepTimer: { endsAt: null, minutes: null, stopAfterTrack: false },
    ready: true,
  });
  useCollections.setState({ playlists: [], favorites: [], history: [], progress: {}, hydrated: true });
};

beforeEach(() => {
  vi.clearAllMocks();
  resetPlayer();
});

describe('playback state synchronisation', () => {
  it('mirrors engine state instead of keeping its own playback truth', () => {
    const queue = [track('a'), track('b')];
    usePlayer.setState({ queue, durationMs: 180000 });

    usePlayer.getState().syncEngine(
      engineState({
        queueIds: ['a', 'b'],
        index: 1,
        isPlaying: true,
        positionMs: 42000,
        durationMs: 180000,
        bufferedMs: 90000,
        repeat: 'all',
        shuffle: true,
        speed: 1.25,
      }),
    );

    const state = usePlayer.getState();
    expect(state.index).toBe(1);
    expect(state.isPlaying).toBe(true);
    expect(state.positionMs).toBe(42000);
    expect(state.bufferedMs).toBe(90000);
    expect(state.repeat).toBe('all');
    expect(state.shuffle).toBe(true);
    expect(state.speed).toBe(1.25);
    expect(state.currentItem()?.id).toBe('b');
  });

  it('rebuilds the queue from engine ids and clears it when playback stops', () => {
    usePlayer.setState({ queue: [track('a'), track('b')], index: 0 });
    usePlayer.getState().syncEngine(engineState({ queueIds: ['b', 'a'], index: 1, isPlaying: true }));
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(['b', 'a']);

    usePlayer.getState().syncEngine(engineState({ queueIds: [], index: 0 }));
    expect(usePlayer.getState().queue).toHaveLength(0);
  });

  it('surfaces playback errors', () => {
    usePlayer.getState().syncEngine(engineState({ error: 'ERROR_CODE_DECODING_FAILED' }));
    expect(usePlayer.getState().error).toBe('ERROR_CODE_DECODING_FAILED');
    usePlayer.getState().clearError();
    expect(usePlayer.getState().error).toBeNull();
  });

  it('records history and resume progress for the current track', () => {
    usePlayer.setState({ queue: [track('a')], index: 0 });
    usePlayer.getState().syncEngine(
      engineState({ queueIds: ['a'], index: 0, isPlaying: false, positionMs: 60000, durationMs: 180000 }),
    );
    expect(useCollections.getState().history[0]?.item.id).toBe('a');
    expect(useCollections.getState().getProgress('a')).toBe(60000);
  });
});

describe('repeat and shuffle', () => {
  it('cycles off → all → one → off', async () => {
    await usePlayer.getState().cycleRepeat();
    expect(usePlayer.getState().repeat).toBe('all');
    await usePlayer.getState().cycleRepeat();
    expect(usePlayer.getState().repeat).toBe('one');
    await usePlayer.getState().cycleRepeat();
    expect(usePlayer.getState().repeat).toBe('off');
    expect(engineMock.setRepeat).toHaveBeenCalledTimes(3);
  });

  it('forwards shuffle changes to the engine', async () => {
    await usePlayer.getState().toggleShuffle();
    expect(usePlayer.getState().shuffle).toBe(true);
    expect(engineMock.setShuffle).toHaveBeenCalledWith(true);
    await usePlayer.getState().toggleShuffle();
    expect(usePlayer.getState().shuffle).toBe(false);
  });
});

describe('queue operations', () => {
  it('starts a new queue when nothing is playing', async () => {
    const items = [track('a'), track('b')];
    await usePlayer.getState().playNow(items, 1);
    expect(engineMock.play).toHaveBeenCalledWith(items, 1, expect.objectContaining({ autoPlay: true }));
    expect(usePlayer.getState().index).toBe(1);
    expect(usePlayer.getState().isPlaying).toBe(true);
  });

  it('appends without duplicating and can insert next', async () => {
    await usePlayer.getState().playNow([track('a'), track('b')], 0);
    await usePlayer.getState().addToQueue([track('b'), track('c')], 'end');
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(engineMock.addToQueue).toHaveBeenCalledWith([track('c')], 'end');

    await usePlayer.getState().addToQueue([track('d')], 'next');
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('removes and reorders the queue', async () => {
    await usePlayer.getState().playNow([track('a'), track('b'), track('c')], 0);
    await usePlayer.getState().removeFromQueue(1);
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(['a', 'c']);
    expect(engineMock.removeFromQueue).toHaveBeenCalledWith(1);

    await usePlayer.getState().moveInQueue(0, 1);
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(['c', 'a']);
    expect(engineMock.moveInQueue).toHaveBeenCalledWith(0, 1);
  });

  it('stops and clears the queue', async () => {
    await usePlayer.getState().playNow([track('a')], 0);
    await usePlayer.getState().stop();
    expect(usePlayer.getState().queue).toHaveLength(0);
    expect(usePlayer.getState().isPlaying).toBe(false);
    expect(engineMock.stop).toHaveBeenCalled();
  });
});

describe('sleep timer', () => {
  it('stores the timer state and delegates to the engine', async () => {
    await usePlayer.getState().setSleepTimer(30);
    expect(engineMock.setSleepTimer).toHaveBeenCalledWith(30, false);
    expect(usePlayer.getState().sleepTimer.minutes).toBe(30);
    expect(usePlayer.getState().sleepTimer.endsAt).toBeGreaterThan(Date.now());

    await usePlayer.getState().setSleepTimer(null, true);
    expect(usePlayer.getState().sleepTimer.endsAt).toBeNull();
    expect(usePlayer.getState().sleepTimer.stopAfterTrack).toBe(true);
  });
});
