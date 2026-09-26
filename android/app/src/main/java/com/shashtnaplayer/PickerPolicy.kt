package com.shashtnaplayer

/**
 * Chooses how to open the document picker, from the packages that answer the
 * two picker intents. Pure logic (no Android types) so it is unit-testable.
 *
 * Why: many Android TV / Google TV devices have no DocumentsUI. ACTION_OPEN_DOCUMENT
 * then still resolves, to a "Framework Package Stubs" activity that only says the
 * action is not supported (or to nothing usable), so startActivityForResult does
 * not throw and the ACTION_GET_CONTENT fallback never ran. The picker must be
 * chosen from what really handles the intents.
 */
internal object PickerPolicy {
  /** Register for picker intents on Android TV but cannot pick a file. */
  val STUB_PACKAGES = setOf(
    "com.android.tv.frameworkpackagestubs",
    "com.google.android.tv.frameworkpackagestubs",
  )

  enum class Action { OPEN_DOCUMENT, GET_CONTENT }

  sealed class Choice {
    /** Launch [action]; pinned to [packageName] when a stub also answers (null = implicit, as before). */
    data class Launch(val action: Action, val packageName: String?) : Choice()

    /** Nothing was visible (e.g. package visibility): launch as before and rely on ActivityNotFoundException. */
    object Legacy : Choice()

    /** Only stubs answer: there is no file picker on this device. */
    object NoPicker : Choice()
  }

  fun choose(openDocument: List<String>, getContent: List<String>, ownPackage: String): Choice {
    val od = openDocument.filter { it != ownPackage }.distinct()
    val gc = getContent.filter { it != ownPackage }.distinct()
    pick(Action.OPEN_DOCUMENT, od)?.let { return it }
    pick(Action.GET_CONTENT, gc)?.let { return it }
    return if (od.isEmpty() && gc.isEmpty()) Choice.Legacy else Choice.NoPicker
  }

  private fun pick(action: Action, handlers: List<String>): Choice.Launch? {
    val real = handlers.filter { it !in STUB_PACKAGES }
    if (real.isEmpty()) return null
    // Phones and tablets: no stub, so the intent stays implicit exactly as before.
    return Choice.Launch(action, if (real.size == handlers.size) null else real.first())
  }
}
