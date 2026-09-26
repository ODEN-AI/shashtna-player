package com.shashtnaplayer

import com.shashtnaplayer.PickerPolicy.Action
import com.shashtnaplayer.PickerPolicy.AppCategory
import com.shashtnaplayer.PickerPolicy.Candidate
import com.shashtnaplayer.PickerPolicy.Choice
import com.shashtnaplayer.PickerPolicy.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which picker PlaylistPickerModule opens, for the candidate sets phones and TVs report.
 * The rules are capability-based: no test depends on one device's package name.
 */
class PickerPolicyTest {
  private val own = "com.ameriptv.player"
  private val any = listOf("*") // IntentFilter keeps the full wildcard type as "*"

  // Phones: system DocumentsUI (holds MANAGE_DOCUMENTS).
  private val documentsUi = Candidate(Action.OPEN_DOCUMENT, "com.android.documentsui", "com.android.documentsui.picker.PickActivity", any, isSystemApp = true, holdsManageDocuments = true)
  private val googleDocumentsUi = documentsUi.copy(packageName = "com.google.android.documentsui")

  // Android TV Framework Package Stubs.
  private val tvStubOpen = Candidate(Action.OPEN_DOCUMENT, "com.android.tv.frameworkpackagestubs", "com.android.tv.frameworkpackagestubs.Stubs\$DocumentsStub", any, isSystemApp = true)
  private val tvStubGet = tvStubOpen.copy(action = Action.GET_CONTENT)

  // A real file manager (ships a DocumentsProvider / browses folders).
  private val fileManagerGet = Candidate(Action.GET_CONTENT, "com.alphainventor.filemanager", "com.alphainventor.filemanager.activity.MainActivity", any, exportsDocumentsProvider = true, browsesFolders = true, category = AppCategory.PRODUCTIVITY)
  private val fileManagerOpen = fileManagerGet.copy(action = Action.OPEN_DOCUMENT)
  // A vendor file browser preinstalled on a TV box (system app, browses folders).
  private val vendorFileBrowser = Candidate(Action.GET_CONTENT, "com.vendor.filebrowser", "com.vendor.filebrowser.FileBrowserActivity", any, isSystemApp = true, browsesFolders = true)

  // What the real TV box launched: a preinstalled factory / hardware test app.
  private val factoryTestNamed = Candidate(Action.GET_CONTENT, "com.DeviceTest", "com.DeviceTest.DeviceTestActivity", any, isSystemApp = true)
  private val factoryModeNamed = Candidate(Action.GET_CONTENT, "com.vendor.tools", "com.vendor.tools.FactoryModeActivity", any, isSystemApp = true)
  // The same kind of app with a neutral name: rejected by capability (preinstalled, no document ability).
  private val unnamedSystemTool = Candidate(Action.GET_CONTENT, "com.vendor.mediacenter", "com.vendor.mediacenter.Main", any, isSystemApp = true)
  private val audioVideoTest = Candidate(Action.GET_CONTENT, "com.vendor.av", "com.vendor.av.PlayActivity", listOf("audio", "video"), isSystemApp = true)
  private val musicPlayer = Candidate(Action.GET_CONTENT, "com.example.music", "com.example.music.PickTrack", listOf("audio"), category = AppCategory.AUDIO)
  private val gallery = Candidate(Action.GET_CONTENT, "com.example.gallery", "com.example.gallery.Pick", listOf("image", "video"), category = AppCategory.IMAGE)
  private val videoCategoryWildcard = Candidate(Action.GET_CONTENT, "com.example.player", "com.example.player.Open", any, category = AppCategory.VIDEO)
  private val settings = Candidate(Action.GET_CONTENT, "com.android.tv.settings", "com.android.tv.settings.MainSettings", any, isSystemApp = true, isSettingsApp = true)
  private val launcher = Candidate(Action.GET_CONTENT, "com.vendor.launcher", "com.vendor.launcher.Home", any, isSystemApp = true, isHomeLauncher = true)
  private val userApp = Candidate(Action.GET_CONTENT, "com.example.cloud", "com.example.cloud.PickFile", any)

