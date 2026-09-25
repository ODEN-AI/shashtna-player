# Shashtna Player & Shashtna Player Lite

One codebase, two Android apps.

| | Shashtna Player (Full) | Shashtna Player Lite |
|---|---|---|
| Content | Live TV, Movies, Series | Live TV only |
| Android flavor | `full` | `lite` |
| applicationId | `com.shashtnaplayer` (unchanged) | `com.shashtnaplayer.lite` |
| Launcher name | Shashtna Player | Shashtna Player Lite |
| JS entry | `index.js` → `App.tsx` | `index.lite.js` → `src/variants/lite/LiteApp.tsx` |
| Pages | Home, Live TV, Movies, Series, Favorites, Settings | البث المباشر (Live TV, start page), الإعدادات (Settings) — nothing else |
| Xtream requests on load | 6 (live, VOD, series + categories) | 2 (live + live categories) |
| Favorites | Favorites page + Favorites category in Live TV | channel-level only (long-press OK, heart on the card); no page or category |
| Stored library cache | live, movies, series | live rows only |

The two apps have different applicationIds, so both can be installed on the
same TV box or phone at the same time, each with its own login, cache and
favorites.

## Building

From `android/` (Windows: `.\gradlew.bat`, macOS/Linux: `./gradlew`):

| Command | Output APK |
|---|---|
| `gradlew clean assembleFullDebug` | `android/app/build/outputs/apk/full/debug/app-full-debug.apk` |
| `gradlew clean assembleLiteDebug` | `android/app/build/outputs/apk/lite/debug/app-lite-debug.apk` |
| `gradlew clean assembleFullRelease` | `android/app/build/outputs/apk/full/release/app-full-release.apk` |
| `gradlew clean assembleLiteRelease` | `android/app/build/outputs/apk/lite/release/app-lite-release.apk` |

`gradlew assembleDebug` / `assembleRelease` build both editions.

Release signing is unchanged: set `SHASHTNA_UPLOAD_STORE_FILE`,
`SHASHTNA_UPLOAD_STORE_PASSWORD`, `SHASHTNA_UPLOAD_KEY_ALIAS` and
`SHASHTNA_UPLOAD_KEY_PASSWORD` (e.g. in `~/.gradle/gradle.properties`); the
same key signs both editions.

Debug builds load JavaScript from Metro (`npm start`). Each edition asks
Metro for its own entry module (`BuildConfig.JS_MAIN_MODULE`), so one Metro
server serves both. Release builds embed the bundle; the Lite release bundle
is built from `index.lite.js` (see `android/app/build.gradle`).

### Lite release bundle: why it once contained the Full app

An installed Lite release APK used to open the Full UI (Home, Movies, Series,
ads). The React Native Gradle plugin registers `createBundle<Variant>JsAndAssets`
inside its own `androidComponents.onVariants` callback, and the `register`
action sets `entryFile` to `index.js`. The old Lite override was a
`tasks.matching { … }.configureEach { entryFile.set(…) }` block: Gradle runs
container-level `configureEach` actions *before* the action passed to
`register`, so the plugin overwrote the override and the Lite release bundle
was built from `index.js` → `App.tsx`. (Debug builds were unaffected: they ask
Metro for `JS_MAIN_MODULE`, which is why the bug only showed in release APKs.)

The fix sets the entry from a later `androidComponents.onVariants` callback
with `tasks.named(…).configure { … }`, which runs after the plugin's action.
A build guard then makes a wrong bundle impossible to ship:

- before bundling, each `createBundle(Full|Lite)*JsAndAssets` task fails if its
  entry is not `index.js` (Full) / `index.lite.js` (Lite);
- after bundling, it fails unless the bundle contains its own edition marker
  (`shashtna-edition:full` in `App.tsx`, `shashtna-edition:lite` in
  `LiteApp.tsx`) and not the other one.

A successful release build prints e.g.
`createBundleLiteReleaseJsAndAssets: verified index.android.bundle (entry index.lite.js, marker shashtna-edition:lite)`.

