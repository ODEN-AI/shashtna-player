import ReactNativeBlobUtil from 'react-native-blob-util';

import { isSecureStoreAvailable, secureGet, secureRemove, secureSet } from './secureStore';

/**
 * Persists the subscription source (an M3U/Xtream URL that embeds the
 * username and password).
 *
 * Android: encrypted with the Keystore-backed secure store. The legacy
 * plaintext file from earlier versions is migrated on first load and then
 * deleted, so existing sessions keep working.
 * Elsewhere (no native secure store): falls back to the app-private file.
 */
const SECURE_KEY = 'connection-source';
const LEGACY_FILE = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/shashtna-connection.json`;

type SavedConnection = {
  source: string;
  savedAt: number;
};

async function readLegacyFile(): Promise<string | null> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(LEGACY_FILE))) return null;
    const raw = await ReactNativeBlobUtil.fs.readFile(LEGACY_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SavedConnection>;
    const source = String(parsed.source || '').trim();
    return source || null;
  } catch (error) {
    console.warn('[Shashtna] Failed to read legacy connection file:', error);
    return null;
  }
}

async function deleteLegacyFile(): Promise<void> {
  try {
    if (await ReactNativeBlobUtil.fs.exists(LEGACY_FILE)) {
      await ReactNativeBlobUtil.fs.unlink(LEGACY_FILE);
    }
  } catch (error) {
    console.warn('[Shashtna] Failed to delete legacy connection file:', error);
  }
}

async function writeLegacyFile(source: string): Promise<void> {
  const payload: SavedConnection = { source, savedAt: Date.now() };
  await ReactNativeBlobUtil.fs.writeFile(LEGACY_FILE, JSON.stringify(payload), 'utf8');
}

export async function saveConnectionSource(source: string): Promise<void> {
  const value = String(source || '').trim();
  if (!value) return;

  try {
    if (isSecureStoreAvailable()) {
      const payload: SavedConnection = { source: value, savedAt: Date.now() };
      if (await secureSet(SECURE_KEY, JSON.stringify(payload))) {
        // Only remove plaintext once the encrypted copy is committed.
        await deleteLegacyFile();
        return;
      }
    }
    await writeLegacyFile(value);
  } catch (error) {
    console.warn('[Shashtna] Failed to save connection:', error);
  }
}

export async function loadConnectionSource(): Promise<string | null> {
  try {
    if (isSecureStoreAvailable()) {
      const stored = await secureGet(SECURE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SavedConnection>;
        const source = String(parsed.source || '').trim();
        if (source) return source;
      }

      // Migration from the plaintext file written by earlier versions.
      const legacy = await readLegacyFile();
      if (legacy) {
        await saveConnectionSource(legacy);
      }
      return legacy;
    }

    return await readLegacyFile();
  } catch (error) {
    console.warn('[Shashtna] Failed to load saved connection:', error);
    return null;
  }
}

export async function clearConnectionSource(): Promise<void> {
  try {
    await secureRemove(SECURE_KEY);
  } catch (error) {
    console.warn('[Shashtna] Failed to clear secure connection:', error);
  }
  await deleteLegacyFile();
}
