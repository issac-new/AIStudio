#!/usr/bin/env bash
# memory-backends.sh — 记忆后端适配层（注册表 + 函数派发）
#
# 把记忆插件的「检测 / 写入 / 检索」收敛为可替换后端：调用方（memory-writeback.sh、
# gates-warn.sh check_knowledge、self-check.sh 运行时检测）只面向本层接口，不绑定具体
# 插件的 CLI 名、数据目录或内部格式。接入新记忆插件 = 三个契约函数 + 注册序一行，
# 调用方零改动。
#
# 后端契约（后端 id 用下划线命名——bash 函数名安全；显示名可用连字符）：
#   mem_<id>_detect            → 0=当前可用 / 1=未检测到（未安装/目录不存在）。只探测不输出。
#   mem_<id>_write <body_file> → 0=已写入（stdout 恰好一行 ✓ 披露）/ 1=失败（stderr 一行 ⚠ 原因）。
#                                后端自行决定存储多少（文件后端存全文，CLI 插件可只存摘要行）。
#   mem_<id>_search <query>    → 0=有结果（stdout 输出结果）/ 1=无结果 / 2=后端报错（stderr 带原因）。
#                                不可检索的后端可不定义此函数（调用方跳过）。
#   mem_<id>_present           → 可选。0=本机有任何痕迹（CLI 已装或其数据目录存在）/ 1=无。
#                                供 advisory 探测（「数据目录在但 CLI 缺」类提示），detect 恒可用者可不定义。
#
# 调度接口：
#   mem_backends_list          → stdout 空格分隔后端 id 清单（默认注册序，见下）
#   mem_detect <id>            → 同 mem_<id>_detect；未注册后端恒 1
#   mem_present <id>           → 同 mem_<id>_present；未定义该函数时退化为 detect
#   mem_write <id> <body_file> → 调 mem_<id>_write
#   mem_search <id> <query>    → 调 mem_<id>_search；未定义该函数或后端不可用时返回 1
#   mem_write_all <body_file>  → 按注册序逐后端写入，每后端恰好一行披露，末行汇总。恒 return 0（best-effort）
#
# 注册序：local zcode claude_mem（local=项目本地文件，恒可用兜底；claude_mem=可替换插件样例）。
# 环境变量 SWARM_YUAN_MEM_BACKENDS 可覆盖清单与顺序（空格分隔后端 id）。
#
# 三平台兼容：bash 3.2 / 无 declare -A / sed 不用 -i / ${var} 引用 / $(cd … && pwd)。
# 防重复 source（幂等）：已加载时静默跳过（source 态 return 生效；直执行态 return 报错后
# 继续走到函数定义，重复定义无害——本文件设计为被 source，无顶层副作用）。

if [[ -n "${_SWARM_YUAN_MEM_BACKENDS_LOADED:-}" ]]; then
  return 0 2>/dev/null
fi
_SWARM_YUAN_MEM_BACKENDS_LOADED=1

# ---- 注册表 ----
mem_backends_list() {  # → stdout：后端 id 清单（默认 local zcode claude_mem）
  if [[ -n "${SWARM_YUAN_MEM_BACKENDS:-}" ]]; then
    printf '%s\n' "$SWARM_YUAN_MEM_BACKENDS"
  else
    printf '%s\n' "local zcode claude_mem"
  fi
}

# ---- 调度器 ----
mem_detect() {  # $1=后端 id → 0 可用 / 1 未检测到
  local fn="mem_$1_detect"
  command -v "$fn" >/dev/null 2>&1 || return 1
  "$fn"
}

mem_present() {  # $1=后端 id → 0 本机有痕迹 / 1 无（无 _present 函数时退化为 detect）
  local fn="mem_$1_present"
  if command -v "$fn" >/dev/null 2>&1; then "$fn"; else mem_detect "$1"; fi
}

mem_write() {  # $1=后端 id $2=body 文件 → 同 mem_<id>_write（未注册后端 1）
  local fn="mem_$1_write"
  command -v "$fn" >/dev/null 2>&1 || return 1
  "$fn" "$2"
}

mem_search() {  # $1=后端 id $2=query → 0 有结果 / 1 无结果或不可检索 / 2 后端报错
  local fn="mem_$1_search"
  command -v "$fn" >/dev/null 2>&1 || return 1
  mem_detect "$1" || return 1
  "$fn" "$2"
}

