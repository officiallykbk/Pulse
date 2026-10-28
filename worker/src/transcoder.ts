import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { determineDimensions, getAbrLadder, buildMasterPlaylist, type LadderVariant, type VideoDimensions } from './ladder.js';

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  dimensions: VideoDimensions;
}

export interface TranscodeResult {
  outputDir: string;
  masterPlaylistPath: string;
  posterPath: string;
  duration: number;
  dimensions: VideoDimensions;
  variants: LadderVariant[];
}

export class Transcoder {
  constructor(
    private ffmpegPath: string = 'ffmpeg',
    private ffprobePath: string = 'ffprobe'
  ) {}

  /**
   * Probe input video with ffprobe to determine duration, width, height.
   */
  async probe(inputPath: string): Promise<ProbeResult> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=width,height,codec_type',
        '-of', 'json',
        inputPath,
      ];

      const proc = spawn(this.ffprobePath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`ffprobe failed with exit code ${code}: ${stderr}`));
        }

        try {
          const data = JSON.parse(stdout);
          const format = data.format || {};
          const duration = Math.max(1, Math.round(parseFloat(format.duration || '0')));
          const videoStream = (data.streams || []).find((s: { codec_type: string }) => s.codec_type === 'video');

          if (!videoStream || !videoStream.width || !videoStream.height) {
            return reject(new Error('Input file does not contain a valid video stream'));
          }

          const width = parseInt(videoStream.width, 10);
          const height = parseInt(videoStream.height, 10);
          const dimensions = determineDimensions(width, height);

          resolve({ duration, width, height, dimensions });
        } catch (err) {
          reject(new Error(`Failed to parse ffprobe output: ${(err as Error).message}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Extract a high-quality WebP thumbnail poster at 1 second (or 0.5s if video is short)
   */
  async extractPoster(inputPath: string, outputPath: string, duration: number): Promise<string> {
    const seekTime = duration > 2 ? '00:00:01' : '00:00:00.5';

    const args = [
      '-y',
      '-ss', seekTime,
      '-i', inputPath,
      '-vframes', '1',
      '-vf', 'scale=720:-1:flags=lanczos',
      '-c:v', 'libwebp',
      '-quality', '85',
      outputPath,
    ];

    await this.runProcess(this.ffmpegPath, args, 'Poster extraction');
    return outputPath;
  }

  /**
   * Transcode a single ABR variant into 2-second HLS segments
   */
  async transcodeVariant(
    inputPath: string,
    variantDir: string,
    variant: LadderVariant
  ): Promise<void> {
    await fs.mkdir(variantDir, { recursive: true });
    const playlistPath = path.join(variantDir, 'index.m3u8');
    const segmentPattern = path.join(variantDir, 'seg_%03d.ts');

    const scaleFilter = `scale=${variant.width}:${variant.height}:force_original_aspect_ratio=decrease,pad=${variant.width}:${variant.height}:(ow-iw)/2:(oh-ih)/2`;

    const args = [
      '-y',
      '-i', inputPath,
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-profile:v', variant.h264Profile,
      '-preset', 'fast',
      '-b:v', variant.videoBitrate,
      '-maxrate', variant.maxRate,
      '-bufsize', variant.bufSize,
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', variant.audioBitrate,
      '-ar', '44100',
      '-hls_time', '2',
      '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', segmentPattern,
      playlistPath,
    ];

    await this.runProcess(this.ffmpegPath, args, `Transcode ${variant.name}`);
  }

  /**
   * Complete multi-bitrate pipeline:
   * 1. Probe source dimensions and duration
   * 2. Extract WebP poster
   * 3. Transcode 240p, 360p, 480p, 720p HLS variants with 2s segments
   * 4. Generate master.m3u8
   */
  async processVideo(inputPath: string, outputDir: string): Promise<TranscodeResult> {
    await fs.mkdir(outputDir, { recursive: true });

    // 1. Probe input
    const probe = await this.probe(inputPath);
    const variants = getAbrLadder(probe.dimensions.isPortrait);

    // 2. Extract poster
    const posterPath = path.join(outputDir, 'poster.webp');
    await this.extractPoster(inputPath, posterPath, probe.duration);

    // 3. Transcode variants in parallel for maximum ARM multi-core throughput
    await Promise.all(
      variants.map((variant) => {
        const variantDir = path.join(outputDir, variant.name);
        return this.transcodeVariant(inputPath, variantDir, variant);
      })
    );

    // 4. Generate master.m3u8
    const masterPlaylistContent = buildMasterPlaylist(variants);
    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    await fs.writeFile(masterPlaylistPath, masterPlaylistContent, 'utf-8');

    return {
      outputDir,
      masterPlaylistPath,
      posterPath,
      duration: probe.duration,
      dimensions: probe.dimensions,
      variants,
    };
  }

  private runProcess(cmd: string, args: string[], stepName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stderr = '';

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Keep last 8 lines of stderr for clean diagnostics
          const lastLines = stderr.trim().split('\n').slice(-8).join('\n');
          reject(new Error(`${stepName} failed with exit code ${code}:\n${lastLines}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`${stepName} process error: ${err.message}`));
      });
    });
  }
}
