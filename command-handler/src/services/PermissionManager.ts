import type { PermissionRule, PermissionContext, PermissionResult, PermissionConfig, CommandPermissions, CategoryPermissions, PermissionCache, PermissionCondition } from "../types/Permissions";
import { PermissionType } from "../types/Permissions";
import { createLogger, LogLevel } from "@heimdall/logger";
import crypto from "crypto";

export class PermissionManager {
  private logger = createLogger("command-handler-permissions", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  private config: PermissionConfig;
  private commandPermissions = new Map<string, CommandPermissions>();
  private categoryPermissions = new Map<string, CategoryPermissions>();
  private permissionCache = new Map<string, PermissionCache>();

  constructor(config: Partial<PermissionConfig> = {}) {
    this.config = {
      enableAdvancedPermissions: true,
      enableCategoryInheritance: true,
      enableTimeBasedPermissions: true,
      enableCustomValidators: true,
      defaultPermissionBehavior: "allow",
      cachePermissions: true,
      cacheTtl: 300000, // 5 minutes
      logPermissionChecks: false,
      ...config,
    };

    this.logger.debug("PermissionManager initialized with config:", this.config);
  }

  /**
   * Main permission check method
   */
  async checkPermissions(context: PermissionContext): Promise<PermissionResult> {
    if (!this.config.enableAdvancedPermissions) {
      return {
        allowed: this.config.defaultPermissionBehavior === "allow",
        reason: "Advanced permissions disabled",
        appliedRules: [],
        bypassedRules: [],
      };
    }

    // Check cache first
    if (this.config.cachePermissions) {
      const cached = this.getCachedResult(context);
      if (cached) {
        this.logger.debug("Using cached permission result", { command: context.command.name, user: context.userId });
        return cached;
      }
    }

    // Get effective permissions for the command
    const permissions = this.getEffectivePermissions(context.command.name);

    // Evaluate permissions
    const result = await this.evaluatePermissions(permissions, context);

    // Cache result
    if (this.config.cachePermissions) {
      this.cacheResult(context, result);
    }

    // Log if enabled
    if (this.config.logPermissionChecks) {
      this.logger.info("Permission check completed", {
        command: context.command.name,
        user: context.userId,
        guild: context.guildId,
        allowed: result.allowed,
        reason: result.reason,
        appliedRules: result.appliedRules.length,
      });
    }

    return result;
  }

  /**
   * Add permission rule to a command
   */
  addPermissionRule(commandName: string, rule: PermissionRule): void {
    if (!this.commandPermissions.has(commandName)) {
      this.commandPermissions.set(commandName, {
        rules: [],
        inheritFromCategory: true,
        defaultAllow: this.config.defaultPermissionBehavior === "allow",
        requireAllRules: false,
      });
    }

    const permissions = this.commandPermissions.get(commandName)!;

    // Remove existing rule with same ID if it exists
    permissions.rules = permissions.rules.filter((r) => r.id !== rule.id);

    // Add new rule and sort by priority
    permissions.rules.push(rule);
    permissions.rules.sort((a, b) => b.priority - a.priority);

    this.logger.debug(`Added permission rule to ${commandName}:`, rule);
    this.invalidateCache(commandName);
  }

  /**
   * Remove permission rule from a command
   */
  removePermissionRule(commandName: string, ruleId: string): boolean {
    const permissions = this.commandPermissions.get(commandName);
    if (!permissions) {
      return false;
    }

    const initialLength = permissions.rules.length;
    permissions.rules = permissions.rules.filter((r) => r.id !== ruleId);

    const removed = permissions.rules.length < initialLength;
    if (removed) {
      this.logger.debug(`Removed permission rule ${ruleId} from ${commandName}`);
      this.invalidateCache(commandName);
    }

    return removed;
  }

  /**
   * Set category permissions
   */
  setCategoryPermissions(categoryName: string, permissions: CategoryPermissions): void {
    this.categoryPermissions.set(categoryName, permissions);
    this.logger.debug(`Set category permissions for ${categoryName}`);

    // Invalidate cache for all commands in this category
    this.invalidateCategoryCache(categoryName);
  }

  /**
   * Get effective permissions for a command (including category inheritance)
   */
  getEffectivePermissions(commandName: string): CommandPermissions {
    const commandPerms = this.commandPermissions.get(commandName);

    if (!commandPerms?.inheritFromCategory || !this.config.enableCategoryInheritance) {
      return (
        commandPerms || {
          rules: [],
          inheritFromCategory: false,
          defaultAllow: this.config.defaultPermissionBehavior === "allow",
          requireAllRules: false,
        }
      );
    }

    // Find category for this command (this would be enhanced with actual category detection)
    const categoryName = this.getCategoryForCommand(commandName);
    const categoryPerms = this.categoryPermissions.get(categoryName);

    if (!categoryPerms) {
      return commandPerms;
    }

    // Merge category and command permissions
    const effectiveRules = [...categoryPerms.permissions.rules];

    if (!categoryPerms.overrideCommandPermissions) {
      effectiveRules.push(...commandPerms.rules);
    }

    // Sort by priority
    effectiveRules.sort((a, b) => b.priority - a.priority);

    return {
      rules: effectiveRules,
      inheritFromCategory: commandPerms.inheritFromCategory,
      defaultAllow: commandPerms.defaultAllow,
      requireAllRules: commandPerms.requireAllRules,
      customValidator: commandPerms.customValidator || categoryPerms.permissions.customValidator,
    };
  }

  /**
   * Evaluate permissions against context
   */
  private async evaluatePermissions(permissions: CommandPermissions, context: PermissionContext): Promise<PermissionResult> {
    const appliedRules: PermissionRule[] = [];
    const bypassedRules: PermissionRule[] = [];
    let finalDecision = permissions.defaultAllow;
    let decisionRule: PermissionRule | undefined;
    let decisionReason = permissions.defaultAllow ? "Default allow" : "Default deny";

    // Evaluate custom validator first if present
    if (permissions.customValidator && this.config.enableCustomValidators) {
      try {
        const customResult = await permissions.customValidator(context);
        if (!customResult) {
          return {
            allowed: false,
            reason: "Custom validator denied access",
            appliedRules: [],
            bypassedRules: [],
            deniedBy: undefined,
          };
        }
      } catch (error) {
        this.logger.error("Custom validator error:", error);
        return {
          allowed: false,
          reason: "Custom validator error",
          appliedRules: [],
          bypassedRules: [],
        };
      }
    }

    // Evaluate rules in priority order
    for (const rule of permissions.rules) {
      try {
        // Check if rule is expired
        if (rule.expiry && new Date() > rule.expiry) {
          bypassedRules.push(rule);
          continue;
        }

        // Check conditions
        if (rule.conditions && !(await this.evaluateConditions(rule.conditions, context))) {
          bypassedRules.push(rule);
          continue;
        }

        // Evaluate the rule
        const ruleMatches = await this.evaluateRule(rule, context);

        if (ruleMatches) {
          appliedRules.push(rule);

          if (permissions.requireAllRules) {
            // In "require all" mode, any deny rule fails immediately
            if (!rule.allow) {
              return {
                allowed: false,
                reason: `Rule '${rule.id}' denied access`,
                appliedRules,
                bypassedRules,
                deniedBy: rule,
              };
            }
          } else {
            // In "any rule" mode, first matching rule decides
            finalDecision = rule.allow;
            decisionRule = rule;
            decisionReason = rule.allow ? `Rule '${rule.id}' allowed access` : `Rule '${rule.id}' denied access`;
            break;
          }
        } else {
          bypassedRules.push(rule);
        }
      } catch (error) {
        this.logger.error(`Error evaluating permission rule ${rule.id}:`, error);
        bypassedRules.push(rule);
      }
    }

    // In "require all" mode, if we get here, all rules passed
    if (permissions.requireAllRules && appliedRules.length > 0) {
      finalDecision = true;
      decisionReason = "All required rules passed";
    }

    return {
      allowed: finalDecision,
      reason: decisionReason,
      appliedRules,
      bypassedRules,
      deniedBy: !finalDecision ? decisionRule : undefined,
      allowedBy: finalDecision ? decisionRule : undefined,
    };
  }

  /**
   * Evaluate a single permission rule
   */
  private async evaluateRule(rule: PermissionRule, context: PermissionContext): Promise<boolean> {
    switch (rule.type) {
      case PermissionType.USER:
        return this.evaluateUserRule(rule, context);

      case PermissionType.ROLE:
        return this.evaluateRoleRule(rule, context);

      case PermissionType.CHANNEL:
        return this.evaluateChannelRule(rule, context);

      case PermissionType.TIME_BASED:
        return this.evaluateTimeBasedRule(rule, context);

      case PermissionType.CUSTOM:
        return this.evaluateCustomRule(rule, context);

      default:
        this.logger.warn(`Unknown permission rule type: ${rule.type}`);
        return false;
    }
  }

  /**
   * Evaluate user-based permission rule
   */
  private evaluateUserRule(rule: PermissionRule, context: PermissionContext): boolean {
    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
    return values.includes(context.userId);
  }

  /**
   * Evaluate role-based permission rule
   */
  private evaluateRoleRule(rule: PermissionRule, context: PermissionContext): boolean {
    if (!context.memberRoles || context.memberRoles.length === 0) {
      return false;
    }

    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
    return values.some((roleId) => context.memberRoles!.includes(roleId));
  }

  /**
   * Evaluate channel-based permission rule
   */
  private evaluateChannelRule(rule: PermissionRule, context: PermissionContext): boolean {
    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
    return values.includes(context.channelId);
  }

  /**
   * Evaluate time-based permission rule
   */
  private evaluateTimeBasedRule(rule: PermissionRule, context: PermissionContext): boolean {
    if (!this.config.enableTimeBasedPermissions) {
      return false;
    }

    // This would be expanded based on specific time-based logic
    // For now, just check if current time is within the rule's time range
    const now = context.timestamp || new Date();

    // Example: rule.value could be { start: "09:00", end: "17:00", timezone: "UTC" }
    // This is a simplified implementation
    return true;
  }

  /**
   * Evaluate custom permission rule
   */
  private async evaluateCustomRule(rule: PermissionRule, context: PermissionContext): Promise<boolean> {
    // Custom rules would have their logic defined in rule.metadata
    // This is a placeholder for extensibility
    return false;
  }

  /**
   * Evaluate permission conditions
   */
  private async evaluateConditions(conditions: PermissionCondition[], context: PermissionContext): Promise<boolean> {
    for (const condition of conditions) {
      if (!(await this.evaluateCondition(condition, context))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single permission condition
   */
  private async evaluateCondition(condition: PermissionCondition, context: PermissionContext): Promise<boolean> {
    // This would be expanded with specific condition evaluation logic
    // For now, return true as a placeholder
    return true;
  }

  /**
   * Generate cache key for permission check
   */
  private generateCacheKey(context: PermissionContext): string {
    const keyData = {
      command: context.command.name,
      user: context.userId,
      guild: context.guildId,
      channel: context.channelId,
      roles: context.memberRoles?.sort(),
    };

    return crypto.createHash("md5").update(JSON.stringify(keyData)).digest("hex");
  }

  /**
   * Get cached permission result
   */
  private getCachedResult(context: PermissionContext): PermissionResult | null {
    const key = this.generateCacheKey(context);
    const cached = this.permissionCache.get(key);

    if (!cached || Date.now() > cached.expiry) {
      if (cached) {
        this.permissionCache.delete(key);
      }
      return null;
    }

    return cached.result;
  }

  /**
   * Cache permission result
   */
  private cacheResult(context: PermissionContext, result: PermissionResult): void {
    const key = this.generateCacheKey(context);
    const expiry = Date.now() + this.config.cacheTtl;

    this.permissionCache.set(key, {
      key,
      result,
      expiry,
      contextHash: key,
    });
  }

  /**
   * Invalidate cache for a specific command
   */
  private invalidateCache(commandName: string): void {
    for (const [key, cached] of this.permissionCache.entries()) {
      if (cached.contextHash.includes(commandName)) {
        this.permissionCache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache for a category
   */
  private invalidateCategoryCache(categoryName: string): void {
    // This would be enhanced with actual category-to-command mapping
    this.permissionCache.clear(); // For now, clear all
  }

  /**
   * Get category for command (placeholder - would be enhanced with actual category detection)
   */
  private getCategoryForCommand(commandName: string): string {
    // This would integrate with the category system
    return "default";
  }

  /**
   * Clear all permission cache
   */
  clearCache(): void {
    this.permissionCache.clear();
    this.logger.debug("Cleared permission cache");
  }

  /**
   * Get permission statistics
   */
  getPermissionStats(): {
    totalRules: number;
    commandsWithRules: number;
    categoriesWithRules: number;
    cacheSize: number;
  } {
    let totalRules = 0;
    for (const perms of this.commandPermissions.values()) {
      totalRules += perms.rules.length;
    }
    for (const perms of this.categoryPermissions.values()) {
      totalRules += perms.permissions.rules.length;
    }

    return {
      totalRules,
      commandsWithRules: this.commandPermissions.size,
      categoriesWithRules: this.categoryPermissions.size,
      cacheSize: this.permissionCache.size,
    };
  }
}
