#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import ZiplineService from "./src/services/ZiplineService";
import FetchEnvs from "./src/utils/FetchEnvs";

const readFile = promisify(fs.readFile);

interface TestConfig {
  filePath: string;
  uploadOptions?: {
    maxDays?: number;
    compressionLevel?: number;
    password?: string;
    folder?: string;
    embed?: boolean;
    format?: string;
    quality?: number;
  };
}

class ZiplineUploadTester {
  private config: TestConfig;

  constructor(config: TestConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    console.log("🚀 Starting Zipline Upload Test");
    console.log("================================");

    try {
      // Get environment variables
      const envs = FetchEnvs();
      const { ZIPLINE_TOKEN, ZIPLINE_BASEURL } = envs;

      console.log(`🔗 Base URL: ${ZIPLINE_BASEURL}`);
      console.log(`🔑 Token: ${ZIPLINE_TOKEN ? "***" + ZIPLINE_TOKEN.slice(-4) : "Not set"}`);

      // Validate file exists
      if (!fs.existsSync(this.config.filePath)) {
        throw new Error(`File not found: ${this.config.filePath}`);
      }

      // Get file info
      const fileStats = fs.statSync(this.config.filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      const fileName = path.basename(this.config.filePath);

      console.log(`📁 File: ${fileName}`);
      console.log(`📏 Size: ${fileSizeMB.toFixed(2)} MB`);
      console.log("");

      // Create and initialize ZiplineService
      console.log("🔧 Initializing ZiplineService...");
      const ziplineService = new ZiplineService(ZIPLINE_TOKEN, ZIPLINE_BASEURL);

      // Initialize the service
      const validation = await ziplineService.initialize();
      console.log(`✅ Service initialized. Status: ${validation}`);

      if (!ziplineService.isReady()) {
        throw new Error("ZiplineService is not ready for uploads");
      }

      // Check file size before attempting to read it
      const maxUploadSizeMB = ziplineService.getMaxUploadSize();
      if (fileSizeMB > maxUploadSizeMB) {
        throw new Error(
          `File size (${fileSizeMB.toFixed(
            2
          )} MB) exceeds maximum upload size of ${maxUploadSizeMB} MB`
        );
      }

      // Read file as Buffer
      console.log("📖 Reading file...");
      const fileBuffer = await readFile(this.config.filePath);
      console.log(`✅ File read successfully (${fileBuffer.length} bytes)`);

      // Upload file
      console.log("⬆️  Uploading file...");
      const startTime = Date.now();

      const result = await ziplineService.uploadFile(
        fileBuffer,
        fileName,
        this.config.uploadOptions
      );

      const uploadTime = Date.now() - startTime;
      console.log(`✅ Upload completed in ${uploadTime}ms`);
      console.log("");

      // Display results
      console.log("📋 Upload Results:");
      console.log("==================");
      console.log(`Files uploaded: ${result.files.length}`);

      result.files.forEach((file, index) => {
        console.log(`\nFile ${index + 1}:`);
        console.log(`  ID: ${file.id}`);
        console.log(`  Type: ${file.type}`);
        console.log(`  URL: ${file.url}`);
        if (file.pending) console.log(`  Status: Pending`);
      });

      if (result.deletesAt) {
        console.log(`\n🗓️  Files will be deleted at: ${result.deletesAt}`);
      }

      if (result.assumedMimetypes && result.assumedMimetypes.some(Boolean)) {
        console.log(`\n⚠️  Some mimetypes were assumed`);
      }

      if (result.partialSuccess) {
        console.log(`\n📦 Partial upload successful`);
        if (result.partialIdentifier) {
          console.log(`   Partial ID: ${result.partialIdentifier}`);
        }
      }
    } catch (error) {
      console.error("❌ Upload failed:");
      if (error instanceof Error) {
        console.error(`   ${error.message}`);
      } else {
        console.error(`   Unknown error: ${error}`);
      }
      process.exit(1);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Usage: ts-node test-upload.ts <filePath> [options]");
    console.log("");
    console.log("Environment variables required:");
    console.log("  ZIPLINE_TOKEN     - Your Zipline API token");
    console.log("  ZIPLINE_BASEURL   - Your Zipline instance URL");
    console.log("");
    console.log("Examples:");
    console.log('  ts-node test-upload.ts "./test.png"');
    console.log('  ts-node test-upload.ts "./test.png" --max-days=7');
    console.log('  ts-node test-upload.ts "./test.png" --folder="uploads"');
    console.log("");
    console.log("Available options:");
    console.log("  --max-days=<days>          File retention in days");
    console.log("  --compression=<0-9>        Compression level");
    console.log("  --password=<password>      Password protect file");
    console.log("  --folder=<folder>          Upload to specific folder");
    console.log("  --embed=<true|false>       Enable embed");
    console.log("  --format=<format>          File format");
    console.log("  --quality=<1-100>          Image quality");
    process.exit(1);
  }

  // Find the first argument that starts with --
  let filePathEndIndex = args.length;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      filePathEndIndex = i;
      break;
    }
  }

  // Join all arguments up to the first option as the file path
  // This handles cases where the file path has spaces and gets split by the shell
  const filePath = args.slice(0, filePathEndIndex).join(" ");

  // Parse additional options starting from the first -- argument
  const uploadOptions: any = {};

  for (let i = filePathEndIndex; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const [key, value] = arg.substring(2).split("=");

      switch (key) {
        case "max-days":
          uploadOptions.maxDays = parseInt(value);
          break;
        case "compression":
          uploadOptions.compressionLevel = parseInt(value);
          break;
        case "password":
          uploadOptions.password = value;
          break;
        case "folder":
          uploadOptions.folder = value;
          break;
        case "embed":
          uploadOptions.embed = value === "true";
          break;
        case "format":
          uploadOptions.format = value;
          break;
        case "quality":
          uploadOptions.quality = parseInt(value);
          break;
        default:
          console.warn(`Unknown option: --${key}`);
      }
    }
  }

  const config: TestConfig = {
    filePath,
    uploadOptions: Object.keys(uploadOptions).length > 0 ? uploadOptions : undefined,
  };

  const tester = new ZiplineUploadTester(config);
  await tester.run();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}

export { ZiplineUploadTester, TestConfig };
