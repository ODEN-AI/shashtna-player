package com.shashtnaplayer

/**
 * Chooses which activity opens the M3U file picker. Pure logic (no Android
 * types): PlaylistPickerModule gathers the facts, this decides, so every rule
 * is unit-testable.
 *
 * History (all from real TVs):
 * 1. 11ef8ea/26e4c26 launched the first non-stub handler of a wildcard-MIME
 *    GET_CONTENT query: a TV box started a factory/media test app.
 * 2. c3fd46d: a TV WITH a system file manager got E_NO_PICKER (discovery needed
 *    OPENABLE+DEFAULT; package-level launcher/settings/media rejection; system
 *    apps needed a DocumentsProvider or folder VIEW; "diag" inside words).
 * 3. 95ead3f fixed those, but put system and user-installed managers in ONE
 *    tier (FILE_MANAGER) ranked by score. Third-party managers usually export a
 *    DocumentsProvider (+40) and folder VIEW (+30), so they out-scored the OEM
 *    explorer (storage access +20): the TV opened a third-party manager.
 *
 * Requirement now: open the device's own (system/OEM) file explorer.
 * - Origin is a hard gate, not a score: only system apps (FLAG_SYSTEM) and
 *   updated system apps (FLAG_UPDATED_SYSTEM_APP) can be launched. A
 *   user-installed app is classified (USER_INSTALLED, logged) but never
 *   launched, however capable it is.
 * - Being a system app proves nothing by itself: the same identity/safety
 *   rejections apply (stubs, the home/settings activity itself, diagnostic
 *   names, device-control permissions, media-only filters, media apps without
 *   file capability), and a system app must show file-picker capability.
 * - Tiers, deterministic (then score, OPEN_DOCUMENT first, then names):
 *     OEM_FILE_EXPLORER  system app, not DocumentsUI, that the user can open from
 *                        the app list (launchable) or that browses folders /
 *                        ships a DocumentsProvider, and answers OPEN_DOCUMENT or
 *                        GET_CONTENT for generic documents;
 *     DOCUMENTS_UI       Android's document picker (MANAGE_DOCUMENTS);
 *     SYSTEM_PICKER      other system picker with file signals (storage access /
 *                        storage mounts) but no user-facing explorer;
 *   On a TV the OEM explorer comes first (the requirement); on phones and
 *   tablets DocumentsUI stays first, as before.
 * - Nothing launchable: E_NO_PICKER (the Arabic "cannot open the file manager"
 *   message), never a third-party app.
 */
internal object PickerPolicy {
  /** Register for picker intents on Android TV but cannot pick a file. */
  val STUB_PACKAGES = setOf(
    "com.android.tv.frameworkpackagestubs",
    "com.google.android.tv.frameworkpackagestubs",
  )

  enum class Action { OPEN_DOCUMENT, GET_CONTENT }

  /** ApplicationInfo.category, as far as the policy cares. */
  enum class AppCategory { UNDEFINED, PRODUCTIVITY, AUDIO, VIDEO, IMAGE, GAME, SOCIAL, NEWS, MAPS, OTHER }

  enum class Kind {
    OEM_FILE_EXPLORER,
    DOCUMENTS_UI,
    SYSTEM_PICKER,

    /** A working picker from a user-installed app: logged, never launched (system/OEM picker required). */
    USER_INSTALLED,
    REJECTED,
  }

  /** What the device reports about one activity that answered a picker intent. */
  data class Candidate(
    val action: Action,
    val packageName: String,
    val activityName: String,
    /** MIME types the matched IntentFilter(s) declare (IntentFilter keeps "audio" for audio wildcard); null = unknown. */
    val declaredTypes: List<String>?,
    /** Its picker filter includes CATEGORY_OPENABLE (launched with it; otherwise without). */
    val openable: Boolean = true,
    /** ApplicationInfo.FLAG_SYSTEM: preinstalled in the firmware. */
    val isSystemApp: Boolean = false,
    /** ApplicationInfo.FLAG_UPDATED_SYSTEM_APP: a firmware app updated since (still the OEM's app). */
    val isUpdatedSystemApp: Boolean = false,
    /** The package has an app-list entry (LAUNCHER / LEANBACK_LAUNCHER): a user-facing app. */
    val isLaunchable: Boolean = false,
    /** android.permission.MANAGE_DOCUMENTS is granted to the package (system DocumentsUI). */
    val holdsManageDocuments: Boolean = false,
    /** The package has a provider protected by MANAGE_DOCUMENTS, i.e. a DocumentsProvider. */
    val exportsDocumentsProvider: Boolean = false,
    /** The package opens folders (VIEW resource/folder, inode/directory, ...). */
    val browsesFolders: Boolean = false,
    /** Requests READ/WRITE/MANAGE_EXTERNAL_STORAGE or MOUNT_UNMOUNT_FILESYSTEMS. */
    val requestsStorageAccess: Boolean = false,
    /** Has a receiver for storage mount / USB-storage events. */
    val watchesStorageMounts: Boolean = false,
    /** Device-control permissions it requests (reboot, recovery, factory reset, hardware test, ...). */
    val deviceControlPermissions: List<String> = emptyList(),
    /** THIS activity is a home screen. */
    val isHomeLauncher: Boolean = false,
    /** THIS activity is a settings screen. */
    val isSettingsApp: Boolean = false,
    /** Another activity of the package is a home screen (OEM launchers can ship the file manager). */
    val packageHasHome: Boolean = false,
    /** Another activity of the package is a settings screen. */
    val packageHasSettings: Boolean = false,
    val category: AppCategory = AppCategory.UNDEFINED,
  )

