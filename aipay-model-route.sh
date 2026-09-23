#!/bin/bash
# aipay-model-route.sh — 给推演实例切换/回滚模型通道
#
# 为什么需要：09-23 V2.0 步骤 9 卡死，真因是 cc-switch 上游 5 小时额度 403、
# kimi-direct 周额度 403、primary aim 鉴权失败——三档全废。逐通道实测后只有
# DashScope compatible-mode 可用（qwen-plus/qwen-max/qwen-turbo 均能正确发出
# tool call；qwen3-coder-plus 免费额度亦已耗尽）。
#
# 只作用在 SIM_ROOT 下的推演 profile，绝不触碰宿主 ~/.hermes 配置。
# 首次改写前把原 config.yaml 存为 config.yaml.pre-route，--restore 一键回滚。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

MODE="${1:-route}"
MODEL="${AIPAY_MODEL:-qwen-plus}"
DS_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
PY="${HERMES_AGENT_VENV:-$HOME/.hermes/hermes-agent/venv/bin/python}"
[[ -x "$PY" ]] || PY=$(command -v python3)

case "$MODE" in
  route|restore) ;;
  *) fail "用法: bash aipay-model-route.sh [route|restore] [user ...]" ;;
esac
# 可点名实例先单台验证，再全量铺开
if (( $# > 1 )); then TARGET=("${@:2}"); else TARGET=("${INSTANCED_USERS[@]}"); fi

KEY=""
if [[ "$MODE" == "route" ]]; then
  KEY=$(grep -m1 '^DASHSCOPE_API_KEY=' "$HOME/.hermes/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  [[ -n "$KEY" ]] || fail "~/.hermes/.env 里没有 DASHSCOPE_API_KEY，无法改道"
fi

changed=0
for u in "${TARGET[@]}"; do
  conf="$(hermes_root "$u")/profiles/$u/config.yaml"
  profenv="$(hermes_root "$u")/profiles/$u/.env"
  [[ -f "$conf" ]] || { log "跳过 $u（无 config.yaml）"; continue; }

  if [[ "$MODE" == "restore" ]]; then
    [[ -f "$conf.pre-route" ]] || { log "$u 无改道前备份，跳过"; continue; }
    mv "$conf.pre-route" "$conf"
    log "$u 已回滚到改道前配置"
    changed=$((changed+1)); continue
  fi

  [[ -f "$conf.pre-route" ]] || cp "$conf" "$conf.pre-route"
  "$PY" - "$conf" "$DS_URL" "$MODEL" "$KEY" <<'PY'
import sys, yaml
path, url, model, key = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
cfg = yaml.safe_load(open(path, encoding="utf8")) or {}
# api_mode 故意不设：DashScope compatible-mode 就是标准 OpenAI chat/completions，
# 与推演原先的 anthropic_messages 代理不同；沿用旧 api_mode 会打错协议。
cfg["model"] = {"default": model, "provider": "custom:dashscope",
                "base_url": url, "api_key": key}
cps = [p for p in (cfg.get("custom_providers") or []) if p.get("name") != "dashscope"]
cps.insert(0, {"name": "dashscope", "base_url": url, "api_key": key, "model": model,
               "models": {model: {"name": model}}})
cfg["custom_providers"] = cps
cfg["fallback_providers"] = [{"provider": "custom:dashscope", "model": model}]
open(path, "w", encoding="utf8").write(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False))
PY
  # 网关子进程按 profile dotenv 取密钥，缺它则改了路由也拿不到凭证
  if ! grep -q '^DASHSCOPE_API_KEY=' "$profenv" 2>/dev/null; then
    printf 'DASHSCOPE_API_KEY=%s\n' "$KEY" >> "$profenv"
  fi
  chmod 600 "$profenv"
  changed=$((changed+1))
  log "$u → $MODEL (custom:dashscope)"
done

if [[ "$MODE" == "route" ]]; then
  log "已改道 $changed 个推演实例；需重启各 profile gateway 生效（aipay-down.sh && aipay-up.sh）"
else
  log "已回滚 $changed 个推演实例"
fi
