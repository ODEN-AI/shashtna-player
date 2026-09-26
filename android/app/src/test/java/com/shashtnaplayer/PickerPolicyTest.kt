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
 * Requirement: the device's own (system/OEM) file explorer; user-installed apps are never launched.
 * No rule depends on one device's package name.
 */
class PickerPolicyTest {
  private val own = "com.ameriptv.player"
  private val any = listOf("*") // IntentFilter keeps the full wildcard type as "*"

  // Android's document picker (system, holds MANAGE_DOCUMENTS).
  private val documentsUi = Candidate(Action.OPEN_DOCUMENT, "com.android.documentsui", "com.android.documentsui.picker.PickActivity", any, isSystemApp = true, holdsManageDocuments = true)
  private val googleDocumentsUi = documentsUi.copy(packageName = "com.google.android.documentsui")

  // Android TV Framework Package Stubs.
  private val tvStubOpen = Candidate(Action.OPEN_DOCUMENT, "com.android.tv.frameworkpackagestubs", "com.android.tv.frameworkpackagestubs.Stubs\$DocumentsStub", any, isSystemApp = true)
  private val tvStubGet = tvStubOpen.copy(action = Action.GET_CONTENT)

  // A capable THIRD-PARTY file manager (user-installed): what the previous build opened.
  private val fileManagerGet = Candidate(Action.GET_CONTENT, "com.alphainventor.filemanager", "com.alphainventor.filemanager.activity.MainActivity", any, exportsDocumentsProvider = true, browsesFolders = true, requestsStorageAccess = true, isLaunchable = true, category = AppCategory.PRODUCTIVITY)
  private val fileManagerOpen = fileManagerGet.copy(action = Action.OPEN_DOCUMENT)
  // A vendor file browser preinstalled on a TV box (system app, browses folders).
  private val vendorFileBrowser = Candidate(Action.GET_CONTENT, "com.vendor.filebrowser", "com.vendor.filebrowser.FileBrowserActivity", any, isSystemApp = true, browsesFolders = true)

  // What the real TV box launched in the first build: a preinstalled factory / hardware test app.
  private val factoryTestNamed = Candidate(Action.GET_CONTENT, "com.DeviceTest", "com.DeviceTest.DeviceTestActivity", any, isSystemApp = true)
  private val factoryModeNamed = Candidate(Action.GET_CONTENT, "com.vendor.tools", "com.vendor.tools.FactoryModeActivity", any, isSystemApp = true)
  // The same kind of app with a neutral name: rejected by capability (preinstalled, no file ability).
  private val unnamedSystemTool = Candidate(Action.GET_CONTENT, "com.vendor.mediacenter", "com.vendor.mediacenter.Main", any, isSystemApp = true)
  private val audioVideoTest = Candidate(Action.GET_CONTENT, "com.vendor.av", "com.vendor.av.PlayActivity", listOf("audio", "video"), isSystemApp = true)
  private val musicPlayer = Candidate(Action.GET_CONTENT, "com.example.music", "com.example.music.PickTrack", listOf("audio"), category = AppCategory.AUDIO)
  private val gallery = Candidate(Action.GET_CONTENT, "com.example.gallery", "com.example.gallery.Pick", listOf("image", "video"), category = AppCategory.IMAGE)
  private val videoCategoryWildcard = Candidate(Action.GET_CONTENT, "com.example.player", "com.example.player.Open", any, category = AppCategory.VIDEO)
  private val systemVideoPlayer = Candidate(Action.GET_CONTENT, "com.oem.videoplayer", "com.oem.videoplayer.Open", any, isSystemApp = true, isLaunchable = true, requestsStorageAccess = true, category = AppCategory.VIDEO)
  private val settings = Candidate(Action.GET_CONTENT, "com.android.tv.settings", "com.android.tv.settings.MainSettings", any, isSystemApp = true, isSettingsApp = true)
  private val launcher = Candidate(Action.GET_CONTENT, "com.vendor.launcher", "com.vendor.launcher.Home", any, isSystemApp = true, isHomeLauncher = true)
  private val userApp = Candidate(Action.GET_CONTENT, "com.example.cloud", "com.example.cloud.PickFile", any)

