#!/usr/bin/env bash
# ============================================================
# SwarmTeam — Batch Install All Profiles
# ============================================================
# Installs all SwarmTeam profiles as Hermes Agent distributions.
#
# Usage:
#   ./install-all.sh                # install all profiles
#   ./install-all.sh --team swarm    # install only swarm team (9 profiles)
#   ./install-all.sh --team product  # install only product team (4 profiles)
#   ./install-all.sh --team ops      # install only ops team (4 profiles)
#   ./install-all.sh --profile orchestrator  # install single profile
#
# Prerequisites:
#   - Hermes Agent installed (hermes command available)
#   - Git installed
#   - GitHub access to issac-new/SwarmTeam repo
#
# After install, fill in credentials:
#   cp ~/.hermes/profiles/<name>/.env.EXAMPLE ~/.hermes/profiles/<name>/.env
#   # Edit .env with your real API keys
# ============================================================

set -euo pipefail

REPO="github.com/issac-new/SwarmTeam"

# Team → profiles mapping
declare -A TEAM_PROFILES
TEAM_PROFILES[swarm]="${TEAM_PROFILES[swarm]:-}"
TEAM_PROFILES[swarm]="orchestrator architect project-manager requirement-analyst worker-coder worker-deployer worker-researcher worker-reviewer worker-tester"
TEAM_PROFILES[product]="product-manager product-researcher product-prioritizer product-feedback"
TEAM_PROFILES[ops]="ops-devops ops-sre ops-incident-commander ops-exec-summary"

ALL_PROFILES=""
for team in swarm product ops; do
    ALL_PROFILES="${ALL_PROFILES} ${TEAM_PROFILES[$team]}"
done

# Parse args
TARGET_PROFILES=""
if [[ $# -eq 0 ]]; then
    TARGET_PROFILES="${ALL_PROFILES}"
elif [[ "$1" == "--team" ]]; then
    team="${2:-}"
    if [[ -z "${team}" ]] || [[ -z "${TEAM_PROFILES[$team]:-}" ]]; then
        echo "Error: Unknown team '$team'. Available: swarm product ops"
        exit 1
    fi
    TARGET_PROFILES="${TEAM_PROFILES[$team]}"
elif [[ "$1" == "--profile" ]]; then
    TARGET_PROFILES="$2"
else
    echo "Usage: $0 [--team <team>|--profile <name>]"
    echo "Teams: swarm product ops"
    exit 1
fi

echo "============================================================"
echo "  SwarmTeam Profile Installer"
echo "  Repo: $REPO"
echo "  Profiles: $TARGET_PROFILES"
echo "============================================================"
echo ""

installed=0
failed=0

for profile in $TARGET_PROFILES; do
    echo "--- Installing: $profile ---"
    if hermes profile install "$REPO" --name "$profile" --alias -y 2>&1; then
        echo "  ✅ $profile installed"
        ((installed++))
    else
        echo "  ❌ $profile failed"
        ((failed++))
    fi
    echo ""
done

echo "============================================================"
echo "  Results: $installed installed, $failed failed"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Fill in credentials for each profile:"
echo "     cp ~/.hermes/profiles/<name>/.env.EXAMPLE ~/.hermes/profiles/<name>/.env"
echo "     # Edit .env with your real API keys"
echo ""
echo "  2. Verify profiles:"
echo "     hermes profile list"
echo ""
echo "  3. Start gateway (if using messaging platforms):"
echo "     hermes -p orchestrator gateway run"
echo ""
