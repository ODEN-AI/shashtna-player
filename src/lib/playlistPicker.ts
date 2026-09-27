import { NativeModules, TurboModuleRegistry } from 'react-native';

import { PlaylistEmptyError, PlaylistImportCode } from './playlistErrors';
import { tvDiag } from './tvDiagnostics';

/**
 * JS side of ShashtnaPlaylistPicker (android/app/.../PlaylistPickerModule.kt).
 *
 * pickPlaylistFile opens the system document picker (Storage Access Framework:
 * ACTION_OPEN_DOCUMENT, then ACTION_GET_CONTENT), and the native side copies
 * the picked document into the app's private storage. The returned `uri` is
 * that private copy (file://), which is what gets parsed, saved and restored:
 * nothing depends on the original provider after the pick. `original` is the
 * picked document, kept only to re-copy it on "read the file again".
 *
 * The native module never rejects with a raw exception: it resolves
 * { status: 'picked' | 'cancelled' | 'error', code }. Here that becomes:
 * a PickedPlaylist, null (cancelled, or a second press while the picker is
 * opening), or a typed error with a structured `code`.
 */
export type PickedPlaylist = {
  /** The app's private copy (file://), or any readable playlist URI. */
  uri: string;
  name: string;
  /** Bytes, or -1 when unknown. */
  size: number;
  /** The picked document (content://), for re-importing it. Never logged. */
  original?: string;
};

type NativeResult =
  | { status: 'picked'; uri: string; name?: string; size?: number; original?: string }
  | { status: 'cancelled' }
  | { status: 'error'; code?: string; reason?: string };

type PickerNative = {
  pickPlaylist(): Promise<NativeResult>;
  reimportPlaylist?(original: string): Promise<NativeResult>;
  prunePlaylists?(keep: string[]): Promise<number>;
  openPlaylist?(uri: string): Promise<string>;
  readPlaylistChunk?(handle: string, maxChars: number): Promise<{ text: string | null; bytes: number }>;
  closePlaylist?(handle: string): void;
};

/** No document picker could be opened: PICKER_UNAVAILABLE or PICKER_LAUNCH_FAILED. */
export class PickerUnavailableError extends Error {
  readonly code: PlaylistImportCode;
  constructor(code: PlaylistImportCode = 'PICKER_UNAVAILABLE', message = 'No file picker is available on this device.') {
    super(message);
    this.name = 'PickerUnavailableError';
    this.code = code;
  }
}

/** The picked file could not be read or copied (FILE_READ_FAILED; reason: permission, not_found, io, too_large...). */
export class PlaylistReadError extends Error {
  readonly code: PlaylistImportCode = 'FILE_READ_FAILED';
  readonly reason: string;
  constructor(message: string, reason = 'io') {
    super(message);
    this.name = 'PlaylistReadError';
    this.reason = reason;
  }
}

function resolveNative(): PickerNative | null {
  const legacy = (NativeModules as Record<string, unknown>).ShashtnaPlaylistPicker as PickerNative | undefined;
  if (legacy?.pickPlaylist) return legacy;
  try {
    const turbo = TurboModuleRegistry.get<any>('ShashtnaPlaylistPicker') as PickerNative | null;
    if (turbo?.pickPlaylist) return turbo;
  } catch {
    // Not registered on this platform.
  }
  return null;
}

export function isPlaylistPickerAvailable(): boolean {
  return resolveNative() !== null;
}

function outcome(code: string, extra: Record<string, string | number | boolean> = {}): void {
  // Outcome only: never the URI or the file name.
  tvDiag('AMER_TV_PICKER', { stage: 'js:result', code, ...extra });
}

/** Turns a native result into a picked file, null (cancelled) or a typed error. */
function settle(result: NativeResult | null | undefined): PickedPlaylist | null {
  if (result && result.status === 'picked' && typeof result.uri === 'string' && result.uri) {
    outcome('PICKED', { size: typeof result.size === 'number' ? result.size : -1 });
    return { uri: result.uri, name: result.name || 'playlist.m3u', size: typeof result.size === 'number' ? result.size : -1, original: result.original };
  }
  if (result && result.status === 'cancelled') {
    outcome('PICKER_CANCELLED');
    return null;
  }
  const code = (result && result.status === 'error' && result.code) || 'PICKER_LAUNCH_FAILED';
  const reason = (result && result.status === 'error' && result.reason) || 'unexpected_result';
  outcome(code, { reason });
  switch (code) {
    case 'PICKER_BUSY':
      return null; // a second press while the picker opens: the first request carries on
    case 'EMPTY_M3U':
      throw new PlaylistEmptyError();
    case 'FILE_READ_FAILED':
      throw new PlaylistReadError(`The picked file could not be read (${reason}).`, reason);
    case 'PICKER_UNAVAILABLE':
      throw new PickerUnavailableError('PICKER_UNAVAILABLE');
    default:
      throw new PickerUnavailableError('PICKER_LAUNCH_FAILED', `The file picker could not be opened (${reason}).`);
  }
}

