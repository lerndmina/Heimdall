import { tryCatch } from "../utils/trycatch";

enum Validation {
  VALID,
  INVALID_TOKEN,
  INVALID_URL,
  UNCHECKED,
}

export default class ZiplineService {
  token: string;
  baseUrl: string;
  maxUploadSizeMB: number = 95; // Default max upload size in MB, can be overridden
  isValidTokenUrlCombo: Validation = Validation.UNCHECKED;
  private initializationPromise: Promise<Validation> | null = null;

  constructor(token: string, baseUrl: string) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  /**
   * Initialize the service by validating the token and URL.
   * This must be called before using any other methods.
   */
  async initialize(): Promise<Validation> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.validateToken();
    return this.initializationPromise;
  }

  /**
   * Static factory method to create and initialize a ZiplineService instance
   */
  static async create(token: string, baseUrl: string): Promise<ZiplineService> {
    const service = new ZiplineService(token, baseUrl);
    await service.initialize();
    return service;
  }

  /**
   * Check if the service is ready to use (has been validated)
   */
  isReady(): boolean {
    return this.isValidTokenUrlCombo === Validation.VALID;
  }

  /**
   * Ensure the service is ready before allowing API calls
   */
  private async ensureReady(): Promise<void> {
    if (this.isValidTokenUrlCombo === Validation.UNCHECKED) {
      await this.initialize();
    }

    if (this.isValidTokenUrlCombo !== Validation.VALID) {
      throw new Error(
        `ZiplineService is not ready. Validation status: ${Validation[this.isValidTokenUrlCombo]}`
      );
    }
  }

  async validateToken(): Promise<Validation> {
    if (this.isValidTokenUrlCombo !== Validation.UNCHECKED) {
      return this.isValidTokenUrlCombo;
    }

    if (!this.baseUrl) {
      this.isValidTokenUrlCombo = Validation.INVALID_URL;
      throw new Error("Base URL is required for ZiplineService");
    }

    if (!this.token) {
      this.isValidTokenUrlCombo = Validation.INVALID_TOKEN;
      return Validation.INVALID_TOKEN;
    }

    // Validate URL format
    let url: URL;
    try {
      url = new URL(this.baseUrl);
      if (!url.protocol || !url.host) {
        this.isValidTokenUrlCombo = Validation.INVALID_URL;
        return Validation.INVALID_URL;
      }
    } catch (error) {
      this.isValidTokenUrlCombo = Validation.INVALID_URL;
      return Validation.INVALID_URL;
    }

    try {
      // First, check if the URL/API is reachable by hitting the healthcheck endpoint
      const healthCheckUrl = new URL("/api/healthcheck", this.baseUrl).toString();
      const healthResponse = await fetch(healthCheckUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!healthResponse.ok) {
        this.isValidTokenUrlCombo = Validation.INVALID_URL;
        return Validation.INVALID_URL;
      }
    } catch (error) {
      // If error then we return invalid url
      this.isValidTokenUrlCombo = Validation.INVALID_URL;
      return Validation.INVALID_URL;
    }

    try {
      // Next fetch /api/user with token as Authorization header if we get 200 then we set isValidTokenUrlCombo to VALID
      const userUrl = new URL("/api/user", this.baseUrl).toString();
      const userResponse = await fetch(userUrl, {
        method: "GET",
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
      });

      if (userResponse.ok) {
        this.isValidTokenUrlCombo = Validation.VALID;
        return Validation.VALID;
      } else {
        this.isValidTokenUrlCombo = Validation.INVALID_TOKEN;
        return Validation.INVALID_TOKEN;
      }
    } catch (error) {
      this.isValidTokenUrlCombo = Validation.INVALID_TOKEN;
      return Validation.INVALID_TOKEN;
    }
  }

  /**
   * Upload a file to Zipline
   * @param file - The file to upload (File object or Buffer)
   * @param filename - Optional filename to use for Buffer uploads
   * @param options - Optional upload options
   * @returns Promise containing upload response
   */
  async uploadFile(
    file: File | Buffer,
    filename?: string,
    options?: {
      maxDays?: number;
      compressionLevel?: number;
      password?: string;
      folder?: string;
      embed?: boolean;
      format?: string;
      quality?: number;
    }
  ): Promise<{
    files: Array<{
      id: string;
      type: string;
      url: string;
      pending?: boolean;
    }>;
    deletesAt?: string;
    assumedMimetypes?: boolean[];
    partialSuccess?: boolean;
    partialIdentifier?: string;
  }> {
    await this.ensureReady();

    // Check file size before upload
    let fileSizeBytes: number;
    if (file instanceof Buffer) {
      fileSizeBytes = file.length;
    } else if (file instanceof File) {
      fileSizeBytes = file.size;
    } else {
      throw new Error("File must be a File object or Buffer");
    }

    const maxSizeBytes = this.maxUploadSizeMB * 1024 * 1024;

    if (fileSizeBytes > maxSizeBytes) {
      throw new Error(
        `File size (${(fileSizeBytes / 1024 / 1024).toFixed(
          2
        )} MB) exceeds maximum upload size of ${this.maxUploadSizeMB} MB`
      );
    }

    const uploadUrl = new URL("/api/upload", this.baseUrl).toString();
    const formData = new FormData();

    // Handle different file types
    if (file instanceof Buffer) {
      if (!filename) {
        throw new Error("Filename is required when uploading a Buffer");
      }
      // Convert Buffer to Blob for FormData compatibility
      const blob = new Blob([new Uint8Array(file)]);
      formData.append("file", blob, filename);
    } else if (file instanceof File) {
      formData.append("file", file);
    } else {
      throw new Error("File must be a File object or Buffer");
    }

    // Prepare headers
    const headers: Record<string, string> = {
      Authorization: this.token,
    };

    // Add optional headers based on options
    if (options?.maxDays) {
      headers["X-Zipline-Max-Days"] = options.maxDays.toString();
    }
    if (options?.compressionLevel !== undefined) {
      headers["X-Zipline-Compression"] = options.compressionLevel.toString();
    }
    if (options?.password) {
      headers["X-Zipline-Password"] = options.password;
    }
    if (options?.folder) {
      headers["X-Zipline-Folder"] = options.folder;
    }
    if (options?.embed !== undefined) {
      headers["X-Zipline-Embed"] = options.embed.toString();
    }
    if (options?.format) {
      headers["X-Zipline-Format"] = options.format;
    }
    if (options?.quality !== undefined) {
      headers["X-Zipline-Quality"] = options.quality.toString();
    }

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to upload file: ${error.message}`);
      }
      throw new Error("Failed to upload file: Unknown error");
    }
  }

  /**
   * Upload multiple files to Zipline
   * @param files - Array of files to upload, each with file data and optional filename
   * @param options - Optional upload options
   * @returns Promise containing upload response
   */
  async uploadFiles(
    files: Array<{ file: File | Buffer; filename?: string }>,
    options?: {
      maxDays?: number;
      compressionLevel?: number;
      password?: string;
      folder?: string;
      embed?: boolean;
      format?: string;
      quality?: number;
    }
  ): Promise<{
    files: Array<{
      id: string;
      type: string;
      url: string;
      pending?: boolean;
    }>;
    deletesAt?: string;
    assumedMimetypes?: boolean[];
    partialSuccess?: boolean;
    partialIdentifier?: string;
  }> {
    await this.ensureReady();

    if (!files || files.length === 0) {
      throw new Error("At least one file must be provided");
    }

    // Check file sizes before upload
    const maxSizeBytes = this.maxUploadSizeMB * 1024 * 1024;
    let totalSizeBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const { file } = files[i];
      let fileSizeBytes: number;

      if (file instanceof Buffer) {
        fileSizeBytes = file.length;
      } else if (file instanceof File) {
        fileSizeBytes = file.size;
      } else {
        throw new Error(`File at index ${i} must be a File object or Buffer`);
      }

      if (fileSizeBytes > maxSizeBytes) {
        throw new Error(
          `File at index ${i} size (${(fileSizeBytes / 1024 / 1024).toFixed(
            2
          )} MB) exceeds maximum upload size of ${this.maxUploadSizeMB} MB`
        );
      }

      totalSizeBytes += fileSizeBytes;
    }

    // Also check total size of all files
    if (totalSizeBytes > maxSizeBytes) {
      throw new Error(
        `Total files size (${(totalSizeBytes / 1024 / 1024).toFixed(
          2
        )} MB) exceeds maximum upload size of ${this.maxUploadSizeMB} MB`
      );
    }

    const uploadUrl = new URL("/api/upload", this.baseUrl).toString();
    const formData = new FormData();

    // Add all files to form data
    for (const fileEntry of files) {
      const { file, filename } = fileEntry;

      if (file instanceof Buffer) {
        if (!filename) {
          throw new Error("Filename is required when uploading a Buffer");
        }
        // Convert Buffer to Blob for FormData compatibility
        const blob = new Blob([new Uint8Array(file)]);
        formData.append("file", blob, filename);
      } else if (file instanceof File) {
        formData.append("file", file);
      } else {
        throw new Error("Each file must be a File object or Buffer");
      }
    }

    // Prepare headers
    const headers: Record<string, string> = {
      Authorization: this.token,
    };

    // Add optional headers based on options
    if (options?.maxDays) {
      headers["X-Zipline-Max-Days"] = options.maxDays.toString();
    }
    if (options?.compressionLevel !== undefined) {
      headers["X-Zipline-Compression"] = options.compressionLevel.toString();
    }
    if (options?.password) {
      headers["X-Zipline-Password"] = options.password;
    }
    if (options?.folder) {
      headers["X-Zipline-Folder"] = options.folder;
    }
    if (options?.embed !== undefined) {
      headers["X-Zipline-Embed"] = options.embed.toString();
    }
    if (options?.format) {
      headers["X-Zipline-Format"] = options.format;
    }
    if (options?.quality !== undefined) {
      headers["X-Zipline-Quality"] = options.quality.toString();
    }

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to upload files: ${error.message}`);
      }
      throw new Error("Failed to upload files: Unknown error");
    }
  }

  /**
   * Set the maximum upload size in MB
   * @param sizeMB - Maximum upload size in megabytes
   */
  setMaxUploadSize(sizeMB: number): void {
    if (sizeMB <= 0) {
      throw new Error("Maximum upload size must be greater than 0");
    }
    this.maxUploadSizeMB = sizeMB;
  }

  /**
   * Get the current maximum upload size in MB
   * @returns Maximum upload size in megabytes
   */
  getMaxUploadSize(): number {
    return this.maxUploadSizeMB;
  }
}
