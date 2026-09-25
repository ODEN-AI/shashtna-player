package com.shashtnaplayer

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.common.assets.ReactFontManager

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // App-local module: Android Keystore-backed storage for credentials.
          add(SecureStorePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // App typeface with all its weights (res/font/ibm_plex_sans_arabic.xml). The name
    // must match APP_FONT_FAMILY in src/design/theme.ts.
    ReactFontManager.getInstance().addCustomFont(this, "IBM Plex Sans Arabic", R.font.ibm_plex_sans_arabic)
    loadReactNative(this)
  }
}
