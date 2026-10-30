#!/bin/bash
# venv-packages-preflight.test.sh — venv 包面守门（run23 挂账④ 根治件配套）
# 五场景（违一即 FAIL）：
#   ①全包在位：解释器同目录布局（venv/bin/{hermes,python}）→ 零 fail 零退出。
#   ②缺包即红：清单中任一 import 失败 → fail 消息含缺席包名与补装指引。
#   ③wrapper 解释器解析：HERMES_BIN 为 exec 壳（SIM 快照 hermes-sim 形态，
#     同目录无 python）→ 从 exec 行提取 python，断言照常生效。
#   ④清单覆盖：MX_VENV_REQUIRED_PACKAGES 整体替换（自定义逗号清单生效）；
#     显式置空=断言禁用（跳过不红）。
#   ⑤解释器失联：HERMES_BIN 既无同目录 python 又非 exec 壳 → fail（跳过即无守门）。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0

FN_SRC="$(sed -n '/^preflight_venv_packages_assert()/,/^}/p' "$HERE/mux/mx-lib.sh")"
[[ -n "$FN_SRC" ]] || { echo "FAIL 提取 preflight_venv_packages_assert 失败"; exit 1; }

CTRL="$(mktemp -d /tmp/venv-preflight.XXXXXX)" || exit 1
trap 'rm -rf "$CTRL"' EXIT

# ── stub 外部面 ──
LOG_OUT="$CTRL/log.out"; FAIL_OUT="$CTRL/fail.out"; : > "$LOG_OUT"; : > "$FAIL_OUT"
log() { printf '%s\n' "$*" >> "$LOG_OUT"; }
fail() { printf '%s\n' "$*" >> "$FAIL_OUT"; }

# 可脚本化 python 桩：CTRL/missing.list 列出「import 失败」的模块名；
# 形态=脚本 + 同目录 python（场景①②④用同目录布局）
make_py_stub() { # <dir> <binname>
  mkdir -p "$1"
  cat > "$1/$2" <<'STUB'
#!/bin/bash
# 模拟 python -c "import <mod>"：missing.list 中列名的模块退出 1
mod=""
args=()
for a in "$@"; do args+=("$a"); done
# 取 -c 后的参数（形如 import <mod>）
prev=""
for a in "${args[@]}"; do
  if [[ "$prev" == "-c" ]]; then mod="${a#import }"; break; fi
  prev="$a"
done
if [[ -n "$mod" ]] && grep -qxF "$mod" "$(dirname "$0")/missing.list" 2>/dev/null; then
  echo "ModuleNotFoundError: No module named '$mod'" >&2
  exit 1
fi
exit 0
STUB
  chmod +x "$1/$2"
  : > "$1/missing.list"
}

eval "$FN_SRC"

# ── ① 全包在位（同目录布局）→ 零 fail ──
{
  rm -f "$CTRL/bin/hermes" "$CTRL/bin/python"
  make_py_stub "$CTRL/bin" hermes
  make_py_stub "$CTRL/bin" python
  HERMES_BIN="$CTRL/bin/hermes" MX_VENV_REQUIRED_PACKAGES="pkg_a,pkg_b" \
    preflight_venv_packages_assert
  [[ $(grep -c . "$FAIL_OUT") -eq 0 ]] || { echo "FAIL ① 全包在位不应 fail（$(cat "$FAIL_OUT")）"; fails=$((fails+1)); }
  grep -q '包面自检过' "$LOG_OUT" || { echo "FAIL ① 应留过检日志"; fails=$((fails+1)); }
}

# ── ② 缺包即红：消息含缺席包名+补装指引 ──
{
  : > "$FAIL_OUT"
  printf 'hindsight_client\n' > "$CTRL/bin/missing.list"
  HERMES_BIN="$CTRL/bin/hermes" MX_VENV_REQUIRED_PACKAGES="hindsight_client,aiohttp_retry" \
    preflight_venv_packages_assert
  grep -q 'hindsight_client' "$FAIL_OUT" || { echo "FAIL ② fail 消息应含缺席包名"; fails=$((fails+1)); }
  grep -q 'admission 失败' "$FAIL_OUT" || { echo "FAIL ② fail 消息应带实录锚（admission 失败）"; fails=$((fails+1)); }
  grep -q 'uv pip install' "$FAIL_OUT" || { echo "FAIL ② fail 消息应带补装指引"; fails=$((fails+1)); }
  grep -q 'aiohttp_retry' "$FAIL_OUT" && { echo "FAIL ② 在位包不应列入缺席"; fails=$((fails+1)); }
}

# ── ③ wrapper 布局：同目录无 python，从 exec 行提取 ──
{
  : > "$FAIL_OUT"
  mkdir -p "$CTRL/wrap" "$CTRL/venv_real/bin"
  make_py_stub "$CTRL/venv_real/bin" python
  cat > "$CTRL/wrap/hermes-sim" <<WRAP
#!/bin/bash
exec "$CTRL/venv_real/bin/python" -I "$CTRL/wrap/hermes-sim.py" "\$@"
WRAP
  chmod +x "$CTRL/wrap/hermes-sim"
  : > "$CTRL/venv_real/bin/missing.list"
  HERMES_BIN="$CTRL/wrap/hermes-sim" MX_VENV_REQUIRED_PACKAGES="pkg_x" \
    preflight_venv_packages_assert
  [[ $(grep -c . "$FAIL_OUT") -eq 0 ]] || { echo "FAIL ③ wrapper 解释器提取后不应 fail（$(cat "$FAIL_OUT")）"; fails=$((fails+1)); }
  grep -q '解释器=.*venv_real/bin/python' "$LOG_OUT" || { echo "FAIL ③ 应记录提取的解释器路径"; fails=$((fails+1)); }
}

# ── ④ 清单覆盖：置空=禁用跳过 ──
{
  : > "$FAIL_OUT"
  printf 'pkg_x\n' > "$CTRL/venv_real/bin/missing.list"   # 故意缺——但断言已禁用
  HERMES_BIN="$CTRL/bin/hermes" MX_VENV_REQUIRED_PACKAGES="" \
    preflight_venv_packages_assert
  [[ $(grep -c . "$FAIL_OUT") -eq 0 ]] || { echo "FAIL ④ 显式置空应禁用断言不 fail"; fails=$((fails+1)); }
  grep -q '禁用' "$LOG_OUT" || { echo "FAIL ④ 应留禁用日志"; fails=$((fails+1)); }
}

# ── ⑤ 解释器失联 → fail（不静默跳过）──
{
  : > "$FAIL_OUT"
  printf 'not-a-wrapper\n' > "$CTRL/orphan"
  HERMES_BIN="$CTRL/orphan" MX_VENV_REQUIRED_PACKAGES="pkg_a" \
    preflight_venv_packages_assert
  grep -q '解释器不可解析' "$FAIL_OUT" || { echo "FAIL ⑤ 解释器失联应 fail"; fails=$((fails+1)); }
}

if (( fails > 0 )); then
  echo "FAIL(venv-packages-preflight) ${fails} 项断言未过"
  exit 1
fi
echo "PASS venv-packages-preflight（在位过检/缺席即红/wrapper 提取/清单覆盖/失联即红 五场景）"
