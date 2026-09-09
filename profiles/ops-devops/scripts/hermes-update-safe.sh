#!/usr/bin/env bash
# Delegating wrapper for the hermes-update-safe hook.
# The canonical logic lives at ~/.hermes/bin/hermes-update-safe.sh (single source of truth);
# this file only adapts it into the per-profile cron scripts dir so the scheduler can exec it.
# Cron resolves `script` names under HERMES_HOME/scripts/, so this bridge is required.
exec /Users/YOURNAME/.hermes/bin/hermes-update-safe.sh "$@"
