package com.sunshine.accounting;

import android.app.Activity;
import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Private, same-LAN one-tap transport for Technical Accountant.
 * This component NEVER parses invoices or modifies the ledger. Messages are
 * AES-GCM encrypted in the trusted WebView and verified by the application.
 * The main app must remain open while listening. No server or internet required.
 */
public final class NativeLocalSync {
    private static final String SERVICE_TYPE = "_taaccount._tcp.";
    private static final int MAX_FRAME = 7_800_000;
    private static final String ORIGIN = "https://appassets.androidplatform.net/assets/www/";

    private final Activity activity;
    private final WebView webView;
    private final boolean manager;
    private final NsdManager nsd;
    private final ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback wifiCallback;
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String, ArrayBlockingQueue<String>> answers = new ConcurrentHashMap<>();
    private final AtomicLong requestIds = new AtomicLong();
    private volatile ServerSocket server;
    private volatile NsdManager.RegistrationListener registration;
    private volatile WifiManager.MulticastLock multicastLock;
    private volatile String activeCompany;
    private volatile boolean closing = false;
    private volatile InetSocketAddress lastConfirmedDestination;
    private volatile long lastConfirmedAt = 0;
    private final AtomicBoolean sending = new AtomicBoolean(false);
    private final AtomicBoolean pairingSending = new AtomicBoolean(false);

