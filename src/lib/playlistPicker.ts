import { NativeModules, TurboModuleRegistry } from 'react-native';

/**
 * JS side of ShashtnaPlaylistPicker (android/app/.../PlaylistPickerModule.kt):
 * opens the system document picker, returns the picked file's content:// URI,
 * and reads that URI in UTF-8 chunks straight from the ContentResolver
 * (see the module for why react-native-blob-util is not used for this).
 */
export type PickedPlaylist = {
  uri: string;
  name: string;
  /** Bytes, or -1 when the provider does not report a size. */
  size: number;
};

type PickerNative = {
  pickPlaylist(): Promise<PickedPlaylist | null>;
  openPlaylist?(uri: string): Promise<string>;
  readPlaylistChunk?(handle: string, maxChars: number): Promise<{ text: string | null; bytes: number }>;
  closePlaylist?(handle: string): void;
};

export class PickerUnavailableError extends Error {
  constructor(message = 'No file picker is available on this device.') {
    super(message);
    this.name = 'PickerUnavailableError';
  }
}

/** The picked file could not be opened or read (removed, access revoked, provider error). */
export class PlaylistReadError extends Error {
  code: string;
  constructor(message: string, code = 'E_READ_FAILED') {
    super(message);
    this.name = 'PlaylistReadError';
    this.code = code;
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

/** Resolves null when the user cancels. */
export async function pickPlaylistFile(): Promise<PickedPlaylist | null> {
  const native = resolveNative();
  if (!native) throw new PickerUnavailableError();
  try {
    return await native.pickPlaylist();
  } catch (error: any) {
    if (error?.code === 'E_NO_PICKER') throw new PickerUnavailableError();
    throw error;
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
    throw new PlaylistReadError(String(error?.message || error), error?.code);
  }
  let done = false;
  try {
    for (;;) {
      let chunk: { text: string | null; bytes: number };
      try {
        chunk = await native.readPlaylistChunk(handle, chunkChars);
      } catch (error: any) {
        done = true; // the native side closes the reader on errors
        throw new PlaylistReadError(String(error?.message || error), error?.code);
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
