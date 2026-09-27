import fs from 'fs';
import path from 'path';

/**
 * M3U import through the Storage Access Framework.
 *
 * 1. Static audit of the native module (PlaylistPickerModule.kt): an implicit
 *    SAF intent flow, no package discovery or pinning, structured results,
 *    private copy. The flow itself (PickerFlow.kt) and the copy
 *    (PlaylistCopier.kt) are JUnit-tested with fake device calls and real files.
 * 2. The JS contract (playlistPicker.ts) against a stand-in for that module:
 *    every native outcome becomes a picked file, null, or a typed error with a
 *    structured code, never a raw native exception.
 */
const dir = path.join(__dirname, '../android/app/src/main/java/com/shashtnaplayer');
const moduleSrc = fs.readFileSync(path.join(dir, 'PlaylistPickerModule.kt'), 'utf8');
const flowSrc = fs.readFileSync(path.join(dir, 'PickerFlow.kt'), 'utf8');

describe('native picker audit (SAF, no package discovery)', () => {
  it('does not discover, choose or pin a file-manager package', () => {
    expect(fs.existsSync(path.join(dir, 'PickerPolicy.kt'))).toBe(false);
    for (const banned of ['queryIntentActivities', 'setClassName', 'setPackage(', 'setComponent', 'PickerPolicy', 'documentsui']) {
      expect(moduleSrc).not.toContain(banned);
    }
    // The only package names in the flow are the AOSP TV platform stubs (skipped, never launched).
    const packages = flowSrc.match(/"[a-z][a-z0-9_]*(\.[a-zA-Z0-9_]+){2,}"/g) || [];
    expect(packages.filter(p => !p.startsWith('"android.intent.action.')).sort()).toEqual([
      '"com.android.tv.frameworkpackagestubs"',
      '"com.google.android.tv.frameworkpackagestubs"',
    ]);
  });

  it('builds implicit OPEN_DOCUMENT / GET_CONTENT intents with OPENABLE and the playlist MIME list', () => {
    expect(moduleSrc).toMatch(/private fun pickerIntent\(attempt: PickerFlow\.Attempt\): Intent =\s*Intent\(attempt\.action\)\.apply \{\s*addCategory\(Intent\.CATEGORY_OPENABLE\)\s*type = PickerFlow\.ANY_TYPE\s*if \(attempt\.filtered\) putExtra\(Intent\.EXTRA_MIME_TYPES, PickerFlow\.PLAYLIST_MIME_TYPES\.toTypedArray\(\)\)/);
    expect(flowSrc).toMatch(/Attempt\(OPEN_DOCUMENT, filtered = true\),\s*Attempt\(OPEN_DOCUMENT, filtered = false\),\s*Attempt\(GET_CONTENT, filtered = true\),\s*Attempt\(GET_CONTENT, filtered = false\)/);
    for (const mime of ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/x-mpegurl', 'text/plain']) {
      expect(flowSrc).toContain(`"${mime}"`);
    }
    expect(moduleSrc).toContain('pm.resolveActivity(pickerIntent(attempt), PackageManager.MATCH_DEFAULT_ONLY)');
    expect(moduleSrc).toContain('activity.startActivityForResult(pickerIntent(attempt), REQUEST_CODE)');
  });

  it('never rejects the picker promise with a raw exception', () => {
    const pickingCode = moduleSrc.slice(moduleSrc.indexOf('fun pickPlaylist('), moduleSrc.indexOf('private fun playlistDir()'));
    expect(pickingCode).not.toMatch(/\.reject\(/);
    expect(pickingCode).toContain('(take() ?: promise).resolve(failure(PickerFlow.PICKER_LAUNCH_FAILED, error.javaClass.simpleName))');
    expect(pickingCode).toContain('catch (_: ActivityNotFoundException)');
  });

  it('copies the picked document into private storage and returns the copy', () => {
    expect(moduleSrc).toContain('open = { context.contentResolver.openInputStream(uri) }');
    expect(moduleSrc).toContain('private fun playlistDir() = File(context.filesDir, PLAYLIST_DIR)');
    expect(moduleSrc).toContain('putString("uri", Uri.fromFile(result.file).toString())');
    expect(moduleSrc).toContain('putString("original", uri.toString())');
  });

  it('takes a persistable grant only when the provider offers one', () => {
    expect(moduleSrc).toMatch(/if \(PickerFlow\.offersPersistableRead\(flags\)\) \{\s*try \{\s*context\.contentResolver\.takePersistableUriPermission/);
  });

  it('AMER_TV_PICKER lines never carry the URI, file name or contents', () => {
    const diagCalls = moduleSrc.match(/diag\("[^\n]*"\)/g) || [];
    expect(diagCalls.length).toBeGreaterThan(5);
    for (const call of diagCalls) {
      expect(call).not.toMatch(/\$\{?uri\b(?!\?\.scheme| != null|\.scheme)|\$\{?name\b|\$original|text|chunk/i);
    }
    expect(moduleSrc).toContain('if (BuildConfig.TV_DIAGNOSTICS) Log.i(DIAG_TAG, message)');
  });

  it('the UTF-8 chunked reader is unchanged', () => {
    expect(moduleSrc).toContain('"content" -> context.contentResolver.openInputStream(parsed) ?: throw FileNotFoundException("The provider returned no data.")');
    expect(moduleSrc).toContain('"file" -> FileInputStream(File(parsed.path ?: ""))');
    expect(moduleSrc).toContain('InputStreamReader(counter, Charsets.UTF_8), BUFFER_CHARS');
  });
});

describe('JS picker contract (structured results, never a raw native error)', () => {
  const RN = require('react-native');
  const { setDiagnosticsSink } = require('../src/lib/tvDiagnostics');
  const picker = require('../src/lib/playlistPicker');
  const { loadLocalPlaylist, PlaylistEmptyError, PlaylistFormatError } = require('../src/lib/m3uCore');
  const { describeConnectionError } = require('../src/screens/Connection/connectionErrors');
  const COPY = 'file:///data/user/0/com.ameriptv.player/files/playlists/import-1.m3u';
  const disk = new Map<string, string>();
  const native = {
    pickPlaylist: jest.fn(),
    reimportPlaylist: jest.fn(),
    prunePlaylists: jest.fn(async () => 0),
    openPlaylist: jest.fn(async (uri: string) => {
      if (!disk.has(uri)) throw Object.assign(new Error('gone'), { code: 'E_NOT_FOUND' });
      return uri;
    }),
    readPlaylistChunk: jest.fn(async (handle: string) => {
      const text = disk.get(handle) ?? null;
      disk.delete(handle);
      return { text, bytes: text ? text.length : 0 };
    }),
    closePlaylist: jest.fn(),
  };
  const lines: string[] = [];
  beforeAll(() => {
    RN.NativeModules.ShashtnaPlaylistPicker = native;
    setDiagnosticsSink((l: string) => lines.push(l));
  });
  afterAll(() => {
    setDiagnosticsSink(null);
    delete RN.NativeModules.ShashtnaPlaylistPicker;
  });
  beforeEach(() => {
    lines.length = 0;
    jest.clearAllMocks();
  });

  it('OPEN_DOCUMENT success: resolves the private copy (never the provider URI) and logs PICKED', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'picked', uri: COPY, name: 'tv.m3u', size: 120, original: 'content://docs/document/7' });
    await expect(picker.pickPlaylistFile()).resolves.toEqual({ uri: COPY, name: 'tv.m3u', size: 120, original: 'content://docs/document/7' });
    expect(lines).toEqual(['AMER_TV_PICKER {"stage":"js:result","code":"PICKED","size":120}']);
  });

  it('no picker on the device: PICKER_UNAVAILABLE', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'PICKER_UNAVAILABLE', reason: 'only platform stubs' });
    const error = await picker.pickPlaylistFile().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(picker.PickerUnavailableError);
    expect(error.code).toBe('PICKER_UNAVAILABLE');
    expect(describeConnectionError(error, true).message).toContain('تعذر فتح مدير الملفات على هذا الجهاز');
  });

  it('the picker threw on launch: PICKER_LAUNCH_FAILED; a raw native rejection is mapped the same way', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'PICKER_LAUNCH_FAILED', reason: 'SecurityException' });
    expect((await picker.pickPlaylistFile().catch((e: unknown) => e)).code).toBe('PICKER_LAUNCH_FAILED');
    native.pickPlaylist.mockRejectedValueOnce(new Error('java.lang.IllegalStateException: boom'));
    const raw = await picker.pickPlaylistFile().catch((e: unknown) => e);
    expect(raw).toBeInstanceOf(picker.PickerUnavailableError);
    expect(raw.code).toBe('PICKER_LAUNCH_FAILED');
    expect(String(raw.message)).not.toContain('IllegalStateException');
    // An unexpected shape is not trusted either.
    native.pickPlaylist.mockResolvedValueOnce({ uri: 'content://legacy' });
    expect((await picker.pickPlaylistFile().catch((e: unknown) => e)).code).toBe('PICKER_LAUNCH_FAILED');
  });

  it('user cancellation resolves null and logs PICKER_CANCELLED', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'cancelled' });
    expect(await picker.pickPlaylistFile()).toBeNull();
    expect(lines).toEqual(['AMER_TV_PICKER {"stage":"js:result","code":"PICKER_CANCELLED"}']);
  });

  it('double press: one native picker at a time (JS guard and PICKER_BUSY)', async () => {
    let answer: (v: unknown) => void = () => {};
    native.pickPlaylist.mockImplementationOnce(() => new Promise(resolve => (answer = resolve)));
    const first = picker.pickPlaylistFile();
    expect(await picker.pickPlaylistFile()).toBeNull(); // second press while the first is open
    expect(native.pickPlaylist).toHaveBeenCalledTimes(1);
    answer({ status: 'cancelled' });
    expect(await first).toBeNull();
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'PICKER_BUSY', reason: 'already_open' });
    expect(await picker.pickPlaylistFile()).toBeNull();
    // Afterwards a new press opens the picker again.
    native.pickPlaylist.mockResolvedValueOnce({ status: 'cancelled' });
    await picker.pickPlaylistFile();
    expect(native.pickPlaylist).toHaveBeenCalledTimes(3);
  });

  it('missing read permission: FILE_READ_FAILED (permission) with the Arabic read message', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'FILE_READ_FAILED', reason: 'permission' });
    const error = await picker.pickPlaylistFile().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(picker.PlaylistReadError);
    expect([error.code, error.reason]).toEqual(['FILE_READ_FAILED', 'permission']);
    const shown = describeConnectionError(error, true);
    expect(shown.message).toContain('تعذر قراءة ملف M3U');
    expect(shown.technical).toContain('FILE_READ_FAILED:permission');
  });

  it('an empty document: EMPTY_M3U (the empty-file message)', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'EMPTY_M3U', reason: 'empty' });
    const error = await picker.pickPlaylistFile().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlaylistEmptyError);
    expect(error.code).toBe('EMPTY_M3U');
  });

  it('a valid M3U copy parses into channels (content read from the private copy)', async () => {
    disk.set(COPY, '#EXTM3U\n#EXTINF:-1 group-title="أخبار",قناة ١\nhttp://e/1.ts\n#EXTINF:-1,قناة ٢\nhttp://e/2.ts\n');
    const channels = await loadLocalPlaylist(COPY, undefined, undefined, { liveOnly: true });
    expect(channels.map((c: { name: string }) => c.name)).toEqual(['قناة ١', 'قناة ٢']);
    expect(native.openPlaylist).toHaveBeenCalledWith(COPY);
  });

  it('an invalid file: INVALID_M3U', async () => {
    disk.set(COPY, 'this is not a playlist\njust text\n');
    const error = await loadLocalPlaylist(COPY, undefined, undefined, { liveOnly: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlaylistFormatError);
    expect(error.code).toBe('INVALID_M3U');
  });

  it('a copy that disappeared: FILE_READ_FAILED (not_found)', async () => {
    const error = await loadLocalPlaylist(COPY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(picker.PlaylistReadError);
    expect(error.reason).toBe('not_found');
  });

  it('saving a source keeps only its private copy; clearing it removes all copies', async () => {
    const { saveConnectionSource, clearConnectionSource } = require('../src/lib/connectionSession');
    await saveConnectionSource(COPY);
    await new Promise(r => setTimeout(r, 0));
    expect(native.prunePlaylists).toHaveBeenLastCalledWith([COPY]);
    await clearConnectionSource();
    await new Promise(r => setTimeout(r, 0));
    expect(native.prunePlaylists).toHaveBeenLastCalledWith([]);
  });

  it('"read the file again" re-copies the original document; a gone original is FILE_READ_FAILED', async () => {
    native.reimportPlaylist.mockResolvedValueOnce({ status: 'picked', uri: COPY, name: 'tv.m3u', size: 10, original: 'content://docs/document/7' });
    await expect(picker.reimportPlaylistFile('content://docs/document/7')).resolves.toMatchObject({ uri: COPY });
    native.reimportPlaylist.mockResolvedValueOnce({ status: 'error', code: 'FILE_READ_FAILED', reason: 'not_found' });
    expect((await picker.reimportPlaylistFile('content://docs/document/7').catch((e: unknown) => e)).reason).toBe('not_found');
  });
});
