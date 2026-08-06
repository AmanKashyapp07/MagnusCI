#!/usr/bin/env bash
# =============================================================================
# test.sh — MagnusCI Master Test Suite Orchestrator
# =============================================================================
# Target Server: http://129.154.39.198/ci (Production / Staging VM)
# Local Test Repo: /Users/amankashyap/Documents/tes
#
# Suite Coverage:
#  1. Unit Test Suite (Jest)
#  2. Integration Test Suite (Jest)
#  3. Live E2E Backend Deployment Suite (Jest + Supertest)
#  4. Kubernetes Infrastructure Test Suite (K3s Pods & Volumes)
#  5. Playwright Browser E2E Suite (Chromium Specs)
#  6. Local Test Repository Pipeline Suite (/Users/amankashyap/Documents/tes)
#
# Usage:
#   bash test.sh              # Run full 6/6 test suite
#   bash test.sh --unit       # Run Unit Test Suite only
#   bash test.sh --integration# Run Integration Test Suite only
#   bash test.sh --e2e        # Run Playwright Browser E2E Suite only
#   bash test.sh --k8s        # Run Kubernetes Infrastructure Suite only
#   bash test.sh --help       # Print usage options
# =============================================================================

set -euo pipefail

# ─── Formatting & Colors ──────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
MAGENTA='\033[0;35m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

log_info()    { echo -e "${CYAN}${BOLD}[INFO]${RESET} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"; }
log_warn()    { echo -e "${YELLOW}${BOLD}[WARNING]${RESET} $1"; }
log_error()   { echo -e "${RED}${BOLD}[ERROR]${RESET} $1"; }
section()     { echo -e "\n${BOLD}${MAGENTA}[$1/$2] $3${RESET}"; }

START_TIME=$(date +%s)
SUMMARY_SUITES=()
SUMMARY_STATUS=()
SUMMARY_TIMES=()

record_suite() {
  local name="$1"
  local status="$2"
  local duration="$3"
  SUMMARY_SUITES+=("$name")
  SUMMARY_STATUS+=("$status")
  SUMMARY_TIMES+=("${duration}s")
}

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log_error "Execution stopped due to failure or signal."
  fi
}
trap cleanup EXIT

# ─── Environment Setup ───────────────────────────────────────────────────────
DEFAULT_TARGET="http://129.154.39.198/ci"
export DEPLOYED_URL="${DEPLOYED_URL:-$DEFAULT_TARGET}"
export TEST_TARGET_URL="${TEST_TARGET_URL:-$DEFAULT_TARGET}"
export BASE_URL="${BASE_URL:-$DEFAULT_TARGET}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTING_DIR="${ROOT_DIR}/testing"
TES_DIR="${TES_DIR:-/Users/amankashyap/Documents/tes}"

show_banner() {
  echo -e "${MAGENTA}${BOLD}"
  echo "========================================================================"
  echo " █▀▄▀█  ▄▀█  █▀▀  █▄░█  █░█  █▀    █▀▀  █ "
  echo " █░▀░█  █▀█  █▄█  █░▀█  █▄█  ▄█    █▄▄  █ "
  echo "========================================================================"
  echo -e "${RESET}"
  echo -e "${CYAN}${BOLD} MagnusCI Unified Master Test Suite Orchestrator${RESET}"
  echo -e "${CYAN} Target:         ${YELLOW}${DEPLOYED_URL}${RESET}"
  echo -e "${CYAN} Execution Time: ${YELLOW}$(date +'%Y-%m-%d %H:%M:%S')${RESET}"
  echo "------------------------------------------------------------------------"
}

show_help() {
  echo "MagnusCI Master Test Suite Runner"
  echo ""
  echo "Usage: bash test.sh [OPTION]"
  echo ""
  echo "Options:"
  echo "  (no args)       Run all 6 test suites sequentially"
  echo "  --unit          Run Unit Test Suite (Jest)"
  echo "  --integration   Run Integration Test Suite (Jest)"
  echo "  --live          Run Live Deployed E2E Backend Suite"
  echo "  --k8s           Run Kubernetes Infrastructure Suite"
  echo "  --e2e           Run Playwright Browser E2E Suite"
  echo "  --local         Run Local Test Repository Suite (${TES_DIR})"
  echo "  --help          Show this help message"
  echo ""
}

preflight_checks() {
  log_info "Verifying execution tools and dependencies..."
  for cmd in node npm npx; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      log_error "Required CLI tool '$cmd' is not installed."
      exit 1
    fi
  done

  if [ ! -d "$TESTING_DIR" ]; then
    log_error "Testing directory missing: ${TESTING_DIR}"
    exit 1
  fi
}

verify_target_health() {
  log_info "Verifying health status of target deployment: ${DEPLOYED_URL}"
  if command -v curl >/dev/null 2>&1; then
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "${DEPLOYED_URL}/" || echo "000")
    if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
      log_success "Target Deployment responded with HTTP ${code}."
    else
      log_warn "Target Deployment endpoint returned HTTP ${code}. Continuing suite execution."
    fi
  fi
}

# ─── Suite Execution Blocks ───────────────────────────────────────────────────
run_step_unit() {
  section "1" "6" "Running Unit Test Suite (Jest)..."
  local s_start=$(date +%s)
  if npm --prefix "$TESTING_DIR" run test:unit; then
    local s_end=$(date +%s)
    log_success "Unit Test Suite Passed 100%."
    record_suite "1. Unit Test Suite" "PASSED" "$((s_end - s_start))"
  else
    log_error "Unit Test Suite Failed."
    exit 1
  fi
}

