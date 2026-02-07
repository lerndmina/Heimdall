/**
 * Permission Resolution — Evaluates a user's effective permissions
 * based on their roles' overrides and the permission registry.
 *
 * Resolution order:
 * 1. Guild owner → always allow everything
 * 2. Discord Administrator → default allow, then apply overrides (deny wins)
 * 3. Normal user → inherit (deny) by default, apply overrides (deny wins across roles)
 *
 * Override precedence:
 * - Action-level overrides ("minecraft.manage_config") beat category-level ("minecraft")
 * - Across roles: deny wins (matching Discord's behaviour)
 */

import { permissionCategories } from "./permissionDefs";

export interface RoleOverrides {
  /** Map of override key → "allow" | "deny" */
  overrides: Map<string, "allow" | "deny"> | Record<string, "allow" | "deny">;
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

  // Collect all override maps
  const overrideMaps = roleOverridesList.map((r) => toMap(r.overrides));

  // Check if any of the user's role overrides deny dashboard access entirely.
  // When _deny_access is "deny", the admin privilege is revoked for dashboard purposes.
  const denyAccess = overrideMaps.some((m) => m.get(DENY_ACCESS_KEY) === "deny");
  const effectiveAdmin = member.isAdministrator && !denyAccess;

  for (const actionKey of allActions) {
    const [categoryKey] = actionKey.split(".");

    // Determine default: Administrators start with allow (unless access denied), others with deny
    let defaultValue: boolean = effectiveAdmin;

    // (c) Check action-level overrides across all roles
    let hasActionLevel = false;
    let actionAllowed = false;
    let actionDenied = false;

    for (const overrides of overrideMaps) {
      const actionVal = overrides.get(actionKey);
      if (actionVal) {
        hasActionLevel = true;
        if (actionVal === "deny") actionDenied = true;
        else if (actionVal === "allow") actionAllowed = true;
      }
    }

    if (hasActionLevel) {
      // Deny wins across roles at action level
      resolved[actionKey] = actionDenied ? false : actionAllowed;
      continue;
    }

    // Fall back to category-level overrides
    let hasCategoryLevel = false;
    let categoryAllowed = false;
    let categoryDenied = false;

    for (const overrides of overrideMaps) {
      const catVal = overrides.get(categoryKey!);
      if (catVal) {
        hasCategoryLevel = true;
        if (catVal === "deny") categoryDenied = true;
        else if (catVal === "allow") categoryAllowed = true;
      }
    }

    if (hasCategoryLevel) {
      // Deny wins across roles at category level
      resolved[actionKey] = categoryDenied ? false : categoryAllowed;
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
