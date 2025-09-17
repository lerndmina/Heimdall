#!/usr/bin/env bun
/**
 * Threshold optimization script for AI moderation system
 * Tests different confidence thresholds to minimize false positives while maintaining detection
 */

import mongoose from "mongoose";
import { join } from "path";

// Import FetchEnvs from the bot
import FetchEnvs from "../../bot/src/utils/FetchEnvs";

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

interface ReportData {
  status: string;
  categoryConfidence: number;
  messageContent: string;
  flaggedCategories: string[];
  confidenceScores: Map<string, number>;
  createdAt: Date;
}

interface ThresholdTest {
  category: string;
  currentThreshold: number;
  testThreshold: number;
  currentFalsePositives: number;
  currentTruePositives: number;
  newFalsePositives: number;
  newTruePositives: number;
  reduction: number;
  falsePositiveRate: number;
  newFalsePositiveRate: number;
  recommendation: string;
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

async function getReportsByCategory(): Promise<Record<string, ReportData[]>> {
  const reports = await ModerationHit.find({
    status: { $in: ["accepted", "ignored"] },
  }).lean();

  const byCategory: Record<string, ReportData[]> = {};

  reports.forEach((report: any) => {
    report.flaggedCategories.forEach((category: string) => {
      if (!byCategory[category]) {
        byCategory[category] = [];
      }

      const confidence = report.confidenceScores.get(category) || 0;
      byCategory[category].push({
        ...report,
        categoryConfidence: confidence,
      } as ReportData);
    });
  });

  return byCategory;
}

function testThreshold(reports: ReportData[], threshold: number) {
  let truePositives = 0; // Would report, was accepted
  let falsePositives = 0; // Would report, was ignored
  let trueNegatives = 0; // Wouldn't report, was ignored
  let falseNegatives = 0; // Wouldn't report, was accepted

  reports.forEach((report) => {
    const wouldReport = report.categoryConfidence >= threshold;
    const wasAccepted = report.status === "accepted";

    if (wouldReport && wasAccepted) truePositives++;
    else if (wouldReport && !wasAccepted) falsePositives++;
    else if (!wouldReport && !wasAccepted) trueNegatives++;
    else if (!wouldReport && wasAccepted) falseNegatives++;
  });

  return { truePositives, falsePositives, trueNegatives, falseNegatives };
}

function findOptimalThreshold(reports: ReportData[], category: string): ThresholdTest {
  const currentThreshold = 0.5; // Assumed current threshold
  const currentStats = testThreshold(reports, currentThreshold);

  // Test thresholds from 0.1 to 0.9 in 0.05 increments
  let bestThreshold = currentThreshold;
  let bestScore = Infinity;
  let bestStats = currentStats;

  for (let threshold = 0.1; threshold <= 0.9; threshold += 0.05) {
    const stats = testThreshold(reports, threshold);

    // Score formula: prioritize reducing false positives while maintaining true positives
    // Weight false positives heavily since staff mark 80% as ignored
    const score = stats.falsePositives * 3 + stats.falseNegatives;

    if (score < bestScore && stats.truePositives > 0) {
      bestScore = score;
      bestThreshold = threshold;
      bestStats = stats;
    }
  }

  const currentFPRate = currentStats.falsePositives / (currentStats.falsePositives + currentStats.truePositives || 1);
  const newFPRate = bestStats.falsePositives / (bestStats.falsePositives + bestStats.truePositives || 1);
  const reduction = ((currentStats.falsePositives - bestStats.falsePositives) / currentStats.falsePositives) * 100;

  let recommendation = "";
  if (bestThreshold > currentThreshold) {
    recommendation = `RAISE threshold from ${currentThreshold.toFixed(3)} to ${bestThreshold.toFixed(3)}`;
  } else if (bestThreshold < currentThreshold) {
    recommendation = `LOWER threshold from ${currentThreshold.toFixed(3)} to ${bestThreshold.toFixed(3)}`;
  } else {
    recommendation = `KEEP current threshold of ${currentThreshold.toFixed(3)}`;
  }

  return {
    category,
    currentThreshold,
    testThreshold: bestThreshold,
    currentFalsePositives: currentStats.falsePositives,
    currentTruePositives: currentStats.truePositives,
    newFalsePositives: bestStats.falsePositives,
    newTruePositives: bestStats.truePositives,
    reduction: isNaN(reduction) ? 0 : reduction,
    falsePositiveRate: currentFPRate,
    newFalsePositiveRate: newFPRate,
    recommendation,
  };
}

async function generateThresholdReport(): Promise<ThresholdTest[]> {
  console.log("🔍 Analyzing optimal thresholds for each category...");

  const reportsByCategory = await getReportsByCategory();
  const results: ThresholdTest[] = [];

  for (const [category, reports] of Object.entries(reportsByCategory)) {
    if (reports.length < 10) {
      console.log(`⚠️ Skipping ${category} - only ${reports.length} reports`);
      continue;
    }

    console.log(`📊 Analyzing ${category} (${reports.length} reports)...`);
    const result = findOptimalThreshold(reports, category);
    results.push(result);
  }

  return results.sort((a, b) => b.reduction - a.reduction);
}

async function simulateNewThresholds(results: ThresholdTest[]) {
  console.log("\n🧪 SIMULATION: Impact of recommended thresholds");
  console.log("=".repeat(80));

  let totalCurrentFP = 0;
  let totalNewFP = 0;
  let totalCurrentTP = 0;
  let totalNewTP = 0;

  results.forEach((result) => {
    totalCurrentFP += result.currentFalsePositives;
    totalNewFP += result.newFalsePositives;
    totalCurrentTP += result.currentTruePositives;
    totalNewTP += result.newTruePositives;
  });

  const currentTotal = totalCurrentFP + totalCurrentTP;
  const newTotal = totalNewFP + totalNewTP;
  const currentIgnoreRate = (totalCurrentFP / currentTotal) * 100;
  const newIgnoreRate = (totalNewFP / newTotal) * 100;
  const reportsReduction = ((currentTotal - newTotal) / currentTotal) * 100;

  console.log(`Current state:`);
  console.log(`  Total reports: ${currentTotal}`);
  console.log(`  False positives (ignored): ${totalCurrentFP} (${currentIgnoreRate.toFixed(1)}%)`);
  console.log(`  True positives (accepted): ${totalCurrentTP} (${(100 - currentIgnoreRate).toFixed(1)}%)`);

  console.log(`\nWith optimized thresholds:`);
  console.log(`  Total reports: ${newTotal} (${reportsReduction >= 0 ? "-" : "+"}${Math.abs(reportsReduction).toFixed(1)}%)`);
  console.log(`  False positives (ignored): ${totalNewFP} (${newIgnoreRate.toFixed(1)}%)`);
  console.log(`  True positives (accepted): ${totalNewTP} (${(100 - newIgnoreRate).toFixed(1)}%)`);

  console.log(`\n📈 Improvements:`);
  console.log(`  False positive reduction: ${(((totalCurrentFP - totalNewFP) / totalCurrentFP) * 100).toFixed(1)}%`);
  console.log(`  Ignore rate reduction: ${(currentIgnoreRate - newIgnoreRate).toFixed(1)} percentage points`);
  console.log(`  Staff workload reduction: ~${reportsReduction.toFixed(1)}%`);
}

async function main() {
  try {
    await connectToDatabase();

    const results = await generateThresholdReport();

    console.log("\n" + "=".repeat(80));
    console.log("🎯 THRESHOLD OPTIMIZATION REPORT");
    console.log("=".repeat(80));

    console.log(`\n📊 CATEGORY ANALYSIS:`);
    console.log("Category".padEnd(20) + "Current FP".padEnd(12) + "New FP".padEnd(10) + "Reduction".padEnd(12) + "Recommendation");
    console.log("-".repeat(80));

    results.forEach((result) => {
      const fpReduction = result.reduction.toFixed(1) + "%";
      console.log(result.category.padEnd(20) + result.currentFalsePositives.toString().padEnd(12) + result.newFalsePositives.toString().padEnd(10) + fpReduction.padEnd(12) + result.recommendation);
    });

    await simulateNewThresholds(results);

    console.log(`\n💡 IMPLEMENTATION SUGGESTIONS:`);

    const significantImprovements = results.filter((r) => r.reduction > 10);
    if (significantImprovements.length > 0) {
      console.log(`\n🚀 High-impact changes (>10% reduction):`);
      significantImprovements.forEach((result) => {
        console.log(`  ${result.category}: ${result.recommendation} (${result.reduction.toFixed(1)}% reduction)`);
      });
    }

    const moderateImprovements = results.filter((r) => r.reduction > 5 && r.reduction <= 10);
    if (moderateImprovements.length > 0) {
      console.log(`\n📈 Moderate improvements (5-10% reduction):`);
      moderateImprovements.forEach((result) => {
        console.log(`  ${result.category}: ${result.recommendation} (${result.reduction.toFixed(1)}% reduction)`);
      });
    }

    // Generate configuration code
    console.log(`\n📝 CONFIGURATION CODE:`);
    console.log(`// Add these to your moderation config:`);
    console.log(`const optimizedThresholds = {`);
    results.forEach((result) => {
      if (result.reduction > 5) {
        console.log(`  "${result.category}": ${result.testThreshold.toFixed(3)}, // was ${result.currentThreshold.toFixed(3)}, reduces FP by ${result.reduction.toFixed(1)}%`);
      }
    });
    console.log(`};`);

    // Save detailed results
    const fs = await import("fs/promises");
    const outputPath = join(process.cwd(), "scripts", "moderation-analysis", "threshold-optimization-results.json");
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Detailed results saved to ${outputPath}`);
  } catch (error) {
    console.error("❌ Optimization failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from database");
  }
}

if (import.meta.main) {
  main();
}
