package com.heimdall.whitelist.core;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Platform-agnostic API client for communicating with the Heimdall bot API.
 */
public class ApiClient {

  private final PluginLogger logger;
  private final ConfigProvider config;
  private final Gson gson;
  private ExecutorService executor;
  private String baseUrl;
  private String guildId;
  private String apiKey;
  private int timeout;
  private int retries;
  private int retryDelay;

  public ApiClient(PluginLogger logger, ConfigProvider config) {
    this.logger = logger;
    this.config = config;
    this.gson = new Gson();
    this.executor = Executors.newFixedThreadPool(config.getInt("performance.maxConcurrentRequests", 5));
    updateConfig();
  }

  public void updateConfig() {
    this.baseUrl = config.getString("api.baseUrl", "http://localhost:3001");
    this.guildId = config.getString("api.guildId", "");
    this.apiKey = config.getString("api.apiKey", "");

    if (this.guildId.isEmpty()) {
      logger.warning("api.guildId is not configured! Set it to your Discord server ID in config.yml");
    }
    this.timeout = config.getInt("api.timeout", 5000);
    this.retries = config.getInt("api.retries", 3);
    this.retryDelay = config.getInt("api.retryDelay", 1000);

    // Ensure baseUrl doesn't end with slash
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
    }
  }

  public CompletableFuture<WhitelistResponse> checkWhitelist(String username, String uuid, String ip) {
    return checkWhitelist(username, uuid, ip, null, null, false);
  }

  public CompletableFuture<WhitelistResponse> checkWhitelist(String username, String uuid, String ip,
      List<String> currentGroups, String serverIp, boolean currentlyWhitelisted) {
    return CompletableFuture.supplyAsync(() -> {
      // Validate input parameters
      if (username == null || username.trim().isEmpty()) {
        throw new IllegalArgumentException("Username cannot be null or empty");
      }
      if (uuid == null || uuid.trim().isEmpty()) {
        throw new IllegalArgumentException("UUID cannot be null or empty");
      }
      if (ip == null || ip.trim().isEmpty()) {
        throw new IllegalArgumentException("IP cannot be null or empty");
      }

      // Normalize username to lowercase for consistent matching
      String normalizedUsername = username.toLowerCase();

      JsonObject requestBody = new JsonObject();
      requestBody.addProperty("username", normalizedUsername);
      requestBody.addProperty("uuid", uuid);
      requestBody.addProperty("ip", ip);
      requestBody.addProperty("serverIp", serverIp != null ? serverIp : "localhost");
      requestBody.addProperty("currentlyWhitelisted", currentlyWhitelisted);

      // Add current groups for role sync
      JsonArray groupsArray = new JsonArray();
      if (currentGroups != null) {
        for (String group : currentGroups) {
          groupsArray.add(group);
        }
      }
      requestBody.add("currentGroups", groupsArray);

      // Always log request body for debugging connection issues
      logger.info("API request body: " + requestBody.toString());

      try {
        return makeRequest("/api/guilds/" + guildId + "/minecraft/connection-attempt", requestBody);
      } catch (Exception e) {
        logger.severe("Failed to check whitelist for " + username + ": " + e.getMessage());
        throw new RuntimeException("API request failed: " + e.getMessage(), e);
      }
    }, executor);
  }

  public CompletableFuture<WhitelistResponse> requestLinkCode(String username, String uuid) {
    return CompletableFuture.supplyAsync(() -> {
      // Validate input parameters
      if (username == null || username.trim().isEmpty()) {
        throw new IllegalArgumentException("Username cannot be null or empty");
      }
      if (uuid == null || uuid.trim().isEmpty()) {
        throw new IllegalArgumentException("UUID cannot be null or empty");
      }

      // Normalize username to lowercase for consistent matching
      String normalizedUsername = username.toLowerCase();

      JsonObject requestBody = new JsonObject();
      requestBody.addProperty("username", normalizedUsername);
      requestBody.addProperty("uuid", uuid);

      try {
        return makeRequestForLinkCode("/api/guilds/" + guildId + "/minecraft/request-link-code", requestBody);
      } catch (Exception e) {
        logger.severe("Failed to request link code for " + username + ": " + e.getMessage());
        throw new RuntimeException("API request failed: " + e.getMessage(), e);
      }
    }, executor);
  }

  private WhitelistResponse makeRequest(String endpoint, JsonObject requestBody) throws IOException {
    IOException lastException = null;

    for (int attempt = 1; attempt <= retries; attempt++) {
      try {
        if (config.getBoolean("logging.debug", false)) {
          logger.info("API Request (attempt " + attempt + "): " + endpoint);
          logger.debug("Request body: " + requestBody.toString());
        }

        URL url = new URL(baseUrl + endpoint);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();

        // Configure connection
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "HeimdallWhitelist/2.0.0");

        // Add X-API-Key header for authentication
        if (apiKey != null && !apiKey.isEmpty()) {
          connection.setRequestProperty("X-API-Key", apiKey);
        } else {
          logger.warning("API key not configured! Set api.apiKey in config.yml");
        }

        connection.setConnectTimeout(timeout);
        connection.setReadTimeout(timeout);
        connection.setDoOutput(true);

        // Send request body
        try (OutputStream os = connection.getOutputStream()) {
          byte[] input = requestBody.toString().getBytes(StandardCharsets.UTF_8);
          os.write(input, 0, input.length);
        }

        // Get response
        int responseCode = connection.getResponseCode();

        if (responseCode == 200) {
          // Success - read response
          try (BufferedReader br = new BufferedReader(
              new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {

            StringBuilder response = new StringBuilder();
            String responseLine;
            while ((responseLine = br.readLine()) != null) {
              response.append(responseLine.trim());
            }

            String responseString = response.toString();

            if (config.getBoolean("logging.debug", false)) {
              logger.debug("API Response: " + responseString);
            }

            JsonObject responseJson = gson.fromJson(responseString, JsonObject.class);
            return parseWhitelistResponse(responseJson);
          }
        } else {
          // Error response - read error message
          String errorMessage = "HTTP " + responseCode;
          try (BufferedReader br = new BufferedReader(
              new InputStreamReader(connection.getErrorStream(), StandardCharsets.UTF_8))) {

            StringBuilder errorResponse = new StringBuilder();
            String responseLine;
            while ((responseLine = br.readLine()) != null) {
              errorResponse.append(responseLine.trim());
            }

            if (errorResponse.length() > 0) {
              JsonObject errorJson = gson.fromJson(errorResponse.toString(), JsonObject.class);
              if (errorJson.has("error")) {
                // v1 API returns structured error: { error: { code, message } }
                if (errorJson.get("error").isJsonObject()) {
                  JsonObject errorObj = errorJson.getAsJsonObject("error");
                  String code = errorObj.has("code") ? errorObj.get("code").getAsString() : "UNKNOWN";
                  String msg = errorObj.has("message") ? errorObj.get("message").getAsString() : "Unknown error";
                  errorMessage = code + ": " + msg;
                } else {
                  errorMessage = errorJson.get("error").getAsString();
                }
              }
            }
          } catch (Exception e) {
            // Ignore error reading error response
          }

          throw new IOException("API request failed: " + errorMessage);
        }

      } catch (IOException e) {
        lastException = e;

        if (attempt < retries) {
          logger.warning("API request failed (attempt " + attempt + "/" + retries + "): " + e.getMessage());
          logger.info("Retrying in " + retryDelay + "ms...");

          try {
            Thread.sleep(retryDelay);
          } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IOException("Request interrupted", ie);
          }
        } else {
          logger.severe("All API request attempts failed for " + endpoint);
        }
      }
    }

    throw lastException != null ? lastException : new IOException("All API requests failed");
  }

  private WhitelistResponse parseWhitelistResponse(JsonObject json) {
    // Check if response is wrapped in standard API format
    JsonObject data = json;
    if (json.has("data") && json.get("data").isJsonObject()) {
      data = json.getAsJsonObject("data");
    }

    // v1 API returns: whitelisted, message, and optional flags
    boolean whitelisted = data.has("whitelisted") && data.get("whitelisted").getAsBoolean();
    String message = data.has("message") ? data.get("message").getAsString() : "";
    boolean pendingAuth = data.has("pendingAuth") && data.get("pendingAuth").getAsBoolean();
    boolean pendingApproval = data.has("pendingApproval") && data.get("pendingApproval").getAsBoolean();
    boolean existingPlayerLink = data.has("existingPlayerLink") && data.get("existingPlayerLink").getAsBoolean();
    String authCode = data.has("authCode") ? data.get("authCode").getAsString() : null;

    // Derive internal fields from v1 response
    boolean shouldBeWhitelisted = whitelisted;
    boolean hasAuth;
    String action;

    if (whitelisted && !existingPlayerLink) {
      // Fully whitelisted player
      hasAuth = true;
      action = "allow";
    } else if (existingPlayerLink) {
      // Whitelisted but not linked — offer linking
      hasAuth = false;
      action = "show_auth_code";
    } else if (pendingAuth) {
      // Has a pending auth code to display
      hasAuth = true;
      action = "show_auth_code";
    } else if (pendingApproval) {
      // Linked but awaiting staff approval
      hasAuth = true;
      action = "pending_approval";
    } else {
      // Not linked, not whitelisted
      hasAuth = false;
      action = "deny";
    }

    // Parse role sync data if present
    boolean roleSyncEnabled = false;
    List<String> targetGroups = null;
    List<String> managedGroups = null;

    if (data.has("roleSync") && data.get("roleSync").isJsonObject()) {
      JsonObject roleSync = data.getAsJsonObject("roleSync");
      roleSyncEnabled = roleSync.has("enabled") && roleSync.get("enabled").getAsBoolean();

      if (roleSync.has("targetGroups") && roleSync.get("targetGroups").isJsonArray()) {
        targetGroups = new ArrayList<>();
        JsonArray groupsArray = roleSync.getAsJsonArray("targetGroups");
        for (int i = 0; i < groupsArray.size(); i++) {
          targetGroups.add(groupsArray.get(i).getAsString());
        }
      }

      if (roleSync.has("managedGroups") && roleSync.get("managedGroups").isJsonArray()) {
        managedGroups = new ArrayList<>();
        JsonArray managedArray = roleSync.getAsJsonArray("managedGroups");
        for (int i = 0; i < managedArray.size(); i++) {
          managedGroups.add(managedArray.get(i).getAsString());
        }
      }
    }

    return new WhitelistResponse(shouldBeWhitelisted, hasAuth, message, action, authCode, roleSyncEnabled,
        targetGroups, managedGroups);
  }

  private WhitelistResponse makeRequestForLinkCode(String endpoint, JsonObject requestBody) throws IOException {
    IOException lastException = null;

    for (int attempt = 1; attempt <= retries; attempt++) {
      try {
        if (config.getBoolean("logging.debug", false)) {
          logger.info("API Request (attempt " + attempt + "): " + endpoint);
          logger.debug("Request body: " + requestBody.toString());
        }

        URL url = new URL(baseUrl + endpoint);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();

        // Configure connection
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "HeimdallWhitelist/2.0.0");

        // Add X-API-Key header for authentication
        if (apiKey != null && !apiKey.isEmpty()) {
          connection.setRequestProperty("X-API-Key", apiKey);
        } else {
          logger.warning("API key not configured! Set api.apiKey in config.yml");
        }

        connection.setConnectTimeout(timeout);
        connection.setReadTimeout(timeout);
        connection.setDoOutput(true);

        // Send request body
        try (OutputStream os = connection.getOutputStream()) {
          byte[] input = requestBody.toString().getBytes(StandardCharsets.UTF_8);
          os.write(input, 0, input.length);
        }

        // Get response
        int responseCode = connection.getResponseCode();

        if (responseCode == 200) {
          // Success - read response
          try (BufferedReader br = new BufferedReader(
              new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {

            StringBuilder response = new StringBuilder();
            String responseLine;
            while ((responseLine = br.readLine()) != null) {
              response.append(responseLine.trim());
            }

            String responseString = response.toString();

            if (config.getBoolean("logging.debug", false)) {
              logger.debug("API Response: " + responseString);
            }

            JsonObject responseJson = gson.fromJson(responseString, JsonObject.class);
            return parseLinkCodeResponse(responseJson);
          }
        } else {
          // Error response - read error message
          String errorMessage = "HTTP " + responseCode;
          try (BufferedReader br = new BufferedReader(
              new InputStreamReader(connection.getErrorStream(), StandardCharsets.UTF_8))) {

            StringBuilder errorResponse = new StringBuilder();
            String responseLine;
            while ((responseLine = br.readLine()) != null) {
              errorResponse.append(responseLine.trim());
            }

            if (errorResponse.length() > 0) {
              JsonObject errorJson = gson.fromJson(errorResponse.toString(), JsonObject.class);
              if (errorJson.has("error")) {
                // v1 API returns structured error: { error: { code, message } }
                if (errorJson.get("error").isJsonObject()) {
                  JsonObject errorObj = errorJson.getAsJsonObject("error");
                  String code = errorObj.has("code") ? errorObj.get("code").getAsString() : "UNKNOWN";
                  String msg = errorObj.has("message") ? errorObj.get("message").getAsString() : "Unknown error";
                  errorMessage = code + ": " + msg;
                } else {
                  errorMessage = errorJson.get("error").getAsString();
                }
              }
            }
          } catch (Exception e) {
            // Ignore error reading error response
          }

          throw new IOException("API request failed: " + errorMessage);
        }

      } catch (IOException e) {
        lastException = e;

        if (attempt < retries) {
          logger.warning("API request failed (attempt " + attempt + "/" + retries + "): " + e.getMessage());
          logger.info("Retrying in " + retryDelay + "ms...");

          try {
            Thread.sleep(retryDelay);
          } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IOException("Request interrupted", ie);
          }
        } else {
          logger.severe("All API request attempts failed for " + endpoint);
        }
      }
    }

    throw lastException != null ? lastException : new IOException("All API requests failed");
  }

  private WhitelistResponse parseLinkCodeResponse(JsonObject json) {
    // Check if response is wrapped in standard API format
    JsonObject data = json;
    if (json.has("data") && json.get("data").isJsonObject()) {
      data = json.getAsJsonObject("data");
    }

    // v1 API returns: alreadyLinked (boolean) and code (string) or message (string)
    boolean alreadyLinked = data.has("alreadyLinked") && data.get("alreadyLinked").getAsBoolean();

    if (alreadyLinked) {
      String error = data.has("message") ? data.get("message").getAsString() : "Account already linked";
      throw new RuntimeException(error);
    }

    String code = data.has("code") ? data.get("code").getAsString() : null;
    if (code == null || code.isEmpty()) {
      throw new RuntimeException("No auth code received from API");
    }

    return new WhitelistResponse(false, false, "", "link_code", code);
  }

  public void shutdown() {
    if (executor != null && !executor.isShutdown()) {
      executor.shutdown();
      try {
        if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
          executor.shutdownNow();
        }
      } catch (InterruptedException e) {
        executor.shutdownNow();
        Thread.currentThread().interrupt();
      }
    }
  }
}
