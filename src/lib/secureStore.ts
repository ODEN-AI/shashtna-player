import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

/**
 * JS access to ShashtnaSecureStore (android/app/.../SecureStoreModule.kt):
 * AES-256-GCM with a non-exportable Android Keystore key.
 *
 * `isSecureStoreAvailable()` is false where the native module does not exist
 * (Jest, iOS builds without an equivalent); callers decide the fallback.
 */
type SecureStoreNative = {
  setItem(key: string, value: string): Promise<boolean>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<boolean>;
};

function resolveNative(): SecureStoreNative | null {
  // Legacy (non-codegen) modules are exposed through NativeModules; the
  // TurboModuleRegistry lookup covers the bridgeless interop path as well.
  const fromLegacy = (NativeModules as Record<string, unknown>).ShashtnaSecureStore as SecureStoreNative | undefined;
  if (fromLegacy?.getItem) return fromLegacy;
  try {
    const fromTurbo = TurboModuleRegistry.get<any>('ShashtnaSecureStore') as SecureStoreNative | null;
    if (fromTurbo?.getItem) return fromTurbo;
  } catch {
    // Not registered on this platform.
  }
  return null;
}

let cached: SecureStoreNative | null | undefined;
const native = () => (cached === undefined ? (cached = resolveNative()) : cached);

export function isSecureStoreAvailable(): boolean {
  return Platform.OS === 'android' && native() !== null;
}

export async function secureGet(key: string): Promise<string | null> {
  const store = native();
  return store ? store.getItem(key) : null;
}

export async function secureSet(key: string, value: string): Promise<boolean> {
  const store = native();
  if (!store) return false;
  return Boolean(await store.setItem(key, value));
}

export async function secureRemove(key: string): Promise<void> {
  const store = native();
  if (store) await store.removeItem(key);
}

/** Test hook: reset the cached lookup. */
export function __resetSecureStoreForTests() {
  cached = undefined;
}
