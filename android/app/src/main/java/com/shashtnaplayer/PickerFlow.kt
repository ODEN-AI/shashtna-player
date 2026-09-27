package com.shashtnaplayer

/**
 * The M3U picker as a Storage Access Framework intent flow. Pure logic (no
 * Android types): PlaylistPickerModule supplies resolveActivity / launch, this
 * decides the order, the fallbacks and the structured result, so the whole
 * sequence is unit-testable.
 *
 * Why not package discovery any more: four builds tried to pick "the right
 * file-manager package" from queryIntentActivities (skip stubs, reject
 * factory/media apps, prefer system apps...). Every OEM broke a different
 * guess, and pinning an explicit component took the choice away from the
 * system. The platform contract is the implicit SAF intent: Android resolves
 * ACTION_OPEN_DOCUMENT to the document picker the device ships (or shows its
 * own chooser); this app does not choose a package.
 *
 * Flow (first one that launches wins; nothing is pinned to a package):
 *   1. ACTION_OPEN_DOCUMENT + CATEGORY_OPENABLE, type wildcard with
 *      EXTRA_MIME_TYPES = PLAYLIST_MIME_TYPES (the picker filters to playlists);
 *   2. the same without EXTRA_MIME_TYPES (wildcard only), used only if 1 could
 *      not be launched (an OEM picker that rejects the MIME filter);
 *   3. ACTION_GET_CONTENT + CATEGORY_OPENABLE with the playlist types;
 *   4. the same, wildcard only;
 *   none -> PICKER_UNAVAILABLE (nothing handles it) or PICKER_LAUNCH_FAILED
 *   (a handler exists but could not be started). Never an exception.
 *
 * One platform exception, not a file-manager guess: Android TV images without
 * DocumentsUI register the AOSP "Framework Package Stubs" for OPEN_DOCUMENT.
 * It launches, shows nothing and returns no file, so when resolveActivity
 * names it, that action is skipped and the flow falls through to GET_CONTENT.
 * resolveActivity is otherwise advisory (logged only): with no visible
 * resolution the launch is still attempted and the launch result decides.
 */
internal object PickerFlow {
  const val OPEN_DOCUMENT = "android.intent.action.OPEN_DOCUMENT"
  const val GET_CONTENT = "android.intent.action.GET_CONTENT"
  const val ANY_TYPE = "*/*"

  /**
   * What M3U / M3U8 files are labelled as by providers. The first four are the
   * playlist and text types; Android itself labels .m3u audio/mpegurl on some
   * versions, and files it cannot type application/octet-stream.
   */
  val PLAYLIST_MIME_TYPES = listOf(
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/x-mpegurl",
    "text/plain",
    "audio/mpegurl",
    "application/octet-stream",
  )

  /** The AOSP Android TV placeholder packages (declare OPEN_DOCUMENT, pick nothing). */
  val PLATFORM_STUB_PACKAGES = setOf(
    "com.android.tv.frameworkpackagestubs",
    "com.google.android.tv.frameworkpackagestubs",
  )

  /** One way to open the picker. [filtered] = EXTRA_MIME_TYPES playlist filter; false = wildcard only. */
  data class Attempt(val action: String, val filtered: Boolean) {
    val label: String get() = "${action.substringAfterLast('.')}${if (filtered) "+playlistTypes" else "+anyType"}"
  }

  val ATTEMPTS = listOf(
    Attempt(OPEN_DOCUMENT, filtered = true),
    Attempt(OPEN_DOCUMENT, filtered = false),
    Attempt(GET_CONTENT, filtered = true),
    Attempt(GET_CONTENT, filtered = false),
  )

  /** What resolveActivity returned for an attempt (null package = nothing visible). */
  data class Resolved(val packageName: String?, val activityName: String?)

  sealed class Launch {
    object Started : Launch()
    /** ActivityNotFoundException: nothing handles it after all. */
    object NotFound : Launch()
    /** Anything else thrown while starting it (SecurityException, vendor errors). */
    data class Failed(val error: String) : Launch()
  }

  sealed class Outcome {
    data class Launched(val attempt: Attempt) : Outcome()
    data class Error(val code: String, val reason: String) : Outcome()
  }

  const val PICKER_UNAVAILABLE = "PICKER_UNAVAILABLE"
  const val PICKER_LAUNCH_FAILED = "PICKER_LAUNCH_FAILED"
  const val PICKER_CANCELLED = "PICKER_CANCELLED"
  const val PICKER_BUSY = "PICKER_BUSY"
  const val FILE_READ_FAILED = "FILE_READ_FAILED"
  const val EMPTY_M3U = "EMPTY_M3U"

  fun isPlatformStub(r: Resolved?): Boolean = r?.packageName != null && r.packageName in PLATFORM_STUB_PACKAGES

  /**
   * Runs the attempts in order until one starts. [resolve] and [launch] are the
   * device calls; [log] receives one line per decision (AMER_TV_PICKER).
   */
  fun run(resolve: (Attempt) -> Resolved?, launch: (Attempt) -> Launch, log: (String) -> Unit = {}): Outcome {
    val skipped = HashSet<String>()
    val failures = ArrayList<String>()
    for (attempt in ATTEMPTS) {
      if (attempt.action in skipped) continue
      val mimes = if (attempt.filtered) PLAYLIST_MIME_TYPES.joinToString() else ANY_TYPE
      val resolved = resolve(attempt)
      val target = resolved?.packageName?.let { "$it/${resolved.activityName}" } ?: "none-visible"
      log("attempt ${attempt.label} category=OPENABLE type=$ANY_TYPE mimeTypes=[$mimes] resolveActivity=$target")
      if (isPlatformStub(resolved)) {
        log("skip ${attempt.action.substringAfterLast('.')}: resolves to the Android TV platform stub (no document picker)")
        skipped.add(attempt.action)
        continue
      }
      when (val result = launch(attempt)) {
        Launch.Started -> {
          log("launched ${attempt.label} target=$target")
          return Outcome.Launched(attempt)
        }
        Launch.NotFound -> log("not launched ${attempt.label}: no activity found")
        is Launch.Failed -> {
          log("not launched ${attempt.label}: ${result.error}")
          failures.add("${attempt.label}:${result.error}")
        }
      }
    }
    return if (failures.isNotEmpty()) {
      Outcome.Error(PICKER_LAUNCH_FAILED, failures.joinToString())
    } else {
      Outcome.Error(PICKER_UNAVAILABLE, if (skipped.isNotEmpty()) "only platform stubs" else "no activity handles OPEN_DOCUMENT or GET_CONTENT")
    }
  }

  /** Activity.RESULT_OK is -1. A result without a URI is a cancel too. */
  fun isPicked(resultCode: Int, hasUri: Boolean): Boolean = resultCode == -1 && hasUri

  private const val FLAG_GRANT_READ_URI_PERMISSION = 0x00000001
  private const val FLAG_GRANT_PERSISTABLE_URI_PERMISSION = 0x00000040

  /** Take a persistable grant only when the provider offered one (read + persistable in the result flags). */
  fun offersPersistableRead(flags: Int): Boolean =
    (flags and FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0 && (flags and FLAG_GRANT_READ_URI_PERMISSION) != 0
}
