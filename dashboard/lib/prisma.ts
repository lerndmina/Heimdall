import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Add connection validation function
export async function validateDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database connection established");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

// Test connection on module load in production
if (process.env.NODE_ENV === "production") {
  validateDatabaseConnection().catch((error) => {
    console.error("Database connection validation failed:", error);
  });
}
