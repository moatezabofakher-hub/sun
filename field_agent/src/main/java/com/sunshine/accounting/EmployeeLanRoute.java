package com.sunshine.accounting;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.List;

/** One assigned LAN address with its actual prefix. A tether interface may have no Android Network. */
final class EmployeeLanRoute<T> {
    final InetAddress address;
    final int prefix;
    final T network;

    EmployeeLanRoute(InetAddress address, int prefix, T network) {
        this.address = address;
        this.prefix = prefix;
        this.network = network;
    }

    static boolean isWifiInterface(String name) {
        if (name == null) return false;
        return name.matches("(?i)(wlan|swlan|wifi|softap|sw_ap|ap_br_(wlan|ap)|ap_br|ap|br[-_]?(wlan|wifi|softap|ap))[0-9_-]*");
    }

    static <T> EmployeeLanRoute<T> forPeer(List<EmployeeLanRoute<T>> routes, InetAddress peer) {
        if (!(peer instanceof Inet4Address)) return null;
        EmployeeLanRoute<T> best = null;
        for (EmployeeLanRoute<T> route : routes) {
            if (!(route.address instanceof Inet4Address) || route.prefix < 1 || route.prefix > 32) continue;
            if (best != null && route.prefix <= best.prefix) continue;
            byte[] a = route.address.getAddress(), b = peer.getAddress();
            int mismatch = 0;
            for (int i = 0; i < 4; i++) mismatch = (mismatch << 8) | ((a[i] ^ b[i]) & 255);
            if ((mismatch >>> (32 - route.prefix)) == 0) best = route;
        }
        return best;
    }
}
