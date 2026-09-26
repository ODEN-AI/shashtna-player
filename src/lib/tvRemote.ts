/**
 * The Android TV remote contract, as React Native tvOS delivers it.
 *
 * ReactRootView.dispatchKeyEvent hands every key to
 * com.facebook.react.modules.core.ReactAndroidHWInputDeviceHelper, which emits
 * `onHWKeyEvent` { eventType, eventKeyAction } to useTVEventHandler:
 * - D-pad, OK, CH+/CH- are emitted on ACTION_UP (eventKeyAction 1) only;
 *   ACTION_DOWN (0) is emitted only when ReactFeatureFlags.enableKeyDownEvents
 *   is on (it is off in this app), or once as the start of a long press;
 * - a held key becomes 'longUp' / 'longDown' / ... (down once, up on release);
 * - the key still goes on to Android's focus search (super.dispatchKeyEvent):
 *   JS cannot consume it, so focus moves on ACTION_DOWN, before JS hears it.
 *
 * So one physical press = its key-up. Handlers that waited for key-down
 * (eventKeyAction 0) never ran on a real TV, while Jest (which fired 0) passed.
 * eventKeyAction -1/undefined = a platform that sends no action: one event per press.
 */
export type RemoteEvent = { eventType?: string; eventKeyAction?: number; tag?: number; target?: number } | null | undefined;

export const KEY_ACTION_DOWN = 0;
export const KEY_ACTION_UP = 1;

/** True for the one event that completes a physical press. */
export function isPressCompletion(evt: RemoteEvent): boolean {
  return !!evt && evt.eventKeyAction !== KEY_ACTION_DOWN;
}

export type ChannelStep = 1 | -1;

/**
 * Channel step for a live player: UP / CH+ = next (+1), DOWN / CH- = previous (-1).
 * Null for anything else, and for key-down halves, so a press steps exactly once.
 */
export function channelStepFor(evt: RemoteEvent): ChannelStep | null {
  if (!isPressCompletion(evt)) return null;
  switch (evt!.eventType) {
    case 'up':
    case 'longUp':
    case 'channelUp':
      return 1;
    case 'down':
    case 'longDown':
    case 'channelDown':
      return -1;
    default:
      return null;
  }
}

export function isChannelKey(evt: RemoteEvent): boolean {
  return !!evt && (evt.eventType === 'channelUp' || evt.eventType === 'channelDown' || evt.eventType === 'longChannelUp' || evt.eventType === 'longChannelDown');
}
