#!/usr/bin/env bash
# migrate-verify-blocks.sh — 框架文件 verify 块草稿生成（一次性迁移工具）
# 解析 references/frameworks/<fw>.md §3 每条「### 规律」的「验证方法」行：
#   - 含 grep/find 命令 → 提取为 cmd，expect=hits>0（命中即 applicable 候选）
#   - 「人工检查」/无 grep → expect=always（脚本不执行，台账标 manual）
# 默认 stdout 草稿（不写文件）；--apply 用 sed -i.bak 落盘到每条规律「对应门禁」行后。
# 幂等：已有 ```verify 块的规律跳过。
# 用法: migrate-verify-blocks.sh <framework.md> [--apply]
# 退出码: 0 正常；1 arg 错误。
set -uo pipefail

APPLY=0
F=""
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$F" ]] && F="$a" || { echo "未知参数: $a" >&2; exit 1; } ;;
  esac
done
[[ -n "$F" && -f "$F" ]] || { echo "✗ 框架文件缺失或不存在: ${F:-（空）}" >&2; exit 1; }
FW=$(basename "$F" .md)

# 逐行扫：进入「### 规律」段，找「验证方法」行，提取 grep/find 命令；找「对应门禁」行作为插入点
# bash 3.2 无关联数组，用「规则序号|字段」管道传递
awk -v fw="$FW" -v apply="$APPLY" '
  /^### 规律/ { rid++; have_verify=0; vm=""; gate_line=""; inrule=1; title=$0; next }
  inrule && /^```verify/ { have_verify=1 }
  inrule && /^### |^## / { inrule=0 }
  inrule && /验证方法/ { vm=$0 }
  inrule && /对应门禁/ { gate_line=$0 }
  inrule && have_verify==0 && gate_line != "" {
    # 提取 grep/find 命令（反引号内或管道）
    cmd=""; expect="always"
    if (match(vm, /`[^`]*grep[^`]*`/)) {
      cmd=substr(vm, RSTART+1, RLENGTH-2); expect="hits>0"
      gsub(/\$\{PROJECT_DIR\}|\"\$\{PROJECT_DIR\}"/, "${PROJECT_DIR}", cmd)
    } else if (match(vm, /`[^`]*find[^`]*`/)) {
      cmd=substr(vm, RSTART+1, RLENGTH-2); expect="hits>0"
    }
    # 规则号（与 verify 块 id 约定一致：fw-r1 / fw-r2，不补零）
    printf "id: %s-r%d\n", fw, rid
    printf "cmd: %s\n", cmd
    printf "expect: %s\n", expect
    printf "---\n"
    gate_line=""
  }
' "$F"
exit 0
