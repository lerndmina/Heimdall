#!/usr/bin/env bun
/**
 * Temporary script to analyze AI moderation reports and identify patterns
 * This script connects to the MongoDB database and analyzes ModerationHit data
 */

import mongoose from "mongoose";
import { join } from "path";

// Import FetchEnvs from the bot
import FetchEnvs from "../../bot/src/utils/FetchEnvs";

// Import the ModerationHit model and enums
const ModerationHitSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
  userId: { type: String, required: true },
  messageContent: { type: String, required: true },
  flaggedCategories: { type: [String], required: true },
  confidenceScores: { type: Map, of: Number, required: true },
  contentTypes: { type: [String], default: ["text"] },
  status: { type: String, required: true },
  moderatorId: { type: String },
  actionTaken: { type: String },
  moderatorNotes: { type: String },
  moderatorActionAt: { type: Date },
  messageExists: { type: Boolean, default: true },
}, { timestamps: true });

const ModerationHit = mongoose.model("ModerationHit", ModerationHitSchema);

enum ModerationHitStatus {
  PENDING = "pending",
  ACCEPTED = "accepted", 
  IGNORED = "ignored",
  AUTO_DELETED = "auto_deleted",
}

enum ModerationCategory {
  SEXUAL = "sexual",
  SEXUAL_MINORS = "sexual/minors",
  HARASSMENT = "harassment",
  HARASSMENT_THREATENING = "harassment/threatening",
  HATE = "hate",
  HATE_THREATENING = "hate/threatening",
  ILLICIT = "illicit",
  ILLICIT_VIOLENT = "illicit/violent",
  SELF_HARM = "self-harm",
  SELF_HARM_INTENT = "self-harm/intent",
  SELF_HARM_INSTRUCTIONS = "self-harm/instructions",
  VIOLENCE = "violence",
  VIOLENCE_GRAPHIC = "violence/graphic",
  OTHER = "other",
}

interface AnalysisResult {
  metadata: {
    totalReports: number;
    dateRange: { start: string; end: string };
    analysisTimestamp: string;
  };
  statusBreakdown: {
    counts: Record<string, number>;
    percentages: Record<string, number>;
    falsePositiveRate: number;
  };
  categoryAnalysis: {
    [category: string]: {
      totalReports: number;
      acceptedCount: number;
      ignoredCount: number;
      falsePositiveRate: number;
      avgConfidenceAccepted: number;
      avgConfidenceIgnored: number;
      confidenceGap: number;
      suggestedThresholdIncrease: number;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
    };
  };
  overallMetrics: {
    currentEffectiveness: number;
    estimatedStaffHours: number;
    potentialSavings: number;
  };
  actionableInsights: {
    immediateActions: string[];
    mediumTermActions: string[];
    monitoringPoints: string[];
  };
}

async function connectToDatabase(): Promise<void> {
  try {
    const env = FetchEnvs();
    const mongoUri = env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

async function analyzeReports(): Promise<AnalysisResult> {
  console.log("📊 Analyzing moderation reports...");

  // Get all reports with date range
  const totalReports = await ModerationHit.countDocuments();
  console.log(`Found ${totalReports} total reports`);

  if (totalReports === 0) {
    throw new Error("No moderation reports found in database");
  }

  // Get date range
  const oldestReport = await ModerationHit.findOne().sort({ createdAt: 1 });
  const newestReport = await ModerationHit.findOne().sort({ createdAt: -1 });

  // Status breakdown
  const statusBreakdown = await ModerationHit.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const statusCounts = statusBreakdown.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {} as Record<string, number>);

  const acceptedCount = statusCounts.accepted || 0;
  const ignoredCount = statusCounts.ignored || 0;
  const totalProcessed = acceptedCount + ignoredCount;
  
  const statusPercentages = Object.entries(statusCounts).reduce((acc: Record<string, number>, [status, count]) => {
    acc[status] = (count / totalReports) * 100;
    return acc;
  }, {});

  const falsePositiveRate = totalProcessed > 0 ? (ignoredCount / totalProcessed) * 100 : 0;

  console.log("Status breakdown:", statusCounts);
  console.log(`False positive rate: ${falsePositiveRate.toFixed(1)}%`);

  // Category analysis
  const categoryAnalysis = await analyzeCategoriesForActionableInsights();

  // Calculate overall metrics
  const currentEffectiveness = totalProcessed > 0 ? (acceptedCount / totalProcessed) * 100 : 0;
  const estimatedStaffHours = totalProcessed * 0.05; // Assume 3 minutes per report review
  const potentialSavingsPercent = Object.values(categoryAnalysis).reduce((sum, cat) => 
    sum + (cat.falsePositiveRate > 50 ? cat.falsePositiveRate * 0.3 : 0), 0) / Object.keys(categoryAnalysis).length;
  const potentialSavings = (potentialSavingsPercent / 100) * estimatedStaffHours;

  // Generate actionable insights
  const actionableInsights = generateActionableInsights(categoryAnalysis, falsePositiveRate);

  return {
    metadata: {
      totalReports,
      dateRange: {
        start: oldestReport?.createdAt.toISOString() || '',
        end: newestReport?.createdAt.toISOString() || ''
      },
      analysisTimestamp: new Date().toISOString()
    },
    statusBreakdown: {
      counts: statusCounts,
      percentages: statusPercentages,
      falsePositiveRate
    },
    categoryAnalysis,
    overallMetrics: {
      currentEffectiveness,
      estimatedStaffHours,
      potentialSavings
    },
    actionableInsights
  };
}
}

