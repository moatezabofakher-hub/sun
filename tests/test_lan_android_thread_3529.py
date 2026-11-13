#!/usr/bin/env python3
"""Regression: @JavascriptInterface methods cannot read WebView.getUrl() off UI thread."""
from pathlib import Path
import re, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
for module in ('app','field_agent'):
    base=root/module/'src/main/java/com/sunshine/accounting'
    bridge=(base/'NativeLocalSync.java').read_text('utf-8')
    activity=(base/'MainActivity.java').read_text('utf-8')
    assert 'webView.getUrl()' not in re.sub(r'(?m)^\s*//.*$', '', bridge),module
    assert 'private volatile boolean trustedMainFrame = false' in bridge
    assert 'nativeLocalSync.onMainFrameUrlChanged(url);' in activity
    assert 'public void onPageStarted(' in activity and 'public void onPageFinished(' in activity
    assert 'private boolean isTrustedPage()' in bridge
    assert 'return trustedMainFrame && !closing' in bridge
print('PASS: both app modules cache trusted WebView main-frame URL on UI thread')

stub={
'android/content/Context.java': 'package android.content; public class Context {public static final String NSD_SERVICE="nsd",WIFI_SERVICE="wifi"; public Object getSystemService(String n){if(n.equals(NSD_SERVICE))return new android.net.nsd.NsdManager();if(n.equals(WIFI_SERVICE))return new android.net.wifi.WifiManager();return null;} public Context getApplicationContext(){return this;} }',
'android/app/Activity.java':'package android.app;public class Activity extends android.content.Context {public void runOnUiThread(Runnable r){r.run();}}',
'android/os/Build.java':'package android.os;public class Build {public static class VERSION{public static final int SDK_INT=35;}}',
'android/os/Looper.java':'package android.os; public class Looper {private static final Thread MAIN=Thread.currentThread();private static final Looper INSTANCE=new Looper();public static Looper myLooper(){return Thread.currentThread()==MAIN?INSTANCE:null;}public static Looper getMainLooper(){return INSTANCE;}}',
'android/webkit/WebView.java': 'package android.webkit;public class WebView {public String getUrl(){throw new IllegalStateException("getUrl must not be called by JavaBridge");}public void evaluateJavascript(String js,Object cb){} }',
'android/webkit/JavascriptInterface.java':'package android.webkit;import java.lang.annotation.*;@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) public @interface JavascriptInterface {}',
'android/net/wifi/WifiManager.java':'package android.net.wifi;public class WifiManager{public static class MulticastLock {public void setReferenceCounted(boolean b){}public void acquire(){}public void release(){}public boolean isHeld(){return false;}}public MulticastLock createMulticastLock(String n){return new MulticastLock();}}',
'android/net/nsd/NsdServiceInfo.java':'package android.net.nsd;import java.net.InetAddress;public class NsdServiceInfo{private String name;private int port;public void setServiceType(String s){}public void setServiceName(String s){name=s;}public void setPort(int p){port=p;}public String getServiceName(){return name;}public int getPort(){return port;}public InetAddress getHost(){return null;}}',
'android/net/nsd/NsdManager.java':'package android.net.nsd;public class NsdManager{public static final int PROTOCOL_DNS_SD=1;public interface RegistrationListener{void onServiceRegistered(NsdServiceInfo s);void onRegistrationFailed(NsdServiceInfo s,int c);void onServiceUnregistered(NsdServiceInfo s);void onUnregistrationFailed(NsdServiceInfo s,int c);}public interface DiscoveryListener{void onDiscoveryStarted(String s);void onServiceFound(NsdServiceInfo n);void onServiceLost(NsdServiceInfo n);void onDiscoveryStopped(String s);void onStartDiscoveryFailed(String s,int c);void onStopDiscoveryFailed(String s,int c);}public interface ResolveListener{void onResolveFailed(NsdServiceInfo i,int c);void onServiceResolved(NsdServiceInfo s);}public void registerService(NsdServiceInfo i,int p,RegistrationListener l){l.onServiceRegistered(i);}public void unregisterService(RegistrationListener l){}public void discoverServices(String s,int p,DiscoveryListener l){l.onStartDiscoveryFailed(s,0);}public void stopServiceDiscovery(DiscoveryListener l){}public void resolveService(NsdServiceInfo i,ResolveListener l){} }',
'org/json/JSONObject.java':'package org.json;public class JSONObject{public JSONObject(){}public JSONObject put(String k,String v){return this;}public static String quote(String v){return "\\\""+v+"\\\"";}public String toString(){return "{}";}}',
'com/sunshine/accounting/Regression.java':'''package com.sunshine.accounting;
public class Regression {
  public static void main(String[] ignored) throws Exception {
    // The main thread initializes the trusted UI origin.
    android.app.Activity a = new android.app.Activity();
    android.webkit.WebView v = new android.webkit.WebView();
    NativeLocalSync manager = new NativeLocalSync(a,v,true);
    NativeLocalSync agent = new NativeLocalSync(a,v,false);
    String company = "company_abcdefgh1234";
    // Don't permit unexpected origin.
    manager.onMainFrameUrlChanged("https://evil.example.com/path");
    if(!"invalid".equals(manager.startReceiver(company)))throw new AssertionError("Origin check missing");
    manager.onMainFrameUrlChanged("https://appassets.androidplatform.net/assets/www/index.html");
    agent.onMainFrameUrlChanged("https://appassets.androidplatform.net/assets/www/index.html");
    final java.util.concurrent.atomic.AtomicReference<Throwable> error = new java.util.concurrent.atomic.AtomicReference<>();
    Thread t = new Thread(() -> {
        try {
            if(!"starting".equals(manager.startReceiver(company))) throw new AssertionError("Receiver did not start");
            manager.reply("42","{}");
            agent.send(company,"{}");
        } catch(Throwable ex) {error.set(ex);}
    },"JavaBridge");
    t.start();t.join(3000);
    if(t.isAlive())throw new AssertionError("JavaBridge blocked");
    if(error.get()!=null)throw new AssertionError("JavaBridge threw",error.get());
    agent.destroy();manager.destroy();
    System.out.println("PASS: UI-origin cache; receiver/send callable from JavaBridge thread without WebView.getUrl");
  }
}''',
}
for module in ['app','field_agent']:
    with tempfile.TemporaryDirectory() as temp:
        d=Path(temp)
        for name,source in stub.items():
            p=d/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source,'utf-8')
        bridge=root/module/'src/main/java/com/sunshine/accounting/NativeLocalSync.java'
        cmd=['javac','-d',str(d/'classes'),*[str(p) for p in d.rglob('*.java')],str(bridge)]
        x=subprocess.run(cmd,capture_output=True,text=True,timeout=20)
        assert x.returncode==0,(module,x.stderr)
        x=subprocess.run(['java','-cp',str(d/'classes'),'com.sunshine.accounting.Regression'],capture_output=True,text=True,timeout=20)
        assert x.returncode==0,(module,x.stderr,x.stdout)
        print(module,x.stdout.strip())
