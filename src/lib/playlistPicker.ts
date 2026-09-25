import { NativeModules, TurboModuleRegistry } from 'react-native';

/**
 * JS side of ShashtnaPlaylistPicker (android/app/.../PlaylistPickerModule.kt):
 * opens the system document picker and returns the picked file's
 * content:// URI. Nothing is read here; the M3U parser streams the URI.
 */
export type PickedPlaylist = {
  uri: string;
  name: string;
  /** Bytes, or -1 when the provider does not report a size. */
  size: number;
};

type PickerNative = { pickPlaylist(): Promise<PickedPlaylist | null> };

export class PickerUnavailableError extends Error {
  constructor(message = 'No file picker is available on this device.') {
    super(message);
    this.name = 'PickerUnavailableError';
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
