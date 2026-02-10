import { PermissionFlagsBits, type GuildMember } from "discord.js";
import type { HeimdallClient } from "../types/Client.js";
import DashboardPermission from "../../plugins/dashboard/models/DashboardPermission.js";
import type { PermissionCategory } from "./dashboardPermissionDefs.js";
import { resolvePermissions, type MemberInfo, type RoleOverrides, type ResolvedPermissions } from "./dashboardPermissions.js";
import { permissionRegistry } from "./PermissionRegistry.js";

export class PermissionService {
  constructor(private client: HeimdallClient) {}

  async getCategories(guildId: string): Promise<PermissionCategory[]> {
    return permissionRegistry.getCategories(guildId);
  }

  async canPerformAction(guildId: string, member: GuildMember, userId: string, actionKey: string): Promise<boolean> {
    const knownActions = await permissionRegistry.getAllActionKeys(guildId);
    // Default-closed: unknown actions are denied
    if (!knownActions.has(actionKey)) return false;

    const resolved = await this.resolveForMember(guildId, member, userId);
    if (!resolved) return false;
    if (resolved.denyAccess) return false;
    return resolved.has(actionKey);
  }

  async resolveForMember(guildId: string, member: GuildMember, userId: string): Promise<ResolvedPermissions | null> {
    const permDocs = await DashboardPermission.find({ guildId }).lean();
    const categories = await permissionRegistry.getCategories(guildId);

    const memberInfo: MemberInfo = this.buildMemberInfo(member, userId);

    if (permDocs.length === 0) {
      // Default-closed: no permission docs means only owners/admins get full access
      const memberInfo: MemberInfo = this.buildMemberInfo(member, userId);
      if (memberInfo.isOwner || memberInfo.isAdministrator) {
        return this.buildAllowAllPermissions(categories);
      }
      return this.buildDenyAllPermissions(categories);
    }

    const roleOverrides: RoleOverrides[] = permDocs
      .filter((doc) => member.roles.cache.has(doc.discordRoleId))
      .map((doc) => ({
        overrides: (doc.overrides as Record<string, "allow" | "deny">) ?? {},
        position: member.guild.roles.cache.get(doc.discordRoleId)?.position ?? 0,
      }));

    return resolvePermissions(memberInfo, roleOverrides, categories);
  }

  private buildMemberInfo(member: GuildMember, userId: string): MemberInfo {
    const ownerIds = (process.env.OWNER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const isBotOwner = ownerIds.includes(userId);

    return {
      roleIds: member.roles.cache.map((r) => r.id),
      isOwner: member.guild.ownerId === userId || isBotOwner,
      isAdministrator: member.permissions.has(PermissionFlagsBits.Administrator),
    };
  }

  private buildAllowAllPermissions(permissionCategories: PermissionCategory[]): ResolvedPermissions {
    const resolved: Record<string, boolean> = {};
    const categoryActions: Record<string, string[]> = {};

    for (const cat of permissionCategories) {
      categoryActions[cat.key] = [];
      for (const action of cat.actions) {
        const key = `${cat.key}.${action.key}`;
        resolved[key] = true;
        categoryActions[cat.key]!.push(key);
      }
    }

    return {
      denyAccess: false,
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

  private buildDenyAllPermissions(permissionCategories: PermissionCategory[]): ResolvedPermissions {
    const resolved: Record<string, boolean> = {};
    const categoryActions: Record<string, string[]> = {};

    for (const cat of permissionCategories) {
      categoryActions[cat.key] = [];
      for (const action of cat.actions) {
        const key = `${cat.key}.${action.key}`;
        resolved[key] = false;
        categoryActions[cat.key]!.push(key);
      }
    }

    return {
      denyAccess: false,
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
}
