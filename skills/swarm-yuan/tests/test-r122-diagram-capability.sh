#!/usr/bin/env bash
# test-r122-diagram-capability.sh — R122 图表生产能力回归锁
#
# 锁面：
#   ① 运行时物化完整性（MANIFEST/基线/LICENSE/45 类型/自检脚本）
#   ② 上游 self_check.py 正反两态（好例通过，缺 role=img 检出）
#   ③ diagram-check.sh 正反两态（结构契约：可访问 SVG/远程资源/min-width/脚本策略）
#   ④ precheck.sh --diagram 三态（好图通过 / 坏图阻断 / 无图给指引并通过）
#   ⑤ enforce 分层（check_diagram=warn，且可逐字节再生）
#   ⑥ 文档注册（facts 15/6/53、能力地图、任务路由、UNIVERSAL_FILES）
#
# 用法: bash swarm-yuan/tests/test-r122-diagram-capability.sh
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r122.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0; skip=0
ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
bad()  { echo "  ✗ $1"; fail=$((fail+1)); }
note() { echo "  · $1"; }
skipped() { echo "  ⊘ SKIP $1"; skip=$((skip+1)); }

RT="$BASE/runtime/diagram-design"
SKILL="$RT/skills/diagram-design"
CHECK="$BASE/scripts/diagram-check.sh"
EXAMPLE="$SKILL/assets/example-architecture.html"

# 最小正向夹具：结构契约全过，不含运行时依赖。
mk_good() {
  cat > "$1" <<'EOF'
<!doctype html><html><head><style>svg{width:100%;min-width:960px;display:block}</style></head><body>
<svg viewBox="0 0 960 600" role="img" aria-labelledby="x-title x-desc"><title id="x-title">T</title><desc id="x-desc">D</desc><rect x="0" y="0" width="4" height="4"/></svg></body></html>
EOF
}

# ===== ① 运行时物化完整性 =====
echo "① 运行时物化完整性"
[ -f "$RT/MANIFEST.md" ] && ok "MANIFEST.md 存在" || bad "MANIFEST.md 缺失"
grep -q 'cathrynlavery/diagram-design' "$RT/MANIFEST.md" 2>/dev/null \
  && ok "MANIFEST 登记上游仓库" || bad "MANIFEST 未登记上游仓库"
grep -q '0b9b10cab' "$RT/MANIFEST.md" 2>/dev/null \
  && ok "MANIFEST 登记物化基线 0b9b10cab" || bad "MANIFEST 缺物化基线 0b9b10cab"
grep -q 'MIT' "$RT/MANIFEST.md" 2>/dev/null \
  && ok "MANIFEST 登记 MIT 许可" || bad "MANIFEST 未登记 MIT 许可"
grep -q 'MIT License' "$RT/LICENSE" 2>/dev/null && grep -q 'Cathryn Lavery' "$RT/LICENSE" 2>/dev/null \
  && ok "上游 LICENSE 副本完整（MIT + 署名）" || bad "上游 LICENSE 副本缺失或不完整"
[ -f "$SKILL/SKILL.md" ] && ok "skills/diagram-design/SKILL.md 存在" || bad "SKILL.md 缺失"
grep -q 'architecture' "$SKILL/SKILL.md" 2>/dev/null && grep -q 'flowchart' "$SKILL/SKILL.md" 2>/dev/null \
  && ok "SKILL.md 描述含类型触发词（architecture/flowchart）" || bad "SKILL.md 描述缺类型触发词"
tcount=$(ls "$SKILL"/references/type-*.md 2>/dev/null | wc -l | xargs)
[ "$tcount" -eq 45 ] && ok "type-*.md 45 份（实际 ${tcount}）" || bad "type-*.md 数量=${tcount}，期望 45"
[ -f "$SKILL/scripts/self_check.py" ] && ok "上游 self_check.py 随运行时" || bad "self_check.py 缺失"
[ -f "$RT/gates/verify-geometry.py" ] && ok "几何门禁 verify-geometry.py 随运行时" || bad "verify-geometry.py 缺失"
[ -x "$CHECK" ] && ok "diagram-check.sh 可执行" || bad "diagram-check.sh 缺失或不可执行"

