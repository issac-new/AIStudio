#!/bin/bash
# studio-preload-supply.test.sh — studio 启动 preload 供给闭环守门（drill r004 收口，
# spec 2026-11-17-sim-studio-preload-hardening）
# 夹具树隔离（AIPAY_SIM_ROOT 覆盖，不碰真实 SIM 根）验证四件事：
#   ①供给幂等三态：缺失则补（cmp 与仓内正本一致）/ 相同不动（inode 不变）/
#     漂移则同步回正本；
#   ②密钥纪律：缺位才生成（64 hex＋0600）/ 已存在绝不覆盖（换钥=在途 JWT 全失效）/
#     空文件视为缺位补生成；
#   ③ensure_studio_up 接线：供给调用在 S-L2 fail-closed 预检之前（自愈序）、
#     node -r 双 preload 启动行、G-004 fail-open 告警锚在位；
#   ④preload 件静态红线：jwt 件 fail-closed exit 78、access-log 件不记 header 值
#     红线锚、两件无硬编码密钥字面量。
set -euo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # mux/
FX="$(mktemp -d /tmp/preload-fixture-XXXXXX)"
trap 'rm -rf "$FX"' EXIT

export AIPAY_SIM_ROOT="$FX"
mkdir -p "$FX/var"
# shellcheck source=/dev/null
source "$HERE/mx-lib.sh"    # 解析 SIM_ROOT=夹具 → CREDS_DIR=$FX/creds；正本仍在仓内 mux/preload/

PRELOAD_SRC="$HERE/preload"
fails=0
ok()   { echo "  ok  $1"; }
bad()  { echo "  FAIL $1"; fails=$((fails+1)); }

# ── ① 缺失则补：fresh 空夹具首调 ────────────────────────
ensure_studio_preload_files
for f in jwt-secret-preload.cjs studio-access-log-preload.cjs; do
  if [[ -f "$CREDS_DIR/$f" ]] && cmp -s "$PRELOAD_SRC/$f" "$CREDS_DIR/$f"; then
    ok "缺失则补＋与正本一致：$f"
  else
    bad "供给后 $f 缺失或与仓内正本不一致"
  fi
done
sec=$(cat "$CREDS_DIR/auth-jwt-secret" 2>/dev/null || true)
if [[ "$sec" =~ ^[0-9a-f]{64}$ ]]; then
  ok "auth-jwt-secret 缺位生成（64 hex）"
else
  bad "auth-jwt-secret 生成格式异常：${sec:0:20}…"
fi
perm=$(stat -f '%Lp' "$CREDS_DIR/auth-jwt-secret")
[[ "$perm" == "600" ]] && ok "auth-jwt-secret 0600" || bad "auth-jwt-secret 权限异常：$perm（want 600）"

# ── ② 幂等：相同不动（无重写，inode 不变）＋密钥绝不覆盖 ──
ino_jwt_before=$(stat -f '%i' "$CREDS_DIR/jwt-secret-preload.cjs")
ino_log_before=$(stat -f '%i' "$CREDS_DIR/studio-access-log-preload.cjs")
sec_before="$sec"
ensure_studio_preload_files
[[ "$(stat -f '%i' "$CREDS_DIR/jwt-secret-preload.cjs")" == "$ino_jwt_before" \
   && "$(stat -f '%i' "$CREDS_DIR/studio-access-log-preload.cjs")" == "$ino_log_before" ]] \
  && ok "相同不动：两 preload 副本 inode 不变（无 cp 重写）" \
  || bad "幂等失效：相同内容被重写（inode 变了）"
[[ "$(cat "$CREDS_DIR/auth-jwt-secret")" == "$sec_before" ]] \
  && ok "密钥绝不覆盖：再调内容不变" \
  || bad "密钥被覆盖（在途 JWT 将全失效）"

