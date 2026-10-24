# gate: deps
# domain: process / enforce: warn / tier: core
check_deps() {
  # 非 git 仓库时依赖类门禁依赖 git 历史——诚实降级披露（fail-open 但须可见）
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    warn "check_deps: 非 git 仓库（--deps/--stable-diff 依赖 git 历史，本仓失能——人工核对依赖与稳定标注）"
    return 0
  fi
  echo "=== 依赖版本锁定检查（铁律：未经确认不得升级/更换核心依赖）==="
  local found=0

  # 定位基线 codebase.md
  local baseline_file=""
  if [[ -n "${CODEBASE_REF:-}" && -f "$CODEBASE_REF" ]]; then
    baseline_file="$CODEBASE_REF"
  else
    local cand
    cand=$(find "$PROJECT_DIR/.claude/skills" -name codebase.md -path '*/references/*' 2>/dev/null | head -n 1 || true)
    [[ -n "$cand" ]] && baseline_file="$cand"
    # 自定义 target-dir 生成的技能不在
    # 默认安装位 .claude/skills/ 下，find 失明致 warn——技能自带 references/codebase.md 即基线
    # （生成物自包含）。技能根绝对路径用 _CONF_DIR（precheck.sh:338 启动期解析，cd $PROJECT_DIR
    # 后仍有效；BASH_SOURCE 相对路径此时已失效）。
    if [[ -z "$baseline_file" ]]; then
      local _self_dir
      _self_dir="${_CONF_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)}"
      [[ -f "$_self_dir/../references/codebase.md" ]] && baseline_file="$_self_dir/../references/codebase.md"
    fi
  fi
  if [[ -z "$baseline_file" ]]; then
    warn "未找到 codebase.md 版本基线（设置 CODEBASE_REF 或确保 .claude/skills/<skill>/references/codebase.md 存在）"
    return 0
  fi

  # 版本约束声明文件（spec）——记录经用户确认允许变更的依赖及理由
  local spec_file=""
  if [[ -n "${SPEC_FILE:-}" && -f "$SPEC_FILE" ]]; then
    spec_file="$SPEC_FILE"
  else
    local cand2
    # R126-G15：旧 `grep -iE 'spec'` 子串匹配把 inspect.md/prospective.md 等无关文档
    # 误当版本约束声明 spec，命中后依赖升级被误报"未在 spec 声明"。收紧为文件名级
    # 词边界匹配（spec/specs 前后须是非字母数字分隔符；目录名 specs/ 仍命中）。
    cand2=$(find "$PROJECT_DIR/.claude/skills" -type f -name '*.md' 2>/dev/null | grep -iE '(^|/|[-_.])(spec|specs)([-_.]|$)' | head -n 1 || true)
    [[ -n "$cand2" ]] && spec_file="$cand2"
    # 同源兜底：自定义 target-dir 失明时走项目 SPEC_GLOB 约定位（版本约束声明在 spec §5.6）
    if [[ -z "$spec_file" ]]; then
      local _sf
      for _sf in "${PROJECT_DIR}"/${SPEC_GLOB:-docs/specs/*.md}; do
        [[ -f "$_sf" ]] && { spec_file="$_sf"; break; }
      done
    fi
  fi

  # 从 codebase.md 技术栈版本表提取 name<TAB>version 基线对（跨平台 awk，按 | 分列）
  # 表格行形如: | react | 18.2.0 | 核心 |  → $2=依赖名 $3=版本
  # 注意：v 中的空格必须 trim，否则 _norm_ver 的 sed 会误切
  local baseline_pairs
  baseline_pairs=$(awk -F'|' '
    /^\|.*\|.*[0-9]+\.[0-9]+.*\|/ {
      n=$2; v=$3;
      sub(/^[[:space:]]+/,"",n); sub(/[[:space:]]+$/,"",n);
      sub(/^[[:space:]]+/,"",v); sub(/[[:space:]]+$/,"",v);
      sub(/^[~^><=]+/,"",v);
      if(n!="" && v!="" && n !~ /^[-=+]/ && v ~ /^[0-9]+/) print n"\t"v
    }
  ' "$baseline_file" 2>/dev/null | sort -u || true)

  # 收集项目依赖清单文件（排除 node_modules / upstream / .git）
  local dep_files
  dep_files=$(find "$PROJECT_DIR" -maxdepth 3 \
    \( -name package.json -o -name pyproject.toml -o -name go.mod -o -name requirements.txt -o -name Cargo.toml -o -name pom.xml -o -name build.gradle -o -name build.gradle.kts \) \
    2>/dev/null | grep -vE 'node_modules|/upstream/|/\.git/' || true)

  local df name ver base_ver ver_clean base_clean declared
  for df in $dep_files; do
    [[ -f "$df" ]] || continue
    local cur; cur=$(_extract_deps "$df" | sort -u)
    [[ -z "$cur" ]] && continue
    # 用 while + 管道避免 set -e 在子进程中触发；process substitution 兼容 bash 4+
    while IFS= read -r dep_line; do
      [[ -z "$dep_line" ]] && continue
      name="${dep_line%%$'\t'*}"
      ver="${dep_line#*$'\t'}"
      [[ -z "$name" || -z "$ver" || "$name" == "$ver" ]] && continue
      ver_clean=$(_norm_ver "$ver")
      base_ver=$(printf '%s\n' "$baseline_pairs" | awk -F'\t' -v n="$name" '$1==n {print $2; exit}')
      [[ -z "$base_ver" ]] && continue   # 基线无记录 → 跳过（新依赖由 --reuse 关注）
      base_clean=$(_norm_ver "$base_ver")
      if [[ "$ver_clean" != "$base_clean" ]]; then
        declared=""
        if [[ -n "$spec_file" && -f "$spec_file" ]]; then
          declared=$(grep -E -- "${name}.*${ver_clean}" "$spec_file" 2>/dev/null | head -n 1 || true)
        fi
        if [[ -z "$declared" ]]; then
          fail "依赖版本被变更但未在 spec 版本约束声明段声明: ${name} 基线=${base_clean} 当前=${ver_clean} (${df})"
          found=1
        fi
      fi
    done <<< "$cur"
  done

  echo "  提示: 版本锁定铁律——功能性开发中不得随意升级/更换核心依赖版本"
  echo "    - 例外仅限：用户主动要求 / 严重安全或性能隐患 / 功能缺失"
  echo "    - 任何版本变更须在 spec 版本约束声明段显式声明理由 + 经用户确认"
  if [[ $found -eq 0 ]]; then
    pass "依赖版本锁定检查通过（未检测到未经声明的版本变更）"
  fi
}