# ===== ② 上游 self_check.py 正反两态 =====
echo "② 上游 self_check.py 正反两态"
if command -v python3 >/dev/null 2>&1; then
  if python3 "$SKILL/scripts/self_check.py" "$EXAMPLE" > "$TMP/sc-good.log" 2>&1; then
    ok "上游好例通过 self_check.py"
  else
    bad "上游好例未通过 self_check.py：$(head -3 "$TMP/sc-good.log" | tr '\n' ' ')"
  fi
  mk_good "$TMP/bad-role.html"
  sed -i.bak 's/ role="img"//' "$TMP/bad-role.html"; rm -f "$TMP/bad-role.html.bak"
  if python3 "$SKILL/scripts/self_check.py" "$TMP/bad-role.html" > "$TMP/sc-bad.log" 2>&1; then
    bad "缺 role=img 的坏例被 self_check.py 放行"
  else
    grep -qi 'role' "$TMP/sc-bad.log" && ok "缺 role=img 被 self_check.py 检出" \
      || bad "self_check.py 失败但未点名 role：$(head -3 "$TMP/sc-bad.log" | tr '\n' ' ')"
  fi
else
  skipped "python3 不可用，上游 self_check.py 未实测（结构检查仍覆盖）"
fi

# ===== ③ diagram-check.sh 正反两态 =====
echo "③ diagram-check.sh 正反两态"
mk_good "$TMP/good.html"
if bash "$CHECK" "$TMP/good.html" > "$TMP/dc-good.log" 2>&1; then
  ok "好图通过结构自检"
else
  bad "好图未通过结构自检：$(tail -3 "$TMP/dc-good.log" | tr '\n' ' ')"
fi

mk_good "$TMP/no-role.html"; sed -i.bak 's/ role="img"//' "$TMP/no-role.html"; rm -f "$TMP/no-role.html.bak"
if bash "$CHECK" "$TMP/no-role.html" > "$TMP/dc-role.log" 2>&1; then
  bad "缺 role=img 被结构自检放行"
else
  grep -q 'role' "$TMP/dc-role.log" && ok "缺 role=img 被结构自检检出" || bad "结构自检失败但未点名 role"
fi

mk_good "$TMP/remote.html"
sed -i.bak 's|<rect|<script src="https://evil.example/x.js"></script><rect|' "$TMP/remote.html"; rm -f "$TMP/remote.html.bak"
if bash "$CHECK" "$TMP/remote.html" > "$TMP/dc-remote.log" 2>&1; then
  bad "外链脚本被结构自检放行"
else
  grep -qE '远程资源|script' "$TMP/dc-remote.log" && ok "外链脚本被结构自检检出" || bad "外链脚本失败但未点名"
fi

mk_good "$TMP/no-minw.html"; sed -i.bak '/min-width/d' "$TMP/no-minw.html"; rm -f "$TMP/no-minw.html.bak"
if bash "$CHECK" "$TMP/no-minw.html" > "$TMP/dc-minw.log" 2>&1; then
  bad "缺 min-width 被结构自检放行"
else
  grep -q 'min-width' "$TMP/dc-minw.log" && ok "缺 min-width 被结构自检检出" || bad "缺 min-width 失败但未点名"
fi

mk_good "$TMP/mismatch.html"; sed -i.bak 's/min-width:960px/min-width:800px/' "$TMP/mismatch.html"; rm -f "$TMP/mismatch.html.bak"
if bash "$CHECK" "$TMP/mismatch.html" > "$TMP/dc-mismatch.log" 2>&1; then
  grep -q '不一致' "$TMP/dc-mismatch.log" && ok "min-width 不一致按 advisory 提示且不阻断" \
    || bad "min-width 不一致未给提示"
