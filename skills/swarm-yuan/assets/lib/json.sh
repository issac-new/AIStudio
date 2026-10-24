#!/usr/bin/env bash
# json.sh — JSON 输出公共库（WP5）
# 只做字符串/键值拼接，不引入 jq/Python 依赖。

json_escape() {  # $1=原文 → stdout 转义后的字符串内容
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g'
}

json_str() {  # $1=原文 → stdout 带引号字符串
  printf '"%s"' "$(json_escape "${1:-}")"
}

json_kv() {  # $1=key $2=已序列化的 value → stdout "key":value
  printf '"%s":%s' "$(json_escape "${1:-}")" "${2:-null}"
}
