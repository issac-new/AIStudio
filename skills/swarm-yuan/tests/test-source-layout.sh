#!/usr/bin/env bash
# 单仓源码布局契约：验证资产只能由当前技能根与 AIStudio 仓根定位。
set -uo pipefail
SWARM_YUAN_HOME="$(cd "$(dirname "$0")/.." && pwd)"
SWARM_YUAN_SOURCE_ROOT="$(cd "$SWARM_YUAN_HOME/../.." && pwd)"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }
require_file() { # $1=资产相对技能根路径；开发面 CI 由单独断言覆盖。
  if [[ -f "$SWARM_YUAN_HOME/$1" ]]; then ok "$1 可达"; else bad "$1 缺失: $SWARM_YUAN_HOME/$1"; fi
}

if [[ "$SWARM_YUAN_HOME" == "$SWARM_YUAN_SOURCE_ROOT/skills/swarm-yuan" ]]; then
  ok 'SWARM_YUAN_HOME 指向 AIStudio 当前技能根'
else
  bad "技能根布局不符: HOME=$SWARM_YUAN_HOME SOURCE=$SWARM_YUAN_SOURCE_ROOT"
fi

# run-verifier all 的执行依赖、独立 A/B 工具与验收契约均须随源码可达。
for rel in \
  verifier/v1/run-verifier.sh \
  verifier/v1/run-one-fixture.sh \
  verifier/v1/cli-ab-test.sh \
  verifier/v1/gate-ab-diff.sh \
  verifier/v1/metrics-assert.sh \
  verifier/v1/metrics-baseline.txt \
  verifier/v1/golden-vector.txt \
  verifier/v1/core10-sequence.txt \
  verifier/v1/acceptance-criteria.md; do
  require_file "$rel"
done
# 超报告恢复的 verifier 顶层与 v2 资产同属验证面，缺件即布局回退。
for rel in \
  verifier/README.md \
  verifier/capture-baseline.sh \
  verifier/v2/run-v2.sh \
  verifier/v2/external-validity.md; do
  require_file "$rel"
done
for script in "$SWARM_YUAN_HOME"/verifier/*.sh \
              "$SWARM_YUAN_HOME"/verifier/v1/*.sh \
              "$SWARM_YUAN_HOME"/verifier/v2/*.sh; do
  [[ -f "$script" ]] || continue
  if bash -n "$script"; then ok "$(basename "$script") 语法可读"; else bad "$(basename "$script") 语法错误"; fi
done

# 汇编六卷正本：README / 决策史 / 上游台账 / 使用手册 / facts / 吸收清单。
for rel in \
  README.md \
  docs/design-evolution.md \
  docs/upstream-baseline.md \
  docs/usage-manual.md \
  assets/facts.conf \
  references/capability-map.md \
  docs/design-compendium.md \
  docs/design-compendium-full.md; do
  require_file "$rel"
done

# 隐藏目录中的 gate fixture 输入同样是测试资产，缺件会改变预期输出。
for rel in \
  tests/gate-fixtures/cognition/compliant/.swarm-yuan/notes/cognition.md \
  tests/gate-fixtures/knowledge/compliant/.claude/skills/demo/SKILL.md \
  tests/gate-fixtures/knowledge/compliant-advisory-observe/.claude/skills/demo/SKILL.md \
  tests/gate-fixtures/knowledge/compliant-mem-double/.claude/skills/demo/SKILL.md \
  tests/gate-fixtures/knowledge/compliant-no-mem-cli/.claude/skills/demo/SKILL.md \
  tests/gate-fixtures/skill-supply-chain/compliant/.claude/skills/demo/SKILL.md \
  tests/gate-fixtures/skill-supply-chain/compliant/.claude/skills/demo/UPSTREAM.md \
  tests/gate-fixtures/skill-supply-chain/compliant-warn-suspicious/.claude/skills/bad/SKILL.md; do
  require_file "$rel"
done

# 本地全量入口、测试注册表、命令与贡献/宿主说明均属于开发源码交付面。
for rel in \
  tests/run.sh \
  tests/run-sweep.sh \
  tests/index.tsv \
  .claude/commands/swarm-yuan.md \
  .gitattributes \
  CLAUDE.md \
  CONTRIBUTING.md; do
  require_file "$rel"
done

CI="$SWARM_YUAN_SOURCE_ROOT/.github/workflows/swarm-yuan.yml"
if [[ -f "$CI" ]]; then
  ok 'AIStudio 仓级 swarm-yuan workflow 可达'
  if [[ "$(grep -c 'bash skills/swarm-yuan/tests/run-sweep.sh' "$CI")" -eq 1 ]]; then
    ok 'CI 与本地共用唯一全量入口 run-sweep.sh'
  else
    bad 'CI 必须且只能调用一次 skills/swarm-yuan/tests/run-sweep.sh 全量入口'
  fi
else
  bad "CI workflow 缺失: $CI"
fi

# 用 git 自身解析属性，防止只恢复文件名却没有生效中的 LF/CRLF 规则。
attrs="$(git -C "$SWARM_YUAN_SOURCE_ROOT" check-attr text eol -- \
  skills/swarm-yuan/install.sh skills/swarm-yuan/install.bat 2>/dev/null)"
if printf '%s\n' "$attrs" | grep -q 'skills/swarm-yuan/install.sh: eol: lf'; then
  ok 'Shell 脚本 LF 规则经 git check-attr 生效'
else
  bad "Shell 脚本 LF 规则未生效: $attrs"
fi
if printf '%s\n' "$attrs" | grep -q 'skills/swarm-yuan/install.bat: eol: crlf'; then
  ok '批处理 CRLF 规则经 git check-attr 生效'
else
  bad "批处理 CRLF 规则未生效: $attrs"
fi

printf 'test-source-layout: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
