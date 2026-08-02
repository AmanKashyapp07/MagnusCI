#!/usr/bin/env bash

###############################################################################
# MagnusCI Automated Production Deployment Script
#
# Target Server: Azure VM (azureuser@4.145.89.253)
# Live Domain:   http://magnus-ci.online
#
# Workflow:
# 1. Run local test suite (unit + integration)
# 2. Push code to GitHub (origin main)
# 3. Connect to Azure VM via SSH
# 4. Prune Docker build cache & flush PM2 logs
# 5. Sync latest commits from GitHub
# 6. Build frontend Vite static bundle & install backend dependencies
# 7. Restart PM2 processes (magnus-api & magnus-worker)
# 8. Run live E2E deployment tests against http://magnus-ci.online
###############################################################################

set -e # Exit immediately if any command fails

# Color definitions
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SERVER_USER="azureuser"
SERVER_IP="4.145.89.253"
KEY_FILE="magnus-ci-server_key.pem"
REMOTE_PATH="/home/azureuser/ci-cd-engine"
LIVE_DOMAIN="http://magnus-ci.online"

log_info() {
    echo -e "${CYAN}[INFO] ${1}${NC}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS] ${1}${NC}"
}

log_warn() {
    echo -e "${YELLOW}[WARN] ${1}${NC}"
}

log_error() {
    echo -e "${RED}[ERROR] ${1}${NC}"
}

log_info "Starting MagnusCI Production Deployment Workflow..."

# Step 1: Check SSH Private Key
if [ ! -f "$KEY_FILE" ]; then
    log_error "SSH Key file '$KEY_FILE' not found in root directory!"
    exit 1
fi
chmod 600 "$KEY_FILE"
log_success "SSH key file permission set to 600."

# Step 2: Run Local Test Suite (unless --skip-tests flag passed)
if [[ "$*" == *"--skip-tests"* ]]; then
    log_warn "Skipping pre-deployment local test suite (--skip-tests flag detected)."
else
    log_info "Running pre-deployment local test suites..."
    (cd testing && npm test)
    log_success "All pre-deployment test suites passed cleanly!"
fi

# Step 3: Push code to GitHub origin main
log_info "Pushing latest commits to GitHub repository (origin main)..."
if git push origin main; then
    log_success "GitHub repository updated successfully."
else
    log_warn "Git push returned warning or no new commits. Proceeding with deployment..."
fi

# Step 4: Execute Remote Azure VM Deployment via SSH
log_info "Connecting to Azure VM ($SERVER_USER@$SERVER_IP) to execute remote deployment..."

SSH_CMD="ssh -i $KEY_FILE -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP"

$SSH_CMD "
    set -e
    echo '[REMOTE] Reclaiming disk space (Docker prune & PM2 log flush)...'
    sudo docker system prune -af --volumes 2>/dev/null || true
    pm2 flush 2>/dev/null || true

    echo '[REMOTE] Synchronizing repository code with GitHub main branch...'
    cd $REMOTE_PATH
    if [ ! -d '.git' ]; then
        git init
        git remote add origin https://github.com/AmanKashyapp07/CI-CD-Engine.git 2>/dev/null || git remote set-url origin https://github.com/AmanKashyapp07/CI-CD-Engine.git
    fi
    git fetch origin main
    git reset --hard origin/main

    echo '[REMOTE] Building production frontend assets...'
    cd $REMOTE_PATH/frontend
    npm install --silent
    npm run build

    echo '[REMOTE] Installing backend dependencies...'
    cd $REMOTE_PATH/backend
    npm install --silent

    echo '[REMOTE] Restarting PM2 process daemons (magnus-api & magnus-worker)...'
    pm2 restart all
    pm2 save
"

log_success "Remote server update, build compilation, and PM2 restart completed successfully!"

# Step 5: Post-Deployment Live Verification
log_info "Running post-deployment live E2E tests against $LIVE_DOMAIN..."
(cd testing && npm run test:e2e)

log_success "🎉 Deployment Complete & Live Site Verified! Live App: $LIVE_DOMAIN"
