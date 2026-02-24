#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Heimdall — Interactive Docker Build & Publish to GHCR
// Run:  node build-ghcr.mjs   (or)   bun build-ghcr.mjs
// CLI:  node build-ghcr.mjs --build-push [--tags latest,v1.2.3] [--platforms linux/amd64]
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
    return execSync(cmd, { cwd: __dirname, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

function nativePlatform() {
  // Kept for reference; buildx sets $BUILDPLATFORM automatically
  const os = process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  return `${os}/${arch}`;
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
  return execQuiet("docker buildx version") !== null;
}

function detectDistro() {
  try {
    const osRelease = readFileSync("/etc/os-release", "utf-8");
    const idLine = osRelease.split("\n").find((l) => l.startsWith("ID=")) || "";
    const idLike = osRelease.split("\n").find((l) => l.startsWith("ID_LIKE=")) || "";
    const id = idLine.replace(/^ID=/, "").replace(/"/g, "").trim().toLowerCase();
    const like = idLike.replace(/^ID_LIKE=/, "").replace(/"/g, "").trim().toLowerCase();
    if (id === "arch" || like.includes("arch")) return "arch";
    if (["debian", "ubuntu"].includes(id) || like.includes("debian") || like.includes("ubuntu")) return "debian";
    if (["fedora", "rhel", "centos"].includes(id) || like.includes("fedora") || like.includes("rhel")) return "fedora";
  } catch {
    // not Linux or no /etc/os-release
  }
  return "unknown";
}

async function ensureBuildx() {
  if (checkBuildx()) return true;

  console.log();
  err("docker buildx is not installed.");
  console.log(`${c.yellow}  The Heimdall Dockerfile uses \$BUILDPLATFORM and multi-stage BuildKit${c.reset}`);
  console.log(`${c.yellow}  features that require buildx. The legacy 'docker build' will not work.${c.reset}`);
  console.log();

  const isWindows = process.platform === "win32";
  const distro = isWindows ? "windows" : detectDistro();

  const installCmds = {
    arch:    "sudo pacman -S docker-buildx",
    debian:  "sudo apt-get install -y docker-buildx-plugin",
    fedora:  "sudo dnf install -y docker-buildx-plugin",
    windows: null, // install via Docker Desktop
    unknown: null,
  };

  const installCmd = installCmds[distro] ?? null;

  if (installCmd) {
    info(`Detected package manager — install command: ${c.bold}${installCmd}${c.reset}`);
    const doInstall = await confirm("Run that command now?", true);
    if (doInstall) {
      try {
        exec(installCmd);
        if (checkBuildx()) {
          ok("docker buildx installed successfully!");
          return true;
        } else {
          err("buildx still not found after install. You may need to restart your shell or re-add the Docker plugin directory to PATH.");
          return false;
        }
      } catch {
        err("Install command failed. Try running it manually.");
        return false;
      }
    }
  } else {
    info("Install docker buildx from: https://docs.docker.com/go/buildx/");
    if (isWindows) info("On Windows, install or update Docker Desktop to get buildx.");
  }

  console.log();
  return false;
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

function parseCsv(value) {
  return (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
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

function printCliHelp() {
  console.log(`
Heimdall GHCR builder

Usage:
  node build-ghcr.mjs [flags]
  bun build-ghcr.mjs [flags]

Modes:
  --build              Build image only
  --push               Push existing local image tags
  --build-push         Build then push

Common flags:
  --owner <name>       Override GitHub owner/org
  --repo <name>        Override image repo
  --platforms <list>   Build platforms (default: config or linux/amd64)
  --tags <list>        Comma-separated tags (default: config last tags or latest,v<package-version>)
  --no-sha             Do not include sha-<gitsha> tag on push flows
  --login              Perform docker login to ghcr.io before operations
  --pat <token>        PAT for login (write:packages)
  --yes                Skip interactive confirmations in CLI mode
  --help               Show this help

Examples:
  node build-ghcr.mjs --build-push
  node build-ghcr.mjs --build-push --tags latest,v1.2.0 --platforms linux/amd64,linux/arm64
  node build-ghcr.mjs --push --tags latest
`);
}

function parseCliArgs(argv) {
  const cli = {
    build: false,
    push: false,
    buildPush: false,
    owner: null,
    repo: null,
    platforms: null,
    tags: null,
    includeSha: true,
    login: false,
    pat: null,
    yes: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--build":
        cli.build = true;
        break;
      case "--push":
        cli.push = true;
        break;
      case "--build-push":
        cli.buildPush = true;
        break;
      case "--owner":
        cli.owner = next || null;
        i++;
        break;
      case "--repo":
        cli.repo = next || null;
        i++;
        break;
      case "--platforms":
        cli.platforms = next || null;
        i++;
        break;
      case "--tags":
        cli.tags = next || null;
        i++;
        break;
      case "--no-sha":
        cli.includeSha = false;
        break;
      case "--login":
        cli.login = true;
        break;
      case "--pat":
        cli.pat = next || null;
        i++;
        break;
      case "--yes":
        cli.yes = true;
        break;
      case "-h":
      case "--help":
        cli.help = true;
        break;
      default:
        if (arg?.startsWith("--")) {
          err(`Unknown flag: ${arg}`);
          cli.help = true;
        }
    }
  }

  if ((cli.build && cli.push) || cli.buildPush) {
    cli.buildPush = true;
    cli.build = false;
    cli.push = false;
  }

  return cli;
}

function isCliMode(cli) {
  return cli.build || cli.push || cli.buildPush || cli.help;
}

async function loginWithConfig(cfg) {
  if (!cfg.pat) {
    err("Cannot login: PAT not set. Provide --pat or run interactive Configure/Login first.");
    return false;
  }
  if (!cfg.owner) {
    err("Cannot login: owner not set. Provide --owner or run interactive Configure first.");
    return false;
  }

  info("Logging in to ghcr.io...");
  try {
    execSync(`echo ${cfg.pat} | docker login ghcr.io -u ${cfg.owner} --password-stdin`, {
      cwd: __dirname,
      stdio: ["pipe", "inherit", "inherit"],
    });
    ok("Successfully logged in to ghcr.io!");
    return true;
  } catch {
    err("Login failed. Check your PAT and username.");
    return false;
  }
}

function resolveDefaultTags(cfg) {
  const version = getPackageVersion();
  const remembered = cfg.lastTags ? parseCsv(cfg.lastTags) : [];
  const tags = remembered.length > 0 ? remembered : ["latest", `v${version}`];
  return stripShaTags(tags);
}

async function buildNonInteractive(cfg, { tags, platforms, push }) {
  if (!(await ensureBuildx())) {
    return { ok: false, tags: [] };
  }

  if (!requireDockerRunning()) {
    return { ok: false, tags: [] };
  }

  const effectivePlatforms = platforms || cfg.platforms || "linux/amd64";
  const isMultiPlatform = effectivePlatforms.includes(",");
  const baseTags = stripShaTags(tags);
  const tagsToBuild = [...new Set(baseTags)];

  if (isMultiPlatform && !push) {
    err("Multi-platform builds require --push or --build-push (buildx cannot --load multi-platform images)." );
    return { ok: false, tags: [] };
  }

  info(`Image: ghcr.io/${cfg.owner}/${cfg.repo}`);
  info(`Tags: ${tagsToBuild.join(", ")}`);
  info(`Platforms: ${effectivePlatforms}`);
  info(`Mode: ${isMultiPlatform ? "multi-platform buildx" : "single-platform buildx"}`);

  const builderExists = execQuiet("docker buildx inspect heimdall-builder");
  if (!builderExists) {
    info("Creating buildx builder instance...");
    exec("docker buildx create --name heimdall-builder --driver docker-container --use");
  } else {
    exec("docker buildx use heimdall-builder");
  }

  try {
    if (isMultiPlatform) {
      const pushTags = withShaTag(tagsToBuild);
      await streamCmd("docker", ["buildx", "build", "--platform", effectivePlatforms, ...pushTags.flatMap((t) => ["-t", imageRef(cfg, t)]), "--push", "."]);
      ok("Multi-platform build and push completed.");
      cfg.lastTags = baseTags.join(",");
      saveConfig(cfg);
      execQuiet("docker buildx stop heimdall-builder");
      return { ok: true, tags: pushTags, pushed: true };
    }

    await streamCmd("docker", ["buildx", "build", "--platform", effectivePlatforms, "--load", ...tagsToBuild.flatMap((t) => ["-t", imageRef(cfg, t)]), "."]);
    ok("Build completed.");
    cfg.lastTags = baseTags.join(",");
    saveConfig(cfg);
    return { ok: true, tags: tagsToBuild, pushed: false };
  } catch (e) {
    err(`Build failed: ${e.message}`);
    return { ok: false, tags: [] };
  }
}

async function pushNonInteractive(cfg, tags, includeSha = true) {
  if (!requireDockerRunning()) return false;

  const selectedTags = [...new Set(stripShaTags(tags))];
  const toPush = includeSha ? withShaTag(selectedTags) : selectedTags;

  for (const tag of toPush) {
    const ref = imageRef(cfg, tag);
    if (!localImageExists(ref)) {
      const canCreate = includeSha && /^sha-[a-f0-9]{7,40}$/i.test(tag) ? ensureLocalTag(cfg, tag, selectedTags) : false;
      if (!canCreate) {
        warn(`Skipping ${ref} (local tag does not exist)`);
        continue;
      }
    }

    info(`Pushing ${ref}...`);
    await streamCmd("docker", ["push", ref]);
    ok(`Pushed ${ref}`);
  }

  return true;
}

async function runCliMode(cli) {
  if (cli.help) {
    printCliHelp();
    return 0;
  }

  checkDocker();

  const cfg = loadConfig();
  let changed = false;
  if (cli.owner && cli.owner !== cfg.owner) {
    cfg.owner = cli.owner;
    changed = true;
  }
  if (cli.repo && cli.repo !== cfg.repo) {
    cfg.repo = cli.repo;
    changed = true;
  }
  if (cli.platforms && cli.platforms !== cfg.platforms) {
    cfg.platforms = cli.platforms;
    changed = true;
  }
  if (cli.pat && cli.pat !== cfg.pat) {
    cfg.pat = cli.pat;
    changed = true;
  }
  if (changed) saveConfig(cfg);

  if (!cfg.owner || !cfg.repo) {
    err("Owner/repo are not configured. Use --owner/--repo or run interactive Configure.");
    return 1;
  }

  if (cli.login) {
    const loggedIn = await loginWithConfig(cfg);
    if (!loggedIn) return 1;
  }

  const tags = cli.tags ? stripShaTags(parseCsv(cli.tags)) : resolveDefaultTags(cfg);
  if (tags.length === 0) {
    err("No tags resolved. Provide --tags or configure default tags first.");
    return 1;
  }

  if (cli.buildPush) {
    const buildResult = await buildNonInteractive(cfg, { tags, platforms: cli.platforms, push: true });
    if (!buildResult.ok) return 1;
    if (!buildResult.pushed) {
      await pushNonInteractive(cfg, buildResult.tags, cli.includeSha);
    }
    return 0;
  }

  if (cli.build) {
    const buildResult = await buildNonInteractive(cfg, { tags, platforms: cli.platforms, push: false });
    return buildResult.ok ? 0 : 1;
  }

  if (cli.push) {
    if (!cli.login && !isLoggedIntoGhcr()) {
      err("Not logged in to ghcr.io. Use --login (and optionally --pat) or login manually.");
      return 1;
    }
    await pushNonInteractive(cfg, tags, cli.includeSha);
    return 0;
  }

  err("No mode selected. Use --build, --push, or --build-push.");
  return 1;
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

  // Buildx is required — the Dockerfile uses $BUILDPLATFORM / BuildKit features
  if (!(await ensureBuildx())) {
    return { tags: [], error: true };
  }

  const version = getPackageVersion();
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
  info(`Mode:       ${isMultiPlatform ? "multi-platform buildx (push during build)" : "single-platform buildx (--load)"}`);
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

  // Ensure a builder instance exists for all builds
  const builderExists = execQuiet("docker buildx inspect heimdall-builder");
  if (!builderExists) {
    info("Creating buildx builder instance (first build may pull buildkit)...");
    exec("docker buildx create --name heimdall-builder --driver docker-container --use");
  } else {
    exec("docker buildx use heimdall-builder");
  }

  try {
    if (isMultiPlatform) {
      // Multi-platform build — must push directly (no local multi-arch load support)
      info("Using docker buildx for multi-platform build...");
      const pushTags = withShaTag(tags);

      await streamCmd("docker", ["buildx", "build", "--platform", platforms, ...pushTags.flatMap((t) => ["-t", imageRef(cfg, t)]), "--push", "."]);
      ok("Multi-platform build & push complete!");

      execQuiet("docker buildx stop heimdall-builder");
      info("Builder container stopped.");

      cfg.lastTags = baseTags.join(",");
      saveConfig(cfg);

      return { tags: pushTags, pushed: true };
    } else {
      // Single-platform buildx build — load into local daemon
      info(`Building for ${platforms} with buildx...`);
      await streamCmd("docker", ["buildx", "build", "--platform", platforms, "--load", ...tags.flatMap((t) => ["-t", imageRef(cfg, t)]), "."]);
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
  const cli = parseCliArgs(process.argv.slice(2));
  if (isCliMode(cli)) {
    const code = await runCliMode(cli);
    process.exit(code);
  }

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