run_step_integration() {
  section "2" "6" "Running Integration Test Suite (Jest)..."
  local s_start=$(date +%s)
  if npm --prefix "$TESTING_DIR" run test:integration; then
    local s_end=$(date +%s)
    log_success "Integration Test Suite Passed 100%."
    record_suite "2. Integration Test Suite" "PASSED" "$((s_end - s_start))"
  else
    log_error "Integration Test Suite Failed."
    exit 1
  fi
}

run_step_live() {
  section "3" "6" "Running Live E2E Backend Deployment Suite (${DEPLOYED_URL})..."
  verify_target_health
  local s_start=$(date +%s)
  if npm --prefix "$TESTING_DIR" run test:e2e; then
    local s_end=$(date +%s)
    log_success "Live E2E Backend Deployment Suite Passed 100%."
    record_suite "3. Live E2E Backend Suite" "PASSED" "$((s_end - s_start))"
  else
    log_error "Live E2E Backend Deployment Suite Failed."
    exit 1
  fi
}

run_step_k8s() {
  section "4" "6" "Running Kubernetes Infrastructure Test Suite (K3s Pods & Volumes)..."
  local s_start=$(date +%s)
  if npm --prefix "$TESTING_DIR" exec jest e2e/k8s-infrastructure.test.js; then
    local s_end=$(date +%s)
    log_success "Kubernetes Infrastructure Test Suite Passed 100%."
    record_suite "4. K8s Infrastructure Suite" "PASSED" "$((s_end - s_start))"
  else
    log_error "Kubernetes Infrastructure Test Suite Failed."
    exit 1
  fi
}

run_step_e2e() {
  section "5" "6" "Running Playwright Browser E2E Suite (Chromium)..."
  local s_start=$(date +%s)
  if npm --prefix "$TESTING_DIR" exec playwright test e2e/playwright-rigorous.spec.js e2e/tes-repository-pipeline.spec.js; then
    local s_end=$(date +%s)
    log_success "Playwright Browser E2E Suite Passed 100%."
    record_suite "5. Playwright Browser E2E" "PASSED" "$((s_end - s_start))"
  else
    log_error "Playwright Browser E2E Suite Failed."
    exit 1
  fi
}

run_step_local() {
  section "6" "6" "Running Local Test Repository Pipeline Suite (${TES_DIR})..."
  local s_start=$(date +%s)
  if [ -d "$TES_DIR" ]; then
    if npm --prefix "$TES_DIR" test; then
      local s_end=$(date +%s)
      log_success "Local Test Repository Pipeline Suite Passed 100%."
      record_suite "6. Local Test Pipeline" "PASSED" "$((s_end - s_start))"
    else
      log_error "Local Test Repository Suite Failed."
      exit 1
    fi
  else
    log_warn "Directory ${TES_DIR} not found. Skipping Step 6."
    record_suite "6. Local Test Pipeline" "SKIPPED" "0"
  fi
}

# ─── Option Dispatch ─────────────────────────────────────────────────────────
MODE="all"
if [ $# -gt 0 ]; then
  case "$1" in
    --unit)        MODE="unit" ;;
    --integration) MODE="integration" ;;
    --live)        MODE="live" ;;
    --k8s)         MODE="k8s" ;;
    --e2e)         MODE="e2e" ;;
    --local)       MODE="local" ;;
    --help|-h)     show_help; exit 0 ;;
    *)
      log_error "Unknown argument: $1"
      show_help
      exit 1
      ;;
  esac
fi

show_banner
preflight_checks

case "$MODE" in
  unit)        run_step_unit ;;
  integration) run_step_integration ;;
  live)        run_step_live ;;
  k8s)         run_step_k8s ;;
  e2e)         run_step_e2e ;;
  local)       run_step_local ;;
  all)
    run_step_unit
    run_step_integration
    run_step_live
    run_step_k8s
    run_step_e2e
    run_step_local
    ;;
esac

# ─── Final Summary Table ──────────────────────────────────────────────────────
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo -e "\n${MAGENTA}${BOLD}========================================================================"
echo -e "               MASTER TEST EXECUTION SUMMARY                            "
echo -e "========================================================================${RESET}"
for i in "${!SUMMARY_SUITES[@]}"; do
  printf "${CYAN} %-35s ${GREEN}%-10s${RESET} (${YELLOW}%s${RESET})\n" "${SUMMARY_SUITES[$i]}" "${SUMMARY_STATUS[$i]}" "${SUMMARY_TIMES[$i]}"
done
echo -e "------------------------------------------------------------------------"
echo -e "${GREEN}${BOLD} All executed test suites completed successfully!${RESET}"
echo -e "${CYAN} Production Target: ${YELLOW}${DEPLOYED_URL}${RESET}"
echo -e "${CYAN} Total Duration:    ${YELLOW}${TOTAL_DURATION}s${RESET}"
echo -e "${CYAN} Execution Time:    ${YELLOW}$(date +'%Y-%m-%d %H:%M:%S')${RESET}"
echo -e "${MAGENTA}${BOLD}========================================================================${RESET}\n"

exit 0
