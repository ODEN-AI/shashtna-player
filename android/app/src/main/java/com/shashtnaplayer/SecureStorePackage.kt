package com.shashtnaplayer

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Registers [SecureStoreModule]. It is a classic (non-codegen) module, so it is
 * served through React Native's legacy-module interop layer under the New
 * Architecture (isTurboModule = false).
 */
class SecureStorePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == SecureStoreModule.NAME) SecureStoreModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      SecureStoreModule.NAME to
        ReactModuleInfo(
          SecureStoreModule.NAME,
          SecureStoreModule::class.java.name,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // isCxxModule
          false, // isTurboModule
        ),
    )
  }
}
