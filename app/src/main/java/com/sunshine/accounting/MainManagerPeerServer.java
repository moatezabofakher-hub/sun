package com.sunshine.accounting;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Encrypted Wi-Fi receiver for manager-to-manager peer synchronization.
 * Receives ciphertext only. All ledger validation and authorization are performed
 * by TiqanyManagerPeerServer in the trusted WebView, never in this transport.
 */
public final class MainManagerPeerServer {
    private static final String ORIGIN="https://appassets.androidplatform.net/assets/www/";
    private static final int LIMIT=12000000;
    private final Activity activity;
    private final WebView webView;
    private final SharedPreferences prefs;
    private final ExecutorService workers=Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String,ArrayBlockingQueue<String>> answers=new ConcurrentHashMap<>();
    private final SecureRandom random=new SecureRandom();
    private volatile boolean trusted=false,closed=false;
    private volatile ServerSocket listener;
    private volatile NsdManager.RegistrationListener registration;
    private final NsdManager nsd;
    private volatile String serverId;
    private volatile String secret;

    public MainManagerPeerServer(Activity activity,WebView view){
        this.activity=activity;this.webView=view;
        this.prefs=activity.getSharedPreferences("tiqany_manager_phone_server",Context.MODE_PRIVATE);
        nsd=(NsdManager)activity.getSystemService(Context.NSD_SERVICE);
        serverId=prefs.getString("serverId","");
        if(!serverId.matches("[a-f0-9]{32}")){
            byte[] id=new byte[16];random.nextBytes(id);
            StringBuilder b=new StringBuilder();for(byte v:id)b.append(String.format(java.util.Locale.ROOT,"%02x",v&255));
            serverId=b.toString();prefs.edit().putString("serverId",serverId).apply();
        }
    }
    public void onMainFrameUrlChanged(String url){trusted=url!=null&&url.startsWith(ORIGIN);}
    private boolean allowed(){return trusted&&!closed;}
    private String key(){
        if(secret!=null)return secret;
        synchronized(this){
            if(secret!=null)return secret;
            try {
                String enc=prefs.getString("key","");
                if(enc.startsWith("vault1:"))secret=DeviceVault.revealSecret(activity,"manager-phone-server",enc);
                if(secret==null||!secret.matches("[A-Za-z0-9_-]{43}")){
                    byte[] bytes=new byte[32];random.nextBytes(bytes);
                    secret=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
                    String protectedKey=DeviceVault.protectSecret(activity,"manager-phone-server",secret);
                    if(!prefs.edit().putString("key",protectedKey).commit())throw new IOException("تعذر تأمين رمز الاقتران");
                }
                return secret;
            }catch(Exception ex){return null;}
        }
    }
    private void callJS(String js){
        activity.runOnUiThread(()->{
            if(allowed())webView.evaluateJavascript(js,null);
        });
    }
    private void notifyStatus(String text){
        callJS("window.TiqanyManagerPeerServer&&window.TiqanyManagerPeerServer.onServerStatus("+JSONObject.quote(text)+");");
    }
    private static List<String> localIPs(){
        ArrayList<String> ips=new ArrayList<>();
        try{
            Enumeration<NetworkInterface> all=NetworkInterface.getNetworkInterfaces();
            while(all.hasMoreElements()){
                NetworkInterface iface=all.nextElement();
                if(!iface.isUp()||iface.isLoopback())continue;
                for(InetAddress ip:Collections.list(iface.getInetAddresses()))
                    if(ip.getAddress().length==4&&ip.isSiteLocalAddress()&&!ip.isLoopbackAddress())ips.add(ip.getHostAddress());
            }
        }catch(Exception ignored){}
        return ips;
    }
    @JavascriptInterface public String config(){
        if(!allowed())return "{}";
        try{
            start();
            JSONObject j=new JSONObject();
            j.put("serverId",serverId);
            j.put("key",key()==null?"":key());
            j.put("ready",listener!=null&&!listener.isClosed());
            j.put("port",listener==null?0:listener.getLocalPort());
            j.put("ips",new org.json.JSONArray(localIPs()));
            return j.toString();
        }catch(Exception e){return "{}";}
    }
    @JavascriptInterface public boolean reply(String id,String json){
        if(!allowed()||id==null||json==null||json.length()>11000000)return false;
        ArrayBlockingQueue<String> queue=answers.get(id);
        return queue!=null&&queue.offer(json);
    }
    private synchronized void start(){
        if(closed||!allowed()||key()==null||(listener!=null&&!listener.isClosed()))return;
        workers.execute(()->{
            try{
                ServerSocket server=new ServerSocket(0);server.setSoTimeout(1000);
                synchronized(this){
                    if(closed){server.close();return;}
                    listener=server;
                }
                if(nsd!=null){
                    NsdServiceInfo info=new NsdServiceInfo();
                    info.setServiceType("_tiqanymain._tcp.");
                    info.setServiceName("TA-MAIN-"+serverId.substring(0,16));
                    info.setPort(server.getLocalPort());
                    registration=new NsdManager.RegistrationListener(){
                        public void onServiceRegistered(NsdServiceInfo s){notifyStatus("ready");}
                        public void onRegistrationFailed(NsdServiceInfo s,int code){notifyStatus("ready-no-mdns");}
                        public void onServiceUnregistered(NsdServiceInfo s){}
                        public void onUnregistrationFailed(NsdServiceInfo s,int code){}
                    };
                    try{nsd.registerService(info,NsdManager.PROTOCOL_DNS_SD,registration);}
                    catch(Exception ignored){notifyStatus("ready-no-mdns");}
                }
                notifyStatus("ready");
                while(!closed&&!server.isClosed()){
                    try{Socket socket=server.accept();workers.execute(()->serve(socket));}
                    catch(SocketTimeoutException ignored){}
                }
            }catch(Exception e){notifyStatus("receiver-error");}
        });
    }
    private byte[] encrypt(String raw)throws Exception{
        byte[] iv=new byte[12];random.nextBytes(iv);
        byte[] keyBytes=Base64.getUrlDecoder().decode(key());
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(keyBytes,"AES"),new GCMParameterSpec(128,iv));
        JSONObject packet=new JSONObject();
        packet.put("iv",Base64.getEncoder().encodeToString(iv));
        packet.put("data",Base64.getEncoder().encodeToString(cipher.doFinal(raw.getBytes(StandardCharsets.UTF_8))));
        return packet.toString().getBytes(StandardCharsets.UTF_8);
    }
    private String decrypt(byte[] raw)throws Exception{
        JSONObject packet=new JSONObject(new String(raw,StandardCharsets.UTF_8));
        byte[] iv=Base64.getDecoder().decode(packet.getString("iv"));
        byte[] blob=Base64.getDecoder().decode(packet.getString("data"));
        if(iv.length!=12||blob.length<16)throw new IOException("تشفير غير صالح");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(Base64.getUrlDecoder().decode(key()),"AES"),new GCMParameterSpec(128,iv));
        return new String(cipher.doFinal(blob),StandardCharsets.UTF_8);
    }
    private void serve(Socket socket){
        try(Socket s=socket){
            s.setSoTimeout(25000);
            DataInputStream input=new DataInputStream(s.getInputStream());
            DataOutputStream output=new DataOutputStream(s.getOutputStream());
            int length=input.readInt();if(length<1||length>LIMIT)throw new IOException("حجم غير صالح");
            byte[] bytes=new byte[length];input.readFully(bytes);
            String message=decrypt(bytes);
            JSONObject parsed=new JSONObject(message);
            String requestId=UUID.randomUUID().toString();
            ArrayBlockingQueue<String> queue=new ArrayBlockingQueue<>(1);
            answers.put(requestId,queue);
            try{
                JSONObject request=new JSONObject();request.put("requestId",requestId);
                request.put("data",parsed);
                callJS("window.TiqanyManagerPeerServer&&window.TiqanyManagerPeerServer.handleRequest("+request.toString()+");");
                String result=queue.poll(23,TimeUnit.SECONDS);
                if(result==null)result="{\"ok\":false,\"error\":\"انتهت مهلة رد المدير\"}";
                byte[] encoded=encrypt(result);
                if(encoded.length>LIMIT)throw new IOException("حجم الرد كبير");
                output.writeInt(encoded.length);output.write(encoded);output.flush();
            }finally{answers.remove(requestId);}
        }catch(Exception ignored){}
    }
    public synchronized void close(){
        closed=true;
        if(listener!=null){try{listener.close();}catch(Exception ignored){}listener=null;}
        if(registration!=null&&nsd!=null){try{nsd.unregisterService(registration);}catch(Exception ignored){}registration=null;}
        workers.shutdownNow();
    }
}
