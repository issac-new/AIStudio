#!/usr/bin/env bash
# test-r60-django-drill-locks.sh — R60 Django 换栈演练修复的变异锁打包
#
# 演练实弹打出 A1-A11（16 类字符串耦合盲面产品化进 frameworks/django.md），本文件锁可机器化修复面：
#   L1 A1  relations-extract 排除链含 Python 噪音目录（.venv/venv/__pycache__/.tox）——行为锁
#   L2 A7  维度注册表排除链含 .venv 族 + controller 正则词尾边界（router.allow_migrate 假阳性）——源码锁
#   L3 A3  check_layer 分层门禁认 Python 无引号 import 形态——源码锁
#   L4 A2  conf-render uv 分支不默认 uv run build（该命令改写 venv 违反版本锁定）——源码锁
#   L5 A4  django secret_key 测试夹具豁免在位——源码锁
#   L6 A5  django DEBUG 元组形态识别在位——源码锁
#   L7 A10 稳定性同名测试匹配含 Python 惯例族（test_ 前缀/测试目录）——源码锁
#   L8 耦合面清单产品化（frameworks/django.md 十六类 + 探查/spec 指针）——文本锁
#
# 用法: bash tests/test-r60-django-drill-locks.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r60.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- L1 行为锁：.venv 噪音边不入边集 ---
mkdir -p "$TMP/p/app" "$TMP/p/.venv/lib/xx"
printf 'from . import b\n' > "$TMP/p/app/a.py"
printf 'x=1\n' > "$TMP/p/app/b.py"
printf 'import json\n' > "$TMP/p/.venv/lib/xx/noise.py"
bash scripts/relations-extract.sh "$TMP/p" --out "$TMP/rel.jsonl" >/dev/null 2>&1
if [[ -f "$TMP/rel.jsonl" ]] && ! grep -q '.venv' "$TMP/rel.jsonl"; then
  ok "L1 A1 .venv 噪音边被排除（行为锁）"
else
  bad "L1 边集含 .venv 噪音（A1 回归）"
fi

# --- L2 A7 源码锁 ---
if grep -q -- '--exclude-dir=.venv' assets/inventory-dimensions.conf \
   && grep -qF '(get|post|put|delete|patch|use|all)([^a-zA-Z0-9_]|$)' assets/inventory-dimensions.conf; then
  ok "L2 A7 维度排除链+词尾边界在位"
else
  bad "L2 inventory-dimensions 缺 .venv 排除/词边界（A7 回归）"
fi

# --- L3 A3 源码锁（匹配 gates-strict.sh 内字面 pattern 文本）---
if grep -qF 'import ['"'"'\"]?${ffi}' assets/gates-strict.sh; then
  ok "L3 A3 分层门禁 Python 无引号 import 形态在位"
else
  bad "L3 gates-strict 丢了 Python import 形态（A3 回归）"
fi

# --- L4 A2 源码锁（只锁赋值形态，注释里的历史命令名不算）---
if grep -qF '_build="uv run build"' scripts/conf-render.sh; then
  bad "L4 uv run build 默认回归（A2：改写 venv 违反版本锁定）"
else
  ok "L4 A2 uv 嗅探非改写口径在位"
fi

# --- L5 A4 源码锁 ---
if grep -q '测试夹具豁免' assets/framework-gates/django.sh; then
  ok "L5 A4 测试夹具豁免在位"
else
  bad "L5 django.sh 丢了 secret_key 测试豁免（A4 回归）"
fi

# --- L6 A5 源码锁（grep -E 可选左括号形态）---
if grep -qF '\(?[[:space:]]*True' assets/framework-gates/django.sh; then
  ok "L6 A5 DEBUG 元组形态在位"
else
  bad "L6 django.sh DEBUG 正则缺元组形态（A5 回归）"
fi

# --- L7 A10 源码锁 ---
if grep -qF 'test_${_base}' scripts/inventory-verify.sh; then
  ok "L7 A10 同名测试 Python 惯例族在位"
else
  bad "L7 inventory-verify 丢了 test_ 前缀族（A10 回归）"
fi

# --- L8 文本锁 ---
if grep -q '字符串耦合面清单' references/frameworks/django.md && grep -q '十六类' references/frameworks/django.md; then
  ok "L8 耦合面十六类清单在位（django.md）"
else
  bad "L8 frameworks/django.md 缺耦合面清单（R60 回归）"
fi
if grep -q '字符串耦合面' references/exploration-guide.md && grep -q '等价耦合面清单' assets/spec-template.md; then
  ok "L8 探查指针+spec 四查① 指针在位"
else
  bad "L8 探查/spec 指针丢失（R60 回归）"
fi

# --- L9 A6 枚举器 Django 形态在位（R61 补缺）---
if grep -qF "path\\\\(|re_path\\\\(" assets/inventory-dimensions.conf && grep -q "models.py" assets/inventory-dimensions.conf; then
  ok "L9 A6 DIM 枚举器 Django 形态在位"
else
  bad "L9 inventory-dimensions 缺 Django 形态（A6 回归）"
fi

# --- L10 A8 makemigrations --check 真整合（R61 补缺：提示≠实跑；锚词随 R78 黑话替换联改）---
if grep -q "makemigrations --check --dry-run" assets/framework-gates/django.sh && grep -q "增量漂移真判" assets/framework-gates/django.sh; then
  ok "L10 A8 迁移增量判别已实跑整合"
else
  bad "L10 django.sh 退回只提示不实跑（A8 回归）"
fi

echo "PASS test-r60-django-drill-locks (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