  /** Typical OEM TV file explorer: preinstalled, in the app list, storage access, GET_CONTENT for any type. */
  private val oemExplorer = Candidate(
    Action.GET_CONTENT, "com.oem.tv.filemanager", "com.oem.tv.filemanager.FileChooserActivity", any,
    isSystemApp = true, isLaunchable = true, requestsStorageAccess = true,
  )

  /** A launch, compared by what is launched (action, exact activity, tier, OPENABLE); the score is checked separately. */
  private fun launch(c: Candidate, kind: Kind) = "${c.action} ${c.packageName}/${c.activityName} $kind openable=${c.openable}"
  private fun key(choice: Choice): String =
    if (choice is Choice.Launch) "${choice.action} ${choice.packageName}/${choice.activityName} ${choice.kind} openable=${choice.openable}" else "NoPicker"
  private fun keys(d: PickerPolicy.Decision) = d.launches.map(::key)
  private fun kindOf(c: Candidate) = PickerPolicy.classify(c, own).kind
  private fun tv(vararg c: Candidate) = PickerPolicy.decide(c.toList(), own, television = true)
  private fun phone(vararg c: Candidate) = PickerPolicy.decide(c.toList(), own, television = false)

  // --- 1. the OEM/system explorer is the one that opens ----------------------

  @Test
  fun oemExplorerOutranksAThirdPartyManagerEvenWithALowerScore() {
    val d = tv(fileManagerGet, oemExplorer)
    assertEquals(listOf(launch(oemExplorer, Kind.OEM_FILE_EXPLORER)), keys(d)) // the third-party one is never in the list
    val third = d.verdicts.single { it.candidate == fileManagerGet }
    val oem = d.verdicts.single { it.candidate == oemExplorer }
    assertEquals(Kind.USER_INSTALLED, third.kind)
    assertTrue(third.score > oem.score) // why 95ead3f picked it: one tier, ranked by score
  }

  @Test
  fun oemExplorerIsDiscoveredAcceptedAndSelectedNotNoPicker() {
    val d = tv(tvStubOpen, tvStubGet, oemExplorer)
    assertEquals(launch(oemExplorer, Kind.OEM_FILE_EXPLORER), key(d.choice))
    assertEquals("OEM file explorer, system app (storage access, in the app list)", d.verdicts.single { it.candidate == oemExplorer }.reason)
  }

  @Test
  fun anUpdatedSystemAppIsStillTheOemExplorer() {
    val updated = oemExplorer.copy(isSystemApp = false, isUpdatedSystemApp = true)
    assertEquals(Kind.OEM_FILE_EXPLORER, kindOf(updated))
    assertEquals(launch(updated, Kind.OEM_FILE_EXPLORER), key(tv(fileManagerGet, updated).choice))
  }

  @Test
  fun onATvTheOemExplorerComesBeforeDocumentsUiAndBothBeforeOtherSystemPickers() {
    val systemPicker = oemExplorer.copy(packageName = "com.oem.storage", activityName = "com.oem.storage.Pick", isLaunchable = false, requestsStorageAccess = false, watchesStorageMounts = true)
    val d = tv(systemPicker, documentsUi, fileManagerGet, oemExplorer)
    assertEquals(
      listOf(launch(oemExplorer, Kind.OEM_FILE_EXPLORER), launch(documentsUi, Kind.DOCUMENTS_UI), launch(systemPicker, Kind.SYSTEM_PICKER)),
      keys(d),
    )
    // Deterministic: the same set in any order gives the same ranking.
    assertEquals(keys(d), keys(tv(oemExplorer, fileManagerGet, documentsUi, systemPicker)))
  }

  @Test
  fun phonesAndTabletsKeepDocumentsUiFirstAsBefore() {
    assertEquals(launch(documentsUi, Kind.DOCUMENTS_UI), key(phone(oemExplorer, documentsUi, fileManagerGet).choice))
    assertEquals(launch(googleDocumentsUi, Kind.DOCUMENTS_UI), key(phone(googleDocumentsUi, googleDocumentsUi.copy(action = Action.GET_CONTENT, activityName = "x.GetContentActivity")).choice))
  }