mem_write_all() {  # $1=body 文件 → 逐后端写入并披露；恒 return 0（best-effort，不阻塞主流程）
  local backend wrote=0 skipped=0 failed=0
  for backend in $(mem_backends_list); do
    if ! mem_detect "$backend"; then
      echo "⚠ [记忆写回] ${backend}: 跳过（未检测到——未安装或目录不存在）"
      skipped=$((skipped+1))
      continue
    fi
    if mem_write "$backend" "$1"; then
      wrote=$((wrote+1))
    else
      failed=$((failed+1))
    fi
  done
  echo "→ [记忆写回] 写入 ${wrote} / 跳过 ${skipped} / 失败 ${failed}（后端清单：$(mem_backends_list)）"
  return 0
}

# ---- 后端：local（.swarm-yuan/project-knowledge.md，项目本地恒可用兜底）----
mem_local_detect() { return 0; }  # 项目目录存在即可写（调用方已守卫 PROJECT_DIR）
mem_local_write() {  # $1=body 文件
  # local 多赋值拆行：同行内后一个赋值引用前一个变量时，展开先于赋值执行（set -u 下 unbound）
  local dir="${PROJECT_DIR:-$(pwd)}/.swarm-yuan"
  local f="$dir/project-knowledge.md"
  mkdir -p "$dir" 2>/dev/null || return 1
  {
    echo "---"
    echo "ts: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "project: $(basename "${PROJECT_DIR:-$(pwd)}")"
    echo "---"
    cat "$1" 2>/dev/null
    echo ""
  } >> "$f" 2>/dev/null || return 1
  echo "✓ [记忆写回] local: ${f}"
  return 0
}
# local 无 mem_local_search：项目本地状态文件是本技能自身产物，不作为「历史记忆已积累」证据源

# ---- 后端：zcode（$PROJECT_DIR/.zcode/memories/，目录存在才写——不替宿主建目录）----
mem_zcode_detect() { [[ -d "${PROJECT_DIR:-$(pwd)}/.zcode/memories" ]]; }
mem_zcode_write() {  # $1=body 文件
  local dir="${PROJECT_DIR:-$(pwd)}/.zcode/memories"
  local f="$dir/project-knowledge.md"
  [[ -d "$dir" ]] || return 1
  {
    echo "---"
    echo "ts: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "---"
    cat "$1" 2>/dev/null
    echo ""
  } >> "$f" 2>/dev/null || return 1
  echo "✓ [记忆写回] zcode: ${f}"
  return 0
}
mem_zcode_search() {  # $1=query → grep 项目记忆文件（无文件=无结果）
  local f="${PROJECT_DIR:-$(pwd)}/.zcode/memories/project-knowledge.md"
  [[ -f "$f" ]] || return 1
  local hits
  hits=$(grep -iF "$1" "$f" 2>/dev/null | head -10 || true)
  [[ -n "$hits" ]] || return 1
  printf '%s\n' "$hits"
  return 0
}

# ---- 后端：claude_mem（claude-mem CLI；可替换插件样例——上游 v12.4.7+ 已移除 add 子命令，
# 写入机制是 hooks 捕获 observation，CLI 层 search 触发即现行真实写入路径。
# add 调用保留：面向仍带 add 的旧版上游（title + content 签名），新版自动落入 search 路径，不阻塞）----
mem_claude_mem_detect() { command -v claude-mem >/dev/null 2>&1; }
mem_claude_mem_present() { command -v claude-mem >/dev/null 2>&1 || [[ -d "$HOME/.claude-mem" ]]; }
mem_claude_mem_write() {  # $1=body 文件（本后端只存摘要行，全文由文件后端承载）
  local _ts; _ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local _content="swarm-yuan skill generated ${_ts}: 项目知识已写回（特征卡+框架清单+spec 摘要）"
  if claude-mem add "swarm-yuan 生成" "$_content" >/dev/null 2>&1; then
    echo "✓ [记忆写回] claude-mem: 已写入（add 真实子进程）"
    return 0
  fi
  # 现行上游写入路径：search 触发 observation 捕获（hooks 侧落库）
  if claude-mem search "swarm-yuan skill generated ${_ts}" >/dev/null 2>&1; then
    echo "✓ [记忆写回] claude-mem: 已触发（observation 由其 hooks 捕获）"
    return 0
  fi
  echo "⚠ [记忆写回] claude-mem: 失败（add/search 均未成功——CLI 已装但调用异常）" >&2
  return 1
}
mem_claude_mem_search() {  # $1=query → 0 有结果 / 1 无结果 / 2 报错
  local out err
  out=$(claude-mem search "$1" 2>/tmp/cm_err.$$ || true)
  err=$(cat /tmp/cm_err.$$ 2>/dev/null; rm -f /tmp/cm_err.$$ 2>/dev/null)
  if [[ -n "$out" ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  if [[ -n "$err" ]]; then
    echo "claude-mem search 报错: ${err:0:120}" >&2
    return 2
  fi
  return 1
}
