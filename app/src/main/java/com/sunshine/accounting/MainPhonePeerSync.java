package com.sunshine.accounting;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
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
    private final Activity activity;
    private final WebView webView;
    private final SharedPreferences prefs;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy=new AtomicBoolean(false);
    private volatile boolean trusted=false;
    private volatile boolean closed=false;
    public MainPhonePeerSync(Activity activity,WebView webView){
        this.activity=activity;this.webView=webView;
        this.prefs=activity.getSharedPreferences("tiqany_main_peer_link",Context.MODE_PRIVATE);
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
        prefs.edit().putString("host",host).putInt("port",port).putString("key",key).putBoolean("approved",false).apply();
        return "saved";
    }
    @JavascriptInterface public String status(){
        if(!allowed())return "{}";
        try {JSONObject v=new JSONObject();v.put("host",prefs.getString("host",""));v.put("port",prefs.getInt("port",0));v.put("approved",prefs.getBoolean("approved",false));return v.toString();}
        catch(Exception ignored){return "{}";}
    }
    @JavascriptInterface public void approve(){if(allowed())prefs.edit().putBoolean("approved",true).apply();}
    @JavascriptInterface public void reset(){if(allowed())prefs.edit().clear().apply();}
    @JavascriptInterface public void request(String raw){
        if(!allowed()||raw==null||raw.length()>9000000)return;
        if(!busy.compareAndSet(false,true)){sendReply("{\"ok\":false,\"error\":\"المزامنة قيد التنفيذ\"}");return;}
        io.execute(()->{try{
            String host=prefs.getString("host","");int port=prefs.getInt("port",0);String keyText=prefs.getString("key","");
            if(!safeAddress(host)||port<1024||keyText.isEmpty())throw new Exception("اضبط الاتصال بالكمبيوتر أولاً");
            byte[] key=Base64.getUrlDecoder().decode(keyText);
            if(key.length!=32)throw new Exception("مفتاح الاقتران غير صحيح");
            byte[] request=encrypt(key,raw);
            try(Socket sock=new Socket()){
                sock.connect(new InetSocketAddress(host,port),5500);sock.setSoTimeout(22000);
                DataOutputStream out=new DataOutputStream(sock.getOutputStream());out.writeInt(request.length);out.write(request);out.flush();
                DataInputStream in=new DataInputStream(sock.getInputStream());int size=in.readInt();
                if(size<1||size>MAX_FRAME)throw new Exception("حجم الاستجابة غير صالح");
                byte[] reply=new byte[size];in.readFully(reply);
                sendReply(decrypt(key,reply));
            }
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
            webView.evaluateJavascript("window.__tiqanyPeerReply&&window.__tiqanyPeerReply("+quoted+");",null);
        });
    }
    public void close(){closed=true;io.shutdownNow();}
}
