import { Client } from "discord.js";

// Handler configuration interface
export interface HandlerConfig {
  client: Client<true>;
  
  // Required paths (absolute)
  commandsPath: string;
  eventsPath: string;
  validationsPath: string;
  
  // Optional CommandKit compatibility
  devGuildIds?: string[];
  devUserIds?: string[];
  
  // Enhanced options
  options?: {
    autoRegisterCommands?: boolean; // Default: true
    handleValidationErrors?: boolean; // Default: true
    logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Default: 'info'
    enableHotReload?: boolean; // Default: false (dev only)
  };
}
