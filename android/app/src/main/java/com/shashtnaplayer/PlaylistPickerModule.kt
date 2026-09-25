package com.shashtnaplayer

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Lets the user pick an M3U / M3U8 playlist with the system document picker
 * and returns its content:// URI, display name and size.
 *
 * The file is not read or copied here: JS streams it straight from the URI
 * (react-native-blob-util opens content:// URIs through the ContentResolver),
 * so large playlists never have to fit in memory. A persistable read grant is
 * taken when the provider offers one, so the same file can be re-read when
 * the app reconnects on the next launch.
 *
 * Uses platform APIs only; no extra Gradle dependency.
 */
class PlaylistPickerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private var pending: Promise? = null

  private val listener: ActivityEventListener =
    object : ActivityEventListener {
      override fun onNewIntent(intent: Intent) = Unit

      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE) return
        val promise = pending ?: return
        pending = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
          promise.resolve(null) // cancelled
          return
        }
        try {
          promise.resolve(describe(uri, data?.flags ?: 0))
        } catch (error: Exception) {
          promise.reject("E_PICK_FAILED", error.message, error)
        }
      }
    }

  init {
    context.addActivityEventListener(listener)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun pickPlaylist(promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "The app is not in the foreground.")
      return
    }
    if (pending != null) {
      promise.reject("E_BUSY", "A file picker is already open.")
      return
    }
    // Many providers label .m3u files as audio/x-mpegurl, text/plain or
    // application/octet-stream, so every type is offered and the content is
    // validated when it is parsed (#EXTM3U / #EXTINF).
    val openDocument =
      Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
    val getContent =
      Intent(Intent.ACTION_GET_CONTENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
      }
    pending = promise
    try {
      activity.startActivityForResult(openDocument, REQUEST_CODE)
    } catch (_: ActivityNotFoundException) {
      // Some Android TV boxes ship without the Documents UI.
      try {
        activity.startActivityForResult(Intent.createChooser(getContent, null), REQUEST_CODE)
      } catch (_: ActivityNotFoundException) {
        pending = null
        promise.reject("E_NO_PICKER", "No file picker is installed on this device.")
      }
    }
  }

  private fun describe(uri: Uri, flags: Int) =
    Arguments.createMap().apply {
      if ((flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
        try {
          context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) {
          // Provider does not offer persistable grants; the file is still readable now.
        }
      }
      putString("uri", uri.toString())
      var name: String? = null
      var size = -1.0
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
          if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex).toDouble()
        }
      }
      putString("name", name ?: uri.lastPathSegment ?: "playlist.m3u")
      putDouble("size", size)
    }

  companion object {
    const val NAME = "ShashtnaPlaylistPicker"
    private const val REQUEST_CODE = 0x5A7
  }
}
