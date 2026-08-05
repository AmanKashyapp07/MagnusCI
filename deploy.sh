#!/usr/bin/env bash

###############################################################################
# Production Zero-Downtime Kubernetes Deployment Script
#
# Target Server: http://magnus-ci.online (Azure VM 4.145.89.253)
# Kubernetes Engine: K3s
#
# Workflows Executed:
# 1. SSH authentication check
# 2. Local workspace git status verification
# 3. Remote git sync (git fetch & git reset)
# 4. Injects production environment secrets from server backend/.env
# 5. Container image build (amankashyap07/magnus-api:latest)
# 6. Container import into k3s image runtime
# 7. Rollout restart for magnus-api and magnus-worker deployments
# 8. Pod readiness health verification
###############################################################################

set -e # Exit immediately on error

# Colors & Formatting
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
RESET='\033[0m'

log_info() {
    echo -e "${CYAN}${BOLD}[INFO]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"
}

log_warn() {
    echo -e "${YELLOW}${BOLD}[WARNING]${RESET} $1"
}

log_error() {
    echo -e "${RED}${BOLD}[ERROR]${RESET} $1"
}

echo -e "${MAGENTA}${BOLD}"
echo "========================================================================"
echo " MagnusCI Kubernetes Zero-Downtime Deployment Manager"
echo "========================================================================"
echo -e "${RESET}"

SSH_KEY="magnus-ci-server_key.pem"
REMOTE_USER="azureuser"
REMOTE_IP="4.145.89.253"
REMOTE_DIR="/home/azureuser/ci-cd-engine"

# Step 1: Verify local SSH Key existence
if [ ! -f "$SSH_KEY" ]; then
    log_error "SSH key file '$SSH_KEY' not found in current directory."
    exit 1
fi

chmod 600 "$SSH_KEY"

# Step 2: Test SSH Connectivity
log_info "Testing SSH connectivity to Azure VM (${REMOTE_USER}@${REMOTE_IP})..."
if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${REMOTE_USER}@${REMOTE_IP}" "echo Connected" >/dev/null 2>&1; then
    log_success "SSH connection established successfully."
else
    log_error "Failed to connect to ${REMOTE_USER}@${REMOTE_IP}. Please check network or VM state."
    exit 1
fi

# Step 3: Local Git Status Check
log_info "Verifying local Git repository state..."
if [ -n "$(git status --porcelain)" ]; then
    log_warn "Uncommitted changes detected in local repository."
fi

# Step 4: Execute Remote K8s Build & Deployment Sequence
log_info "Initiating remote Kubernetes build and zero-downtime rollout..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "bash -s" << 'EOF'
set -e
cd /home/azureuser/ci-cd-engine

echo '[REMOTE] Fetching latest repository commits...'
if [ ! -d ".git" ]; then
    echo '[REMOTE] Initializing remote git workspace...'
    git init
    git remote add origin https://github.com/AmanKashyapp07/ci-cd-engine.git
fi
git fetch origin main
git reset --hard origin/main

echo '[REMOTE] Injecting production secrets into k8s manifests...'
if [ -f "backend/.env" ]; then
    export $(grep -v '^#' backend/.env | xargs)
    if [ -n "$GITHUB_CLIENT_SECRET" ]; then
        sed -i "s/your_github_client_secret_here/${GITHUB_CLIENT_SECRET}/g" k8s/magnus-api.yaml
    fi
    if [ -n "$GITHUB_TOKEN" ]; then
        sed -i "s/your_github_personal_access_token_here/${GITHUB_TOKEN}/g" k8s/magnus-api.yaml
        sed -i "s/your_github_personal_access_token_here/${GITHUB_TOKEN}/g" k8s/magnus-worker.yaml
    fi
fi

echo '[REMOTE] Building production Docker container image (magnus-api)...'
sudo docker build -t amankashyap07/magnus-api:latest -f backend/Dockerfile .

echo '[REMOTE] Importing Docker image into k3s container runtime...'
sudo docker save amankashyap07/magnus-api:latest | sudo k3s ctr image import -

echo '[REMOTE] Applying Kubernetes manifests...'
sudo k3s kubectl apply -f k8s/

echo '[REMOTE] Initiating zero-downtime rollout restart...'
sudo k3s kubectl rollout restart deployment magnus-api
sudo k3s kubectl rollout restart deployment magnus-worker

echo '[REMOTE] Waiting for pod rollout completion...'
sudo k3s kubectl rollout status deployment magnus-api --timeout=60s
sudo k3s kubectl rollout status deployment magnus-worker --timeout=60s

echo '[REMOTE] Verified Kubernetes Cluster Pod Status:'
sudo k3s kubectl get pods -o wide
EOF

log_success "Deployment completed successfully! Live at http://magnus-ci.online"
