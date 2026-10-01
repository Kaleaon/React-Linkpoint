package app.linkpoint.viewer.data

import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Credentials (the MFA hash) encrypted with an AES-GCM key held in the Android Keystore.
 * There is no plaintext fallback: if the keystore fails the secret is not kept and the user
 * is asked for a code again.
 */
class SecretStore(private val sp: SharedPreferences, private val alias: String = "linkpoint_secrets") {
    fun get(key: String): String {
        val stored = sp.getString(key, null) ?: return ""
        return try {
            val blob = Base64.decode(stored, Base64.NO_WRAP)
            val c = Cipher.getInstance(TRANSFORMATION)
            c.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, blob, 0, IV))
            String(c.doFinal(blob, IV, blob.size - IV), Charsets.UTF_8)
        } catch (_: Exception) { remove(key); "" }
    }

    fun put(key: String, value: String) {
        if (value.isEmpty()) return
        try {
            val c = Cipher.getInstance(TRANSFORMATION)
            c.init(Cipher.ENCRYPT_MODE, secretKey())
            val blob = c.iv + c.doFinal(value.toByteArray(Charsets.UTF_8))
            sp.edit().putString(key, Base64.encodeToString(blob, Base64.NO_WRAP)).apply()
        } catch (_: Exception) { remove(key) }
    }

    fun remove(key: String) = sp.edit().remove(key).apply()

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(alias, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return gen.generateKey()
    }

    private companion object { const val TRANSFORMATION = "AES/GCM/NoPadding"; const val IV = 12 }
}
