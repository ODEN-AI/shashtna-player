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

  /** A launch, compared by what is launched (action, exact activity, tier, OPENABLE); the score is checked separately. */
  private fun launch(c: Candidate, kind: Kind) = "${c.action} ${c.packageName}/${c.activityName} $kind openable=${c.openable}"
  private fun key(choice: Choice): String =
    if (choice is Choice.Launch) "${choice.action} ${choice.packageName}/${choice.activityName} ${choice.kind} openable=${choice.openable}" else "NoPicker"
  private fun keys(d: PickerPolicy.Decision) = d.launches.map(::key)
  private fun kindOf(c: Candidate) = PickerPolicy.classify(c, own).kind

  // --- the previous scenarios, on the new policy -------------------------

  @Test
  fun phoneWithDocumentsUiOpensDocumentsUiWithOpenDocument() {
    val d = PickerPolicy.decide(listOf(googleDocumentsUi, googleDocumentsUi.copy(action = Action.GET_CONTENT, activityName = "x.GetContentActivity")), own)
    assertEquals(launch(googleDocumentsUi, Kind.DOCUMENTS_UI), key(d.choice))
  }

  @Test
  fun tvWithOnlyTheStubAndAFileManagerUsesGetContentPinnedToTheFileManager() {
    assertEquals(launch(fileManagerGet, Kind.FILE_MANAGER), key(PickerPolicy.decide(listOf(tvStubOpen, tvStubGet, fileManagerGet), own).choice))
  }

  @Test
  fun tvWithOnlyTheStubHasNoPicker() {
    assertEquals(Choice.NoPicker, PickerPolicy.decide(listOf(tvStubOpen, tvStubGet), own).choice)
    assertEquals(Choice.NoPicker, PickerPolicy.decide(listOf(tvStubOpen), own).choice)
  }

  @Test
  fun realDocumentsUiNextToAStubIsPinnedSoTheStubCannotWin() {
    assertEquals(launch(documentsUi, Kind.DOCUMENTS_UI), key(PickerPolicy.decide(listOf(tvStubOpen, documentsUi, tvStubGet), own).choice))
  }

  @Test
  fun tvWithAFileManagerForOpenDocumentUsesItPinned() {
    assertEquals(launch(fileManagerOpen, Kind.FILE_MANAGER), key(PickerPolicy.decide(listOf(fileManagerOpen), own).choice))
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
    assertEquals(launch(fileManagerGet, Kind.FILE_MANAGER), key(PickerPolicy.decide(listOf(self, fileManagerGet), own).choice))
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
    assertEquals(listOf(launch(fileManagerGet, Kind.FILE_MANAGER)), keys(d))
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
    assertEquals("preinstalled app with no file capability (no DocumentsProvider, folders, storage access or mounts)", v.reason)
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
    assertEquals("settings activity", PickerPolicy.classify(settings, own).reason)
    assertEquals("home launcher activity", PickerPolicy.classify(launcher, own).reason)
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
  fun preferenceOrderIsDocumentsUiThenFileManagersByScoreThenControlledFallback() {
    val d = PickerPolicy.decide(listOf(userApp, vendorFileBrowser, fileManagerGet, documentsUi), own)
    assertEquals(
      listOf(
        launch(documentsUi, Kind.DOCUMENTS_UI),
        launch(fileManagerGet, Kind.FILE_MANAGER), // DocumentsProvider + folders: higher score
        launch(vendorFileBrowser, Kind.FILE_MANAGER),
        launch(userApp, Kind.GENERIC_CONTENT),
      ),
      keys(d),
    )
    // Deterministic: the same set in any order gives the same ranking.
    assertEquals(keys(d), keys(PickerPolicy.decide(listOf(documentsUi, fileManagerGet, userApp, vendorFileBrowser), own)))
  }

  @Test
  fun preinstalledFileBrowserIsAcceptedBecauseItBrowsesFolders() {
    assertEquals(Kind.FILE_MANAGER, kindOf(vendorFileBrowser))
  }

  @Test
  fun userInstalledGenericPickerIsTheControlledFallback() {
    assertEquals(launch(userApp, Kind.GENERIC_CONTENT), key(PickerPolicy.decide(listOf(tvStubOpen, tvStubGet, factoryTestNamed, userApp), own).choice))
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

  // --- the TV with a working system file manager (E_NO_PICKER on c3fd46d) ----

  /** Typical OEM TV file manager: preinstalled, GET_CONTENT for any type, storage access, no DocumentsProvider or folder VIEW. */
  private val oemFileManager = Candidate(
    Action.GET_CONTENT, "com.oem.tv.filemanager", "com.oem.tv.filemanager.FileChooserActivity", any,
    isSystemApp = true, requestsStorageAccess = true,
  )

  @Test
  fun oemSystemFileManagerIsDiscoveredAcceptedAndSelectedNotNoPicker() {
    val d = PickerPolicy.decide(listOf(tvStubOpen, tvStubGet, oemFileManager), own)
    assertEquals(launch(oemFileManager, Kind.FILE_MANAGER), key(d.choice))
    assertTrue(d.choice != Choice.NoPicker)
    assertEquals("system file manager (storage access)", d.verdicts.single { it.candidate == oemFileManager }.reason)
  }

  @Test
  fun oemFileManagerThatOnlyWatchesStorageMountsIsAccepted() {
    val m = oemFileManager.copy(requestsStorageAccess = false, watchesStorageMounts = true)
    assertEquals(Kind.FILE_MANAGER, kindOf(m))
  }

  @Test
  fun oemFileManagerWithoutOpenableIsAcceptedAndLaunchedWithoutIt() {
    val noOpenable = oemFileManager.copy(openable = false)
    val d = PickerPolicy.decide(listOf(tvStubOpen, noOpenable), own)
    val choice = d.choice as Choice.Launch
    assertEquals(Kind.FILE_MANAGER, choice.kind)
    assertEquals(false, choice.openable) // same form it answered; explicit component launch
  }

  @Test
  fun fileManagerActivityShippedInsideTheLauncherPackageIsAccepted() {
    // Only the HOME activity itself is rejected; its package's other activities are judged on their own.
    val inLauncher = oemFileManager.copy(packageName = "com.oem.tvlauncher", activityName = "com.oem.tvlauncher.files.PickFile", packageHasHome = true)
    val v = PickerPolicy.classify(inLauncher, own)
    assertEquals(Kind.FILE_MANAGER, v.kind)
    assertTrue(v.score < PickerPolicy.classify(oemFileManager, own).score)
    assertEquals(Kind.REJECTED, kindOf(inLauncher.copy(activityName = "com.oem.tvlauncher.Home", isHomeLauncher = true)))
  }

  @Test
  fun fileBrowserInAMediaCenterPackageIsAcceptedOnlyWithRealFileCapability() {
    val mediaCenter = Candidate(Action.GET_CONTENT, "com.oem.mediacenter", "com.oem.mediacenter.FileBrowser", any, isSystemApp = true, category = AppCategory.VIDEO)
    assertEquals(Kind.REJECTED, kindOf(mediaCenter.copy(requestsStorageAccess = true))) // a video app with storage access is still a video app
    assertEquals(Kind.FILE_MANAGER, kindOf(mediaCenter.copy(browsesFolders = true)))
  }

  @Test
  fun ordinaryWordsContainingDiagAreNotDiagnosticTools() {
    val gallery = oemFileManager.copy(packageName = "com.oem.mediagallery", activityName = "com.oem.mediagallery.Files")
    assertEquals(null, PickerPolicy.diagnosticWord(gallery))
    assertEquals(Kind.FILE_MANAGER, kindOf(gallery))
    assertEquals("hwdiag", PickerPolicy.diagnosticWord(userApp.copy(packageName = "com.oem.hwdiag", activityName = "x.Main")))
  }

  @Test
  fun aNeutrallyNamedFactoryToolIsRejectedByItsDeviceControlPermissions() {
    val tool = oemFileManager.copy(
      packageName = "com.vendor.toolbox", activityName = "com.vendor.toolbox.Main",
      deviceControlPermissions = listOf("android.permission.REBOOT", "android.permission.RECOVERY"),
    )
    val v = PickerPolicy.classify(tool, own)
    assertEquals(Kind.REJECTED, v.kind)
    assertEquals("device-control permissions (REBOOT, RECOVERY)", v.reason)
  }

  @Test
  fun documentsUiStillWinsOverTheOemFileManager() {
    assertEquals(launch(documentsUi, Kind.DOCUMENTS_UI), key(PickerPolicy.decide(listOf(oemFileManager, documentsUi), own).choice))
  }

  @Test
  fun textCapableFiltersRankAboveWildcardOnlyOnes() {
    val text = oemFileManager.copy(packageName = "com.b.files", activityName = "com.b.files.Pick", declaredTypes = listOf("text"))
    val wildcard = oemFileManager.copy(packageName = "com.a.files", activityName = "com.a.files.Pick")
    val d = PickerPolicy.decide(listOf(wildcard, text), own)
    assertEquals(listOf(launch(text, Kind.FILE_MANAGER), launch(wildcard, Kind.FILE_MANAGER)), keys(d))
  }

  @Test
  fun stubAndFactoryOnlyIsStillNoPickerWithTheNewSignals() {
    val factoryWithStorage = factoryTestNamed.copy(requestsStorageAccess = true)
    assertEquals(Choice.NoPicker, PickerPolicy.decide(listOf(tvStubOpen, tvStubGet, factoryWithStorage, audioVideoTest, settings, launcher), own).choice)
  }
}
