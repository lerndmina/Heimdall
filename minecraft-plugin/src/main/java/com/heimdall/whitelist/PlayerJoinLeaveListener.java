package com.heimdall.whitelist;

import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

public class PlayerJoinLeaveListener implements Listener {
  private final HeimdallWhitelistPlugin plugin;

  public PlayerJoinLeaveListener(HeimdallWhitelistPlugin plugin) {
    this.plugin = plugin;
  }

  @EventHandler
  public void onPlayerJoin(PlayerJoinEvent event) {
    // Player successfully joined, extend their cache if caching is enabled
    if (plugin.getConfig().getBoolean("cache.enabled", true)) {
      String uuid = event.getPlayer().getUniqueId().toString();
      String username = event.getPlayer().getName();

      plugin.getWhitelistCache().extendCacheOnJoin(uuid, username);
    }
  }

  @EventHandler
  public void onPlayerQuit(PlayerQuitEvent event) {
    // Player left, extend their cache since they were clearly allowed to play (if
    // caching is enabled)
    if (plugin.getConfig().getBoolean("cache.enabled", true)) {
      String uuid = event.getPlayer().getUniqueId().toString();
      String username = event.getPlayer().getName();

      plugin.getWhitelistCache().extendCacheOnLeave(uuid, username);
    }
  }
}
