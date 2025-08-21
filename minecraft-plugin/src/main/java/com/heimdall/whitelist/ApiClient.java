package com.heimdall.whitelist;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;

public class ApiClient {

  private final HeimdallWhitelistPlugin plugin;
  private final Gson gson;
  private ExecutorService executor;
  private String baseUrl;
  private String apiKey;
  private int timeout;
  private int retries;
  private int retryDelay;

  public ApiClient(HeimdallWhitelistPlugin plugin) {
    this.plugin = plugin;
    this.gson = new Gson();
    this.executor = Executors.newFixedThreadPool(
        plugin.getConfig().getInt("performance.maxConcurrentRequests", 5));
    updateConfig();
  }

  public void updateConfig() {
    this.baseUrl = plugin.getConfig().getString("api.baseUrl", "http://localhost:3001");
    this.apiKey = plugin.getConfig().getString("api.apiKey", "");
    this.timeout = plugin.getConfig().getInt("api.timeout", 5000);
    this.retries = plugin.getConfig().getInt("api.retries", 3);
    this.retryDelay = plugin.getConfig().getInt("api.retryDelay", 1000);

    // Ensure baseUrl doesn't end with slash
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
    }
  }

  public CompletableFuture<WhitelistResponse> checkWhitelist(String username, String uuid, String ip) {
    return CompletableFuture.supplyAsync(() -> {
      // Normalize username to lowercase for consistent matching
      String normalizedUsername = username.toLowerCase();

      JsonObject requestBody = new JsonObject();
      requestBody.addProperty("username", normalizedUsername);
      if (uuid != null) {
        requestBody.addProperty("uuid", uuid);
      }
      requestBody.addProperty("ip", ip);
      requestBody.addProperty("serverIp", getServerIp());
      requestBody.addProperty("currentlyWhitelisted", isCurrentlyWhitelisted(normalizedUsername, uuid));

      try {
        return makeRequest("/api/minecraft/connection-attempt", requestBody);
      } catch (Exception e) {
        plugin.getLogger().log(Level.SEVERE, "Failed to check whitelist for " + username, e);
        throw new RuntimeException("API request failed: " + e.getMessage(), e);
      }
    }, executor);
  }

  private WhitelistResponse makeRequest(String endpoint, JsonObject requestBody) throws IOException {
    IOException lastException = null;

    for (int attempt = 1; attempt <= retries; attempt++) {
      try {
        if (plugin.getConfig().getBoolean("logging.debug", false)) {
          plugin.getLogger().info("API Request (attempt " + attempt + "): " + endpoint);
          plugin.getLogger().info("Request body: " + requestBody.toString());
        }

        URL url = new URL(baseUrl + endpoint);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();

        // Configure connection
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "HeimdallWhitelist/1.0.0");

        // Add Authorization header with API key
        if (apiKey != null && !apiKey.isEmpty()) {
          connection.setRequestProperty("Authorization", "Bearer " + apiKey);
        } else {
          plugin.getLogger().warning("API key not configured! Set api.apiKey in config.yml");
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

            if (plugin.getConfig().getBoolean("logging.debug", false)) {
              plugin.getLogger().info("API Response: " + responseString);
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
                errorMessage = errorJson.get("error").getAsString();
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
          plugin.getLogger().warning("API request failed (attempt " + attempt + "/" + retries + "): " + e.getMessage());
          plugin.getLogger().info("Retrying in " + retryDelay + "ms...");

          try {
            Thread.sleep(retryDelay);
          } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IOException("Request interrupted", ie);
          }
        } else {
          plugin.getLogger().severe("All API request attempts failed for " + endpoint);
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

    boolean shouldBeWhitelisted = data.get("shouldBeWhitelisted").getAsBoolean();
    boolean hasAuth = data.get("hasAuth").getAsBoolean();
    String kickMessage = data.get("kickMessage").getAsString();
    String action = data.get("action").getAsString();

    return new WhitelistResponse(shouldBeWhitelisted, hasAuth, kickMessage, action);
  }

  private boolean isCurrentlyWhitelisted(String username, String uuid) {
    // Check our cache instead of Bukkit's whitelist for better performance
    Boolean cachedResult = plugin.getWhitelistCache().isCachedWhitelisted(uuid, username);

    // If cached as whitelisted, return true
    // If cached as not whitelisted or not cached at all, return false
    // This is safer - we only report as whitelisted if we're sure
    return cachedResult != null && cachedResult;
  }

  private String getServerIp() {
    // Try to get server IP from server.properties or config
    String serverIp = plugin.getServer().getIp();
    if (serverIp == null || serverIp.isEmpty() || "0.0.0.0".equals(serverIp)) {
      // Fallback to configured server IP or localhost
      return plugin.getConfig().getString("server.publicIp", "localhost");
    }
    return serverIp;
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
