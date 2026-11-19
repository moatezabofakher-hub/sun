package com.sunshine.accounting;

import android.net.Network;
import java.net.*;
import java.util.*;
import java.lang.reflect.Method;

public final class EmployeeHotspotRegression {
    static InetAddress ip(String value) throws Exception { return InetAddress.getByName(value); }
    static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
    public static void main(String[] args) throws Exception {
        Network uplink = new Network();
        EmployeeLanRoute<Network> wifi = new EmployeeLanRoute<>(ip("192.168.1.30"), 24, uplink);
        EmployeeLanRoute<Network> hotspot = new EmployeeLanRoute<>(ip("192.168.10.1"), 24, null);
        List<EmployeeLanRoute<Network>> both = Arrays.asList(wifi, hotspot);
        check(EmployeeLanRoute.forPeer(both, ip("192.168.10.76")) == hotspot, "upstream Wi-Fi hijacked phone hotspot");
        check(EmployeeLanRoute.forPeer(both, ip("192.168.1.76")) == wifi, "ordinary Wi-Fi lost");
        check(EmployeeLanRoute.forPeer(Collections.singletonList(hotspot), ip("192.168.10.76")) == hotspot, "mobile data with hotspot");
        check(EmployeeLanRoute.forPeer(both, ip("192.168.100.2")) == null, "stale QR pinned to unrelated interface");
        EmployeeLanRoute<Network> narrow = new EmployeeLanRoute<>(ip("192.168.10.65"), 26, null);
        check(EmployeeLanRoute.forPeer(Arrays.asList(hotspot,narrow), ip("192.168.10.126")) == narrow, "specific prefix");
        check(EmployeeLanRoute.forPeer(Arrays.asList(narrow,hotspot), ip("192.168.10.128")) == hotspot, "prefix boundary");
        check(EmployeeLanRoute.forPeer(Arrays.asList(new EmployeeLanRoute<>(ip("10.0.0.1"),0,null)),ip("192.168.10.76"))==null,"unknown prefix bound");
        for(String name : Arrays.asList("swlan0","wlan1","ap0","ap_br_wlan2","softap0","br-wlan0"))
            check(EmployeeLanRoute.isWifiInterface(name), name);
        for(String name : Arrays.asList("tun0","wg0","rmnet_data0","lo","v4-rmnet0"))
            check(!EmployeeLanRoute.isWifiInterface(name), name);
        // Exercise the same pre-connect socket binding used for onboarding and verified sync.
        Method bind = NativeLocalSync.class.getDeclaredMethod("bindLocal", Socket.class, EmployeeLanRoute.class);
        bind.setAccessible(true);
        EmployeeLanRoute<Network> tether = new EmployeeLanRoute<>(ip("127.0.0.2"),8,null);
        try (ServerSocket pc = new ServerSocket(0,1,ip("127.0.0.1")); Socket phone = new Socket()) {
            InetSocketAddress peer = new InetSocketAddress(pc.getInetAddress(),pc.getLocalPort());
            bind.invoke(null,phone,EmployeeLanRoute.forPeer(Arrays.asList(wifi,tether),peer.getAddress()));
            phone.connect(peer,1500); pc.setSoTimeout(1500);
            try (Socket inbound = pc.accept()) {
                check(inbound.getInetAddress().equals(tether.address), "receiver saw the wrong source");
                phone.getOutputStream().write(42); inbound.setSoTimeout(1500);
                check(inbound.getInputStream().read()==42, "local TCP delivery");
            }
        }
        try(Socket phone = new Socket()){
            bind.invoke(null,phone,EmployeeLanRoute.forPeer(both,ip("10.30.1.9")));
            check(!phone.isBound(),"OS must select the route when the prefix is unknown");
            bind.invoke(null,phone,EmployeeLanRoute.forPeer(both,ip("192.168.1.76")));
            check(uplink.lastSocket==phone,"matching Android Wi-Fi Network was not selected");
        }
        System.out.println("PASS employee hotspot, shared Wi-Fi, normal Wi-Fi, stale target, interface filtering and real TCP source");
    }
}
