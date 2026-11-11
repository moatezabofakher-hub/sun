package com.sunshine.accounting;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.AtomicFile;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Data;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Future;

/** Backups are sourced from a post-IndexedDB-commit snapshot, never from a running WebView. */
public final class AutoBackupManager {
    private static final String PREF = "accounting_auto_backups_v1";
    private static final String SNAPSHOT = "accounting_snapshot_v1.json";
    private static final int MAX_JSON_BYTES = 25_000_000;
    private static final ExecutorService SNAPSHOT_QUEUE = Executors.newSingleThreadExecutor();

    private AutoBackupManager() { }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    public static boolean validHours(int hours) { return hours == 6 || hours == 12 || hours == 24; }

    static File snapshotFile(Context ctx) { return new File(ctx.getFilesDir(), SNAPSHOT); }

    /** Serializes writes to avoid older JSON snapshots overwriting newer commits. */
    /** A worker waits for queued IndexedDB commits so it cannot copy an older snapshot. */
    public static void awaitPendingSnapshots() throws Exception {
        Future<?> barrier = SNAPSHOT_QUEUE.submit(() -> { });
        barrier.get(30, TimeUnit.SECONDS);
    }

    public static void stageSnapshot(Context ctx, String json) {
        if (json == null || json.length() > MAX_JSON_BYTES) {
            prefs(ctx).edit().putString("snapshotError", "حجم البيانات يتجاوز الحد المسموح للنسخ التلقائي").apply();
            return;
        }
        final byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_JSON_BYTES) {
            prefs(ctx).edit().putString("snapshotError", "حجم البيانات يتجاوز 25MB").apply();
            return;
        }
        final Context app = ctx.getApplicationContext();
        SNAPSHOT_QUEUE.execute(() -> {
            AtomicFile atomic = new AtomicFile(snapshotFile(app));
            FileOutputStream out = null;
            try {
                // Validate before replacing the most recent restorable snapshot.
                JSONObject object = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                JSONObject data = object.getJSONObject("data");
                if (!(data.opt("invoices") instanceof org.json.JSONArray) ||
                    !(data.opt("items") instanceof org.json.JSONArray) ||
                    !(data.opt("accounts") instanceof org.json.JSONArray))
                    throw new IOException("Incomplete accounting data");
                out = atomic.startWrite();
                out.write(bytes);
                atomic.finishWrite(out);
                prefs(app).edit().putLong("snapshotAt", System.currentTimeMillis())
                    .putLong("snapshotBytes", bytes.length).remove("snapshotError").apply();
            } catch (Exception e) {
                if (out != null) atomic.failWrite(out);
                prefs(app).edit().putString("snapshotError", "تعذر حفظ آخر حالة للبيانات").apply();
            }
        });
    }

    public static JSONObject status(Context ctx) {
        SharedPreferences p = prefs(ctx);
        JSONObject s = new JSONObject();
        try {
            s.put("supported", true);
            s.put("localEnabled", p.getBoolean("localEnabled", false));
            s.put("localHours", p.getInt("localHours", 24));
            s.put("localFolderConfigured", !p.getString("localFolder", "").isEmpty());
            s.put("driveEnabled", p.getBoolean("driveEnabled", false));
            s.put("driveHours", p.getInt("driveHours", 24));
            s.put("driveConnected", p.getBoolean("driveConnected", false));
            s.put("localLast", p.getLong("localLast", 0));
            s.put("driveLast", p.getLong("driveLast", 0));
            s.put("localError", p.getString("localError", ""));
            s.put("driveError", p.getString("driveError", ""));
            s.put("snapshotError", p.getString("snapshotError", ""));
            s.put("snapshotAt", p.getLong("snapshotAt", 0));
        } catch (Exception ignored) { }
        return s;
    }

    static void saveResult(Context ctx, String kind, String error) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (error == null || error.isEmpty()) {
            e.putLong(kind + "Last", System.currentTimeMillis()).remove(kind + "Error");
        } else {
            e.putString(kind + "Error", error);
        }
        e.apply();
    }

    public static void folderSelected(Context ctx, Uri uri) {
        prefs(ctx).edit().putString("localFolder", uri.toString()).remove("localError").apply();
        if (prefs(ctx).getBoolean("localEnabled", false)) schedule(ctx, "local");
    }

    public static void driveConnected(Context ctx) {
        prefs(ctx).edit().putBoolean("driveConnected", true).remove("driveError").apply();
        if (prefs(ctx).getBoolean("driveEnabled", false)) schedule(ctx, "drive");
    }

    public static void driveConnectionFailed(Context ctx, String reason) {
        prefs(ctx).edit().putBoolean("driveConnected", false)
                .putString("driveError", reason).apply();
        // Do not pretend Drive backups are enabled when the account isn't ready.
        WorkManager.getInstance(ctx).cancelUniqueWork("periodic_drive_backup");
        prefs(ctx).edit().putBoolean("driveEnabled", false).apply();
    }

    /** Returns an actionable error or an empty string when the preference was saved. */
    public static String configure(Context ctx, String kind, boolean enabled, int hours) {
        if (!"local".equals(kind) && !"drive".equals(kind)) return "نوع نسخ غير معروف";
        if (!validHours(hours)) return "اختر 6 أو 12 أو 24 ساعة";
        SharedPreferences p = prefs(ctx);
        if (enabled && "local".equals(kind) && p.getString("localFolder", "").isEmpty())
            return "اختر مجلد النسخ المحلي أولاً";
        if (enabled && "drive".equals(kind) && !p.getBoolean("driveConnected", false))
            return "اربط حساب Google Drive أولاً";
        p.edit().putInt(kind + "Hours", hours).putBoolean(kind + "Enabled", enabled).apply();
        if (enabled) schedule(ctx, kind);
        else WorkManager.getInstance(ctx).cancelUniqueWork("periodic_" + kind + "_backup");
        return "";
    }

    private static void schedule(Context ctx, String kind) {
        SharedPreferences p = prefs(ctx);
        int hours = p.getInt(kind + "Hours", 24);
        if (!p.getBoolean(kind + "Enabled", false) || !validHours(hours)) return;
        Constraints.Builder constraints = new Constraints.Builder();
        if ("drive".equals(kind)) constraints.setRequiredNetworkType(NetworkType.CONNECTED);
        Data data = new Data.Builder().putString("kind", kind).build();
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(BackupWorker.class,
                hours, TimeUnit.HOURS)
                .setConstraints(constraints.build())
                .setInputData(data)
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                "periodic_" + kind + "_backup", ExistingPeriodicWorkPolicy.UPDATE, work);
    }

    public static void runNow(Context ctx, String kind) {
        if (!"local".equals(kind) && !"drive".equals(kind)) return;
        if (!prefs(ctx).getBoolean(kind + "Enabled", false)) return;
        Constraints.Builder constraints = new Constraints.Builder();
        if ("drive".equals(kind)) constraints.setRequiredNetworkType(NetworkType.CONNECTED);
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(BackupWorker.class)
                .setConstraints(constraints.build())
                .setInputData(new Data.Builder().putString("kind", kind).build())
                .build();
        WorkManager.getInstance(ctx).enqueue(work);
    }
}