# ── ③ 漂移则同步回正本 ─────────────────────────────────
printf 'drifted\n' > "$CREDS_DIR/jwt-secret-preload.cjs"
printf 'drifted\n' > "$CREDS_DIR/studio-access-log-preload.cjs"
ensure_studio_preload_files
cmp -s "$PRELOAD_SRC/jwt-secret-preload.cjs" "$CREDS_DIR/jwt-secret-preload.cjs" \
  && ok "漂移同步回正本：jwt-secret-preload.cjs" \
  || bad "漂移副本未恢复（jwt-secret-preload.cjs）"
cmp -s "$PRELOAD_SRC/studio-access-log-preload.cjs" "$CREDS_DIR/studio-access-log-preload.cjs" \
  && ok "漂移同步回正本：studio-access-log-preload.cjs" \
  || bad "漂移副本未恢复（studio-access-log-preload.cjs）"
# 空密钥文件=畸形（preload 会 exit 78 拒启）→ 视为缺位补生成
: > "$CREDS_DIR/auth-jwt-secret"
ensure_studio_preload_files
sec2=$(cat "$CREDS_DIR/auth-jwt-secret")
[[ "$sec2" =~ ^[0-9a-f]{64}$ ]] && ok "空密钥文件视为缺位补生成" || bad "空密钥文件未补生成：${sec2:0:20}…"

# ── ④ ensure_studio_up 接线锚（供给先于预检＝自愈序）────
LIB="$HERE/mx-lib.sh"
ln_supply=$(grep -n '^  ensure_studio_preload_files$' "$LIB" | head -1 | cut -d: -f1)
ln_prec=$(grep -n 'S-L2 fail-closed: creds/jwt-secret-preload.cjs' "$LIB" | head -1 | cut -d: -f1)
if [[ -n "$ln_supply" && -n "$ln_prec" && "$ln_supply" -lt "$ln_prec" ]]; then
  ok "供给调用（L$ln_supply）先于 S-L2 预检（L$ln_prec）——自愈序成立"
else
  bad "接线序异常：供给 L${ln_supply:-缺失} vs 预检 L${ln_prec:-缺失}"
fi
grep -q "node -r \"\\\$4\" -r \"\\\$5\" \"\\\$1\"" "$LIB" \
  && ok "启动行 node -r 双 preload（位置参数）" \
  || bad "启动行缺 node -r 双 preload"
grep -q '请求级遥测将缺失（服务照常）' "$LIB" \
  && ok "G-004 fail-open 告警锚在位" \
  || bad "G-004 fail-open 告警锚缺失"

# ── ⑤ preload 件静态红线 ────────────────────────────────
grep -q 'process.exit(78)' "$PRELOAD_SRC/jwt-secret-preload.cjs" \
  && ok "jwt 件 fail-closed（exit 78）锚在位" \
  || bad "jwt 件缺 exit 78 fail-closed"
grep -q '不记任何 header 值' "$PRELOAD_SRC/studio-access-log-preload.cjs" \
  && ok "access-log 件红线声明锚在位（不记任何 header 值）" \
  || bad "access-log 件红线声明锚缺失"
if grep -nE "h\['(cookie|authorization)'\]\s*[,)]|JSON.stringify\(h\)|JSON.stringify\(.*headers" "$PRELOAD_SRC/studio-access-log-preload.cjs" >/dev/null; then
  bad "access-log 件疑似记录 header 值（红线违反）"
else
  ok "access-log 件无 header 值落盘调用"
fi
# 密钥注入=读文件写 env，非硬编码字面量
grep -q 'process.env.AUTH_JWT_SECRET = secret' "$PRELOAD_SRC/jwt-secret-preload.cjs" \
  && ok "jwt 件注入面=env 赋值（读文件，无硬编码）" \
  || bad "jwt 件注入面异常（非 env 赋值）"

# ── 收口 ───────────────────────────────────────────────
if (( fails > 0 )); then echo "studio-preload-supply: ${fails} FAIL"; exit 1; fi
echo "studio-preload-supply: all ok"
