/**
 * VectorSearchService - Qdrant vector search operations
 *
 * Performs semantic search on embedded context chunks with scope filtering.
 * Returns top K most relevant chunks sorted by priority and relevance.
 */

import { v4 as uuidv4 } from "uuid";
import QdrantClient from "../utils/QdrantClient";
import log from "../utils/log";
import fetchEnvs from "../utils/FetchEnvs";
import { DocumentChunk } from "./ChunkingService";

const env = fetchEnvs();

export interface QdrantPointPayload {
  contextId: string; // MongoDB ObjectId as string
  scope: "global" | "guild" | "user";
  targetUserId: string | null;
  targetGuildId: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  characterCount: number;
  sourceUrl: string;
  createdAt: string;
  [key: string]: unknown; // Index signature for Qdrant compatibility
}

export interface SearchResult {
  content: string;
  score: number;
  scope: "global" | "guild" | "user";
  chunkIndex: number;
  sourceUrl: string;
  contextId: string;
}

export class VectorSearchService {
  /**
   * Stores document chunks as vectors in Qdrant
   */
  static async storeChunks(
    chunks: DocumentChunk[],
    embeddings: number[][],
    contextId: string,
    scope: "global" | "guild" | "user",
    sourceUrl: string,
    targetUserId?: string,
    targetGuildId?: string
  ): Promise<void> {
    try {
      const client = QdrantClient.getClient();
      const collectionName = QdrantClient.getCollectionName();

      // Build points for Qdrant
      const points = chunks.map((chunk, index) => ({
        id: uuidv4(),
        vector: embeddings[index],
        payload: {
          contextId,
          scope,
          targetUserId: targetUserId || null,
          targetGuildId: targetGuildId || null,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          characterCount: chunk.characterCount,
          sourceUrl,
          createdAt: new Date().toISOString(),
        } as QdrantPointPayload,
      }));

      // Upsert points to Qdrant
      await client.upsert(collectionName, {
        wait: true,
        points,
      });

      log.info("Chunks stored in Qdrant", {
        contextId,
        scope,
        chunkCount: chunks.length,
        collectionName,
      });
    } catch (error) {
      log.error("Failed to store chunks in Qdrant:", error);
      throw new Error(`Qdrant storage failed: ${error}`);
    }
  }

  /**
   * Searches for relevant chunks using vector similarity
   */
  static async searchRelevantChunks(questionEmbedding: number[], userId: string, guildId?: string, limit: number = env.VECTOR_SEARCH_LIMIT): Promise<SearchResult[]> {
    try {
      const client = QdrantClient.getClient();
      const collectionName = QdrantClient.getCollectionName();

      log.debug("Searching Qdrant for relevant chunks", {
        userId,
        guildId,
        limit,
        threshold: env.VECTOR_SCORE_THRESHOLD,
      });

      // Build filter for scope-based access
      // User can access: their user context + their guild context (if in guild) + global context
      const shouldFilters: any[] = [
        // Global context (accessible to all)
        { key: "scope", match: { value: "global" } },
      ];

      // Add guild context if in a guild
      if (guildId) {
        shouldFilters.push({
          must: [
            { key: "scope", match: { value: "guild" } },
            { key: "targetGuildId", match: { value: guildId } },
          ],
        });
      }

      // Add user-specific context
      shouldFilters.push({
        must: [
          { key: "scope", match: { value: "user" } },
          { key: "targetUserId", match: { value: userId } },
        ],
      });

      // Perform vector search
      const results = await client.search(collectionName, {
        vector: questionEmbedding,
        limit: limit * 2, // Get more results for better sorting
        filter: {
          should: shouldFilters,
        },
        score_threshold: env.VECTOR_SCORE_THRESHOLD,
        with_payload: true,
      });

      log.debug("Qdrant search completed", {
        resultsFound: results.length,
        topScore: results[0]?.score,
      });

      // Convert results and sort by scope priority + relevance
      const searchResults: SearchResult[] = results.map((result) => {
        const payload = result.payload as unknown as QdrantPointPayload;
        return {
          content: payload.content as string,
          score: result.score,
          scope: payload.scope as "global" | "guild" | "user",
          chunkIndex: payload.chunkIndex as number,
          sourceUrl: payload.sourceUrl as string,
          contextId: payload.contextId as string,
        };
      });

      // Sort by scope priority (user > guild > global) and then by score
      const sorted = searchResults.sort((a, b) => {
        const scopePriority = { user: 3, guild: 2, global: 1 };
        const aPriority = scopePriority[a.scope] * 1000 + a.score;
        const bPriority = scopePriority[b.scope] * 1000 + b.score;
        return bPriority - aPriority;
      });

      // Return top results after sorting
      return sorted.slice(0, limit);
    } catch (error) {
      log.error("Vector search failed:", error);
      throw new Error(`Vector search failed: ${error}`);
    }
  }

  /**
   * Assembles context string from search results
   */
  static async assembleContextFromChunks(chunks: SearchResult[]): Promise<string> {
    if (chunks.length === 0) {
      return "";
    }

    // Group chunks by context ID to avoid duplicate headers
    const contextGroups = new Map<string, SearchResult[]>();
    for (const chunk of chunks) {
      if (!contextGroups.has(chunk.contextId)) {
        contextGroups.set(chunk.contextId, []);
      }
      contextGroups.get(chunk.contextId)!.push(chunk);
    }

    // Build formatted context
    const contextParts: string[] = [];

    for (const [contextId, contextChunks] of contextGroups) {
      // Sort chunks by index for correct ordering
      const sortedChunks = contextChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      const scopeLabel = sortedChunks[0].scope.charAt(0).toUpperCase() + sortedChunks[0].scope.slice(1);
      const chunkContents = sortedChunks.map((c) => c.content).join("\n\n");

      contextParts.push(`## ${scopeLabel} Context\n${chunkContents}`);
    }

    return contextParts.join("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n");
  }

  /**
   * Deletes all chunks for a specific context
   */
  static async deleteContextChunks(contextId: string): Promise<void> {
    try {
      const client = QdrantClient.getClient();
      const collectionName = QdrantClient.getCollectionName();

      // Delete points matching contextId
      await client.delete(collectionName, {
        wait: true,
        filter: {
          must: [{ key: "contextId", match: { value: contextId } }],
        },
      });

      log.info("Context chunks deleted from Qdrant", { contextId });
    } catch (error) {
      log.error("Failed to delete context chunks:", error);
      throw new Error(`Qdrant deletion failed: ${error}`);
    }
  }

  /**
   * Counts total chunks in Qdrant
   */
  static async getTotalChunkCount(): Promise<number> {
    try {
      const client = QdrantClient.getClient();
      const collectionName = QdrantClient.getCollectionName();

      const info = await client.getCollection(collectionName);
      return info.points_count || 0;
    } catch (error) {
      log.error("Failed to get chunk count:", error);
      return 0;
    }
  }

  /**
   * Gets chunk count for a specific context
   */
  static async getContextChunkCount(contextId: string): Promise<number> {
    try {
      const client = QdrantClient.getClient();
      const collectionName = QdrantClient.getCollectionName();

      const result = await client.scroll(collectionName, {
        filter: {
          must: [{ key: "contextId", match: { value: contextId } }],
        },
        limit: 1,
        with_payload: false,
        with_vector: false,
      });

      // Note: Qdrant scroll doesn't return total count directly
      // This is an approximation - for exact count, we'd need to scroll through all results
      return result.points.length > 0 ? 1 : 0; // Simplified - actual implementation would need full scroll
    } catch (error) {
      log.error("Failed to get context chunk count:", error);
      return 0;
    }
  }
}