    public NativeLocalSync(Activity activity, WebView webView, boolean manager) {
        this.activity = activity;
        this.webView = webView;
        this.manager = manager;
        this.nsd = (NsdManager) activity.getSystemService(Context.NSD_SERVICE);
        this.connectivity = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager && connectivity != null) {
            try {
                wifiCallback = new ConnectivityManager.NetworkCallback() {
                    @Override public void onAvailable(Network network) { managerStatus("network-changed"); }
                    @Override public void onLost(Network network) { managerStatus("network-down"); }
                };
                connectivity.registerNetworkCallback(
                    new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), wifiCallback);
            } catch (Exception ignored) { wifiCallback = null; }
        }
    }

    // JavascriptInterface methods execute on WebView's private JavaBridge thread,
    // NOT on the UI thread. Never call WebView.getUrl() from those methods:
    // Android throws a thread-affinity exception before Wi-Fi can start.
    // The host Activity updates this cached main-frame origin on the UI thread.
    private volatile boolean trustedMainFrame = false;

    public void onMainFrameUrlChanged(String url) {
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper())
            throw new IllegalStateException("Main frame URL must be updated on UI thread");
        trustedMainFrame = url != null && url.startsWith(ORIGIN);
    }

    private boolean isTrustedPage() {
        return trustedMainFrame && !closing;
    }

    private static boolean isCompany(String id) {
        return id != null && id.matches("company_[A-Za-z0-9_-]{8,128}");
    }

    private String serviceName(String company) {
        return "TA-FIELD-" + company.substring(Math.max(0, company.length() - 12));
    }

    private void js(String script) {
        activity.runOnUiThread(() -> {
            if (!closing && isTrustedPage()) webView.evaluateJavascript(script, null);
        });
    }

    private void managerStatus(String status) {
        js("typeof FieldSync!=='undefined' && FieldSync.onLanStatus(" + JSONObject.quote(status) + ");");
    }

    private void agentResult(String error, String data) {
        final JSONObject result = new JSONObject();
        try {
            if (error == null) result.put("data", data);
            else result.put("error", error);
        } catch (Exception ignored) { }
        js("typeof Agent!=='undefined' && Agent.onLocalSyncResult(" + JSONObject.quote(result.toString()) + ");");
    }

    private void pairingResult(String error, String data) {
        final JSONObject result = new JSONObject();
        try { if (error == null) result.put("data", data); else result.put("error", error); }
        catch (Exception ignored) { }
        js("typeof AgentPairing!=='undefined' && AgentPairing.onNetworkReply(" + JSONObject.quote(result.toString()) + ");");
    }

    private synchronized void acquireMulticast() {
        if (Build.VERSION.SDK_INT >= 33 || multicastLock != null) return;
        try {
            WifiManager wifi = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                multicastLock = wifi.createMulticastLock("TA-LAN-Discovery");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
            }
        } catch (Exception ignored) { }
    }

    private synchronized void releaseMulticast() {
        if (multicastLock == null) return;
        try { if (multicastLock.isHeld()) multicastLock.release(); } catch (Exception ignored) { }
        multicastLock = null;
    }

    @JavascriptInterface
    public String startReceiver(String companyId) {
        if (!manager || !isCompany(companyId) || closing || !isTrustedPage()) return "invalid";
        synchronized (this) {
            if (server != null && !server.isClosed() && companyId.equals(activeCompany)) return "already";
            stopReceiverInternal();
            activeCompany = companyId;
        }
        io.execute(() -> {
            try {
                ServerSocket opened = new ServerSocket(0);
                opened.setSoTimeout(1000);
                synchronized (this) {
                    if (closing || !companyId.equals(activeCompany)) { opened.close(); return; }
                    server = opened;
                }
                acquireMulticast();
                NsdServiceInfo info = new NsdServiceInfo();
                info.setServiceType(SERVICE_TYPE);
                info.setServiceName(serviceName(companyId));
                info.setPort(opened.getLocalPort());
                NsdManager.RegistrationListener listener = new NsdManager.RegistrationListener() {
                    @Override public void onServiceRegistered(NsdServiceInfo serviceInfo) { managerStatus("ready"); }
                    @Override public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) { managerStatus("فشل إعلان استقبال Wi-Fi: " + errorCode); }
                    @Override public void onServiceUnregistered(NsdServiceInfo serviceInfo) { }
                    @Override public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) { }
                };
                registration = listener;
                nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener);
                while (!closing && !opened.isClosed() && companyId.equals(activeCompany)) {
                    try { Socket socket = opened.accept(); io.execute(() -> serve(socket)); }
                    catch (java.net.SocketTimeoutException ignored) { }
                }
            } catch (Exception e) { if (!closing) managerStatus("تعذر استقبال Wi-Fi: " + e.getMessage()); }
        });
        return "starting";
    }

    /** Re-publish the local service after a Wi-Fi/network resume. */
    @JavascriptInterface
    public String restartReceiver(String companyId) {
        if (!manager || !isCompany(companyId) || closing || !isTrustedPage()) return "invalid";
        synchronized (this) { stopReceiverInternal(); }
        return startReceiver(companyId);
    }

    private void serve(Socket socket) {
        try (Socket s = socket) {
            s.setSoTimeout(45000);
            final DataInputStream input = new DataInputStream(s.getInputStream());
            final DataOutputStream output = new DataOutputStream(s.getOutputStream());
            final int size = input.readInt();
            if (size <= 0 || size > MAX_FRAME) throw new IOException("Invalid packet size");
            byte[] content = new byte[size];
            input.readFully(content);
            String raw = new String(content, StandardCharsets.UTF_8);
            String id = String.valueOf(requestIds.incrementAndGet());
            ArrayBlockingQueue<String> q = new ArrayBlockingQueue<>(1);
            answers.put(id, q);
            try {
                // Enrollment packets never enter the financial operation importer.
                boolean pairing = raw.length() <= 12000 && raw.contains("\"pairingProtocol\":\"TA-PAIR-1\"");
                if (pairing) js("typeof FieldSync!=='undefined' && FieldSync.receivePairingPacket(" + JSONObject.quote(id) + "," + JSONObject.quote(raw) + ");");
                else js("typeof FieldSync!=='undefined' && FieldSync.receiveLanPacket(" + JSONObject.quote(id) + "," + JSONObject.quote(raw) + ");");
                String response = q.poll(38, TimeUnit.SECONDS);
                if (response == null) response = "{\"error\":\"انتهت مهلة الاستجابة من التطبيق الرئيسي\"}";
                byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > MAX_FRAME) throw new IOException("Reply too large");
                output.writeInt(bytes.length);
                output.write(bytes);
                output.flush();
            } finally { answers.remove(id); }
        } catch (Exception ignored) { /* sender reports timeout; no success without ACK */ }
    }

    @JavascriptInterface
    public void reply(String requestId, String encryptedReply) {
        if (!manager || requestId == null || encryptedReply == null || encryptedReply.length() > MAX_FRAME || !isTrustedPage()) return;
        ArrayBlockingQueue<String> q = answers.get(requestId);
        if (q != null) q.offer(encryptedReply);
    }

    @JavascriptInterface
    public void send(String companyId, String encryptedRequest) {
        if (manager || closing || !isTrustedPage()) return;
        if (!isCompany(companyId) || encryptedRequest == null || encryptedRequest.length() > MAX_FRAME) {
            agentResult("طلب مزامنة غير صالح", null); return;
        }
        if (!sending.compareAndSet(false, true)) { agentResult("المزامنة قيد التشغيل بالفعل", null); return; }
        io.execute(() -> {
            try {
                IOException lastError = null;
                boolean completed = false;
                for (int attempt = 0; attempt < 2 && !completed; attempt++) {
                    InetSocketAddress destination = (attempt == 0 && lastConfirmedDestination != null &&
                        System.currentTimeMillis() - lastConfirmedAt < 60_000L)
                        ? lastConfirmedDestination : findServer(companyId);
                    if (destination == null) { lastError = new IOException("لم يظهر التطبيق الرئيسي على شبكة Wi-Fi المحلية"); break; }
                    try (Socket socket = new Socket()) {
                        bindToWifiIfAvailable(socket);
                        socket.connect(destination, 6000);
                        socket.setSoTimeout(44000);
                        DataOutputStream output = new DataOutputStream(socket.getOutputStream());
                        byte[] bytes = encryptedRequest.getBytes(StandardCharsets.UTF_8);
                        output.writeInt(bytes.length); output.write(bytes); output.flush();
                        DataInputStream input = new DataInputStream(socket.getInputStream());
                        int size = input.readInt();
                        if (size <= 0 || size > MAX_FRAME) throw new IOException("رد الإدارة غير صالح");
                        byte[] received = new byte[size]; input.readFully(received);
                        lastConfirmedDestination = destination;
                        lastConfirmedAt = System.currentTimeMillis();
                        agentResult(null, new String(received, StandardCharsets.UTF_8));
                        completed = true;
                    } catch (IOException ioError) {
                        lastError = ioError;
                        lastConfirmedDestination = null;
                        // Rediscover only when a previously working address has gone stale.
                        if (attempt > 0 || lastConfirmedAt == 0) break;
                    }
                }
                if (!completed) throw lastError == null ? new IOException("فشل الاتصال بالمحاسبة الرئيسية") : lastError;
            } catch (Exception e) { agentResult(e.getMessage() == null ? "انقطع الاتصال أثناء المزامنة" : e.getMessage(), null); }
            finally { sending.set(false); }
        });
    }

    /** Local sockets must follow the Wi-Fi path even when a full-tunnel VPN owns the default route.
     * This does not bypass VPN policy: if LAN is blocked, the connection still fails normally. */
    private void bindToWifiIfAvailable(Socket socket) {
        if (connectivity == null || socket == null) return;
        try {
            // Public Android networking APIs through reflection keep the simple offline
            // Java regression harness compatible with older SDK stubs.
            Object networks = android.net.ConnectivityManager.class.getMethod("getAllNetworks").invoke(connectivity);
            if (!(networks instanceof Object[])) return;
            for (Object network : (Object[]) networks) {
                Object caps = android.net.ConnectivityManager.class.getMethod("getNetworkCapabilities", Network.class).invoke(connectivity, network);
                if (caps != null && Boolean.TRUE.equals(caps.getClass().getMethod("hasTransport", int.class)
                        .invoke(caps, NetworkCapabilities.TRANSPORT_WIFI))) {
                    network.getClass().getMethod("bindSocket", Socket.class).invoke(network, socket);
                    return;
                }
            }
        } catch (Exception ignored) { /* keep normal OS route as fallback */ }
    }

    /** Discover the manager automatically and exchange onboarding messages.
     * A pending request can never modify the manager's database. */
    @JavascriptInterface
    public void requestPairing(String companyId, String requestJson) {
        if (manager || closing || !isTrustedPage()) return;
        if (companyId == null || !(companyId.isEmpty() || isCompany(companyId)) || requestJson == null || requestJson.length() > 12000) {
            pairingResult("طلب الربط غير صحيح", null); return;
        }
        try {
            JSONObject packet = new JSONObject(requestJson);
            if (!"TA-PAIR-1".equals(packet.optString("pairingProtocol"))) throw new IOException("invalid protocol");
            if (!java.util.Arrays.asList("hello", "poll", "confirm").contains(packet.optString("kind"))) throw new IOException("invalid request");
        } catch (Exception e) { pairingResult("طلب الربط غير صحيح", null); return; }
        if (!pairingSending.compareAndSet(false, true)) return;
        io.execute(() -> {
            try {
                InetSocketAddress target = findServer(companyId.isEmpty() ? null : companyId);
                if (target == null) throw new IOException("لم يُعثر على التطبيق الرئيسي على شبكة Wi-Fi المحلية");
                try (Socket socket = new Socket()) {
                    bindToWifiIfAvailable(socket);
                    socket.connect(target, 5500);
                    socket.setSoTimeout(43000);
                    DataOutputStream out = new DataOutputStream(socket.getOutputStream());
                    byte[] bytes = requestJson.getBytes(StandardCharsets.UTF_8);
                    out.writeInt(bytes.length);out.write(bytes);out.flush();
                    DataInputStream in = new DataInputStream(socket.getInputStream());
                    int size = in.readInt();
                    if (size <= 0 || size > MAX_FRAME) throw new IOException("رد ربط غير صحيح");
                    byte[] answer = new byte[size];in.readFully(answer);
                    pairingResult(null, new String(answer, StandardCharsets.UTF_8));
                }
            } catch (Exception e) { pairingResult(e.getMessage() == null ? "تعذر ربط الجهاز" : e.getMessage(), null); }
            finally { pairingSending.set(false); }
        });
    }

    private InetSocketAddress findServer(String companyId) throws InterruptedException {
        final CountDownLatch completed = new CountDownLatch(1);
        final AtomicBoolean resolving = new AtomicBoolean(false);
        final AtomicReference<InetSocketAddress> address = new AtomicReference<>();
        final String expected = companyId == null ? "TA-FIELD-" : serviceName(companyId);
        acquireMulticast();
        NsdManager.DiscoveryListener discovery = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String type) { }
            @Override public void onServiceFound(NsdServiceInfo info) {
                if (!info.getServiceName().startsWith(expected) || !resolving.compareAndSet(false, true)) return;
                nsd.resolveService(info, new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo service, int errorCode) { resolving.set(false); }
                    @Override public void onServiceResolved(NsdServiceInfo service) {
                        InetAddress host = service.getHost();
                        if (host != null && service.getPort() > 0) {
                            address.set(new InetSocketAddress(host, service.getPort()));
                            completed.countDown();
                        } else resolving.set(false);
                    }
                });
            }
            @Override public void onServiceLost(NsdServiceInfo info) { }
            @Override public void onDiscoveryStopped(String serviceType) { }
            @Override public void onStartDiscoveryFailed(String type, int code) { completed.countDown(); }
            @Override public void onStopDiscoveryFailed(String type, int code) { }
        };
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
            completed.await(9, TimeUnit.SECONDS);
        } catch (Exception e) { return null; }
        finally {
            try { nsd.stopServiceDiscovery(discovery); } catch (Exception ignored) { }
            releaseMulticast();
        }
        return address.get();
    }

    private synchronized void stopReceiverInternal() {
        activeCompany = null;
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        server = null;
        if (registration != null) {
            try { nsd.unregisterService(registration); } catch (Exception ignored) { }
            registration = null;
        }
        releaseMulticast();
    }

    @JavascriptInterface
    public void stopReceiver() {
        if (!manager || !isTrustedPage()) return;
        synchronized (this) { stopReceiverInternal(); }
        managerStatus("stopped");
    }

    public void destroy() {
        closing = true;
        if (connectivity != null && wifiCallback != null) {
            try { connectivity.unregisterNetworkCallback(wifiCallback); } catch (Exception ignored) { }
            wifiCallback = null;
        }
        synchronized (this) { stopReceiverInternal(); }
        answers.clear();
        io.shutdownNow();
    }
}
