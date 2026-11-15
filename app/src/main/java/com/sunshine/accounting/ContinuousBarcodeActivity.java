package com.sunshine.accounting;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.zxing.ResultPoint;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;

import java.util.ArrayList;
import java.util.List;

/** Multi-item invoice barcode scanner. No network, keeps the same invoice draft. */
public final class ContinuousBarcodeActivity extends ComponentActivity {
    public static final String EXTRA_KNOWN_CODES = "com.sunshine.accounting.KNOWN_BARCODES";
    public static final String EXTRA_CODES = "com.sunshine.accounting.SCANNED_CODES";
    public static final String EXTRA_ERROR = "com.sunshine.accounting.SCANNER_ERROR";
    private static final int REQUEST_CAMERA = 8402;
    private static final int MAX_CODES = 500;
    private static final long REPEATED_CODE_COOLDOWN_MS = 3500;
    private static final long DIFFERENT_CODE_COOLDOWN_MS = 450;

    private DecoratedBarcodeView camera;
    private TextView countText;
    private TextView lastText;
    private final ArrayList<String> scanned = new ArrayList<>();
    private java.util.Set<String> knownBarcodes = null;
    private String lastCode = "";
    private long lastTime = 0;
    private boolean requestedPermission = false;
    private boolean closed = false;
    private boolean englishUi = false;
    private String tr(String arabic, String english) { return englishUi ? english : arabic; }
    private android.media.ToneGenerator readTone;


