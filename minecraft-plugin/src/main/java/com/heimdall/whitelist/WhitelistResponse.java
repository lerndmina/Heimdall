package com.heimdall.whitelist;

public class WhitelistResponse {
  private final boolean shouldBeWhitelisted;
  private final boolean hasAuth;
  private final String kickMessage;
  private final String action;

  public WhitelistResponse(boolean shouldBeWhitelisted, boolean hasAuth, String kickMessage, String action) {
    this.shouldBeWhitelisted = shouldBeWhitelisted;
    this.hasAuth = hasAuth;
    this.kickMessage = kickMessage;
    this.action = action;
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

  @Override
  public String toString() {
    return "WhitelistResponse{" +
        "shouldBeWhitelisted=" + shouldBeWhitelisted +
        ", hasAuth=" + hasAuth +
        ", kickMessage='" + kickMessage + '\'' +
        ", action='" + action + '\'' +
        '}';
  }
}
