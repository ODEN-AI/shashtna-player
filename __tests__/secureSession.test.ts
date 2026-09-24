import { NativeModules, Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

import { clearConnectionSource, loadConnectionSource, saveConnectionSource } from '../src/lib/connectionSession';
import { __resetSecureStoreForTests } from '../src/lib/secureStore';

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;
const LEGACY = '/docs/shashtna-connection.json';
const SOURCE = 'http://srv.example:8080/get.php?username=bob&password=s3cret&type=m3u_plus';

// Stand-in for the Keystore-backed native module.
const secure = new Map<string, string>();
const nativeStore = {
  setItem: jest.fn(async (k: string, v: string) => {
    secure.set(k, v);
    return true;
  }),
  getItem: jest.fn(async (k: string) => secure.get(k) ?? null),
  removeItem: jest.fn(async (k: string) => {
    secure.delete(k);
    return true;
  }),
};

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
  (NativeModules as any).ShashtnaSecureStore = nativeStore;
  __resetSecureStoreForTests();
});

beforeEach(() => {
  files.clear();
  secure.clear();
});

test('migrates a legacy plaintext session into the secure store and deletes the file', async () => {
  files.set(LEGACY, JSON.stringify({ source: SOURCE, savedAt: 1 }));

  expect(await loadConnectionSource()).toBe(SOURCE); // session survives the update
  expect(files.has(LEGACY)).toBe(false); // plaintext removed
  expect(JSON.parse(secure.get('connection-source') as string).source).toBe(SOURCE);

  expect(await loadConnectionSource()).toBe(SOURCE); // now read from the secure store
});

test('new sessions never touch the plaintext file', async () => {
  await saveConnectionSource(SOURCE);
  expect(files.size).toBe(0);
  expect(await loadConnectionSource()).toBe(SOURCE);
});

test('keeps the plaintext file if the encrypted write fails', async () => {
  nativeStore.setItem.mockResolvedValueOnce(false);
  await saveConnectionSource(SOURCE);
  expect(files.has(LEGACY)).toBe(true);
});

test('sign-out clears both stores', async () => {
  await saveConnectionSource(SOURCE);
  files.set(LEGACY, '{}');
  await clearConnectionSource();
  expect(secure.size).toBe(0);
  expect(files.has(LEGACY)).toBe(false);
  expect(await loadConnectionSource()).toBeNull();
});
