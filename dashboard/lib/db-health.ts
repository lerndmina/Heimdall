import { prisma } from "./prisma";

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (error) {
    console.error("Database health check failed:", error);
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

export async function waitForDatabase(maxAttempts: number = 30, delayMs: number = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { connected } = await checkDatabaseHealth();

    if (connected) {
      console.log(`✅ Database connected on attempt ${attempt}`);
      return true;
    }

    console.log(`⏳ Database connection attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.error(`❌ Failed to connect to database after ${maxAttempts} attempts`);
  return false;
}