function analyzeCategoryData(reports: any[]) {
  const categoryData: Record<string, { count: number; avgConfidence: number; examples: string[] }> = {};

  reports.forEach(report => {
    report.flaggedCategories.forEach((category: string) => {
      if (!categoryData[category]) {
        categoryData[category] = { count: 0, avgConfidence: 0, examples: [] };
      }
      categoryData[category].count++;
      
      // Get confidence score for this category
      const confidence = report.confidenceScores.get(category) || 0;
      categoryData[category].avgConfidence += confidence;
      
      // Add message example (truncated)
      if (categoryData[category].examples.length < 5) {
        const example = report.messageContent.substring(0, 100);
        categoryData[category].examples.push(example);
      }
    });
  });

  // Calculate averages
  Object.values(categoryData).forEach(data => {
    data.avgConfidence = data.avgConfidence / data.count;
  });

  return categoryData;
}

function analyzeConfidenceThresholds(reports: any[]) {
  const thresholds: Record<string, { min: number; max: number; avg: number }> = {};

  reports.forEach(report => {
    report.flaggedCategories.forEach((category: string) => {
      const confidence = report.confidenceScores.get(category) || 0;
      
      if (!thresholds[category]) {
        thresholds[category] = { min: confidence, max: confidence, avg: 0 };
      }
      
      thresholds[category].min = Math.min(thresholds[category].min, confidence);
      thresholds[category].max = Math.max(thresholds[category].max, confidence);
      thresholds[category].avg += confidence;
    });
  });

  // Calculate averages
  Object.entries(thresholds).forEach(([category, data]) => {
    const categoryReports = reports.filter(r => r.flaggedCategories.includes(category));
    data.avg = data.avg / categoryReports.length;
  });

  return thresholds;
}

async function analyzePatterns(acceptedReports: any[], ignoredReports: any[]) {
  // Extract common phrases/words from accepted vs ignored reports
  const acceptedWords = extractCommonWords(acceptedReports.map(r => r.messageContent));
  const ignoredWords = extractCommonWords(ignoredReports.map(r => r.messageContent));

  // Find phrases more common in ignored reports (potential false positives)
  const commonIgnoredPhrases = ignoredWords.slice(0, 20);
  const commonAcceptedPhrases = acceptedWords.slice(0, 20);

  // Time pattern analysis
  const timePatterns = {
    acceptedByHour: analyzeTimePatterns(acceptedReports),
    ignoredByHour: analyzeTimePatterns(ignoredReports)
  };

  return {
    commonIgnoredPhrases,
    commonAcceptedPhrases,
    timePatterns
  };
}

function extractCommonWords(messages: string[]): string[] {
  const wordCount: Record<string, number> = {};
  
  messages.forEach(message => {
    // Simple word extraction (could be improved with NLP)
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 3); // Filter out short words
    
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });

  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 50)
    .map(([word]) => word);
}

function analyzeTimePatterns(reports: any[]) {
  const hourCounts = new Array(24).fill(0);
  
  reports.forEach(report => {
    const hour = new Date(report.createdAt).getHours();
    hourCounts[hour]++;
  });

  return hourCounts;
}

