package com.sunshine.accounting;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** A minimal, locally hosted accounting WebView with a genuine Android biometric bridge. */
public final class MainActivity extends FragmentActivity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int PICK_IMPORT = 2401;
    private static final int SAVE_BACKUP = 2402;
    private WebView webView;
    private BiometricPrompt biometricPrompt;
    private ValueCallback<Uri[]> pendingFileChooser;
    private String pendingBackupJson;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        // Keep header and bottom navigation out of system status/navigation bars on Android 15+.
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        final WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);     // IndexedDB is used by accounting data.
        settings.setDatabaseEnabled(true);
        settings.setDefaultTextEncodingName("UTF-8");
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) {
                    WebResourceResponse response = assetLoader.shouldInterceptRequest(uri);
                    if (response != null) return response;
                }
                // External web scripts/styles cannot be injected into the financial app.
                return new WebResourceResponse("text/plain", "UTF-8", 404,
                        "Not Found", java.util.Collections.emptyMap(),
                        new java.io.ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeExternal(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeExternal(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                try {
                    startActivityForResult(params.createIntent(), PICK_IMPORT);
                } catch (Exception e) {
                    pendingFileChooser = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "لا يمكن فتح منتقي الملفات", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new SecurityBridge(), "NativeSecurity");
        webView.addJavascriptInterface(new ExitBridge(), "Android");
        webView.addJavascriptInterface(new BackupBridge(), "AndroidFiles");

        biometricPrompt = new BiometricPrompt(this, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                super.onAuthenticationSucceeded(result);
                String id = pendingBiometricId;
                pendingBiometricId = null;
                if (id != null) replyBiometric(id, true, "");
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                super.onAuthenticationError(errorCode, errString);
                String id = pendingBiometricId;
                pendingBiometricId = null;
                if (id != null) replyBiometric(id, false, errString == null ? "تعذر التحقق" : errString.toString());
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && isLocalPage()) {
                    webView.evaluateJavascript("window.onAndroidBackPressed && window.onAndroidBackPressed()", null);
                } else {
                    finish();
                }
            }
        });

        webView.loadUrl(APP_URL);
    }

    private String pendingBiometricId;

    private boolean isLocalPage() {
        return webView != null && webView.getUrl() != null
                && webView.getUrl().startsWith("https://" + HOST + "/assets/www/");
    }

    private boolean routeExternal(Uri uri) {
        if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return true;
        if (scheme.equals("https") || scheme.equals("http") || scheme.equals("rawbt")
                || scheme.equals("tel") || scheme.equals("mailto")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Toast.makeText(this, "لا يوجد تطبيق لفتح الرابط المطلوب", Toast.LENGTH_LONG).show();
            }
        }
        return true;
    }

    private void replyBiometric(String requestId, boolean success, String reason) {
        runOnUiThread(() -> {
            if (!isLocalPage()) return;
            webView.evaluateJavascript("window.__nativeBiometricReply && window.__nativeBiometricReply("
                    + JSONObject.quote(requestId) + "," + success + "," + JSONObject.quote(reason) + ")", null);
        });
    }

    private final class SecurityBridge {
        @JavascriptInterface
        public void authenticate(String requestId) {
            if (requestId == null || !requestId.matches("[A-Za-z0-9]{6,40}")) return;
            runOnUiThread(() -> {
                if (!isLocalPage()) return;
                if (pendingBiometricId != null) {
                    replyBiometric(requestId, false, "يوجد تحقق آخر قيد التنفيذ");
                    return;
                }
                int available = BiometricManager.from(MainActivity.this)
                        .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
                if (available != BiometricManager.BIOMETRIC_SUCCESS) {
                    replyBiometric(requestId, false, "البصمة غير متاحة: تأكد من إعداد بصمة أو قفل حيوي في الهاتف");
                    return;
                }
                pendingBiometricId = requestId;
                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("تأكيد الهوية - SAN SHINE")
                        .setSubtitle("استخدم بصمة الإصبع أو وسيلة التحقق الحيوية في الهاتف")
                        .setNegativeButtonText("إلغاء - استخدم كلمة السر")
                        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                        .build();
                try {
                    biometricPrompt.authenticate(promptInfo);
                } catch (Exception e) {
                    pendingBiometricId = null;
                    replyBiometric(requestId, false, "لا يمكن تشغيل نافذة البصمة");
                }
            });
        }
    }

    private final class ExitBridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> { if (isLocalPage()) finish(); });
        }
    }

    private final class BackupBridge {
        @JavascriptInterface
        public void saveBackup(String json, String filename) {
            runOnUiThread(() -> {
                if (!isLocalPage()) return;
                if (json == null || json.length() > 25000000) {
                    Toast.makeText(MainActivity.this, "النسخة الاحتياطية كبيرة جداً", Toast.LENGTH_LONG).show();
                    return;
                }
                pendingBackupJson = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                String safeName = (filename == null ? "SAN_SHINE_Backup.json" : filename)
                        .replaceAll("[^a-zA-Z0-9_.-]", "_");
                intent.putExtra(Intent.EXTRA_TITLE, safeName);
                try {
                    startActivityForResult(intent, SAVE_BACKUP);
                } catch (Exception e) {
                    pendingBackupJson = null;
                    Toast.makeText(MainActivity.this, "تعذر فتح حفظ النسخة الاحتياطية", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_IMPORT) {
            if (pendingFileChooser != null) {
                pendingFileChooser.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                pendingFileChooser = null;
            }
        } else if (requestCode == SAVE_BACKUP) {
            String json = pendingBackupJson;
            pendingBackupJson = null;
            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null || json == null) return;
            Uri destination = data.getData();
            new Thread(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(destination, "w")) {
                    if (stream == null) throw new IOException("Invalid destination");
                    stream.write(json.getBytes(StandardCharsets.UTF_8));
                    stream.flush();
                    runOnUiThread(() -> Toast.makeText(this, "تم حفظ النسخة الاحتياطية", Toast.LENGTH_LONG).show());
                } catch (Exception e) {
                    runOnUiThread(() -> Toast.makeText(this, "تعذر حفظ النسخة الاحتياطية", Toast.LENGTH_LONG).show());
                }
            }).start();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
        if (webView != null) {
            webView.removeJavascriptInterface("NativeSecurity");
            webView.removeJavascriptInterface("Android");
            webView.removeJavascriptInterface("AndroidFiles");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
