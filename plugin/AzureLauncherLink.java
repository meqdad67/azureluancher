package com.azure.launcherlink;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Azure Launcher <-> server link.
 *  - POST /azure/hb?id=<install>&playing=1&name=<n>&uuid=<u>  (sent by the launcher every 30s)
 *  - answers {"open":N,"playing":M}
 *  - gives VIP (configurable commands) to a player who joins while the launcher reports them as playing,
 *    and takes it away when they quit, or when the launcher stops reporting them.
 * NOTE: the launcher is open source, so this is a convenience check, not unforgeable security.
 */
public final class AzureLauncherLink extends JavaPlugin implements Listener {

    private static final class Beat {
        volatile long at; volatile String ip = ""; volatile String name = ""; volatile String uuid = ""; volatile boolean playing;
    }

    private final Map<String, Beat> beats = new ConcurrentHashMap<>();
    private final Set<UUID> vip = ConcurrentHashMap.newKeySet();
    private HttpServer http;
    private long openTtl, vipTtl;
    private boolean requireSameIp;
    private String key, grantCmd, revokeCmd;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        getConfig().options().copyDefaults(true);
        openTtl = getConfig().getLong("open-ttl-seconds", 90) * 1000L;
        vipTtl = getConfig().getLong("vip-ttl-seconds", 120) * 1000L;
        requireSameIp = getConfig().getBoolean("require-same-ip", true);
        key = getConfig().getString("key", "");
        grantCmd = getConfig().getString("grant-command", "lp user %player% parent add vip");
        revokeCmd = getConfig().getString("revoke-command", "lp user %player% parent remove vip");

        try {
            http = HttpServer.create(new InetSocketAddress(getConfig().getInt("port", 8765)), 0);
            http.createContext("/azure/hb", this::handle);
            http.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(2));
            http.start();
            getLogger().info("Azure link listening on port " + getConfig().getInt("port", 8765));
        } catch (IOException e) {
            getLogger().severe("Could not start the HTTP endpoint: " + e.getMessage());
        }

        Bukkit.getPluginManager().registerEvents(this, this);
        new BukkitRunnable() {
            @Override public void run() { sweep(); }
        }.runTaskTimer(this, 400L, 400L); // every 20s
    }

    @Override
    public void onDisable() {
        if (http != null) http.stop(0);
        for (UUID id : new java.util.ArrayList<>(vip)) {
            Player p = Bukkit.getPlayer(id);
            if (p != null) run(revokeCmd, p.getName());
        }
        vip.clear();
    }

    /* ---------------- HTTP ---------------- */
    private void handle(HttpExchange ex) throws IOException {
        try {
            if (!key.isEmpty() && !key.equals(ex.getRequestHeaders().getFirst("X-Azure-Key"))) { reply(ex, 403, "{}"); return; }
            Map<String, String> q = query(ex.getRequestURI().getRawQuery());
            String id = q.getOrDefault("id", "");
            if (id.isEmpty() || id.length() > 40) { reply(ex, 400, "{}"); return; }
            Beat b = beats.computeIfAbsent(id, k -> new Beat());
            b.at = System.currentTimeMillis();
            b.ip = ex.getRemoteAddress().getAddress().getHostAddress();
            b.playing = "1".equals(q.get("playing"));
            b.name = q.getOrDefault("name", "");
            b.uuid = q.getOrDefault("uuid", "").replace("-", "").toLowerCase();
            long now = System.currentTimeMillis();
            int open = 0, playing = 0;
            for (Beat x : beats.values()) {
                if (now - x.at <= openTtl) { open++; if (x.playing) playing++; }
            }
            reply(ex, 200, "{\"open\":" + open + ",\"playing\":" + playing + "}");
        } catch (Exception e) {
            reply(ex, 500, "{}");
        }
    }

    private void reply(HttpExchange ex, int code, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(code, b.length);
        ex.getResponseBody().write(b);
        ex.close();
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> m = new HashMap<>();
        if (raw == null) return m;
        for (String part : raw.split("&")) {
            int i = part.indexOf('=');
            if (i < 0) continue;
            m.put(URLDecoder.decode(part.substring(0, i), StandardCharsets.UTF_8), URLDecoder.decode(part.substring(i + 1), StandardCharsets.UTF_8));
        }
        return m;
    }

    /* ---------------- VIP ---------------- */
    private boolean eligible(Player p) {
        long now = System.currentTimeMillis();
        String ip = p.getAddress() != null ? p.getAddress().getAddress().getHostAddress() : "";
        String uuid = p.getUniqueId().toString().replace("-", "").toLowerCase();
        for (Beat b : beats.values()) {
            if (!b.playing || now - b.at > vipTtl) continue;
            if (!b.name.equalsIgnoreCase(p.getName())) continue;
            if (!b.uuid.isEmpty() && !b.uuid.equals(uuid)) continue;
            if (requireSameIp && !b.ip.equals(ip)) continue;
            return true;
        }
        return false;
    }

    private void run(String cmd, String player) {
        Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd.replace("%player%", player));
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent e) {
        final Player p = e.getPlayer();
        new BukkitRunnable() {
            int tries = 0;
            @Override public void run() {
                if (!p.isOnline() || ++tries > 10) { cancel(); return; }
                if (!vip.contains(p.getUniqueId()) && eligible(p)) {
                    vip.add(p.getUniqueId());
                    AzureLauncherLink.this.run(grantCmd, p.getName());
                    cancel();
                }
            }
        }.runTaskTimer(this, 20L, 100L); // retries for ~50s: the launcher's first beat may arrive just after the join
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        if (vip.remove(e.getPlayer().getUniqueId())) run(revokeCmd, e.getPlayer().getName());
    }

    /** Takes VIP away if the launcher stopped reporting the player. */
    private void sweep() {
        long now = System.currentTimeMillis();
        beats.values().removeIf(b -> now - b.at > 600_000L);
        for (UUID id : new java.util.ArrayList<>(vip)) {
            Player p = Bukkit.getPlayer(id);
            if (p == null) { vip.remove(id); continue; }
            if (!eligible(p)) { vip.remove(id); run(revokeCmd, p.getName()); }
        }
    }
}
