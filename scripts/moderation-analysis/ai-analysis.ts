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

  const pipeline = [
    { $match: { status: { $in: ["accepted", "ignored"] } } },
    { $unwind: "$flaggedCategories" },
    {
      $group: {
        _id: "$flaggedCategories",
        reports: {
          $push: {
            status: "$status",
            confidence: { $objectToArray: "$confidenceScores" },
          },
        },
      },
    },
  ];

  const categoryData = await ModerationHit.aggregate(pipeline);
  const analyses: CategoryAnalysis[] = [];

  for (const catData of categoryData) {
    const category = catData._id;
    const reports = catData.reports;

    // Extract confidence scores for this category
    const acceptedConfidences: number[] = [];
    const ignoredConfidences: number[] = [];

    reports.forEach((report: any) => {
      const confidenceEntry = report.confidence.find((c: any) => c.k === category);
      const confidence = confidenceEntry ? confidenceEntry.v : 0;

      if (report.status === "accepted") {
        acceptedConfidences.push(confidence);
      } else if (report.status === "ignored") {
        ignoredConfidences.push(confidence);
      }
    });

    const totalReports = acceptedConfidences.length + ignoredConfidences.length;
    const falsePositiveRate = (ignoredConfidences.length / totalReports) * 100;

    if (totalReports < 5) continue; // Skip categories with too few reports

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
    const expectedReduction = (wouldBeFiltered / ignoredConfidences.length) * 100;

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
