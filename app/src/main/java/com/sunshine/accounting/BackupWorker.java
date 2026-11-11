package com.sunshine.accounting;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.AtomicFile;

import androidx.annotation.NonNull;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/** Runs after the app is closed; never starts an invisible WebView. */
public final class BackupWorker extends Worker {
    private static final String DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
    private static final String BACKUP_FOLDER = "AlMohaseb_AlTaqni_Backups";
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

    public BackupWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        String kind = getInputData().getString("kind");
        if (!"local".equals(kind) && !"drive".equals(kind)) return Result.failure();
        Context context = getApplicationContext();
        SharedPreferences preferences = AutoBackupManager.prefs(context);
        if (!preferences.getBoolean(kind + "Enabled", false)) return Result.success();
        try {
            AutoBackupManager.awaitPendingSnapshots();
            // AtomicFile avoids reading a partially written snapshot.
            AtomicFile atomic = new AtomicFile(AutoBackupManager.snapshotFile(context));
            byte[] bytes;
            try (InputStream in = atomic.openRead()) { bytes = readLimited(in, 25_000_000); }
            JSONObject payload = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            JSONObject data = payload.getJSONObject("data");
            if (!(data.opt("invoices") instanceof JSONArray) ||
                !(data.opt("items") instanceof JSONArray) ||
                !(data.opt("accounts") instanceof JSONArray))
                throw new IOException("النسخة الحالية غير مكتملة");
            String name = nameNow();
            if ("local".equals(kind)) writeLocal(context, preferences, bytes, name);
            else writeDrive(context, bytes, name);
            AutoBackupManager.saveResult(context, kind, "");
            return Result.success();
        } catch (Exception e) {
            String msg = "drive".equals(kind)
                ? "فشل نسخ Google Drive؛ تحقق من الاتصال وإذن الحساب"
                : "فشل النسخ المحلي؛ تحقق من المجلد والمساحة المتوفرة";
            if (e.getMessage() != null && e.getMessage().contains("إعادة ربط")) msg = e.getMessage();
            if (e.getMessage() != null && e.getMessage().contains("الحالية غير مكتملة")) msg = e.getMessage();
            if (e instanceof java.io.FileNotFoundException) msg = "افتح التطبيق مرة واحدة لتجهيز أول نسخة من البيانات";
            AutoBackupManager.saveResult(context, kind, msg);
            // A periodic request runs again next interval; a one-time request may retry.
            return Result.failure();
        }
    }

    private static byte[] readLimited(InputStream stream, int max) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int n;
        while ((n = stream.read(buffer)) != -1) {
            if (output.size() + n > max) throw new IOException("Snapshot exceeds 25 MB");
            output.write(buffer, 0, n);
        }
        return output.toByteArray();
    }

    private static String nameNow() {
        SimpleDateFormat f = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return "AlMohaseb_AlTaqni_" + f.format(new Date()) + ".json";
    }

    private static void writeLocal(Context context, SharedPreferences prefs, byte[] bytes, String name)
            throws IOException {
        String saved = prefs.getString("localFolder", "");
        if (saved.isEmpty()) throw new IOException("Local backup folder not selected");
        Uri uri = Uri.parse(saved);
        DocumentFile dir = DocumentFile.fromTreeUri(context, uri);
        if (dir == null || !dir.isDirectory() || !dir.canWrite())
            throw new IOException("Backup folder permission was lost");
        DocumentFile doc = dir.createFile("application/json", name);
        if (doc == null) throw new IOException("Could not create a backup file");
        boolean completed = false;
        try {
            try (OutputStream out = context.getContentResolver().openOutputStream(doc.getUri(), "wt")) {
                if (out == null) throw new IOException("Cannot write backup destination");
                out.write(bytes);
                out.flush();
            }
            completed = true;
        } finally {
            if (!completed) doc.delete();
        }
    }

    private static void writeDrive(Context ctx, byte[] jsonBytes, String name) throws Exception {
        if (!AutoBackupManager.prefs(ctx).getBoolean("driveConnected", false))
            throw new IOException("يرجى إعادة ربط Google Drive من الضبط");
        AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
                .build();
        AuthorizationResult authorization = Tasks.await(
                Identity.getAuthorizationClient(ctx).authorize(request), 35, TimeUnit.SECONDS);
        if (authorization.hasResolution() || authorization.getAccessToken() == null)
            throw new IOException("يرجى إعادة ربط Google Drive من الضبط");
        String token = authorization.getAccessToken(); // never persist OAuth access tokens.
        String folderId = findOrCreateFolder(token);
        uploadFile(token, folderId, name, jsonBytes);
    }

    private static String findOrCreateFolder(String token) throws Exception {
        String condition = "name = '" + BACKUP_FOLDER + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        String url = DRIVE_FILES + "?q=" + URLEncoder.encode(condition, "UTF-8")
                + "&fields=" + URLEncoder.encode("files(id,name),nextPageToken", "UTF-8")
                + "&pageSize=30";
        JSONObject folders = exchange("GET", url, token, null, null);
        JSONArray files = folders.optJSONArray("files");
        if (files != null && files.length() > 0) {
            String id = files.getJSONObject(0).optString("id");
            if (!id.isEmpty()) return id;
        }
        JSONObject metadata = new JSONObject();
        metadata.put("name", BACKUP_FOLDER);
        metadata.put("mimeType", "application/vnd.google-apps.folder");
        JSONObject created = exchange("POST", DRIVE_FILES + "?fields=id", token,
                "application/json; charset=utf-8", metadata.toString().getBytes(StandardCharsets.UTF_8));
        String id = created.optString("id");
        if (id.isEmpty()) throw new IOException("Google Drive folder not created");
        return id;
    }

    private static void uploadFile(String token, String folderId, String name, byte[] bytes) throws Exception {
        JSONObject metadata = new JSONObject();
        metadata.put("name", name);
        metadata.put("mimeType", "application/json");
        metadata.put("parents", new JSONArray().put(folderId));
        String boundary = "AlMohasebBackupBoundary" + System.currentTimeMillis();
        byte[] prefix = ("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            + metadata + "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8);
        byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        URL url = new URL("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(25000);
            connection.setReadTimeout(90000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "multipart/related; boundary=" + boundary);
            connection.setFixedLengthStreamingMode(prefix.length + bytes.length + suffix.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(prefix);
                out.write(bytes);
                out.write(suffix);
            }
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) throw new IOException("Drive upload HTTP " + code);
            try (InputStream in = connection.getInputStream()) {
                if (new JSONObject(new String(readLimited(in, 1024 * 1024), StandardCharsets.UTF_8))
                        .optString("id").isEmpty()) throw new IOException("Drive did not confirm upload");
            }
        } finally { connection.disconnect(); }
    }

    private static JSONObject exchange(String method, String url, String token,
                                       String contentType, byte[] body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(25000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", contentType);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = conn.getOutputStream()) { out.write(body); }
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) throw new IOException("Drive request HTTP " + code);
            try (InputStream input = conn.getInputStream()) {
                return new JSONObject(new String(readLimited(input, 1024 * 1024), StandardCharsets.UTF_8));
            }
        } finally { conn.disconnect(); }
    }
}
