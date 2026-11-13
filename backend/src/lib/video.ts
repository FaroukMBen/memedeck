import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const getFfmpegBinary = (): string | null => {
  if (typeof ffmpegStatic === 'string') return ffmpegStatic;
  if (ffmpegStatic && typeof (ffmpegStatic as any).default === 'string') {
    return (ffmpegStatic as any).default;
  }
  return null;
};

export interface ProcessedMedia {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

/**
 * Server-side Video and Animated GIF compression using FFmpeg.
 * - Transcodes videos to modern, web-optimized H.264 MP4 (CRF 28, max 1280px width, faststart for instant streaming)
 * - Converts heavy animated GIFs to ultra-lightweight MP4 (typically saving 90-95% of data)
 * - Falls back safely to original if FFmpeg is unavailable, fails, or produces a larger file.
 */
export async function compressVideoOrGif(
  inputBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ProcessedMedia> {
  const isVideo = mimeType.startsWith('video/');
  const isGif = mimeType === 'image/gif' || filename.toLowerCase().endsWith('.gif');

  // If not a video or GIF, return original unchanged (images are compressed on client)
  if (!isVideo && !isGif) {
    const ext = filename.split('.').pop()?.toLowerCase() || 'bin';
    return {
      buffer: inputBuffer,
      mimeType,
      extension: ext,
      originalSize: inputBuffer.length,
      compressedSize: inputBuffer.length,
      wasCompressed: false,
    };
  }

  const ffmpegBinary = getFfmpegBinary();

  // If ffmpeg binary is missing for any reason, safely pass through
  if (!ffmpegBinary) {
    const ext = filename.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'gif');
    return {
      buffer: inputBuffer,
      mimeType,
      extension: ext,
      originalSize: inputBuffer.length,
      compressedSize: inputBuffer.length,
      wasCompressed: false,
    };
  }

  const tmpDir = os.tmpdir();
  const inputExt = filename.split('.').pop()?.toLowerCase() || (isGif ? 'gif' : 'mp4');
  const inputPath = path.join(tmpDir, `memedeck-in-${randomUUID()}.${inputExt}`);
  const outputPath = path.join(tmpDir, `memedeck-out-${randomUUID()}.mp4`);

  try {
    await fs.writeFile(inputPath, inputBuffer);

    const args: string[] = isGif
      ? [
          '-y',
          '-i',
          inputPath,
          '-c:v',
          'libx264',
          '-crf',
          '22',
          '-preset',
          'medium',
          '-pix_fmt',
          'yuv420p',
          '-vf',
          "scale='min(1280,iw)':-2:flags=lanczos,pad=ceil(iw/2)*2:ceil(ih/2)*2",
          '-movflags',
          '+faststart',
          outputPath,
        ]
      : [
          '-y',
          '-i',
          inputPath,
          '-c:v',
          'libx264',
          '-crf',
          '21',
          '-preset',
          'medium',
          '-profile:v',
          'high',
          '-level',
          '4.1',
          '-vf',
          "scale='min(1280,iw)':-2:flags=lanczos",
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outputPath,
        ];

    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegBinary,
        args,
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
        (error: Error | null) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });

    const outputBuffer = await fs.readFile(outputPath);

    const savingsPercent = Math.round(
      ((inputBuffer.length - outputBuffer.length) / inputBuffer.length) * 100
    );

    // Use compressed version if it is smaller and provides meaningful reduction (>= 10%) or if it's a GIF
    if (outputBuffer.length < inputBuffer.length && (isGif || savingsPercent >= 10)) {
      return {
        buffer: outputBuffer,
        mimeType: 'video/mp4',
        extension: 'mp4',
        originalSize: inputBuffer.length,
        compressedSize: outputBuffer.length,
        wasCompressed: true,
      };
    }

    // Otherwise, retain original
    return {
      buffer: inputBuffer,
      mimeType,
      extension: inputExt,
      originalSize: inputBuffer.length,
      compressedSize: inputBuffer.length,
      wasCompressed: false,
    };
  } catch (err) {
    // Graceful fallback to original file if compression fails
    return {
      buffer: inputBuffer,
      mimeType,
      extension: inputExt,
      originalSize: inputBuffer.length,
      compressedSize: inputBuffer.length,
      wasCompressed: false,
    };
  } finally {
    // Clean up temporary local files
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
