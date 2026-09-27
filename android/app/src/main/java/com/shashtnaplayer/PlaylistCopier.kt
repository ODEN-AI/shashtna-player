package com.shashtnaplayer

import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream

/**
 * Copies a picked playlist into the app's private storage (plain JVM I/O, so it
 * is unit-testable). The app then parses and restores from its own copy, so it
 * does not depend on the provider, the original file or a persistable grant
 * after the pick.
 *
 * Streamed in 64 KB blocks (a large playlist is never held in memory), written
 * to a ".part" file and renamed only when complete, so a failed or partial copy
 * never becomes a source. Streams are always closed.
 */
internal object PlaylistCopier {
  private const val BUFFER_BYTES = 64 * 1024

  /** Larger than any real M3U; stops a wrong pick (a video) from filling storage. */
  const val MAX_BYTES = 256L * 1024 * 1024

  private const val PREFIX = "import-"
  private const val SUFFIX = ".m3u"
  private const val PART = ".part"

  sealed class Result {
    data class Copied(val file: File, val bytes: Long) : Result()
    data class Failed(val code: String, val reason: String) : Result()
  }

  /** [open] opens the source (ContentResolver.openInputStream); [stamp] makes the name unique. */
  fun copy(open: () -> InputStream?, dir: File, stamp: String): Result {
    if (!dir.isDirectory && !dir.mkdirs()) return Result.Failed(PickerFlow.FILE_READ_FAILED, "storage")
    val part = File(dir, "$PREFIX$stamp$SUFFIX$PART")
    val dest = File(dir, "$PREFIX$stamp$SUFFIX")
    var bytes = 0L
    try {
      val input = open() ?: throw FileNotFoundException("The provider returned no data.")
      input.use { source ->
        FileOutputStream(part).use { out ->
          val buffer = ByteArray(BUFFER_BYTES)
          while (true) {
            val read = source.read(buffer)
            if (read < 0) break
            bytes += read
            if (bytes > MAX_BYTES) throw TooLarge()
            out.write(buffer, 0, read)
          }
          out.fd.sync()
        }
      }
    } catch (error: Throwable) {
      part.delete()
      return Result.Failed(PickerFlow.FILE_READ_FAILED, reasonOf(error))
    }
    if (bytes == 0L) {
      part.delete()
      return Result.Failed(PickerFlow.EMPTY_M3U, "empty")
    }
    if (!part.renameTo(dest)) {
      part.delete()
      return Result.Failed(PickerFlow.FILE_READ_FAILED, "storage")
    }
    return Result.Copied(dest, bytes)
  }

  /** Why a read failed, as a short non-sensitive reason (no path, no message text). */
  fun reasonOf(error: Throwable): String =
    when (error) {
      is TooLarge -> "too_large"
      is SecurityException -> "permission"
      is FileNotFoundException -> if (error.message?.contains("EACCES") == true || error.message?.contains("ermission") == true) "permission" else "not_found"
      is IOException -> "io"
      else -> "io"
    }

  /** True for a finished private copy made by [copy]. */
  fun isCopy(file: File): Boolean = file.name.startsWith(PREFIX) && file.name.endsWith(SUFFIX)

  /** Deletes every private copy (and leftover .part) in [dir] whose name is not in [keep]. Returns how many. */
  fun prune(dir: File, keep: Set<String>): Int {
    val files = dir.listFiles() ?: return 0
    var removed = 0
    for (file in files) {
      val ours = file.name.startsWith(PREFIX) && (file.name.endsWith(SUFFIX) || file.name.endsWith(SUFFIX + PART))
      if (ours && file.name !in keep && file.delete()) removed += 1
    }
    return removed
  }

  private class TooLarge : IOException("too large")
}
