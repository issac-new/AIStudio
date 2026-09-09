#!/usr/bin/env bash
# Wrapper: restore bgm after peak hours (18:00 weekdays)
exec "$(dirname "$0")/ccswitch-peak-toggle.sh" restore
