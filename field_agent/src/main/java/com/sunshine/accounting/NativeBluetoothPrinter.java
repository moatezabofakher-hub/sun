package com.sunshine.accounting;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.provider.Settings;
import android.widget.ArrayAdapter;
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
    public static final int SCAN_PERMISSION_REQUEST = 7243;
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
    private Runnable pendingScanAction;
    private BroadcastReceiver discoveryReceiver;
    private AlertDialog scanDialog;
    private String pairingAddress;

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
        if (requestCode == SCAN_PERMISSION_REQUEST) {
            Runnable nextScan = pendingScanAction;
            pendingScanAction = null;
            boolean allGranted = results.length > 0;
            for (int grant : results) allGranted &= grant == PackageManager.PERMISSION_GRANTED;
            if (allGranted && nextScan != null) activity.runOnUiThread(nextScan);
            else event("error", "يلزم السماح بالبحث عن الأجهزة المجاورة للاقتران بالطابعة", "");
            return;
        }
        if (requestCode != CONNECT_PERMISSION_REQUEST) return;
        Runnable next = pendingPermissionAction;
        pendingPermissionAction = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && next != null) {
            activity.runOnUiThread(next);
        } else {
            event("error", "يجب السماح للأجهزة المجاورة للطباعة المباشرة", "");
        }
    }

    /** Discover and pair Bluetooth Classic ESC/POS printers without leaving the app.
     * The system still owns the PIN/bonding confirmation dialog. */
    @JavascriptInterface
    public void pairPrinter() {
        activity.runOnUiThread(() -> withScanPermission(this::showScanDialog));
    }

    private void withScanPermission(Runnable action) {
        if (destroyed) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean scan = ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_SCAN)
                    == PackageManager.PERMISSION_GRANTED;
            boolean connect = allowed();
            if (!scan || !connect) {
                pendingScanAction = action;
                activity.requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN,
                        Manifest.permission.BLUETOOTH_CONNECT}, SCAN_PERMISSION_REQUEST);
                return;
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                        != PackageManager.PERMISSION_GRANTED) {
            pendingScanAction = action;
            activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},
                    SCAN_PERMISSION_REQUEST);
            return;
        }
        action.run();
    }

    private void stopScanning() {
        try { if (adapter() != null && adapter().isDiscovering()) adapter().cancelDiscovery(); }
        catch (SecurityException ignored) {}
        if (discoveryReceiver != null) {
            try { activity.unregisterReceiver(discoveryReceiver); } catch (Exception ignored) {}
            discoveryReceiver = null;
        }
        scanDialog = null;
    }

    private void showScanDialog() {
        if (destroyed) return;
        BluetoothAdapter bt = adapter();
        if (bt == null) { event("error", "الهاتف لا يدعم البلوتوث", ""); return; }
        if (!bt.isEnabled()) {
            new AlertDialog.Builder(activity).setTitle("تشغيل البلوتوث")
              .setMessage("شغّل البلوتوث من إعدادات الهاتف ثم ارجع لإجراء الاقتران من التطبيق.")
              .setPositiveButton("فتح إعدادات البلوتوث", (d,which) ->
                      activity.startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)))
              .setNegativeButton("إلغاء", null).show();
            return;
        }
        stopScanning();
        final ArrayList<BluetoothDevice> devices = new ArrayList<>();
        final ArrayAdapter<String> names = new ArrayAdapter<>(activity, android.R.layout.simple_list_item_1);
        try {
            Set<BluetoothDevice> bonded = bt.getBondedDevices();
            for (BluetoothDevice device : bonded) addDiscovered(device, devices, names);
        } catch (SecurityException e) { event("error", "لم تُمنح صلاحية الأجهزة المجاورة", ""); return; }
        if (devices.isEmpty()) names.add("جارٍ البحث عن الأجهزة القريبة...");
        scanDialog = new AlertDialog.Builder(activity)
          .setTitle("بحث واقتران بطابعة البلوتوث")
          .setAdapter(names, (dialog, position) -> {
              if (position >= devices.size()) return;
              BluetoothDevice device = devices.get(position);
              stopScanning();
              try {
                  String mac = device.getAddress();
                  activity.getSharedPreferences(PREFS, 0).edit().putString(DEVICE_KEY, mac).apply();
                  if (device.getBondState() == BluetoothDevice.BOND_BONDED) connectAddress(mac);
                  else {
                      // Bonding confirmation and PIN are provided by Android, not by this app.
                      pairingAddress = mac;
                      installBondReceiver();
                      if (!device.createBond()) {
                          pairingAddress = null;
                          stopScanning();
                          event("error", "تعذر بدء الاقتران. جرّب البحث مرة أخرى", mac);
                      } else event("pairing", "اقبل نافذة الاقتران من أندرويد وأدخل PIN الطابعة إذا طُلب", mac);
                  }
              } catch (SecurityException e) { event("error", "إذن البلوتوث غير كافٍ", ""); }
          })
          .setNegativeButton("إغلاق", (dialog,which) -> stopScanning())
          .setNeutralButton("إعادة البحث", (dialog,which) -> { stopScanning(); showScanDialog(); })
          .create();
        scanDialog.setOnDismissListener(d -> { if (pairingAddress == null) stopScanning(); });
        scanDialog.show();
        discoveryReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (device != null) {
                        if (devices.isEmpty()) names.clear();
                        addDiscovered(device, devices, names);
                    }
                } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                    if (devices.isEmpty()) names.clear();
                    if (devices.isEmpty()) names.add("لم يُعثر على أجهزة. شغّل الطابعة وأعد البحث");
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        registerBluetoothReceiver(discoveryReceiver, filter);
        try { if (!bt.startDiscovery()) event("error", "تعذر بدء البحث عن طابعات", ""); }
        catch (SecurityException e) { event("error", "البلوتوث لا يسمح بالبحث", ""); }
    }

    private void addDiscovered(BluetoothDevice device, ArrayList<BluetoothDevice> devices,
                               ArrayAdapter<String> names) {
        try {
            String mac = device.getAddress();
            for (BluetoothDevice d : devices) if (d.getAddress().equals(mac)) return;
            devices.add(device);
            String name = device.getName();
            names.add((name == null || name.trim().isEmpty() ? "جهاز بلوتوث" : name) +
                    "  (" + mac + ")" +
                    (device.getBondState() == BluetoothDevice.BOND_BONDED ? " ✓ مقترن" : " · اقتران"));
        } catch (SecurityException ignored) {}
    }

    private void registerBluetoothReceiver(BroadcastReceiver receiver, IntentFilter filter) {
        if (Build.VERSION.SDK_INT >= 33)
            activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        else activity.registerReceiver(receiver, filter);
    }

    private void installBondReceiver() {
        if (discoveryReceiver != null) {
            try { activity.unregisterReceiver(discoveryReceiver); } catch (Exception ignored) {}
            discoveryReceiver = null;
        }
        discoveryReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (!BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(intent.getAction())) return;
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (device == null || pairingAddress == null) return;
                try {
                    if (!device.getAddress().equals(pairingAddress)) return;
                    int state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR);
                    if (state == BluetoothDevice.BOND_BONDED) {
                        String mac = pairingAddress; pairingAddress = null;
                        stopScanning(); connectAddress(mac);
                    } else if (state == BluetoothDevice.BOND_NONE) {
                        pairingAddress = null; stopScanning();
                        event("error", "فشل الاقتران؛ تحقق من PIN الطابعة وأعد المحاولة", "");
                    }
                } catch (SecurityException e) { event("error", "لا توجد صلاحية لإكمال الاقتران", ""); }
            }
        };
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        registerBluetoothReceiver(discoveryReceiver, filter);
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
        activity.runOnUiThread(this::stopScanning);
        destroyed = true;
        worker.execute(this::closeSocket);
        worker.shutdown();
    }
}
