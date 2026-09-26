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

## 3. «إضافة ملف M3U»

On the sign-in screen, choose the file tab and press the button.

Expected: one of these, never a device test, factory or media app:
- the system document picker;
- a real file manager;
- the Arabic message «تعذر فتح مدير الملفات على هذا الجهاز».

Expected in the log (`AMER_TV_PICKER`):

```
request actions=OPEN_DOCUMENT,GET_CONTENT category=OPENABLE mime=*/*
candidate action=GET_CONTENT activity=<pkg>/<activity> kind=REJECTED reason=device test/diagnostic tool (name: test) ...
candidate action=... kind=FILE_MANAGER reason=file manager (browses folders) ...
selected action=... activity=<pkg>/<activity> kind=...          (or: selected none: E_NO_PICKER)
result resultCode=-1 ok=true document=true                       (after picking a file; 0 = cancelled)
```

What to check and report:
- The `candidate` line for the factory app seen before must say `kind=REJECTED`. If it says anything else, send that line: it names the capability that let it through.
- Cancel, then press the button again: a picker must open again.
- Pick an `.m3u` file: the channels must load exactly as before.
