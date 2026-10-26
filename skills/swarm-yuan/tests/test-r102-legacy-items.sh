#!/usr/bin/env bash
# test-r102-legacy-items.sh — R101 留待后续三项的守门测试
# 覆盖：①hooks.json 嵌套 schema 锁（扁平形态被 Claude Code 2.1.295 静默丢弃的防复发）
#      ②dotnet csproj 兜底软链布局回归锁（find 不穿链失明修复）
#      ③check_bootstrap_gate 三分支行为锁（repo 缺 ci.yml=FAIL / 部署副本=⊘ skip / 齐全=pass）
#      ④install 分发边界（ci/ 不入安装产物）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }
TMP="$(mktemp -d /tmp/r102.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# ===== ① hooks.json 嵌套 schema 锁 =====
# 从生成器提取模板 heredoc（与 gen-e2e 产物同源；扁平形态 Claude Code 静默丢弃=整链死代码）
sed -n '/_write_if_absent "\$SKILL_DIR\/hooks\/hooks.json" <<.HEOF./,/^HEOF$/p' scripts/generate-skill.sh \
  | sed '1d;$d' > "$TMP/hooks.json"
python3 - "$TMP/hooks.json" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
errs = []
for event, entries in d["hooks"].items():
    for i, e in enumerate(entries):
        if "command" in e:
            errs.append(f"{event}[{i}] 扁平形态（command 平级）")
        hs = e.get("hooks")
        if not isinstance(hs, list) or not hs:
            errs.append(f"{event}[{i}] 缺 hooks 数组")
            continue
        for h in hs:
            if h.get("type") != "command" or "command" not in h:
                errs.append(f"{event}[{i}] hook 元素非 command 判别形态")
if errs:
    print("SCHEMA_BAD: " + "; ".join(errs)); sys.exit(1)
print("SCHEMA_OK: %d 事件全部嵌套形态" % len(d["hooks"]))
PYEOF
[[ $? -eq 0 ]] && ok "1a 生成物 hooks.json 嵌套 schema（防扁平回退）" || bad "1a hooks.json schema 锁失败"
# 1b 模板内不得再出现扁平形态（mutation：平级 command 与 matcher 相邻）
if grep -qE '\{"matcher": "[^"]*", "command":' scripts/generate-skill.sh; then
  bad "1b 生成器含扁平 matcher/command 形态残留"
else
  ok "1b 生成器零扁平形态残留"
fi
# 1c zcode/codex 适配器 hooks.json 同为嵌套（三宿主 schema 一致锁）
grep -q '"hooks": \[{"type": "command"' assets/tool-adapters/zcode.sh && ok "1c zcode 适配器嵌套形态" || bad "1c zcode 非嵌套"
grep -q '"type": "command"' assets/tool-adapters/codex.sh && ok "1c2 codex 适配器嵌套形态" || bad "1c2 codex 非嵌套"

# ===== ② dotnet csproj 兜底软链布局回归锁 =====
# 构造与真实部署同构的软链布局（fixture conf 的 __REPO_ROOT__/swarm-yuan/ 路径段依赖——
# 目录名必须叫 swarm-yuan，物理/软链两侧同名）
# （cwd 已是 swarm-yuan/ 根——拷贝自身）
mkdir -p "$TMP/repo"
cp -R . "$TMP/repo/swarm-yuan"
mkdir -p "$TMP/parent"
ln -s "$TMP/repo/swarm-yuan" "$TMP/parent/swarm-yuan"
out=$(cd "$TMP/parent/swarm-yuan" && bash tests/run-framework-fixture.sh dotnet 2>&1)
if printf '%s' "$out" | grep -q '✓ compliant → PASS'; then
  ok "2a 软链布局 dotnet 双态通过（失明修复）"
else
  bad "2a 软链布局 dotnet 失败: $out"
fi
out2=$(cd "$TMP/repo/swarm-yuan" && bash tests/run-framework-fixture.sh dotnet 2>&1)
if printf '%s' "$out2" | grep -q '✓ compliant → PASS'; then
  ok "2b 物理布局 dotnet 双态通过（语义未回退）"
else
  bad "2b 物理布局 dotnet 失败: $out2"
