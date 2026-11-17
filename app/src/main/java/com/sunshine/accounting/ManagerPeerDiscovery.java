package com.sunshine.accounting;

import android.app.Activity;
import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Local DNS-SD discovery: advertises only device identity, never an encryption key. */
final class ManagerPeerDiscovery {
    private static final String TYPE="_tiqanymgr._tcp.";
    private final Activity activity;
    private final NsdManager nsd;
    private NsdManager.RegistrationListener registration;
    private String published="";
    private String publishedHost="";
    ManagerPeerDiscovery(Activity activity){
        this.activity=activity;
        this.nsd=(NsdManager)activity.getSystemService(Context.NSD_SERVICE);
    }
    private static boolean identity(String id){return id!=null&&id.matches("[a-f0-9]{32}");}
    private static String name(String id){return "TA-MGR-"+id;}
    synchronized void advertise(String id,int port,String host){
        if(nsd==null||!identity(id)||port<1024||host==null||host.isEmpty())return;
        if(registration!=null&&id.equals(published)&&host.equals(publishedHost))return;
        stop();
        published=id;publishedHost=host;
        NsdServiceInfo info=new NsdServiceInfo();
        info.setServiceName(name(id));info.setServiceType(TYPE);info.setPort(port);
        NsdManager.RegistrationListener reg=new NsdManager.RegistrationListener(){
            @Override public void onRegistrationFailed(NsdServiceInfo service,int error){
                synchronized(ManagerPeerDiscovery.this){
                    if(registration==this){registration=null;published="";publishedHost="";}
                }
            }
            @Override public void onUnregistrationFailed(NsdServiceInfo service,int error){}
            @Override public void onServiceRegistered(NsdServiceInfo service){}
            @Override public void onServiceUnregistered(NsdServiceInfo service){}
        };
        try{nsd.registerService(info,NsdManager.PROTOCOL_DNS_SD,reg);registration=reg;}
        catch(Exception ignored){published="";publishedHost="";}
    }
    synchronized void stop(){
        if(registration!=null&&nsd!=null)try{nsd.unregisterService(registration);}catch(Exception ignored){}
        registration=null;published="";publishedHost="";
    }
    /** Bounded discovery pass. The caller independently authenticates the address. */
    InetSocketAddress find(String expectedId){
        if(nsd==null||!identity(expectedId))return null;
        AtomicReference<InetSocketAddress> result=new AtomicReference<>();
        AtomicBoolean resolving=new AtomicBoolean(false);
        CountDownLatch found=new CountDownLatch(1);
        WifiManager.MulticastLock multicast=null;
        try{
            WifiManager wifi=(WifiManager)activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if(wifi!=null){multicast=wifi.createMulticastLock("tiqany-manager-discovery");
                multicast.setReferenceCounted(false);multicast.acquire();}
        }catch(Exception ignored){}
        final NsdManager.DiscoveryListener search=new NsdManager.DiscoveryListener(){
            @Override public void onDiscoveryStarted(String type){}
            @Override public void onServiceFound(NsdServiceInfo info){
                if(!name(expectedId).equals(info.getServiceName())||!resolving.compareAndSet(false,true))return;
                try{nsd.resolveService(info,new NsdManager.ResolveListener(){
                    @Override public void onResolveFailed(NsdServiceInfo value,int error){resolving.set(false);}
                    @Override public void onServiceResolved(NsdServiceInfo value){
                        InetAddress addr=value.getHost();
                        if(addr!=null&&addr.getAddress().length==4&&addr.isSiteLocalAddress()
                             &&value.getPort()>=1024&&value.getPort()<=65535){
                            result.set(new InetSocketAddress(addr,value.getPort()));found.countDown();
                        }else resolving.set(false);
                    }
                });}catch(Exception ignored){resolving.set(false);}
            }
            @Override public void onServiceLost(NsdServiceInfo info){}
            @Override public void onDiscoveryStopped(String type){}
            @Override public void onStartDiscoveryFailed(String type,int error){found.countDown();}
            @Override public void onStopDiscoveryFailed(String type,int error){}
        };
        try{nsd.discoverServices(TYPE,NsdManager.PROTOCOL_DNS_SD,search);
            found.await(4500,TimeUnit.MILLISECONDS);
        }catch(Exception ignored){}
        finally{
            try{nsd.stopServiceDiscovery(search);}catch(Exception ignored){}
            if(multicast!=null)try{if(multicast.isHeld())multicast.release();}catch(Exception ignored){}
        }
        return result.get();
    }
}
