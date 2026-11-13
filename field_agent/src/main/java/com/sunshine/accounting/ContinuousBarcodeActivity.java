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
    private String lastCode = "";
    private long lastTime = 0;
    private boolean requestedPermission = false;
    private boolean closed = false;

    private int dp(float v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
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
        heading.setText("مسح أصناف الفاتورة");
        heading.setTextSize(17);
        heading.setTextColor(Color.WHITE);
        heading.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        top.addView(heading, new LinearLayout.LayoutParams(0, dp(55), 1));
        Button close = new Button(this);
        close.setText("×");
        close.setContentDescription("إغلاق الكاميرا وإضافة الأصناف إلى الفاتورة");
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
        countText.setText("القراءات: 0");
        countText.setTextSize(19);
        countText.setTextColor(Color.rgb(155, 235, 255));
        countText.setGravity(Gravity.CENTER);
        bottom.addView(countText);
        lastText = new TextView(this);
        lastText.setText("امسح الأصناف واحداً تلو الآخر، ثم اضغط × لإضافتها إلى الفاتورة");
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
                        "اضغط × لإغلاق الكاميرا وإضافة الأصناف", Toast.LENGTH_SHORT).show();
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
        if (scanned.size() >= MAX_CODES) {
            lastText.setText("وصلت للحد الأعلى، اضغط × لإضافة الأصناف");
            return;
        }
        scanned.add(code);
        lastCode = code;
        lastTime = now;
        countText.setText("القراءات: " + scanned.size());
        lastText.setText("تمت قراءة " + code + " — استمر في المسح، أو اضغط × للإنهاء");
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
                closeAndReturn("يجب السماح باستخدام الكاميرا من إعدادات التطبيق");
            }
        }
    }

    @Override protected void onPause() {
        camera.pause();
        super.onPause();
    }

    @Override public boolean onKeyDown(int code, KeyEvent event) {
        return camera.onKeyDown(code, event) || super.onKeyDown(code, event);
    }
}
