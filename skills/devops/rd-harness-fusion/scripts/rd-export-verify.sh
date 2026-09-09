#!/usr/bin/env bash
# rd-export-verify.sh — 验证 rd-export.py 和 devops-rd skill 是否就位
# 用法: bash ~/.hermes/skills/devops/rd-harness-fusion/scripts/rd-export-verify.sh

set -euo pipefail

echo "=== RD Harness 落地验证 ==="

# 1. rd-export.py 存在且可执行
if [ -f ~/.hermes/bin/rd-export.py ]; then
  echo "✅ rd-export.py 存在"
  python3 ~/.hermes/bin/rd-export.py --help > /dev/null 2>&1 && echo "✅ rd-export.py --help 正常"
else
  echo "❌ rd-export.py 不存在"
fi

# 2. devops-rd skill 数量
skill_count=$(find ~/.hermes/profiles/*/skills/devops-rd -name SKILL.md 2>/dev/null | wc -l)
echo "devops-rd skill 数量: $skill_count (预期 11)"

# 3. applications/*.md 数量
app_count=$(ls ~/.hermes/knowledge/applications/*.md 2>/dev/null | wc -l)
echo "applications/*.md 数量: $app_count (预期 27)"

# 4. candidate/*.md 数量
candidate_count=$(ls ~/.hermes/profiles/_shared/knowledge/candidate/*.md 2>/dev/null | wc -l)
echo "candidate/*.md 数量: $candidate_count (预期 4)"

# 5. templates/*.md 数量
template_count=$(ls ~/.hermes/profiles/_shared/templates/*.md 2>/dev/null | wc -l)
echo "templates/*.md 数量: $template_count (预期 5)"

# 6. knowledge 元文件
for f in README.md INDEX.md ROUTING.md; do
  [ -f ~/.hermes/knowledge/$f ] && echo "✅ knowledge/$f" || echo "❌ knowledge/$f 缺失"
done

# 7. 无 secret 泄漏
leaks=$(grep -rE "api[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]|secret[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]|password\s*[:=]\s*['\"][a-zA-Z0-9]" \
  ~/.hermes/knowledge/ ~/.hermes/profiles/*/skills/devops-rd/ 2>/dev/null | wc -l)
if [ "$leaks" -eq 0 ]; then echo "✅ 无 secret 泄漏"; else echo "⚠️ 发现 $leaks 处疑似 secret"; fi

echo "=== 验证完成 ==="