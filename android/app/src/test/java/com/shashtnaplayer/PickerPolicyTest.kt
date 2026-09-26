package com.shashtnaplayer

import com.shashtnaplayer.PickerPolicy.Action
import com.shashtnaplayer.PickerPolicy.Choice
import org.junit.Assert.assertEquals
import org.junit.Test

/** Which picker PlaylistPickerModule opens, for the handler sets phones and TVs report. */
class PickerPolicyTest {
  private val own = "com.ameriptv.player"
  private val documentsUi = "com.android.documentsui"
  private val googleDocumentsUi = "com.google.android.documentsui"
  private val tvStub = "com.android.tv.frameworkpackagestubs"
  private val fileManager = "com.alphainventor.filemanager"

  @Test
  fun phoneWithDocumentsUiKeepsTheImplicitOpenDocumentIntent() {
    assertEquals(
      Choice.Launch(Action.OPEN_DOCUMENT, null),
      PickerPolicy.choose(listOf(googleDocumentsUi), listOf(googleDocumentsUi, "com.google.android.apps.photos"), own),
    )
  }

  @Test
  fun tvWithOnlyTheStubAndAFileManagerUsesGetContentPinnedToTheFileManager() {
    assertEquals(
      Choice.Launch(Action.GET_CONTENT, fileManager),
      PickerPolicy.choose(listOf(tvStub), listOf(tvStub, fileManager), own),
    )
  }

  @Test
  fun tvWithOnlyTheStubAndNoGetContentHandlerHasNoPicker() {
    assertEquals(Choice.NoPicker, PickerPolicy.choose(listOf(tvStub), listOf(tvStub), own))
    assertEquals(Choice.NoPicker, PickerPolicy.choose(listOf(tvStub), emptyList(), own))
  }

  @Test
  fun realDocumentsUiNextToAStubIsPinnedSoTheStubCannotWin() {
    assertEquals(
      Choice.Launch(Action.OPEN_DOCUMENT, documentsUi),
      PickerPolicy.choose(listOf(tvStub, documentsUi), listOf(tvStub), own),
    )
  }

  @Test
  fun tvWithAFileManagerForOpenDocumentAndNoStubStaysImplicit() {
    assertEquals(Choice.Launch(Action.OPEN_DOCUMENT, null), PickerPolicy.choose(listOf(fileManager), emptyList(), own))
  }

  @Test
  fun nothingVisibleFallsBackToThePreviousBehaviour() {
    assertEquals(Choice.Legacy, PickerPolicy.choose(emptyList(), emptyList(), own))
  }

  @Test
  fun theAppItselfIsNeverAPicker() {
    assertEquals(Choice.Legacy, PickerPolicy.choose(listOf(own), listOf(own), own))
    assertEquals(
      Choice.Launch(Action.GET_CONTENT, null),
      PickerPolicy.choose(listOf(own), listOf(own, fileManager), own),
    )
  }

  @Test
  fun googleTvStubPackageIsAlsoSkipped() {
    assertEquals(
      Choice.NoPicker,
      PickerPolicy.choose(listOf("com.google.android.tv.frameworkpackagestubs"), emptyList(), own),
    )
  }
}
