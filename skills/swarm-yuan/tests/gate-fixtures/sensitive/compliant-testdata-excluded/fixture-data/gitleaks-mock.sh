#!/usr/bin/env bash
# gitleaks mock：按门禁契约（gitleaks detect --no-git -s <dir> --report-format json
# --report-path <path> --exit-code 0）输出 JSON 报告，finding 元素含 RuleID/File 字段。
# 探测口径与内置路径同源的 sk- 密钥 ERE，保证 fixture 确定性；无命中时输出空数组。
set -u
src="" report=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s) src="$2"; shift 2;;
    --report-path) report="$2"; shift 2;;
    *) shift;;
  esac
done
[[ -n "$report" ]] || exit 2
entries=""
hits=$(grep -rlE 'sk-[a-zA-Z0-9]{20,}' "$src" 2>/dev/null || true)
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  entry="{\"RuleID\":\"mock-generic-api-key\",\"File\":\"$f\"}"
  if [[ -z "$entries" ]]; then entries="$entry"; else entries="$entries,$entry"; fi
done <<< "$hits"
printf '[%s]\n' "$entries" > "$report"
exit 0
