#!/usr/bin/env bun
/**
 * Main runner script for all moderation analysis tools
 * Runs all analysis scripts in sequence and generates a comprehensive report
 */

import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

const SCRIPT_DIR = process.cwd();
const OUTPUT_DIR = join(SCRIPT_DIR, "results");

interface ScriptConfig {
  name: string;
  file: string;
  description: string;
  outputFile: string;
}

const SCRIPTS: ScriptConfig[] = [
  {
    name: "Basic Analysis",
    file: "analyze-reports.ts",
    description: "Analyzes overall report statistics and basic patterns",
    outputFile: "analysis-results.json",
  },
  {
    name: "Threshold Optimization",
    file: "optimize-thresholds.ts",
    description: "Optimizes confidence thresholds to reduce false positives",
    outputFile: "threshold-optimization-results.json",
  },
  {
    name: "Pattern Analysis",
    file: "pattern-analysis.ts",
    description: "Deep analysis of user, temporal, and content patterns",
    outputFile: "pattern-analysis-results.json",
  },
];

function runScript(scriptPath: string): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    console.log(`🚀 Running ${scriptPath}...`);

    const process = spawn("bun", ["run", scriptPath], {
      cwd: SCRIPT_DIR,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let error = "";

    process.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      console.log(text.trim());
    });

    process.stderr.on("data", (data) => {
      const text = data.toString();
      error += text;
      console.error(text.trim());
    });

    process.on("close", (code) => {
      resolve({
        success: code === 0,
        output,
        error: error || undefined,
      });
    });
  });
}

async function ensureOutputDirectory() {
  try {
    const fs = await import("fs/promises");
    if (!existsSync(OUTPUT_DIR)) {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
    }
  } catch (error) {
    console.error("❌ Failed to create output directory:", error);
  }
}

async function generateSummaryReport(results: Array<{ script: ScriptConfig; success: boolean; executionTime: number }>) {
  try {
    const fs = await import("fs/promises");

    const summary = {
      executionTime: new Date().toISOString(),
      totalScripts: results.length,
      successfulScripts: results.filter((r) => r.success).length,
      failedScripts: results.filter((r) => r.success === false).length,
      results: results.map((r) => ({
        name: r.script.name,
        success: r.success,
        executionTimeMs: r.executionTime,
        outputFile: r.script.outputFile,
        hasOutput: existsSync(join(SCRIPT_DIR, r.script.outputFile)),
      })),
      recommendations: [
        "Review the individual analysis files for detailed insights",
        "Implement threshold changes gradually and monitor results",
        "Consider A/B testing new thresholds on a subset of servers",
        "Set up monitoring for false positive rates after changes",
      ],
    };

    const summaryPath = join(SCRIPT_DIR, "moderation-analysis-summary.json");
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("📋 ANALYSIS SUMMARY");
    console.log("=".repeat(80));
    console.log(`✅ Successful scripts: ${summary.successfulScripts}/${summary.totalScripts}`);
    console.log(`❌ Failed scripts: ${summary.failedScripts}`);
    console.log(`📁 Summary saved to: ${summaryPath}`);

    if (summary.successfulScripts > 0) {
      console.log("\n📊 Generated files:");
      summary.results.forEach((result) => {
        if (result.success && result.hasOutput) {
          console.log(`  ✅ ${result.name}: ${result.outputFile}`);
        }
      });
    }

    console.log("\n💡 Next Steps:");
    summary.recommendations.forEach((rec) => console.log(`  • ${rec}`));
  } catch (error) {
    console.error("❌ Failed to generate summary report:", error);
  }
}

async function main() {
  console.log("🤖 Heimdall AI Moderation Analysis Suite");
  console.log("=".repeat(80));
  console.log("This will run all moderation analysis scripts to help optimize your AI moderation system.\n");

  await ensureOutputDirectory();

  const results: Array<{ script: ScriptConfig; success: boolean; executionTime: number }> = [];

  for (const script of SCRIPTS) {
    const startTime = Date.now();

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 ${script.name.toUpperCase()}`);
    console.log(`Description: ${script.description}`);
    console.log(`${"=".repeat(60)}`);

    const result = await runScript(script.file);
    const executionTime = Date.now() - startTime;

    results.push({
      script,
      success: result.success,
      executionTime,
    });

    if (result.success) {
      console.log(`✅ ${script.name} completed successfully in ${executionTime}ms`);
    } else {
      console.log(`❌ ${script.name} failed after ${executionTime}ms`);
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    }

    // Small delay between scripts
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await generateSummaryReport(results);

  const allSuccessful = results.every((r) => r.success);
  if (allSuccessful) {
    console.log("\n🎉 All analysis scripts completed successfully!");
  } else {
    console.log("\n⚠️ Some scripts failed. Check the output above for details.");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Runner script failed:", error);
    process.exit(1);
  });
}
