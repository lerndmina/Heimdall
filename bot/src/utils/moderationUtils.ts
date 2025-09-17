import { ModerationCategory } from "../models/ModeratedChannels";
import { Moderation, ModerationCreateResponse } from "openai/resources/moderations";
import { applyCustomThresholds } from "./moderationThresholds";

// Use the OpenAI SDK types directly
export type OpenAIModerationResult = ModerationCreateResponse;

/**
 * Process the moderation results from OpenAI using custom optimized thresholds
 * This replaces OpenAI's binary flagging with our data-driven thresholds
 */
export function processModerationResult(
  moderationResult: OpenAIModerationResult,
  enabledCategories: ModerationCategory[] = Object.values(ModerationCategory)
): {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
} {
  const result = moderationResult.results[0];

  // Get the raw confidence scores from OpenAI
  const rawScores = result.category_scores as unknown as Record<string, number>;

  // Apply our custom thresholds instead of using OpenAI's binary flags
  const thresholdResult = applyCustomThresholds(rawScores, enabledCategories);

  // Convert flagged categories array back to the expected format
  const categories: Record<string, boolean> = {};
  const categoryScores: Record<string, number> = {};

  enabledCategories.forEach((category) => {
    // Set flagged status based on our custom thresholds
    categories[category] = thresholdResult.flaggedCategories.includes(category);

    // Include confidence scores for all enabled categories
    if (thresholdResult.confidenceScores[category] !== undefined) {
      categoryScores[category] = thresholdResult.confidenceScores[category];
    }
  });

  return {
    flagged: thresholdResult.flagged,
    categories,
    categoryScores,
  };
}

/**
 * Format a category name for display (converts from 'category/subcategory' format to human-readable)
 */
export function formatCategoryName(category: ModerationCategory): string {
  switch (category) {
    case ModerationCategory.SEXUAL:
      return "Sexual Content";
    case ModerationCategory.SEXUAL_MINORS:
      return "Sexual Content (Minors)";
    case ModerationCategory.HARASSMENT:
      return "Harassment";
    case ModerationCategory.HARASSMENT_THREATENING:
      return "Threatening Harassment";
    case ModerationCategory.HATE:
      return "Hate Speech";
    case ModerationCategory.HATE_THREATENING:
      return "Threatening Hate Speech";
    case ModerationCategory.ILLICIT:
      return "Illegal Activity";
    case ModerationCategory.ILLICIT_VIOLENT:
      return "Violent Illegal Activity";
    case ModerationCategory.SELF_HARM:
      return "Self-Harm Content";
    case ModerationCategory.SELF_HARM_INTENT:
      return "Self-Harm Intent";
    case ModerationCategory.SELF_HARM_INSTRUCTIONS:
      return "Self-Harm Instructions";
    case ModerationCategory.VIOLENCE:
      return "Violence";
    case ModerationCategory.VIOLENCE_GRAPHIC:
      return "Graphic Violence";
    default:
      return "Unknown Category";
  }
}
