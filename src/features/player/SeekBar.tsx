import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  findNodeHandle,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useTVEventHandler,
  View,
} from 'react-native';

import { SHASHTNA_THEME } from '../../design/theme';
import { usePalette } from '../../design/palette';
import { formatClock, ProgressStore, useProgress } from './progressStore';

type Props = {
  store: ProgressStore;
  duration: number;
  onSeek: (seconds: number) => void;
  /** Called on any interaction so the player keeps its controls visible. */
  onActivity: () => void;
  /** Called while the user is scrubbing so auto-hide can be suspended. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  accessibilityLabel: string;
};

/** TV scrubbing auto-commits after this idle time; OK commits immediately. */
const TV_COMMIT_IDLE_MS = 1200;
/** Presses closer than this count as "holding" and accelerate the step. */
const REPEAT_WINDOW_MS = 350;

function tvStep(duration: number, streak: number): number {
  const base = duration < 10 * 60 ? 5 : 10;
  if (streak >= 12) return base * 6;
  if (streak >= 5) return base * 3;
  return base;
}

/**
 * Interactive playback timeline for VOD.
 *
 * TV: focus the bar, LEFT/RIGHT moves a preview position (accelerating while
 * held), OK seeks immediately, pausing input for ~1.2 s also seeks.
 * Touch: tap anywhere on the track or drag the thumb.
 *
 * The timeline is laid out left→right in both languages (time flows the same
 * way as the numbers), so RIGHT always means forward.
 */
function SeekBar({ store, duration, onSeek, onActivity, onScrubbingChange, accessibilityLabel }: Props) {
  const { currentTime, playableDuration } = useProgress(store);
  const palette = usePalette();
  const [preview, setPreview] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const [selfHandle, setSelfHandle] = useState<number | null>(null);

  const pressableRef = useRef<View>(null);
  const previewRef = useRef<number | null>(null);
  const focusedRef = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPressAt = useRef(0);
  const streak = useRef(0);
  const dragStartX = useRef(0);

  const clamp = useCallback((value: number) => Math.min(duration, Math.max(0, value)), [duration]);

  const setPreviewValue = useCallback(
    (value: number | null) => {
      previewRef.current = value;
      setPreview(value);
      onScrubbingChange?.(value !== null);
    },
    [onScrubbingChange],
  );

  const clearCommitTimer = () => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
  };

  const commit = useCallback(() => {
    clearCommitTimer();
    const target = previewRef.current;
    if (target === null) return;
    setPreviewValue(null);
    streak.current = 0;
    onSeek(target);
  }, [onSeek, setPreviewValue]);

  const cancel = useCallback(() => {
    clearCommitTimer();
    streak.current = 0;
    if (previewRef.current !== null) setPreviewValue(null);
  }, [setPreviewValue]);

  useEffect(() => () => clearCommitTimer(), []);

  useEffect(() => {
    // Keeps LEFT/RIGHT on the bar instead of letting focus jump sideways.
    setSelfHandle(findNodeHandle(pressableRef.current));
  }, []);

  useTVEventHandler(
    useCallback(
      evt => {
        if (!focusedRef.current || !evt || evt.eventKeyAction === 1) return;
        const forward = evt.eventType === 'right' || evt.eventType === 'longRight';
        const backward = evt.eventType === 'left' || evt.eventType === 'longLeft';
        if (!forward && !backward) return;

        const now = Date.now();
        streak.current = now - lastPressAt.current < REPEAT_WINDOW_MS ? streak.current + 1 : 0;
        lastPressAt.current = now;

        const from = previewRef.current ?? store.get().currentTime;
        const step = tvStep(duration, streak.current);
        setPreviewValue(clamp(from + (forward ? step : -step)));
        onActivity();

        clearCommitTimer();
        commitTimer.current = setTimeout(commit, TV_COMMIT_IDLE_MS);
      },
      [clamp, commit, duration, onActivity, setPreviewValue, store],
    ),
  );

  const ratioFromX = useCallback(
    (x: number) => (trackWidth > 0 ? Math.min(1, Math.max(0, x / trackWidth)) : 0),
    [trackWidth],
  );

  // PanResponder is created once; route its callbacks through a ref so they
  // always see the latest duration/width.
  const handlersRef = useRef({ move: (_x: number) => {}, commit: () => {} });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !Platform.isTV,
      onMoveShouldSetPanResponder: () => !Platform.isTV,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        dragStartX.current = event.nativeEvent.locationX;
        handlersRef.current.move(dragStartX.current);
      },
      onPanResponderMove: (_event, gesture) => {
        handlersRef.current.move(dragStartX.current + gesture.dx);
      },
      onPanResponderRelease: () => handlersRef.current.commit(),
      onPanResponderTerminate: () => handlersRef.current.commit(),
    }),
  ).current;

  handlersRef.current = {
    move: (x: number) => {
      setPreviewValue(clamp(ratioFromX(x) * duration));
      onActivity();
    },
    commit,
  };

  const shown = preview ?? currentTime;
  const progress = duration > 0 ? shown / duration : 0;
  const buffered = duration > 0 ? Math.min(1, playableDuration / duration) : 0;
  const active = focused || preview !== null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.time}>{formatClock(shown)}</Text>

      <Pressable
        ref={pressableRef}
        focusable
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown), text: formatClock(shown) }}
        nextFocusLeft={selfHandle ?? undefined}
        nextFocusRight={selfHandle ?? undefined}
        onFocus={() => {
          focusedRef.current = true;
          setFocused(true);
          onActivity();
        }}
        onBlur={() => {
          focusedRef.current = false;
          setFocused(false);
          cancel();
        }}
        onPress={() => {
          if (previewRef.current !== null) commit();
        }}
        style={[styles.hitArea, focused && [styles.hitAreaFocused, { boxShadow: palette.accent.focusShadow }]]}
      >
        <View
          style={styles.trackHost}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          <View pointerEvents="none" style={[styles.track, active && styles.trackActive]}>
            <View style={[styles.buffered, { width: `${buffered * 100}%` }]} />
            <View style={[styles.fill, { width: `${progress * 100}%`, experimental_backgroundImage: palette.accent.gradient }]} />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              active && [styles.thumbActive, { boxShadow: palette.accent.focusShadow }],
              { left: Math.max(0, progress * trackWidth - (active ? 12 : 8)) },
            ]}
          />
          {preview !== null ? (
            <View
              pointerEvents="none"
              style={[styles.bubble, { left: Math.min(Math.max(0, progress * trackWidth - 36), Math.max(0, trackWidth - 72)) }]}
            >
              <Text style={styles.bubbleText}>{formatClock(preview)}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Text style={styles.time}>{formatClock(duration)}</Text>
    </View>
  );
}

const C = SHASHTNA_THEME.colors;

const styles = StyleSheet.create({
  // Forced LTR: the timeline reads left→right in Arabic too.
  wrap: { flexDirection: 'row', direction: 'ltr', alignItems: 'center', gap: 14 },
  time: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  hitArea: { flex: 1, height: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 2, borderColor: 'transparent', paddingHorizontal: 10 },
  hitAreaFocused: { borderColor: C.focus, backgroundColor: 'rgba(255,255,255,0.08)', boxShadow: SHASHTNA_THEME.shadows.focusGlow },
  trackHost: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  trackActive: { height: 10, borderRadius: 5 },
  buffered: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.28)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, experimental_backgroundImage: SHASHTNA_THEME.gradients.brand },
  thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', top: 14 },
  thumbActive: { width: 24, height: 24, borderRadius: 12, top: 10, boxShadow: SHASHTNA_THEME.shadows.glow },
  bubble: { position: 'absolute', bottom: 40, width: 72, height: 30, borderRadius: 10, backgroundColor: 'rgba(8,14,32,0.92)', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
});

export default memo(SeekBar);
