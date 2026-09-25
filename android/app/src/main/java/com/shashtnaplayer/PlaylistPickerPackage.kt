package com.shashtnaplayer

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers [PlaylistPickerModule] (classic module, served through the interop layer). */
class PlaylistPickerPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == PlaylistPickerModule.NAME) PlaylistPickerModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      PlaylistPickerModule.NAME to
        ReactModuleInfo(
          PlaylistPickerModule.NAME,
          PlaylistPickerModule::class.java.name,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // isCxxModule
          false, // isTurboModule
        ),
    )
  }
}
