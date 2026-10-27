import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export interface StorageUrls {
  masterM3u8Url: string;
  posterUrl: string;
  cdnMasterM3u8Url?: string;
  cdnPosterUrl?: string;
}

export class StorageService {
  private supabase: SupabaseClient;
  private bucket: string;
  private cdnBaseUrl?: string;

  constructor(supabaseUrl: string, supabaseServiceRoleKey: string, bucket: string, cdnBaseUrl?: string) {
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
    this.bucket = bucket;
    this.cdnBaseUrl = cdnBaseUrl;
  }

  /**
   * Downloads raw source video to a local path.
   * Supports either full HTTP/HTTPS URL or bucket-relative storage path.
   */
  async downloadRawVideo(sourceUrlOrPath: string, destinationPath: string): Promise<void> {
    if (sourceUrlOrPath.startsWith('http://') || sourceUrlOrPath.startsWith('https://')) {
      const response = await fetch(sourceUrlOrPath);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to download raw video from ${sourceUrlOrPath}: HTTP ${response.status}`);
      }
      const fileStream = createWriteStream(destinationPath);
      // @ts-expect-error - web stream to node stream in pipeline
      await pipeline(response.body, fileStream);
      return;
    }

    // Supabase storage path
    const { data, error } = await this.supabase.storage.from(this.bucket).download(sourceUrlOrPath);
    if (error || !data) {
      throw new Error(`Failed to download from Supabase storage (${sourceUrlOrPath}): ${error?.message}`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.writeFile(destinationPath, buffer);
  }

  /**
   * Uploads all transcoded artifacts (master playlist, variant playlists, segments, poster)
   * to Supabase Storage under `transcoded/<videoId>/`
   */
  async uploadTranscodedAssets(videoId: string, outputDir: string): Promise<StorageUrls> {
    const files = await this.collectFilesRecursively(outputDir);

    for (const file of files) {
      const relativePath = path.relative(outputDir, file).replace(/\\/g, '/');
      const storageKey = `transcoded/${videoId}/${relativePath}`;
      const contentType = this.getContentType(file);
      const fileBuffer = await fs.readFile(file);

      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(storageKey, fileBuffer, {
          contentType,
          upsert: true,
          cacheControl: '31536000', // 1 year immutable cache for HLS segments
        });

      if (error) {
        throw new Error(`Failed to upload ${storageKey} to storage: ${error.message}`);
      }
    }

    // Get public URL for master playlist and poster
    const masterKey = `transcoded/${videoId}/master.m3u8`;
    const posterKey = `transcoded/${videoId}/poster.webp`;

    const { data: masterData } = this.supabase.storage.from(this.bucket).getPublicUrl(masterKey);
    const { data: posterData } = this.supabase.storage.from(this.bucket).getPublicUrl(posterKey);

    const masterM3u8Url = masterData.publicUrl;
    const posterUrl = posterData.publicUrl;

    const urls: StorageUrls = {
      masterM3u8Url,
      posterUrl,
    };

    if (this.cdnBaseUrl) {
      urls.cdnMasterM3u8Url = `${this.cdnBaseUrl}/${masterKey}`;
      urls.cdnPosterUrl = `${this.cdnBaseUrl}/${posterKey}`;
    }

    return urls;
  }

  private async collectFilesRecursively(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.collectFilesRecursively(fullPath);
        results.push(...subFiles);
      } else {
        results.push(fullPath);
      }
    }

    return results;
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.m3u8':
        return 'application/vnd.apple.mpegurl';
      case '.ts':
        return 'video/mp2t';
      case '.webp':
        return 'image/webp';
      case '.mp4':
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
  }
}
