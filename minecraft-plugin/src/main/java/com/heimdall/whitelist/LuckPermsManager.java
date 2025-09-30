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
   * Sync player's Discord-managed groups (only touch groups explicitly managed by Discord sync)
   */
  public CompletableFuture<Boolean> setPlayerGroups(UUID playerUuid, List<String> targetGroups, List<String> managedGroups) {
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

        // Ensure we have a list of managed groups from the API
        if (managedGroups == null || managedGroups.isEmpty()) {
          plugin.getLogger().warning("No managed groups provided by API for player " + playerUuid + ", skipping role sync");
          return false;
        }

        // Ensure we have target groups (can be empty if user should have no Discord roles)
        final List<String> finalTargetGroups = targetGroups != null ? targetGroups : new ArrayList<>();

        // Get current groups
        List<String> currentGroups = user.getInheritedGroups(user.getQueryOptions())
            .stream()
            .map(group -> group.getName())
            .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);

        // Find Discord-managed groups that need to be removed 
        // (player currently has them, but they're not in target, and they are Discord-managed)
        List<String> groupsToRemove = new ArrayList<>();
        for (String currentGroup : currentGroups) {
          if (managedGroups.contains(currentGroup) && !finalTargetGroups.contains(currentGroup)) {
            groupsToRemove.add(currentGroup);
          }
        }

        // Find Discord-managed groups that need to be added 
        // (in target groups, not currently assigned, and is Discord-managed)
        List<String> groupsToAdd = new ArrayList<>();
        for (String targetGroup : finalTargetGroups) {
          if (managedGroups.contains(targetGroup) && !currentGroups.contains(targetGroup)) {
            groupsToAdd.add(targetGroup);
          }
        }

        // Remove Discord-managed groups that are no longer needed
        for (String groupToRemove : groupsToRemove) {
          InheritanceNode node = InheritanceNode.builder(groupToRemove).build();
          user.data().remove(node);
          plugin.getLogger().info("Removed Discord-synced group '" + groupToRemove + "' from player " + playerUuid);
        }

        // Add new Discord-managed groups
        for (String groupToAdd : groupsToAdd) {
          if (luckPerms.getGroupManager().isLoaded(groupToAdd)) {
            InheritanceNode node = InheritanceNode.builder(groupToAdd).build();
            user.data().add(node);
            plugin.getLogger().info("Added Discord-synced group '" + groupToAdd + "' to player " + playerUuid);
          } else {
            plugin.getLogger().warning("Group '" + groupToAdd + "' does not exist, skipping");
          }
        }

        // Save changes only if there were changes
        if (!groupsToRemove.isEmpty() || !groupsToAdd.isEmpty()) {
          luckPerms.getUserManager().saveUser(user);
          plugin.getLogger().info("Synchronized Discord-managed groups for player " + playerUuid + 
              " - Added: " + groupsToAdd + ", Removed: " + groupsToRemove + 
              " (Managed groups: " + managedGroups + ")");
        } else {
          plugin.getLogger().info("No Discord-managed group changes needed for player " + playerUuid + 
              " (Managed groups: " + managedGroups + ")");
        }

        return true;

      } catch (Exception e) {
        plugin.getLogger().severe("Failed to sync groups for player " + playerUuid + ": " + e.getMessage());
        e.printStackTrace();
        return false;
      }
    });
  }

  /**
   * Legacy method for backward compatibility - only use when managed groups are unknown
   * @deprecated Use setPlayerGroups(UUID, List<String>, List<String>) instead
   */
  @Deprecated
  public CompletableFuture<Boolean> setPlayerGroups(UUID playerUuid, List<String> targetGroups) {
    plugin.getLogger().warning("Using deprecated setPlayerGroups method without managed groups list. " +
        "This may interfere with non-Discord groups.");
    // Assume all target groups are managed groups for backward compatibility
    return setPlayerGroups(playerUuid, targetGroups, targetGroups);
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