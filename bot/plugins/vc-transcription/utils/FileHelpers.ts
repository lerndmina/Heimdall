/**
 * File helper utilities for voice message transcription.
 *
 * Handles downloading Discord attachments, converting audio formats
 * via ffmpeg, and cleaning up temporary files.
 */

import https from "https";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("vc-transcription");

/** Temporary directory for audio processing */
const TEMP_DIR = path.join(process.cwd(), ".tmp-transcription");

function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Get the full path for a temporary file.
 */
export function getTempPath(name: string, ext: string): string {
  ensureTempDir();
  return path.join(TEMP_DIR, `${name}.${ext}`);
}

/**
 * Download a file from a URL to a temporary location.
 */
export async function downloadFile(url: URL, name: string, ext: string): Promise<string> {
  ensureTempDir();
  const filePath = getTempPath(name, ext);

  return new Promise<string>((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          log.debug(`Downloaded file to ${filePath}`);
          resolve(filePath);
        });
      })
      .on("error", (err) => {
        // Clean up partial file
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        log.error("Download failed:", err);
        reject(err);
      });
  });
}

/**
 * Convert an audio file from one format to another using ffmpeg.
 * Returns the path to the converted file.
 */
export async function convertFile(
  name: string,
  fromExt: string,
  toExt: string,
): Promise<string> {
  const inputPath = getTempPath(name, fromExt);
  const outputPath = getTempPath(name, toExt);

  return new Promise<string>((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat(toExt === "wav" ? "wav" : "mp3")
      .on("error", (err) => {
        log.error("FFmpeg conversion error:", err);
        reject(err);
      })
      .on("end", () => {
        log.debug(`Converted ${inputPath} → ${outputPath}`);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

/**
 * Delete a temporary file.
 */
export function deleteFile(name: string, ext: string): void {
  const filePath = getTempPath(name, ext);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    log.debug(`Deleted temp file ${filePath}`);
  }
}

/**
 * Delete a file by its full path.
 */
export function deleteFilePath(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    log.debug(`Deleted file ${filePath}`);
  }
}

/**
 * Check if ffmpeg is available.
 */
export async function checkFfmpeg(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    ffmpeg.getAvailableFormats((err) => {
      if (err) {
        log.error("FFmpeg not available:", err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