  data class Verdict(val candidate: Candidate, val kind: Kind, val reason: String, val score: Int = 0)

  sealed class Choice {
    /** Launch [action] pinned to [packageName]/[activityName] (with CATEGORY_OPENABLE when [openable]). */
    data class Launch(
      val action: Action,
      val packageName: String,
      val activityName: String,
      val kind: Kind,
      val openable: Boolean = true,
      val score: Int = 0,
    ) : Choice()

    /** No safe file picker on this device: E_NO_PICKER. */
    object NoPicker : Choice() {
      override fun toString() = "NoPicker"
    }
  }

  data class Decision(val verdicts: List<Verdict>, val launches: List<Choice.Launch>) {
    /** First choice; the module falls through [launches] in order if one cannot start. */
    val choice: Choice get() = launches.firstOrNull() ?: Choice.NoPicker
  }

  private val MEDIA_CATEGORIES =
    setOf(AppCategory.AUDIO, AppCategory.VIDEO, AppCategory.IMAGE, AppCategory.GAME, AppCategory.SOCIAL, AppCategory.NEWS, AppCategory.MAPS)

  /** Types that mean "any document", which a playlist picker must offer. */
  private val GENERIC_TYPES = setOf("*/*", "application/*", "text/*", "application/octet-stream", "text/plain")
  private val TEXT_TYPES = setOf("text/*", "text/plain")

  /**
   * Permissions no file manager needs: they control the device itself. Factory
   * test / diagnostic / firmware tools request them (full names, compared exactly).
   */
  val DEVICE_CONTROL_PERMISSIONS = setOf(
    "android.permission.REBOOT",
    "android.permission.RECOVERY",
    "android.permission.MASTER_CLEAR",
    "android.permission.HARDWARE_TEST",
    "android.permission.FACTORY_TEST",
    "android.permission.DEVICE_POWER",
    "android.permission.SHUTDOWN",
    "android.permission.BLUETOOTH_PRIVILEGED",
    "android.permission.ACCESS_CACHE_FILESYSTEM",
  )

  /** Name words of device test / diagnostic / factory tools (whole words only). */
  private val DIAGNOSTIC_WORDS = setOf(
    "factory", "factorytest", "factorymode", "devicetest", "hwtest", "hardwaretest", "test", "tests", "tester",
    "testing", "diag", "diags", "diagnostic", "diagnostics", "hwdiag", "aging", "agingtest", "burnin", "pcba",
    "engineer", "engineering", "engineermode", "selftest", "stresstest", "mmitest", "benchmark",
  )

  /**
   * Joined forms inside a longer word ("com.DeviceTest", "factorymodeactivity").
   * Only parts that cannot occur inside ordinary words: not "diag" ("mediagallery").
   */
  private val DIAGNOSTIC_PARTS = listOf("factory", "devicetest", "hwtest", "hwdiag", "diagnos", "agingtest", "burnin")

  /** Launch order of the accepted kinds: TV (OEM explorer first) and phone/tablet (DocumentsUI first, as before). */
  private val TV_ORDER = listOf(Kind.OEM_FILE_EXPLORER, Kind.DOCUMENTS_UI, Kind.SYSTEM_PICKER)
  private val PHONE_ORDER = listOf(Kind.DOCUMENTS_UI, Kind.OEM_FILE_EXPLORER, Kind.SYSTEM_PICKER)

  fun isSystemOrigin(c: Candidate) = c.isSystemApp || c.isUpdatedSystemApp

  fun decide(candidates: List<Candidate>, ownPackage: String, television: Boolean = true): Decision {
    val seen = HashSet<String>()
    val verdicts = candidates
      .filter { seen.add("${it.action}|${it.packageName}|${it.activityName}") }
      .map { classify(it, ownPackage) }
    val order = if (television) TV_ORDER else PHONE_ORDER
    val launches = verdicts
      .filter { it.kind in order }
      // Deterministic: tier, then score (high first), then OPEN_DOCUMENT before
      // GET_CONTENT (persistable grant), then names.
      .sortedWith(
        compareBy<Verdict>({ order.indexOf(it.kind) }, { -it.score }, { it.candidate.action.ordinal })
          .thenBy { it.candidate.packageName }
          .thenBy { it.candidate.activityName },
      )
      .map {
        val c = it.candidate
        Choice.Launch(c.action, c.packageName, c.activityName, it.kind, c.openable, it.score)
      }
    return Decision(verdicts, launches)
  }

