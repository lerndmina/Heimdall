/**
 * ContextProcessingService - Orchestrates context chunking and embedding
 *
 * Handles the full workflow of processing context documents:
 * - Fetch content from GitHub
 * - Chunk into semantic segments
 * - Generate embeddings
 * - Store in Qdrant
 * - Update MongoDB metadata
 */

import crypto from "crypto";
import HelpieContext from "../models/HelpieContext";
import { ContextService } from "./ContextService";
import { ChunkingService } from "./ChunkingService";
import { EmbeddingService } from "./EmbeddingService";
import { VectorSearchService } from "./VectorSearchService";
import log from "../utils/log";

export interface ProcessingResult {
  success: boolean;
  contextId: string;
  chunkCount?: number;
  totalTokens?: number;
  error?: string;
}

export class ContextProcessingService {
  /**
   * Processes a context document (chunking + embedding)
   */
  static async processContext(contextId: string): Promise<ProcessingResult> {
    try {
      log.info("Starting context processing", { contextId });

      // 1. Fetch context from database
      const context = await HelpieContext.findById(contextId);
      if (!context) {
        return {
          success: false,
          contextId,
          error: "Context not found in database",
        };
      }

      // 2. Fetch content from GitHub
      log.debug("Fetching content from GitHub", { url: context.githubUrl });
      const content = await ContextService.fetchGitHubContent(context.githubUrl);

      // 3. Validate content
      const validation = ChunkingService.validateContent(content);
      if (!validation.valid) {
        await HelpieContext.findByIdAndUpdate(contextId, {
          $set: {
            isProcessed: false,
            processingError: validation.error,
          },
        });
        return {
          success: false,
          contextId,
          error: validation.error,
        };
      }

      // 4. Calculate content hash for change detection
      const contentHash = crypto.createHash("sha256").update(content).digest("hex");

      // 5. Check if content changed (skip if same hash)
      if (context.contentHash === contentHash && context.isProcessed) {
        log.info("Content unchanged, skipping processing", { contextId });
        return {
          success: true,
          contextId,
          chunkCount: context.chunkCount,
        };
      }

      // 6. Delete old chunks if refreshing
      if (context.isProcessed) {
        log.debug("Deleting old chunks", { contextId });
        await VectorSearchService.deleteContextChunks(contextId);
      }

      // 7. Chunk the document
      log.debug("Chunking document", { contentLength: content.length });
      const chunks = await ChunkingService.chunkDocument(content, context.githubUrl);

      if (chunks.length === 0) {
        return {
          success: false,
          contextId,
          error: "No chunks generated from content",
        };
      }

      // 8. Generate embeddings for all chunks
      log.debug("Generating embeddings", { chunkCount: chunks.length });
      const chunkTexts = chunks.map((c) => c.content);
      const embeddings = await EmbeddingService.generateBatchEmbeddings(chunkTexts);

      // 9. Store chunks in Qdrant
      log.debug("Storing chunks in Qdrant");
      await VectorSearchService.storeChunks(chunks, embeddings, contextId, context.scope, context.githubUrl, context.targetUserId, context.targetGuildId);

      // 10. Update context metadata in MongoDB
      const totalTokens = chunks.reduce((sum, c) => c.tokenCount, 0);
      await HelpieContext.findByIdAndUpdate(contextId, {
        $set: {
          isProcessed: true,
          processingError: undefined,
          chunkCount: chunks.length,
          lastProcessed: new Date(),
          contentHash,
          characterCount: content.length,
          wordCount: content.split(/\s+/).filter((w) => w.length > 0).length,
        },
      });

      log.info("Context processing completed successfully", {
        contextId,
        chunkCount: chunks.length,
        totalTokens,
        estimatedCost: EmbeddingService.estimateCost(totalTokens),
      });

      return {
        success: true,
        contextId,
        chunkCount: chunks.length,
        totalTokens,
      };
    } catch (error) {
      log.error("Context processing failed:", error);

      // Update context with error
      await HelpieContext.findByIdAndUpdate(contextId, {
        $set: {
          isProcessed: false,
          processingError: error instanceof Error ? error.message : String(error),
          lastProcessed: new Date(),
        },
      });

      return {
        success: false,
        contextId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Refreshes a context (re-fetches and re-processes)
   */
  static async refreshContext(contextId: string): Promise<ProcessingResult> {
    log.info("Refreshing context", { contextId });

    // Mark as unprocessed to force re-processing
    await HelpieContext.findByIdAndUpdate(contextId, {
      $set: {
        isProcessed: false,
        contentHash: "", // Clear hash to force re-processing
      },
    });

    return await this.processContext(contextId);
  }

  /**
   * Deletes all chunks for a context
   */
  static async deleteContextChunks(contextId: string): Promise<void> {
    try {
      await VectorSearchService.deleteContextChunks(contextId);

      // Update context metadata
      await HelpieContext.findByIdAndUpdate(contextId, {
        $set: {
          isProcessed: false,
          chunkCount: 0,
          contentHash: "",
        },
      });

      log.info("Context chunks deleted", { contextId });
    } catch (error) {
      log.error("Failed to delete context chunks:", error);
      throw error;
    }
  }

  /**
   * Detects if content has changed since last processing
   */
  static async detectContentChange(contextId: string): Promise<boolean> {
    try {
      const context = await HelpieContext.findById(contextId);
      if (!context) return false;

      // Fetch current content
      const content = await ContextService.fetchGitHubContent(context.githubUrl);
      const currentHash = crypto.createHash("sha256").update(content).digest("hex");

      return currentHash !== context.contentHash;
    } catch (error) {
      log.error("Failed to detect content change:", error);
      return false;
    }
  }

  /**
   * Processes all unprocessed contexts
   */
  static async processAllUnprocessed(): Promise<ProcessingResult[]> {
    try {
      const unprocessedContexts = await HelpieContext.find({
        $or: [{ isProcessed: false }, { isProcessed: { $exists: false } }],
      });

      log.info("Processing all unprocessed contexts", {
        count: unprocessedContexts.length,
      });

      const results: ProcessingResult[] = [];

      for (const context of unprocessedContexts) {
        const result = await this.processContext(context._id.toString());
        results.push(result);

        // Small delay between contexts to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return results;
    } catch (error) {
      log.error("Failed to process all unprocessed contexts:", error);
      throw error;
    }
  }

  /**
   * Gets processing statistics
   */
  static async getProcessingStats(): Promise<{
    totalContexts: number;
    processedContexts: number;
    unprocessedContexts: number;
    totalChunks: number;
  }> {
    try {
      const totalContexts = await HelpieContext.countDocuments();
      const processedContexts = await HelpieContext.countDocuments({ isProcessed: true });
      const unprocessedContexts = totalContexts - processedContexts;
      const totalChunks = await VectorSearchService.getTotalChunkCount();

      return {
        totalContexts,
        processedContexts,
        unprocessedContexts,
        totalChunks,
      };
    } catch (error) {
      log.error("Failed to get processing stats:", error);
      throw error;
    }
  }
}
