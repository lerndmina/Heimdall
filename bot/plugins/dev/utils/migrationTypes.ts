/**
 * Shared migration types — used by Legacy Import, Instance Clone,
 * API routes, and WebSocket progress broadcasting.
 */

export type MigrationMode = "legacy" | "clone";

export interface MigrationProgressEvent {
  mode: MigrationMode;
  step: string;
  label: string;
  plugin?: string;
  completed: number;
  total: number;
  recordIndex?: number;
  recordTotal?: number;
  result?: MigrationResult;
}

export interface MigrationResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  details?: any;
}
