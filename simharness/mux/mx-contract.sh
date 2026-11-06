#!/bin/bash
# mx-contract.sh — AI-Friendly CLI 契约的 Shell 镜像（被 source，不产出任何输出）。
# 词表与退出码正本：config/cli-contract.json；本文件常量由
# custom/__tests__/cli-contract.test.ts 断言与正本一致（漂移即测试红）。
#
# 用法：
#   source "$MX_SCRIPT_DIR/mux/mx-contract.sh"
#   MX_FORMAT=human; mx_cli_scan "$@" || exit $?
#   mx_log "进度写 stderr"; mx_emit_event '{"event":"started"}'
#   mx_fail_json usage "缺 RUN_ID" "mx-gate-timing.sh <RUN_ID>"
#
# 纪律：JSON 模式 stdout 只出现结果信封；mx_log 恒走 stderr。

[[ -n "${MX_CONTRACT_SOURCED:-}" ]] && return 0
MX_CONTRACT_SOURCED=1

MX_CONTRACT_VERSION=1
MX_EXIT_OK=0
MX_EXIT_BUSINESS=1
MX_EXIT_ENV=2
MX_EXIT_USAGE=3
MX_EXIT_PARTIAL=4
MX_ERROR_CATEGORIES="usage config auth_required environment upstream_unavailable timeout partial_failure gate_failed internal"
MX_EVENT_NAMES="started progress heartbeat retry item_failed completed"
MX_STATUSES="ok completed_with_errors failed"
MX_FORMAT=human
MX_EVENTS=""

# JSON 字符串转义（只覆盖 shell 里会出现的形态；控制字符按 \u 输出）。
mx_json_escape() {
  local s=${1-}
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

mx_log() { printf '[mux %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

mx_emit_event() { printf '%s\n' "$1"; }

# 常见凭据形态脱敏：sk-*、Bearer、key=value。
mx_redact() {
  sed -E \
    -e 's/sk-[A-Za-z0-9_-]{8,}/sk-***/g' \
    -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+\/-]{8,}=*/\1***/g' \
    -e 's/((api[_-]?key|token|secret|password|authorization|cookie)"?[[:space:]]*[:=][[:space:]]*"?)[^"[:space:],}]+/\1***/Ig'
}

mx_exit_for_category() {
  case "${1-}" in
    usage) printf '%s' "$MX_EXIT_USAGE" ;;
    partial_failure) printf '%s' "$MX_EXIT_PARTIAL" ;;
    config|auth_required|environment|upstream_unavailable|timeout) printf '%s' "$MX_EXIT_ENV" ;;
    *) printf '%s' "$MX_EXIT_BUSINESS" ;;
  esac
}

# 扫描 --format / --events：设置 MX_FORMAT、MX_EVENTS；冲突返回 3（usage）。
# 位置参数原样留在 "$@"，业务参数由调用方继续解析。
mx_cli_scan() {
  MX_FORMAT=human
  MX_EVENTS=""
  local have_json=0
  while (( $# > 0 )); do
    case "$1" in
      --format)
        [[ -n "${2-}" ]] || return "$MX_EXIT_USAGE"
        case "$2" in
          human|json) MX_FORMAT="$2" ;;
          *) return "$MX_EXIT_USAGE" ;;
        esac
        shift 2
        ;;
      --format=*)
        case "${1#--format=}" in
          human|json) MX_FORMAT="${1#--format=}" ;;
          *) return "$MX_EXIT_USAGE" ;;
        esac
        shift
        ;;
      --events)
        [[ "${2-}" == "ndjson" ]] || return "$MX_EXIT_USAGE"
        MX_EVENTS=ndjson
        shift 2
        ;;
      --events=ndjson)
        MX_EVENTS=ndjson
        shift
        ;;
      --json)
        MX_FORMAT=json
        shift
        ;;
      *)
        shift
        ;;
    esac
  done
  if [[ "$MX_FORMAT" == "json" ]]; then have_json=1; fi
  if (( have_json == 1 )) && [[ -n "$MX_EVENTS" ]]; then
    MX_EVENTS=""
    return "$MX_EXIT_USAGE"
  fi
  return 0
}

# 失败出口：向 stderr 写单行信封并按类别退出。MX_CONTRACT_NO_EXIT=1 时只返回码（测试用）。
mx_fail_json() {
  local category=${1-} reason=${2-} remediation=${3-} code
  code=${4:-$(mx_exit_for_category "$category")}
  if [[ "$MX_FORMAT" == "json" ]]; then
    printf '{"schema_version":%s,"status":"failed","error":{"category":"%s","reason":"%s","remediation":"%s"}}\n' \
      "$MX_CONTRACT_VERSION" \
      "$(mx_json_escape "$category")" \
      "$(mx_json_escape "$reason")" \
      "$(mx_json_escape "$remediation")" >&2
  else
    printf '[%s] %s\n修复: %s\n' "$category" "$reason" "$remediation" >&2
  fi
  if [[ "${MX_CONTRACT_NO_EXIT:-0}" == "1" ]]; then return "$code"; fi
  exit "$code"
}

# 成功/部分成功信封：调用方给已序列化的 summary/artifacts/data 片段。
mx_emit_result() { # <status> [summary_json] [artifacts_json] [data_json]
  local status=${1:-ok} summary=${2:-} artifacts=${3:-} data=${4:-} body
  body=$(printf '{"schema_version":%s,"status":"%s"' "$MX_CONTRACT_VERSION" "$status")
  [[ -n "$summary" ]] && body="$body,\"summary\":$summary"
  [[ -n "$artifacts" ]] && body="$body,\"artifacts\":$artifacts"
  [[ -n "$data" ]] && body="$body,\"data\":$data"
  printf '%s}\n' "$body"
}
