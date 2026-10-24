#!/usr/bin/env bash
# test-r75-full-regression.sh — R75 全量回归轮防复发锁
#
# 背景（r75-drill-tasks-api NestJS 执勤实证）：
#   D1 detect-frameworks 死信号——nestjs|@nestjs|pkgjson 与 antd|@ant-design|pkgjson 是
#   scope 前缀形态（含 @ 不含 /），落入 grep -qxF 整行精确匹配分支，依赖桶里是
#   @nestjs/common 等完整包名，永不命中（"规则集在册≠链路可达"第九现）：nestjs 8 条门禁
#   从未注入、ACTIVE_FRAMEWORKS 错配 express、framework-knowledge 缺 nestjs 节。
#   D2 check_deps 版本对比是剥前缀后的字面字符串比较，semver 等价写法 ^5.7 vs ^5.7.0
#   假阳性 fail（数字段缺省不参与比较）。
#   D3 mark-active 六关不校验 SPEC_REQUIRED=1 但 WRITABLE_DIRS=() 的联动——骨架 conf
#   WRITABLE_DIRS=()  # TODO:model 漏配时 spec-first 前置门整链静默空转。
#   D4 DIM 枚举器 NestJS 形态缺位——端点恒 0（@Get( 裸动词族）、controller 恒 0
#   （@Controller(）、异步消费者恒 0（@EventPattern(/@MessagePattern()，勾稽失效。
# 本锁：行为锁（fixture 实跑断言）+ 源码锁（修复形态在位），任一被拆即红。
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# ---- fixture：最小 NestJS 项目（@nestjs/core 依赖 + 装饰器源码）----
FX=$(mktemp -d "${TMPDIR:-/tmp}/r75-fixture.XXXXXX")
trap 'rm -rf "$FX"' EXIT
mkdir -p "$FX/src/tasks"
cat > "$FX/package.json" <<'EOF'
{
  "name": "fixture",
  "dependencies": {
    "@nestjs/core": "^11.0.0",
    "@nestjs/common": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "typeorm": "^0.3.20",
    "express": "^5.0.0"
  }
}
EOF
cat > "$FX/src/tasks/tasks.controller.ts" <<'EOF'
import { Controller, Get, Post } from '@nestjs/common';

@Controller('tasks')
export class TasksController {
  @Get()
  findAll() { return []; }

  @Post()
  create() { return {}; }
}
EOF
cat > "$FX/src/tasks/tasks.service.ts" <<'EOF'
import { Injectable } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';

@Injectable()
export class TasksService {
  findAll() { return []; }
}
EOF
# antd 死信号同族 fixture
FX2=$(mktemp -d "${TMPDIR:-/tmp}/r75-fixture2.XXXXXX")
trap 'rm -rf "$FX" "$FX2"' EXIT
mkdir -p "$FX2"
cat > "$FX2/package.json" <<'EOF'
{
  "name": "fixture2",
  "dependencies": {
    "@ant-design/icons": "^6.0.0",
    "react": "^19.0.0"
  }
}
EOF

# ---- L1 行为锁：detect-frameworks 命中 nestjs（D1 核心）----
det=$(bash scripts/detect-frameworks.sh "$FX" 2>/dev/null)
printf '%s' "$det" | grep -qw "nestjs" && ok "L1 detect-frameworks 命中 nestjs（@nestjs/core 信号）" || bad "L1 detect-frameworks 未命中 nestjs：$det"

# ---- L1b 行为锁：@ant-design/icons 命中 antd（同族）----
det2=$(bash scripts/detect-frameworks.sh "$FX2" 2>/dev/null)
printf '%s' "$det2" | grep -qw "antd" && ok "L1b @ant-design/icons 命中 antd（同族死信号已修）" || bad "L1b @ant-design/icons 未命中 antd：$det2"

# ---- L2 源码锁：信号表禁入 scope 前缀形态（含 @ 不含 / 的 pkgjson 信号）----
dead=$(grep -E '^[a-z0-9-]+\|@[^|/]+\|pkgjson' scripts/detect-frameworks.sh | grep -vc '^#' || true)
[[ "$dead" -eq 0 ]] && ok "L2 信号表无 scope 前缀死形态（禁入锁）" || bad "L2 信号表仍有 $dead 条 scope 前缀死形态"

# ---- L3 源码锁：scope 前缀匹配防御分支在位 ----
if grep -qF '[[ "$pattern" =~ ^@[^/]+$ ]]' scripts/detect-frameworks.sh; then
  ok "L3 scope 前缀防御分支在位"
else
  bad "L3 scope 前缀防御分支缺失"
fi

# ---- L4 行为锁：_norm_ver semver 等价归一（D2）----
NV=$(mktemp "${TMPDIR:-/tmp}/r75-nv.XXXXXX")
trap 'rm -rf "$FX" "$FX2" "$FX3" "$NV"' EXIT
awk '/^_norm_ver\(\)/,/^}/' assets/gates-warn.sh > "$NV"
a=$(bash -c "source '$NV'; _norm_ver '^5.7'" 2>/dev/null)
b=$(bash -c "source '$NV'; _norm_ver '^5.7.0'" 2>/dev/null)
[[ -n "$a" && "$a" == "$b" ]] && ok "L4 _norm_ver 等价归一（^5.7 ≡ ^5.7.0 → ${a}）" || bad "L4 _norm_ver 归一失败（a=${a} b=${b}）"
c=$(bash -c "source '$NV'; _norm_ver '^0.3.20'" 2>/dev/null)
[[ "$a" != "$c" ]] && ok "L4b _norm_ver 真差异保留（${a} ≠ ${c}）" || bad "L4b 归一过度（0.3 与 0.3.20 被判等价）"

