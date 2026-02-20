/**
 * PlanetSideApiService — Dual API client for Census + Honu
 *
 * Honu (wt.honu.pw) is the primary data source for most operations.
 * Census (census.daybreakgames.com) is supplementary for cert data and fallback.
 *
 * All methods return typed results with error handling and caching.
 */

import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("planetside:api");

// ── Types ──────────────────────────────────────────────────────

export interface HonuCharacter {
  id: string;
  name: string;
  factionID: number;
  worldID: number;
  battleRank: number;
  prestige: number;
  outfitID?: string;
  outfitTag?: string;
  outfitName?: string;
  dateLastLogin?: string;
}

export interface HonuOnlineStatus {
  online: boolean;
  worldID?: number;
  lastLogin?: string;
}

export interface HonuOutfit {
  id: string;
  name: string;
  tag: string;
  factionID: number;
  worldID: number;
  memberCount?: number;
}

export interface HonuOutfitMember {
  characterID: string;
  characterName: string;
  rankOrdinal: number;
  rankName: string;
  factionID?: number;
  online?: boolean;
}

export interface HonuWorldPopulation {
  worldID: number;
  worldName?: string;
  total: number;
  vs: number;
  nc: number;
  tr: number;
  ns: number;
}

export interface HonuZonePopulation {
  zoneID: number;
  zoneName?: string;
  vs: number;
  nc: number;
  tr: number;
  ns: number;
}

export interface HonuHealth {
  isHealthy: boolean;
  details?: Record<string, unknown>;
}

export interface HonuCharacterStats {
  kills?: number;
  deaths?: number;
  score?: number;
  playTime?: number;
  [key: string]: unknown;
}

export interface CensusCharacter {
  character_id: string;
  name: { first: string; first_lower: string };
  faction_id: string;
  battle_rank: { value: string; percent_to_next: string };
  prestige_level: string;
  certs: { earned_points: string; gifted_points: string; spent_points: string; available_points: string; percent_to_next: string };
  times: { creation: string; login_count: string; last_login: string; last_save: string; minutes_played: string };
  outfit_member?: { outfit_id: string; rank: string; rank_ordinal: string };
}

export interface FisuPopulation {
  worldId: number;
  vs: number;
  nc: number;
  tr: number;
  ns: number;
}

// ── World names ────────────────────────────────────────────────

const WORLD_NAMES: Record<number, string> = {
  1: "Connery",
  10: "Miller",
  13: "Cobalt",
  17: "Emerald",
  40: "SolTech",
};

const ALL_WORLD_IDS = [1, 10, 13, 17, 40];

export { WORLD_NAMES, ALL_WORLD_IDS };

// ── Service ────────────────────────────────────────────────────

export class PlanetSideApiService {
  private defaultHonuBaseUrl: string;
  private defaultCensusServiceId: string;

  constructor(honuBaseUrl?: string, censusServiceId?: string) {
    this.defaultHonuBaseUrl = honuBaseUrl || process.env.HONU_BASE_URL || "https://wt.honu.pw";
    this.defaultCensusServiceId = censusServiceId || process.env.CENSUS_SERVICE_ID || "example";
  }

  // ═══════════════════════════════════════════════════════════════
  // HONU CLIENT (primary)
  // ═══════════════════════════════════════════════════════════════

  private async honuFetch<T>(path: string, honuBaseUrl?: string): Promise<T | null> {
    const baseUrl = honuBaseUrl || this.defaultHonuBaseUrl;
    const url = `${baseUrl}${path}`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Heimdall-Bot/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        log.warn(`Honu API ${res.status} for ${path}`);
        return null;
      }

