#!/usr/bin/env bun
/**
 * Deep pattern analysis script for AI moderation system
 * Analyzes message content patterns, user behavior, and temporal trends
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

interface PatternAnalysis {
  messagePatterns: {
    falsePositiveKeywords: Array<{ word: string; count: number; avgConfidence: number }>;
    truePositiveKeywords: Array<{ word: string; count: number; avgConfidence: number }>;
    messageLength: {
      accepted: { min: number; max: number; avg: number };
      ignored: { min: number; max: number; avg: number };
    };
    specialCharacters: {
      accepted: number;
      ignored: number;
    };
  };
  userPatterns: {
    repeatOffenders: Array<{ userId: string; acceptedCount: number; ignoredCount: number; ratio: number }>;
    falsePositiveUsers: Array<{ userId: string; ignoredCount: number; categories: string[] }>;
  };
  temporalPatterns: {
    hourlyDistribution: { accepted: number[]; ignored: number[] };
    dailyDistribution: { accepted: number[]; ignored: number[] };
    categoryTrends: Record<string, { accepted: number[]; ignored: number[] }>;
  };
  channelPatterns: {
    problematicChannels: Array<{ channelId: string; ignoredCount: number; acceptedCount: number; ratio: number }>;
    categoryByChannel: Record<string, Record<string, number>>;
  };
  recommendations: string[];
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

async function analyzeMessagePatterns(acceptedReports: any[], ignoredReports: any[]) {
  console.log("🔍 Analyzing message content patterns...");

  // Keyword analysis
  const falsePositiveKeywords = extractKeywordsWithConfidence(ignoredReports);
  const truePositiveKeywords = extractKeywordsWithConfidence(acceptedReports);

  // Message length analysis
  const acceptedLengths = acceptedReports.map((r) => r.messageContent.length);
  const ignoredLengths = ignoredReports.map((r) => r.messageContent.length);

  const messageLength = {
    accepted: {
      min: Math.min(...acceptedLengths),
      max: Math.max(...acceptedLengths),
      avg: acceptedLengths.reduce((a, b) => a + b, 0) / acceptedLengths.length,
    },
    ignored: {
      min: Math.min(...ignoredLengths),
      max: Math.max(...ignoredLengths),
      avg: ignoredLengths.reduce((a, b) => a + b, 0) / ignoredLengths.length,
    },
  };

  // Special characters analysis
  const countSpecialChars = (text: string) => (text.match(/[^a-zA-Z0-9\s]/g) || []).length;
  const acceptedSpecialChars = acceptedReports.reduce((sum, r) => sum + countSpecialChars(r.messageContent), 0) / acceptedReports.length;
  const ignoredSpecialChars = ignoredReports.reduce((sum, r) => sum + countSpecialChars(r.messageContent), 0) / ignoredReports.length;

  return {
    falsePositiveKeywords: falsePositiveKeywords.slice(0, 20),
    truePositiveKeywords: truePositiveKeywords.slice(0, 20),
    messageLength,
    specialCharacters: {
      accepted: acceptedSpecialChars,
      ignored: ignoredSpecialChars,
    },
  };
}

function extractKeywordsWithConfidence(reports: any[]) {
  const wordData: Record<string, { count: number; totalConfidence: number }> = {};

  reports.forEach((report) => {
    const words = report.messageContent
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word: string) => word.length > 3);

    const avgConfidence = Array.from(report.confidenceScores.values()).reduce((a: number, b: number) => a + b, 0) / report.confidenceScores.size;

    words.forEach((word: string) => {
      if (!wordData[word]) {
        wordData[word] = { count: 0, totalConfidence: 0 };
      }
      wordData[word].count++;
      wordData[word].totalConfidence += avgConfidence;
    });
  });

  return Object.entries(wordData)
    .map(([word, data]) => ({
      word,
      count: data.count,
      avgConfidence: data.totalConfidence / data.count,
    }))
    .sort((a, b) => b.count - a.count);
}

async function analyzeUserPatterns(reports: any[]) {
  console.log("👥 Analyzing user behavior patterns...");

  const userStats: Record<string, { accepted: number; ignored: number; categories: Set<string> }> = {};

  reports.forEach((report) => {
    if (!userStats[report.userId]) {
      userStats[report.userId] = { accepted: 0, ignored: 0, categories: new Set() };
    }

    if (report.status === "accepted") {
      userStats[report.userId].accepted++;
    } else if (report.status === "ignored") {
      userStats[report.userId].ignored++;
    }

    report.flaggedCategories.forEach((cat: string) => userStats[report.userId].categories.add(cat));
  });

  const repeatOffenders = Object.entries(userStats)
    .filter(([, stats]) => stats.accepted + stats.ignored > 3)
    .map(([userId, stats]) => ({
      userId,
      acceptedCount: stats.accepted,
      ignoredCount: stats.ignored,
      ratio: stats.accepted / (stats.accepted + stats.ignored),
    }))
    .sort((a, b) => b.acceptedCount - a.acceptedCount);

  const falsePositiveUsers = Object.entries(userStats)
    .filter(([, stats]) => stats.ignored > 5 && stats.ignored > stats.accepted * 2)
    .map(([userId, stats]) => ({
      userId,
      ignoredCount: stats.ignored,
      categories: Array.from(stats.categories),
    }))
    .sort((a, b) => b.ignoredCount - a.ignoredCount);

  return { repeatOffenders: repeatOffenders.slice(0, 20), falsePositiveUsers: falsePositiveUsers.slice(0, 20) };
}

async function analyzeTemporalPatterns(reports: any[]) {
  console.log("⏰ Analyzing temporal patterns...");

  const acceptedReports = reports.filter((r) => r.status === "accepted");
  const ignoredReports = reports.filter((r) => r.status === "ignored");

  // Hourly distribution
  const acceptedByHour = new Array(24).fill(0);
  const ignoredByHour = new Array(24).fill(0);

  acceptedReports.forEach((report) => {
    const hour = new Date(report.createdAt).getHours();
    acceptedByHour[hour]++;
  });

  ignoredReports.forEach((report) => {
    const hour = new Date(report.createdAt).getHours();
    ignoredByHour[hour]++;
  });

  // Daily distribution (0 = Sunday)
  const acceptedByDay = new Array(7).fill(0);
  const ignoredByDay = new Array(7).fill(0);

  acceptedReports.forEach((report) => {
    const day = new Date(report.createdAt).getDay();
    acceptedByDay[day]++;
  });

  ignoredReports.forEach((report) => {
    const day = new Date(report.createdAt).getDay();
    ignoredByDay[day]++;
  });

  // Category trends over time (last 30 days)
  const categoryTrends: Record<string, { accepted: number[]; ignored: number[] }> = {};
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentReports = reports.filter((r) => new Date(r.createdAt) > thirtyDaysAgo);

  recentReports.forEach((report) => {
    report.flaggedCategories.forEach((category: string) => {
      if (!categoryTrends[category]) {
        categoryTrends[category] = { accepted: new Array(30).fill(0), ignored: new Array(30).fill(0) };
      }

      const dayIndex = Math.floor((Date.now() - new Date(report.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      if (dayIndex < 30) {
        if (report.status === "accepted") {
          categoryTrends[category].accepted[29 - dayIndex]++;
        } else if (report.status === "ignored") {
          categoryTrends[category].ignored[29 - dayIndex]++;
        }
      }
    });
  });

  return {
    hourlyDistribution: { accepted: acceptedByHour, ignored: ignoredByHour },
    dailyDistribution: { accepted: acceptedByDay, ignored: ignoredByDay },
    categoryTrends,
  };
}

async function analyzeChannelPatterns(reports: any[]) {
  console.log("📺 Analyzing channel patterns...");

  const channelStats: Record<string, { accepted: number; ignored: number; categories: Record<string, number> }> = {};

  reports.forEach((report) => {
    if (!channelStats[report.channelId]) {
      channelStats[report.channelId] = { accepted: 0, ignored: 0, categories: {} };
    }

    if (report.status === "accepted") {
      channelStats[report.channelId].accepted++;
    } else if (report.status === "ignored") {
      channelStats[report.channelId].ignored++;
    }

    report.flaggedCategories.forEach((category: string) => {
      if (!channelStats[report.channelId].categories[category]) {
        channelStats[report.channelId].categories[category] = 0;
      }
      channelStats[report.channelId].categories[category]++;
    });
  });

  const problematicChannels = Object.entries(channelStats)
    .filter(([, stats]) => stats.ignored > 10)
    .map(([channelId, stats]) => ({
      channelId,
      ignoredCount: stats.ignored,
      acceptedCount: stats.accepted,
      ratio: stats.ignored / (stats.ignored + stats.accepted),
    }))
    .sort((a, b) => b.ratio - a.ratio);

  const categoryByChannel: Record<string, Record<string, number>> = {};
  Object.entries(channelStats).forEach(([channelId, stats]) => {
    categoryByChannel[channelId] = stats.categories;
  });

  return { problematicChannels: problematicChannels.slice(0, 10), categoryByChannel };
}

function generateRecommendations(analysis: PatternAnalysis): string[] {
  const recommendations: string[] = [];

  // Message pattern recommendations
  if (analysis.messagePatterns.messageLength.ignored.avg > analysis.messagePatterns.messageLength.accepted.avg * 1.5) {
    recommendations.push("📏 Longer messages tend to be false positives. Consider adjusting thresholds for longer content.");
  }

  if (analysis.messagePatterns.specialCharacters.ignored > analysis.messagePatterns.specialCharacters.accepted * 1.3) {
    recommendations.push("🔤 Messages with more special characters tend to be false positives. Consider pre-processing.");
  }

  // False positive keywords
  const commonFalsePositives = analysis.messagePatterns.falsePositiveKeywords.slice(0, 5);
  if (commonFalsePositives.length > 0) {
    recommendations.push(`❌ Common false positive keywords: ${commonFalsePositives.map((k) => k.word).join(", ")}. Consider whitelist.`);
  }

  // Channel recommendations
  if (analysis.channelPatterns.problematicChannels.length > 0) {
    const topProblematic = analysis.channelPatterns.problematicChannels[0];
    recommendations.push(`📺 Channel ${topProblematic.channelId} has ${topProblematic.ratio.toFixed(1)}% false positive rate. Consider different thresholds per channel.`);
  }

  // User behavior recommendations
  if (analysis.userPatterns.falsePositiveUsers.length > 0) {
    recommendations.push(`👤 ${analysis.userPatterns.falsePositiveUsers.length} users consistently trigger false positives. Consider user-specific allowlists.`);
  }

  // Temporal recommendations
  const hourlyIgnored = analysis.temporalPatterns.hourlyDistribution.ignored;
  const peakIgnoredHour = hourlyIgnored.indexOf(Math.max(...hourlyIgnored));
  const hourlyAccepted = analysis.temporalPatterns.hourlyDistribution.accepted;
  const peakAcceptedHour = hourlyAccepted.indexOf(Math.max(...hourlyAccepted));

  if (peakIgnoredHour !== peakAcceptedHour) {
    recommendations.push(`⏰ False positives peak at hour ${peakIgnoredHour}, true positives at hour ${peakAcceptedHour}. Consider time-based thresholds.`);
  }

  return recommendations;
}

async function main() {
  try {
    await connectToDatabase();

    console.log("📊 Loading moderation reports...");
    const reports = await ModerationHit.find({
      status: { $in: ["accepted", "ignored"] },
    }).lean();

    const acceptedReports = reports.filter((r) => r.status === "accepted");
    const ignoredReports = reports.filter((r) => r.status === "ignored");

    console.log(`Found ${reports.length} reports (${acceptedReports.length} accepted, ${ignoredReports.length} ignored)`);

    const analysis: PatternAnalysis = {
      messagePatterns: await analyzeMessagePatterns(acceptedReports, ignoredReports),
      userPatterns: await analyzeUserPatterns(reports),
      temporalPatterns: await analyzeTemporalPatterns(reports),
      channelPatterns: await analyzeChannelPatterns(reports),
      recommendations: [],
    };

    analysis.recommendations = generateRecommendations(analysis);

    console.log("\n" + "=".repeat(80));
    console.log("🔍 DEEP PATTERN ANALYSIS REPORT");
    console.log("=".repeat(80));

    console.log("\n📝 MESSAGE PATTERNS:");
    console.log(`Average message length - Accepted: ${analysis.messagePatterns.messageLength.accepted.avg.toFixed(1)}, Ignored: ${analysis.messagePatterns.messageLength.ignored.avg.toFixed(1)}`);
    console.log(
      `Special characters per message - Accepted: ${analysis.messagePatterns.specialCharacters.accepted.toFixed(1)}, Ignored: ${analysis.messagePatterns.specialCharacters.ignored.toFixed(1)}`
    );

    console.log("\nTop False Positive Keywords:");
    analysis.messagePatterns.falsePositiveKeywords.slice(0, 10).forEach((kw) => {
      console.log(`  ${kw.word}: ${kw.count} occurrences (avg confidence: ${kw.avgConfidence.toFixed(3)})`);
    });

    console.log("\n👥 USER PATTERNS:");
    console.log(`Repeat offenders: ${analysis.userPatterns.repeatOffenders.length}`);
    console.log(`False positive prone users: ${analysis.userPatterns.falsePositiveUsers.length}`);

    if (analysis.userPatterns.falsePositiveUsers.length > 0) {
      console.log("Top false positive users:");
      analysis.userPatterns.falsePositiveUsers.slice(0, 5).forEach((user) => {
        console.log(`  User ${user.userId}: ${user.ignoredCount} ignored reports in [${user.categories.join(", ")}]`);
      });
    }

    console.log("\n⏰ TEMPORAL PATTERNS:");
    const hourWithMostIgnored = analysis.temporalPatterns.hourlyDistribution.ignored.indexOf(Math.max(...analysis.temporalPatterns.hourlyDistribution.ignored));
    const hourWithMostAccepted = analysis.temporalPatterns.hourlyDistribution.accepted.indexOf(Math.max(...analysis.temporalPatterns.hourlyDistribution.accepted));
    console.log(`Peak ignored reports: ${hourWithMostIgnored}:00`);
    console.log(`Peak accepted reports: ${hourWithMostAccepted}:00`);

    console.log("\n📺 CHANNEL PATTERNS:");
    if (analysis.channelPatterns.problematicChannels.length > 0) {
      console.log("Most problematic channels (high false positive rate):");
      analysis.channelPatterns.problematicChannels.slice(0, 5).forEach((channel) => {
        console.log(`  Channel ${channel.channelId}: ${(channel.ratio * 100).toFixed(1)}% false positive rate (${channel.ignoredCount}/${channel.ignoredCount + channel.acceptedCount})`);
      });
    }

    console.log("\n💡 RECOMMENDATIONS:");
    analysis.recommendations.forEach((rec) => console.log(`  ${rec}`));

    // Save detailed analysis
    const fs = await import("fs/promises");
    const outputPath = join(process.cwd(), "scripts", "moderation-analysis", "pattern-analysis-results.json");
    await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));
    console.log(`\n📁 Detailed pattern analysis saved to ${outputPath}`);

    console.log("\n" + "=".repeat(80));
  } catch (error) {
    console.error("❌ Pattern analysis failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from database");
  }
}

if (import.meta.main) {
  main();
}
