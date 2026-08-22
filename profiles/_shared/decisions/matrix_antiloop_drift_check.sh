#!/usr/bin/env bash
# matrix + weixin 噪声过滤 & matrix anti-loop 漂移检测（inventory-drift-watchdog 集成）
# 检查三处 swarm 标记是否被 hermes update 冲掉；被冲掉则自动用备份 patch 重打并告警。
#   1) matrix adapter:  swarm:anti-loop + swarm:noise-filter
#   2) weixin adapter:  swarm:noise-filter
#   3) gateway/noise_filter.py: 共享 util 模块（两 adapter 依赖）
#
# 退出码：0=正常（默认静默，符合 cron「Empty stdout = silent」约定）
#         1=已自动修复（告警）  2=需人工（告警）
# 用法：
#   bash matrix_antiloop_drift_check.sh            # cron 模式（默认）：健康静默，异常才输出
#   bash matrix_antiloop_drift_check.sh --verbose  # 交互模式：健康也打印 ✓

VERBOSE=0
[ "${1:-}" = "--verbose" ] && VERBOSE=1

REPO="$HOME/.hermes/hermes-agent"
MATRIX_ADAPTER="$REPO/plugins/platforms/matrix/adapter.py"
WEIXIN_ADAPTER="$REPO/gateway/platforms/weixin.py"
SHARED_MODULE="$REPO/gateway/noise_filter.py"

PATCH_DIR="$HOME/.hermes/profiles/_shared/decisions"
MATRIX_PATCH="$PATCH_DIR/matrix-adapter-antiloop.patch"
WEIXIN_PATCH="$PATCH_DIR/weixin-adapter-noisefilter.patch"
MODULE_PATCH="$PATCH_DIR/gateway-noise-filter-module.patch"

# 检测三处标记是否齐全
_missing=""
grep -q "swarm:anti-loop"   "$MATRIX_ADAPTER" 2>/dev/null || _missing="$_missing matrix:anti-loop"
grep -q "swarm:noise-filter" "$MATRIX_ADAPTER" 2>/dev/null || _missing="$_missing matrix:noise-filter"
grep -q "swarm:noise-filter" "$WEIXIN_ADAPTER" 2>/dev/null || _missing="$_missing weixin:noise-filter"
[ -f "$SHARED_MODULE" ] || _missing="$_missing gateway:noise_filter.py(module)"

if [ -z "$_missing" ]; then
    [ "$VERBOSE" = "1" ] && echo "✓ matrix(anti-loop+noise-filter) + weixin(noise-filter) + 共享模块 标记均存在"
    exit 0
fi

echo "⚠️  噪声过滤/anti-loop 标记缺失:$_missing —— 可能被 hermes update 覆盖"

cd "$REPO" || exit 2
_fixed=0
_failed=0

_repatch() {
    local patch_file="$1" label="$2"
    if [ ! -f "$patch_file" ]; then
        echo "✗ $label patch 备份不存在: $patch_file"
        _failed=1; return
    fi
    if patch --dry-run -p1 < "$patch_file" >/dev/null 2>&1; then
        patch -p1 < "$patch_file" >/dev/null 2>&1 && { echo "✓ 已重打 $label"; _fixed=1; } || { echo "✗ $label 重打失败"; _failed=1; }
    else
        echo "✗ $label patch 无法干净应用（上游已变动）—— 需人工重建"
        _failed=1
    fi
}

case "$_missing" in *matrix:*)    _repatch "$MATRIX_PATCH" "matrix-adapter" ;; esac
case "$_missing" in *weixin:*)    _repatch "$WEIXIN_PATCH" "weixin-adapter" ;; esac
case "$_missing" in *noise_filter*) _repatch "$MODULE_PATCH" "noise_filter-module" ;; esac

# 共享模块若整个文件丢失，patch 也补不回来时给出兜底提示
if [ ! -f "$SHARED_MODULE" ] && [ -f "$MODULE_PATCH" ]; then
    echo "提示: 共享模块 gateway/noise_filter.py 缺失，已尝试用 patch 恢复；"
    echo "      若仍缺失，从 git 历史或备份恢复该新文件（untracked，hermes update 不管理）。"
fi

if [ "$_failed" = "1" ]; then
    echo "→ 部分修复失败，需人工介入（见 matrix-collaboration-termination.md §五）"
    exit 2
fi
[ "$_fixed" = "1" ] && { echo "→ 已自动重打，需人工复核后重启 gateway 生效"; exit 1; }
exit 2
