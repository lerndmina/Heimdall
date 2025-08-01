import type { LoadedCommand } from "./Command";

export interface ManagementConfig {
  enabled: boolean;
  ownerIds: string[];
  allowDMs: boolean;
  allowGuild: boolean;
  enableHotReload: boolean;
  enableAnalytics: boolean;
}

export interface CommandMetadata {
  name: string;
  category: string;
  enabled: boolean;
  isDevOnly: boolean;
  guildOnly: boolean;
  lastReloaded?: Date;
  executionCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastExecuted?: Date;
  filePath?: string;
  description?: string;
}

export interface CommandFilters {
  category?: string;
  status?: "enabled" | "disabled" | "dev-only" | "all";
  searchTerm?: string;
}

export interface ReloadResult {
  success: boolean;
  commandName?: string;
  error?: string;
  previousVersion?: any;
  newVersion?: any;
  reloadTime: number;
}

export interface CommandListResult {
  commands: CommandMetadata[];
  totalCount: number;
  filteredCount: number;
  categories: string[];
}

export interface RegistrationResult {
  success: boolean;
  registeredCount: number;
  errors: string[];
  guildId?: string;
  isGlobal: boolean;
}
