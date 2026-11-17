package com.sunshine.accounting;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Outbound-only encrypted peer link; separate from the manager-to-agent listener. */
public final class MainPhonePeerSync {
    private static final String ORIGIN = "https://appassets.androidplatform.net/assets/www/";
    private static final int MAX_FRAME = 12000000;
    private static final String SERVICE_TYPE = "_tiqanymain._tcp.";
    private static final int DISCOVERY_SECONDS = 7;
    private final Activity activity;
    private final WebView webView;
    private final SharedPreferences prefs;
    private final boolean managerToManager;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy=new AtomicBoolean(false);
    private volatile boolean trusted=false;
    private volatile boolean closed=false;
    private volatile boolean networkChanged=false;
    private final NsdManager nsd;
    private final ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback wifiCallback;
    public MainPhonePeerSync(Activity activity,WebView webView){
        this(activity,webView,false);
    }
    public MainPhonePeerSync(Activity activity,WebView webView,boolean managerToManager){
        this.activity=activity;this.webView=webView;
        this.managerToManager=managerToManager;
        this.prefs=activity.getSharedPreferences(managerToManager?"tiqany_mobile_manager_link":"tiqany_main_peer_link",Context.MODE_PRIVATE);
        this.nsd=(NsdManager)activity.getSystemService(Context.NSD_SERVICE);
        this.connectivity=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        if(connectivity!=null){
            try {
                wifiCallback=new ConnectivityManager.NetworkCallback(){
                    @Override public void onAvailable(Network network){wifiChanged();}
                    @Override public void onLost(Network network){wifiChanged();}
                };
                connectivity.registerNetworkCallback(new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),wifiCallback);
            } catch(Exception ignored){wifiCallback=null;}
        }
    }
    public void onMainFrameUrlChanged(String url){trusted=url!=null&&url.startsWith(ORIGIN);}
    private boolean allowed(){return trusted&&!closed;}
    private static boolean safeAddress(String host){
        if(host==null||!host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))return false;
        try {InetAddress addr=InetAddress.getByName(host);return addr.isSiteLocalAddress()&&!addr.isLoopbackAddress()&&addr.getAddress().length==4;}
        catch(Exception ex){return false;}
    }
    @JavascriptInterface public String configure(String host,int port,String key){
        if(!allowed()||!safeAddress(host)||port<1024||port>65535||key==null||!key.matches("[A-Za-z0-9_-]{43}"))return "invalid";
        try {byte[] bytes=Base64.getUrlDecoder().decode(key);if(bytes.length!=32)return "invalid";}
        catch(Exception ex){return "invalid";}
        try {
            // The QR pairing secret must never be persisted as readable Base64.
            String protectedKey = DeviceVault.protectSecret(activity, managerToManager?"manager-phone-peer":"peer-link", key);
            if (!prefs.edit().putString("host",host).putInt("port",port).putString("key",protectedKey)
                    .remove("serverId").putBoolean("approved",false).commit()) return "error";
        } catch (Exception ex) { return "error"; }
        networkChanged=true;
        return "saved";
    }
    private String pairedKey() throws Exception {
        String stored = prefs.getString("key", "");
        if (stored.startsWith("vault1:"))
            return DeviceVault.revealSecret(activity, managerToManager?"manager-phone-peer":"peer-link", stored);
        // One-way migration preserves the existing Windows pairing identity and key.
        if (stored.matches("[A-Za-z0-9_-]{43}")) {
            String protectedKey = DeviceVault.protectSecret(activity, managerToManager?"manager-phone-peer":"peer-link", stored);
            if (!prefs.edit().putString("key", protectedKey).commit())
                throw new java.io.IOException("تعذر تأمين مفتاح الاقتران");
            return stored;
        }
        throw new java.io.IOException("مفتاح الاقتران غير موجود");
    }
    @JavascriptInterface public String status(){
        if(!allowed())return "{}";
        try {JSONObject v=new JSONObject();v.put("host",prefs.getString("host",""));v.put("port",prefs.getInt("port",0));v.put("approved",prefs.getBoolean("approved",false));v.put("serverId",prefs.getString("serverId",""));return v.toString();}
        catch(Exception ignored){return "{}";}
    }
    /** Store the verified identity from the QR or a successful encrypted sync. */
    @JavascriptInterface public boolean bindServerId(String serverId){
        if(!allowed()||serverId==null||!serverId.matches("[a-f0-9]{32}"))return false;
        String previous=prefs.getString("serverId","");
        if(!previous.isEmpty()&&!previous.equals(serverId))return false;
        prefs.edit().putString("serverId",serverId).apply();return true;
    }
    private void wifiChanged(){
        networkChanged=true;
        activity.runOnUiThread(()->{if(allowed())webView.evaluateJavascript(
            managerToManager?"window.TiqanyManagerPeerClient&&window.TiqanyManagerPeerClient.onNetworkChanged&&window.TiqanyManagerPeerClient.onNetworkChanged();":"window.TiqanyPeerSync&&window.TiqanyPeerSync.onNetworkChanged&&window.TiqanyPeerSync.onNetworkChanged();",null);});
    }
    /** Find only the advertised identity paired via QR or verified by encrypted sync. */
    private InetSocketAddress discover(String id){
        if(nsd==null||id==null||!id.matches("[a-f0-9]{32}"))return null;
        final String expected="TA-MAIN-"+id.substring(0,16);
        final CountDownLatch done=new CountDownLatch(1);
        final AtomicReference<InetSocketAddress> found=new AtomicReference<>();
        final AtomicBoolean resolving=new AtomicBoolean(false);
        WifiManager.MulticastLock lock=null;
        try {
            WifiManager wifi=(WifiManager)activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if(wifi!=null){lock=wifi.createMulticastLock("tiqany-peer-discovery");lock.setReferenceCounted(false);lock.acquire();}
        }catch(Exception ignored){}
        final WifiManager.MulticastLock held=lock;
        NsdManager.DiscoveryListener listener=new NsdManager.DiscoveryListener(){
            @Override public void onDiscoveryStarted(String type){}
            @Override public void onServiceFound(NsdServiceInfo info){
                if(!expected.equals(info.getServiceName())||!resolving.compareAndSet(false,true))return;
                try{nsd.resolveService(info,new NsdManager.ResolveListener(){
                    @Override public void onResolveFailed(NsdServiceInfo service,int error){resolving.set(false);}
                    @Override public void onServiceResolved(NsdServiceInfo service){
                        InetAddress host=service.getHost();
                        if(host!=null&&safeAddress(host.getHostAddress())&&service.getPort()>=1024&&service.getPort()<=65535){
                            found.set(new InetSocketAddress(host,service.getPort()));done.countDown();
                        }else resolving.set(false);
                    }
                });}catch(Exception ignored){resolving.set(false);}
            }
            @Override public void onServiceLost(NsdServiceInfo service){}
            @Override public void onDiscoveryStopped(String type){}
            @Override public void onStartDiscoveryFailed(String type,int error){done.countDown();}
            @Override public void onStopDiscoveryFailed(String type,int error){}
        };
        try{nsd.discoverServices(SERVICE_TYPE,NsdManager.PROTOCOL_DNS_SD,listener);
            done.await(DISCOVERY_SECONDS,TimeUnit.SECONDS);
        }catch(Exception ignored){}
        finally{try{nsd.stopServiceDiscovery(listener);}catch(Exception ignored){}
            try{if(held!=null&&held.isHeld())held.release();}catch(Exception ignored){}
        }
        return found.get();
    }
    private void bindToWifi(Socket socket){
        if(connectivity==null)return;
        try{for(Network network:connectivity.getAllNetworks()){
            NetworkCapabilities caps=connectivity.getNetworkCapabilities(network);
            if(caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)){
                network.bindSocket(socket);break;
            }
        }}catch(Exception ignored){}
    }
    @JavascriptInterface public void approve(){if(allowed())prefs.edit().putBoolean("approved",true).apply();}
    @JavascriptInterface public void reset(){if(allowed())prefs.edit().clear().apply();}
    @JavascriptInterface public void request(String raw){
        if(!allowed()||raw==null||raw.length()>9000000)return;
        if(!busy.compareAndSet(false,true)){sendReply("{\"ok\":false,\"error\":\"المزامنة قيد التنفيذ\"}");return;}
        io.execute(()->{try{
            String host=prefs.getString("host","");int port=prefs.getInt("port",0);String keyText=pairedKey();
            if(!safeAddress(host)||port<1024||keyText.isEmpty())throw new Exception("اضبط الاتصال بالكمبيوتر أولاً");
            byte[] key=Base64.getUrlDecoder().decode(keyText);
            if(key.length!=32)throw new Exception("مفتاح الاقتران غير صحيح");
            byte[] request=encrypt(key,raw);
            String serverId=prefs.getString("serverId","");
            // After Wi-Fi changes, discover the previously paired computer before trying old IP.
            InetSocketAddress discovered=networkChanged?discover(serverId):null;
            InetSocketAddress remembered=new InetSocketAddress(host,port);
            InetSocketAddress[] candidates=discovered==null
                ? new InetSocketAddress[]{remembered,discover(serverId)}
                : new InetSocketAddress[]{discovered,remembered};
            Exception failure=null;boolean succeeded=false;
            for(InetSocketAddress target:candidates){
                if(target==null||succeeded)continue;
                try(Socket sock=new Socket()){
                    bindToWifi(sock);
                    sock.connect(target,4500);sock.setSoTimeout(18500);
                    DataOutputStream out=new DataOutputStream(sock.getOutputStream());out.writeInt(request.length);out.write(request);out.flush();
                    DataInputStream in=new DataInputStream(sock.getInputStream());int size=in.readInt();
                    if(size<1||size>MAX_FRAME)throw new Exception("حجم الاستجابة غير صالح");
                    byte[] reply=new byte[size];in.readFully(reply);
                    String decoded=decrypt(key,reply);
                    // Only an authenticated reply may update the cached address.
                    if(!target.equals(remembered))prefs.edit().putString("host",target.getAddress().getHostAddress())
                        .putInt("port",target.getPort()).apply();
                    networkChanged=false;sendReply(decoded);succeeded=true;
                }catch(Exception ex){failure=ex;}
            }
            if(!succeeded)throw failure==null?new Exception("لم يُعثر على الكمبيوتر المقترن"):failure;
        }catch(Exception ex){
            JSONObject obj=new JSONObject();try{obj.put("ok",false);obj.put("error",ex.getMessage()==null?"تعذر الاتصال":ex.getMessage());}catch(Exception ignored){}
            sendReply(obj.toString());
        }finally{busy.set(false);}});
    }
    private static byte[] encrypt(byte[] key,String raw)throws Exception{
        byte[] iv=new byte[12];new SecureRandom().nextBytes(iv);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
        JSONObject packed=new JSONObject();packed.put("iv",Base64.getEncoder().encodeToString(iv));
        packed.put("data",Base64.getEncoder().encodeToString(cipher.doFinal(raw.getBytes(StandardCharsets.UTF_8))));
        byte[] b=packed.toString().getBytes(StandardCharsets.UTF_8);if(b.length>MAX_FRAME)throw new Exception("الطلب كبير جداً");return b;
    }
    private static String decrypt(byte[] key,byte[] packet)throws Exception{
        JSONObject packed=new JSONObject(new String(packet,StandardCharsets.UTF_8));
        byte[] iv=Base64.getDecoder().decode(packed.getString("iv"));byte[] bytes=Base64.getDecoder().decode(packed.getString("data"));
        if(iv.length!=12||bytes.length<16)throw new Exception("تعذر فك الرد");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
        return new String(cipher.doFinal(bytes),StandardCharsets.UTF_8);
    }
    private void sendReply(String json){
        activity.runOnUiThread(()->{if(!allowed())return;
            String quoted=JSONObject.quote(json);
            webView.evaluateJavascript((managerToManager?"window.__tiqanyManagerReply&&window.__tiqanyManagerReply(":"window.__tiqanyPeerReply&&window.__tiqanyPeerReply(")+quoted+");",null);
        });
    }
    public void close(){closed=true;
        try{if(wifiCallback!=null&&connectivity!=null)connectivity.unregisterNetworkCallback(wifiCallback);}catch(Exception ignored){}
        io.shutdownNow();}
}
