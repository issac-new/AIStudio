#!/usr/bin/env bash
# Wrapper: disable bgm during peak hours (14:00 weekdays)
exec "$(dirname "$0")/ccswitch-peak-toggle.sh" disable