fi
# 2c 语料隔离：violating 侧无 csproj 时必须仍告警（防兜底过宽把违规语料洗绿）
if printf '%s' "$out" | grep -q '✓ violating → 检出'; then
  ok "2c violating 侧仍检出（隔离未破坏）"
else
  bad "2c violating 侧漏检"
fi

# ===== ③ check_bootstrap_gate 三分支行为锁（抽函数测） =====
sed -n '/^check_bootstrap_gate()/,/^}/p' scripts/self-check.sh \
  | sed 's|base="$(cd "$(dirname "$0")/.." \&\& pwd)"|base="${TEST_BASE:?}"|' > "$TMP/gate_fn.sh"
grep -q 'TEST_BASE' "$TMP/gate_fn.sh" || bad "抽函数 base 注入失败（$0 锚定未替换）"
run_gate() { # $1=base 布局目录 → stdout=输出；exit 码=FAIL 状态（命令替换会吞 rc，须 $? 捕获）
  (
    export TEST_BASE="$1"
    warn() { echo "  WARN: $1"; FAIL=1; }
    FAIL=0
    # shellcheck disable=SC1091
    . "$TMP/gate_fn.sh"
    check_bootstrap_gate
    exit "$FAIL"
  )
}
# 3a 单仓源码布局缺 swarm-yuan.yml → warn + FAIL
# 布局：skills/swarm/ci/self-precheck.conf 与技能内 verifier/ 在，仓根无 .github/swarm-yuan.yml
B1P="$TMP/g1p"; mkdir -p "$B1P/skills/swarm/ci" "$B1P/skills/swarm/verifier"
printf 'SPEC_FILE="x"\n' > "$B1P/skills/swarm/ci/self-precheck.conf"
out=$(run_gate "$B1P/skills/swarm" 2>&1); rc=$?
[[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q 'CI workflow 不存在' && ok "3a repo 布局缺 swarm-yuan.yml → warn+FAIL" || bad "3a 分支行为异常: $out (rc=$rc)"
# 3b 部署副本布局（技能内无 verifier/）→ ⊘ skip 且不 FAIL
B2P="$TMP/g2p"; mkdir -p "$B2P/skills/swarm/ci"; printf 'SPEC_FILE="x"\n' > "$B2P/skills/swarm/ci/self-precheck.conf"
out=$(run_gate "$B2P/skills/swarm" 2>&1); rc=$?
[[ $rc -eq 0 ]] && printf '%s' "$out" | grep -q '⊘ SKIPPED（部署副本无 .github' && ok "3b 部署副本 → ⊘ skip 不 FAIL" || bad "3b 分支行为异常: $out (rc=$rc)"
# 3c 齐全（仓根 swarm-yuan.yml 含三档 step）→ pass 不 FAIL
B3P="$TMP/g3p"; mkdir -p "$B3P/skills/swarm/ci" "$B3P/skills/swarm/verifier" "$B3P/.github/workflows"
printf 'SPEC_FILE="x"\n' > "$B3P/skills/swarm/ci/self-precheck.conf"
cat > "$B3P/.github/workflows/swarm-yuan.yml" <<'YEOF'
- run: bash scripts/precheck.sh --all
- run: bash scripts/precheck.sh --all-full
- run: bash scripts/precheck.sh --compliance-suite
YEOF
out=$(run_gate "$B3P/skills/swarm" 2>&1); rc=$?
[[ $rc -eq 0 ]] && printf '%s' "$out" | grep -q 'CI 自举三档 step 齐全' && ok "3c 三档齐全 → pass" || bad "3c 分支行为异常: $out (rc=$rc)"

# ===== ④ install 分发边界 =====
grep -q 'research|\.swarm-yuan|offline-cache|ci|vendor-knowledge|dist)' install.sh && ok "4a ci/ 入 install 排除清单" || bad "4a ci/ 未排除"
grep -q '无 ci/ 目录与 .github/，静默跳过' scripts/self-check.sh && ok "4b G4 安装态跳过注释在位（假设已由排除兑现）" || bad "4b 注释丢失"

if [[ $FAIL -eq 0 ]]; then echo "test-r102-legacy-items: PASS"; else echo "test-r102-legacy-items: FAIL" >&2; fi
exit $FAIL
