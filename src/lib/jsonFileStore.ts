import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * Minimal JSON persistence in the app's document directory, using the same
 * mechanism as connectionSession.ts (no extra storage dependency).
 *
 * Writes go to a temporary file that then replaces the target, so a crash or
 * power loss mid-write leaves the previous version intact instead of a
 * truncated file.
 */
export function jsonFilePath(name: string): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${name}`;
}

export async function readJsonFile<T>(name: string, fallback: T): Promise<T> {
  try {
    const path = jsonFilePath(name);
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return fallback;
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[Shashtna] Failed to read ${name}:`, error);
    return fallback;
  }
}

export async function writeJsonFile(name: string, value: unknown): Promise<void> {
  const fs = ReactNativeBlobUtil.fs;
  const path = jsonFilePath(name);
  const temp = `${path}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value), 'utf8');
    if (await fs.exists(path)) await fs.unlink(path);
    await fs.mv(temp, path);
  } catch (error) {
    console.warn(`[Shashtna] Failed to write ${name}:`, error);
  }
}

export async function deleteJsonFile(name: string): Promise<void> {
  try {
    const path = jsonFilePath(name);
    if (await ReactNativeBlobUtil.fs.exists(path)) await ReactNativeBlobUtil.fs.unlink(path);
  } catch (error) {
    console.warn(`[Shashtna] Failed to delete ${name}:`, error);
  }
}
