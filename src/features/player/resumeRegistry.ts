import type { M3UChannel } from '../../lib/m3u';

/**
 * Resume / Continue Watching hook-up for the player.
 *
 * The player records progress and asks for resume positions through this
 * registry instead of importing the Continue Watching store. Shashtna Player
 * (Full) registers that store at start-up (App.tsx); Shashtna Player Lite
 * registers nothing, so the store (VOD persistence) is not in its bundle and
 * nothing is written. Live channels never had resume positions anyway.
 */
export type PlaybackResumeStore = {
  ensureLoaded: () => Promise<void>;
  getResumePosition: (item: M3UChannel) => number;
  recordProgress: (item: M3UChannel, position: number, duration: number, parent?: M3UChannel) => void;
};

let store: PlaybackResumeStore | null = null;

export function setPlaybackResumeStore(next: PlaybackResumeStore | null): void {
  store = next;
}

export function ensureContinueWatchingLoaded(): Promise<void> {
  return store ? store.ensureLoaded() : Promise.resolve();
}

export function getResumePosition(item: M3UChannel): number {
  return store ? store.getResumePosition(item) : 0;
}

export function recordProgress(item: M3UChannel, position: number, duration: number, parent?: M3UChannel): void {
  store?.recordProgress(item, position, duration, parent);
}
