import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface PermissionAction {
  key: string;
}

interface PermissionCategory {
  key: string;
  actions: PermissionAction[];
}

const ROOT = process.cwd();
const SERVER_DEFS_PATH = path.join(ROOT, "src/core/dashboardPermissionDefs.ts");
const APP_DEFS_PATH = path.join(ROOT, "plugins/dashboard/app/lib/permissionDefs.ts");
const SERVER_ROUTE_MAP_PATH = path.join(ROOT, "src/core/dashboardRoutePermissions.ts");
const APP_ROUTE_MAP_PATH = path.join(ROOT, "plugins/dashboard/app/lib/routePermissions.ts");

function normalizeRouteMap(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  const routePattern = /"([A-Z]+\s+\/[^"\n]+)"\s*:\s*"([a-z0-9._-]+)"/g;

  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(content)) !== null) {
    const [, routeKey, action] = match;
    entries.set(routeKey!, action!);
  }

  return entries;
}

function compareStringMaps(a: Map<string, string>, b: Map<string, string>, aLabel: string, bLabel: string): string[] {
  const issues: string[] = [];

  for (const [key, value] of a.entries()) {
    if (!b.has(key)) {
      issues.push(`Missing route in ${bLabel}: ${key}`);
      continue;
    }

    const bValue = b.get(key)!;
    if (bValue !== value) {
      issues.push(`Route mismatch for ${key}: ${aLabel}=${value}, ${bLabel}=${bValue}`);
    }
  }

  for (const key of b.keys()) {
    if (!a.has(key)) {
      issues.push(`Missing route in ${aLabel}: ${key}`);
    }
  }

  return issues;
}

function buildActionSet(categories: PermissionCategory[]): Set<string> {
  const actionSet = new Set<string>();

  for (const category of categories) {
    for (const action of category.actions) {
      actionSet.add(`${category.key}.${action.key}`);
    }
  }

  return actionSet;
}

function comparePermissionDefs(serverDefs: PermissionCategory[], appDefs: PermissionCategory[]): string[] {
  const issues: string[] = [];

  const serverByCategory = new Map(serverDefs.map((category) => [category.key, category]));
  const appByCategory = new Map(appDefs.map((category) => [category.key, category]));

  for (const [categoryKey, serverCategory] of serverByCategory.entries()) {
    const appCategory = appByCategory.get(categoryKey);
    if (!appCategory) {
      issues.push(`Missing category in dashboard app defs: ${categoryKey}`);
      continue;
    }

    const serverActions = new Set(serverCategory.actions.map((action) => action.key));
    const appActions = new Set(appCategory.actions.map((action) => action.key));

    for (const actionKey of serverActions) {
      if (!appActions.has(actionKey)) {
        issues.push(`Missing action in dashboard app defs: ${categoryKey}.${actionKey}`);
      }
    }

    for (const actionKey of appActions) {
      if (!serverActions.has(actionKey)) {
        issues.push(`Unknown action in dashboard app defs: ${categoryKey}.${actionKey}`);
      }
    }
  }

  for (const categoryKey of appByCategory.keys()) {
    if (!serverByCategory.has(categoryKey)) {
      issues.push(`Unknown category in dashboard app defs: ${categoryKey}`);
    }
  }

  return issues;
}

async function main(): Promise<void> {
  const [serverRouteMapContent, appRouteMapContent] = await Promise.all([readFile(SERVER_ROUTE_MAP_PATH, "utf8"), readFile(APP_ROUTE_MAP_PATH, "utf8")]);

  const serverRouteMap = normalizeRouteMap(serverRouteMapContent);
  const appRouteMap = normalizeRouteMap(appRouteMapContent);

  const routeIssues = compareStringMaps(serverRouteMap, appRouteMap, "server", "dashboard app");

  const [serverDefsModule, appDefsModule] = await Promise.all([
    import(pathToFileURL(SERVER_DEFS_PATH).href) as Promise<{ permissionCategories: PermissionCategory[] }>,
    import(pathToFileURL(APP_DEFS_PATH).href) as Promise<{ permissionCategories: PermissionCategory[] }>,
  ]);

  const definitionIssues = comparePermissionDefs(serverDefsModule.permissionCategories, appDefsModule.permissionCategories);

  const validActions = buildActionSet(serverDefsModule.permissionCategories);
  const invalidRouteActionIssues: string[] = [];

  for (const [route, action] of serverRouteMap.entries()) {
    if (!validActions.has(action)) {
      invalidRouteActionIssues.push(`Route points to unknown action: ${route} -> ${action}`);
    }
  }

  const issues = [...routeIssues, ...definitionIssues, ...invalidRouteActionIssues];

  if (issues.length === 0) {
    console.log("[perm-parity] ✅ Permission defs and route maps are in parity.\n");
    return;
  }

  console.error("[perm-parity] ❌ Permission parity check failed:");
  for (const issue of issues) {
    console.error(`[perm-parity] - ${issue}`);
  }
  console.error(`[perm-parity] Total: ${issues.length} issue(s).\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[perm-parity] Failed to run permission parity check:", error);
  process.exitCode = 1;
});
