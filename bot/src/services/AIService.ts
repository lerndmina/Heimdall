import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import log from "../utils/log";
import FetchEnvs from "../utils/FetchEnvs";

const env = FetchEnvs();

export enum AIUseCase {
  TitleGeneration = "title-generation",
  CodeGeneration = "code-generation",
  Summarization = "summarization",
  ChatResponse = "chat-response",
  Translation = "translation",
  General = "general",
}

export interface AIServiceOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export class AIService {
  private defaultModel: string;

  constructor() {
    this.defaultModel = "gpt-5-mini"; // Default to a reliable model
  }

  /**
   * Generate text using the specified model
   */
  async generateText(
    prompt: string,
    options: AIServiceOptions = {}
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const { model = this.defaultModel, maxTokens = 150, temperature, systemPrompt } = options;

      log.debug("Generating text with AI", {
        model,
        promptLength: prompt.length,
        maxTokens,
        temperature,
        hasSystemPrompt: !!systemPrompt,
      });

      // Build generation options
      const generateOptions: any = {
        model: openai(model),
        prompt,
        maxTokens,
      };

      // Add system prompt if provided
      if (systemPrompt) {
        generateOptions.system = systemPrompt;
      }

      // Only add temperature for models that support it
      if (temperature !== undefined && this.supportsTemperature(model)) {
        generateOptions.temperature = temperature;
      }

      const result = await generateText(generateOptions);

      log.debug("AI text generation completed", {
        model,
        textLength: result.text?.length || 0,
        usage: result.usage,
      });

      if (!result.text) {
        return {
          success: false,
          error: "No content received from AI model",
        };
      }

      return {
        success: true,
        text: result.text.trim(),
      };
    } catch (error: any) {
      log.error("AI text generation failed", {
        error: error.message,
        model: options.model || this.defaultModel,
      });

      return {
        success: false,
        error: error.message || "Unknown AI generation error",
      };
    }
  }

  /**
   * Generate a suggestion title
   */
  async generateSuggestionTitle(suggestion: string, reason?: string): Promise<string> {
    const systemPrompt = `You are a title generating service. You will be provided with a suggestion and you will generate a short, clear, and descriptive title for it that is between 20-100 characters. Focus on the main feature or improvement being suggested.`;

    let prompt = suggestion;
    if (reason) {
      prompt += `\n\nThe reason for this suggestion is: ${reason}`;
    }

    const result = await this.generateText(prompt, {
      systemPrompt,
      maxTokens: 50, // Shorter for titles
      model: this.getRecommendedModel(AIUseCase.TitleGeneration),
    });

    if (result.success && result.text) {
      return result.text.trim();
    }

    log.warn("Failed to generate suggestion title, using fallback");
    return "Untitled Suggestion";
  }

  /**
   * Check if a model supports temperature parameter
   */
  private supportsTemperature(model: string): boolean {
    // GPT-5 models and some newer models don't support temperature
    const noTemperatureModels = [
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "o1",
      "o1-pro",
      "o1-mini",
      "o3",
      "o3-mini",
      "o4-mini",
    ];

    return !noTemperatureModels.some((noTempModel) => model.includes(noTempModel));
  }

  /**
   * Get recommended model for specific use cases
   */
  private getRecommendedModel(useCase: AIUseCase): string {
    const recommendations: Record<AIUseCase, string> = {
      [AIUseCase.TitleGeneration]: "gpt-5-nano", // Fast and good for simple tasks
      [AIUseCase.CodeGeneration]: "gpt-4o", // Better for complex tasks
      [AIUseCase.Summarization]: "gpt-5-nano", // Cheap for summarization
      [AIUseCase.ChatResponse]: "gpt-5-mini", // Good balance for conversational AI
      [AIUseCase.Translation]: "gpt-5-mini", // Good for language tasks
      [AIUseCase.General]: this.defaultModel,
    };

    return recommendations[useCase] || this.defaultModel;
  }

  /**
   * Set the default model
   */
  setDefaultModel(model: string): void {
    this.defaultModel = model;
    log.info("Default AI model updated", { model });
  }

  /**
   * Get current default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Test AI service connectivity
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.generateText("Hello", {
        maxTokens: 5,
        model: this.getRecommendedModel(AIUseCase.General), // Use general model for testing
      });

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;
