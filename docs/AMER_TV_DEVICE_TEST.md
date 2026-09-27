# عامر IPTV — real Android TV / TV box validation

These three bugs were seen only on a real TV. Jest, the web E2E and the JUnit
policy tests cover the logic, but **the release gate is this procedure on the
device**. Nothing below counts as "fixed on TV" until it has been observed there.

## Build and install

```
cd android
.\gradlew.bat clean assembleAmerRelease
adb connect <tv-ip>:5555            # or USB
adb install -r app\build\outputs\apk\amer\release\app-amer-release.apk
```

Diagnostics are on in this build:
- JS: `tvDiagnostics: 'on'` in `src/variants/amer/brand.ts`;
- native: `BuildConfig.TV_DIAGNOSTICS`, from the amer flavor, unless the build
  used `-PtvDiagnostics=false`.

For a public release, set it to `'off'` and build with `-PtvDiagnostics=false`.
The logs never contain credentials, stream/server URLs, tokens, file names or
playlist contents.

Capture the logs while testing:

```
adb logcat -c
adb logcat -s ReactNativeJS:V AMER_TV_PICKER:V > amer-tv.log
```

## 1. Physical UP/DOWN zapping

Open a live channel from Live TV, wait for it to play, then press:
- UP
- UP
- DOWN
- CH+ (if the remote has it)
- UP held down for about 1 s

Expected on screen:
- UP → next channel, DOWN → previous channel;
- no OK press, no controls opening first, no focus jumps;
- rapid presses coalesce into one switch (450 ms);
- at the first/last channel, the existing "first/last channel" banner shows, with no wrap-around.

Expected in `amer-tv.log`, one sequence per press:

```
AMER_TV_INPUT {"stage":"event","eventType":"up","eventKeyAction":1,"reachedPlayer":true,...,"decision":"zap"}
AMER_TV_INPUT {"stage":"zap:pending","source":"remote:up","fromIndex":4,"targetIndex":5,...}
AMER_TV_INPUT {"stage":"tuneTo:start","source":"remote:up","targetIndex":5,...}
AMER_TV_INPUT {"stage":"tuneTo:complete","targetIndex":5,"ms":...}
```

How to read the result:

| What the log shows | Meaning |
|---|---|
| No `AMER_TV_INPUT` line at all | The key did not reach JS. The native layer or another app consumed it (report the TV model). |
| `eventKeyAction` other than 1 | The device uses a different key contract. Report it. |
| `decision` is not `zap` | The reason is in `decision` (`ignored:channel-list-open`, `ignored:menu-open`, ...). |
| `tuneTo:start` without `tuneTo:complete` | The stream did not load (a provider problem, not the remote). |

## 2. «قائمة القنوات»

In the player, wake the controls and press «قائمة القنوات».

Expected on screen:
- the side panel lists the channels of the category the channel was opened from;
- the playing channel is highlighted, focused and marked «يعرض الآن»;
- the video keeps playing behind the panel;
- UP/DOWN move through the list without changing the channel;
- OK on a row tunes to that channel at once and closes the list;
- BACK closes the list and focus returns to «قائمة القنوات»;
- a second BACK leaves the player;
- once the list is closed, UP/DOWN zap again.

Expected in the log:

```
AMER_TV_CHANNELS {"stage":"open","scope":"<category>","currentIndex":..,"queueCount":N,"firstName":..,"lastName":..}
AMER_TV_CHANNELS {"stage":"panel:mount","receivedCount":N,"rowCount":..,"currentRow":..}
AMER_TV_CHANNELS {"stage":"panel:layout","listHeight":>0,...}
AMER_TV_CHANNELS {"stage":"panel:rows-visible","renderedRows":>0,...}
AMER_TV_INPUT    {"stage":"tuneTo:start","source":"channel-list",...}      (after OK on a row)
```

How to read the result:
- `queueCount` and `receivedCount` must be equal.
- `panel:zero-height`, or no `panel:rows-visible` line, means the layout is still wrong on this device. Send the log.

