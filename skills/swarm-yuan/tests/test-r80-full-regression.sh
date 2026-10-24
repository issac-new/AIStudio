#!/usr/bin/env bash
# test-r80-full-regression.sh — R80 全量回归轮防复发锁
#
# 背景（r80-drill-notes-hub Flask+SQLAlchemy+Vue3 monorepo 执勤实证）：
#   D1 conf-render poly 分支 Python 段硬编码裸 python3——R72-D3 的 venv 三级嗅探只落了
#   根级 Python 分支，前后端同仓形态（<dir>/requirements.txt + 另一 node 子目录）走
#   poly 分支漏嗅探：依赖装在 <dir>/.venv 时生成的 TEST_CMD 初值在无全局包机器上
#   check_test 必炸 ModuleNotFoundError（实测：系统 python3 连 flask_sqlalchemy 都
#   import 不了，AUTO:detected 标签整条假）。修：poly Python 段同款三级嗅探。
# 本锁：行为锁（fixture 实跑断言 TEST_CMD 解释器形态）+ 源码锁（poly 段嗅探形态在位），
# 任一被拆即红。
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# ---- fixture：前后端同仓 monorepo（backend/requirements.txt+.venv + frontend/package.json）----
FX=$(mktemp -d "${TMPDIR:-/tmp}/r80-fixture.XXXXXX")
trap 'rm -rf "$FX"' EXIT
mkdir -p "$FX/backend/notes_hub" "$FX/backend/tests" "$FX/frontend/src" "$FX/backend/.venv/bin"
cat > "$FX/backend/requirements.txt" <<'EOF'
flask>=3.0
flask-sqlalchemy>=3.1
pytest>=8.0
EOF
: > "$FX/backend/.venv/bin/python"          # venv 解释器占位（存在性即可，conf-render 只查 -x）
chmod +x "$FX/backend/.venv/bin/python"
cat > "$FX/frontend/package.json" <<'EOF'
{ "name": "frontend", "dependencies": { "vue": "^3.5.0" } }
EOF
touch "$FX/backend/notes_hub/__init__.py" "$FX/backend/tests/test_smoke.py"

# ---- 行为锁 1：poly 渲染 TEST_CMD 取 .venv/bin/python（裸 python3 变异即红）----
out="$(bash scripts/conf-render.sh "$FX" --profile standard 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "poly 渲染 exit 0" || bad "渲染 exit=$rc"
grep -q "TEST_CMD='(cd backend && .venv/bin/python -m pytest)'" <<<"$out" \
  && ok "TEST_CMD venv 三级嗅探命中 .venv/bin/python" \
  || bad "TEST_CMD 未取子目录 venv（D1 复发）：$(grep -m1 'TEST_CMD=' <<<"$out")"

# ---- 行为锁 2：venv 缺位时回退 python3（保底形态不被误改）----
FX2=$(mktemp -d "${TMPDIR:-/tmp}/r80-fixture2.XXXXXX")
mkdir -p "$FX2/backend" "$FX2/frontend/src"
cp "$FX/backend/requirements.txt" "$FX2/backend/"
cat > "$FX2/frontend/package.json" <<'EOF'
{ "name": "frontend", "dependencies": { "vue": "^3.5.0" } }
EOF
out2="$(bash scripts/conf-render.sh "$FX2" --profile standard 2>/dev/null)"; rc2=$?
[[ $rc2 -eq 0 ]] && ok "无 venv 渲染 exit 0" || bad "无 venv 渲染 exit=$rc2"
grep -q "TEST_CMD='(cd backend && python3 -m pytest)'" <<<"$out2" \
  && ok "无 venv 回退 python3 形态保持" \
  || bad "无 venv 回退形态破坏：$(grep -m1 'TEST_CMD=' <<<"$out2")"
rm -rf "$FX2"

# ---- 源码锁：poly 分支嗅探形态在位（.venv/bin/python 嗅探 + _py 拼接进 _t）----
grep -q 'poly 分支 Python 段' scripts/conf-render.sh \
  && ok "poly 段 R80-D1 修复注记在位" \
  || bad "poly 段修复注记丢失（同族溯源断裂）"
sed -n '/elif .*requirements.txt.*pyproject.toml/,/_tc=1; _b=/p' scripts/conf-render.sh | grep -q '\$PROJ/\$_d/.venv/bin/python' \
  && ok "poly 段子目录 venv 嗅探形态在位" \
  || bad "poly 段嗅探形态被拆（源码锁红）"

echo "=== R80 锁：${pass} 通过 / ${fail} 失败 ==="
[[ ${fail} -eq 0 ]]
