package com.sunshine.accounting;

import android.Manifest;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bluetooth Classic RFCOMM (SPP) ESC/POS printer bridge.
 * Works with PAIRED printers that expose the standard Serial Port Profile.
 * No discovery/location permissions are needed: pairing happens in Android Settings.
 */
public final class NativeBluetoothPrinter {
    public static final int CONNECT_PERMISSION_REQUEST = 7242;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int MAX_PRINT_BYTES = 12 * 1024 * 1024;
    private static final String PREFS = "technical_accountant_printer_v1";
    private static final String DEVICE_KEY = "mac";

    private final FragmentActivity activity;
    private final WebView webView;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile BluetoothSocket socket;
    private volatile String connectedAddress;
    private volatile String connectedName;
    private volatile boolean busy;
    private volatile boolean destroyed;
    private Runnable pendingPermissionAction;

    NativeBluetoothPrinter(FragmentActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    private BluetoothAdapter adapter() {
        return BluetoothAdapter.getDefaultAdapter();
    }

    private boolean allowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                || ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void withPermission(Runnable action) {
        if (destroyed) return;
        activity.runOnUiThread(() -> {
            if (allowed()) {
                action.run();
                return;
            }
            pendingPermissionAction = action;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                activity.requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, CONNECT_PERMISSION_REQUEST);
            }
        });
    }

    public void onPermissionResult(int requestCode, int[] results) {
        if (requestCode != CONNECT_PERMISSION_REQUEST) return;
        Runnable next = pendingPermissionAction;
        pendingPermissionAction = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && next != null) {
            activity.runOnUiThread(next);
        } else {
            event("error", "يجب السماح للأجهزة المجاورة للطباعة المباشرة", "");
        }
    }

    @JavascriptInterface
    public void choosePrinter() {
        withPermission(this::showPairedDevices);
    }

    @JavascriptInterface
    public void connectSaved() {
        withPermission(() -> {
            String mac = savedAddress();
            if (mac.isEmpty()) showPairedDevices();
            else connectAddress(mac);
        });
    }

    @JavascriptInterface
    public void getStatus() {
        activity.runOnUiThread(() -> {
            if (isConnected()) event("connected", connectedName == null ? "الطابعة" : connectedName, connectedAddress);
            else event("disconnected", "اختر طابعة مقترنة من داخل التطبيق", savedAddress());
        });
    }

    @JavascriptInterface
    public void disconnect() {
        worker.execute(() -> {
            closeSocket();
            event("disconnected", "تم فصل الطابعة", "");
        });
    }

    private String savedAddress() {
        return activity.getSharedPreferences(PREFS, 0).getString(DEVICE_KEY, "");
    }

    private void showPairedDevices() {
        if (!allowed()) return;
        BluetoothAdapter bt = adapter();
        if (bt == null) {
            event("error", "هذا الهاتف لا يدعم البلوتوث", "");
            return;
        }
        if (!bt.isEnabled()) {
            event("error", "شغّل البلوتوث واقترن بالطابعة من إعدادات الهاتف أولاً", "");
            return;
        }
        try {
            Set<BluetoothDevice> bonded = bt.getBondedDevices();
            ArrayList<BluetoothDevice> devices = new ArrayList<>(bonded);
            devices.sort(Comparator.comparing(d -> d.getName() == null ? "" : d.getName(), String.CASE_INSENSITIVE_ORDER));
            if (devices.isEmpty()) {
                new AlertDialog.Builder(activity)
                        .setTitle("لا توجد طابعة مقترنة")
                        .setMessage("اقترن بطابعة Xprinter من إعدادات بلوتوث الهاتف أولاً، ثم ارجع واخترها هنا.")
                        .setPositiveButton("موافق", null).show();
                event("error", "لم يتم العثور على أجهزة بلوتوث مقترنة", "");
                return;
            }
            String[] labels = new String[devices.size()];
            for (int i = 0; i < devices.size(); i++) {
                BluetoothDevice device = devices.get(i);
                labels[i] = (device.getName() == null ? "جهاز بلوتوث" : device.getName()) + "  (" + device.getAddress() + ")";
            }
            new AlertDialog.Builder(activity)
                    .setTitle("اختر الطابعة المقترنة")
                    .setItems(labels, (dialog, which) -> {
                        String mac = devices.get(which).getAddress();
                        activity.getSharedPreferences(PREFS, 0).edit().putString(DEVICE_KEY, mac).apply();
                        connectAddress(mac);
                    })
                    .setNegativeButton("إلغاء", null)
                    .show();
        } catch (SecurityException e) {
            event("error", "إذن الاتصال بالبلوتوث غير متاح", "");
        }
    }

    private void connectAddress(String mac) {
        event("connecting", "جارٍ الاتصال بالطابعة...", mac);
        worker.execute(() -> {
            try {
                connectInternal(mac);
                event("connected", connectedName, connectedAddress);
            } catch (Exception e) {
                closeSocket();
                event("error", "تعذر الاتصال بالطابعة: " + safeError(e), mac);
            }
        });
    }

    private boolean isConnected() {
        BluetoothSocket s = socket;
        return s != null && s.isConnected();
    }

    private void connectInternal(String mac) throws IOException {
        if (destroyed) throw new IOException("تم إغلاق التطبيق");
        if (isConnected() && mac.equals(connectedAddress)) return;
        closeSocket();
        if (!allowed()) throw new IOException("الرجاء السماح بالوصول للأجهزة المجاورة");
        BluetoothAdapter bt = adapter();
        if (bt == null || !bt.isEnabled()) throw new IOException("البلوتوث غير مفعّل");
        BluetoothDevice device = bt.getRemoteDevice(mac);
        BluetoothSocket candidate = device.createRfcommSocketToServiceRecord(SPP_UUID);
        try {
            candidate.connect();
            socket = candidate;
            connectedAddress = mac;
            connectedName = device.getName() == null ? "طابعة بلوتوث" : device.getName();
        } catch (Exception e) {
            try { candidate.close(); } catch (Exception ignored) {}
            throw e instanceof IOException ? (IOException) e : new IOException(e.getMessage());
        }
    }

    @JavascriptInterface
    public void printBase64(String encoded) {
        if (encoded == null || encoded.length() > MAX_PRINT_BYTES * 2) {
            event("error", "حجم الفاتورة أكبر من المسموح للطابعة", "");
            return;
        }
        withPermission(() -> {
            String mac = savedAddress();
            if (mac.isEmpty()) {
                showPairedDevices();
                event("error", "اختر طابعتك أولاً ثم اضغط طباعة مرة أخرى", "");
                return;
            }
            if (busy) {
                event("error", "يرجى إكمال عملية الطباعة الحالية أولاً", "");
                return;
            }
            busy = true;
            event("printing", "جارٍ إرسال الفاتورة للطابعة...", mac);
            worker.execute(() -> {
                try {
                    byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                    if (bytes.length > MAX_PRINT_BYTES) throw new IOException("حجم الفاتورة كبير جداً");
                    connectInternal(mac);
                    OutputStream output = socket.getOutputStream();
                    for (int offset = 0; offset < bytes.length; offset += 1024) {
                        int n = Math.min(1024, bytes.length - offset);
                        output.write(bytes, offset, n);
                        if (offset > 0) {
                            try { Thread.sleep(8); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                        }
                    }
                    output.flush();
                    event("printed", "تم إرسال الفاتورة إلى الطابعة", connectedAddress);
                } catch (Exception e) {
                    closeSocket();
                    event("error", "فشلت الطباعة: " + safeError(e), mac);
                } finally {
                    busy = false;
                }
            });
        });
    }

    private static String safeError(Exception e) {
        String message = e.getMessage();
        return message == null || message.isEmpty() ? e.getClass().getSimpleName() : message;
    }

    private void event(String state, String message, String address) {
        activity.runOnUiThread(() -> {
            if (destroyed) return;
            try {
                JSONObject obj = new JSONObject();
                obj.put("state", state);
                obj.put("message", message == null ? "" : message);
                obj.put("address", address == null ? "" : address);
                webView.evaluateJavascript("window.__nativePrinterEvent && window.__nativePrinterEvent(" + obj.toString() + ")", null);
            } catch (Exception ignored) {}
        });
    }

    private void closeSocket() {
        BluetoothSocket previous = socket;
        socket = null;
        connectedAddress = null;
        connectedName = null;
        if (previous != null) {
            try { previous.close(); } catch (IOException ignored) {}
        }
    }

    public void destroy() {
        destroyed = true;
        worker.execute(this::closeSocket);
        worker.shutdown();
    }
}
