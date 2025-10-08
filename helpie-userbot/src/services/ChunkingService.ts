/**
 * ChunkingService - Document chunking with markdown awareness
 *
 * Splits large documents into semantic chunks suitable for embedding.
 * Preserves markdown structure and includes parent headers for context.
 */

import { Tiktoken, TiktokenModel, encodingForModel } from "js-tiktoken";
import log from "../utils/log";
import fetchEnvs from "../utils/FetchEnvs";

const env = fetchEnvs();

export interface DocumentChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  characterCount: number;
  headers: string[]; // Parent headers for context
}

export class ChunkingService {
  private static encoder: Tiktoken | null = null;

  /**
   * Gets or initializes the tiktoken encoder
   */
  private static getEncoder(): Tiktoken {
    if (!this.encoder) {
      // Use cl100k_base encoding (used by gpt-4, gpt-3.5-turbo, and text-embedding-3-*)
      this.encoder = encodingForModel(env.OPENAI_ASK_MODEL as TiktokenModel);
    }
    return this.encoder;
  }

  /**
   * Estimates token count for a text string
   */
  static estimateTokenCount(text: string): number {
    try {
      const encoder = this.getEncoder();
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch (error) {
      log.error("Token counting failed, using fallback estimation:", error);
      // Fallback: ~4 characters per token (rough estimate)
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Extracts markdown headers from text
   */
  private static extractHeaders(text: string): { level: number; text: string }[] {
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    const headers: { level: number; text: string }[] = [];
    let match;

    while ((match = headerRegex.exec(text)) !== null) {
      headers.push({
        level: match[1].length,
        text: match[2].trim(),
      });
    }

    return headers;
  }

  /**
   * Splits text into semantic chunks with markdown awareness
   */
  static async chunkDocument(content: string, sourceUrl: string): Promise<DocumentChunk[]> {
    log.debug("Starting document chunking", {
      contentLength: content.length,
      targetChunkSize: env.EMBEDDING_CHUNK_SIZE,
      overlap: env.EMBEDDING_CHUNK_OVERLAP,
    });

    const chunks: DocumentChunk[] = [];
    const lines = content.split("\n");
    let currentChunk: string[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;
    let headerStack: string[] = []; // Track hierarchical headers

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.estimateTokenCount(line);

      // Track markdown headers for context
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2].trim();

        // Update header stack (remove headers of same or lower level)
        headerStack = headerStack.filter((h) => {
          const stackLevel = (h.match(/^#+/) || [""])[0].length;
          return stackLevel < level;
        });
        headerStack.push(line);
      }

      // Check if adding this line would exceed chunk size
      if (currentTokens + lineTokens > env.EMBEDDING_CHUNK_SIZE && currentChunk.length > 0) {
        // Save current chunk
        const chunkContent = this.buildChunkWithHeaders(currentChunk, headerStack);
        const actualTokens = this.estimateTokenCount(chunkContent);

        chunks.push({
          content: chunkContent,
          chunkIndex: chunkIndex++,
          tokenCount: actualTokens,
          characterCount: chunkContent.length,
          headers: [...headerStack],
        });

        // Start new chunk with overlap
        const overlapLines = this.getOverlapLines(currentChunk, env.EMBEDDING_CHUNK_OVERLAP);
        currentChunk = overlapLines;
        currentTokens = this.estimateTokenCount(currentChunk.join("\n"));
      }

      // Add line to current chunk
      currentChunk.push(line);
      currentTokens += lineTokens;
    }

    // Save final chunk if it has content
    if (currentChunk.length > 0) {
      const chunkContent = this.buildChunkWithHeaders(currentChunk, headerStack);
      const actualTokens = this.estimateTokenCount(chunkContent);

      chunks.push({
        content: chunkContent,
        chunkIndex: chunkIndex++,
        tokenCount: actualTokens,
        characterCount: chunkContent.length,
        headers: [...headerStack],
      });
    }

    log.info("Document chunking completed", {
      sourceUrl,
      totalChunks: chunks.length,
      avgTokensPerChunk: chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    });

    return chunks;
  }

  /**
   * Builds chunk content with parent headers for context
   */
  private static buildChunkWithHeaders(lines: string[], headers: string[]): string {
    // Only prepend headers if they're not already in the chunk
    const chunkText = lines.join("\n");
    const missingHeaders = headers.filter((h) => !chunkText.includes(h));

    if (missingHeaders.length > 0) {
      return `${missingHeaders.join("\n")}\n\n${chunkText}`;
    }

    return chunkText;
  }

  /**
   * Gets the last N tokens worth of lines for overlap
   */
  private static getOverlapLines(lines: string[], targetOverlapTokens: number): string[] {
    const overlapLines: string[] = [];
    let overlapTokens = 0;

    // Start from end and work backwards
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const lineTokens = this.estimateTokenCount(line);

      if (overlapTokens + lineTokens > targetOverlapTokens) {
        break;
      }

      overlapLines.unshift(line);
      overlapTokens += lineTokens;
    }

    return overlapLines;
  }

  /**
   * Validates if content is suitable for chunking
   */
  static validateContent(content: string): { valid: boolean; error?: string } {
    if (!content || content.trim().length === 0) {
      return { valid: false, error: "Content is empty" };
    }

    if (content.length > 10_000_000) {
      // 10MB limit
      return { valid: false, error: "Content exceeds 10MB size limit" };
    }

    const tokenCount = this.estimateTokenCount(content);
    if (tokenCount < 10) {
      return { valid: false, error: "Content too short (less than 10 tokens)" };
    }

    return { valid: true };
  }

  /**
   * Cleanup encoder when done (call on shutdown)
   */
  static cleanup(): void {
    if (this.encoder) {
      // Note: js-tiktoken doesn't have a free() method like the native version
      this.encoder = null;
    }
  }
}
