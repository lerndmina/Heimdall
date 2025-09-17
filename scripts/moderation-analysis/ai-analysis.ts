#!/usr/bin/env bun
/**
 * AI Moderation Report Analyzer - Outputs structured data for AI interpretation
 * Designed to provide actionable insights for threshold optimization
 */

import mongoose from "mongoose";
import { join } from "path";
import { configDotenv } from "dotenv";

// Load environment variables from bot directory
configDotenv({ path: join(process.cwd(), "../../bot/.env") });

const ModerationHitSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    userId: { type: String, required: true },
    messageContent: { type: String, required: true },
    flaggedCategories: { type: [String], required: true },
    confidenceScores: { type: Map, of: Number, required: true },
    status: { type: String, required: true },
    moderatorId: { type: String },
    actionTaken: { type: String },
  },
  { timestamps: true }
);

const ModerationHit = mongoose.model("ModerationHit", ModerationHitSchema);

interface CategoryAnalysis {
  category: string;
  totalReports: number;
  acceptedReports: number;
  ignoredReports: number;
  falsePositiveRate: number;
  avgConfidenceAccepted: number;
  avgConfidenceIgnored: number;
  confidenceGap: number;
  minIgnoredConfidence: number;
  maxIgnoredConfidence: number;
  medianIgnoredConfidence: number;
  recommendedNewThreshold: number;
  expectedReduction: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
  // New breakdown fields for multi-category analysis
  singleCategoryReports: {
    accepted: number;
    ignored: number;
    avgConfidenceAccepted: number;
    avgConfidenceIgnored: number;
  };
  multiCategoryReports: {
    acceptedAsPrimary: number;
    ignored: number;
    avgConfidenceAcceptedAsPrimary: number;
    avgConfidenceIgnored: number;
  };
}

interface OverallAnalysis {
  metadata: {
    totalReports: number;
    dateRange: string;
    analysisDate: string;
  };
  systemHealth: {
    overallFalsePositiveRate: number;
    systemEffectiveness: number;
    estimatedStaffBurdenHours: number;
    criticalCategories: string[];
  };
  categories: CategoryAnalysis[];
  recommendations: {
    immediate: Array<{
      action: string;
      category: string;
      currentThreshold: number;
      suggestedThreshold: number;
      expectedImpact: string;
      confidence: "HIGH" | "MEDIUM" | "LOW";
    }>;
    monitoring: string[];
    futureOptimizations: string[];
  };
  thresholdConfig: Record<string, number>;
}

