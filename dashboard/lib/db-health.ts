// Database health check - disabled since we use JWT-only sessions
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  error?: string;
}> {
  // Since we're using JWT sessions and no database, always return "not required"
  return { connected: false, error: "Database not required (JWT-only sessions)" };
}

export async function waitForDatabase(maxAttempts: number = 30, delayMs: number = 2000): Promise<boolean> {
  // Database not required for JWT-only setup
  console.log("ℹ️ Database not required (using JWT-only sessions)");
  return true;
}
