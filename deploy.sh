#!/usr/bin/env bash
# =============================================================================
# MagnusCI Zero-Downtime Kubernetes Deployment Manager
# Target Server: Oracle Cloud VM (129.154.39.198)
# Stack: Node.js / BullMQ / Redis / PostgreSQL / Docker / K3s / Nginx
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_BASE="${LOCAL_BASE:-$SCRIPT_DIR}"
SSH_KEY="${SSH_KEY:-/Users/amankashyap/Documents/NexusIDE/ssh-key-2022-12-01.key}"
REMOTE_USER="ubuntu"
REMOTE_IP="129.154.39.198"
REMOTE_DIR="/home/ubuntu/ci-cd-engine"
IMAGE_NAME="amankashyap07/magnus-api:latest"

# ─── Formatting ───────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
RESET='\033[0m'

log_info()    { echo -e "${CYAN}${BOLD}[INFO]${RESET} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"; }
log_warn()    { echo -e "${YELLOW}${BOLD}[WARNING]${RESET} $1"; }
log_error()   { echo -e "${RED}${BOLD}[ERROR]${RESET} $1"; }
section()     { echo -e "\n${YELLOW}${BOLD}══ $1 ══${RESET}"; }

echo -e "${MAGENTA}${BOLD}"
echo "========================================================================"
echo " MagnusCI Production Kubernetes Deployment System"
echo "========================================================================"
echo -e "${RESET}"

# ─── 0. Prerequisite Checks ───────────────────────────────────────────────────
section "0/5  Verifying Local & Remote Prerequisites"

if [ ! -f "$SSH_KEY" ]; then
    log_error "SSH key file '$SSH_KEY' not found."
    exit 1
fi
chmod 600 "$SSH_KEY"

for cmd in ssh rsync docker; do
    if ! command -v $cmd &>/dev/null; then
        log_error "Required CLI tool '$cmd' is missing locally."
        exit 1
    fi
done

log_info "Testing SSH connectivity to (${REMOTE_USER}@${REMOTE_IP})..."
if ! ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${REMOTE_USER}@${REMOTE_IP}" "echo SSH_CONNECTED" >/dev/null 2>&1; then
    log_error "Failed to establish SSH connection to ${REMOTE_USER}@${REMOTE_IP}."
    exit 1
fi
log_success "SSH Connection Verified."

# ─── 1. Sync Local Workspace to VM ───────────────────────────────────────────
section "1/5  Syncing Local Source to Deployment Remote"
log_info "Syncing local repository state directly to remote workspace..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "mkdir -p ${REMOTE_DIR}"

rsync -avz --delete \
    -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude 'test-results' \
    --exclude 'playwright-report' \
    "${LOCAL_BASE}/" \
    "${REMOTE_USER}@${REMOTE_IP}:${REMOTE_DIR}/"

log_success "Codebase synchronized cleanly."

# ─── 2. Hydrate Manifests & Build Image ───────────────────────────────────────
section "2/5  Hydrating Manifest Secrets & Compiling Container Image"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "bash -s" << EOF
set -euo pipefail
cd ${REMOTE_DIR}

echo '[REMOTE] Preparing hydrated manifest build workspace...'
HYDRATED_DIR="/tmp/magnus-k8s-hydrated"
rm -rf "\$HYDRATED_DIR"
mkdir -p "\$HYDRATED_DIR"
cp -r k8s/* "\$HYDRATED_DIR/"

if [ -f "backend/.env" ]; then
    echo '[REMOTE] Ingesting backend/.env production secrets into temporary manifests...'
    set +e
    GITHUB_CLIENT_SECRET_VAL=\$(grep '^GITHUB_CLIENT_SECRET=' backend/.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    GITHUB_TOKEN_VAL=\$(grep '^GITHUB_TOKEN=' backend/.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    set -e
    
    if [ -n "\${GITHUB_CLIENT_SECRET_VAL:-}" ]; then
        sed -i "s|your_github_client_secret_here|\${GITHUB_CLIENT_SECRET_VAL}|g" "\$HYDRATED_DIR/magnus-api.yaml"
    fi
    if [ -n "\${GITHUB_TOKEN_VAL:-}" ]; then
        sed -i "s|your_github_personal_access_token_here|\${GITHUB_TOKEN_VAL}|g" "\$HYDRATED_DIR/magnus-api.yaml"
        sed -i "s|your_github_personal_access_token_here|\${GITHUB_TOKEN_VAL}|g" "\$HYDRATED_DIR/magnus-worker.yaml"
    fi
fi

echo '[REMOTE] Building Docker image (${IMAGE_NAME})...'
sudo docker build --no-cache -t ${IMAGE_NAME} -f backend/Dockerfile .

echo '[REMOTE] Importing Docker image into K3s container runtime...'
sudo docker save ${IMAGE_NAME} | sudo k3s ctr image import -

echo '[REMOTE] Cleaning up dangling Docker image layers...'
sudo docker image prune -f || true
EOF

log_success "Image compiled and loaded into K3s runtime."

# ─── 3. Apply Kubernetes Manifests & Rollout ─────────────────────────────────
section "3/5  Applying K8s Manifests & Executing Zero-Downtime Rollout"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "bash -s" << EOF
set -euo pipefail

echo '[REMOTE] Applying hydrated Kubernetes manifests...'
sudo k3s kubectl apply -f /tmp/magnus-k8s-hydrated/

echo '[REMOTE] Initiating zero-downtime deployment restart...'
sudo k3s kubectl rollout restart deployment magnus-api
sudo k3s kubectl rollout restart deployment magnus-worker

echo '[REMOTE] Waiting for deployment readiness...'
sudo k3s kubectl rollout status deployment magnus-api --timeout=90s
sudo k3s kubectl rollout status deployment magnus-worker --timeout=90s

rm -rf /tmp/magnus-k8s-hydrated
EOF

log_success "Kubernetes rollout verified cleanly."

# ─── 4. System Permissions & Routing ──────────────────────────────────────────
section "4/5  Reloading System Routing Infrastructure"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "bash -s" << EOF
set -euo pipefail
sudo chmod 755 /home/ubuntu
sudo nginx -t
sudo systemctl reload nginx
EOF

log_success "Nginx reverse proxy reloaded."

# ─── 5. Production Health Verification ────────────────────────────────────────
section "5/5  Production Health Verification"

HEALTH_STATUS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "curl -s -o /dev/null -w '%{http_code}' http://localhost/ci/ || true")

if [ "$HEALTH_STATUS" -eq 200 ] || [ "$HEALTH_STATUS" -eq 301 ] || [ "$HEALTH_STATUS" -eq 302 ]; then
    log_success "MagnusCI K8s Service is online and responding via Nginx (HTTP $HEALTH_STATUS)."
else
    log_warn "MagnusCI Service returned status HTTP $HEALTH_STATUS. Verify pod logs using: sudo k3s kubectl logs -l app=magnus-api"
fi

echo ""
log_success "MagnusCI Deployment Manager Finished Successfully!"
log_success "🚀 MagnusCI: http://${REMOTE_IP}/ci/"
log_success "💻 NexusIDE: http://${REMOTE_IP}/ide/"
echo ""
