package com.sunshine.accounting;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-bound at-rest encryption. Never use this format for off-device recovery backups:
 * Android Keystore keys disappear when app data is cleared or the device is replaced.
 * Legacy plaintext snapshots are handled ONLY in the backup reader during migration.
 */
final class DeviceVault {
    private static final String ALIAS = "tiqany_device_data_112";
    private static final byte[] HEADER = new byte[]{'T','A','E','1'};
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final String SECRET_PREFIX = "vault1:";

    private DeviceVault() {}

    private static synchronized SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        java.security.Key existing = store.getKey(ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setKeySize(256).build());
        return generator.generateKey();
    }

    static byte[] seal(Context ctx, String purpose, byte[] plaintext) throws Exception {
        if (plaintext == null || plaintext.length > 25_000_000) throw new IOException("Invalid secret length");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD((ctx.getPackageName() + ":" + purpose).getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        if (iv.length != IV_BYTES) throw new IOException("Invalid IV");
        byte[] ciphertext = cipher.doFinal(plaintext);
        byte[] output = new byte[HEADER.length + iv.length + ciphertext.length];
        System.arraycopy(HEADER, 0, output, 0, HEADER.length);
        System.arraycopy(iv, 0, output, HEADER.length, iv.length);
        System.arraycopy(ciphertext, 0, output, HEADER.length + iv.length, ciphertext.length);
        return output;
    }

    static boolean isSealed(byte[] bytes) {
        return bytes != null && bytes.length > HEADER.length + IV_BYTES + 16
                && Arrays.equals(Arrays.copyOf(bytes, HEADER.length), HEADER);
    }

    static byte[] open(Context ctx, String purpose, byte[] sealed) throws Exception {
        if (!isSealed(sealed)) throw new IOException("Unknown encrypted data format");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(),
                new GCMParameterSpec(TAG_BITS, sealed, HEADER.length, IV_BYTES));
        cipher.updateAAD((ctx.getPackageName() + ":" + purpose).getBytes(StandardCharsets.UTF_8));
        return cipher.doFinal(sealed, HEADER.length + IV_BYTES,
                sealed.length - HEADER.length - IV_BYTES);
    }

    static String protectSecret(Context ctx, String purpose, String value) throws Exception {
        return SECRET_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(
                seal(ctx, purpose, value.getBytes(StandardCharsets.UTF_8)));
    }

    static String revealSecret(Context ctx, String purpose, String stored) throws Exception {
        if (stored == null || !stored.startsWith(SECRET_PREFIX)) throw new IOException("Not a vault secret");
        byte[] data = Base64.getUrlDecoder().decode(stored.substring(SECRET_PREFIX.length()));
        return new String(open(ctx, purpose, data), StandardCharsets.UTF_8);
    }
}
