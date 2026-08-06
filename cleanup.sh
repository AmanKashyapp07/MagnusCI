#!/usr/bin/env bash

###############################################################################
# Production Disk Cleanup & System Reclamation Script
# Target: Oracle Cloud VM (129.154.39.198) - MagnusCI & NexusIDE
###############################################################################

set -e

# Formatting
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

log_info() { echo -e "${CYAN}${BOLD}[CLEANUP]${RESET} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"; }
log_warn() { echo -e "${YELLOW}${BOLD}[WARNING]${RESET} $1"; }

echo -e "${CYAN}${BOLD}"
echo "========================================================================"
echo " Server Disk Space Optimization & Maintenance Engine"
echo " Target VM: 129.154.39.198"
echo "========================================================================"
echo -e "${RESET}"

SSH_KEY="/Users/amankashyap/Documents/NexusIDE/ssh-key-2022-12-01.key"
REMOTE_USER="ubuntu"
REMOTE_IP="129.154.39.198"

if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}[ERROR] SSH key missing at $SSH_KEY${RESET}"
    exit 1
fi

log_info "Connecting to remote VM (${REMOTE_USER}@${REMOTE_IP})..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "bash -s" << 'EOF'
set -e

BEFORE_SPACE=$(df / -h | awk 'NR==2 {print $3}')
echo "[REMOTE] Disk Space Used Before Cleanup: ${BEFORE_SPACE}"
echo "------------------------------------------------------------------------"

echo "[REMOTE] 1. Pruning Dangling Docker Containers, Images & Volumes..."
sudo docker system prune -f || true
sudo docker image prune -a -f --filter "until=168h" || true

echo "[REMOTE] 2. Vacuuming Systemd Journal Logs (Limit to 3 days / 100MB)..."
sudo journalctl --vacuum-time=3d || true
sudo journalctl --vacuum-size=100M || true

echo "[REMOTE] 3. Cleaning APT Package Caches..."
sudo apt-get clean -y || true
sudo apt-get autoremove -y || true

echo "[REMOTE] 4. Cleaning Temporary Build Workspaces & Archive Files..."
sudo rm -rf /tmp/magnus-builds/* /tmp/sandbox-ide/* /tmp/*.tar.gz /tmp/dist.tar.gz || true

echo "[REMOTE] 5. Truncating PM2 and Node Application Log Files..."
if command -v pm2 &> /dev/null; then
    pm2 flush || true
fi
sudo find /home/ubuntu/.pm2/logs/ -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true
sudo find /var/log/nginx/ -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true

echo "[REMOTE] 6. Cleaning Global NPM Caches..."
npm cache clean --force 2>/dev/null || true
sudo npm cache clean --force 2>/dev/null || true

echo "[REMOTE] 7. Preserving System Permissions & Reloading Nginx..."
sudo chmod 755 /home/ubuntu
sudo systemctl reload nginx || true

echo "------------------------------------------------------------------------"
AFTER_SPACE=$(df / -h | awk 'NR==2 {print $3}')
FREE_SPACE=$(df / -h | awk 'NR==2 {print $4}')
AVAIL_PCT=$(df / -h | awk 'NR==2 {print $5}')

echo "[REMOTE] Disk Space Used After Cleanup:  ${AFTER_SPACE}"
echo "[REMOTE] Available Free Disk Space:      ${FREE_SPACE} (${AVAIL_PCT} used)"
EOF

log_success "Cleanup execution finished successfully!"