# ---- L5 源码锁：D2 注释锚在位（防归一逻辑被静默回退）----
grep -q '原实现只剥 range 前缀后做字面字符串比较' assets/gates-warn.sh && ok "L5 R75-D2 修复锚在位" || bad "L5 R75-D2 修复锚丢失"
grep -qF 'OFS=.' assets/gates-warn.sh && ok "L5b OFS=. 显式设置在位（BSD awk 字段重建防线）" || bad "L5b OFS=. 缺失"

# ---- L6 源码锁：mark-active spec-first 联动校验（D3）----
grep -q 'check_spec_first_wiring' scripts/generate-skill.sh && ok "L6 spec-first 联动校验函数在位" || bad "L6 联动校验缺失"
grep -q 'WRITABLE_DIRS 为空——spec-first 前置门在运行时将静默放行' scripts/generate-skill.sh && ok "L6b 联动 fail 提示语义在位" || bad "L6b fail 提示缺失"

# ---- L7 行为锁：mark-active 拦 WRITABLE_DIRS 空 fixture（D3 行为面）----
FX3=$(mktemp -d "${TMPDIR:-/tmp}/r75-fixture3.XXXXXX")
trap 'rm -rf "$FX" "$FX2" "$FX3"' EXIT
mkdir -p "$FX3/scripts"
cat > "$FX3/SKILL.md" <<'EOF'
---
name: r75-lock-fixture
description: fixture
status: draft
---
# fixture
EOF
cat > "$FX3/scripts/precheck.conf" <<'EOF'
PROJECT_DIR=/nonexistent
ACTIVE_FRAMEWORKS=("express")
EXPRESS_SRC_GLOBS=("src/**/*.ts")  # filled
SPEC_REQUIRED="${SPEC_REQUIRED:-1}"
WRITABLE_DIRS=()
EOF
out=$(bash scripts/generate-skill.sh --mark-active "$FX3" 2>&1 || true)
printf '%s' "$out" | grep -q 'spec-first 联动检查失败' && ok "L7 mark-active 拦 WRITABLE_DIRS 空（SPEC_REQUIRED=1）" || bad "L7 mark-active 未拦：$out" 

# ---- L8 源码锁：DIM 枚举器 NestJS 形态（D4）----
grep -qF '@(Get|Post|Put|Delete|Patch|All|Head|Options)' assets/inventory-dimensions.conf && ok "L8 DIM 端点裸动词装饰器族在位" || bad "L8 端点 NestJS 形态缺失"
grep -qF '@Controller\\(' assets/inventory-dimensions.conf && ok "L8b DIM controller @Controller( 在位" || bad "L8b @Controller( 形态缺失"
grep -qF '@(EventPattern|MessagePattern)\\(' assets/inventory-dimensions.conf && ok "L8c DIM 异步消费者 NestJS 微服务形态在位" || bad "L8c 微服务形态缺失"

# ---- L9 行为锁：DIM 端点枚举对 NestJS fixture > 0（D4 行为面）----
iv=$(bash scripts/inventory-verify.sh "$FX" --tsv 2>/dev/null || true)
ep=$(printf '%s' "$iv" | grep "^接口端点" | cut -d$'\t' -f2 | head -1)
[[ -n "$ep" && "$ep" -gt 0 ]] && ok "L9 DIM 端点枚举 NestJS fixture 命中 ${ep}" || bad "L9 DIM 端点枚举 0（NestJS 形态失效，ep=${ep}）"

# ---- L10 D0 同族：发版三面 badge 同步（决策 38 机器锚——badge 与 CHANGELOG 头版一致）----
# 本测试在仓库根跑（run-sweep cd 到 swarm-yuan 上级），badge 取根 README / 技能 README / CHANGELOG 首版
_repo_root="$(cd .. && pwd)"
_root_badge=$(grep -oE 'release-v[0-9]+\.[0-9]+\.[0-9]+' "$_repo_root/README.md" 2>/dev/null | head -1 | sed 's/release-v//')
_skill_badge=$(grep -oE 'release-v[0-9]+\.[0-9]+\.[0-9]+' "$_repo_root/swarm-yuan/README.md" 2>/dev/null | head -1 | sed 's/release-v//')
_changelog_head=$(grep -m1 -oE '^## \[v[0-9]+\.[0-9]+\.[0-9]+\]' "$_repo_root/CHANGELOG.md" 2>/dev/null | sed 's/## \[v//; s/\]//')
if [[ -n "$_root_badge" && -n "$_skill_badge" && -n "$_changelog_head" ]]; then
  if [[ "$_root_badge" == "$_skill_badge" && "$_skill_badge" == "$_changelog_head" ]]; then
    ok "L10 发版三面 badge 同步（${_root_badge}）"
  else
    bad "L10 badge 漂移：root=${_root_badge} skill=${_skill_badge} changelog=${_changelog_head}（D0 同族）"
  fi
else
  ok "L10 badge 文件不全，跳过（root=${_root_badge} skill=${_skill_badge} cl=${_changelog_head}）"
fi

echo "—— r75 防复发锁：$pass 通过 / $fail 失败 ——"
[[ $fail -eq 0 ]] || exit 1