  @Test
  fun documentsUiOutranksAThirdPartyManager() {
    assertEquals(listOf(launch(documentsUi, Kind.DOCUMENTS_UI)), keys(tv(fileManagerGet, fileManagerOpen, documentsUi)))
  }

  @Test
  fun severalSystemExplorersRankByCapabilityNotByName() {
    // "a..." would win alphabetically; the folder-browsing explorer has more file capability.
    val weaker = oemExplorer.copy(packageName = "com.a.files", activityName = "com.a.files.Pick")
    val stronger = oemExplorer.copy(packageName = "com.z.files", activityName = "com.z.files.Pick", browsesFolders = true)
    assertEquals(listOf(launch(stronger, Kind.OEM_FILE_EXPLORER), launch(weaker, Kind.OEM_FILE_EXPLORER)), keys(tv(weaker, stronger)))
  }

  @Test
  fun textCapableFiltersRankAboveWildcardOnlyOnes() {
    val text = oemExplorer.copy(packageName = "com.b.files", activityName = "com.b.files.Pick", declaredTypes = listOf("text"))
    val wildcard = oemExplorer.copy(packageName = "com.a.files", activityName = "com.a.files.Pick")
    assertEquals(listOf(launch(text, Kind.OEM_FILE_EXPLORER), launch(wildcard, Kind.OEM_FILE_EXPLORER)), keys(tv(wildcard, text)))
  }

  // --- 2. user-installed apps are never launched ------------------------------

  @Test
  fun onlyAThirdPartyManagerIsNoPickerNotTheThirdPartyManager() {
    // Was: GET_CONTENT pinned to the file manager. Now: system/OEM picker required.
    val d = tv(tvStubOpen, tvStubGet, fileManagerGet)
    assertEquals(Choice.NoPicker, d.choice)
    assertEquals(Kind.USER_INSTALLED, d.verdicts.single { it.candidate == fileManagerGet }.kind)
    assertEquals(Choice.NoPicker, tv(fileManagerOpen).choice)
  }

  @Test
  fun aUserInstalledAppIsNeverAFallback() {
    assertEquals(Kind.USER_INSTALLED, kindOf(userApp))
    assertEquals(Choice.NoPicker, tv(tvStubOpen, tvStubGet, factoryTestNamed, userApp).choice)
    assertEquals(Choice.NoPicker, phone(userApp, fileManagerGet).choice)
  }

  // --- 3. system apps must still be file pickers ------------------------------

  @Test
  fun aSystemAppAloneIsNotAPicker() {
    val v = PickerPolicy.classify(unnamedSystemTool, own)
    assertEquals(Kind.REJECTED, v.kind)
    assertEquals("system app with no file capability (no DocumentsProvider, folders, storage access or mounts)", v.reason)
  }

  @Test
  fun factoryTestAppIsRejectedEvenAsALaunchableSystemAppWithStorage() {
    val factory = factoryTestNamed.copy(isLaunchable = true, requestsStorageAccess = true)
    assertEquals(Kind.REJECTED, kindOf(factory))
    assertEquals(Choice.NoPicker, tv(tvStubOpen, tvStubGet, factory).choice)
  }

  @Test
  fun theRealTvBoxCaseStubPlusFactoryTestAppIsNoPicker() {
    val d = tv(tvStubOpen, tvStubGet, factoryTestNamed)
    assertEquals(Choice.NoPicker, d.choice)
    assertTrue(d.launches.isEmpty())
  }

  @Test
  fun factoryAppsNeverWinEvenWhenListedFirst() {
    assertEquals(listOf(launch(vendorFileBrowser, Kind.OEM_FILE_EXPLORER)), keys(tv(factoryTestNamed, unnamedSystemTool, audioVideoTest, vendorFileBrowser)))
  }