To check an APK by hand: `aapt dump badging app-lite-release.apk` (package
`com.shashtnaplayer.lite`, label `Shashtna Player Lite`), then unzip
`assets/index.android.bundle` and search it for `shashtna-edition:lite`
(Hermes bytecode keeps string literals, so a plain byte search works).

Install side by side:

```
adb install -r android/app/build/outputs/apk/full/debug/app-full-debug.apk
adb install -r android/app/build/outputs/apk/lite/debug/app-lite-debug.apk
```

### What Lite does not contain

Lite's JS bundle is built from `index.lite.js` → `LiteApp.tsx`, which never
imports `App.tsx`, Home, Movies, Series, the Favorites page, the movie/series
detail pages, the library grid, TMDB, the advertisement carousel, Continue
Watching, the Xtream VOD module (`src/lib/xtreamVod.ts`) or movie/series
indexing (`src/features/catalog/mediaCatalog.ts`). None of that code, and none
of the banner artwork, is in the Lite APK.

The Full root injects its VOD pieces through an `Edition` object
(`src/app/edition.ts`): `loadVod` (Xtream movie + series requests),
`indexMedia` (movie/series cards) and, via `src/features/player/resumeRegistry.ts`,
the Continue Watching store. The Lite edition is `{ id: 'lite', liveOnly: true }`,
so the shared code has nothing VOD-related to call. The player receives the
detail pages as a prop from the Full app only.

Checks: `__tests__/liteBoundaries.test.ts` walks the import graph from
`index.lite.js` and fails if any of those modules becomes reachable;
`__tests__/liteApp.test.tsx` renders the Lite root (login without Movies/Series,
Live TV right after connecting, only Live TV + Settings in the sidebar).

Measured on the production Metro bundles (source maps): Lite has 48 app
modules, Full 70; Lite's embedded bundle is ~3.06 MB JS / ~2.00 MB Hermes
bytecode vs ~3.30 MB / ~2.17 MB for Full.

Shared by both: connection screen, session/restore, catalog indexes, M3U and
Xtream parsing, player (zapping, audio/subtitles, retry, diagnostics),
favorites, theme/accent, Arabic RTL, TV focus rules.

## Connecting (IPTV)

The connection type shown to users is always **IPTV**, provided in one of
three ways:

1. **Account** — server, username, password (Xtream API).
2. **M3U link** — a playlist URL. A pasted Xtream `get.php?username=…` link is
   recognised and loaded through the API.
3. **M3U file** — an `.m3u` / `.m3u8` file picked with the system file picker.

### Server address normalisation

`src/lib/serverUrl.ts` is the single normaliser used for display, validation,
connecting and the saved source:

- `example.com:8080` → `http://example.com:8080`
- `http://…` and `https://…` are left as they are (any explicit scheme is kept)
- whitespace is trimmed; trailing slashes are removed from the path only
- ports, paths, query strings and fragments are preserved

### M3U file import

- The picker is a small native module (`PlaylistPickerModule.kt`, platform
  APIs only). It uses `ACTION_OPEN_DOCUMENT`, and falls back to
  `ACTION_GET_CONTENT` on TV boxes without the Documents UI. If a device has
  no file manager at all, the user is told to use the link instead.
- The picked `content://` URI is streamed (256 KB chunks) and parsed line by
  line; the file is never copied or loaded into memory whole. UTF-8 is decoded
  natively, so Arabic names are not broken at chunk boundaries.
- Progress shows the percentage read and the number of entries found.
- Files are validated (`#EXTM3U` / `#EXTINF`); anything else is rejected with
  a clear message. Logos (`tvg-logo`), groups (`group-title`), `tvg-id` and
  `tvg-name` are kept.
- A persistable read permission is taken when the provider offers it, so the
  library reloads from the same file on the next launch. If the file was
  deleted or access was revoked, the app returns to the connection screen.
- Imported files use the same parser and data model as playlist links.

## Performance architecture

