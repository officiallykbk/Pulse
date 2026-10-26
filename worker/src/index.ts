import { loadConfig } from './config.js';
import { JobQueue } from './queue.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';

async function verifyTools(ffmpegPath: string, ffprobePath: string): Promise<void> {
  try {
    execSync(`${ffmpegPath} -version`, { stdio: 'ignore' });
    execSync(`${ffprobePath} -version`, { stdio: 'ignore' });
  } catch {
    throw new Error(
      `FFmpeg/FFprobe binaries not found or not executable. Checked paths: "${ffmpegPath}", "${ffprobePath}". Run setup-oracle-vm.sh to install dependencies.`
    );
  }
}

async function main() {
  console.log('====================================================');
  console.log('   PULSE TRANSCODER WORKER (Oracle Cloud Always-Free) ');
  console.log('====================================================');

  const config = loadConfig();
  console.log(`Worker ID:        ${config.workerId}`);
  console.log(`Supabase URL:     ${config.supabaseUrl}`);
  console.log(`Storage Bucket:   ${config.storageBucket}`);
  console.log(`CDN Base URL:     ${config.cdnBaseUrl || '(none - using direct storage)'}`);
  console.log(`Poll Interval:    ${config.pollIntervalMs} ms`);
  console.log(`Temp Directory:   ${config.tempDir}`);

  // Ensure temp directory exists
  await fs.mkdir(config.tempDir, { recursive: true });

  // Verify FFmpeg installed
  try {
    await verifyTools(config.ffmpegPath, config.ffprobePath);
    console.log('FFmpeg and FFprobe verified successfully.');
  } catch (err) {
    console.warn(`[WARNING] ${(err as Error).message}`);
  }

  const queue = new JobQueue(config);
  let isRunning = true;

  const intervalId = setInterval(async () => {
    if (!isRunning) return;
    await queue.tick();
  }, config.pollIntervalMs);

  // Trigger immediate tick on startup
  queue.tick().catch(() => {});

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
    isRunning = false;
    clearInterval(intervalId);
    console.log('Worker stopped cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
