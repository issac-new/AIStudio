#!/bin/bash
# 守门：轮间教训沉淀件（能力补齐·差距四）。断言：提取判据命中、指纹去重幂等、
# --dry 不落盘、目标缺位 fail（1）。
set -u
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
SINK="mux/mx-retro-sink.sh"
fails=0

cat > "$TMP/retro.md" <<'EOF'
# run14 复盘
## 问题
- 改进项 F1：审批臂扫描窗 20 条太窄，请求滚页卡死
- 根因：agent 会话静默消失无复活通道
- 无关键词的普通列表项（不应被提取）
- 教训：任务卡与引擎 run 需 taskId 关联
EOF

export MX_RETRO_SINK_TARGET="$TMP/lessons/lessons.md"
mkdir -p "$TMP/lessons"

bash "$SINK" "$TMP/retro.md" >/dev/null 2>&1 || { echo "FAIL 首次沉淀退出非零"; fails=1; }
n=$(grep -c '^- ' "$MX_RETRO_SINK_TARGET" 2>/dev/null || echo 0)
[ "$n" -eq 3 ] || { echo "FAIL 提取数=${n}（期望 3：改进/根因/教训三类命中，无关键词项排除）"; fails=1; }

bash "$SINK" "$TMP/retro.md" >/dev/null 2>&1 || { echo "FAIL 二次运行退出非零"; fails=1; }
n2=$(grep -c '^- ' "$MX_RETRO_SINK_TARGET" 2>/dev/null || echo 0)
[ "$n2" -eq 3 ] || { echo "FAIL 指纹去重失效（${n2} 条，期望仍 3）"; fails=1; }

out=$(bash "$SINK" "$TMP/retro.md" --dry 2>&1)
grep -q '不追加' <<<"$out" || { echo "FAIL --dry 对已沉淀文档应报不追加（got: $out）"; fails=1; }

MX_RETRO_SINK_TARGET="$TMP/none/x/lessons.md" bash "$SINK" "$TMP/retro.md" >/dev/null 2>&1
[ $? -eq 1 ] || { echo "FAIL 目标缺位应 exit 1（fail 语义）"; fails=1; }

[ "$fails" -eq 0 ] && echo 'PASS retro-sink（提取/去重/dry/fail 四断言）'
exit "$fails"
