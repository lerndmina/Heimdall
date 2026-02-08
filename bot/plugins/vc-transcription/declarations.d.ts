/**
 * Module declarations for VC Transcription plugin dependencies
 * that don't have built-in type definitions.
 */

declare module "fluent-ffmpeg" {
  interface FfmpegCommand {
    toFormat(format: string): FfmpegCommand;
    on(event: "error", callback: (err: Error) => void): FfmpegCommand;
    on(event: "end", callback: () => void): FfmpegCommand;
    save(outputPath: string): FfmpegCommand;
  }

  interface FfmpegStatic {
    (input: string): FfmpegCommand;
    getAvailableFormats(callback: (err: Error | null, formats?: Record<string, unknown>) => void): void;
  }

  const ffmpeg: FfmpegStatic;
  export default ffmpeg;
}

declare module "nodejs-whisper" {
  interface WhisperOptions {
    outputInText?: boolean;
    outputInVtt?: boolean;
    outputInSrt?: boolean;
    outputInCsv?: boolean;
    translateToEnglish?: boolean;
    language?: string;
    wordTimestamps?: boolean;
    timestamps_length?: number;
    splitOnWord?: boolean;
    gen_file_txt?: boolean;
    gen_file_subtitle?: boolean;
    gen_file_vtt?: boolean;
    no_timestamps?: boolean;
  }

  interface NodeWhisperOptions {
    modelName: string;
    autoDownloadModelName?: string;
    whisperOptions?: WhisperOptions;
    withCuda?: boolean;
    numberOfProcessors?: number;
    numberOfThreads?: number;
  }

  export function nodewhisper(filePath: string, options: NodeWhisperOptions): Promise<string>;
}
