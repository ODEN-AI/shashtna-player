package com.shashtnaplayer

import android.app.Activity
import android.app.UiModeManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.Log
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FilterInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Lets the user pick an M3U / M3U8 playlist with the system document picker
 * and reads it.
 *
 * pickPlaylist returns the picked content:// URI, display name and size, and
 * takes a persistable read grant when the provider offers one, so the same
 * file can be re-read when the app starts again.
 *
 * openPlaylist / readPlaylistChunk / closePlaylist read that URI as UTF-8 text
 * in chunks, straight from the ContentResolver. JS pulls one chunk at a time,
 * so large playlists never have to fit in memory and Arabic characters are
 * never split between chunks.
 *
 * The file is deliberately NOT read through react-native-blob-util: its
 * readStream first "resolves" content:// URIs to file paths
 * (PathResolver.getRealPathFromURI), which maps
 * com.android.externalstorage.documents "primary:Download/x.m3u" to the
 * app's own external files dir (a file that does not exist), and maps
 * Downloads "raw:" and MediaStore documents to /storage/... paths that
 * scoped storage does not let the app open. Picked playlists then failed
 * to load.
 *
 * Picking (Android TV safe):
 * - every activity answering OPEN_DOCUMENT / GET_CONTENT is classified by what
 *   it can do (PickerPolicy: system DocumentsUI, file manager, controlled
 *   fallback, or rejected: stubs, factory/diagnostic tools, media apps,
 *   launchers, settings), and only an accepted one is launched, pinned to its
 *   exact activity. A TV box resolved the old implicit GET_CONTENT to a vendor
 *   factory test app; with no safe picker the call now fails with E_NO_PICKER;
 * - it is launched on the UI thread, and every piece of picker state is only
 *   touched there;
 * - a picker that returns without a result (or never returns one) no longer
 *   leaves the request pending forever: it is settled as "cancelled" when the
 *   app resumes, and a later tap starts a new picker instead of E_BUSY;
 * - reading the picked file's name/size and taking the persistable grant are
 *   ContentResolver calls into the provider, so they run on the IO thread.
 *
 * Uses platform APIs only; no extra Gradle dependency.
 */
class PlaylistPickerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  // Picker state: read and written on the UI thread only.
  private var pending: Promise? = null
  private var launchId = 0
  private var launchedAt = 0L
  private var pausedSinceLaunch = false
  private val main by lazy { Handler(Looper.getMainLooper()) }

  /** Open readers by handle; reads run on one background thread, in order. */
  private val readers = ConcurrentHashMap<String, PlaylistReader>()
  private val io: ExecutorService = Executors.newSingleThreadExecutor()

  private val listener: ActivityEventListener =
    object : ActivityEventListener {
      override fun onNewIntent(intent: Intent) = Unit

      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE) return
        // Result code, whether a document came back and its scheme (content/file); never the URI or file name.
        diag("result resultCode=$resultCode ok=${resultCode == Activity.RESULT_OK} document=${data?.data != null} scheme=${data?.data?.scheme ?: "none"} pending=${pending != null}")
        val promise = take() ?: return
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
          promise.resolve(null) // cancelled
          return
        }
        val flags = data?.flags ?: 0
        // Provider IPC (grant + name/size query) can be slow on TV storage providers: off the UI thread.
        io.execute {
          try {
            promise.resolve(describe(uri, flags))
          } catch (error: Exception) {
            promise.reject("E_PICK_FAILED", error.message, error)
          }
        }
      }
    }

  private val lifecycle: LifecycleEventListener =
    object : LifecycleEventListener {
      override fun onHostPause() {
        if (pending != null) pausedSinceLaunch = true
      }

      override fun onHostResume() {
        if (pending == null || !pausedSinceLaunch) return
        // onActivityResult is delivered before onResume. If the picker came back
        // without one (TV stubs, some vendor file managers), settle it as cancelled.
        val id = launchId
        main.postDelayed({
          if (pending != null && launchId == id) {
            diag("result none: picker returned without a result, settled as cancelled")
            take()?.resolve(null)
          }
        }, RESULT_GRACE_MS)
      }

      override fun onHostDestroy() {
        take()?.resolve(null)
      }
    }

  init {
    context.addActivityEventListener(listener)
    context.addLifecycleEventListener(lifecycle)
  }

  /** Clears and returns the pending picker request (UI thread). */
  private fun take(): Promise? {
    val promise = pending ?: return null
    pending = null
    pausedSinceLaunch = false
    return promise
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun pickPlaylist(promise: Promise) {
    // Package manager queries (candidates) off the UI thread; picker state on it.
    io.execute {
      diag("request actions=OPEN_DOCUMENT,GET_CONTENT discovery=openable+plain types=$QUERY_TYPES launchMime=$PICK_MIME")
      val decision =
        try {
          val found = candidates()
          logInventory(found)
          val television = isTelevision()
          diag("device television=$television sdk=${Build.VERSION.SDK_INT}")
          PickerPolicy.decide(found, context.packageName, television)
        } catch (error: Exception) {
          diag("candidates failed error=${error.javaClass.simpleName}")
          PickerPolicy.Decision(emptyList(), emptyList())
        }
      UiThreadUtil.runOnUiThread { launchPicker(promise, decision) }
    }
  }

  private fun launchPicker(promise: Promise, decision: PickerPolicy.Decision) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "The app is not in the foreground.")
      return
    }
    if (pending != null) {
      // A second tap right after the first: the picker is still opening.
      if (SystemClock.elapsedRealtime() - launchedAt < BUSY_WINDOW_MS) {
        promise.reject("E_BUSY", "A file picker is already open.")
        return
      }
      // An earlier picker never answered: give up on it and open a new one.
      take()?.resolve(null)
    }
    // The launched intent offers every type: providers label .m3u files as
    // audio/x-mpegurl, text/plain or application/octet-stream, and the content
    // is validated when parsed (#EXTM3U / #EXTINF). WHO may receive it is
    // decided by capability (PickerPolicy), not by this wildcard.
    for (verdict in decision.verdicts) {
      val c = verdict.candidate
      val answers = decision.verdicts.filter { it.candidate.packageName == c.packageName }.map { it.candidate.action }.toSet()
      diag(
        "candidate package=${c.packageName} activity=${c.activityName} action=${c.action}" +
          " system=${yn(c.isSystemApp)} updatedSystem=${yn(c.isUpdatedSystemApp)} userInstalled=${yn(!PickerPolicy.isSystemOrigin(c))}" +
          " launchable=${yn(c.isLaunchable)} openDocument=${yn(PickerPolicy.Action.OPEN_DOCUMENT in answers)}" +
          " getContent=${yn(PickerPolicy.Action.GET_CONTENT in answers)} openable=${yn(c.openable)}" +
          " documentsProvider=${yn(c.exportsDocumentsProvider)} manageDocuments=${yn(c.holdsManageDocuments)} folders=${yn(c.browsesFolders)}" +
          " storage=${yn(c.requestsStorageAccess)} mounts=${yn(c.watchesStorageMounts)} control=${c.deviceControlPermissions.size}" +
          " home=${c.isHomeLauncher}/${c.packageHasHome} settings=${c.isSettingsApp}/${c.packageHasSettings} category=${c.category}" +
          " types=${c.declaredTypes} contentUri=unknown-until-result" +
          " score=${verdict.score} ${if (verdict.kind in ACCEPTED) "ACCEPTED" else "REJECTED"} kind=${verdict.kind} reason=${verdict.reason}",
      )
    }
    val oem = decision.launches.firstOrNull { it.kind == PickerPolicy.Kind.OEM_FILE_EXPLORER }
    diag("summary oemFileExplorer=${oem?.let { "${it.packageName}/${it.activityName}" } ?: "none"} accepted=${decision.launches.size}" +
      " userInstalledSkipped=${decision.verdicts.count { it.kind == PickerPolicy.Kind.USER_INSTALLED }}")
    pending = promise
    launchId += 1
    launchedAt = SystemClock.elapsedRealtime()
    pausedSinceLaunch = false
    for (launch in decision.launches) {
      val intent = pickerIntent(launch.action, launch.openable).setClassName(launch.packageName, launch.activityName)
      try {
        activity.startActivityForResult(intent, REQUEST_CODE)
        diag("selected action=${launch.action} mime=$PICK_MIME openable=${launch.openable} activity=${launch.packageName}/${launch.activityName} kind=${launch.kind} score=${launch.score}")
        return
      } catch (_: ActivityNotFoundException) {
        diag("not started activity=${launch.packageName}/${launch.activityName} (not found), trying next")
      } catch (_: SecurityException) {
        diag("not started activity=${launch.packageName}/${launch.activityName} (not exported), trying next")
      } catch (error: Exception) {
        diag("failed activity=${launch.packageName}/${launch.activityName} error=${error.javaClass.simpleName}")
        take()?.reject("E_PICKER_FAILED", error.message ?: "The file picker could not be opened.", error)
        return
      }
    }
    diag("selected none: E_NO_PICKER (candidates=${decision.verdicts.size}, accepted=${decision.launches.size})")
    take()?.reject("E_NO_PICKER", "No file picker is available on this device.")
  }

  /**
   * The picker intent. The launched MIME stays the wildcard: Android labels .m3u
   * as audio/x-mpegurl, .m3u8 as application/vnd.apple.mpegurl (or octet-stream),
   * so a text/plain launch type would HIDE the playlist in the picker. Text
   * preference and media rejection happen when candidates are ranked (PickerPolicy).
   */
  private fun pickerIntent(action: PickerPolicy.Action, openable: Boolean = true, mime: String = PICK_MIME): Intent =
    when (action) {
      PickerPolicy.Action.OPEN_DOCUMENT ->
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          if (openable) addCategory(Intent.CATEGORY_OPENABLE)
          type = mime
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
      PickerPolicy.Action.GET_CONTENT ->
        Intent(Intent.ACTION_GET_CONTENT).apply {
          if (openable) addCategory(Intent.CATEGORY_OPENABLE)
          type = mime
        }
    }

  /** One discovered activity, merged over every discovery query it answered. */
  private class Found(val action: PickerPolicy.Action, val info: ResolveInfo) {
    val types = LinkedHashSet<String>()
    var typesKnown = false
    var openable = false
    val matched = LinkedHashSet<String>()
  }

  /**
   * Every activity answering OPEN_DOCUMENT / GET_CONTENT, found with a small,
   * fixed set of queries: with and without CATEGORY_OPENABLE (an OEM file
   * manager may not declare it) and for the wildcard plus playlist/text MIME
   * types; without MATCH_DEFAULT_ONLY, since the chosen activity is launched
   * explicitly. Needs the <queries> in AndroidManifest.xml. Package manager
   * reads only; nothing is launched here.
   */
  private fun candidates(): List<PickerPolicy.Candidate> {
    val pm = context.packageManager
    val found = LinkedHashMap<String, Found>()
    for (action in PickerPolicy.Action.values()) {
      for (openable in listOf(true, false)) {
        for (mime in QUERY_TYPES) {
          val infos: List<ResolveInfo> =
            try {
              pm.queryIntentActivities(pickerIntent(action, openable, mime), PackageManager.GET_RESOLVED_FILTER)
            } catch (_: Exception) {
              emptyList()
            }
          for (info in infos) {
            val activityInfo = info.activityInfo ?: continue
            val entry = found.getOrPut("$action|${activityInfo.packageName}|${activityInfo.name}") { Found(action, info) }
            entry.matched.add(if (openable) "$mime+openable" else mime)
            val filter = info.filter ?: continue
            entry.typesKnown = true
            for (i in 0 until filter.countDataTypes()) entry.types.add(filter.getDataType(i))
            if (filter.hasCategory(Intent.CATEGORY_OPENABLE)) entry.openable = true
          }
        }
      }
    }
    val facts = HashMap<String, PackageFacts>()
    return found.values.map { f ->
      val activityInfo = f.info.activityInfo
      val pkg = activityInfo.packageName
      val p = facts.getOrPut(pkg) { packageFacts(pm, pkg, activityInfo.applicationInfo) }
      diag("discovered action=${f.action} activity=$pkg/${activityInfo.name} matched=${f.matched} declared=${if (f.typesKnown) f.types else "unknown"} openable=${f.openable}")
      PickerPolicy.Candidate(
        action = f.action,
        packageName = pkg,
        activityName = activityInfo.name,
        declaredTypes = if (f.typesKnown) f.types.toList() else null,
        openable = f.openable,
        isSystemApp = p.system,
        isUpdatedSystemApp = p.updated,
        isLaunchable = p.launchable,
        holdsManageDocuments = p.manageDocuments,
        exportsDocumentsProvider = p.documentsProvider,
        browsesFolders = p.folders,
        requestsStorageAccess = p.storage,
        watchesStorageMounts = p.mounts,
        deviceControlPermissions = p.control,
        isHomeLauncher = activityInfo.name in p.homeActivities,
        isSettingsApp = activityInfo.name in p.settingsActivities,
        packageHasHome = p.homeActivities.isNotEmpty(),
        packageHasSettings = p.settingsActivities.isNotEmpty(),
        category = p.category,
      )
    }
  }

  private class PackageFacts(
    val system: Boolean,
    val updated: Boolean,
    val launchable: Boolean,
    val manageDocuments: Boolean,
    val documentsProvider: Boolean,
    val folders: Boolean,
    val storage: Boolean,
    val mounts: Boolean,
    val control: List<String>,
    val homeActivities: Set<String>,
    val settingsActivities: Set<String>,
    val category: PickerPolicy.AppCategory,
  )

  private fun packageFacts(pm: PackageManager, pkg: String, app: ApplicationInfo?): PackageFacts {
    fun activities(intent: Intent): Set<String> =
      try {
        pm.queryIntentActivities(intent.setPackage(pkg), 0).mapNotNull { it.activityInfo?.name }.toSet()
      } catch (_: Exception) {
        emptySet()
      }
    fun receives(intent: Intent) =
      try {
        pm.queryBroadcastReceivers(intent.setPackage(pkg), 0).isNotEmpty()
      } catch (_: Exception) {
        false
      }
    val flags = app?.flags ?: 0
    val system = (flags and ApplicationInfo.FLAG_SYSTEM) != 0
    val updated = (flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
    val launchable =
      activities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)).isNotEmpty() ||
        activities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)).isNotEmpty()
    val manageDocuments =
      try {
        pm.checkPermission(MANAGE_DOCUMENTS, pkg) == PackageManager.PERMISSION_GRANTED
      } catch (_: Exception) {
        false
      }
    @Suppress("DEPRECATION")
    val info =
      try {
        pm.getPackageInfo(pkg, PackageManager.GET_PROVIDERS or PackageManager.GET_PERMISSIONS)
      } catch (_: Exception) {
        null
      }
    val documentsProvider = info?.providers?.any { it.exported && it.readPermission == MANAGE_DOCUMENTS } == true
    val requested = info?.requestedPermissions?.toSet() ?: emptySet()
    val storage = requested.any { it in STORAGE_PERMISSIONS }
    val control = requested.filter { it in PickerPolicy.DEVICE_CONTROL_PERMISSIONS }.sorted()
    val folders =
      FOLDER_TYPES.any { type ->
        activities(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("file:///storage/emulated/0"), type)).isNotEmpty() ||
          activities(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("content://$pkg/folder"), type)).isNotEmpty()
      }
    val mounts =
      receives(Intent(Intent.ACTION_MEDIA_MOUNTED, Uri.parse("file:///storage"))) ||
        receives(Intent(Intent.ACTION_MEDIA_UNMOUNTED, Uri.parse("file:///storage")))
    val home = activities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
    val settings = activities(Intent(Settings.ACTION_SETTINGS))
    val category =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && app != null) {
        when (app.category) {
          ApplicationInfo.CATEGORY_AUDIO -> PickerPolicy.AppCategory.AUDIO
          ApplicationInfo.CATEGORY_VIDEO -> PickerPolicy.AppCategory.VIDEO
          ApplicationInfo.CATEGORY_IMAGE -> PickerPolicy.AppCategory.IMAGE
          ApplicationInfo.CATEGORY_GAME -> PickerPolicy.AppCategory.GAME
          ApplicationInfo.CATEGORY_SOCIAL -> PickerPolicy.AppCategory.SOCIAL
          ApplicationInfo.CATEGORY_NEWS -> PickerPolicy.AppCategory.NEWS
          ApplicationInfo.CATEGORY_MAPS -> PickerPolicy.AppCategory.MAPS
          ApplicationInfo.CATEGORY_PRODUCTIVITY -> PickerPolicy.AppCategory.PRODUCTIVITY
          ApplicationInfo.CATEGORY_UNDEFINED -> PickerPolicy.AppCategory.UNDEFINED
          else -> PickerPolicy.AppCategory.OTHER
        }
      } else {
        PickerPolicy.AppCategory.UNDEFINED
      }
    return PackageFacts(system, updated, launchable, manageDocuments, documentsProvider, folders, storage, mounts, control, home, settings, category)
  }

  /**
   * Diagnostics only: what else on the device could be "the file manager".
   * Lists document providers and launchable apps with file signals, and says
   * whether each answers a picker intent. If the TV's file manager shows up here
   * with pickerIntents=false, it cannot return a file to another app at all.
   */
  private fun logInventory(candidates: List<PickerPolicy.Candidate>) {
    if (!BuildConfig.TV_DIAGNOSTICS) return
    val pm = context.packageManager
    try {
      pm.queryIntentContentProviders(Intent(DOCUMENTS_PROVIDER_ACTION), 0).forEach {
        val provider = it.providerInfo ?: return@forEach
        diag("inventory documentsProvider package=${provider.packageName} authority=${provider.authority}")
      }
    } catch (_: Exception) {
      diag("inventory documentsProvider query failed")
    }
    val pickers = candidates.map { it.packageName }.toSet()
    val launchable = LinkedHashMap<String, ResolveInfo>()
    for (category in listOf(Intent.CATEGORY_LAUNCHER, Intent.CATEGORY_LEANBACK_LAUNCHER)) {
      try {
        pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(category), 0).forEach {
          val a = it.activityInfo ?: return@forEach
          launchable.putIfAbsent("${a.packageName}/${a.name}", it)
        }
      } catch (_: Exception) {
        // Visibility or vendor error: the inventory is best effort.
      }
    }
    val facts = HashMap<String, PackageFacts>()
    for ((component, info) in launchable) {
      val pkg = info.activityInfo.packageName
      val f = facts.getOrPut(pkg) { packageFacts(pm, pkg, info.activityInfo.applicationInfo) }
      if (!(f.documentsProvider || f.folders || f.storage || f.mounts)) continue
      val label = try { info.loadLabel(pm).toString() } catch (_: Exception) { "?" }
      fun answers(intent: Intent) =
        try {
          pm.queryIntentActivities(intent.setPackage(pkg), 0).isNotEmpty()
        } catch (_: Exception) {
          false
        }
      val openDocument = answers(Intent(Intent.ACTION_OPEN_DOCUMENT).setType(PICK_MIME))
      val getContent = answers(Intent(Intent.ACTION_GET_CONTENT).setType(PICK_MIME))
      // ACTION_PICK is not launched (it can return a file:// path this app has no permission to read);
      // it is reported so a TV whose explorer only offers PICK can be recognised from the log.
      val pick = answers(Intent(Intent.ACTION_PICK).setType(PICK_MIME)) || answers(Intent(Intent.ACTION_PICK, Uri.parse("file:///storage")))
      diag("inventory app=$component label=\"$label\" system=${yn(f.system)} updatedSystem=${yn(f.updated)} userInstalled=${yn(!f.system && !f.updated)}" +
        " documentsProvider=${yn(f.documentsProvider)} folders=${yn(f.folders)} storage=${yn(f.storage)} mounts=${yn(f.mounts)} control=${f.control.size}" +
        " openDocument=${yn(openDocument)} getContent=${yn(getContent)} pick=${yn(pick)} pickerCandidate=${yn(pkg in pickers)}")
    }
  }

  private fun yn(value: Boolean) = if (value) "yes" else "no"

  /** Android TV / TV box: the OEM file explorer is preferred there (PickerPolicy). */
  private fun isTelevision(): Boolean {
    val uiMode = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    if (uiMode?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) return true
    val pm = context.packageManager
    return pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) || pm.hasSystemFeature("android.software.leanback_only")
  }

  /** AMER_TV_PICKER lines (adb logcat -s AMER_TV_PICKER): package/activity names and decisions only. */
  private fun diag(message: String) {
    if (BuildConfig.TV_DIAGNOSTICS) Log.i(DIAG_TAG, message)
  }

  /** Opens a picked playlist (content:// or file://) for reading; resolves a handle. */
  @ReactMethod
  fun openPlaylist(uri: String, promise: Promise) {
    io.execute {
      try {
        val parsed = Uri.parse(uri)
        val input: InputStream =
          when (parsed.scheme?.lowercase()) {
            "content" -> context.contentResolver.openInputStream(parsed) ?: throw FileNotFoundException("The provider returned no data.")
            "file" -> FileInputStream(File(parsed.path ?: ""))
            else -> throw FileNotFoundException("Unsupported playlist location.")
          }
        val counter = CountingInputStream(input)
        val handle = UUID.randomUUID().toString()
        readers[handle] = PlaylistReader(counter, BufferedReader(InputStreamReader(counter, Charsets.UTF_8), BUFFER_CHARS))
        promise.resolve(handle)
      } catch (error: FileNotFoundException) {
        promise.reject("E_NOT_FOUND", error.message ?: "The playlist file was not found.", error)
      } catch (error: SecurityException) {
        promise.reject("E_PERMISSION", error.message ?: "Permission to read the playlist was denied.", error)
      } catch (error: Exception) {
        promise.reject("E_READ_FAILED", error.message ?: "The playlist could not be read.", error)
      }
    }
  }

  /**
   * Reads up to maxChars characters. Resolves { text, bytes }: text is null at
   * the end of the file (the reader is then closed); bytes is how much of the
   * file has been read so far, for progress.
   */
  @ReactMethod
  fun readPlaylistChunk(handle: String, maxChars: Double, promise: Promise) {
    io.execute {
      val reader = readers[handle]
      if (reader == null) {
        promise.reject("E_CLOSED", "The playlist reader is closed.")
        return@execute
      }
      try {
        val size = maxChars.toInt().coerceIn(MIN_CHUNK, MAX_CHUNK)
        val buffer = CharArray(size)
        var filled = 0
        while (filled < size) {
          val read = reader.text.read(buffer, filled, size - filled)
          if (read < 0) break
          filled += read
        }
        val result = Arguments.createMap()
        if (filled == 0) {
          close(handle)
          result.putNull("text")
        } else {
          result.putString("text", String(buffer, 0, filled))
        }
        result.putDouble("bytes", reader.bytes.count.toDouble())
        promise.resolve(result)
      } catch (error: Exception) {
        close(handle)
        promise.reject("E_READ_FAILED", error.message ?: "The playlist could not be read.", error)
      }
    }
  }

  @ReactMethod
  fun closePlaylist(handle: String) {
    io.execute { close(handle) }
  }

  private fun close(handle: String) {
    val reader = readers.remove(handle) ?: return
    try {
      reader.text.close()
    } catch (_: Exception) {
      // Already closed.
    }
  }

  override fun invalidate() {
    context.removeLifecycleEventListener(lifecycle)
    UiThreadUtil.runOnUiThread { take()?.resolve(null) }
    readers.keys.toList().forEach { close(it) }
    io.shutdown()
    super.invalidate()
  }

  private fun describe(uri: Uri, flags: Int) =
    Arguments.createMap().apply {
      if ((flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
        try {
          context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) {
          // Provider does not offer persistable grants; the file is still readable now.
        }
      }
      putString("uri", uri.toString())
      var name: String? = null
      var size = -1.0
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
          if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex).toDouble()
        }
      }
      putString("name", name ?: uri.lastPathSegment ?: "playlist.m3u")
      putDouble("size", size)
    }

  private class PlaylistReader(val bytes: CountingInputStream, val text: BufferedReader)

  /** Counts the bytes taken from the file (the reader decodes ahead of what JS has consumed). */
  private class CountingInputStream(input: InputStream) : FilterInputStream(input) {
    @Volatile var count = 0L

    override fun read(): Int {
      val value = super.read()
      if (value >= 0) count += 1
      return value
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
      val read = super.read(buffer, offset, length)
      if (read > 0) count += read
      return read
    }

    override fun skip(n: Long): Long {
      val skipped = super.skip(n)
      count += skipped
      return skipped
    }
  }

  companion object {
    const val NAME = "ShashtnaPlaylistPicker"
    private const val DIAG_TAG = "AMER_TV_PICKER"
    private const val PICK_MIME = "*/*"
    private const val MANAGE_DOCUMENTS = "android.permission.MANAGE_DOCUMENTS"
    private val ACCEPTED = setOf(PickerPolicy.Kind.OEM_FILE_EXPLORER, PickerPolicy.Kind.DOCUMENTS_UI, PickerPolicy.Kind.SYSTEM_PICKER)
    private const val DOCUMENTS_PROVIDER_ACTION = "android.content.action.DOCUMENTS_PROVIDER"

    /** Discovery MIME types: the wildcard plus what .m3u / .m3u8 / text files are labelled as. */
    private val QUERY_TYPES = listOf("*/*", "text/plain", "audio/x-mpegurl", "application/vnd.apple.mpegurl", "application/octet-stream")
    private val STORAGE_PERMISSIONS = setOf(
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.MANAGE_EXTERNAL_STORAGE",
      "android.permission.MOUNT_UNMOUNT_FILESYSTEMS",
    )
    private val FOLDER_TYPES = listOf("resource/folder", "inode/directory", "vnd.android.document/directory", "x-directory/normal")
    private const val REQUEST_CODE = 0x5A7

    /** After resuming, how long a result may still take before the picker counts as cancelled. */
    private const val RESULT_GRACE_MS = 600L

    /** A second tap within this window is a double tap, not a stuck picker. */
    private const val BUSY_WINDOW_MS = 1500L
    private const val BUFFER_CHARS = 64 * 1024
    private const val MIN_CHUNK = 1024
    private const val MAX_CHUNK = 1024 * 1024
  }
}
