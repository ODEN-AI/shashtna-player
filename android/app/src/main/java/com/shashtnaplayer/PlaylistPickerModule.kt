package com.shashtnaplayer

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.OpenableColumns
import android.util.Log
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FilterInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap

/**
 * M3U playlist import through the Storage Access Framework.
 *
 * pickPlaylist opens the system document picker with an implicit intent
 * (PickerFlow: ACTION_OPEN_DOCUMENT, then ACTION_GET_CONTENT; playlist MIME
 * types, wildcard only as a fallback). No package is chosen or pinned here:
 * the device resolves the intent to its own picker or chooser.
 *
 * The picked document is then COPIED into the app's private storage
 * (PlaylistCopier, filesDir/playlists) and JS parses and restores from that
 * copy (a file:// URI), so the import does not depend on the provider, the
 * original file or a persistable grant once the pick is done. A persistable
 * read grant is still taken when the provider offers one (so "read the file
 * again" can re-copy from the original), never assumed.
 *
 * Every call resolves a structured map and never rejects with a raw native
 * exception:
 *   { status: "picked", uri, name, size, original }  (uri = the private copy)
 *   { status: "cancelled" }
 *   { status: "error", code, reason }  code: PICKER_UNAVAILABLE,
 *     PICKER_LAUNCH_FAILED, PICKER_BUSY, FILE_READ_FAILED, EMPTY_M3U
 * (INVALID_M3U is decided by the JS parser, which reads the copy.)
 *
 * openPlaylist / readPlaylistChunk / closePlaylist read a playlist (the private
 * copy, an older content:// source, or an asset:// playlist packaged in the
 * APK) as UTF-8 text in chunks straight from the ContentResolver / AssetManager, so large playlists never have to fit in memory and
 * Arabic characters are never split between chunks. (Not through
 * react-native-blob-util: it rewrites content:// URIs to file paths that do not
 * exist or cannot be opened.)
 *
 * Picker state (pending promise, busy window) lives on the UI thread; provider
 * I/O (name/size query, grant, copy) runs on the IO thread. A picker that
 * returns without a result, or never returns, is settled as cancelled when the
 * app resumes, and a later press starts a new picker instead of PICKER_BUSY.
 *
 * AMER_TV_PICKER (diagnostic builds): action, MIME list, resolveActivity,
 * launch result, result code and URI scheme, grant flags, copy result. Never
 * the URI, file name or contents.
 */
class PlaylistPickerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  // Picker state: read and written on the UI thread only.
  private var pending: Promise? = null
  private var launchId = 0
  private var launchedAt = 0L
  private var pausedSinceLaunch = false
  private val main by lazy { Handler(Looper.getMainLooper()) }

  /** Open readers by handle; reads run on one background thread, in order. */
  private val readers = ConcurrentHashMap<String, PlaylistReader>()
  private val io: ExecutorService = Executors.newSingleThreadExecutor()

  private val listener: ActivityEventListener =
    object : ActivityEventListener {
      override fun onNewIntent(intent: Intent) = Unit

      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE) return
        val uri = data?.data
        val flags = data?.flags ?: 0
        diag("result resultCode=$resultCode uri=${uri != null} scheme=${uri?.scheme ?: "none"} flags=0x${Integer.toHexString(flags)} pending=${pending != null}")
        val promise = take() ?: return
        if (!PickerFlow.isPicked(resultCode, uri != null)) {
          promise.resolve(cancelled())
          return
        }
        // Provider IPC (grant, name/size, copy) can be slow on TV storage: off the UI thread.
        io.execute { promise.resolve(importDocument(uri!!, flags)) }
      }
    }

  private val lifecycle: LifecycleEventListener =
    object : LifecycleEventListener {
      override fun onHostPause() {
        if (pending != null) pausedSinceLaunch = true
      }

      override fun onHostResume() {
        if (pending == null || !pausedSinceLaunch) return
        // onActivityResult is delivered before onResume. If the picker came back
        // without one (TV stubs, some vendor file managers), settle it as cancelled.
        val id = launchId
        main.postDelayed({
          if (pending != null && launchId == id) {
            diag("result none: picker returned without a result, settled as cancelled")
            take()?.resolve(cancelled())
          }
        }, RESULT_GRACE_MS)
      }

      override fun onHostDestroy() {
        take()?.resolve(cancelled())
      }
    }

  init {
    context.addActivityEventListener(listener)
    context.addLifecycleEventListener(lifecycle)
  }

  /** Clears and returns the pending picker request (UI thread). */
  private fun take(): Promise? {
    val promise = pending ?: return null
    pending = null
    pausedSinceLaunch = false
    return promise
  }

  override fun getName(): String = NAME

  /** Opens the system document picker; resolves a structured result (see the class comment). */
  @ReactMethod
  fun pickPlaylist(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        launchPicker(promise)
      } catch (error: Exception) {
        // Last line of defence: nothing native reaches JS as a raw exception.
        diag("launch failed unexpectedly error=${error.javaClass.simpleName}")
        (take() ?: promise).resolve(failure(PickerFlow.PICKER_LAUNCH_FAILED, error.javaClass.simpleName))
      }
    }
  }

  private fun launchPicker(promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.resolve(failure(PickerFlow.PICKER_LAUNCH_FAILED, "no_activity"))
      return
    }
    if (pending != null) {
      // A second press right after the first: the picker is still opening.
      if (SystemClock.elapsedRealtime() - launchedAt < BUSY_WINDOW_MS) {
        promise.resolve(failure(PickerFlow.PICKER_BUSY, "already_open"))
        return
      }
      // An earlier picker never answered: give up on it and open a new one.
      take()?.resolve(cancelled())
    }
    pending = promise
    launchId += 1
    launchedAt = SystemClock.elapsedRealtime()
    pausedSinceLaunch = false
    val pm = context.packageManager
    val outcome =
      PickerFlow.run(
        resolve = { attempt ->
          try {
            val info = pm.resolveActivity(pickerIntent(attempt), PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo
            PickerFlow.Resolved(info?.packageName, info?.name)
          } catch (_: Exception) {
            null
          }
        },
        launch = { attempt ->
          try {
            activity.startActivityForResult(pickerIntent(attempt), REQUEST_CODE)
            PickerFlow.Launch.Started
          } catch (_: ActivityNotFoundException) {
            PickerFlow.Launch.NotFound
          } catch (error: Exception) {
            PickerFlow.Launch.Failed(error.javaClass.simpleName)
          }
        },
        log = ::diag,
      )
    if (outcome is PickerFlow.Outcome.Error) {
      diag("picker error code=${outcome.code} reason=${outcome.reason}")
      take()?.resolve(failure(outcome.code, outcome.reason))
    }
  }

  /** The SAF intent for one attempt (implicit: no package, no component). */
  private fun pickerIntent(attempt: PickerFlow.Attempt): Intent =
    Intent(attempt.action).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = PickerFlow.ANY_TYPE
      if (attempt.filtered) putExtra(Intent.EXTRA_MIME_TYPES, PickerFlow.PLAYLIST_MIME_TYPES.toTypedArray())
      if (attempt.action == PickerFlow.OPEN_DOCUMENT) {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
    }

  /**
   * Copies a picked (or previously picked) document into private storage.
   * IO thread. Never throws: returns a structured map.
   */
  private fun importDocument(uri: Uri, flags: Int): WritableMap {
    if (PickerFlow.offersPersistableRead(flags)) {
      try {
        context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        diag("grant persistable=taken")
      } catch (_: Exception) {
        diag("grant persistable=refused (the private copy does not need it)")
      }
    } else {
      diag("grant persistable=not_offered")
    }
    var name: String? = null
    try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (index >= 0 && !cursor.isNull(index)) name = cursor.getString(index)
        }
      }
    } catch (_: Exception) {
      // Some providers refuse the query; the name is cosmetic.
    }
    val stamp = "${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(8)}"
    val result =
      PlaylistCopier.copy(
        open = { context.contentResolver.openInputStream(uri) },
        dir = playlistDir(),
        stamp = stamp,
      )
    return when (result) {
      is PlaylistCopier.Result.Copied -> {
        diag("copy ok bytes=${result.bytes} source=${uri.scheme}")
        Arguments.createMap().apply {
          putString("status", "picked")
          putString("uri", Uri.fromFile(result.file).toString())
          putString("name", name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "playlist.m3u")
          putDouble("size", result.bytes.toDouble())
          putString("original", uri.toString())
        }
      }
      is PlaylistCopier.Result.Failed -> {
        diag("copy failed code=${result.code} reason=${result.reason} source=${uri.scheme}")
        failure(result.code, result.reason)
      }
    }
  }

  /** "Read the file again": copies the original document again (needs a still-valid grant). */
  @ReactMethod
  fun reimportPlaylist(original: String, promise: Promise) {
    io.execute {
      try {
        promise.resolve(importDocument(Uri.parse(original), 0))
      } catch (error: Exception) {
        promise.resolve(failure(PickerFlow.FILE_READ_FAILED, error.javaClass.simpleName))
      }
    }
  }

  /** Deletes private copies other than [keep] (file:// URIs of copies to keep). Resolves how many. */
  @ReactMethod
  fun prunePlaylists(keep: ReadableArray, promise: Promise) {
    val names = HashSet<String>()
    for (i in 0 until keep.size()) {
      val value = keep.getString(i) ?: continue
      Uri.parse(value).lastPathSegment?.let { names.add(it) }
    }
    io.execute {
      val removed =
        try {
          PlaylistCopier.prune(playlistDir(), names)
        } catch (_: Exception) {
          0
        }
      diag("prune removed=$removed kept=${names.size}")
      promise.resolve(removed)
    }
  }

  private fun playlistDir() = File(context.filesDir, PLAYLIST_DIR)

  private fun cancelled(): WritableMap = Arguments.createMap().apply { putString("status", "cancelled") }

  private fun failure(code: String, reason: String): WritableMap =
    Arguments.createMap().apply {
      putString("status", "error")
      putString("code", code)
      putString("reason", reason)
    }

  /** AMER_TV_PICKER lines (adb logcat -s AMER_TV_PICKER): actions, types, package/activity names and outcomes only. */
  private fun diag(message: String) {
    if (BuildConfig.TV_DIAGNOSTICS) Log.i(DIAG_TAG, message)
  }

  /** Opens a picked playlist (content:// or file://) for reading; resolves a handle. */
  @ReactMethod
  fun openPlaylist(uri: String, promise: Promise) {
    io.execute {
      try {
        val parsed = Uri.parse(uri)
        val input: InputStream =
          when (parsed.scheme?.lowercase()) {
            "content" -> context.contentResolver.openInputStream(parsed) ?: throw FileNotFoundException("The provider returned no data.")
            "file" -> FileInputStream(File(parsed.path ?: ""))
            // A playlist packaged in the APK (the عامر IPTV built-in playlist): read-only.
            "asset" -> context.assets.open((parsed.path ?: "").trimStart('/'))
            else -> throw FileNotFoundException("Unsupported playlist location.")
          }
        val counter = CountingInputStream(input)
        val handle = UUID.randomUUID().toString()
        readers[handle] = PlaylistReader(counter, BufferedReader(InputStreamReader(counter, Charsets.UTF_8), BUFFER_CHARS))
        promise.resolve(handle)
      } catch (error: FileNotFoundException) {
        promise.reject("E_NOT_FOUND", error.message ?: "The playlist file was not found.", error)
      } catch (error: SecurityException) {
        promise.reject("E_PERMISSION", error.message ?: "Permission to read the playlist was denied.", error)
      } catch (error: Exception) {
        promise.reject("E_READ_FAILED", error.message ?: "The playlist could not be read.", error)
      }
    }
  }

  /**
   * Reads up to maxChars characters. Resolves { text, bytes }: text is null at
   * the end of the file (the reader is then closed); bytes is how much of the
   * file has been read so far, for progress.
   */
  @ReactMethod
  fun readPlaylistChunk(handle: String, maxChars: Double, promise: Promise) {
    io.execute {
      val reader = readers[handle]
      if (reader == null) {
        promise.reject("E_CLOSED", "The playlist reader is closed.")
        return@execute
      }
      try {
        val size = maxChars.toInt().coerceIn(MIN_CHUNK, MAX_CHUNK)
        val buffer = CharArray(size)
        var filled = 0
        while (filled < size) {
          val read = reader.text.read(buffer, filled, size - filled)
          if (read < 0) break
          filled += read
        }
        val result = Arguments.createMap()
        if (filled == 0) {
          close(handle)
          result.putNull("text")
        } else {
          result.putString("text", String(buffer, 0, filled))
        }
        result.putDouble("bytes", reader.bytes.count.toDouble())
        promise.resolve(result)
      } catch (error: Exception) {
        close(handle)
        promise.reject("E_READ_FAILED", error.message ?: "The playlist could not be read.", error)
      }
    }
  }

  @ReactMethod
  fun closePlaylist(handle: String) {
    io.execute { close(handle) }
  }

  private fun close(handle: String) {
    val reader = readers.remove(handle) ?: return
    try {
      reader.text.close()
    } catch (_: Exception) {
      // Already closed.
    }
  }

  override fun invalidate() {
    context.removeLifecycleEventListener(lifecycle)
    UiThreadUtil.runOnUiThread { take()?.resolve(cancelled()) }
    readers.keys.toList().forEach { close(it) }
    io.shutdown()
    super.invalidate()
  }

  private class PlaylistReader(val bytes: CountingInputStream, val text: BufferedReader)

  /** Counts the bytes taken from the file (the reader decodes ahead of what JS has consumed). */
  private class CountingInputStream(input: InputStream) : FilterInputStream(input) {
    @Volatile var count = 0L

    override fun read(): Int {
      val value = super.read()
      if (value >= 0) count += 1
      return value
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
      val read = super.read(buffer, offset, length)
      if (read > 0) count += read
      return read
    }

    override fun skip(n: Long): Long {
      val skipped = super.skip(n)
      count += skipped
      return skipped
    }
  }

  companion object {
    const val NAME = "ShashtnaPlaylistPicker"
    private const val DIAG_TAG = "AMER_TV_PICKER"
    private const val REQUEST_CODE = 0x5A7
    private const val PLAYLIST_DIR = "playlists"

    /** After resuming, how long a result may still take before the picker counts as cancelled. */
    private const val RESULT_GRACE_MS = 600L

    /** A second press within this window is a double press, not a stuck picker. */
    private const val BUSY_WINDOW_MS = 1500L
    private const val BUFFER_CHARS = 64 * 1024
    private const val MIN_CHUNK = 1024
    private const val MAX_CHUNK = 1024 * 1024
  }
}
