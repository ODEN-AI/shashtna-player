package com.shashtnaplayer

import com.shashtnaplayer.PickerFlow.Attempt
import com.shashtnaplayer.PickerFlow.Launch
import com.shashtnaplayer.PickerFlow.Outcome
import com.shashtnaplayer.PickerFlow.Resolved
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The SAF intent flow: order, fallbacks and structured results, with fake device calls. */
class PickerFlowTest {
  private val docsUi = Resolved("com.android.documentsui", "com.android.documentsui.picker.PickActivity")
  private val chooser = Resolved("android", "com.android.internal.app.ResolverActivity")
  private val tvStub = Resolved("com.android.tv.frameworkpackagestubs", "com.android.tv.frameworkpackagestubs.Stubs\$DocumentsStub")

  private class Device(
    val resolve: (Attempt) -> Resolved? = { null },
    val launch: (Attempt) -> Launch = { Launch.Started },
  ) {
    val launched = ArrayList<Attempt>()
    val log = ArrayList<String>()
    fun run(): Outcome = PickerFlow.run({ resolve(it) }, { launched.add(it); launch(it) }, { log.add(it) })
  }

  @Test
  fun openDocumentSucceedsFirstWithThePlaylistMimeFilter() {
    val d = Device(resolve = { docsUi })
    assertEquals(Outcome.Launched(Attempt(PickerFlow.OPEN_DOCUMENT, filtered = true)), d.run())
    assertEquals(1, d.launched.size)
    assertTrue(d.log.first().contains("mimeTypes=[application/vnd.apple.mpegurl, application/x-mpegurl, audio/x-mpegurl, text/plain"))
    assertTrue(d.log.first().contains("resolveActivity=com.android.documentsui/"))
  }

  @Test
  fun theMimeListCoversTheRequiredPlaylistTypes() {
    assertTrue(PickerFlow.PLAYLIST_MIME_TYPES.containsAll(listOf("application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/x-mpegurl", "text/plain")))
    assertFalse("*/*" in PickerFlow.PLAYLIST_MIME_TYPES) // the wildcard is only the fallback attempt
  }

  @Test
  fun aChooserResolutionIsLaunchedAsIsNoPackageIsChosenByTheApp() {
    val d = Device(resolve = { chooser })
    assertEquals(Outcome.Launched(Attempt(PickerFlow.OPEN_DOCUMENT, true)), d.run())
  }

  @Test
  fun anyTypeFallbackOnlyWhenThePlaylistFilteredLaunchFails() {
    val d = Device(resolve = { docsUi }, launch = { if (it.filtered) Launch.Failed("IllegalArgumentException") else Launch.Started })
    assertEquals(Outcome.Launched(Attempt(PickerFlow.OPEN_DOCUMENT, filtered = false)), d.run())
    assertEquals(listOf(Attempt(PickerFlow.OPEN_DOCUMENT, true), Attempt(PickerFlow.OPEN_DOCUMENT, false)), d.launched)
  }

  @Test
  fun openDocumentUnavailableFallsBackToGetContent() {
    val d = Device(launch = { if (it.action == PickerFlow.OPEN_DOCUMENT) Launch.NotFound else Launch.Started })
    assertEquals(Outcome.Launched(Attempt(PickerFlow.GET_CONTENT, filtered = true)), d.run())
  }

  @Test
  fun theTvPlatformStubIsSkippedAndGetContentIsUsed() {
    val d = Device(resolve = { if (it.action == PickerFlow.OPEN_DOCUMENT) tvStub else chooser })
    assertEquals(Outcome.Launched(Attempt(PickerFlow.GET_CONTENT, true)), d.run())
    assertTrue(d.launched.none { it.action == PickerFlow.OPEN_DOCUMENT }) // the stub is never launched
  }

  @Test
  fun resolveActivityIsAdvisoryALaunchIsStillTriedWhenNothingIsVisible() {
    val d = Device(resolve = { null })
    assertEquals(Outcome.Launched(Attempt(PickerFlow.OPEN_DOCUMENT, true)), d.run())
    assertTrue(d.log.first().contains("resolveActivity=none-visible"))
  }

  @Test
  fun nothingHandlesEitherActionIsPickerUnavailable() {
    val d = Device(launch = { Launch.NotFound })
    val outcome = d.run() as Outcome.Error
    assertEquals(PickerFlow.PICKER_UNAVAILABLE, outcome.code)
    assertEquals(4, d.launched.size)
  }

  @Test
  fun onlyStubsIsPickerUnavailableWithoutLaunchingAnything() {
    val d = Device(resolve = { tvStub })
    assertEquals(Outcome.Error(PickerFlow.PICKER_UNAVAILABLE, "only platform stubs"), d.run())
    assertTrue(d.launched.isEmpty())
  }

  @Test
  fun everyLaunchThrowingIsPickerLaunchFailedNotACrash() {
    val d = Device(resolve = { docsUi }, launch = { Launch.Failed("SecurityException") })
    val outcome = d.run() as Outcome.Error
    assertEquals(PickerFlow.PICKER_LAUNCH_FAILED, outcome.code)
    assertTrue(outcome.reason.contains("SecurityException"))
  }

  @Test
  fun userCancellationAndResultsWithoutAUriAreCancelled() {
    assertTrue(PickerFlow.isPicked(-1, hasUri = true))
    assertFalse(PickerFlow.isPicked(0, hasUri = false)) // RESULT_CANCELED
    assertFalse(PickerFlow.isPicked(-1, hasUri = false)) // OK but nothing picked
  }

  @Test
  fun persistableGrantOnlyWhenTheProviderOffersIt() {
    assertTrue(PickerFlow.offersPersistableRead(0x41))
    assertFalse(PickerFlow.offersPersistableRead(0x01)) // read only: use it now, do not persist
    assertFalse(PickerFlow.offersPersistableRead(0))
  }
}
