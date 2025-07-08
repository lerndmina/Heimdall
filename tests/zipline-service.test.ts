import { describe, test, expect, beforeAll } from "vitest";
import ZiplineService from "../src/services/ZiplineService";
import FetchEnvs, { isOptionalUnset } from "../src/utils/FetchEnvs";

/**
 * Comprehensive test suite for ZiplineService using Vitest
 *
 * To run tests:
 * npm run test           # Run all tests
 * npm run test:watch     # Interactive watch mode
 * npm run test:ui        # UI mode (if @vitest/ui is installed)
 * npm run test:zipline   # Run only zipline tests
 *
 * Make sure you have ZIPLINE_BASEURL and ZIPLINE_TOKEN set in your .env file
 */

// Test setup
const envs = FetchEnvs();
const hasZiplineConfig =
  !isOptionalUnset(envs.ZIPLINE_BASEURL) && !isOptionalUnset(envs.ZIPLINE_TOKEN);

describe("ZiplineService", () => {
  beforeAll(() => {
    if (!hasZiplineConfig) {
      console.log("⚠️  Zipline environment variables not configured. Some tests will be skipped.");
      console.log("   Set ZIPLINE_BASEURL and ZIPLINE_TOKEN in your .env file to run all tests.");
    }
  });

  describe("Constructor", () => {
    test("should create instance with provided token and baseUrl", () => {
      const service = new ZiplineService("test-token", "https://example.com");
      expect(service.token).toBe("test-token");
      expect(service.baseUrl).toBe("https://example.com");
      expect(service.isReady()).toBe(false);
    });
  });

  describe("Input Validation", () => {
    test("should return INVALID_TOKEN for empty token", async () => {
      const service = new ZiplineService("", "https://example.com");
      const result = await service.validateToken();
      expect(result).toBe(1); // INVALID_TOKEN = 1
    });

    test("should throw error for empty baseUrl", async () => {
      const service = new ZiplineService("test-token", "");
      await expect(service.validateToken()).rejects.toThrow("Base URL is required");
    });

    test("should return INVALID_URL for malformed URL", async () => {
      const service = new ZiplineService("test-token", "not-a-url");
      const result = await service.validateToken();
      expect(result).toBe(2); // INVALID_URL = 2
    });

    test("should return INVALID_URL for URL without protocol", async () => {
      const service = new ZiplineService("test-token", "example.com");
      const result = await service.validateToken();
      expect(result).toBe(2); // INVALID_URL = 2
    });
  });

  describe("Static Factory Method", () => {
    test.skipIf(!hasZiplineConfig)("should initialize service via static create", async () => {
      const service = await ZiplineService.create(envs.ZIPLINE_TOKEN, envs.ZIPLINE_BASEURL);
      expect(service).toBeInstanceOf(ZiplineService);
      expect(service.isReady()).toBe(true);
    });
  });

  describe("Initialization", () => {
    test.skipIf(!hasZiplineConfig)("should validate token and URL on initialize", async () => {
      const service = new ZiplineService(envs.ZIPLINE_TOKEN, envs.ZIPLINE_BASEURL);
      expect(service.isReady()).toBe(false);

      const result = await service.initialize();
      expect(result).toBe(0); // VALID = 0
      expect(service.isReady()).toBe(true);
    });

    test.skipIf(!hasZiplineConfig)(
      "should cache promise and not run validation twice",
      async () => {
        const service = new ZiplineService(envs.ZIPLINE_TOKEN, envs.ZIPLINE_BASEURL);

        // Call initialize multiple times simultaneously
        const [result1, result2, result3] = await Promise.all([
          service.initialize(),
          service.initialize(),
          service.initialize(),
        ]);

        expect(result1).toBe(0);
        expect(result2).toBe(0);
        expect(result3).toBe(0);
        expect(service.isReady()).toBe(true);
      }
    );
  });

  describe("URL Validation", () => {
    test.skipIf(!hasZiplineConfig)(
      "should validate URL accessibility via healthcheck",
      async () => {
        const service = new ZiplineService("invalid-token", envs.ZIPLINE_BASEURL);
        const result = await service.validateToken();

        // Should fail token validation but pass URL validation
        expect(result).toBe(1); // INVALID_TOKEN (URL was valid, token was not)
      }
    );

    test("should fail for unreachable URL", async () => {
      const service = new ZiplineService(
        "test-token",
        "https://definitely-not-a-real-zipline-instance.invalid"
      );
      const result = await service.validateToken();
      expect(result).toBe(2); // INVALID_URL
    });
  });

  describe("Token Validation", () => {
    test.skipIf(!hasZiplineConfig)("should validate token with correct credentials", async () => {
      const service = new ZiplineService(envs.ZIPLINE_TOKEN, envs.ZIPLINE_BASEURL);
      const result = await service.validateToken();
      expect(result).toBe(0); // VALID
    });

    test.skipIf(!hasZiplineConfig)("should invalidate wrong token with correct URL", async () => {
      const service = new ZiplineService("wrong-token-12345", envs.ZIPLINE_BASEURL);
      const result = await service.validateToken();
      expect(result).toBe(1); // INVALID_TOKEN
    });
  });

  describe("State Persistence", () => {
    test.skipIf(!hasZiplineConfig)("should remember validation state across calls", async () => {
      const service = new ZiplineService(envs.ZIPLINE_TOKEN, envs.ZIPLINE_BASEURL);

      // First validation
      const result1 = await service.validateToken();
      expect(result1).toBe(0);

      // Second validation should return cached result
      const result2 = await service.validateToken();
      expect(result2).toBe(0);

      expect(service.isReady()).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test.skipIf(!hasZiplineConfig)("should handle URL with trailing slash", async () => {
      const baseUrlWithSlash = envs.ZIPLINE_BASEURL.endsWith("/")
        ? envs.ZIPLINE_BASEURL
        : envs.ZIPLINE_BASEURL + "/";

      const service = new ZiplineService(envs.ZIPLINE_TOKEN, baseUrlWithSlash);
      const result = await service.validateToken();
      expect(result).toBe(0);
    });

    test("should handle URL with custom port", async () => {
      const service = new ZiplineService("test-token", "https://example.com:8080");
      const result = await service.validateToken();
      expect(result).toBe(2); // INVALID_URL (network failure)
    });
  });

  describe("Concurrency", () => {
    test.skipIf(!hasZiplineConfig)(
      "should handle multiple simultaneous validation attempts",
      async () => {
        const services = Array.from(
          { length: 5 },
          () => new ZiplineService(envs.ZIPLINE_TOKEN, envs.ZIPLINE_BASEURL)
        );

        // Validate all services simultaneously
        const results = await Promise.all(services.map((service) => service.validateToken()));

        // All should succeed
        results.forEach((result, index) => {
          expect(result, `Service ${index} should be valid`).toBe(0);
        });

        // All should be ready
        services.forEach((service, index) => {
          expect(service.isReady(), `Service ${index} should be ready`).toBe(true);
        });
      }
    );
  });
});
