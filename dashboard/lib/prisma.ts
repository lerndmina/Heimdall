// Prisma disabled - using JWT-only sessions
// import { PrismaClient } from "@prisma/client";

// Mock Prisma client for compatibility
export const prisma = {
  $connect: async () => {
    console.log("ℹ️ Database not required (using JWT-only sessions)");
  },
  $disconnect: async () => {
    console.log("ℹ️ Database not required (using JWT-only sessions)");
  },
};

// Add connection validation function (disabled)
export async function validateDatabaseConnection() {
  console.log("ℹ️ Database validation skipped (using JWT-only sessions)");
  return true;
}
