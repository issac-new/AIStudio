#!/usr/bin/env bash
# test-r72-full-regression.sh — R72 全量回归轮防复发锁
#
# 背景（r72-drill-library-api FastAPI 执勤实证）：
#   D2 排除链家族第三现——extract-feature-cards 全计数器 / inventory-verify fan-in /
#   DIM find 族 / precheck._scan_src / gates _sec_scan / drift+survey 只排 node_modules，
#   Python .venv 的 site-packages 全量入扫描面（backend_files 1510 vs 真实 17、
#   fan-in 896、测试文件 42 vs 真实 3）。
#   D3 TEST_CMD 嗅探用系统 python3 不认项目 .venv（碰巧装包才假通过）。
#   D6 mine-habits.sh 三处引用但未随技能分发（引用悬空）。
#   D1 generate-skill.sh 无 --help（误传旗标吐 bash 原生 ${2:?} 报错）。
# 本锁：行为锁（fixture 实跑断言）+ 源码锁（排除链形态在位），双层任一被拆即红。
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# ---- fixture：带 .venv 污染的最小 FastAPI 项目 ----
FX=$(mktemp -d "${TMPDIR:-/tmp}/r72-fixture.XXXXXX")
trap 'rm -rf "$FX"' EXIT
mkdir -p "$FX/app" "$FX/tests" "$FX/.venv/bin" "$FX/.venv/lib/python3.13/site-packages/fakepkg"
printf '#!/bin/sh\ntrue\n' > "$FX/.venv/bin/python"
chmod +x "$FX/.venv/bin/python"
cat > "$FX/app/main.py" <<'EOF'
from fastapi import APIRouter
router = APIRouter()

@router.get("/items")
def list_items():
    return []
EOF
cat > "$FX/pyproject.toml" <<'EOF'
[project]
name = "fixture"
dependencies = ["fastapi", "pytest"]
EOF
cat > "$FX/tests/test_main.py" <<'EOF'
def test_placeholder():
    assert True
EOF
cat > "$FX/.venv/lib/python3.13/site-packages/fakepkg/mod.py" <<'EOF'
router = None

@router.get("/fake")
def fake_handler():
    return None

def another_fake():
    return None
EOF
cat > "$FX/.venv/lib/python3.13/site-packages/fakepkg/test_fake.py" <<'EOF'
def test_fake():
    assert True
EOF

# ---- L1 行为锁：extract-feature-cards 排除 .venv ----
cards=$(bash scripts/extract-feature-cards.sh "$FX" 2>/dev/null)
bf=$(printf '%s' "$cards" | grep -o '"backend_files": [0-9]*' | grep -o '[0-9]*$')
re=$(printf '%s' "$cards" | grep -o '"rest": [0-9]*' | grep -o '[0-9]*$')
bu=$(printf '%s' "$cards" | grep -o '"backend_units": [0-9]*' | grep -o '[0-9]*$')
if [[ "${bf}" == "2" ]]; then ok "L1 特征卡 backend_files=2（app+tests 的 .py；.venv 的 2 个已排除）"
else bad "L1 backend_files=${bf}（应为 2——.venv 污染计数回潮则为 4）"; fi
if [[ "${re}" == "1" ]]; then ok "L1 特征卡 rest 端点=1（.venv 内 router.get 已排除）"
else bad "L1 rest=${re}（应为 1）"; fi
if [[ "${bu}" == "1" ]]; then ok "L1 特征卡 backend_units=1（test 路径被行过滤；fakepkg 已排除）"
else bad "L1 backend_units=${bu}（应为 1）"; fi

# ---- L2 行为锁：DIM_TESTFILES_CMD 枚举排除 .venv ----
PROJECT_DIR="$FX"
# shellcheck disable=SC1091
source assets/inventory-dimensions.conf 2>/dev/null || true
tf=$(eval "$DIM_TESTFILES_CMD" 2>/dev/null | grep -c . || true)
if [[ "${tf}" == "1" ]]; then ok "L2 DIM_TESTFILES 枚举=1（.venv 内 test_fake.py 已排除）"
else bad "L2 DIM_TESTFILES 枚举=${tf}（应为 1）"; fi

# ---- L5 行为锁：conf-render TEST_CMD 认项目 .venv ----
FX_OUT=$(mktemp -d "${TMPDIR:-/tmp}/r72-conf.XXXXXX")
trap 'rm -rf "$FX" "$FX_OUT"' EXIT
if bash scripts/conf-render.sh "$FX" --profile lite --out "$FX_OUT" >/dev/null 2>&1 \
   && grep -q "TEST_CMD='.venv/bin/python -m pytest'" "$FX_OUT/precheck.conf" 2>/dev/null; then
  ok "L5 conf-render TEST_CMD=.venv/bin/python -m pytest（项目解释器优先）"
else
  bad "L5 TEST_CMD 未嗅探到 .venv/bin/python（D3 回潮）"
fi

# ---- L6 行为锁：--help ----
if bash scripts/generate-skill.sh --help >/dev/null 2>&1; then
  ok "L6 generate-skill --help exit 0（D1 修复在位）"
else
  bad "L6 --help 非零退出"
fi

# ---- L3/L4/L7 源码锁：排除链与分发清单形态在位 ----
sc=$(grep -c 'exclude-dir=\.venv' scripts/inventory-verify.sh | tr -d ' ')
if [[ "${sc}" -ge 2 ]]; then ok "L3 inventory-verify fan-in 两处 grep 均含 .venv 排除"
else bad "L3 fan-in .venv 排除仅 ${sc} 处（应 ≥2——STABILITY_WARN 失真回潮）"; fi

for anchor in 'scripts/extract-feature-cards.sh:site-packages' \
              'assets/precheck.sh:exclude-dir=.venv' \
              'assets/gates-strict.sh:exclude-dir=.venv' \
              'assets/gates-warn.sh:exclude-dir=.venv' \
              'scripts/detect-profile-drift.sh:site-packages' \
              'scripts/profile-threshold-survey.sh:site-packages' \
              'scripts/conf-render.sh:venv/bin/python'; do
  f="${anchor%%:*}"; pat="${anchor#*:}"
  if grep -qF -- "$pat" "$f" 2>/dev/null; then ok "L4 源码锚在位: $f :: $pat"
  else bad "L4 源码锚丢失: $f :: $pat"; fi
done

# DIM 注册表 find 族四条命令的 venv 剪枝（TESTFILES/FRONTEND_UI/MAPPER_XML/ORM_SCHEMA）
for dim in DIM_TESTFILES_CMD DIM_FRONTEND_UI_CMD DIM_MAPPER_XML_CMD DIM_ORM_SCHEMA_CMD; do
  val=$(grep -m1 "^$dim=" assets/inventory-dimensions.conf || true)
  if printf '%s' "$val" | grep -q '*/.venv/\*'; then ok "L4 $dim 含 .venv 剪枝"
  else bad "L4 $dim 缺 .venv 剪枝"; fi
done

if grep -q '"scripts/mine-habits.sh|gen|lite"' scripts/generate-skill.sh; then
  ok "L7 mine-habits.sh 在 UNIVERSAL_FILES 分发清单（D6 防复发）"
else
  bad "L7 mine-habits.sh 分发条目丢失（dev-guide/exploration-guide 引用将悬空）"
fi

rm -rf "$FX_OUT"
echo "PASS test-r72-full-regression (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
