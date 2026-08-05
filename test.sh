#!/usr/bin/env bash

###############################################################################
# MagnusCI Unified Master Test Orchestrator (test.sh)
#
# Target Server: http://magnus-ci.online
# Local Project: /Users/amankashyap/Documents/tes
#
# Suite Coverage:
# 1. Unit Test Suite (Jest)
# 2. Integration Test Suite (Jest)
# 3. Live E2E Deployment Suite (Jest + Supertest)
# 4. Kubernetes Infrastructure Test Suite (K3s Pods & Volume Mounts)
# 5. Playwright Browser E2E Suite (Chromium 23/23 tests)
# 6. Local Project Pipeline Suite (/Users/amankashyap/Documents/tes)
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
echo " █▀▄▀█  ▄▀█  █▀▀  █▄░█  █░█  █▀    █▀▀  █ "
echo " █░▀░█  █▀█  █▄█  █░▀█  █▄█  ▄█    █▄▄  █ "
echo "========================================================================"
echo -e "${RESET}"
echo -e "${CYAN}${BOLD} MagnusCI Unified Master Test Suite Orchestrator${RESET}"
echo -e "${CYAN} Target: ${YELLOW}http://magnus-ci.online${RESET}"
echo -e "${CYAN} Execution Time: ${YELLOW}$(date +'%Y-%m-%d %H:%M:%S')${RESET}"
echo "------------------------------------------------------------------------"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTING_DIR="${ROOT_DIR}/testing"
TES_DIR="/Users/amankashyap/Documents/tes"

PASSED_COUNT=0
TOTAL_SUITES=6

#------------------------------------------------------------------------------
# STEP 1: Unit Test Suite
#------------------------------------------------------------------------------
echo -e "\n${BOLD}${MAGENTA}[1/6] Running Unit Test Suite (Jest)...${RESET}"
if npm --prefix "$TESTING_DIR" run test:unit; then
    log_success "Unit Test Suite Passed 100%."
    PASSED_COUNT=$((PASSED_COUNT + 1))
else
    log_error "Unit Test Suite Failed."
    exit 1
fi

#------------------------------------------------------------------------------
# STEP 2: Integration Test Suite
#------------------------------------------------------------------------------
echo -e "\n${BOLD}${MAGENTA}[2/6] Running Integration Test Suite (Jest)...${RESET}"
if npm --prefix "$TESTING_DIR" run test:integration; then
    log_success "Integration Test Suite Passed 100%."
    PASSED_COUNT=$((PASSED_COUNT + 1))
else
    log_error "Integration Test Suite Failed."
    exit 1
fi

#------------------------------------------------------------------------------
# STEP 3: Live E2E Backend Deployment Suite
#------------------------------------------------------------------------------
echo -e "\n${BOLD}${MAGENTA}[3/6] Running Live E2E Backend Deployment Suite (http://magnus-ci.online)...${RESET}"
if npm --prefix "$TESTING_DIR" run test:e2e; then
    log_success "Live E2E Backend Deployment Suite Passed 100%."
    PASSED_COUNT=$((PASSED_COUNT + 1))
else
    log_error "Live E2E Backend Deployment Suite Failed."
    exit 1
fi

#------------------------------------------------------------------------------
# STEP 4: Kubernetes Infrastructure Test Suite
#------------------------------------------------------------------------------
echo -e "\n${BOLD}${MAGENTA}[4/6] Running Kubernetes Infrastructure Test Suite (K3s Pods & Volumes)...${RESET}"
if npm --prefix "$TESTING_DIR" exec jest e2e/k8s-infrastructure.test.js; then
    log_success "Kubernetes Infrastructure Test Suite Passed 100%."
    PASSED_COUNT=$((PASSED_COUNT + 1))
else
    log_error "Kubernetes Infrastructure Test Suite Failed."
    exit 1
fi

#------------------------------------------------------------------------------
# STEP 5: Playwright Browser E2E Suite
#------------------------------------------------------------------------------
echo -e "\n${BOLD}${MAGENTA}[5/6] Running Playwright Browser E2E Suite (Chromium)...${RESET}"
if npm --prefix "$TESTING_DIR" exec playwright test e2e/; then
    log_success "Playwright Browser E2E Suite Passed 100%."
    PASSED_COUNT=$((PASSED_COUNT + 1))
else
    log_error "Playwright Browser E2E Suite Failed."
    exit 1
fi

#------------------------------------------------------------------------------
# STEP 6: Local Test Repository Suite (/Users/amankashyap/Documents/tes)
#------------------------------------------------------------------------------
echo -e "\n${BOLD}${MAGENTA}[6/6] Running Local Test Repository Pipeline Suite (${TES_DIR})...${RESET}"
if [ -d "$TES_DIR" ]; then
    if npm --prefix "$TES_DIR" test; then
        log_success "Local Test Repository Pipeline Suite Passed 100%."
        PASSED_COUNT=$((PASSED_COUNT + 1))
    else
        log_error "Local Test Repository Suite Failed."
        exit 1
    fi
else
    log_warn "Directory ${TES_DIR} not found. Skipping Step 6."
fi

#------------------------------------------------------------------------------
# FINAL SUMMARY
#------------------------------------------------------------------------------
echo -e "\n${MAGENTA}${BOLD}========================================================================"
echo -e "               MASTER TEST EXECUTION SUMMARY                            "
echo -e "========================================================================${RESET}"
echo -e "${GREEN}${BOLD} All ${PASSED_COUNT}/${TOTAL_SUITES} Test Suites Passed Successfully!${RESET}"
echo -e "${CYAN} Production Target: http://magnus-ci.online${RESET}"
echo -e "${CYAN} Execution Time:    $(date +'%Y-%m-%d %H:%M:%S')${RESET}"
echo -e "${MAGENTA}${BOLD}========================================================================${RESET}\n"

exit 0
