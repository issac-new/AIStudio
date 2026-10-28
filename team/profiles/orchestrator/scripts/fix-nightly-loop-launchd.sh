#!/bin/bash
# t_27a9fe4f 收尾：nightly-loop launchd 修复（外部 shell 执行）
# 问题：plist 在位(910B, 02:15)但 job uninitialized=从未被 bootstrap → 四晚零夜采
set -u
exec > /tmp/nightly-loop-fix.log 2>&1
echo "[$(date '+%H:%M:%S')] 开始"
PLIST=~/Library/LaunchAgents/ai.hermes.unified-nightly-loop.plist
SCRIPT=/Users/YOURNAME/.hermes/scripts/unified_nightly_loop.sh
# 1. 脚本在位检查
if [ ! -f "$SCRIPT" ]; then echo "❌ $SCRIPT 不存在"; exit 1; fi
echo "✓ 脚本在位: $(wc -c < "$SCRIPT") bytes"
# 2. bootout 旧注册(如有)再 bootstrap
launchctl bootout gui/501/ai.hermes.unified-nightly-loop 2>/dev/null || true
launchctl bootstrap gui/501 "$PLIST" && echo "✓ bootstrap OK" || { echo "❌ bootstrap 失败"; exit 1; }
sleep 2
# 3. 验证
launchctl print gui/501/ai.hermes.unified-nightly-loop | grep -E "^\s+(state|last exit)" | head -3
# 4. 干跑一次验证脚本本身可执行(不整夜等)
echo "--- dry-run 脚本前 20 行语法检查 ---"
bash -n "$SCRIPT" && echo "✓ 脚本语法 OK" || echo "❌ 语法错误"
echo "[$(date '+%H:%M:%S')] 完成——今晚 02:15 将首次自动夜采"
