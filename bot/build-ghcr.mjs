#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Heimdall — Interactive Docker Build & Publish to GHCR
// Run:  node build-ghcr.mjs   (or)   bun build-ghcr.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { createInterface } from "readline/promises";
import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, ".build-config.json");
const PKG_PATH = resolve(__dirname, "package.json");

// ── Colours / formatting ────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
};

const ok = (msg) => console.log(`${c.green}  ✔ ${msg}${c.reset}`);
const warn = (msg) => console.log(`${c.yellow}  ⚠ ${msg}${c.reset}`);
const err = (msg) => console.log(`${c.red}  ✖ ${msg}${c.reset}`);
const info = (msg) => console.log(`${c.cyan}  ℹ ${msg}${c.reset}`);
const divider = () => console.log(`${c.dim}  ${"─".repeat(56)}${c.reset}`);

// ── Config helpers ──────────────────────────────────────────────────────────
function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveConfig(cfg) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

function getPackageVersion() {
  try {
    return JSON.parse(readFileSync(PKG_PATH, "utf-8")).version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

// ── Shell helpers ───────────────────────────────────────────────────────────
function exec(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: __dirname,
    stdio: "inherit",
    ...opts,
  });
}

function execQuiet(cmd) {
  try {
    return execSync(cmd, { cwd: __dirname, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function streamCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: __dirname, stdio: "inherit", shell: true });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))));
    child.on("error", reject);
  });
}

// ── Prerequisite checks ────────────────────────────────────────────────────
function checkDocker() {
  const v = execQuiet("docker --version");
  if (!v) {
    err("Docker is not installed or not in PATH.");
    process.exit(1);
  }
  return v;
}

function isDockerRunning() {
  // Succeeds only when daemon is reachable; avoids verbose info output
  return execQuiet("docker version --format '{{.Server.Version}}'") !== null;
}

function requireDockerRunning() {
  if (!isDockerRunning()) {
    err("Docker engine is not running!");
    const isWindows = process.platform === "win32";
    if (isWindows) {
      info("Start Docker Desktop and wait for the engine to be ready, then try again.");
    } else {
      info('Start the Docker daemon (e.g. "sudo systemctl start docker") and try again.');
    }
    return false;
  }
  return true;
}

function checkBuildx() {
  const v = execQuiet("docker buildx version");
  return v !== null;
}

function isLoggedIntoGhcr() {
  try {
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home) return false;
    const dockerCfgPath = resolve(home, ".docker", "config.json");
    if (!existsSync(dockerCfgPath)) return false;
    const dockerCfg = readFileSync(dockerCfgPath, "utf-8");
    return dockerCfg.includes("ghcr.io");
  } catch {
    return false;
  }
}

// ── Build the full image tag ────────────────────────────────────────────────
function imageRef(cfg, tag) {
  return `ghcr.io/${cfg.owner}/${cfg.repo}:${tag}`;
}

function getShaTag() {
  const sha = execQuiet("git rev-parse --short=12 HEAD");
  return sha ? `sha-${sha}` : null;
}

function stripShaTags(tags) {
  return tags.filter((tag) => !/^sha-[a-f0-9]{7,40}$/i.test(tag));
}

function withShaTag(tags) {
  const shaTag = getShaTag();
  if (!shaTag) {
    warn("Could not determine git SHA; continuing without SHA tag.");
    return [...new Set(stripShaTags(tags))];
  }
  return [...new Set([...stripShaTags(tags), shaTag])];
}

function localImageExists(ref) {
  return execQuiet(`docker image inspect ${ref}`) !== null;
}

