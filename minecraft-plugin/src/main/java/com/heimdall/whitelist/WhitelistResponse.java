package com.heimdall.whitelist;

import java.util.List;

public class WhitelistResponse {
  private final boolean shouldBeWhitelisted;
  private final boolean hasAuth;
  private final String kickMessage;
  private final String action;
  private final String authCode;
  private final boolean roleSyncEnabled;
  private final List<String> targetGroups;

  public WhitelistResponse(boolean shouldBeWhitelisted, boolean hasAuth, String kickMessage, String action) {
    this(shouldBeWhitelisted, hasAuth, kickMessage, action, null, false, null);
  }

  public WhitelistResponse(boolean shouldBeWhitelisted, boolean hasAuth, String kickMessage, String action,
      String authCode) {
    this(shouldBeWhitelisted, hasAuth, kickMessage, action, authCode, false, null);
  }

  public WhitelistResponse(boolean shouldBeWhitelisted, boolean hasAuth, String kickMessage, String action,
      String authCode, boolean roleSyncEnabled, List<String> targetGroups) {
    this.shouldBeWhitelisted = shouldBeWhitelisted;
    this.hasAuth = hasAuth;
    this.kickMessage = kickMessage;
    this.action = action;
    this.authCode = authCode;
    this.roleSyncEnabled = roleSyncEnabled;
    this.targetGroups = targetGroups;
  }

  public boolean shouldBeWhitelisted() {
    return shouldBeWhitelisted;
  }

  public boolean hasAuth() {
    return hasAuth;
  }

  public String getKickMessage() {
    return kickMessage;
  }

  public String getAction() {
    return action;
  }

  public String getAuthCode() {
    return authCode;
  }

  public boolean isRoleSyncEnabled() {
    return roleSyncEnabled;
  }

  public List<String> getTargetGroups() {
    return targetGroups;
  }

  @Override
  public String toString() {
    return "WhitelistResponse{" +
        "shouldBeWhitelisted=" + shouldBeWhitelisted +
        ", hasAuth=" + hasAuth +
        ", kickMessage='" + kickMessage + '\'' +
        ", action='" + action + '\'' +
        ", authCode='" + authCode + '\'' +
        '}';
  }
}
