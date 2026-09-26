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

**Acceptance condition:** the TV's ORIGINAL system/OEM file explorer opens.

It must NOT be:
- a third-party / user-installed file manager (these are never launched in this build);
- a media manager, gallery or player;
- a factory or diagnostic app.

If the device has no usable system picker, the Arabic message «تعذر فتح مدير الملفات على هذا الجهاز» is correct.

How the picker is chosen:
- Only system (`FLAG_SYSTEM`) and updated-system (`FLAG_UPDATED_SYSTEM_APP`) apps can be launched.
- On a TV the order is:
  1. OEM file explorer (system, in the app list or browsing folders / shipping a DocumentsProvider, answers OPEN_DOCUMENT or GET_CONTENT);
  2. Android DocumentsUI;
  3. another system picker.
- Phones and tablets keep DocumentsUI first.

### 3a. Collect the evidence (only package/activity names, filters and permissions: no credentials, URLs or file contents)

```
adb shell getprop ro.product.model
adb shell getprop ro.build.version.sdk
adb logcat -c
adb logcat -s AMER_TV_PICKER:V ReactNativeJS:V > picker.log     (press «إضافة ملف M3U» now)
```

`picker.log` answers the questions in this order:

| Line | Question it answers |
|---|---|
| `request ...` | What was asked: actions, discovery types, launch MIME |
| `discovered action=... activity=pkg/Activity matched=[...] declared=[...] openable=...` | Does OPEN_DOCUMENT / GET_CONTENT resolve at all, and to which activity? Which MIME queries matched, what the filter declares, does it take CATEGORY_OPENABLE? |
| `candidate package=... activity=... system=yes/no updatedSystem=yes/no userInstalled=yes/no launchable= openDocument= getContent= openable= documentsProvider= ... score=... ACCEPTED/REJECTED kind=... reason=...` | Every candidate: origin, capabilities, score and the exact reason |
| `summary oemFileExplorer=pkg/Activity accepted=N userInstalledSkipped=M` | **The answer to "which activity is this TV's original file explorer?"** (or `none`) |
| `inventory documentsProvider package=... authority=...` | Which DocumentsProviders exist |
| `inventory app=pkg/Activity label="..." system= updatedSystem= userInstalled= ... openDocument= getContent= pick= pickerCandidate=` | Launchable apps with file signals (the TV's own explorer should be here), and which file intents they answer |
| `selected ...` or `selected none: E_NO_PICKER` | The final decision |
| `result resultCode=.. document=.. scheme=content/file` | What the picker returned (only the scheme, never the URI) |
| `AMER_TV_PICKER {"stage":"js:result","code":"E_NO_PICKER"}` (ReactNativeJS) | The exact code behind the Arabic message: E_NO_PICKER, E_PICKER_FAILED, E_PICK_FAILED, PICKED or CANCELLED |

Cross-check from the system side, where `<pkg>` is the TV's file manager (find it under Settings > Apps, or with the first command):

```
adb shell pm list packages -s | grep -iE "file|explor|brows|manager|media"
adb shell cmd package query-activities --brief -a android.intent.action.GET_CONTENT -c android.intent.category.OPENABLE -t "*/*"
adb shell cmd package query-activities --brief -a android.intent.action.GET_CONTENT -t "*/*"
adb shell cmd package query-activities --brief -a android.intent.action.OPEN_DOCUMENT -c android.intent.category.OPENABLE -t "*/*"
adb shell cmd package query-activities --brief -a android.intent.action.GET_CONTENT -t "audio/x-mpegurl"
adb shell dumpsys package <pkg> > file-manager.txt
```

`file-manager.txt` holds the manager's activities, intent filters (actions, categories, `mimeType`), providers (`authority`, `MANAGE_DOCUMENTS`) and requested permissions. Older Android versions use `pm query-activities` instead of `cmd package query-activities`.

To check that the file manager's activity really behaves as a picker, open it the way the app does:

```
adb shell am start -W -a android.intent.action.GET_CONTENT -c android.intent.category.OPENABLE -t "*/*" -n <pkg>/<Activity>
```

It should open in a "choose a file" mode. Without `-c ...OPENABLE`, try again if the filter lacks OPENABLE.

### 3b. Reading the outcome

| What the log shows | Meaning |
|---|---|
| `summary oemFileExplorer=<pkg/Activity>` and `selected ... kind=OEM_FILE_EXPLORER`, and the TV's own explorer opens | Accepted on this TV. Pick an `.m3u`, check `result ... scheme=content` and that the channels load. |
| The TV's explorer is a `candidate` with `REJECTED` | Its `reason=` names the exact rule. Send that line. |
| It is only in `inventory` with `openDocument=no getContent=no pick=yes` | It offers only ACTION_PICK. That usually returns a file path the app is not allowed to read (no storage permission), so it is not launched and the result is E_NO_PICKER. Supporting it means adding a storage permission and a path reader: a decision to make from this log. |
| It is only in `inventory` with `openDocument=no getContent=no pick=no` | It exposes no file-selection intent at all. No app can receive a file from it, so E_NO_PICKER is the correct result. |
| A third-party manager shows as `kind=USER_INSTALLED` | Expected: it is logged but never opened. |

Also check:
- Cancel, then press the button again: a picker must open again.
- Pick an `.m3u` file: the channels must load exactly as before.