  private fun launch(c: Candidate, kind: Kind) = Choice.Launch(c.action, c.packageName, c.activityName, kind)
  private fun kindOf(c: Candidate) = PickerPolicy.classify(c, own).kind

  // --- the previous scenarios, on the new policy -------------------------

  @Test
  fun phoneWithDocumentsUiOpensDocumentsUiWithOpenDocument() {
    val d = PickerPolicy.decide(listOf(googleDocumentsUi, googleDocumentsUi.copy(action = Action.GET_CONTENT, activityName = "x.GetContentActivity")), own)
    assertEquals(launch(googleDocumentsUi, Kind.DOCUMENTS_UI), d.choice)
  }

  @Test
  fun tvWithOnlyTheStubAndAFileManagerUsesGetContentPinnedToTheFileManager() {
    assertEquals(launch(fileManagerGet, Kind.FILE_MANAGER), PickerPolicy.decide(listOf(tvStubOpen, tvStubGet, fileManagerGet), own).choice)
  }

  @Test
  fun tvWithOnlyTheStubHasNoPicker() {
    assertEquals(Choice.NoPicker, PickerPolicy.decide(listOf(tvStubOpen, tvStubGet), own).choice)
    assertEquals(Choice.NoPicker, PickerPolicy.decide(listOf(tvStubOpen), own).choice)
  }

  @Test
  fun realDocumentsUiNextToAStubIsPinnedSoTheStubCannotWin() {
    assertEquals(launch(documentsUi, Kind.DOCUMENTS_UI), PickerPolicy.decide(listOf(tvStubOpen, documentsUi, tvStubGet), own).choice)
  }

  @Test
  fun tvWithAFileManagerForOpenDocumentUsesItPinned() {
    assertEquals(launch(fileManagerOpen, Kind.FILE_MANAGER), PickerPolicy.decide(listOf(fileManagerOpen), own).choice)
  }

  @Test
  fun nothingVisibleIsNoPickerNotAnImplicitGuess() {
    // Before: an implicit intent was launched and the system picked whatever answered.
    assertEquals(Choice.NoPicker, PickerPolicy.decide(emptyList(), own).choice)
  }

  @Test
  fun theAppItselfIsNeverAPicker() {
    val self = userApp.copy(packageName = own, activityName = "$own.MainActivity")
    assertEquals(Choice.NoPicker, PickerPolicy.decide(listOf(self, self.copy(action = Action.OPEN_DOCUMENT)), own).choice)
    assertEquals(launch(fileManagerGet, Kind.FILE_MANAGER), PickerPolicy.decide(listOf(self, fileManagerGet), own).choice)
  }

  @Test
  fun googleTvStubPackageIsAlsoSkipped() {
    val googleStub = tvStubOpen.copy(packageName = "com.google.android.tv.frameworkpackagestubs", activityName = "a.Documents")
    assertEquals(Choice.NoPicker, PickerPolicy.decide(listOf(googleStub), own).choice)
  }

  // --- the real-device bug: a factory/media test app must never be launched --

  @Test
  fun theRealTvBoxCaseStubPlusFactoryTestAppIsNoPicker() {
    val d = PickerPolicy.decide(listOf(tvStubOpen, tvStubGet, factoryTestNamed), own)
    assertEquals(Choice.NoPicker, d.choice)
    assertTrue(d.launches.isEmpty())
    assertEquals(Kind.REJECTED, d.verdicts.single { it.candidate == factoryTestNamed }.kind)
  }

  @Test
  fun factoryTestAppNextToARealFileManagerNeverWinsEvenWhenListedFirst() {
    val d = PickerPolicy.decide(listOf(factoryTestNamed, unnamedSystemTool, audioVideoTest, fileManagerGet), own)
    assertEquals(listOf(launch(fileManagerGet, Kind.FILE_MANAGER)), d.launches)
  }