else
  bad "min-width 不一致被误判为阻断（上游历史示例同形态）"
fi

# 默认发现目录
mkdir -p "$TMP/proj/docs/diagrams"
mk_good "$TMP/proj/docs/diagrams/flow.html"
if PROJECT_DIR="$TMP/proj" bash "$CHECK" --all > "$TMP/dc-discover.log" 2>&1; then
  grep -q '检查 1 个文件' "$TMP/dc-discover.log" && ok "默认发现 docs/diagrams" \
    || bad "默认发现目录未找到图表"
else
  bad "默认发现目录检查失败"
fi

# ===== ④ precheck.sh --diagram 三态 =====
echo "④ precheck.sh --diagram 三态"
SKILLCOPY="$TMP/skill"
mkdir -p "$SKILLCOPY"
cp -R "$BASE/assets" "$BASE/scripts" "$BASE/references" "$SKILLCOPY/" 2>/dev/null
cp "$BASE/SKILL.md" "$SKILLCOPY/" 2>/dev/null
PROJ="$TMP/gate-proj"
mkdir -p "$PROJ/docs/diagrams"
# 用真实 conf 跑真实执行序列；只改 PROJECT_DIR。
if [ -f "$SKILLCOPY/assets/precheck.conf" ]; then
  sed "s|^PROJECT_DIR=.*|PROJECT_DIR=\"$PROJ\"       # R122 test|" \
    "$SKILLCOPY/assets/precheck.conf" > "$SKILLCOPY/assets/precheck.conf.t" \
    && mv "$SKILLCOPY/assets/precheck.conf.t" "$SKILLCOPY/assets/precheck.conf"
  mk_good "$PROJ/docs/diagrams/flow.html"
  if bash "$SKILLCOPY/assets/precheck.sh" --diagram > "$TMP/gate-good.log" 2>&1; then
    grep -q '图表结构自检通过' "$TMP/gate-good.log" && ok "好图：--diagram 通过" \
      || bad "好图：--diagram 未输出通过"
  else
    bad "好图：--diagram 被阻断"
  fi
  sed 's/ role="img"//' "$PROJ/docs/diagrams/flow.html" > "$PROJ/docs/diagrams/bad.html"
  rm -f "$PROJ/docs/diagrams/flow.html"
  if bash "$SKILLCOPY/assets/precheck.sh" --diagram > "$TMP/gate-bad.log" 2>&1; then
    bad "坏图：--diagram 未阻断"
  else
    grep -q '图表结构自检发现违例' "$TMP/gate-bad.log" && ok "坏图：--diagram 阻断并点名" \
      || bad "坏图：--diagram 失败但未点名"
  fi
  rm -f "$PROJ/docs/diagrams/bad.html"
  if bash "$SKILLCOPY/assets/precheck.sh" --diagram > "$TMP/gate-empty.log" 2>&1; then
    grep -q '未发现图表产物' "$TMP/gate-empty.log" && ok "无图：--diagram 给指引并通过" \
      || bad "无图：--diagram 未给指引"
  else
    bad "无图：--diagram 误阻断"
  fi
  bash "$SKILLCOPY/assets/precheck.sh" --list-gates > "$TMP/gate-list.log" 2>&1
  grep -q 'check_diagram.*warn' "$TMP/gate-list.log" && ok "enforce 分层：check_diagram=warn" \
    || bad "enforce 分层：check_diagram 未显示 warn"
else
  bad "precheck.conf 缺失，门禁三态未测"
fi

