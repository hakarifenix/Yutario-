import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dialog, Sheet } from './ui';
import { MiniPlayer } from './MiniPlayer';
import { runBackHandlers, hasBackHandlers } from '../lib/back';
import type { MediaItem } from '../lib/types';

const engineMock = vi.hoisted(() => ({
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
}));

vi.mock('../lib/engine', () => ({ engine: engineMock }));

const { usePlayer } = await import('../state/player');

const item: MediaItem = {
  id: 'a',
  uri: 'content://media/audio/a',
  kind: 'audio',
  title: 'Midnight Drive',
  artist: 'Nova',
  album: 'Neon',
  durationMs: 200000,
  source: 'mediastore',
};

beforeEach(() => {
  expect(hasBackHandlers()).toBe(false);
  vi.clearAllMocks();
  usePlayer.setState({
    queue: [item],
    index: 0,
    isPlaying: true,
    positionMs: 50000,
    durationMs: 200000,
    ready: true,
  });
});

describe('Sheet', () => {
  it('renders an accessible dialog and closes through the back handler', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Queue">
        <p>Body</p>
      </Sheet>,
    );

    expect(screen.getByRole('dialog', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    runBackHandlers();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    render(
      <Sheet open={false} onClose={() => undefined} title="Hidden">
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });
});

describe('Dialog', () => {
  it('runs the confirm action and closes via the cancel button', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <Dialog open title="Delete playlist" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose}>
        <p>Sure?</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('MiniPlayer', () => {
  it('shows the current track and forwards controls to the engine', () => {
    render(
      <MemoryRouter>
        <MiniPlayer />
      </MemoryRouter>,
    );

    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    expect(screen.getByText('Nova')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(engineMock.toggle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(engineMock.next).toHaveBeenCalledTimes(1);

    const openButton = screen.getByRole('button', { name: 'Open full player' });
    expect(openButton).toBeInTheDocument();
  });

  it('renders nothing when the queue is empty', () => {
    usePlayer.setState({ queue: [], index: 0 });
    const { container } = render(
      <MemoryRouter>
        <MiniPlayer />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
