package com.shashtnaplayer

/**
 * Chooses which activity opens the M3U file picker. Pure logic (no Android
 * types): PlaylistPickerModule gathers the facts, this decides, so every rule
 * is unit-testable.
 *
 * History (both from real TVs):
 * 1. 11ef8ea/26e4c26 launched the first non-stub handler of a wildcard-MIME
 *    GET_CONTENT query, and a TV box started a factory/media test app.
 * 2. c3fd46d classified by capability, but a TV box WITH a working system file
 *    manager got E_NO_PICKER. From the source, that policy dropped a legitimate
 *    OEM file manager in any of these ways (the device log says which):
 *    a. discovery only saw filters declaring BOTH CATEGORY_OPENABLE and
 *       CATEGORY_DEFAULT (MATCH_DEFAULT_ONLY + an OPENABLE query), so a file
 *       manager whose GET_CONTENT filter lacks OPENABLE was never a candidate;
 *    b. a preinstalled app needed a DocumentsProvider or a folder VIEW filter,
 *       which OEM file managers often do not have ("preinstalled app with no
 *       document capability");
 *    c. launcher/settings/media category were judged per PACKAGE, so a file
 *       manager shipped inside the OEM launcher or media-center package was
 *       rejected with it;
 *    d. the joined-word check matched "diag" inside ordinary words
 *       ("mediagallery", "mediaguide").
 *
 * Now:
 * - discovery covers OPEN_DOCUMENT / GET_CONTENT with and without OPENABLE and
 *   several playlist MIME types (PlaylistPickerModule), and records what each
 *   activity really declares;
 * - hard rejections are about identity and safety, judged per ACTIVITY: this
 *   app, framework stubs, the home-screen / settings activity itself, device
 *   test/diagnostic names, device-control permissions (reboot, recovery,
 *   factory reset, hardware test...), media-only filters, no generic type;
 * - a candidate is a file picker when it holds the system document permission
 *   (DocumentsUI) or shows file capability: DocumentsProvider, folder
 *   browsing, storage access permission, or storage-mount handling;
 * - accepted candidates are ranked by a deterministic score, and launched
 *   pinned to their exact activity with the intent form that matched.
 *
 * Tiers: DOCUMENTS_UI > FILE_MANAGER > GENERIC_CONTENT (user-installed app
 * offering documents, no file signals); nothing accepted = E_NO_PICKER.
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

  enum class Kind { DOCUMENTS_UI, FILE_MANAGER, GENERIC_CONTENT, REJECTED }

  /** What the device reports about one activity that answered a picker intent. */
  data class Candidate(
    val action: Action,
    val packageName: String,
    val activityName: String,
    /** MIME types the matched IntentFilter(s) declare (IntentFilter keeps "audio" for audio wildcard); null = unknown. */
    val declaredTypes: List<String>?,
    /** Its picker filter includes CATEGORY_OPENABLE (launched with it; otherwise without). */
    val openable: Boolean = true,
    val isSystemApp: Boolean = false,
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

  private val TIER = mapOf(Kind.DOCUMENTS_UI to 0, Kind.FILE_MANAGER to 1, Kind.GENERIC_CONTENT to 2)

  fun decide(candidates: List<Candidate>, ownPackage: String): Decision {
    val seen = HashSet<String>()
    val verdicts = candidates
      .filter { seen.add("${it.action}|${it.packageName}|${it.activityName}") }
      .map { classify(it, ownPackage) }
    val launches = verdicts
      .filter { it.kind != Kind.REJECTED }
      // Deterministic: tier, then score (high first), then OPEN_DOCUMENT before
      // GET_CONTENT (persistable grant), then names.
      .sortedWith(
        compareBy<Verdict>({ TIER.getValue(it.kind) }, { -it.score }, { it.candidate.action.ordinal })
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
    if (c.action == Action.OPEN_DOCUMENT && c.holdsManageDocuments && (types == null || types.any { it in GENERIC_TYPES })) {
      return Verdict(c, Kind.DOCUMENTS_UI, "system document picker (MANAGE_DOCUMENTS)", 100)
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

    if (evidence.isNotEmpty()) {
      val origin = if (c.isSystemApp) "system file manager" else "file manager"
      return Verdict(c, Kind.FILE_MANAGER, "$origin (${evidence.joinToString()})", score)
    }
    if (!c.isSystemApp) return Verdict(c, Kind.GENERIC_CONTENT, "user-installed app offering documents (fallback)", score)
    return reject("preinstalled app with no file capability (no DocumentsProvider, folders, storage access or mounts)")
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
