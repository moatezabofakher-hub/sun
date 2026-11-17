package com.sunshine.accounting;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.LinkProperties;
import android.net.LinkAddress;
import android.graphics.Bitmap;
import android.util.Base64;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Enumeration;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** 3.5.130: Dedicated, encrypted, full-duplex manager Android-to-Android LAN channel.
 * Uses a separate pairing secret and listener from employees and Windows.
 * All ledger authorization, business identity and conflict checks remain in JS.
 */
public final class MainManagerPeerSync {
    private static final String ORIGIN="https://appassets.androidplatform.net/assets/www/";
    private static final int PORT=49379;
    private static final int MAX_FRAME=12_000_000;
    private final Activity activity;
    private final WebView page;
    private final SharedPreferences prefs;
    private final ExecutorService io=Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String,ArrayBlockingQueue<String>> answers=new ConcurrentHashMap<>();
    private final AtomicBoolean connecting=new AtomicBoolean();
    private volatile ServerSocket listener;
    private volatile boolean trusted=false,closed=false;
    private volatile long lastServerRequest=0,lastClientSuccess=0;
    private final Object serverLock=new Object();
    // Pairing secrets are isolated for EACH independent business profile.
    // Switching the active business never exposes its ledger through another company's QR.
    private volatile String activeProfile="default";
    private String k(String field){return "profile:"+activeProfile+":"+field;}
    @JavascriptInterface public String selectProfile(String profileId){
        if(!allowed()||profileId==null||!profileId.matches("[A-Za-z0-9_-]{1,120}"))return "invalid";
        activeProfile=profileId;
        lastClientSuccess=0;lastServerRequest=0;
        return "selected";
    }
    public MainManagerPeerSync(Activity activity,WebView page){
        this.activity=activity;this.page=page;
        this.prefs=activity.getSharedPreferences("tiqany_manager_manager_pair",Context.MODE_PRIVATE);
    }
    public void onMainFrameUrlChanged(String url){trusted=url!=null&&url.startsWith(ORIGIN);}
    private boolean allowed(){return trusted&&!closed;}
    private String getServerId(){
        String id=prefs.getString(k("server_id"),"");
        if(id.matches("[a-f0-9]{32}"))return id;
        byte[] idBytes=new byte[16];new SecureRandom().nextBytes(idBytes);
        StringBuilder b=new StringBuilder();for(byte x:idBytes)b.append(String.format(java.util.Locale.ROOT,"%02x",x&255));
        id=b.toString();prefs.edit().putString(k("server_id"),id).commit();return id;
    }
    private String getServerKey()throws Exception {
        String raw=prefs.getString(k("server_key"),"");
        if(raw.startsWith("vault1:"))return DeviceVault.revealSecret(activity,"manager-peer-server",raw);
        byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);
        String key=Base64.encodeToString(bytes,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
        if(!prefs.edit().putString(k("server_key"),DeviceVault.protectSecret(activity,"manager-peer-server",key)).commit())
            throw new Exception("تعذر حفظ مفتاح أجهزة المدير");
        return key;
    }
    private String getClientKey()throws Exception{
        String raw=prefs.getString(k("client_key"),"");
        if(!raw.startsWith("vault1:"))throw new Exception("لم يتم اقتران جهاز مدير");
        return DeviceVault.revealSecret(activity,"manager-peer-client",raw);
    }
    private static byte[] keyBytes(String text)throws Exception{
        byte[] key=Base64.decode(text,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
        if(key.length!=32)throw new Exception("مفتاح الاتصال غير صحيح");
        return key;
    }
    private static boolean privateIP(String host){
        if(host==null||!host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))return false;
        try{InetAddress address=InetAddress.getByName(host);return address.isSiteLocalAddress()&&!address.isLoopbackAddress();}
        catch(Exception e){return false;}
    }
    /**
     * Prefer the active Wi-Fi network rather than the first IPv4 interface:
     * VPN tun and cellular interfaces may appear before wlan0 on Android.
     * An Android hotspot can have an IPv4 on wlan/ap without a registered Wi-Fi network,
     * so keep a Wi-Fi / hotspot interface fallback.
     */
    private String localIP(){
        try{
            ConnectivityManager conn=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);
            if(conn!=null)for(Network network:conn.getAllNetworks()){
                NetworkCapabilities caps=conn.getNetworkCapabilities(network);
                if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||
                   caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN))continue;
                LinkProperties props=conn.getLinkProperties(network);
                if(props==null)continue;
                for(LinkAddress link:props.getLinkAddresses()){
                    InetAddress ip=link.getAddress();
                    if(ip.getAddress().length==4&&ip.isSiteLocalAddress()&&!ip.isLoopbackAddress())
                        return ip.getHostAddress();
                }
            }
        }catch(Exception ignored){}
        String wiredFallback="";
        try{
            Enumeration<NetworkInterface> all=NetworkInterface.getNetworkInterfaces();
            while(all!=null&&all.hasMoreElements()){
                NetworkInterface net=all.nextElement();
                if(!net.isUp()||net.isLoopback()||net.isVirtual())continue;
                String name=net.getName().toLowerCase(java.util.Locale.ROOT);
                if(name.startsWith("tun")||name.startsWith("ppp")||name.startsWith("rmnet")||
                   name.startsWith("ccmni")||name.startsWith("v4-")||name.startsWith("ipsec")||
                   name.startsWith("clat")||name.startsWith("dummy"))continue;
                for(InetAddress ip:Collections.list(net.getInetAddresses())){
                    if(ip.getAddress().length!=4||!ip.isSiteLocalAddress()||ip.isLoopbackAddress())continue;
                    if(name.startsWith("wlan")||name.startsWith("swlan")||
                       name.startsWith("ap")||name.startsWith("wifi"))
                        return ip.getHostAddress();
                    if(wiredFallback.isEmpty()&&(name.startsWith("eth")||
                        name.startsWith("en")||name.startsWith("rndis")||name.startsWith("usb")))
                        wiredFallback=ip.getHostAddress();
                }
            }
        }catch(Exception ignored){}
        return wiredFallback;
    }
    private void js(String call){
        activity.runOnUiThread(()->{if(allowed())page.evaluateJavascript(call,null);});
    }
    private static byte[] crypt(byte[] key,String raw)throws Exception{
        byte[] iv=new byte[12];new SecureRandom().nextBytes(iv);
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
        JSONObject p=new JSONObject();
        p.put("iv",Base64.encodeToString(iv,Base64.NO_WRAP));
        p.put("data",Base64.encodeToString(c.doFinal(raw.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        byte[] bytes=p.toString().getBytes(StandardCharsets.UTF_8);
        if(bytes.length>MAX_FRAME)throw new Exception("حجم الطلب كبير");
        return bytes;
    }
    private static String decrypt(byte[] key,byte[] bytes)throws Exception{
        JSONObject p=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
        byte[] iv=Base64.decode(p.getString("iv"),Base64.DEFAULT);
        byte[] data=Base64.decode(p.getString("data"),Base64.DEFAULT);
        if(iv.length!=12||data.length<16)throw new Exception("رسالة مشفّرة غير صالحة");
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
        return new String(c.doFinal(data),StandardCharsets.UTF_8);
    }
    private void serve(Socket socket){
        try(Socket client=socket){
            if(!client.getInetAddress().isSiteLocalAddress())return;
            client.setSoTimeout(24000);
            DataInputStream in=new DataInputStream(client.getInputStream());
            int size=in.readInt();if(size<1||size>MAX_FRAME)return;
            byte[] encrypted=new byte[size];in.readFully(encrypted);
            String payload=decrypt(keyBytes(getServerKey()),encrypted);
            JSONObject command=new JSONObject(payload);
            if(!"TIQANY-MANAGER-1".equals(command.optString("protocol")))return;
            String id=UUID.randomUUID().toString();
            ArrayBlockingQueue<String> queue=new ArrayBlockingQueue<>(1);
            answers.put(id,queue);
            try{
                lastServerRequest=System.currentTimeMillis();
                JSONObject req=new JSONObject().put("requestId",id).put("data",command);
                js("window.TiqanyManagerSync&&window.TiqanyManagerSync.onNativeRequest("+JSONObject.quote(req.toString())+");");
                String reply=queue.poll(20,java.util.concurrent.TimeUnit.SECONDS);
                if(reply==null)reply="{\"ok\":false,\"error\":\"انتهت مهلة الاستجابة\"}";
                byte[] out=crypt(keyBytes(getServerKey()),reply);
                DataOutputStream stream=new DataOutputStream(client.getOutputStream());
                stream.writeInt(out.length);stream.write(out);stream.flush();
            }finally{answers.remove(id);}
        }catch(Exception ignored){}
    }
    @JavascriptInterface public String start(){
        if(!allowed())return "invalid";
        synchronized(serverLock){
            if(listener!=null&&!listener.isClosed())return "ready";
            try{
                getServerId();getServerKey();
                final ServerSocket server=new ServerSocket();
                server.setReuseAddress(true);
                server.bind(new InetSocketAddress(PORT));
                listener=server;
                io.execute(()->{
                    while(!closed&&!server.isClosed()){
                        try{Socket accepted=server.accept();io.execute(()->serve(accepted));}
                        catch(Exception e){if(!server.isClosed())try{Thread.sleep(250);}catch(InterruptedException ignored){}}
                    }
                });
                return "ready";
            }catch(Exception e){return "error: "+e.getMessage();}
        }
    }
    @JavascriptInterface public String serverConfig(){
        if(!allowed())return "{}";
        try{
            JSONObject info=new JSONObject();
            info.put("serverId",getServerId());
            info.put("host",localIP());
            info.put("port",PORT);
            info.put("key",getServerKey());
            info.put("ready",listener!=null&&!listener.isClosed());
            info.put("lastInbound",lastServerRequest);
            return info.toString();
        }catch(Exception e){return "{}";}
    }
    @JavascriptInterface public String pairingQr(){
        if(!allowed())return "";
        try{
            if(listener==null||listener.isClosed())start();
            JSONObject c=new JSONObject(serverConfig());
            if(!c.optBoolean("ready")||!privateIP(c.optString("host")))return "";
            JSONObject qr=new JSONObject();
            qr.put("type","tiqany-manager-main");qr.put("v",1);qr.put("host",c.getString("host"));
            qr.put("port",c.getInt("port"));qr.put("key",c.getString("key"));qr.put("serverId",c.getString("serverId"));
            BitMatrix bits=new MultiFormatWriter().encode(qr.toString(),BarcodeFormat.QR_CODE,490,490);
            Bitmap bitmap=Bitmap.createBitmap(490,490,Bitmap.Config.ARGB_8888);
            for(int y=0;y<490;y++)for(int x=0;x<490;x++)bitmap.setPixel(x,y,bits.get(x,y)?0xff102b43:0xffffffff);
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();
            return "data:image/png;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
        }catch(Exception e){return "";}
    }
    @JavascriptInterface public void reply(String requestId,String json){
        if(!allowed()||requestId==null||json==null||json.length()>9000000)return;
        ArrayBlockingQueue<String> q=answers.get(requestId);if(q!=null)q.offer(json);
    }
    @JavascriptInterface public String clientConfigure(String host,int port,String key,String id){
        if(!allowed()||!privateIP(host)||port<1024||port>65535||key==null||!key.matches("[A-Za-z0-9_-]{43}")||
            id==null||!id.matches("[a-f0-9]{32}"))return "invalid";
        try{
            keyBytes(key);
            String sealed=DeviceVault.protectSecret(activity,"manager-peer-client",key);
            if(!prefs.edit().putString(k("host"),host).putInt(k("port"),port)
                .putString(k("client_key"),sealed).putString(k("client_id"),id).putBoolean(k("approved"),false).commit())return "error";
            return "saved";
        }catch(Exception e){return "error";}
    }
    @JavascriptInterface public String clientStatus(){
        if(!allowed())return "{}";
        try{
            JSONObject o=new JSONObject();
            o.put("host",prefs.getString(k("host"),""));
            o.put("port",prefs.getInt(k("port"),0));
            o.put("serverId",prefs.getString(k("client_id"),""));
            o.put("approved",prefs.getBoolean(k("approved"),false));
            o.put("lastClientSuccess",lastClientSuccess);
            o.put("lastInbound",lastServerRequest);
            return o.toString();
        }catch(Exception e){return "{}";}
    }
    @JavascriptInterface public void clientApprove(){if(allowed())prefs.edit().putBoolean(k("approved"),true).apply();}
    @JavascriptInterface public void clientUnlink(){
        if(allowed())prefs.edit().remove(k("host")).remove(k("port")).remove(k("client_key")).remove(k("client_id")).remove(k("approved")).apply();
    }
    @JavascriptInterface public void clientRequest(String raw){
        if(!allowed()||raw==null||raw.length()>9000000)return;
        if(!connecting.compareAndSet(false,true)){sendClientReply("{\"ok\":false,\"error\":\"مزامنة أخرى قيد التنفيذ\"}");return;}
        io.execute(()->{
            try{
                String host=prefs.getString(k("host"),""),key=getClientKey();
                int port=prefs.getInt(k("port"),0);
                if(!privateIP(host)||port<1024)throw new Exception("لم يتم إعداد جهاز المدير");
                byte[] request=crypt(keyBytes(key),raw);
                try(Socket sock=new Socket()){
                    // Follow Wi-Fi even if mobile data is the Android default network.
                    ConnectivityManager conn=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);
                    if(conn!=null)for(Network network:conn.getAllNetworks()){
                        NetworkCapabilities caps=conn.getNetworkCapabilities(network);
                        if(caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)){
                            network.bindSocket(sock);break;
                        }
                    }
                    sock.connect(new InetSocketAddress(host,port),4500);sock.setSoTimeout(23500);
                    DataOutputStream out=new DataOutputStream(sock.getOutputStream());out.writeInt(request.length);out.write(request);out.flush();
                    DataInputStream in=new DataInputStream(sock.getInputStream());
                    int count=in.readInt();if(count<1||count>MAX_FRAME)throw new Exception("استجابة مزامنة غير صالحة");
                    byte[] response=new byte[count];in.readFully(response);
                    String answer=decrypt(keyBytes(key),response);
                    lastClientSuccess=System.currentTimeMillis();sendClientReply(answer);
                }
            }catch(Exception e){
                String msg=String.valueOf(e.getMessage());
                try{sendClientReply(new JSONObject().put("ok",false).put("error",msg).toString());}
                catch(Exception ignored){}
            }finally{connecting.set(false);}
        });
    }
    private void sendClientReply(String reply){
        js("window.__tiqanyManagerReply&&window.__tiqanyManagerReply("+JSONObject.quote(reply)+");");
    }
    @JavascriptInterface public void resetAll(){
        if(!allowed())return;
        synchronized(serverLock){
            try{if(listener!=null)listener.close();}catch(Exception ignored){}
            listener=null;prefs.edit().clear().commit();
            lastClientSuccess=0;lastServerRequest=0;
        }
    }
    public void close(){
        closed=true;
        synchronized(serverLock){try{if(listener!=null)listener.close();}catch(Exception ignored){}}
        io.shutdownNow();
    }
}
