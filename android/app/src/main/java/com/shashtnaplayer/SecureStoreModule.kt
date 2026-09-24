package com.shashtnaplayer

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small encrypted key/value store for sensitive values (the subscription source,
 * which embeds the IPTV username and password).
 *
 * Values are encrypted with AES-256-GCM using a key generated inside the Android
 * Keystore (non-exportable), and the ciphertext is kept in private
 * SharedPreferences. Uses platform APIs only (minSdk 24), so no extra Gradle
 * dependency is needed.
 */
class SecureStoreModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  override fun getName(): String = NAME

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) {
    try {
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
      val cipherText = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
      val encoded = encode(cipher.iv) + SEPARATOR + encode(cipherText)
      // commit() so the caller only deletes the legacy plaintext file after the
      // encrypted copy is really on disk.
      if (!prefs.edit().putString(key, encoded).commit()) {
        promise.reject("E_SECURE_WRITE", "Could not persist encrypted value")
        return
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_SECURE_WRITE", error.message, error)
    }
  }

  @ReactMethod
  fun getItem(key: String, promise: Promise) {
    val stored = prefs.getString(key, null)
    if (stored == null) {
      promise.resolve(null)
      return
    }
    try {
      val parts = stored.split(SEPARATOR)
      if (parts.size != 2) throw IllegalStateException("Malformed secure value")
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_BITS, decode(parts[0])))
      val plain = cipher.doFinal(decode(parts[1]))
      promise.resolve(String(plain, StandardCharsets.UTF_8))
    } catch (error: Exception) {
      // Key invalidated (e.g. device credential reset) or tampered data: the
      // value cannot be recovered, so drop it and let the user sign in again.
      prefs.edit().remove(key).apply()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) {
    prefs.edit().remove(key).apply()
    promise.resolve(true)
  }

  private fun getOrCreateKey(): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)

  private fun decode(text: String) = Base64.decode(text, Base64.NO_WRAP)

  companion object {
    const val NAME = "ShashtnaSecureStore"
    private const val PREFS = "shashtna_secure_store"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "shashtna_secure_store_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128
    private const val SEPARATOR = ":"
  }
}