async function connectToDatabase(): Promise<void> {
  try {
    const mongoUri = process.env.MONGODB_URI;
    const mongoDatabase = process.env.MONGODB_DATABASE || "solaceBot";

    if (!mongoUri) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    // Connect with database name specified in options
    await mongoose.connect(mongoUri, {
      dbName: mongoDatabase,
    });
    console.log(`✅ Connected to MongoDB database: ${mongoDatabase}`);
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

async function analyzeCategoryPerformance(): Promise<CategoryAnalysis[]> {
  console.log("🔍 Analyzing category performance...");
  console.log("📊 Accounting for multi-category reports and primary decision factors...");

  // First, let's analyze single-category reports for cleaner data
  const singleCategoryPipeline = [
    { $match: { status: { $in: ["accepted", "ignored"] } } },
    { $match: { $expr: { $eq: [{ $size: "$flaggedCategories" }, 1] } } },
    { $unwind: "$flaggedCategories" },
    {
      $group: {
        _id: "$flaggedCategories",
        reports: {
          $push: {
            status: "$status",
            confidence: { $objectToArray: "$confidenceScores" },
            messageId: "$messageId",
          },
        },
      },
    },
  ];

  // Then analyze multi-category reports to identify primary decision factors
  const multiCategoryPipeline = [
    { $match: { status: { $in: ["accepted", "ignored"] } } },
    { $match: { $expr: { $gt: [{ $size: "$flaggedCategories" }, 1] } } },
    {
      $project: {
        status: 1,
        flaggedCategories: 1,
        confidenceScores: 1,
        messageId: 1,
        // Find the category with highest confidence score
        maxConfidenceCategory: {
          $arrayElemAt: [
            {
              $map: {
                input: { $objectToArray: "$confidenceScores" },
                as: "score",
                in: {
                  category: "$$score.k",
                  confidence: "$$score.v",
                },
              },
            },
            {
              $indexOfArray: [
                {
                  $map: {
                    input: { $objectToArray: "$confidenceScores" },
                    as: "score",
                    in: "$$score.v",
                  },
                },
                { $max: { $map: { input: { $objectToArray: "$confidenceScores" }, as: "score", in: "$$score.v" } } },
              ],
            },
          ],
        },
      },
    },
    { $unwind: "$flaggedCategories" },
    {
      $group: {
        _id: "$flaggedCategories",
        reports: {
          $push: {
            status: "$status",
            confidence: { $objectToArray: "$confidenceScores" },
            messageId: "$messageId",
            maxConfidenceCategory: "$maxConfidenceCategory",
            isLikelyPrimaryReason: {
              $eq: ["$flaggedCategories", "$maxConfidenceCategory.category"],
            },
          },
        },
      },
    },
  ];

  console.log("📈 Analyzing single-category reports...");
  const singleCategoryData = await ModerationHit.aggregate(singleCategoryPipeline);

  console.log("📊 Analyzing multi-category reports...");
  const multiCategoryData = await ModerationHit.aggregate(multiCategoryPipeline);

  const analyses: CategoryAnalysis[] = [];

  // Combine single and multi-category data for each category
  const allCategories = new Set([...singleCategoryData.map((d) => d._id), ...multiCategoryData.map((d) => d._id)]);

  for (const category of allCategories) {
    const singleCatData = singleCategoryData.find((d) => d._id === category);
    const multiCatData = multiCategoryData.find((d) => d._id === category);

    // Extract confidence scores for this category
    const acceptedConfidences: number[] = [];
    const ignoredConfidences: number[] = [];
    const singleCategoryAccepted: number[] = [];
    const singleCategoryIgnored: number[] = [];
    const primaryReasonAccepted: number[] = [];
    const primaryReasonIgnored: number[] = [];

    // Process single-category reports
    if (singleCatData) {
      singleCatData.reports.forEach((report: any) => {
        const confidenceEntry = report.confidence.find((c: any) => c.k === category);
        const confidence = confidenceEntry ? confidenceEntry.v : 0;

        if (report.status === "accepted") {
          acceptedConfidences.push(confidence);
          singleCategoryAccepted.push(confidence);
        } else if (report.status === "ignored") {
          ignoredConfidences.push(confidence);
          singleCategoryIgnored.push(confidence);
        }
      });
    }

    // Process multi-category reports (only count if likely primary reason)
    if (multiCatData) {
      multiCatData.reports.forEach((report: any) => {
        const confidenceEntry = report.confidence.find((c: any) => c.k === category);
        const confidence = confidenceEntry ? confidenceEntry.v : 0;

        // For accepted reports, only count if this was likely the primary reason
        if (report.status === "accepted") {
          if (report.isLikelyPrimaryReason) {
            acceptedConfidences.push(confidence);
            primaryReasonAccepted.push(confidence);
          }
          // If not primary reason, we don't count it for this category's analysis
        } else if (report.status === "ignored") {
          // For ignored reports, count all since the whole report was rejected
          ignoredConfidences.push(confidence);
          primaryReasonIgnored.push(confidence);
        }
      });
    }

    const totalReports = acceptedConfidences.length + ignoredConfidences.length;
    const falsePositiveRate = (ignoredConfidences.length / totalReports) * 100;

    if (totalReports < 3) continue; // Skip categories with too few reports

    const avgAccepted = acceptedConfidences.length > 0 ? acceptedConfidences.reduce((a, b) => a + b, 0) / acceptedConfidences.length : 0;
    const avgIgnored = ignoredConfidences.length > 0 ? ignoredConfidences.reduce((a, b) => a + b, 0) / ignoredConfidences.length : 0;

    const confidenceGap = avgIgnored - avgAccepted;
    const medianIgnored = ignoredConfidences.length > 0 ? calculatePercentile(ignoredConfidences, 50) : 0;
    const p75Ignored = ignoredConfidences.length > 0 ? calculatePercentile(ignoredConfidences, 75) : 0;

    // Suggest new threshold based on analysis
    let recommendedThreshold = 0.5; // Default
    if (ignoredConfidences.length > 0) {
      // Set threshold to exclude 70% of false positives while keeping true positives
      recommendedThreshold = Math.min(0.85, Math.max(0.3, p75Ignored));
    }

    // Calculate expected reduction
    const wouldBeFiltered = ignoredConfidences.filter((c) => c < recommendedThreshold).length;
    const expectedReduction = ignoredConfidences.length > 0 ? (wouldBeFiltered / ignoredConfidences.length) * 100 : 0;

    // Determine priority
    let priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let reasoning = "";

    if (falsePositiveRate > 80 && totalReports > 50) {
      priority = "CRITICAL";
      reasoning = `${falsePositiveRate.toFixed(1)}% false positive rate with high volume`;
    } else if (falsePositiveRate > 60 && totalReports > 20) {
      priority = "HIGH";
      reasoning = `${falsePositiveRate.toFixed(1)}% false positive rate`;
    } else if (falsePositiveRate > 40) {
      priority = "MEDIUM";
      reasoning = `${falsePositiveRate.toFixed(1)}% false positive rate`;
    } else {
      reasoning = `${falsePositiveRate.toFixed(1)}% false positive rate - acceptable`;
    }

    // Calculate breakdown statistics
    const singleCatAvgAccepted = singleCategoryAccepted.length > 0 ? singleCategoryAccepted.reduce((a, b) => a + b, 0) / singleCategoryAccepted.length : 0;
    const singleCatAvgIgnored = singleCategoryIgnored.length > 0 ? singleCategoryIgnored.reduce((a, b) => a + b, 0) / singleCategoryIgnored.length : 0;
    const primaryAvgAccepted = primaryReasonAccepted.length > 0 ? primaryReasonAccepted.reduce((a, b) => a + b, 0) / primaryReasonAccepted.length : 0;
    const primaryAvgIgnored = primaryReasonIgnored.length > 0 ? primaryReasonIgnored.reduce((a, b) => a + b, 0) / primaryReasonIgnored.length : 0;

    analyses.push({
      category,
      totalReports,
      acceptedReports: acceptedConfidences.length,
      ignoredReports: ignoredConfidences.length,
      falsePositiveRate,
      avgConfidenceAccepted: avgAccepted,
      avgConfidenceIgnored: avgIgnored,
      confidenceGap,
      minIgnoredConfidence: ignoredConfidences.length > 0 ? Math.min(...ignoredConfidences) : 0,
      maxIgnoredConfidence: ignoredConfidences.length > 0 ? Math.max(...ignoredConfidences) : 0,
      medianIgnoredConfidence: medianIgnored,
      recommendedNewThreshold: recommendedThreshold,
      expectedReduction: isNaN(expectedReduction) ? 0 : expectedReduction,
      priority,
      reasoning,
      singleCategoryReports: {
        accepted: singleCategoryAccepted.length,
        ignored: singleCategoryIgnored.length,
        avgConfidenceAccepted: singleCatAvgAccepted,
        avgConfidenceIgnored: singleCatAvgIgnored,
      },
      multiCategoryReports: {
        acceptedAsPrimary: primaryReasonAccepted.length,
        ignored: primaryReasonIgnored.length,
        avgConfidenceAcceptedAsPrimary: primaryAvgAccepted,
        avgConfidenceIgnored: primaryAvgIgnored,
      },
    });
  }

  return analyses.sort((a, b) => b.falsePositiveRate - a.falsePositiveRate);
}

async function generateAnalysis(): Promise<OverallAnalysis> {
  // Get basic stats
  const totalReports = await ModerationHit.countDocuments();
  const acceptedCount = await ModerationHit.countDocuments({ status: "accepted" });
  const ignoredCount = await ModerationHit.countDocuments({ status: "ignored" });

  const oldestReport = await ModerationHit.findOne().sort({ createdAt: 1 });
  const newestReport = await ModerationHit.findOne().sort({ createdAt: -1 });

  const dateRange = `${oldestReport?.createdAt.toDateString()} to ${newestReport?.createdAt.toDateString()}`;
  const overallFP = (ignoredCount / (acceptedCount + ignoredCount)) * 100;

  // Analyze categories
  const categories = await analyzeCategoryPerformance();

  // Generate recommendations
  const immediate = categories
    .filter((c) => c.priority === "CRITICAL" || c.priority === "HIGH")
    .slice(0, 5) // Top 5 most critical
    .map((c) => ({
      action: `Increase threshold for ${c.category}`,
      category: c.category,
      currentThreshold: 0.5, // Assumed current
      suggestedThreshold: c.recommendedNewThreshold,
      expectedImpact: `Reduce false positives by ~${c.expectedReduction.toFixed(1)}%`,
      confidence: c.expectedReduction > 30 ? ("HIGH" as const) : c.expectedReduction > 15 ? ("MEDIUM" as const) : ("LOW" as const),
    }));

  const thresholdConfig = categories.reduce((config, cat) => {
    if (cat.expectedReduction > 10) {
      config[cat.category] = Math.round(cat.recommendedNewThreshold * 1000) / 1000;
    }
    return config;
  }, {} as Record<string, number>);

  return {
    metadata: {
      totalReports,
      dateRange,
      analysisDate: new Date().toISOString(),
    },
    systemHealth: {
      overallFalsePositiveRate: overallFP,
      systemEffectiveness: 100 - overallFP,
      estimatedStaffBurdenHours: (acceptedCount + ignoredCount) * 0.05, // 3 minutes per report
      criticalCategories: categories.filter((c) => c.priority === "CRITICAL").map((c) => c.category),
    },
    categories,
    recommendations: {
      immediate,
      monitoring: ["Monitor false positive rates after threshold changes", "Track staff workload reduction", "Watch for any drop in legitimate violation detection"],
      futureOptimizations: [
        "Consider user-specific allowlists for frequent false positive users",
        "Implement channel-specific thresholds if patterns emerge",
        "Add message length or special character preprocessing",
      ],
    },
    thresholdConfig,
  };
}

async function main() {
  try {
    await connectToDatabase();

    console.log("🔍 Analyzing AI moderation system...");
    console.log("This analysis will help identify optimal threshold adjustments.\n");

    const analysis = await generateAnalysis();

    // Output structured data for AI interpretation
    console.log("\n" + "=".repeat(80));
    console.log("📊 AI MODERATION SYSTEM ANALYSIS");
    console.log("=".repeat(80));

    console.log(`\n📈 SYSTEM HEALTH:`);
    console.log(`• Total Reports Analyzed: ${analysis.metadata.totalReports}`);
    console.log(`• Date Range: ${analysis.metadata.dateRange}`);
    console.log(`• Overall False Positive Rate: ${analysis.systemHealth.overallFalsePositiveRate.toFixed(1)}%`);
    console.log(`• System Effectiveness: ${analysis.systemHealth.systemEffectiveness.toFixed(1)}%`);
    console.log(`• Estimated Staff Hours Spent: ${analysis.systemHealth.estimatedStaffBurdenHours.toFixed(1)} hours`);

    console.log(`\n🚨 CRITICAL ISSUES:`);
    if (analysis.systemHealth.criticalCategories.length > 0) {
      analysis.systemHealth.criticalCategories.forEach((cat) => {
        console.log(`• ${cat} requires immediate attention`);
      });
    } else {
      console.log("• No critical issues detected");
    }

    console.log(`\n📊 CATEGORY PERFORMANCE (Top 10):`);
    analysis.categories.slice(0, 10).forEach((cat) => {
      console.log(`• ${cat.category}: ${cat.falsePositiveRate.toFixed(1)}% FP rate (${cat.ignoredReports}/${cat.totalReports}) - ${cat.priority} priority`);
      console.log(`  Current avg confidence: ${cat.avgConfidenceIgnored.toFixed(3)} (ignored) vs ${cat.avgConfidenceAccepted.toFixed(3)} (accepted)`);
      console.log(`  📊 Single-category: ${cat.singleCategoryReports.accepted} accepted, ${cat.singleCategoryReports.ignored} ignored`);
      console.log(`     Confidence: ${cat.singleCategoryReports.avgConfidenceAccepted.toFixed(3)} (accepted) vs ${cat.singleCategoryReports.avgConfidenceIgnored.toFixed(3)} (ignored)`);
      console.log(`  🎯 Multi-category primary: ${cat.multiCategoryReports.acceptedAsPrimary} accepted, ${cat.multiCategoryReports.ignored} ignored`);
      console.log(`     Confidence: ${cat.multiCategoryReports.avgConfidenceAcceptedAsPrimary.toFixed(3)} (primary) vs ${cat.multiCategoryReports.avgConfidenceIgnored.toFixed(3)} (ignored)`);
      console.log(`  Recommended threshold: ${cat.recommendedNewThreshold.toFixed(3)} (expected ${cat.expectedReduction.toFixed(1)}% reduction)`);
    });

    console.log(`\n💡 IMMEDIATE ACTIONS NEEDED:`);
    analysis.recommendations.immediate.forEach((rec) => {
      console.log(`• ${rec.action}: ${rec.currentThreshold.toFixed(3)} → ${rec.suggestedThreshold.toFixed(3)} (${rec.expectedImpact})`);
    });

    // Save the detailed analysis
    const fs = await import("fs/promises");
    const outputPath = join(__dirname, "ai-analysis-output.json");
    await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));

    console.log(`\n📁 Detailed analysis saved to: ai-analysis-output.json`);
    console.log("\n🤖 This data is optimized for AI interpretation and recommendations.");
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
