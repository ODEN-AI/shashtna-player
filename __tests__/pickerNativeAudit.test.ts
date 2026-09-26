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
    expect(moduleSrc).toMatch(/for \(launch in decision\.launches\) \{\s*val intent = pickerIntent\(launch\.action\)\.setClassName\(launch\.packageName, launch\.activityName\)/);
    // The old implicit / "legacy" paths are gone.
    expect(moduleSrc).not.toMatch(/Legacy|listOf\(openDocument, getContent\)|handlersOf/);
  });

  it('no safe picker ends in E_NO_PICKER (shown as «تعذر فتح مدير الملفات على هذا الجهاز»)', () => {
    expect(moduleSrc).toContain('take()?.reject("E_NO_PICKER"');
    const errors = fs.readFileSync(path.join(__dirname, '../src/screens/Connection/connectionErrors.ts'), 'utf8');
    expect(errors).toContain('تعذر فتح مدير الملفات على هذا الجهاز');
  });

  it('no device-specific package is hardcoded (only the framework stub packages)', () => {
    const packages = policySrc.match(/"[a-z][a-z0-9_]*(\.[a-zA-Z0-9_]+){2,}"/g) || [];
    expect(packages.sort()).toEqual(['"com.android.tv.frameworkpackagestubs"', '"com.google.android.tv.frameworkpackagestubs"']);
    expect(moduleSrc).not.toMatch(/"com\.(?!shashtnaplayer)[a-z0-9_.]+"/i);
  });

  it('AMER_TV_PICKER lines never carry the picked URI, file name or contents', () => {
    const diagCalls = moduleSrc.match(/diag\("[^\n]*"\)/g) || [];
    expect(diagCalls.length).toBeGreaterThan(5);
    for (const call of diagCalls) {
      expect(call).not.toMatch(/\$\{?uri|\$\{?name|data\?\.data\}|\.data\b(?! != null)|text|chunk/i);
    }
    expect(moduleSrc).toContain('if (BuildConfig.TV_DIAGNOSTICS) Log.i(DIAG_TAG, message)');
  });

  it('package-manager queries run off the UI thread; picker state stays on it', () => {
    expect(moduleSrc).toMatch(/io\.execute \{[\s\S]*?PickerPolicy\.decide\(candidates\(\), context\.packageName\)[\s\S]*?UiThreadUtil\.runOnUiThread \{ launchPicker\(promise, decision\) \}/);
  });

  it('the content:// UTF-8 chunked reader is still the ContentResolver path', () => {
    expect(moduleSrc).toContain('context.contentResolver.openInputStream(parsed)');
    expect(moduleSrc).toContain('InputStreamReader(counter, Charsets.UTF_8), BUFFER_CHARS');
    expect(moduleSrc).toContain('fun readPlaylistChunk(handle: String, maxChars: Double, promise: Promise)');
  });
});
