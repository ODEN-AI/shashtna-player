package com.shashtnaplayer

import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Copying a picked document into private storage (what ContentResolver.openInputStream returns). */
class PlaylistCopierTest {
  private val dir: File = Files.createTempDirectory("playlists").toFile()
  private fun parts() = dir.listFiles()!!.filter { it.name.endsWith(".part") }

  @Test
  fun aContentStreamIsCopiedByteForByteIncludingArabic() {
    val text = "#EXTM3U\n#EXTINF:-1 group-title=\"أخبار\",قناة ١\nhttp://example/1.ts\n"
    val result = PlaylistCopier.copy({ ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)) }, dir, "a") as PlaylistCopier.Result.Copied
    assertEquals(text, result.file.readText(Charsets.UTF_8))
    assertEquals(text.toByteArray(Charsets.UTF_8).size.toLong(), result.bytes)
    assertEquals("import-a.m3u", result.file.name)
    assertTrue(parts().isEmpty())
  }

  @Test
  fun aLargePlaylistIsStreamedNotLoadedWhole() {
    val size = 5L * 1024 * 1024
    var served = 0L
    var maxChunk = 0
    val source = object : InputStream() {
      override fun read(): Int = if (served++ < size) 'x'.code else -1
      override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (served >= size) return -1
        val n = minOf(len.toLong(), size - served).toInt()
        maxChunk = maxOf(maxChunk, n)
        served += n
        java.util.Arrays.fill(b, off, off + n, 'x'.code.toByte())
        return n
      }
    }
    val result = PlaylistCopier.copy({ source }, dir, "big") as PlaylistCopier.Result.Copied
    assertEquals(size, result.bytes)
    assertTrue(maxChunk <= 64 * 1024) // read in 64 KB blocks
  }

  @Test
  fun theSourceStreamIsAlwaysClosed() {
    var closed = false
    val source = object : ByteArrayInputStream("#EXTM3U\n".toByteArray()) {
      override fun close() { closed = true; super.close() }
    }
    PlaylistCopier.copy({ source }, dir, "c")
    assertTrue(closed)
    var closedOnError = false
    val failing = object : InputStream() {
      override fun read(): Int = throw IOException("broken")
      override fun close() { closedOnError = true }
    }
    PlaylistCopier.copy({ failing }, dir, "d")
    assertTrue(closedOnError)
  }

  @Test
  fun missingReadPermissionIsFileReadFailedPermission() {
    val result = PlaylistCopier.copy({ throw SecurityException("Permission Denial: opening provider") }, dir, "e")
    assertEquals(PlaylistCopier.Result.Failed(PickerFlow.FILE_READ_FAILED, "permission"), result)
    val eacces = PlaylistCopier.copy({ throw FileNotFoundException("/storage/emulated/0/x.m3u: open failed: EACCES (Permission denied)") }, dir, "f")
    assertEquals(PlaylistCopier.Result.Failed(PickerFlow.FILE_READ_FAILED, "permission"), eacces)
  }

  @Test
  fun aMissingDocumentOrNullStreamIsFileReadFailedNotFound() {
    assertEquals(PlaylistCopier.Result.Failed(PickerFlow.FILE_READ_FAILED, "not_found"), PlaylistCopier.copy({ null }, dir, "g"))
    assertEquals(PlaylistCopier.Result.Failed(PickerFlow.FILE_READ_FAILED, "not_found"), PlaylistCopier.copy({ throw FileNotFoundException("gone") }, dir, "h"))
  }

  @Test
  fun aFailureHalfwayLeavesNoPartialCopy() {
    var n = 0
    val source = object : InputStream() {
      override fun read(): Int = if (n++ < 100) 'x'.code else throw IOException("provider died")
    }
    val result = PlaylistCopier.copy({ source }, dir, "i")
    assertEquals(PlaylistCopier.Result.Failed(PickerFlow.FILE_READ_FAILED, "io"), result)
    assertTrue(parts().isEmpty())
    assertFalse(File(dir, "import-i.m3u").exists())
  }

  @Test
  fun anEmptyDocumentIsEmptyM3u() {
    assertEquals(PlaylistCopier.Result.Failed(PickerFlow.EMPTY_M3U, "empty"), PlaylistCopier.copy({ ByteArrayInputStream(ByteArray(0)) }, dir, "j"))
    assertTrue(dir.listFiles()!!.isEmpty())
  }

  @Test
  fun pruneKeepsOnlyTheSavedCopyAndLeavesOtherFilesAlone() {
    listOf("import-1.m3u", "import-2.m3u", "import-3.m3u.part", "library.json").forEach { File(dir, it).writeText("x") }
    assertEquals(2, PlaylistCopier.prune(dir, setOf("import-2.m3u")))
    assertEquals(setOf("import-2.m3u", "library.json"), dir.listFiles()!!.map { it.name }.toSet())
    assertEquals(1, PlaylistCopier.prune(dir, emptySet()))
    assertEquals(setOf("library.json"), dir.listFiles()!!.map { it.name }.toSet())
  }
}
