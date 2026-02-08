/**
 * Permission Resolution — Evaluates a user's effective permissions
 * based on their roles' overrides and the permission registry.
 *
 * Resolution order:
 * 1. Guild owner → always allow everything
 * 2. Discord Administrator → default allow, then apply overrides
 * 3. Normal user → inherit (deny) by default, apply overrides
 *
 * Override precedence:
 * - Action-level overrides ("minecraft.manage_config") beat category-level ("minecraft")
 * - Across roles: highest-positioned role wins (matching Discord's hierarchy)
 */

import { permissionCategories } from "./permissionDefs";

export interface RoleOverrides {
  /** Map of override key → "allow" | "deny" */
  overrides: Map<string, "allow" | "deny"> | Record<string, "allow" | "deny">;
  /** Discord role position — higher number = higher in hierarchy */
  position: number;
}

export interface MemberInfo {
  roleIds: string[];
  isOwner: boolean;
  isAdministrator: boolean;
}

export interface ResolvedPermissions {
  /** Check if a specific action is allowed */
  has(actionKey: string): boolean;
  /** Get all action keys with their resolved boolean values */
  getAll(): Record<string, boolean>;
  /** Check if the user has at least one allowed action in a category */
  hasAnyInCategory(categoryKey: string): boolean;
  /** Whether access to the dashboard itself is denied via _deny_access override */
  denyAccess: boolean;
}

/**
 * Normalise an overrides value to a plain Map regardless of input format.
 */
function toMap(input: Map<string, "allow" | "deny"> | Record<string, "allow" | "deny">): Map<string, string> {
  if (input instanceof Map) return input as Map<string, string>;
  return new Map(Object.entries(input));
}

/**
 * Resolve effective permissions for a user given their member info and
 * the permission overrides for each of their roles.
 */
/**
 * Reserved override key — when set to "deny" on a role, the admin bypass
 * is stripped for members holding that role (they are treated as non-admin
 * for dashboard purposes). This lets guild owners lock admins out of the
 * dashboard without revoking their Discord admin perms.
 */
export const DENY_ACCESS_KEY = "_deny_access";

export function resolvePermissions(member: MemberInfo, roleOverridesList: RoleOverrides[]): ResolvedPermissions {
  // Build the full list of action keys from the registry
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

  // (a) Guild owner → allow everything, unconditionally
  if (member.isOwner) {
    for (const key of allActions) resolved[key] = true;
    return createResult(resolved, categoryActions, false);
  }

  // Sort role overrides by position descending (highest role first)
  const sortedRoles = [...roleOverridesList].sort((a, b) => b.position - a.position);
  const overrideMaps = sortedRoles.map((r) => toMap(r.overrides));

  // Check if the HIGHEST role that has a _deny_access override denies access.
  // Higher-positioned roles override lower ones.
  let denyAccess = false;
  for (const overrides of overrideMaps) {
    const val = overrides.get(DENY_ACCESS_KEY);
    if (val) {
      denyAccess = val === "deny";
      break; // Highest role with an opinion wins
    }
  }
  const effectiveAdmin = member.isAdministrator && !denyAccess;

  for (const actionKey of allActions) {
    const [categoryKey] = actionKey.split(".");

    // Determine default: Administrators start with allow (unless access denied), others with deny
    let defaultValue: boolean = effectiveAdmin;

    // (c) Check action-level overrides — highest-positioned role with an opinion wins
    let hasActionLevel = false;
    let actionResult: boolean = false;

    for (const overrides of overrideMaps) {
      const actionVal = overrides.get(actionKey);
      if (actionVal) {
        hasActionLevel = true;
        actionResult = actionVal === "allow";
        break; // Highest role with an explicit action-level override wins
      }
    }

    if (hasActionLevel) {
      resolved[actionKey] = actionResult;
      continue;
    }

    // Fall back to category-level overrides — highest-positioned role wins
    let hasCategoryLevel = false;
    let categoryResult: boolean = false;

    for (const overrides of overrideMaps) {
      const catVal = overrides.get(categoryKey!);
      if (catVal) {
        hasCategoryLevel = true;
        categoryResult = catVal === "allow";
        break; // Highest role with an explicit category-level override wins
      }
    }

    if (hasCategoryLevel) {
      resolved[actionKey] = categoryResult;
      continue;
    }

    // No overrides found → use default
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