## 3. «إضافة ملف M3U» (Storage Access Framework import)

How it works:
- **Picker:** an implicit Storage Access Framework intent. The app never chooses a file-manager package; Android resolves the intent to the device's document picker, or shows its own chooser.
  1. `ACTION_OPEN_DOCUMENT` + `CATEGORY_OPENABLE`, filtered to playlist types with `EXTRA_MIME_TYPES` (`application/vnd.apple.mpegurl`, `application/x-mpegurl`, `audio/x-mpegurl`, `text/plain`, `audio/mpegurl`, `application/octet-stream`);
  2. the same with the wildcard type only, if (1) could not be launched;
  3. `ACTION_GET_CONTENT`, same two forms;
  4. otherwise the Arabic message «تعذر فتح مدير الملفات على هذا الجهاز».

  If `OPEN_DOCUMENT` resolves to the Android TV platform stub (a TV image with no DocumentsUI), the flow goes straight to `GET_CONTENT`.
- **Import:** the picked document is copied into the app's private storage (`files/playlists/import-*.m3u`, streamed in 64 KB blocks). Parsing and every later restart use that copy. Removing the original file, revoking access or unplugging the USB stick no longer breaks the channel list.
- **Housekeeping:** only the copy that is the current source is kept.
- **«إعادة قراءة الملف»:** copies the original again, when it is still readable.

Expected on the TV:
- Pressing the field shows «جاري فتح مدير الملفات…», and a second press does nothing.
- The device's picker opens: DocumentsUI, the TV's own explorer, or a chooser. Which one depends on the device, not on the app.
- Pick an `.m3u`: the channels load.
- Cancel: the loading state disappears and pressing again reopens the picker.

### 3a. Evidence

```
adb logcat -c
adb logcat -s AMER_TV_PICKER:V ReactNativeJS:V > picker.log     (press «إضافة ملف M3U», pick a file)
```

| Line | Meaning |
|---|---|
| `attempt OPEN_DOCUMENT+playlistTypes category=OPENABLE type=*/* mimeTypes=[...] resolveActivity=<pkg/activity or none-visible>` | Chosen action, MIME list, and what Android resolves it to (logged only) |
| `skip OPEN_DOCUMENT: resolves to the Android TV platform stub` | No DocumentsUI on this TV: falls through to GET_CONTENT |
| `launched ...` / `not launched ...: <error>` | Launch success or failure per attempt |
| `picker error code=PICKER_UNAVAILABLE / PICKER_LAUNCH_FAILED` | Nothing could be opened (the Arabic message is shown) |
| `result resultCode=-1 uri=true scheme=content flags=0x...` | What came back: scheme and permission flags (never the URI) |
| `grant persistable=taken / not_offered / refused` | Persistable permission, only when offered |
| `copy ok bytes=N` / `copy failed code=FILE_READ_FAILED reason=permission / not_found / io / too_large` / `code=EMPTY_M3U` | The private copy |
| `AMER_TV_PICKER {"stage":"js:result","code":"PICKED" / "PICKER_CANCELLED" / ...}` (ReactNativeJS) | Structured outcome in JS |
| `AMER_TV_PICKER {"stage":"import:parsed","kind":"file","liveChannels":N}` | Final parsed live-channel count |

### 3b. What this cannot fix on its own

- **No working document picker at all** (`OPEN_DOCUMENT` only resolves to the platform stub, and nothing usable answers `GET_CONTENT`): the result is PICKER_UNAVAILABLE. A future option is an in-app browser, but `ACTION_OPEN_DOCUMENT_TREE` depends on the same DocumentsUI, so it would not help those TVs.
- **`GET_CONTENT` fallback:** Android picks the handler, or shows a chooser. On a TV whose only `GET_CONTENT` handler is a poor vendor app, that app is what opens. The app no longer filters or pins packages.
- **A picker that returns a `file://` path:** the app has no storage permission, so the copy fails with `FILE_READ_FAILED:permission` (logged).
