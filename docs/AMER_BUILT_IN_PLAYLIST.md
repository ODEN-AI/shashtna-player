# عامر IPTV built-in playlist («قنوات عامر المباشرة»)

## Where it is

```
android/app/src/amer/assets/playlists/amer-default.m3u
```

- Gradle packages `src/amer/assets` into the **amer flavor only**; Shashtna Player and Shashtna Player Lite do not contain it.
- No channel data lives in source files.

## Updating it

1. Replace `amer-default.m3u` with the new authorized playlist (any M3U; UTF-8, with or without a BOM, LF or CRLF).
2. Build a new APK: `.\gradlew.bat clean assembleAmerRelease`.

Nothing else changes. Every entry is treated as a live channel (the parser's `allLive` option), because short Xtream URLs carry no `/live/` or file-extension signal.

## How the app uses it

- **Source:** `asset:///playlists/amer-default.m3u` (`src/variants/amer/builtInPlaylist.ts`). This is one of the three kinds of the single saved source (`useAmerPlaylist`: builtin / account / file).
- **Launch priority:**
  1. a saved account or M3U file;
  2. otherwise the built-in playlist, straight into Live TV (no sign-in, no picker);
  3. the source screen only when the built-in playlist cannot be loaded («تعذر تحميل قائمة القنوات المدمجة.», with «إعادة المحاولة» and «اختيار مصدر آخر»).
- **Reading:** read-only, through the native chunked reader (`PlaylistPickerModule.openPlaylist`, `asset` scheme → AssetManager), then parsed by the same M3U parser in chunks. It is never copied to user storage or modified. The parsed channels are kept in memory for the app session.
- **Switching:** Settings → «تغيير المصدر» opens the source screen: قنوات عامر المباشرة / بيانات الحساب / ملف M3U.

## Privacy

The stream URLs contain the playlist credentials. They are never logged: diagnostics report counts only. Tests use synthetic fixtures; the one test that reads the real asset asserts counts only.

Anyone who unpacks the APK can read the asset, as with any packaged file.
