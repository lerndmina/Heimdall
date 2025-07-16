/**
 * Simple client-side cache to prevent duplicate API calls
 * This helps avoid rate limiting when multiple components
 * need the same data simultaneously
 */
class ClientCache {
  private cache = new Map<string, { data: any; timestamp: number; promise?: Promise<any> }>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get data from cache or execute the provider function
   */
  async get<T>(key: string, provider: () => Promise<T>, ttl: number = this.defaultTTL): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);

    // If we have a pending promise, return that
    if (cached?.promise) {
      return cached.promise;
    }

    // If we have valid cached data, return it
    if (cached && now - cached.timestamp < ttl) {
      return cached.data;
    }

    // Otherwise, fetch new data
    const promise = provider();

    // Store the promise immediately to prevent duplicate calls
    this.cache.set(key, { data: null, timestamp: now, promise });

    try {
      const data = await promise;
      // Store the result and remove the promise
      this.cache.set(key, { data, timestamp: now });
      return data;
    } catch (error) {
      // Remove the failed promise
      this.cache.delete(key);
      throw error;
    }
  }

  /**
   * Clear a specific cache entry
   */
  clear(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (!entry.promise && now - entry.timestamp > this.defaultTTL) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.cache.delete(key));
  }
}

export const clientCache = new ClientCache();

// Clean up expired entries every 5 minutes
if (typeof window !== "undefined") {
  setInterval(() => {
    clientCache.cleanup();
  }, 5 * 60 * 1000);
}
