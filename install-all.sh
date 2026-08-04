#!/usr/bin/env bash
# ============================================================
# SwarmTeam — Batch Install All Profiles (v2.2)
# ============================================================
# Installs all SwarmTeam profiles as Hermes Agent distributions.
#
# Usage (macOS/Linux):
#   ./install-all.sh                    # install all 12 profiles
#   ./install-all.sh --team swarm       # install only swarm team (4 profiles)
#   ./install-all.sh --team platform    # install only platform team (2 profiles)
#   ./install-all.sh --profile worker-coder  # install single profile
#
# Prerequisites:
#   - Hermes Agent installed (https://hermes-agent.nousresearch.com)
#   - Git installed
#
# After install, fill in credentials:
#   See: shared/profiles.yaml for required env vars
#   Edit: ~/.hermes/.env
# ============================================================

set -euo pipefail

REPO_URL="https://github.com/issac-new/SwarmTeam.git"
CLONE_DIR="${TMPDIR:-/tmp}/SwarmTeam-install-$$"

# Team → profiles mapping (v2.0: 12 profiles / 4 teams)
declare -A TEAM_PROFILES
TEAM_PROFILES[swarm]="orchestrator worker-coder worker-researcher worker-tester"
TEAM_PROFILES[product]="product-manager product-researcher"
TEAM_PROFILES[ops]="ops-devops ops-eval ops-incident-commander ops-sre"
TEAM_PROFILES[platform]="platform-skill-miner platform-ontology-curator"

ALL_PROFILES=""
for team in swarm product ops platform; do
    ALL_PROFILES="${ALL_PROFILES} ${TEAM_PROFILES[$team]}"
done

# Parse args
TARGET_PROFILES=""
if [[ $# -eq 0 ]]; then
    TARGET_PROFILES="${ALL_PROFILES}"
elif [[ "$1" == "--team" ]]; then
    team="${2:-}"
    if [[ -z "${team}" ]] || [[ -z "${TEAM_PROFILES[$team]:-}" ]]; then
        echo "Error: Unknown team '$team'. Available: swarm product ops platform"
        exit 1
    fi
    TARGET_PROFILES="${TEAM_PROFILES[$team]}"
elif [[ "$1" == "--profile" ]]; then
    TARGET_PROFILES="$2"
else
    echo "Usage: $0 [--team <team>|--profile <name>]"
    echo "Teams: swarm product ops platform"
    echo "Profiles: ${ALL_PROFILES}"
    exit 1
fi

echo "============================================================"
echo "  SwarmTeam Profile Installer v2.2"
echo "  Repo: ${REPO_URL}"
echo "  Profiles: ${TARGET_PROFILES}"
echo "============================================================"
echo ""

# Clone the repo
echo "Cloning SwarmTeam repo..."
git clone --depth 1 "${REPO_URL}" "${CLONE_DIR}" 2>/dev/null
echo "✓ Cloned to ${CLONE_DIR}"
echo ""

installed=0
failed=0

for profile in ${TARGET_PROFILES}; do
    profile_dir="${CLONE_DIR}/profiles/${profile}"
    echo "--- Installing: ${profile} ---"

    if [[ ! -f "${profile_dir}/distribution.yaml" ]]; then
        echo "  ❌ ${profile}: no distribution.yaml found"
        ((failed++))
        continue
    fi

    # Install from local directory (Hermes native install)
    if hermes profile install "${profile_dir}" --alias -y 2>&1; then
        echo "  ✅ ${profile} installed"
        ((installed++))
    else
        echo "  ❌ ${profile} install failed"
        ((failed++))
    fi
    echo ""
done

# Cleanup clone
rm -rf "${CLONE_DIR}"

echo "============================================================"
echo "  Results: ${installed} installed, ${failed} failed"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Set up API keys in ~/.hermes/.env"
echo "     See shared/profiles.yaml for required env vars per profile"
echo ""
echo "  2. Verify installed profiles:"
echo "     hermes profile list"
echo ""
echo "  3. Start using:"
echo "     hermes -p orchestrator    # TUI chat"
echo "     hermes -p worker-coder    # Coding agent"
echo ""
