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

    private boolean isEnglishUi() {
        return "en".equals(activity.getSharedPreferences("tiqany_ui_locale", 0).getString("language", "ar"));
    }
    private String tr(String ar, String en) { return isEnglishUi() ? en : ar; }

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
            event("error", tr("يجب السماح للأجهزة المجاورة للطباعة المباشرة", "Allow Nearby Devices to print directly"), "");
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
            if (isConnected()) event("connected", connectedName == null ? tr("الطابعة", "Printer") : connectedName, connectedAddress);
            else event("disconnected", tr("اختر طابعة مقترنة من داخل التطبيق", "Select a paired printer in the app"), savedAddress());
        });
    }

    @JavascriptInterface
    public void disconnect() {
        worker.execute(() -> {
            closeSocket();
            event("disconnected", tr("تم فصل الطابعة", "Printer disconnected"), "");
        });
    }

    private String savedAddress() {
        return activity.getSharedPreferences(PREFS, 0).getString(DEVICE_KEY, "");
    }

    private void showPairedDevices() {
        if (!allowed()) return;
        BluetoothAdapter bt = adapter();
        if (bt == null) {
            event("error", tr("هذا الهاتف لا يدعم البلوتوث", "This phone does not support Bluetooth"), "");
            return;
        }
        if (!bt.isEnabled()) {
            event("error", tr("شغّل البلوتوث واقترن بالطابعة من إعدادات الهاتف أولاً", "Enable Bluetooth and pair your printer in phone settings"), "");
            return;
        }
        try {
            Set<BluetoothDevice> bonded = bt.getBondedDevices();
            ArrayList<BluetoothDevice> devices = new ArrayList<>(bonded);
            devices.sort(Comparator.comparing(d -> d.getName() == null ? "" : d.getName(), String.CASE_INSENSITIVE_ORDER));
            if (devices.isEmpty()) {
                new AlertDialog.Builder(activity)
                        .setTitle(tr("لا توجد طابعة مقترنة", "No paired printer"))
                        .setMessage(tr("اقترن بطابعة Xprinter من إعدادات بلوتوث الهاتف أولاً، ثم ارجع واخترها هنا.", "First pair your Xprinter in Bluetooth settings, then return to select it here."))
                        .setPositiveButton(tr("موافق", "OK"), null).show();
                event("error", tr("لم يتم العثور على أجهزة بلوتوث مقترنة", "No paired Bluetooth devices found"), "");
                return;
            }
            String[] labels = new String[devices.size()];
            for (int i = 0; i < devices.size(); i++) {
                BluetoothDevice device = devices.get(i);
                labels[i] = (device.getName() == null ? tr("جهاز بلوتوث", "Bluetooth device") : device.getName()) + "  (" + device.getAddress() + ")";
            }
            new AlertDialog.Builder(activity)
                    .setTitle(tr("اختر الطابعة المقترنة", "Choose paired printer"))
                    .setItems(labels, (dialog, which) -> {
                        String mac = devices.get(which).getAddress();
                        activity.getSharedPreferences(PREFS, 0).edit().putString(DEVICE_KEY, mac).apply();
                        connectAddress(mac);
                    })
                    .setNegativeButton(tr("إلغاء", "Cancel"), null)
                    .show();
        } catch (SecurityException e) {
            event("error", tr("إذن الاتصال بالبلوتوث غير متاح", "Bluetooth connection permission not granted"), "");
        }
    }

    private void connectAddress(String mac) {
        event("connecting", tr("جارٍ الاتصال بالطابعة...", "Connecting to printer..."), mac);
        worker.execute(() -> {
            try {
                connectInternal(mac);
                event("connected", connectedName, connectedAddress);
            } catch (Exception e) {
                closeSocket();
                event("error", tr("تعذر الاتصال بالطابعة: ", "Could not connect to printer: ") + safeError(e), mac);
            }
        });
    }

    private boolean isConnected() {
        BluetoothSocket s = socket;
        return s != null && s.isConnected();
    }

    private void connectInternal(String mac) throws IOException {
        if (destroyed) throw new IOException(tr("تم إغلاق التطبيق", "Application closed"));
        if (isConnected() && mac.equals(connectedAddress)) return;
        closeSocket();
        if (!allowed()) throw new IOException(tr("الرجاء السماح بالوصول للأجهزة المجاورة", "Allow access to nearby devices"));
        BluetoothAdapter bt = adapter();
        if (bt == null || !bt.isEnabled()) throw new IOException(tr("البلوتوث غير مفعّل", "Bluetooth is disabled"));
        BluetoothDevice device = bt.getRemoteDevice(mac);
        BluetoothSocket candidate = device.createRfcommSocketToServiceRecord(SPP_UUID);
        try {
            candidate.connect();
            socket = candidate;
            connectedAddress = mac;
            connectedName = device.getName() == null ? tr("طابعة بلوتوث", "Bluetooth printer") : device.getName();
        } catch (Exception e) {
            try { candidate.close(); } catch (Exception ignored) {}
            throw e instanceof IOException ? (IOException) e : new IOException(e.getMessage());
        }
    }

    @JavascriptInterface
    public void printBase64(String encoded) {
        if (encoded == null || encoded.length() > MAX_PRINT_BYTES * 2) {
            event("error", tr("حجم الفاتورة أكبر من المسموح للطابعة", "Invoice exceeds printer size limit"), "");
            return;
        }
        withPermission(() -> {
            String mac = savedAddress();
            if (mac.isEmpty()) {
                showPairedDevices();
                event("error", tr("اختر طابعتك أولاً ثم اضغط طباعة مرة أخرى", "Choose your printer, then press Print again"), "");
                return;
            }
            if (busy) {
                event("error", tr("يرجى إكمال عملية الطباعة الحالية أولاً", "Finish the current print job first"), "");
                return;
            }
            busy = true;
            event("printing", tr("جارٍ إرسال الفاتورة للطابعة...", "Sending invoice to printer..."), mac);
            worker.execute(() -> {
                try {
                    byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                    if (bytes.length > MAX_PRINT_BYTES) throw new IOException(tr("حجم الفاتورة كبير جداً", "Invoice is too large"));
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
                    event("printed", tr("تم إرسال الفاتورة إلى الطابعة", "Invoice sent to printer"), connectedAddress);
                } catch (Exception e) {
                    closeSocket();
                    event("error", tr("فشلت الطباعة: ", "Printing failed: ") + safeError(e), mac);
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
