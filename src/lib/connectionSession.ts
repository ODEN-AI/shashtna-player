import ReactNativeBlobUtil from 'react-native-blob-util';

const SESSION_FILE =
  `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/shashtna-connection.json`;

type SavedConnection = {
  source: string;
  savedAt: number;
};

export async function saveConnectionSource(source: string): Promise<void> {
  const value = String(source || '').trim();

  if (!value) {
    return;
  }

  const payload: SavedConnection = {
    source: value,
    savedAt: Date.now(),
  };

  try {
    await ReactNativeBlobUtil.fs.writeFile(
      SESSION_FILE,
      JSON.stringify(payload),
      'utf8',
    );
  } catch (error) {
    console.warn('[Shashtna] Failed to save connection:', error);
  }
}

export async function loadConnectionSource(): Promise<string | null> {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(SESSION_FILE);

    if (!exists) {
      return null;
    }

    const raw = await ReactNativeBlobUtil.fs.readFile(
      SESSION_FILE,
      'utf8',
    );

    const parsed = JSON.parse(raw) as Partial<SavedConnection>;
    const source = String(parsed.source || '').trim();

    return source || null;
  } catch (error) {
    console.warn('[Shashtna] Failed to load saved connection:', error);
    return null;
  }
}

export async function clearConnectionSource(): Promise<void> {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(SESSION_FILE);

    if (exists) {
      await ReactNativeBlobUtil.fs.unlink(SESSION_FILE);
    }
  } catch (error) {
    console.warn('[Shashtna] Failed to clear saved connection:', error);
  }
}
