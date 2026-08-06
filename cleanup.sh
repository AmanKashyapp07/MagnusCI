#!/usr/bin/env bash
# =============================================================================
# cleanup.sh — Production VM Maintenance, Disk Reclamation & Routine Service Health Engine
# =============================================================================
# Target Server: Oracle Cloud VM (129.154.39.198)
# Operations:
#  1. Safe Reclamation of Disk Space (Docker, K3s, PM2, Journalctl, APT, Temp, Logs)
#  2. Comprehensive Service Health & Routine Diagnostic Audit
# =============================================================================

set -euo pipefail

# ─── Formatting & Colors ──────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

log_info()    { echo -e "${CYAN}${BOLD}[INFO]${RESET} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"; }
log_warn()    { echo -e "${YELLOW}${BOLD}[WARNING]${RESET} $1"; }
log_error()   { echo -e "${RED}${BOLD}[ERROR]${RESET} $1"; }

SSH_KEY="${SSH_KEY:-/Users/amankashyap/Documents/NexusIDE/ssh-key-2022-12-01.key}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_IP="${REMOTE_IP:-129.154.39.198}"

if [ ! -f "$SSH_KEY" ]; then
    log_error "SSH key missing at $SSH_KEY"
    exit 1
fi

chmod 600 "$SSH_KEY" 2>/dev/null || true

echo -e "${MAGENTA}${BOLD}"
echo "========================================================================"
echo " █▀█ █▀█ █▀█ █▀▄ █░█ █▀▀ ▀█▀ █ █▀█ █▄░█   ▄▀█ █░█ █▀▄ █ ▀█▀"
echo " █▀▀ █▀▄ █▄█ █▄▀ █▄█ █▄▄ ░█░ █ █▄█ █░▀█   █▀█ █▄█ █▄▀ █ ░█░"
echo "========================================================================"
echo -e "${RESET}"
echo -e "${CYAN}${BOLD} MagnusCI & NexusIDE Maintenance & Health Engine${RESET}"
echo -e "${CYAN} Target VM:      ${YELLOW}${REMOTE_USER}@${REMOTE_IP}${RESET}"
echo -e "${CYAN} Execution Time: ${YELLOW}$(date +'%Y-%m-%d %H:%M:%S')${RESET}"
echo "------------------------------------------------------------------------"

log_info "Connecting to remote VM (${REMOTE_USER}@${REMOTE_IP})..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "bash -s" << 'EOF'
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

section() { echo -e "\n${BLUE}${BOLD}══ $1 ══${RESET}"; }

BEFORE_USED_KB=$(df / --output=used | tail -1 | tr -d ' ')
BEFORE_SPACE_H=$(df / -h | awk 'NR==2 {print $3}')
BEFORE_FREE_H=$(df / -h | awk 'NR==2 {print $4}')

section "1/2 Reclaiming VM Disk Space & Cleaning Caches"

echo "[1/6] Cleaning Docker & Container Runtime caches..."
sudo docker system prune -af --volumes 2>/dev/null || true
sudo docker builder prune -af 2>/dev/null || true
if command -v k3s &>/dev/null; then
    sudo k3s crictl rmi --prune 2>/dev/null || true
fi

echo "[2/6] Vacuuming systemd journal logs (Limit to 3 days / 100MB)..."
sudo journalctl --vacuum-time=3d 2>/dev/null || true
sudo journalctl --vacuum-size=100M 2>/dev/null || true

echo "[3/6] Flushing APT package manager caches..."
sudo apt-get clean -y 2>/dev/null || true
sudo apt-get autoremove -y 2>/dev/null || true

echo "[4/6] Truncating application & reverse-proxy logs safely..."
if command -v pm2 &>/dev/null; then
    pm2 flush 2>/dev/null || true
fi
sudo find /home/ubuntu/.pm2/logs/ -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true
sudo find /var/log/nginx/ -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true
sudo find /var/log/journal/ -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true

