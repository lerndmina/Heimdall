import mongoose from "mongoose";

async function pingMongoDB(uri: string): Promise<void> {
  try {
    console.log(`Attempting to connect to MongoDB at: ${uri}`);
    // Attempt to connect with a 5-second timeout for server selection.
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("Successfully connected to MongoDB.");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  } finally {
    // Close the connection if it was successfully opened.
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

// Get the MongoDB URI from command-line arguments.
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(
    'Usage: bun run filename.ts "<MongoDB_URI>"\n' +
      'Example: bun run filename.ts "mongodb://username:password@host:port/database"'
  );
  process.exit(1);
}

const mongoUri = args[0];
pingMongoDB(mongoUri);