function generateRecommendations(
  categoryAnalysis: any,
  confidenceThresholds: any,
  statusCounts: Record<string, number>
): string[] {
  const recommendations: string[] = [];
  const ignoredRate = (statusCounts.ignored || 0) / (statusCounts.ignored + statusCounts.accepted || 1);

  recommendations.push(`Current ignore rate: ${(ignoredRate * 100).toFixed(1)}%`);

  if (ignoredRate > 0.7) {
    recommendations.push("⚠️ High ignore rate detected! Consider raising confidence thresholds.");
  }

  // Analyze categories with high ignore rates
  Object.entries(categoryAnalysis.ignored).forEach(([category, data]: [string, any]) => {
    const acceptedData = categoryAnalysis.accepted[category];
    if (acceptedData && data.count > acceptedData.count * 2) {
      recommendations.push(`⚠️ Category "${category}" has high false positive rate. Consider raising threshold from ${data.avgConfidence.toFixed(3)} to ${(data.avgConfidence + 0.1).toFixed(3)}`);
    }
  });

  // Suggest confidence threshold adjustments
  Object.entries(confidenceThresholds.ignored).forEach(([category, thresholds]: [string, any]) => {
    if (thresholds.avg > 0.5) {
      recommendations.push(`📊 For "${category}": Ignored reports avg confidence is ${thresholds.avg.toFixed(3)}. Consider raising threshold to ${(thresholds.avg + 0.1).toFixed(3)}`);
    }
  });

  return recommendations;
}

async function main() {
  try {
    await connectToDatabase();
    
    const analysis = await analyzeReports();
    
    console.log("\n" + "=".repeat(60));
    console.log("🤖 AI MODERATION ANALYSIS REPORT");
    console.log("=".repeat(60));
    
    console.log(`\n📈 OVERVIEW:`);
    console.log(`Total Reports: ${analysis.totalReports}`);
    console.log(`Status Breakdown:`, analysis.statusBreakdown);
    
    console.log(`\n🎯 CATEGORY ANALYSIS:`);
    console.log("\nAccepted Reports by Category:");
    Object.entries(analysis.categoryAnalysis.accepted).forEach(([category, data]: [string, any]) => {
      console.log(`  ${category}: ${data.count} reports (avg confidence: ${data.avgConfidence.toFixed(3)})`);
    });
    
    console.log("\nIgnored Reports by Category:");
    Object.entries(analysis.categoryAnalysis.ignored).forEach(([category, data]: [string, any]) => {
      console.log(`  ${category}: ${data.count} reports (avg confidence: ${data.avgConfidence.toFixed(3)})`);
    });

    console.log(`\n📊 CONFIDENCE THRESHOLDS:`);
    console.log("\nAccepted Reports Confidence Ranges:");
    Object.entries(analysis.confidenceThresholds.accepted).forEach(([category, data]: [string, any]) => {
      console.log(`  ${category}: ${data.min.toFixed(3)} - ${data.max.toFixed(3)} (avg: ${data.avg.toFixed(3)})`);
    });
    
    console.log("\nIgnored Reports Confidence Ranges:");
    Object.entries(analysis.confidenceThresholds.ignored).forEach(([category, data]: [string, any]) => {
      console.log(`  ${category}: ${data.min.toFixed(3)} - ${data.max.toFixed(3)} (avg: ${data.avg.toFixed(3)})`);
    });

    console.log(`\n🔍 PATTERNS:`);
    console.log("Common words in ignored reports:", analysis.patterns.commonIgnoredPhrases.slice(0, 10));
    console.log("Common words in accepted reports:", analysis.patterns.commonAcceptedPhrases.slice(0, 10));

    console.log(`\n💡 RECOMMENDATIONS:`);
    analysis.recommendations.forEach(rec => console.log(`  ${rec}`));

    console.log("\n" + "=".repeat(60));
    
    // Save detailed analysis to file
    const fs = await import("fs/promises");
    const outputPath = join(process.cwd(), "scripts", "moderation-analysis", "analysis-results.json");
    await fs.writeFile(
      outputPath,
      JSON.stringify(analysis, null, 2)
    );
    console.log(`📁 Detailed analysis saved to ${outputPath}`);

  } catch (error) {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from database");
  }
}

if (import.meta.main) {
  main();
}