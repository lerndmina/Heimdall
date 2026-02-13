import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PLUGINS_DIR = path.join(ROOT, "plugins");
const TARGET_DIR_NAMES = new Set(["commands", "contextMenuCommands"]);
const FILE_EXTENSIONS = new Set([".ts", ".js", ".mts", ".cts", ".mjs", ".cjs"]);
const NEEDLE_REGEX = /\.setDefaultMemberPermissions\s*\(/g;

interface Finding {
  filePath: string;
  line: number;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dirPath: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }

    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
    out.push(full);
  }
}

function lineFromIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

async function collectCandidateFiles(): Promise<string[]> {
  const files: string[] = [];
  if (!(await exists(PLUGINS_DIR))) return files;

  const pluginEntries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
  for (const pluginEntry of pluginEntries) {
    if (!pluginEntry.isDirectory()) continue;

    const pluginPath = path.join(PLUGINS_DIR, pluginEntry.name);
    const childEntries = await fs.readdir(pluginPath, { withFileTypes: true });
    for (const child of childEntries) {
      if (!child.isDirectory()) continue;
      if (!TARGET_DIR_NAMES.has(child.name)) continue;

      const fullChild = path.join(pluginPath, child.name);
      await walk(fullChild, files);
    }
  }

  return files;
}

async function findNativePerms(files: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    NEEDLE_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = NEEDLE_REGEX.exec(content)) !== null) {
      findings.push({
        filePath,
        line: lineFromIndex(content, match.index),
      });
    }
  }

  return findings;
}

function toRelative(p: string): string {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

async function main(): Promise<void> {
  const files = await collectCandidateFiles();
  const findings = await findNativePerms(files);

  if (findings.length === 0) {
    console.log("[perm-check] ✅ No Discord-native command permission gates found (.setDefaultMemberPermissions).\n");
    return;
  }

  console.warn("[perm-check] ⚠️ Found Discord-native command permission gates. Prefer dashboard-managed permissions instead.");
  for (const finding of findings) {
    console.warn(`[perm-check] - ${toRelative(finding.filePath)}:${finding.line}`);
  }
  console.warn(`[perm-check] Total: ${findings.length} occurrence(s).\n`);
}

main().catch((error) => {
  console.error("[perm-check] Failed to scan command files:", error);
  process.exitCode = 1;
});