Measured on a synthetic 115k-entry library (15k live, 60k movies, 40k episodes)
with the previous and the new code (Node; Hermes on a TV box is roughly
10–30× slower in absolute terms):

| Work | Before | After |
|---|---|---|
| Deriving data when visiting Home, Movies, Series, Favorites, Live once | ~900 ms, repeated on every visit | 336 ms once per library load; visits read indexes (~0 ms) |
| Changing Live category | scan of all live channels | Map lookup |
| Typing a 5-letter search in Movies | 5 full scans with lowercasing | incremental refinement on precomputed keys, debounced |
| A–Z sort | `localeCompare` per comparison, every time | shared `Intl.Collator`, cached per list |
| Toggling a favorite | re-render of App, page and all visible cards | re-render of that card only |
| Reading a 50 MB M3U file | ~80 s of built-in pauses (64 KB + 100 ms) | ~1 s of pauses (256 KB + 4 ms) |
| Relaunching the app | full re-download and parse | restored from cache (Xtream, 12 h) |

Building blocks:

- `src/features/catalog/catalog.ts` — one pass per loaded source builds live,
  movie and series lists, category counts, category → items maps, search keys
  and key maps. Built in chunks so the UI stays responsive.
- `src/features/catalog/search.ts` — incremental search and cached sorting.
- `src/features/catalog/catalogCache.ts` — on-disk cache of Xtream libraries.
  Stream URLs are stored with `{u}`/`{p}` placeholders and completed from the
  Keystore-encrypted session, so the cache contains no credentials. Settings →
  *Refresh library* reloads from the provider immediately.
- `src/features/favorites/favoritesStore.ts` — favorites as a subscribable
  store (per-key subscriptions).
- Lists are virtualised with fixed row heights (`getItemLayout`), posters and
  logos decode at view size (`resizeMethod="resize"`), only visible rows load
  artwork.
- No new database or state library was added: the catalog lives in memory as
  plain indexes, and persistence uses the existing JSON file store.

## TV remote behaviour

Rules (see `src/navigation/tvFocus.tsx`):

- **Regions remember focus**: sidebar, page content, each Home row, Live
  category pane and channel grid, library toolbar and grid, Favorites.
  Re-entering a region returns to the element focused there last.
- **First focus per page**: Home → last opened card or the first quick
  destination; Movies/Series → last opened card or the first card; Live → the
  channel just watched or the active category; Favorites → last or first item;
  Settings → first option; login → server field.
- **Coming back restores the place**: the library keeps category, sort, search
  and the focused card across the player and detail pages; Live TV returns to
  the channel that was playing.
- **Lists that change don't steal focus**: after changing category, sort or
  search, focus stays on the control the user is using.
- **Dialogs trap focus** and focus the selected option first; BACK closes them.
- **BACK**: player → the page it was opened from; any page → the start page
  (Home in Full, Live TV in Lite); start page → exit.
- **Channels**: long-press OK on a channel adds/removes it from Favorites (a
  heart marks it). In Full, the Favorites category in Live TV and the
  Favorites page zap within favorites; Lite has neither.

### Testing on a device

On an Android TV / TV box (or the Android TV emulator), with the remote or
`adb shell input keyevent` (19 up, 20 down, 21 left, 22 right, 23 OK, 4 back):

1. Login: D-pad through the method tabs (OK switches), fields, Sign in.
2. Home: UP/DOWN between rows returns to each row's last card; open a movie,
   BACK, the same card is focused.
3. Movies: pick a category and A–Z, open a title, BACK: category, sort and the
   card are restored.
4. Live TV: LEFT/RIGHT between categories and channels (mirrored in Arabic);
   open a channel, zap with UP/DOWN, BACK: the last channel is focused;
   change category: focus stays in the category pane.
5. Long-press OK on a channel, then open the Favorites category.
6. Open the category sheet: the selected category is focused; BACK closes it.
7. Repeat in Shashtna Player Lite: the sidebar has only البث المباشر and
   الإعدادات, and Live TV opens right after signing in.