let inFlight = false;

/**
 * Opens the system document picker and imports the chosen file into private
 * storage. Resolves null when the user cancels, or when a pick is already in
 * progress (double press on a remote): only one picker is ever open.
 */
export async function pickPlaylistFile(): Promise<PickedPlaylist | null> {
  const native = resolveNative();
  if (!native) {
    outcome('PICKER_UNAVAILABLE', { reason: 'no_native_module' });
    throw new PickerUnavailableError('PICKER_UNAVAILABLE');
  }
  if (inFlight) {
    outcome('PICKER_BUSY', { reason: 'js_in_flight' });
    return null;
  }
  inFlight = true;
  try {
    let result: NativeResult;
    try {
      result = await native.pickPlaylist();
    } catch {
      // An older native build rejected; never let a raw native error reach the UI.
      result = { status: 'error', code: 'PICKER_LAUNCH_FAILED', reason: 'native_rejected' };
    }
    return settle(result);
  } finally {
    inFlight = false;
  }
}

/** "Read the file again": copies the original picked document again. Throws PlaylistReadError when it is gone. */
export async function reimportPlaylistFile(original: string): Promise<PickedPlaylist> {
  const native = resolveNative();
  if (!native?.reimportPlaylist) throw new PlaylistReadError('Re-import is not available.', 'unsupported');
  let result: NativeResult;
  try {
    result = await native.reimportPlaylist(original);
  } catch {
    result = { status: 'error', code: 'FILE_READ_FAILED', reason: 'native_rejected' };
  }
  const picked = settle(result);
  if (!picked) throw new PlaylistReadError('The original file could not be read again.', 'cancelled');
  return picked;
}

/** Deletes private playlist copies other than those in [keep] (best effort, never throws). */
export async function prunePlaylistCopies(keep: string[]): Promise<void> {
  try {
    await resolveNative()?.prunePlaylists?.(keep.filter(Boolean));
  } catch {
    // Housekeeping only.
  }
}

/** Accepts .m3u / .m3u8 names; other names are still allowed (content is validated). */
export function looksLikePlaylistName(name: string): boolean {
  return /\.m3u8?$/i.test(name.trim());
}

/** True when the native chunked reader is available (Android app builds). */
export function hasNativePlaylistReader(): boolean {
  const native = resolveNative();
  return !!(native?.openPlaylist && native.readPlaylistChunk);
}

/**
 * Reads a picked playlist (content:// or file://) as UTF-8 text, one chunk at
 * a time: `onText` gets each chunk and the number of bytes read so far.
 * Pull-based, so the next chunk is only read after the previous one was
 * parsed, and the JS thread gets a turn between chunks.
 */
export async function readPlaylistFile(
  uri: string,
  onText: (text: string, bytesRead: number) => void,
  chunkChars = 256 * 1024,
): Promise<void> {
  const native = resolveNative();
  if (!native?.openPlaylist || !native.readPlaylistChunk) throw new PickerUnavailableError();
  let handle: string;
  try {
    handle = await native.openPlaylist(uri);
  } catch (error: any) {
    throw new PlaylistReadError(String(error?.message || error), readReason(error?.code));
  }
  let done = false;
  try {
    for (;;) {
      let chunk: { text: string | null; bytes: number };
      try {
        chunk = await native.readPlaylistChunk(handle, chunkChars);
      } catch (error: any) {
        done = true; // the native side closes the reader on errors
        throw new PlaylistReadError(String(error?.message || error), readReason(error?.code));
      }
      if (chunk.text == null) {
        done = true; // closed natively at the end of the file
        return;
      }
      onText(chunk.text, chunk.bytes);
    }
  } finally {
    if (!done) native.closePlaylist?.(handle);
  }
}

/** Native reader codes (E_NOT_FOUND, E_PERMISSION, ...) as FILE_READ_FAILED reasons. */
function readReason(code: unknown): string {
  switch (code) {
    case 'E_NOT_FOUND':
      return 'not_found';
    case 'E_PERMISSION':
      return 'permission';
    default:
      return 'io';
  }
}
