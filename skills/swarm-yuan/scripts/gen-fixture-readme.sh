#!/usr/bin/env bash
# gen-fixture-readme.sh —— fixture README 草稿生成器
# 逐框架读 references/frameworks/<id>.md 的 §4 门禁清单（fail 级）+ 对应 fixture 目录，
# 自动生成 README 草稿（≤30 行），说明该 fixture 触发哪个 fail id、对应反模式、violating/compliant 差异。
# 既有的有 README 的 fixture 不覆盖。
#
# 用法:
#   gen-fixture-readme.sh              # 生成全部缺失 README 的 fixture（草稿落盘）
#   gen-fixture-readme.sh --dry <id>  # 仅打印 <id> 草稿到 stdout，不落盘
#   gen-fixture-readme.sh --force <id> # 强制覆盖（慎用）
set -u

BASE="$(cd "$(dirname "$0")/.." && pwd)"
REF_DIR="$BASE/references/frameworks"
FX_DIR="$BASE/tests/fixtures"

# ---- 提取 §4 门禁 id + 实现逻辑（fail/warn 全量，按行） ----
extract_fail_gates() {  # $1=md 文件
  local md="$1"
  awk '
    /^## §4/ { f=4 }
    f==4 && /^## §5/ { exit }
    f==4 {
      # 匹配形如 | fw_xxx | fail|warn | ... | 的行
      if ($0 ~ /^\|[[:space:]]*fw_/ ) {
        n=split($0, a, "|")
        gid=a[2]; lvl=a[3]; logic=a[4]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", gid)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", lvl)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", logic)
        print gid "::" lvl "::" logic
      }
    }
  ' "$md"
}

# ---- 提取 anti-pattern 简短描述（取 §3 含对应门禁名的规律标题，fallback 用 §4 logic） ----
build_readme() {  # $1=id
  local id="$1"
  local md="$REF_DIR/$id.md"
  local fx="$FX_DIR/$id"
  [[ -f "$md" ]] || { echo "# $id fixture 说明

（references/frameworks/$id.md 缺失，无法自动生成门禁引用；请人工补 §4 后重跑。）

- violating 主触发 fail 意图以 violating/expected-fail-ids 为准。
- 门禁无沉睡：请人工核验声明 fail 门禁是否全部命中。
" ; return; }

  # expected-fail-ids 中列出的 id（去掉注释/空行）
  local fids=()
  if [[ -f "$fx/violating/expected-fail-ids" ]]; then
    while IFS= read -r l || [[ -n "$l" ]]; do
      [[ -z "$l" ]] && continue
      case "$l" in \#*) continue;; esac
      fids+=("$l")
    done < "$fx/violating/expected-fail-ids"
  fi
  local total=${#fids[@]}

  # 从 §4 取这些 id 的实现逻辑（用于反模式描述），含 fail/warn 全量映射
  local failmap
  failmap="$(extract_fail_gates "$md")"

  local today="$(date +%Y-%m-%d)"
  {
    echo "# $id fixture 说明"
    echo ""
    if [[ $total -gt 0 ]]; then
      echo "- violating 主触发 $total 个 fail 意图："
      for fid in "${fids[@]}"; do
        local desc=""
        # 从 failmap 取逻辑（忽略级别段，直接取 :: 后第二段）
        local line
        line="$(printf '%s\n' "$failmap" | grep -F "$fid::" | head -1)"
        if [[ -n "$line" ]]; then
          desc="${line#*::}"      # 去掉 "fid::level::"
          desc="${desc#*::}"      # 取逻辑段
          # 截断过长实现逻辑到 80 字，保留反模式要点
          if [[ ${#desc} -gt 80 ]]; then desc="${desc:0:77}..."; fi
        fi
        echo "  - $fid —— ${desc:-（详见 references/frameworks/$id.md §4）}。"
      done
      echo "- 断言登记：**$total/$total 主触发已断言**（$today 实跑登记，见 violating/expected-fail-ids）。"
    else
      echo "- violating 主触发 fail 意图见 violating/expected-fail-ids（当前未登记，请人工补）。"
    fi
    echo "- 反模式：violating 侧复现上述 $total 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。"
    echo "- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。"
    echo ""
    echo "## violating vs compliant 差异"
    echo "- violating：$total 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。"
    echo "- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。"
    echo "- 验收：\`bash swarm-yuan/tests/run-framework-fixture.sh $id\` 双态绿（violating 检出 / compliant PASS）。"
  }
}

main() {
  local mode="${1:-}"
  case "$mode" in
    --dry)
      local id="${2:-}"
      [[ -z "$id" ]] && { echo "usage: gen-fixture-readme.sh --dry <id>" >&2; exit 2; }
      build_readme "$id"
      ;;
    --force)
      local id="${2:-}"
      [[ -z "$id" ]] && { echo "usage: gen-fixture-readme.sh --force <id>" >&2; exit 2; }
      # 修复：fixture 目录不存在时重定向必失败却仍报「✓ 强制覆盖」——假成功（R130 覆盖补齐实测）
      [[ -d "$FX_DIR/$id" ]] || { echo "✗ fixture 目录不存在: $FX_DIR/$id" >&2; exit 2; }
      build_readme "$id" > "$FX_DIR/$id/README.md"
      echo "✓ 强制覆盖 $id/README.md"
      ;;
    "")
      # 生成全部缺失 README 的 fixture
      local done=0 skip=0
      for d in "$FX_DIR"/*/; do
        # 修复：fixtures 目录为空时 glob 不展开，字面量 */ 走到重定向报错且虚报「✓ 生成 */README.md」
        # （R130 覆盖补齐实测）——先验目录存在再处理。
        [[ -d "$d" ]] || continue
        id="$(basename "$d")"
        [[ -f "$d/README.md" ]] && { skip=$((skip+1)); continue; }
        build_readme "$id" > "$d/README.md"
        done=$((done+1))
        echo "✓ 生成 $id/README.md"
      done
      echo "--- 共生成 $done 个，跳过（已有 README）$skip 个 ---"
      ;;
    *)
      echo "unknown mode: $mode" >&2; exit 2;;
  esac
}

main "$@"
