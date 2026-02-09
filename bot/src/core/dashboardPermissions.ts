/**
 * Server-side permission resolver for dashboard access.
 */

import { permissionCategories } from "./dashboardPermissionDefs.js";

export interface RoleOverrides {
  overrides: Map<string, "allow" | "deny"> | Record<string, "allow" | "deny">;
  position: number;
}

export interface MemberInfo {
  roleIds: string[];
  isOwner: boolean;
  isAdministrator: boolean;
}

export interface ResolvedPermissions {
  has(actionKey: string): boolean;
  getAll(): Record<string, boolean>;
  hasAnyInCategory(categoryKey: string): boolean;
  denyAccess: boolean;
}

export const DENY_ACCESS_KEY = "_deny_access";

function toMap(input: Map<string, "allow" | "deny"> | Record<string, "allow" | "deny">): Map<string, string> {
  if (input instanceof Map) return input as Map<string, string>;
  return new Map(Object.entries(input));
}

export function resolvePermissions(member: MemberInfo, roleOverridesList: RoleOverrides[]): ResolvedPermissions {
  const allActions: string[] = [];
  const categoryActions: Record<string, string[]> = {};

  for (const cat of permissionCategories) {
    categoryActions[cat.key] = [];
    for (const action of cat.actions) {
      const key = `${cat.key}.${action.key}`;
      allActions.push(key);
      categoryActions[cat.key]!.push(key);
    }
  }

  const resolved: Record<string, boolean> = {};

  if (member.isOwner) {
    for (const key of allActions) resolved[key] = true;
    return createResult(resolved, categoryActions, false);
  }

  const sortedRoles = [...roleOverridesList].sort((a, b) => b.position - a.position);
  const overrideMaps = sortedRoles.map((r) => toMap(r.overrides));

  let denyAccess = false;
  for (const overrides of overrideMaps) {
    const val = overrides.get(DENY_ACCESS_KEY);
    if (val) {
      denyAccess = val === "deny";
      break;
    }
  }

  const effectiveAdmin = member.isAdministrator && !denyAccess;

  for (const actionKey of allActions) {
    const [categoryKey] = actionKey.split(".");
    let defaultValue: boolean = effectiveAdmin;

    let hasActionLevel = false;
    let actionResult = false;

    for (const overrides of overrideMaps) {
      const actionVal = overrides.get(actionKey);
      if (actionVal) {
        hasActionLevel = true;
        actionResult = actionVal === "allow";
        break;
      }
    }

    if (hasActionLevel) {
      resolved[actionKey] = actionResult;
      continue;
    }

    let hasCategoryLevel = false;
    let categoryResult = false;

    for (const overrides of overrideMaps) {
      const catVal = overrides.get(categoryKey!);
      if (catVal) {
        hasCategoryLevel = true;
        categoryResult = catVal === "allow";
        break;
      }
    }

    if (hasCategoryLevel) {
      resolved[actionKey] = categoryResult;
      continue;
    }

    resolved[actionKey] = defaultValue;
  }

  return createResult(resolved, categoryActions, denyAccess);
}

function createResult(resolved: Record<string, boolean>, categoryActions: Record<string, string[]>, denyAccess: boolean): ResolvedPermissions {
  return {
    denyAccess,
    has(actionKey: string): boolean {
      return resolved[actionKey] === true;
    },
    getAll(): Record<string, boolean> {
      return { ...resolved };
    },
    hasAnyInCategory(categoryKey: string): boolean {
      const actions = categoryActions[categoryKey];
      if (!actions) return false;
      return actions.some((key) => resolved[key] === true);
    },
  };
}