  @Test
  fun factoryAndDiagnosticToolsAreRejectedByName() {
    assertEquals(Kind.REJECTED, kindOf(factoryTestNamed))
    assertEquals(Kind.REJECTED, kindOf(factoryModeNamed))
    assertEquals("test", PickerPolicy.diagnosticWord(factoryTestNamed))
    assertEquals(Kind.REJECTED, kindOf(userApp.copy(packageName = "com.oem.hwdiag", activityName = "com.oem.hwdiag.Main")))
    assertEquals(Kind.REJECTED, kindOf(userApp.copy(packageName = "com.oem.agingtest", activityName = "x.Run")))
  }

  @Test
  fun aPreinstalledToolWithANeutralNameIsRejectedByCapability() {
    val v = PickerPolicy.classify(unnamedSystemTool, own)
    assertEquals(Kind.REJECTED, v.kind)
    assertEquals("preinstalled app with no document capability", v.reason)
  }

  @Test
  fun audioVideoTestAppsPlayersAndGalleriesAreRejected() {
    assertEquals(Kind.REJECTED, kindOf(audioVideoTest)) // media types only
    assertEquals(Kind.REJECTED, kindOf(musicPlayer))
    assertEquals(Kind.REJECTED, kindOf(gallery))
    assertEquals(Kind.REJECTED, kindOf(videoCategoryWildcard)) // video app even with the wildcard type
  }

  @Test
  fun settingsAndLaunchersAreRejected() {
    assertEquals("settings app", PickerPolicy.classify(settings, own).reason)
    assertEquals("home launcher", PickerPolicy.classify(launcher, own).reason)
  }

  @Test
  fun stubsAreRejectedByActivityToo() {
    assertEquals(Kind.REJECTED, kindOf(userApp.copy(packageName = "com.oem.docs", activityName = "com.oem.docs.OpenDocumentStub")))
  }

  @Test
  fun openDocumentWithoutManageDocumentsIsNotTreatedAsDocumentsUi() {
    // A preinstalled vendor app claiming OPEN_DOCUMENT without the system permission.
    val fake = documentsUi.copy(packageName = "com.vendor.docs", activityName = "com.vendor.docs.Open", holdsManageDocuments = false)
    assertEquals(Kind.REJECTED, kindOf(fake))
  }

  // --- accepted kinds and order --------------------------------------------

  @Test
  fun preferenceOrderIsDocumentsUiThenFileManagerThenControlledFallback() {
    val d = PickerPolicy.decide(listOf(userApp, vendorFileBrowser, fileManagerGet, documentsUi), own)
    assertEquals(
      listOf(
        launch(documentsUi, Kind.DOCUMENTS_UI),
        launch(vendorFileBrowser, Kind.FILE_MANAGER),
        launch(fileManagerGet, Kind.FILE_MANAGER),
        launch(userApp, Kind.GENERIC_CONTENT),
      ),
      d.launches,
    )
  }

  @Test
  fun preinstalledFileBrowserIsAcceptedBecauseItBrowsesFolders() {
    assertEquals(Kind.FILE_MANAGER, kindOf(vendorFileBrowser))
  }

  @Test
  fun userInstalledGenericPickerIsTheControlledFallback() {
    assertEquals(launch(userApp, Kind.GENERIC_CONTENT), PickerPolicy.decide(listOf(tvStubOpen, tvStubGet, factoryTestNamed, userApp), own).choice)
  }

  @Test
  fun aHandlerWithoutAGenericDocumentTypeIsRejected() {
    assertEquals(Kind.REJECTED, kindOf(userApp.copy(declaredTypes = listOf("application/pdf"))))
    assertEquals(Kind.REJECTED, kindOf(userApp.copy(declaredTypes = null)))
    assertEquals(Kind.GENERIC_CONTENT, kindOf(userApp.copy(declaredTypes = listOf("text/plain"))))
  }

  @Test
  fun wildcardTypesAreNormalized() {
    assertEquals("*/*", PickerPolicy.normalizeType("*"))
    assertEquals("audio/*", PickerPolicy.normalizeType("audio"))
    assertEquals("text/plain", PickerPolicy.normalizeType("text/plain"))
  }

  @Test
  fun duplicatesAreCollapsed() {
    assertEquals(1, PickerPolicy.decide(listOf(fileManagerGet, fileManagerGet), own).launches.size)
  }
}
