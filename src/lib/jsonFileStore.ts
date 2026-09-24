import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * Minimal JSON persistence in the app's document directory, using the same
 * mechanism as connectionSession.ts (no extra storage dependency).
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
  try {
    await ReactNativeBlobUtil.fs.writeFile(jsonFilePath(name), JSON.stringify(value), 'utf8');
  } catch (error) {
    console.warn(`[Shashtna] Failed to write ${name}:`, error);
  }
}
