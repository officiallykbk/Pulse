#!/usr/bin/env bash
# ==============================================================================
# Pulse Platform — Oracle Cloud Always-Free ARM VM Provisioning Script
# OS: Ubuntu 22.04 LTS (AArch64 / ARM64 Ampere A1)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting Pulse Transcoder Worker Setup for Oracle Cloud  "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: This script must be run as root. Please run with sudo." >&2
  exit 1
fi

# 1. Update system packages
echo "[1/6] Updating system packages..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# 2. Install FFmpeg, WebP, Git, and build tools
echo "[2/6] Installing FFmpeg and multimedia dependencies..."
apt-get install -y ffmpeg libwebp-dev git curl build-essential ca-certificates

# Verify FFmpeg installation
ffmpeg -version | head -n 1

# 3. Install Node.js 20 LTS (ARM64 compatible)
echo "[3/6] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "npm version:     $(npm -v)"

# 4. Create dedicated service user & directories
echo "[4/6] Setting up service user and directories..."
id -u pulse &>/dev/null || useradd -r -s /bin/false pulse
mkdir -p /opt/pulse-worker
mkdir -p /tmp/pulse_worker

# 5. Build worker application
echo "[5/6] Building worker application..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "${SCRIPT_DIR}"/* /opt/pulse-worker/
cd /opt/pulse-worker

npm install --production=false
npm run build
npm prune --production

chown -R pulse:pulse /opt/pulse-worker
chown -R pulse:pulse /tmp/pulse_worker

# 6. Install systemd service
echo "[6/6] Installing systemd service..."
cp /opt/pulse-worker/pulse-transcoder.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable pulse-transcoder

echo "=========================================================="
echo " Setup complete! Next steps:"
echo " 1. Configure environment variables in: /opt/pulse-worker/.env"
echo "    (cp /opt/pulse-worker/.env.example /opt/pulse-worker/.env)"
echo " 2. Start service: sudo systemctl start pulse-transcoder"
echo " 3. View live logs: sudo journalctl -u pulse-transcoder -f"
echo "=========================================================="
