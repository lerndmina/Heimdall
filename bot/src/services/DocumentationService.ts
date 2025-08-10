import ModmailDocumentation, { IModmailDocumentation } from "../models/ModmailDocumentation";
import Database from "../utils/data/database";
import log from "../utils/log";

export class DocumentationService {
  private db: Database;

  constructor() {
    this.db = new Database();
  }

  /**
   * Import documentation from URL and store in database
   */
  async importFromUrl(
    guildId: string,
    url: string,
    type: "global" | "category",
    categoryId?: string
  ): Promise<{ success: boolean; error?: string; documentation?: IModmailDocumentation }> {
    try {
      // Fetch documentation from URL
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Heimdall-Discord-Bot/1.0",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            success: false,
            error: `Failed to fetch documentation: ${response.status} ${response.statusText}`,
          };
        }

        const documentation = await response.text();

        // Store in database
        const result = await this.storeDocumentation(guildId, documentation, type, categoryId, url);

        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      log.error("Error importing documentation from URL:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Store documentation in database
   */
  async storeDocumentation(
    guildId: string,
    documentation: string,
    type: "global" | "category",
    categoryId?: string,
    sourceUrl?: string,
    metadata?: {
      learnedFrom?: {
        threadCount: number;
        lastLearnedAt: Date;
      };
      uploadedBy?: {
        userId: string;
        uploadedAt: Date;
      };
    }
  ): Promise<{ success: boolean; error?: string; documentation?: IModmailDocumentation }> {
    try {
      // Validate inputs
      if (type === "category" && !categoryId) {
        return { success: false, error: "Category ID is required for category documentation" };
      }

      if (documentation.length > 50000) {
        return { success: false, error: "Documentation is too long (max 50,000 characters)" };
      }

      // Upsert documentation
      const filter = {
        guildId,
        type,
        ...(categoryId && { categoryId }),
      };

      const updateData = {
        guildId,
        type,
        documentation,
        sourceUrl,
        lastUpdated: new Date(),
        ...(categoryId && { categoryId }),
        ...(metadata?.learnedFrom && { learnedFrom: metadata.learnedFrom }),
        ...(metadata?.uploadedBy && { uploadedBy: metadata.uploadedBy }),
      };

      const result = await this.db.findOneAndUpdate(
        ModmailDocumentation,
        filter,
        { $set: updateData },
        { upsert: true, new: true }
      );

      if (!result) {
        return { success: false, error: "Failed to store documentation" };
      }

      log.info(
        `Stored ${type} documentation for guild ${guildId}${
          categoryId ? ` category ${categoryId}` : ""
        }`
      );

      return { success: true, documentation: result };
    } catch (error) {
      log.error("Error storing documentation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Get documentation for AI context
   */
  async getDocumentationForAI(
    guildId: string,
    categoryId?: string,
    includeGlobal = true
  ): Promise<string> {
    let documentationContent = "";

    try {
      // PRIORITY ORDER: Category-specific documentation first (higher priority)
      if (categoryId) {
        const categoryDocs = await this.getDocumentation(guildId, "category", categoryId);
        if (categoryDocs) {
          documentationContent += `\n\n--- Category Documentation (PRIORITY) ---\n${categoryDocs.documentation}`;
        }
      }

      // FALLBACK: Global documentation second (lower priority, use when category docs don't cover the topic)
      if (includeGlobal) {
        const globalDocs = await this.getDocumentation(guildId, "global");
        if (globalDocs) {
          documentationContent += `\n\n--- Server Documentation (FALLBACK) ---\n${globalDocs.documentation}`;
        }
      }

      return documentationContent;
    } catch (error) {
      log.error("Error getting documentation for AI:", error);
      return "";
    }
  }

  /**
   * Get specific documentation
   */
  async getDocumentation(
    guildId: string,
    type: "global" | "category",
    categoryId?: string
  ): Promise<IModmailDocumentation | null> {
    const filter = {
      guildId,
      type,
      ...(categoryId && { categoryId }),
    };

    return await this.db.findOne(ModmailDocumentation, filter);
  }

  /**
   * Delete documentation
   */
  async deleteDocumentation(
    guildId: string,
    type: "global" | "category",
    categoryId?: string
  ): Promise<boolean> {
    try {
      const filter = {
        guildId,
        type,
        ...(categoryId && { categoryId }),
      };

      await this.db.deleteOne(ModmailDocumentation, filter);
      return true;
    } catch (error) {
      log.error("Error deleting documentation:", error);
      return false;
    }
  }

  /**
   * Get all documentation for a guild (for admin overview)
   */
  async getAllDocumentation(guildId: string): Promise<IModmailDocumentation[]> {
    try {
      return await ModmailDocumentation.find({ guildId }).exec();
    } catch (error) {
      log.error("Error getting all documentation:", error);
      return [];
    }
  }

  /**
   * Export documentation as text for download
   */
  exportDocumentationAsText(docs: IModmailDocumentation[]): string {
    if (docs.length === 0) {
      return "No documentation found.";
    }

    let exportText = `# Documentation Export\nGenerated: ${new Date().toISOString()}\n\n`;

    for (const doc of docs) {
      exportText += `## ${doc.type.toUpperCase()}${
        doc.categoryId ? ` - Category: ${doc.categoryId}` : ""
      }\n`;
      exportText += `Last Updated: ${doc.lastUpdated.toISOString()}\n`;
      exportText += `Version: ${doc.version}\n`;
      if (doc.sourceUrl) {
        exportText += `Source URL: ${doc.sourceUrl}\n`;
      }
      if (doc.learnedFrom?.threadCount) {
        exportText += `Learned from ${doc.learnedFrom.threadCount} threads\n`;
      }
      exportText += `Characters: ${doc.metadata?.characterCount || 0}\n`;
      exportText += `Words: ${doc.metadata?.wordCount || 0}\n\n`;
      exportText += doc.documentation;
      exportText += "\n\n" + "=".repeat(80) + "\n\n";
    }

    return exportText;
  }
}