    private int dp(float v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        englishUi = "en".equals(getSharedPreferences("tiqany_ui_locale", MODE_PRIVATE).getString("language", "ar"));
        try { readTone = new android.media.ToneGenerator(
                android.media.AudioManager.STREAM_MUSIC, 65); }
        catch (RuntimeException ignored) { readTone = null; }

        if(getIntent()!=null && getIntent().hasExtra(EXTRA_KNOWN_CODES)) {
            ArrayList<String> entries=getIntent().getStringArrayListExtra(EXTRA_KNOWN_CODES);
            knownBarcodes=new java.util.HashSet<>();
            if(entries!=null) for(String entry:entries) if(entry!=null) knownBarcodes.add(entry.trim().toLowerCase(java.util.Locale.ROOT));
        }
        // Keep overlay actions away from the status/navigation bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 22, 39));
        camera = new DecoratedBarcodeView(this);
        root.addView(camera, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(14), dp(8), dp(14), dp(8));
        top.setBackgroundColor(Color.argb(235, 12, 35, 57));
        TextView heading = new TextView(this);
        heading.setText(tr("مسح أصناف الفاتورة", "Scan invoice items"));
        heading.setTextSize(17);
        heading.setTextColor(Color.WHITE);
        heading.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        top.addView(heading, new LinearLayout.LayoutParams(0, dp(55), 1));
        Button close = new Button(this);
        close.setText("×");
        close.setContentDescription(tr("إغلاق الكاميرا وإضافة الأصناف إلى الفاتورة", "Close scanner and add selected items"));
        close.setTextSize(28);
        close.setTextColor(Color.WHITE);
        close.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(182, 42, 62)));
        top.addView(close, new LinearLayout.LayoutParams(dp(64), dp(55)));
        close.setOnClickListener(v -> closeAndReturn(null));
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        root.addView(top, topParams);

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setGravity(Gravity.CENTER);
        bottom.setPadding(dp(12), dp(13), dp(12), dp(14));
        bottom.setBackgroundColor(Color.argb(238, 11, 44, 65));
        countText = new TextView(this);
        countText.setText(tr("القراءات: 0", "Scans: 0"));
        countText.setTextSize(19);
        countText.setTextColor(Color.rgb(155, 235, 255));
        countText.setGravity(Gravity.CENTER);
        bottom.addView(countText);
        lastText = new TextView(this);
        lastText.setText(tr("امسح الأصناف واحداً تلو الآخر، ثم اضغط × لإضافتها إلى الفاتورة", "Scan items one by one, then tap × to add them to the invoice"));
        lastText.setTextSize(13);
        lastText.setTextColor(Color.WHITE);
        lastText.setGravity(Gravity.CENTER);
        bottom.addView(lastText);
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(bottom, bottomParams);
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            FrameLayout.LayoutParams tp = (FrameLayout.LayoutParams) top.getLayoutParams();
            tp.topMargin = sys.top;
            top.setLayoutParams(tp);
            FrameLayout.LayoutParams bp = (FrameLayout.LayoutParams) bottom.getLayoutParams();
            bp.bottomMargin = sys.bottom;
            bottom.setLayoutParams(bp);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);

        // Never close automatically after a result; this callback continues scanning.
        camera.decodeContinuous(new BarcodeCallback() {
            @Override public void barcodeResult(BarcodeResult result) {
                if (result == null) return;
                acceptBarcode(result.getText());
            }
            @Override public void possibleResultPoints(List<ResultPoint> points) { }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                Toast.makeText(ContinuousBarcodeActivity.this,
                        tr("اضغط × لإغلاق الكاميرا وإضافة الأصناف", "Tap × to close scanner and add items"), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void acceptBarcode(String raw) {
        if (closed || raw == null) return;
        String code = raw.trim();
        if (code.isEmpty()) return;
        long now = SystemClock.elapsedRealtime();
        long cooldown = code.equals(lastCode) ? REPEATED_CODE_COOLDOWN_MS
                : DIFFERENT_CODE_COOLDOWN_MS;
        if (now - lastTime < cooldown) return;
        if (knownBarcodes != null && !knownBarcodes.contains(code.toLowerCase(java.util.Locale.ROOT))) {
            lastCode=code;lastTime=now;
            if(readTone!=null)try{readTone.startTone(android.media.ToneGenerator.TONE_PROP_NACK,230);}catch(RuntimeException ignored){}
            lastText.setText(tr("الباركود غير معرّف: ", "Unknown barcode: ") + code);
            lastText.setTextColor(Color.rgb(255, 152, 152));
            Toast.makeText(this, tr("الباركود غير معرّف: ", "Unknown barcode: ") + code, Toast.LENGTH_SHORT).show();
            return;
        }
        lastText.setTextColor(Color.WHITE);
        if (scanned.size() >= MAX_CODES) {
            lastText.setText(tr("وصلت للحد الأعلى، اضغط × لإضافة الأصناف", "Maximum items reached, tap × to add them"));
            return;
        }
        scanned.add(code);
        // Acknowledge the accepted camera decoding now, not when rows are imported later.
        if (readTone != null) {
            try { readTone.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 90); }
            catch (RuntimeException ignored) { /* no audio hardware available */ }
        }
        lastCode = code;
        lastTime = now;
        countText.setText(tr("القراءات: ", "Scans: ") + scanned.size());
        lastText.setText(tr("تمت قراءة ", "Scanned ") + code + tr(" — استمر في المسح، أو اضغط × للإنهاء", " — Keep scanning or tap × to finish"));
    }

    private void closeAndReturn(String error) {
        if (closed) return;
        closed = true;
        Intent result = new Intent();
        result.putStringArrayListExtra(EXTRA_CODES, new ArrayList<>(scanned));
        if (error != null) result.putExtra(EXTRA_ERROR, error);
        setResult(RESULT_OK, result);
        finish();
    }

    @Override protected void onResume() {
        super.onResume();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            camera.resume();
        } else if (!requestedPermission) {
            requestedPermission = true;
            ActivityCompat.requestPermissions(this,
                    new String[]{ Manifest.permission.CAMERA }, REQUEST_CAMERA);
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode,
            String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_CAMERA) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                camera.resume();
            } else {
                closeAndReturn(tr("يجب السماح باستخدام الكاميرا من إعدادات التطبيق", "Enable camera permission in app settings"));
            }
        }
    }

    @Override protected void onDestroy() {
        if (readTone != null) { readTone.release(); readTone = null; }
        super.onDestroy();
    }

    @Override protected void onPause() {
        camera.pause();
        super.onPause();
    }

    @Override public boolean onKeyDown(int code, KeyEvent event) {
        return camera.onKeyDown(code, event) || super.onKeyDown(code, event);
    }
}
