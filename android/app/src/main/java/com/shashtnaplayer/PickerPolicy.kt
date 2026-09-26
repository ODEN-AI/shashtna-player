package com.shashtnaplayer

/**
 * Chooses which activity opens the M3U file picker. Pure logic (no Android
 * types): PlaylistPickerModule gathers the facts, this decides, so every rule
 * is unit-testable.
 *
 * Why capability-based: "answers the intent" is not "is a file picker". The
 * handlers are found with queryIntentActivities(OPEN_DOCUMENT / GET_CONTENT)
 * using the wildcard MIME type, and a wildcard query matches EVERY activity
 * that declares any MIME type in such a filter (audio, video, ...). On TV
 * boxes without DocumentsUI that set is the Framework Package Stubs plus
 * whatever vendor apps declared those actions: a real device resolved
 * GET_CONTENT to a preinstalled factory/media test app (music, video, Wi-Fi,
 * Bluetooth, firmware tests). The previous policy launched the first non-stub
 * package, and with a single handler it sent an implicit intent, so Android
 * started that app directly.
 *
 * Now every candidate is classified from what it can do, and only a candidate
 * that can return an openable document is launched, pinned to its exact
 * activity (never an implicit intent the system could route elsewhere):
 *   1. DOCUMENTS_UI    system document picker: OPEN_DOCUMENT handler holding
 *                      android.permission.MANAGE_DOCUMENTS (signature|privileged,
 *                      held by DocumentsUI, not by stubs or vendor tools);
 *   2. FILE_MANAGER    offers generic documents AND has file capability: ships
 *                      a DocumentsProvider or browses folders;
 *   3. GENERIC_CONTENT controlled fallback: a user-installed app offering
 *                      generic documents through GET_CONTENT / OPEN_DOCUMENT;
 *   otherwise NoPicker (E_NO_PICKER), never "try it and see".
 * Rejected whatever they declare: this app, framework stubs, home launchers,
 * settings apps, factory/diagnostic/test tools, media/game-category apps,
 * handlers of media types only, and preinstalled apps with no document
 * capability (how vendor test/media tools look from outside).
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
    /** MIME types the matched IntentFilter declares (IntentFilter keeps "audio" for audio wildcard); null = unknown. */
    val declaredTypes: List<String>?,
    val isSystemApp: Boolean = false,
    /** android.permission.MANAGE_DOCUMENTS is granted to the package (system DocumentsUI). */
    val holdsManageDocuments: Boolean = false,
    /** The package has a provider protected by MANAGE_DOCUMENTS, i.e. a DocumentsProvider. */
    val exportsDocumentsProvider: Boolean = false,
    /** The package opens folders (VIEW resource/folder, inode/directory, ...). */
    val browsesFolders: Boolean = false,
    val isHomeLauncher: Boolean = false,
    val isSettingsApp: Boolean = false,
    val category: AppCategory = AppCategory.UNDEFINED,
  )

  data class Verdict(val candidate: Candidate, val kind: Kind, val reason: String)

  sealed class Choice {
    /** Launch [action] pinned to [packageName]/[activityName]. */
    data class Launch(val action: Action, val packageName: String, val activityName: String, val kind: Kind) : Choice()

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

  /** Name words of device test / diagnostic / factory tools (generic words, not package names). */
  private val DIAGNOSTIC_WORDS = setOf(
    "factory", "factorytest", "factorymode", "devicetest", "hwtest", "hardwaretest", "test", "tests", "tester",
    "testing", "diag", "diags", "diagnostic", "diagnostics", "aging", "agingtest", "burnin", "pcba", "engineer",
    "engineering", "engineermode", "selftest", "stresstest", "mmitest", "benchmark",
  )

  /** Joined forms inside a longer word ("com.DeviceTest", "FactoryModeActivity"). */
  private val DIAGNOSTIC_PARTS = listOf("factory", "devicetest", "hwtest", "diag", "agingtest", "burnin")

  fun decide(candidates: List<Candidate>, ownPackage: String): Decision {
    val seen = HashSet<String>()
    val verdicts = candidates
      .filter { seen.add("${it.action}|${it.packageName}|${it.activityName}") }
      .map { classify(it, ownPackage) }
    val rank = mapOf(Kind.DOCUMENTS_UI to 0, Kind.FILE_MANAGER to 1, Kind.GENERIC_CONTENT to 2)
    val launches = verdicts
      .filter { it.kind != Kind.REJECTED }
      // Stable: by kind, then OPEN_DOCUMENT before GET_CONTENT (persistable grant), then the system's own order.
      .sortedWith(compareBy({ rank.getValue(it.kind) }, { it.candidate.action.ordinal }))
      .map { Choice.Launch(it.candidate.action, it.candidate.packageName, it.candidate.activityName, it.kind) }
    return Decision(verdicts, launches)
  }

  fun classify(c: Candidate, ownPackage: String): Verdict {
    fun reject(reason: String) = Verdict(c, Kind.REJECTED, reason)
    if (c.packageName == ownPackage) return reject("this app")
    if (c.packageName in STUB_PACKAGES || c.activityName.contains("stub", ignoreCase = true)) {
      return reject("framework stub (cannot pick files)")
    }
    if (c.isHomeLauncher) return reject("home launcher")
    if (c.isSettingsApp) return reject("settings app")
    diagnosticWord(c)?.let { return reject("device test/diagnostic tool (name: $it)") }
    if (c.category in MEDIA_CATEGORIES) return reject("${c.category.name.lowercase()} app")

    val types = c.declaredTypes?.map(::normalizeType)
    if (c.action == Action.OPEN_DOCUMENT && c.holdsManageDocuments && (types == null || types.any { it in GENERIC_TYPES })) {
      return Verdict(c, Kind.DOCUMENTS_UI, "system document picker (MANAGE_DOCUMENTS)")
    }
    if (types == null) return reject("filter unknown (cannot prove it offers documents)")
    if (types.isNotEmpty() && types.all(::isMediaType)) return reject("media types only (${types.joinToString()})")
    if (types.none { it in GENERIC_TYPES }) return reject("no generic document type (${types.joinToString()})")
    if (c.exportsDocumentsProvider || c.browsesFolders) {
      val how = if (c.exportsDocumentsProvider) "DocumentsProvider" else "browses folders"
      return Verdict(c, Kind.FILE_MANAGER, "file manager ($how)")
    }
    if (!c.isSystemApp) return Verdict(c, Kind.GENERIC_CONTENT, "user-installed app offering documents (fallback)")
    return reject("preinstalled app with no document capability")
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
