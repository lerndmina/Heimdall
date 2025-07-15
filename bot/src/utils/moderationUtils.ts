import { ModerationCategory } from "../models/ModeratedChannels";
import { Moderation, ModerationCreateResponse } from "openai/resources/moderations";

// Use the OpenAI SDK types directly
export type OpenAIModerationResult = ModerationCreateResponse;

/**
 * Process the moderation results from OpenAI
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

  // Filter to only include enabled categories
  const categories: Record<string, boolean> = {};
  const categoryScores: Record<string, number> = {};

  // Cast the OpenAI categories to a Record to allow string indexing
  const resultCategories = result.categories as unknown as Record<string, boolean>;
  const resultScores = result.category_scores as unknown as Record<string, number>;

  enabledCategories.forEach((category) => {
    if (resultCategories[category] !== undefined) {
      categories[category] = resultCategories[category];
    }
    if (resultScores[category] !== undefined) {
      categoryScores[category] = resultScores[category];
    }
  });

  // Check if any enabled category is flagged
  const categoryFlagged = Object.entries(categories).some(
    ([category, isFlagged]) =>
      enabledCategories.includes(category as ModerationCategory) && isFlagged
  );

  return {
    flagged: categoryFlagged,
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