function ensureLocalTag(cfg, targetTag, sourceTags = []) {
  const targetRef = imageRef(cfg, targetTag);
  if (localImageExists(targetRef)) return true;

  const candidates = [...new Set(sourceTags.filter((tag) => tag && tag !== targetTag))];
  for (const sourceTag of candidates) {
    const sourceRef = imageRef(cfg, sourceTag);
    if (!localImageExists(sourceRef)) continue;
    try {
      info(`Creating missing local tag ${targetRef} from ${sourceRef}...`);
      exec(`docker tag ${sourceRef} ${targetRef}`);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

// ── Interactive readline ────────────────────────────────────────────────────
let rl;
function getRL() {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

async function ask(prompt, defaultVal) {
  const suffix = defaultVal ? ` ${c.dim}(${defaultVal})${c.reset}` : "";
  const answer = await getRL().question(`${c.white}  ${prompt}${suffix}: ${c.reset}`);
  return answer.trim() || defaultVal || "";
}

async function confirm(prompt, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await ask(`${prompt} [${hint}]`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

async function choose(prompt, options) {
  console.log();
  console.log(`${c.bold}${c.white}  ${prompt}${c.reset}`);
  divider();
  options.forEach((opt, i) => {
    const num = `${c.cyan}${i + 1}${c.reset}`;
    const label = opt.label ?? opt;
    const desc = opt.desc ? `  ${c.dim}${opt.desc}${c.reset}` : "";
    console.log(`    ${num}) ${label}${desc}`);
  });
  divider();

  while (true) {
    const answer = await ask("Choose an option", "1");
    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < options.length) return idx;
    warn("Invalid choice, try again.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu actions
// ─────────────────────────────────────────────────────────────────────────────

async function actionConfigure(cfg) {
  console.log();
  console.log(`${c.bold}${c.bgMagenta}${c.white}  ⚙  Configure GHCR Settings  ${c.reset}`);
  console.log();

  cfg.owner = await ask("GitHub username or org", cfg.owner || "");
  cfg.repo = await ask("Container / repo name", cfg.repo || "heimdall");

  const wantPat = await confirm("Set / update your GitHub PAT?", !cfg.pat);
  if (wantPat) {
    cfg.pat = await ask("GitHub Personal Access Token (write:packages scope)");
  }

  cfg.platforms = await ask("Build platforms (comma-separated)", cfg.platforms || "linux/amd64");

  saveConfig(cfg);
  console.log();
  ok("Configuration saved to .build-config.json");
  info("Tip: add .build-config.json to .gitignore (it may contain your PAT).");
}

async function actionLogin(cfg) {
  console.log();
  console.log(`${c.bold}${c.bgBlue}${c.white}  🔑  Login to GHCR  ${c.reset}`);
  console.log();

  if (!cfg.pat) {
    cfg.pat = await ask("GitHub PAT (write:packages scope)");
    const save = await confirm("Save PAT to config?");
    if (save) saveConfig(cfg);
  }

  if (!cfg.owner) {
    cfg.owner = await ask("GitHub username");
    saveConfig(cfg);
  }

  info("Logging in to ghcr.io...");
  try {
    execSync(`echo ${cfg.pat} | docker login ghcr.io -u ${cfg.owner} --password-stdin`, {
      cwd: __dirname,
      stdio: ["pipe", "inherit", "inherit"],
    });
    ok("Successfully logged in to ghcr.io!");
    cfg._loggedIn = true;
  } catch {
    err("Login failed. Check your PAT and username.");
  }
}

async function actionBuild(cfg) {
  console.log();
  console.log(`${c.bold}${c.bgBlue}${c.white}  🔨  Build Docker Image  ${c.reset}`);
  console.log();

  const version = getPackageVersion();
  const hasBuildx = checkBuildx();
  const platforms = cfg.platforms || "linux/amd64";
  const isMultiPlatform = platforms.includes(",");

  // Determine tags (remembers last-used tags)
  const rememberedTags = cfg.lastTags
    ? stripShaTags(
        cfg.lastTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ).join(",")
    : "";
  const defaultTags = rememberedTags || `latest,v${version}`;
  const rawTags = await ask("Tags (comma-separated)", defaultTags);
  const baseTags = stripShaTags(
    rawTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
  const tags = [...new Set(baseTags)];
  const shaTag = getShaTag();

  if (!cfg.owner || !cfg.repo) {
    warn("Owner or repo not configured. Run Configure first.");
    return { tags: [] };
  }

  const tagFlags = tags.map((t) => `-t ${imageRef(cfg, t)}`).join(" ");

  console.log();
  info(`Image:      ghcr.io/${cfg.owner}/${cfg.repo}`);
  info(`Tags:       ${tags.join(", ")}`);
  if (shaTag) info(`SHA Tag:    ${shaTag} ${c.dim}(applied on push)${c.reset}`);
  info(`Platforms:  ${platforms}`);
  info(`Buildx:     ${hasBuildx ? "yes" : "no (falling back to docker build)"}`);
  console.log();

  const proceed = await confirm("Start build?");
  if (!proceed) {
    warn("Build cancelled.");
    return { tags: [] };
  }

  // Verify Docker engine is running before we start
  if (!requireDockerRunning()) {
    return { tags: [], error: true };
  }

  console.log();
  const startTime = Date.now();

  try {
    if (hasBuildx && isMultiPlatform) {
      // Multi-platform build with buildx
      info("Using docker buildx for multi-platform build...");
      const pushTags = withShaTag(tags);

      // Ensure a builder exists
      const builderExists = execQuiet("docker buildx inspect heimdall-builder");
      if (!builderExists) {
        info("Creating buildx builder instance (first build will pull buildkit)...");
        exec("docker buildx create --name heimdall-builder --driver docker-container --use");
      } else {
        exec("docker buildx use heimdall-builder");
      }

      await streamCmd("docker", ["buildx", "build", "--platform", platforms, ...pushTags.flatMap((t) => ["-t", imageRef(cfg, t)]), "--push", "."]);
      ok("Multi-platform build & push complete!");

      // Stop the builder container (it persists otherwise)
      execQuiet("docker buildx stop heimdall-builder");
      info("Builder container stopped.");

      // Save tags as default for next run
      cfg.lastTags = baseTags.join(",");
      saveConfig(cfg);

      return { tags: pushTags, pushed: true };
    } else {
      // Standard build
      await streamCmd("docker", ["build", ...tags.flatMap((t) => ["-t", imageRef(cfg, t)]), "."]);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    ok(`Build completed in ${elapsed}s`);

    // Save tags as default for next run
    cfg.lastTags = baseTags.join(",");
    saveConfig(cfg);

    return { tags, pushed: false };
  } catch (e) {
    // Stop the builder container on failure too
    execQuiet("docker buildx stop heimdall-builder");
    err(`Build failed: ${e.message}`);
    return { tags: [], error: true };
  }
}

async function actionPush(cfg, tags) {
  console.log();
  console.log(`${c.bold}${c.bgBlue}${c.white}  🚀  Push to GHCR  ${c.reset}`);
  console.log();

  if (!cfg.owner || !cfg.repo) {
    warn("Owner or repo not configured. Run Configure first.");
    return;
  }

  // Check login
  if (!cfg._loggedIn && !isLoggedIntoGhcr()) {
    warn("You don't appear to be logged in to ghcr.io.");
    const login = await confirm("Login now?");
    if (login) await actionLogin(cfg);
    else {
      warn("Push cancelled — not logged in.");
      return;
    }
  }

  // Determine which tags to push
  if (!tags || tags.length === 0) {
    const version = getPackageVersion();
    const raw = await ask("Tags to push (comma-separated)", `latest,v${version}`);
    tags = stripShaTags(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }

  tags = [...new Set(tags)];
  const selectedTags = [...tags];
  const shaTag = getShaTag();
  if (shaTag && !tags.includes(shaTag)) {
    if (ensureLocalTag(cfg, shaTag, selectedTags)) {
      tags.push(shaTag);
    } else {
      warn(`Could not create local SHA tag ${imageRef(cfg, shaTag)}; continuing without it.`);
    }
  }

  console.log();
  info("Pushing the following tags:");
  tags.forEach((t) => info(`  → ${imageRef(cfg, t)}`));
  console.log();

  const proceed = await confirm("Continue?");
  if (!proceed) {
    warn("Push cancelled.");
    return;
  }

  // Verify Docker engine is running before we push
  if (!requireDockerRunning()) return;

  for (const tag of tags) {
    const ref = imageRef(cfg, tag);
    if (!localImageExists(ref)) {
      err(`Skipping ${ref} (local tag does not exist)`);
      continue;
    }
    try {
      info(`Pushing ${ref}...`);
      await streamCmd("docker", ["push", ref]);
      ok(`Pushed ${ref}`);
    } catch {
      err(`Failed to push ${ref}`);
    }
  }
}

async function actionBuildAndPush(cfg) {
  const result = await actionBuild(cfg);
  if (result.error || result.tags.length === 0) return;
  if (result.pushed) {
    ok("Images were already pushed during multi-platform buildx.");
    return;
  }
  await actionPush(cfg, result.tags);
}

async function actionShowConfig(cfg) {
  console.log();
  console.log(`${c.bold}${c.bgMagenta}${c.white}  📋  Current Configuration  ${c.reset}`);
  console.log();
  const version = getPackageVersion();

  const rows = [
    ["Owner", cfg.owner || c.dim + "(not set)" + c.reset],
    ["Repo", cfg.repo || c.dim + "(not set)" + c.reset],
    ["PAT", cfg.pat ? c.green + "●●●●●●" + cfg.pat.slice(-4) + c.reset : c.dim + "(not set)" + c.reset],
    ["Platforms", cfg.platforms || "linux/amd64"],
    ["Pkg Version", version],
    ["Full Image", cfg.owner && cfg.repo ? `ghcr.io/${cfg.owner}/${cfg.repo}` : c.dim + "(configure first)" + c.reset],
    ["GHCR Login", isLoggedIntoGhcr() ? c.green + "authenticated" + c.reset : c.yellow + "not logged in" + c.reset],
    ["Docker", execQuiet("docker --version") || c.red + "not found" + c.reset],
    ["Engine", isDockerRunning() ? c.green + "running" + c.reset : c.red + "not running" + c.reset],
    ["Buildx", checkBuildx() ? c.green + "available" + c.reset : c.dim + "not available" + c.reset],
    ["Config File", CONFIG_PATH],
  ];

  for (const [label, value] of rows) {
    console.log(`    ${c.bold}${label.padEnd(14)}${c.reset} ${value}`);
  }
  console.log();
}

async function actionCleanup(cfg) {
  console.log();
  console.log(`${c.bold}${c.bgBlue}${c.white}  🧹  Cleanup  ${c.reset}`);
  console.log();

  const idx = await choose("What do you want to clean?", [
    { label: "Dangling images", desc: "docker image prune" },
    { label: "All Heimdall images", desc: `remove all ghcr.io/${cfg.owner || "*"}/${cfg.repo || "*"} images` },
    { label: "Docker build cache", desc: "docker builder prune" },
    { label: "Cancel" },
  ]);

  if (idx === 3) return;

  if (idx === 0) {
    exec("docker image prune -f");
    ok("Dangling images removed.");
  } else if (idx === 1) {
    if (!cfg.owner || !cfg.repo) {
      warn("Not configured. Nothing to clean.");
      return;
    }
    const images = execQuiet(`docker images ghcr.io/${cfg.owner}/${cfg.repo} -q`);
    if (images) {
      exec(`docker rmi ${images.split("\n").join(" ")} -f`);
      ok("Heimdall images removed.");
    } else {
      info("No Heimdall images found.");
    }
  } else if (idx === 2) {
    exec("docker builder prune -f");
    ok("Build cache cleared.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  checkDocker();
  const cfg = loadConfig();

  // Banner
  console.clear();

  // Check if Docker daemon is actually running
  if (!isDockerRunning()) {
    console.log();
    warn("Docker engine is not running.");
    const isWindows = process.platform === "win32";
    if (isWindows) {
      info("Start Docker Desktop and wait for the engine to be ready.");
    } else {
      info('Start the Docker daemon (e.g. "sudo systemctl start docker").');
    }
    info("You can still configure settings — build/push will re-check.");
    console.log();
  }
  console.log();
  console.log(`${c.bold}${c.magenta}  ╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}  ║${c.reset}${c.bold}${c.white}     Heimdall — Docker Build & Publish (GHCR)         ${c.reset}${c.bold}${c.magenta}║${c.reset}`);
  console.log(`${c.bold}${c.magenta}  ╚══════════════════════════════════════════════════════╝${c.reset}`);
  console.log();

  if (!cfg.owner || !cfg.repo) {
    warn("No configuration found. Let's set things up.");
    await actionConfigure(cfg);
  }

  while (true) {
    const action = await choose("What would you like to do?", [
      { label: "Build & Push", desc: "build image and push to GHCR in one step" },
      { label: "Build Only", desc: "build Docker image locally" },
      { label: "Push Only", desc: "push an existing local image to GHCR" },
      { label: "Login to GHCR", desc: "authenticate with your PAT" },
      { label: "Configure", desc: "set owner, repo, PAT, platforms" },
      { label: "Show Config", desc: "display current settings & status" },
      { label: "Cleanup", desc: "prune images and build cache" },
      { label: "Exit" },
    ]);

    switch (action) {
      case 0:
        await actionBuildAndPush(cfg);
        break;
      case 1:
        await actionBuild(cfg);
        break;
      case 2:
        await actionPush(cfg);
        break;
      case 3:
        await actionLogin(cfg);
        break;
      case 4:
        await actionConfigure(cfg);
        break;
      case 5:
        await actionShowConfig(cfg);
        break;
      case 6:
        await actionCleanup(cfg);
        break;
      case 7:
        console.log();
        ok("Goodbye!");
        console.log();
        getRL().close();
        process.exit(0);
    }
  }
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
