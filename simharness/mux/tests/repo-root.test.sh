#!/bin/bash
# 单仓路径解析守门：mx-lib 必须把 OVERLAY_ROOT 解析到仓根（custom/patches 同根），
# 而不是旧布局的 <root>/overlay。
set -u
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
_rc=0
fail() { echo "FAIL: $*"; _rc=1; }

OUT="$(bash -c 'source "$1/mux/mx-lib.sh" >/dev/null 2>&1; printf "%s" "$OVERLAY_ROOT"' _ "$HERE")"
[ "$OUT" = "$REPO" ] || fail "OVERLAY_ROOT=$OUT，期望 $REPO"
[ -d "$OUT/custom/server" ] || fail "OVERLAY_ROOT 下缺 custom/server"
[ -d "$OUT/patches" ] || fail "OVERLAY_ROOT 下缺 patches"
[ -d "$OUT/simharness" ] || fail "OVERLAY_ROOT 下缺 simharness"

[ "$_rc" -eq 0 ] && echo "mx-lib 单仓路径解析全绿"
exit "$_rc"