  @Test
  fun factoryAndDiagnosticToolsAreRejectedByName() {
    assertEquals(Kind.REJECTED, kindOf(factoryTestNamed))
    assertEquals(Kind.REJECTED, kindOf(factoryModeNamed))
    assertEquals("test", PickerPolicy.diagnosticWord(factoryTestNamed))
    assertEquals(Kind.REJECTED, kindOf(oemExplorer.copy(packageName = "com.oem.hwdiag", activityName = "com.oem.hwdiag.Main")))
    assertEquals(Kind.REJECTED, kindOf(oemExplorer.copy(packageName = "com.oem.agingtest", activityName = "x.Run")))
  }

  @Test
  fun aNeutrallyNamedFactoryToolIsRejectedByItsDeviceControlPermissions() {
    val tool = oemExplorer.copy(
      packageName = "com.vendor.toolbox", activityName = "com.vendor.toolbox.Main",
      deviceControlPermissions = listOf("android.permission.REBOOT", "android.permission.RECOVERY"),
    )
    val v = PickerPolicy.classify(tool, own)
    assertEquals(Kind.REJECTED, v.kind)
    assertEquals("device-control permissions (REBOOT, RECOVERY)", v.reason)
  }

  @Test
  fun settingsAndLaunchersAreRejected() {
    assertEquals("settings activity", PickerPolicy.classify(settings, own).reason)
    assertEquals("home launcher activity", PickerPolicy.classify(launcher, own).reason)
    assertEquals(Choice.NoPicker, tv(settings, launcher).choice)
  }

  @Test
  fun mediaAudioVideoAndGalleryAppsAreRejected() {
    assertEquals(Kind.REJECTED, kindOf(audioVideoTest)) // media types only
    assertEquals(Kind.REJECTED, kindOf(musicPlayer))
    assertEquals(Kind.REJECTED, kindOf(gallery))
    assertEquals(Kind.REJECTED, kindOf(videoCategoryWildcard))
    assertEquals(Kind.REJECTED, kindOf(systemVideoPlayer)) // a system video app with storage access is still a video app
    assertEquals(Choice.NoPicker, tv(audioVideoTest, systemVideoPlayer).choice)
  }

  @Test
  fun stubsAreRejected() {
    assertEquals(Choice.NoPicker, tv(tvStubOpen, tvStubGet).choice)
    val googleStub = tvStubOpen.copy(packageName = "com.google.android.tv.frameworkpackagestubs", activityName = "a.Documents")
    assertEquals(Choice.NoPicker, tv(googleStub).choice)
    assertEquals(Kind.REJECTED, kindOf(oemExplorer.copy(packageName = "com.oem.docs", activityName = "com.oem.docs.OpenDocumentStub")))
  }

  @Test
  fun openDocumentWithoutManageDocumentsIsNotTreatedAsDocumentsUi() {
    val fake = documentsUi.copy(packageName = "com.vendor.docs", activityName = "com.vendor.docs.Open", holdsManageDocuments = false)
    assertEquals(Kind.REJECTED, kindOf(fake))
    // And MANAGE_DOCUMENTS only counts for system apps.
    assertEquals(Kind.USER_INSTALLED, kindOf(documentsUi.copy(packageName = "com.example.docs", isSystemApp = false)))
  }

  // --- 4. the OEM-compatibility fixes from 95ead3f still hold -----------------

  @Test
  fun oemExplorerWithoutOpenableIsAcceptedAndLaunchedWithoutIt() {
    val choice = tv(tvStubOpen, oemExplorer.copy(openable = false)).choice as Choice.Launch
    assertEquals(Kind.OEM_FILE_EXPLORER, choice.kind)
    assertEquals(false, choice.openable)
  }

  @Test
  fun explorerActivityShippedInsideTheLauncherPackageIsAccepted() {
    val inLauncher = oemExplorer.copy(packageName = "com.oem.tvlauncher", activityName = "com.oem.tvlauncher.files.PickFile", packageHasHome = true)
    val v = PickerPolicy.classify(inLauncher, own)
    assertEquals(Kind.OEM_FILE_EXPLORER, v.kind)
    assertTrue(v.score < PickerPolicy.classify(oemExplorer, own).score)
    assertEquals(Kind.REJECTED, kindOf(inLauncher.copy(activityName = "com.oem.tvlauncher.Home", isHomeLauncher = true)))
  }

