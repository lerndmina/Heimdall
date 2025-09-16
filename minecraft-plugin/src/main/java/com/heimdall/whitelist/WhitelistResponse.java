package com.heimdall.whitelist;

public class WhitelistResponse {
  private final boolean shouldBeWhitelisted;
  private final boolean hasAuth;
  private final String kickMessage;
  private final String action;
  private final String authCode;

  public WhitelistResponse(boolean shouldBeWhitelisted, boolean hasAuth, String kickMessage, String action) {
    this(shouldBeWhitelisted, hasAuth, kickMessage, action, null);
  }

  public WhitelistResponse(boolean shouldBeWhitelisted, boolean hasAuth, String kickMessage, String action,
      String authCode) {
    this.shouldBeWhitelisted = shouldBeWhitelisted;
    this.hasAuth = hasAuth;
    this.kickMessage = kickMessage;
    this.action = action;
    this.authCode = authCode;
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
