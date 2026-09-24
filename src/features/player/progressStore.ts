import { useSyncExternalStore } from 'react';

export type ProgressSnapshot = {
  currentTime: number;
  playableDuration: number;
};

export type ProgressStore = {
  get: () => ProgressSnapshot;
  set: (next: Partial<ProgressSnapshot>) => void;
  reset: () => void;
  subscribe: (listener: () => void) => () => void;
};

const EMPTY: ProgressSnapshot = { currentTime: 0, playableDuration: 0 };

/**
 * Playback position lives outside React state: react-native-video reports
 * progress every 500 ms, and routing that through PlayerScreen state would
 * re-render the whole player (menus, overlays, controls) twice a second.
 * Only components that subscribe (the SeekBar) re-render.
 */
export function createProgressStore(): ProgressStore {
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());

  return {
    get: () => snapshot,
    set: next => {
      const merged = { ...snapshot, ...next };
      if (
        merged.currentTime === snapshot.currentTime &&
        merged.playableDuration === snapshot.playableDuration
      ) {
        return;
      }
      snapshot = merged;
      emit();
    },
    reset: () => {
      if (snapshot === EMPTY) return;
      snapshot = EMPTY;
      emit();
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useProgress(store: ProgressStore): ProgressSnapshot {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(hours ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
