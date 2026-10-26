#!/usr/bin/env bash
# ==============================================================================
# Pulse Platform: Multi-Tier H.264 ABR Transcoder Script
# ==============================================================================
# Creates an Adaptive Bitrate (ABR) HLS package optimized for low-end mobile
# devices (Galaxy A12 / Android Go) and 2G/3G networks:
#   - 240p (250 kbps video + 64k audio)
#   - 360p (450 kbps video + 96k audio)
#   - 480p (800 kbps video + 128k audio)
#   - 720p (1200 kbps video + 128k audio)
#   - 2-second HLS segments for instantaneous startup and low latency
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <input_video.mp4> <output_directory>"
  exit 1
fi

INPUT="$1"
OUT_DIR="$2"

mkdir -p "$OUT_DIR"

echo "=== [1/2] Extracting high-res poster thumbnail ==="
ffmpeg -y -ss 00:00:01 -i "$INPUT" -vframes 1 -vf "scale=720:-1" -q:v 2 "$OUT_DIR/poster.webp" || \
ffmpeg -y -ss 00:00:01 -i "$INPUT" -vframes 1 -vf "scale=720:-1" -q:v 2 "$OUT_DIR/poster.jpg"

echo "=== [2/2] Transcoding multi-bitrate H.264 ABR ladder ==="
ffmpeg -y -i "$INPUT" \
  -filter_complex \
  "[0:v]split=4[v1][v2][v3][v4]; \
   [v1]scale=w=426:h=240:force_original_aspect_ratio=decrease,pad=426:240:(ow-iw)/2:(oh-ih)/2[v1out]; \
   [v2]scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2[v2out]; \
   [v3]scale=w=854:h=480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2[v3out]; \
   [v4]scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v4out]" \
  -map "[v1out]" -c:v:0 libx264 -preset fast -profile:v:0 baseline -b:v:0 250k -maxrate:v:0 300k -bufsize:v:0 500k \
  -map "[v2out]" -c:v:1 libx264 -preset fast -profile:v:1 main -b:v:1 450k -maxrate:v:1 550k -bufsize:v:1 900k \
  -map "[v3out]" -c:v:2 libx264 -preset fast -profile:v:2 main -b:v:2 800k -maxrate:v:2 950k -bufsize:v:2 1600k \
  -map "[v4out]" -c:v:3 libx264 -preset fast -profile:v:3 high -b:v:3 1200k -maxrate:v:3 1400k -bufsize:v:3 2400k \
  -map 0:a? -c:a:0 aac -b:a:0 64k \
  -map 0:a? -c:a:1 aac -b:a:1 96k \
  -map 0:a? -c:a:2 aac -b:a:2 128k \
  -map 0:a? -c:a:3 aac -b:a:3 128k \
  -f hls \
  -hls_time 2 \
  -hls_playlist_type vod \
  -hls_flags independent_segments \
  -master_pl_name master.m3u8 \
  -hls_segment_filename "$OUT_DIR/stream_%v_seq%03d.ts" \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3" \
  "$OUT_DIR/stream_%v.m3u8"

echo "=== Transcoding Complete ==="
echo "Master Playlist: $OUT_DIR/master.m3u8"
echo "Poster Thumbnail: $OUT_DIR/poster.webp"