  @Test
  fun fileBrowserInAMediaCenterPackageIsAcceptedOnlyWithRealFileCapability() {
    val mediaCenter = Candidate(Action.GET_CONTENT, "com.oem.mediacenter", "com.oem.mediacenter.FileBrowser", any, isSystemApp = true, category = AppCategory.VIDEO)
    assertEquals(Kind.REJECTED, kindOf(mediaCenter.copy(requestsStorageAccess = true, isLaunchable = true)))
    assertEquals(Kind.OEM_FILE_EXPLORER, kindOf(mediaCenter.copy(browsesFolders = true)))
  }

  @Test
  fun ordinaryWordsContainingDiagAreNotDiagnosticTools() {
    val mediaGallery = oemExplorer.copy(packageName = "com.oem.mediagallery", activityName = "com.oem.mediagallery.Files")
    assertEquals(null, PickerPolicy.diagnosticWord(mediaGallery))
    assertEquals(Kind.OEM_FILE_EXPLORER, kindOf(mediaGallery))
    assertEquals("hwdiag", PickerPolicy.diagnosticWord(userApp.copy(packageName = "com.oem.hwdiag", activityName = "x.Main")))
  }

  @Test
  fun preinstalledFolderBrowserIsAnOemExplorerEvenWithoutAnAppListEntry() {
    assertEquals(Kind.OEM_FILE_EXPLORER, kindOf(vendorFileBrowser))
  }

  @Test
  fun aNonLaunchableSystemComponentWithOnlyStorageSignalsIsAPlainSystemPicker() {
    val m = oemExplorer.copy(isLaunchable = false, requestsStorageAccess = false, watchesStorageMounts = true)
    assertEquals(Kind.SYSTEM_PICKER, kindOf(m))
  }

  @Test
  fun documentsUiNextToAStubIsPinnedSoTheStubCannotWin() {
    assertEquals(launch(documentsUi, Kind.DOCUMENTS_UI), key(tv(tvStubOpen, documentsUi, tvStubGet).choice))
  }

  @Test
  fun theAppItselfIsNeverAPicker() {
    val self = oemExplorer.copy(packageName = own, activityName = "$own.MainActivity")
    assertEquals(Choice.NoPicker, tv(self, self.copy(action = Action.OPEN_DOCUMENT)).choice)
    assertEquals(launch(vendorFileBrowser, Kind.OEM_FILE_EXPLORER), key(tv(self, vendorFileBrowser).choice))
  }

  @Test
  fun aHandlerWithoutAGenericDocumentTypeIsRejected() {
    assertEquals(Kind.REJECTED, kindOf(oemExplorer.copy(declaredTypes = listOf("application/pdf"))))
    assertEquals(Kind.REJECTED, kindOf(oemExplorer.copy(declaredTypes = null)))
    assertEquals(Kind.OEM_FILE_EXPLORER, kindOf(oemExplorer.copy(declaredTypes = listOf("text/plain"))))
  }

  @Test
  fun nothingVisibleIsNoPicker() {
    assertEquals(Choice.NoPicker, tv().choice)
    assertEquals(Choice.NoPicker, phone().choice)
  }

  @Test
  fun stubFactoryMediaSettingsLauncherAndThirdPartyTogetherAreStillNoPicker() {
    val factoryWithStorage = factoryTestNamed.copy(requestsStorageAccess = true, isLaunchable = true)
    assertEquals(Choice.NoPicker, tv(tvStubOpen, tvStubGet, factoryWithStorage, audioVideoTest, systemVideoPlayer, settings, launcher, fileManagerGet, userApp).choice)
  }

  @Test
  fun wildcardTypesAreNormalized() {
    assertEquals("*/*", PickerPolicy.normalizeType("*"))
    assertEquals("audio/*", PickerPolicy.normalizeType("audio"))
    assertEquals("text/plain", PickerPolicy.normalizeType("text/plain"))
  }

  @Test
  fun duplicatesAreCollapsed() {
    assertEquals(1, tv(oemExplorer, oemExplorer).launches.size)
  }
}