  fun classify(c: Candidate, ownPackage: String): Verdict {
    fun reject(reason: String) = Verdict(c, Kind.REJECTED, reason)

    // Identity and safety: never a picker, whatever it declares.
    if (c.packageName == ownPackage) return reject("this app")
    if (c.packageName in STUB_PACKAGES || c.activityName.contains("stub", ignoreCase = true)) {
      return reject("framework stub (cannot pick files)")
    }
    if (c.isHomeLauncher) return reject("home launcher activity")
    if (c.isSettingsApp) return reject("settings activity")
    diagnosticWord(c)?.let { return reject("device test/diagnostic tool (name: $it)") }
    val control = c.deviceControlPermissions.filter { it in DEVICE_CONTROL_PERMISSIONS }
    if (control.isNotEmpty()) {
      return reject("device-control permissions (${control.joinToString { it.substringAfterLast('.') }})")
    }

    val types = c.declaredTypes?.map(::normalizeType)
    if (c.holdsManageDocuments && isSystemOrigin(c) && (types == null || types.any { it in GENERIC_TYPES })) {
      return Verdict(c, Kind.DOCUMENTS_UI, "Android document picker (MANAGE_DOCUMENTS)", if (c.action == Action.OPEN_DOCUMENT) 100 else 90)
    }
    if (types == null) return reject("filter unknown (cannot prove it offers documents)")
    if (types.isNotEmpty() && types.all(::isMediaType)) return reject("media types only (${types.joinToString()})")
    if (types.none { it in GENERIC_TYPES }) return reject("no generic document type (${types.joinToString()})")

    // File capability: what a file manager has and a media/test tool does not need.
    val evidence = buildList {
      if (c.exportsDocumentsProvider) add("DocumentsProvider")
      if (c.browsesFolders) add("browses folders")
      if (c.requestsStorageAccess) add("storage access")
      if (c.watchesStorageMounts) add("storage mounts")
    }
    val strong = c.exportsDocumentsProvider || c.browsesFolders
    if (c.category in MEDIA_CATEGORIES && !strong) return reject("${c.category.name.lowercase()} app")

    var score = 0
    if (c.exportsDocumentsProvider) score += 40
    if (c.browsesFolders) score += 30
    if (c.requestsStorageAccess) score += 20
    if (c.watchesStorageMounts) score += 15
    if (c.openable) score += 15
    if (types.any { it in TEXT_TYPES }) score += 10 else if ("*/*" in types) score += 5
    if (c.action == Action.OPEN_DOCUMENT) score += 5
    if (c.category in MEDIA_CATEGORIES) score -= 30
    if (c.packageHasHome) score -= 10
    if (c.packageHasSettings) score -= 10
    if (c.isLaunchable) score += 10

    if (!isSystemOrigin(c)) {
      val what = if (evidence.isNotEmpty()) "file manager (${evidence.joinToString()})" else "app offering documents"
      return Verdict(c, Kind.USER_INSTALLED, "user-installed $what: not used, system/OEM picker required", score)
    }
    val origin = if (c.isUpdatedSystemApp) "updated system app" else "system app"
    if (strong || (c.isLaunchable && evidence.isNotEmpty())) {
      val how = (evidence + if (c.isLaunchable) listOf("in the app list") else emptyList()).joinToString()
      return Verdict(c, Kind.OEM_FILE_EXPLORER, "OEM file explorer, $origin ($how)", score)
    }
    if (evidence.isNotEmpty()) {
      return Verdict(c, Kind.SYSTEM_PICKER, "system picker, $origin (${evidence.joinToString()}), not a user-facing explorer", score)
    }
    return reject("$origin with no file capability (no DocumentsProvider, folders, storage access or mounts)")
  }

  /** IntentFilter keeps wildcard types without the subtype: "*" and "audio" become full wildcard types. */
  fun normalizeType(type: String): String {
    val t = type.trim().lowercase()
    return if (t.contains('/')) t else "$t/*"
  }

  private fun isMediaType(type: String) = type.startsWith("audio/") || type.startsWith("video/") || type.startsWith("image/")

  /** The first diagnostic word in the package or activity name (split on . _ $ - and camelCase). */
  fun diagnosticWord(c: Candidate): String? {
    val words = (c.packageName + "." + c.activityName)
      .replace(Regex("([a-z0-9])([A-Z])"), "$1.$2")
      .lowercase()
      .split('.', '_', '$', '-')
      .filter { it.isNotEmpty() }
    words.firstOrNull { it in DIAGNOSTIC_WORDS }?.let { return it }
    return words.firstOrNull { w -> DIAGNOSTIC_PARTS.any { w.contains(it) } }
  }
}
