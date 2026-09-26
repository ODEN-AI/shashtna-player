import fs from 'fs';
import path from 'path';

/**
 * Static audit of the native M3U picker (PlaylistPickerModule.kt), for the real
 * TV box that opened a factory test app: no launch path may reach an activity
 * the capability policy (PickerPolicy.kt, JUnit-tested) did not accept.
 */
const dir = path.join(__dirname, '../android/app/src/main/java/com/shashtnaplayer');
const moduleSrc = fs.readFileSync(path.join(dir, 'PlaylistPickerModule.kt'), 'utf8');
const policySrc = fs.readFileSync(path.join(dir, 'PickerPolicy.kt'), 'utf8');

describe('native picker audit', () => {
  it('launches only activities the policy accepted, pinned to their exact component', () => {
    const launches = moduleSrc.match(/startActivityForResult\(/g) || [];
    expect(launches.length).toBe(1);
    expect(moduleSrc).toMatch(/for \(launch in decision\.launches\) \{\s*val intent = pickerIntent\(launch\.action, launch\.openable\)\.setClassName\(launch\.packageName, launch\.activityName\)/);
    // The old implicit / "legacy" paths are gone.
    expect(moduleSrc).not.toMatch(/Legacy|listOf\(openDocument, getContent\)|handlersOf/);
  });

  it('no safe picker ends in E_NO_PICKER (shown as «تعذر فتح مدير الملفات على هذا الجهاز»)', () => {
    expect(moduleSrc).toContain('take()?.reject("E_NO_PICKER"');
    const errors = fs.readFileSync(path.join(__dirname, '../src/screens/Connection/connectionErrors.ts'), 'utf8');
    expect(errors).toContain('تعذر فتح مدير الملفات على هذا الجهاز');
  });

  it('no device-specific package is hardcoded (only the framework stub packages)', () => {
    // Permission names (android.permission.*) are capabilities, not packages.
    const packages = (policySrc.match(/"[a-z][a-z0-9_]*(\.[a-zA-Z0-9_]+){2,}"/g) || []).filter(p => !p.startsWith('"android.permission.'));
    expect(packages.sort()).toEqual(['"com.android.tv.frameworkpackagestubs"', '"com.google.android.tv.frameworkpackagestubs"']);
    expect(moduleSrc).not.toMatch(/"com\.(?!shashtnaplayer)[a-z0-9_.]+"/i);
  });

  it('AMER_TV_PICKER lines never carry the picked URI, file name or contents', () => {
    const diagCalls = moduleSrc.match(/diag\("[^\n]*"\)/g) || [];
    expect(diagCalls.length).toBeGreaterThan(5);
    for (const call of diagCalls) {
      // Allowed: whether a document came back and its scheme (content/file); never the URI itself.
      expect(call).not.toMatch(/\$\{?uri|\$\{?name|data\?\.data\}|\.data\b(?! != null)(?!\?\.scheme)|text|chunk/i);
    }
    expect(moduleSrc).toContain('if (BuildConfig.TV_DIAGNOSTICS) Log.i(DIAG_TAG, message)');
  });

  it('package-manager queries run off the UI thread; picker state stays on it', () => {
    expect(moduleSrc).toMatch(/io\.execute \{[\s\S]*?val found = candidates\(\)[\s\S]*?PickerPolicy\.decide\(found, context\.packageName\)[\s\S]*?UiThreadUtil\.runOnUiThread \{ launchPicker\(promise, decision\) \}/);
  });

  it('discovery also finds OEM file managers without OPENABLE / DEFAULT, from a fixed set of queries', () => {
    // Both forms, every discovery type, and no MATCH_DEFAULT_ONLY (the activity is launched explicitly).
    expect(moduleSrc).toMatch(/for \(openable in listOf\(true, false\)\)/);
    expect(moduleSrc).toMatch(/QUERY_TYPES = listOf\("\*\/\*", "text\/plain", "audio\/x-mpegurl", "application\/vnd\.apple\.mpegurl", "application\/octet-stream"\)/);
    expect(moduleSrc).toContain('pm.queryIntentActivities(pickerIntent(action, openable, mime), PackageManager.GET_RESOLVED_FILTER)');
    expect(moduleSrc).not.toMatch(/queryIntentActivities\([^\n]*MATCH_DEFAULT_ONLY/);
    // Whether it takes OPENABLE comes from its own filter, not from the query that found it.
    expect(moduleSrc).toContain('if (filter.hasCategory(Intent.CATEGORY_OPENABLE)) entry.openable = true');
    const manifest = fs.readFileSync(path.join(__dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8');
    const queries = manifest.slice(manifest.indexOf('<queries>'), manifest.indexOf('</queries>'));
    expect(queries).toMatch(/GET_CONTENT" \/>\s*<data android:mimeType="\*\/\*" \/>/); // without OPENABLE
    expect(queries).toMatch(/OPEN_DOCUMENT" \/>\s*<data android:mimeType="\*\/\*" \/>/);
    expect(queries).toContain('android.content.action.DOCUMENTS_PROVIDER');
  });

  it('the launched MIME stays the wildcard (a text/plain launch would hide .m3u = audio/x-mpegurl)', () => {
    expect(moduleSrc).toContain('private const val PICK_MIME = "*/*"');
    expect(moduleSrc).toMatch(/private fun pickerIntent\(action: PickerPolicy\.Action, openable: Boolean = true, mime: String = PICK_MIME\)/);
  });

  it('the device inventory runs only in the diagnostics build', () => {
    expect(moduleSrc).toMatch(/private fun logInventory\([^)]*\) \{\s*if \(!BuildConfig\.TV_DIAGNOSTICS\) return/);
  });

  it('the content:// UTF-8 chunked reader is still the ContentResolver path', () => {
    expect(moduleSrc).toContain('context.contentResolver.openInputStream(parsed)');
    expect(moduleSrc).toContain('InputStreamReader(counter, Charsets.UTF_8), BUFFER_CHARS');
    expect(moduleSrc).toContain('fun readPlaylistChunk(handle: String, maxChars: Double, promise: Promise)');
  });
});

describe('JS picker outcome (AMER_TV_PICKER under ReactNativeJS)', () => {
  const RN = require('react-native');
  const { setDiagnosticsSink } = require('../src/lib/tvDiagnostics');
  const { pickPlaylistFile, PickerUnavailableError } = require('../src/lib/playlistPicker');
  const lines: string[] = [];
  const native = { pickPlaylist: jest.fn() };
  beforeAll(() => {
    RN.NativeModules.ShashtnaPlaylistPicker = native;
    setDiagnosticsSink((l: string) => lines.push(l));
  });
  afterAll(() => {
    setDiagnosticsSink(null);
    delete RN.NativeModules.ShashtnaPlaylistPicker;
  });
  beforeEach(() => (lines.length = 0));

  it('logs the exact native code, and E_NO_PICKER still becomes the Arabic picker error', async () => {
    native.pickPlaylist.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'E_NO_PICKER' }));
    await expect(pickPlaylistFile()).rejects.toBeInstanceOf(PickerUnavailableError);
    expect(lines).toEqual(['AMER_TV_PICKER {"stage":"js:result","code":"E_NO_PICKER"}']);
  });

  it('a picked file logs PICKED without its URI or name; cancel logs CANCELLED and the next attempt works', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ uri: 'content://x/document/secret.m3u', name: 'secret.m3u', size: 10 });
    await pickPlaylistFile();
    native.pickPlaylist.mockResolvedValueOnce(null);
    expect(await pickPlaylistFile()).toBeNull();
    native.pickPlaylist.mockResolvedValueOnce({ uri: 'content://x/document/2', name: 'b.m3u', size: 1 });
    expect(await pickPlaylistFile()).toMatchObject({ name: 'b.m3u' });
    expect(lines.slice(0, 2)).toEqual(['AMER_TV_PICKER {"stage":"js:result","code":"PICKED"}', 'AMER_TV_PICKER {"stage":"js:result","code":"CANCELLED"}']);
    expect(lines.join('\n')).not.toMatch(/content:|secret|\.m3u/);
  });
});