# ===== ⑤ enforce 分层可逐字节再生 =====
echo "⑤ enforce 分层可逐字节再生"
if [ -f "$BASE/assets/gate-enforce-level.conf" ] && [ -f "$BASE/scripts/gen-enforce-level.sh" ]; then
  cp "$BASE/assets/gate-enforce-level.conf" "$TMP/enforce-before.conf"
  if bash "$BASE/scripts/gen-enforce-level.sh" > "$TMP/enforce-gen.log" 2>&1 \
     && cmp -s "$TMP/enforce-before.conf" "$BASE/assets/gate-enforce-level.conf"; then
    ok "gate-enforce-level.conf 可逐字节再生"
  else
    bad "gate-enforce-level.conf 再生后不一致：$(tail -2 "$TMP/enforce-gen.log" | tr '\n' ' ')"
  fi
  grep -q '^check_diagram=warn$' "$BASE/assets/gate-enforce-level.conf" \
    && ok "静态 conf 的 check_diagram=warn" || bad "静态 conf 的 check_diagram 不是 warn"
else
  bad "gate-enforce-level.conf 或生成器缺失"
fi

# ===== ⑥ 文档注册与口径 =====
echo "⑥ 文档注册与口径"
grep -q '^FACT_RUNTIMES=15' "$BASE/assets/facts.conf" && ok "facts FACT_RUNTIMES=15" || bad "FACT_RUNTIMES≠15"
grep -q '^FACT_RUNTIMES_CLI=6' "$BASE/assets/facts.conf" && ok "facts FACT_RUNTIMES_CLI=6" || bad "FACT_RUNTIMES_CLI≠6"
grep -q '^FACT_REFERENCES=57' "$BASE/assets/facts.conf" && ok "facts FACT_REFERENCES=57" || bad "FACT_REFERENCES≠57"
grep -q '^FACT_DIAGRAM_DESIGN_VERSION=2.6.120' "$BASE/assets/facts.conf" \
  && ok "facts FACT_DIAGRAM_DESIGN_VERSION=2.6.120" || bad "FACT_DIAGRAM_DESIGN_VERSION 漂移"

# R141 第五锚面：diagram-production-methodology.md 头部物化基线行须与 facts 对账
# （R141 实抓漏同步：四处已改此档漏改，test-doc-numbers 对其豁免、机器测不出——补锁）
grep -q "plugin 2\.6\.120" "$BASE/references/diagram-production-methodology.md" \
  && ok "methodology 物化基线行 2.6.120 与 facts 对账" \
  || bad "diagram-production-methodology.md 物化基线行漂移（第五锚面）"
grep -q '^FACT_DIAGRAM_DESIGN_TYPES=45' "$BASE/assets/facts.conf" \
  && ok "facts FACT_DIAGRAM_DESIGN_TYPES=45" || bad "FACT_DIAGRAM_DESIGN_TYPES 漂移"
grep -q 'diagram-production-methodology' "$BASE/references/capability-map.md" \
  && ok "能力地图登记 diagram-production-methodology" || bad "能力地图未登记新档"
grep -q 'diagram-design' "$BASE/references/capability-map.md" \
  && ok "能力地图登记 diagram-design 运行时" || bad "能力地图未登记运行时"
grep -q 'diagram-production-methodology' "$BASE/references/task-methodology-router.md" \
  && grep -q '【生成器侧】' "$BASE/references/task-methodology-router.md" \
  && ok "任务路由登记新档并标注【生成器侧】" || bad "任务路由未登记或未标注"
grep -q '"scripts/diagram-check.sh|gen|lite"' "$BASE/scripts/generate-skill.sh" \
  && ok "UNIVERSAL_FILES 随发 diagram-check.sh" || bad "UNIVERSAL_FILES 未随发检查脚本"
grep -q 'diagram-design' "$BASE/SKILL.md" \
  && ok "SKILL.md 外部运行时名单含 diagram-design" || bad "SKILL.md 未登记 diagram-design"

# ===== 汇总 =====
echo "PASS test-r122-diagram-capability (${pass} ok, ${fail} fail, ${skip} skip)"
[[ $fail -eq 0 ]]