      return (await res.json()) as T;
    } catch (error) {
      log.error(`Honu API error for ${path}:`, error);
      return null;
    }
  }

  /** Search for characters by name (autocomplete) */
  async searchCharacter(name: string, honuBaseUrl?: string): Promise<HonuCharacter[]> {
    const result = await this.honuFetch<HonuCharacter[]>(`/api/characters/search/${encodeURIComponent(name)}`, honuBaseUrl);
    return result || [];
  }

  /** Get a character by name */
  async getCharacterByName(name: string, honuBaseUrl?: string): Promise<HonuCharacter | null> {
    const results = await this.honuFetch<HonuCharacter[]>(`/api/characters/name/${encodeURIComponent(name.toLowerCase())}`, honuBaseUrl);
    return results?.[0] || null;
  }

  /** Get a character by ID */
  async getCharacterById(charId: string, honuBaseUrl?: string): Promise<HonuCharacter | null> {
    return this.honuFetch<HonuCharacter>(`/api/character/${charId}`, honuBaseUrl);
  }

  /** Get online status of a character */
  async getCharacterOnlineStatus(charId: string, honuBaseUrl?: string): Promise<HonuOnlineStatus | null> {
    return this.honuFetch<HonuOnlineStatus>(`/api/character/${charId}/online`, honuBaseUrl);
  }

  /** Get character stats */
  async getCharacterStats(charId: string, honuBaseUrl?: string): Promise<HonuCharacterStats | null> {
    return this.honuFetch<HonuCharacterStats>(`/api/character/${charId}/stats`, honuBaseUrl);
  }

  /** Get character extra/fun stats */
  async getCharacterExtra(charId: string, honuBaseUrl?: string): Promise<Record<string, unknown> | null> {
    return this.honuFetch<Record<string, unknown>>(`/api/character/${charId}/extra`, honuBaseUrl);
  }

  /** Get character sessions */
  async getCharacterSessions(charId: string, honuBaseUrl?: string): Promise<unknown[] | null> {
    return this.honuFetch<unknown[]>(`/api/character/${charId}/sessions`, honuBaseUrl);
  }

  /** Get outfit by ID */
  async getOutfit(outfitId: string, honuBaseUrl?: string): Promise<HonuOutfit | null> {
    return this.honuFetch<HonuOutfit>(`/api/outfit/${outfitId}`, honuBaseUrl);
  }

  /** Get outfit by tag */
  async getOutfitByTag(tag: string, honuBaseUrl?: string): Promise<HonuOutfit[] | null> {
    return this.honuFetch<HonuOutfit[]>(`/api/outfit/tag/${encodeURIComponent(tag)}`, honuBaseUrl);
  }

  /** Get outfit members */
  async getOutfitMembers(outfitId: string, honuBaseUrl?: string): Promise<HonuOutfitMember[] | null> {
    return this.honuFetch<HonuOutfitMember[]>(`/api/outfit/${outfitId}/members`, honuBaseUrl);
  }

  /** Get online outfit members */
  async getOutfitOnline(outfitId: string, honuBaseUrl?: string): Promise<HonuCharacter[] | null> {
    return this.honuFetch<HonuCharacter[]>(`/api/outfit/${outfitId}/online`, honuBaseUrl);
  }

  /** Get outfit activity */
  async getOutfitActivity(outfitId: string, honuBaseUrl?: string): Promise<unknown | null> {
    return this.honuFetch<unknown>(`/api/outfit/${outfitId}/activity`, honuBaseUrl);
  }

  /** Get world population */
  async getWorldPopulation(worldId: number, honuBaseUrl?: string): Promise<HonuWorldPopulation | null> {
    return this.honuFetch<HonuWorldPopulation>(`/api/population/${worldId}`, honuBaseUrl);
  }

  /** Get multiple world populations */
  async getMultipleWorldPopulation(worldIds?: number[], honuBaseUrl?: string): Promise<HonuWorldPopulation[] | null> {
    const ids = worldIds || ALL_WORLD_IDS;
    const query = ids.map((id) => `worldID=${id}`).join("&");
    return this.honuFetch<HonuWorldPopulation[]>(`/api/population/multiple?${query}`, honuBaseUrl);
  }

  /** Get zone population for a world */
  async getZonePopulation(worldId: number, honuBaseUrl?: string): Promise<HonuZonePopulation[] | null> {
    return this.honuFetch<HonuZonePopulation[]>(`/api/population/${worldId}/zones`, honuBaseUrl);
  }

  /** Get historical population */
  async getHistoricalPopulation(params: { worldId?: number; start?: string; end?: string }, honuBaseUrl?: string): Promise<unknown | null> {
    const query = new URLSearchParams();
    if (params.worldId) query.set("worldID", String(params.worldId));
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    return this.honuFetch<unknown>(`/api/population/historical?${query.toString()}`, honuBaseUrl);
  }

  /** Get outfit online count for a world */
  async getOutfitPopulation(worldId: number, honuBaseUrl?: string): Promise<unknown | null> {
    return this.honuFetch<unknown>(`/api/population/${worldId}/outfits`, honuBaseUrl);
  }

  /** Check Honu API health */
  async getHonuHealth(honuBaseUrl?: string): Promise<HonuHealth> {
    const result = await this.honuFetch<Record<string, unknown>>("/api/health", honuBaseUrl);
    return {
      isHealthy: result !== null,
      details: result || undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CENSUS CLIENT (supplementary)
  // ═══════════════════════════════════════════════════════════════

  private async censusFetch<T>(path: string, serviceId?: string): Promise<T | null> {
    const sid = serviceId || this.defaultCensusServiceId;
    const url = `https://census.daybreakgames.com/s:${sid}/json/get/ps2:v2${path}`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Heimdall-Bot/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        log.warn(`Census API ${res.status} for ${path}`);
        return null;
      }

      return (await res.json()) as T;
    } catch (error) {
      log.error(`Census API error for ${path}:`, error);
      return null;
    }
  }

  /** Fetch character from Census API by name (with outfit join) */
  async censusGetCharacterByName(name: string, serviceId?: string): Promise<CensusCharacter | null> {
    const result = await this.censusFetch<{ character_list: CensusCharacter[] }>(`/character/?name.first_lower=${encodeURIComponent(name.toLowerCase())}&c:join=outfit_member`, serviceId);
    return result?.character_list?.[0] || null;
  }

  /** Fetch character from Census API by ID */
  async censusGetCharacterById(charId: string, serviceId?: string): Promise<CensusCharacter | null> {
    const result = await this.censusFetch<{ character_list: CensusCharacter[] }>(`/character/?character_id=${charId}&c:join=outfit_member`, serviceId);
    return result?.character_list?.[0] || null;
  }

  /** Test Census API connectivity */
  async testCensusConnection(serviceId?: string): Promise<boolean> {
    const result = await this.censusFetch<{ character_list: unknown[] }>(`/character/?name.first_lower=wrel&c:limit=1`, serviceId);
    return result !== null && Array.isArray(result.character_list) && result.character_list.length > 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // FISU FALLBACK (population)
  // ═══════════════════════════════════════════════════════════════

  /** Fetch population from Fisu as fallback */
  async fisuGetPopulation(): Promise<FisuPopulation[] | null> {
    const serverIds = ALL_WORLD_IDS.join(",");
    try {
      const res = await fetch(`https://ps2.fisu.pw/api/population/?world=${serverIds}`, {
        headers: { "User-Agent": "Heimdall-Bot/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data?.result) return null;

      // Fisu returns { result: { "1": [...], "10": [...] } } for multi-world
      // and { result: [...] } for single-world queries
      const result = data.result;
      const entries: any[] = [];

      if (Array.isArray(result)) {
        // Single-world: result is an array directly
        entries.push(...result);
      } else if (typeof result === "object") {
        // Multi-world: result is keyed by world ID, each value is an array
        for (const worldEntries of Object.values(result)) {
          if (Array.isArray(worldEntries)) {
            // Take the latest entry (first) from each world
            if (worldEntries.length > 0) entries.push(worldEntries[0]);
          }
        }
      } else {
        return null;
      }

      return entries.map((entry: any) => ({
        worldId: entry.worldId,
        vs: entry.vs || 0,
        nc: entry.nc || 0,
        tr: entry.tr || 0,
        ns: entry.ns || 0,
      }));
    } catch (error) {
      log.error("Fisu API error:", error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UNIFIED METHODS (with fallback logic)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Look up a character by name — tries Honu first, falls back to Census.
   * Returns a normalized result.
   */
  async findCharacterByName(
    name: string,
    options?: { honuBaseUrl?: string; censusServiceId?: string },
  ): Promise<{
    characterId: string;
    characterName: string;
    factionId: number;
    serverId: number;
    battleRank: number;
    prestige: number;
    outfitId?: string;
    outfitTag?: string;
    outfitRank?: string;
    source: "honu" | "census";
  } | null> {
    // Try Honu first
    const honuChar = await this.getCharacterByName(name, options?.honuBaseUrl);
    if (honuChar) {
      return {
        characterId: honuChar.id,
        characterName: honuChar.name,
        factionId: honuChar.factionID,
        serverId: honuChar.worldID,
        battleRank: honuChar.battleRank,
        prestige: honuChar.prestige,
        outfitId: honuChar.outfitID,
        outfitTag: honuChar.outfitTag,
        source: "honu",
      };
    }

    // Fallback to Census
    const censusChar = await this.censusGetCharacterByName(name, options?.censusServiceId);
    if (censusChar) {
      return {
        characterId: censusChar.character_id,
        characterName: censusChar.name.first,
        factionId: parseInt(censusChar.faction_id),
        serverId: 0, // Census doesn't directly return world ID in this query
        battleRank: parseInt(censusChar.battle_rank.value),
        prestige: parseInt(censusChar.prestige_level || "0"),
        outfitId: censusChar.outfit_member?.outfit_id,
        outfitRank: censusChar.outfit_member?.rank,
        source: "census",
      };
    }

    return null;
  }

  /**
   * Verify a character is online (or recently logged in).
   * Returns verification result.
   */
  async verifyCharacter(
    charId: string,
    method: "online_now" | "recent_login",
    windowMinutes: number,
    options?: { honuBaseUrl?: string; censusServiceId?: string },
  ): Promise<{ verified: boolean; method: string; detail: string }> {
    if (method === "online_now") {
      const status = await this.getCharacterOnlineStatus(charId, options?.honuBaseUrl);
      if (status?.online) {
        return { verified: true, method: "online_now", detail: "Character is currently online" };
      }

      // Fallback to recent_login if Honu can't determine online status
      if (status === null) {
        log.warn(`Honu online check failed for ${charId}, falling back to Census recent_login`);
        return this.verifyCharacter(charId, "recent_login", windowMinutes, options);
      }

      return { verified: false, method: "online_now", detail: "Character is not currently online in PlanetSide 2" };
    }

    // recent_login method
    const censusChar = await this.censusGetCharacterById(charId, options?.censusServiceId);
    if (!censusChar) {
      return { verified: false, method: "recent_login", detail: "Character not found in Census API" };
    }

    const lastLogin = parseInt(censusChar.times.last_login) * 1000;
    const threshold = Date.now() - windowMinutes * 60 * 1000;

    if (lastLogin >= threshold) {
      return { verified: true, method: "recent_login", detail: `Logged in within the last ${windowMinutes} minutes` };
    }

    return {
      verified: false,
      method: "recent_login",
      detail: `Last login was <t:${Math.floor(lastLogin / 1000)}:R>, must be within ${windowMinutes} minutes`,
    };
  }

  /**
   * Get population data — tries Honu first, falls back to Fisu.
   */
  async getPopulation(source: "honu" | "fisu" = "honu", honuBaseUrl?: string): Promise<HonuWorldPopulation[] | null> {
    if (source === "honu") {
      const result = await this.getMultipleWorldPopulation(ALL_WORLD_IDS, honuBaseUrl);
      if (result) return result;

      // Fallback to fisu
      log.warn("Honu population failed, falling back to Fisu");
    }

    const fisuData = await this.fisuGetPopulation();
    if (!fisuData) return null;

    return fisuData.map((entry) => ({
      worldID: entry.worldId,
      worldName: WORLD_NAMES[entry.worldId],
      total: entry.vs + entry.nc + entry.tr + entry.ns,
      vs: entry.vs,
      nc: entry.nc,
      tr: entry.tr,
      ns: entry.ns,
    }));
  }
}