echo "[5/6] Pruning stale build artifacts & NPM caches..."
sudo rm -rf /tmp/magnus-builds/* /tmp/sandbox-ide/* /tmp/*.tar.gz /tmp/dist.tar.gz 2>/dev/null || true
npm cache clean --force 2>/dev/null || true
sudo npm cache clean --force 2>/dev/null || true

echo "[6/6] Enforcing system directory permissions..."
sudo chmod 755 /home/ubuntu
sudo systemctl reload nginx 2>/dev/null || true

AFTER_USED_KB=$(df / --output=used | tail -1 | tr -d ' ')
AFTER_SPACE_H=$(df / -h | awk 'NR==2 {print $3}')
AFTER_FREE_H=$(df / -h | awk 'NR==2 {print $4}')
AVAIL_PCT=$(df / -h | awk 'NR==2 {print $5}')

RECLAIMED_KB=$((BEFORE_USED_KB - AFTER_USED_KB))
if [ $RECLAIMED_KB -lt 0 ]; then RECLAIMED_KB=0; fi
RECLAIMED_MB=$((RECLAIMED_KB / 1024))

echo -e "\n${GREEN}${BOLD}[RECLAMATION COMPLETE]${RESET}"
echo -e "${CYAN} Disk Space Used Before: ${YELLOW}${BEFORE_SPACE_H}${RESET}"
echo -e "${CYAN} Disk Space Used After:  ${YELLOW}${AFTER_SPACE_H}${RESET}"
echo -e "${CYAN} Reclaimed Space:        ${GREEN}${BOLD}~${RECLAIMED_MB} MB${RESET}"
echo -e "${CYAN} Current Free Space:     ${GREEN}${BOLD}${AFTER_FREE_H} (${AVAIL_PCT} used)${RESET}"

section "2/2 Routine Infrastructure & Service Health Audit"

SERVICES=()
STATUSES=()
DETAILS=()

check_service() {
    local name="$1"
    local type="$2"
    local check_cmd="$3"
    
    local start_t=$(date +%s%3N 2>/dev/null || date +%s)
    if eval "$check_cmd" >/dev/null 2>&1; then
        local end_t=$(date +%s%3N 2>/dev/null || date +%s)
        local latency=$((end_t - start_t))
        SERVICES+=("$name")
        STATUSES+=("HEALTHY")
        DETAILS+=("${type} OK (${latency}ms)")
    else
        SERVICES+=("$name")
        STATUSES+=("UNHEALTHY")
        DETAILS+=("${type} FAILED")
    fi
}

# 1. Nginx Reverse Proxy
check_service "Nginx Web Server" "Systemd/HTTP" "sudo systemctl is-active --quiet nginx && curl -sf http://localhost/ >/dev/null"

# 2. NexusIDE Backend API
check_service "NexusIDE Express Backend" "PM2/HTTP" "curl -sf http://localhost:4000/api/workspace >/dev/null || [ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/workspace) -eq 401 ]"

# 3. NexusIDE Frontend Assets
check_service "NexusIDE Frontend (/ide)" "HTTP 200" "curl -sf http://localhost/ide/ >/dev/null"

# 4. MagnusCI Kubernetes Cluster (K3s)
check_service "MagnusCI K8s Cluster (K3s)" "K8s Node" "kubectl get nodes | grep -q 'Ready'"

# 5. MagnusCI API Gateway
check_service "MagnusCI API Gateway" "K8s/HTTP" "curl -sf http://localhost:30501/api/health >/dev/null || [ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost/ci/api/health) -eq 200 ]"

# 6. MagnusCI Frontend (/ci)
check_service "MagnusCI Frontend (/ci)" "HTTP 200" "curl -sf http://localhost/ci/ >/dev/null"

# 7. PostgreSQL Database Service
check_service "PostgreSQL Database" "TCP 5432" "nc -z -w2 localhost 5432 || kubectl get pods -l app=postgres | grep -q 'Running'"

# 8. Redis In-Memory Cache
check_service "Redis In-Memory Cache" "TCP 6379" "nc -z -w2 localhost 6379 || kubectl get pods -l app=redis | grep -q 'Running'"

# 9. Docker Container Daemon
check_service "Docker Engine" "Daemon" "sudo docker info"

echo -e "\n${BOLD}========================================================================${RESET}"
echo -e "${BOLD}               SYSTEM SERVICE HEALTH MATRIX                             ${RESET}"
echo -e "${BOLD}========================================================================${RESET}"
FAILED_COUNT=0
for i in "${!SERVICES[@]}"; do
    if [ "${STATUSES[$i]}" = "HEALTHY" ]; then
        printf "${CYAN} %-32s ${GREEN}%-12s${RESET} (%s)\n" "${SERVICES[$i]}" "${STATUSES[$i]}" "${DETAILS[$i]}"
    else
        printf "${CYAN} %-32s ${RED}%-12s${RESET} (%s)\n" "${SERVICES[$i]}" "${STATUSES[$i]}" "${DETAILS[$i]}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
done
echo -e "------------------------------------------------------------------------"

if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${GREEN}${BOLD} All ${#SERVICES[@]} Services Operating Normally! Infrastructure is Healthy.${RESET}"
else
    echo -e "${RED}${BOLD} WARNING: ${FAILED_COUNT}/${#SERVICES[@]} Services Failed Health Check!${RESET}"
    exit 1
fi
EOF

log_success "Remote VM cleanup and routine diagnostic audit completed successfully!"
