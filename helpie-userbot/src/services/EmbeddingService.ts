/**
 * EmbeddingService - OpenAI embedding generation
 *
 * Handles vector embedding generation for text chunks using OpenAI's API.
 * Supports batch processing and rate limit handling.
 */

import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import log from "../utils/log";
import fetchEnvs from "../utils/FetchEnvs";

const env = fetchEnvs();

export class EmbeddingService {
  /**
   * Generates a single embedding for text
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      log.debug("Generating embedding", { textLength: text.length });

      const { embedding } = await embed({
        model: openai.embedding(env.OPENAI_EMBEDDING_MODEL),
        value: text,
      });

      log.debug("Embedding generated", { dimensions: embedding.length });
      return embedding;
    } catch (error) {
      log.error("Failed to generate embedding:", error);
      throw new Error(`Embedding generation failed: ${error}`);
    }
  }

  /**
   * Generates embeddings for multiple texts in batch
   * Automatically handles batching to respect API limits
   */
  static async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      log.debug("Generating batch embeddings", { count: texts.length });

      // OpenAI embedding API supports up to 2048 inputs per request
      const BATCH_SIZE = 2048;
      const allEmbeddings: number[][] = [];

      // Process in batches
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        log.debug(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`, {
          batchSize: batch.length,
        });

        const { embeddings } = await embedMany({
          model: openai.embedding(env.OPENAI_EMBEDDING_MODEL),
          values: batch,
        });

        allEmbeddings.push(...embeddings);

        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < texts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      log.info("Batch embeddings completed", {
        totalEmbeddings: allEmbeddings.length,
        dimensions: allEmbeddings[0]?.length || 0,
      });

      return allEmbeddings;
    } catch (error) {
      log.error("Failed to generate batch embeddings:", error);
      throw new Error(`Batch embedding generation failed: ${error}`);
    }
  }

  /**
   * Generates embedding for a user question (convenience method)
   */
  static async embedQuestion(question: string): Promise<number[]> {
    return this.generateEmbedding(question);
  }

  /**
   * Estimates cost for embedding generation
   * Based on OpenAI's text-embedding-3-small pricing: $0.02 / 1M tokens
   */
  static estimateCost(tokenCount: number): number {
    const COST_PER_MILLION_TOKENS = 0.02;
    return (tokenCount / 1_000_000) * COST_PER_MILLION_TOKENS;
  }
}
