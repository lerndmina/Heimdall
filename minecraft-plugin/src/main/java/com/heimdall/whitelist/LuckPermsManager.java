package com.heimdall.whitelist;

import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import net.luckperms.api.model.user.User;
import net.luckperms.api.node.types.InheritanceNode;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public class LuckPermsManager {

  private final HeimdallWhitelistPlugin plugin;
  private LuckPerms luckPerms;

  public LuckPermsManager(HeimdallWhitelistPlugin plugin) {
    this.plugin = plugin;

    try {
      this.luckPerms = LuckPermsProvider.get();
      plugin.getLogger().info("LuckPerms integration enabled");
    } catch (IllegalStateException e) {
      plugin.getLogger().warning("LuckPerms not found! Role sync will not work.");
      this.luckPerms = null;
    }
  }

  /**
   * Check if LuckPerms is available
   */
  public boolean isAvailable() {
    return luckPerms != null;
  }

  /**
   * Get player's current groups
   */
  public List<String> getPlayerGroups(UUID playerUuid) {
    if (!isAvailable()) {
      return new ArrayList<>();
    }

    try {
      User user = luckPerms.getUserManager().getUser(playerUuid);
      if (user == null) {
        return new ArrayList<>();
      }

      return user.getInheritedGroups(user.getQueryOptions())
          .stream()
          .map(group -> group.getName())
          .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
    } catch (Exception e) {
      plugin.getLogger().warning("Failed to get groups for player " + playerUuid + ": " + e.getMessage());
      return new ArrayList<>();
    }
  }

  /**
   * Set player's groups (clear existing and add new ones)
   */
  public CompletableFuture<Boolean> setPlayerGroups(UUID playerUuid, List<String> groups) {
    if (!isAvailable()) {
      return CompletableFuture.completedFuture(false);
    }

    return CompletableFuture.supplyAsync(() -> {
      try {
        User user = luckPerms.getUserManager().loadUser(playerUuid).join();
        if (user == null) {
          plugin.getLogger().warning("Could not load user " + playerUuid + " for role sync");
          return false;
        }

        // Clear existing groups (except default group)
        String defaultGroup = "default"; // Most servers use "default" as the default group
        user.data().clear(node -> node instanceof InheritanceNode &&
            !((InheritanceNode) node).getGroupName().equals(defaultGroup));

        // Add new groups
        for (String group : groups) {
          if (luckPerms.getGroupManager().isLoaded(group)) {
            InheritanceNode node = InheritanceNode.builder(group).build();
            user.data().add(node);
          } else {
            plugin.getLogger().warning("Group '" + group + "' does not exist, skipping");
          }
        }

        // Save changes
        luckPerms.getUserManager().saveUser(user);

        plugin.getLogger().info("Updated groups for player " + playerUuid + ": " + String.join(", ", groups));
        return true;

      } catch (Exception e) {
        plugin.getLogger().severe("Failed to set groups for player " + playerUuid + ": " + e.getMessage());
        e.printStackTrace();
        return false;
      }
    });
  }

  /**
   * Add player to a specific group
   */
  public CompletableFuture<Boolean> addPlayerToGroup(UUID playerUuid, String group) {
    if (!isAvailable()) {
      return CompletableFuture.completedFuture(false);
    }

    return CompletableFuture.supplyAsync(() -> {
      try {
        User user = luckPerms.getUserManager().loadUser(playerUuid).join();
        if (user == null) {
          return false;
        }

        if (luckPerms.getGroupManager().isLoaded(group)) {
          InheritanceNode node = InheritanceNode.builder(group).build();
          user.data().add(node);
          luckPerms.getUserManager().saveUser(user);

          plugin.getLogger().info("Added player " + playerUuid + " to group " + group);
          return true;
        } else {
          plugin.getLogger().warning("Group '" + group + "' does not exist");
          return false;
        }

      } catch (Exception e) {
        plugin.getLogger().severe("Failed to add player " + playerUuid + " to group " + group + ": " + e.getMessage());
        return false;
      }
    });
  }

  /**
   * Remove player from a specific group
   */
  public CompletableFuture<Boolean> removePlayerFromGroup(UUID playerUuid, String group) {
    if (!isAvailable()) {
      return CompletableFuture.completedFuture(false);
    }

    return CompletableFuture.supplyAsync(() -> {
      try {
        User user = luckPerms.getUserManager().loadUser(playerUuid).join();
        if (user == null) {
          return false;
        }

        InheritanceNode node = InheritanceNode.builder(group).build();
        user.data().remove(node);
        luckPerms.getUserManager().saveUser(user);

        plugin.getLogger().info("Removed player " + playerUuid + " from group " + group);
        return true;

      } catch (Exception e) {
        plugin.getLogger()
            .severe("Failed to remove player " + playerUuid + " from group " + group + ": " + e.getMessage());
        return false;
      }
    });
  }

  /**
   * Get player by UUID (online or offline)
   */
  public Player getPlayer(UUID playerUuid) {
    Player player = Bukkit.getPlayer(playerUuid);
    if (player != null && player.isOnline()) {
      return player;
    }
    return null;
  }
}