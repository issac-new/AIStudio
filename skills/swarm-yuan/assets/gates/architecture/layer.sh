# gate: layer
# domain: architecture / enforce: strict / tier: arch
check_layer() {
  echo "=== 分层边界检查（DDD：层穿透/倒置/循环/领域污染）==="
  local found=0

  if [[ ${#LAYER_DEFS[@]} -eq 0 || ${#LAYER_ORDER[@]} -eq 0 ]]; then
    skip_if_unconfigured "未配置 LAYER_DEFS/LAYER_ORDER，跳过分层检查"
    return
  fi

  # ---- 0. 优先用 gitnexus query 查跨层依赖（最准确）----
  # P0-5：消费前确保已构建（gitnexus_ensure_indexed），未构建则触发构建提示/降级
  if has_gitnexus && gitnexus_ensure_indexed; then
    trace_tool "gitnexus" "query cross-layer imports"
    local gn_layer_issues; gn_layer_issues=$(gitnexus query "cross-layer imports" --format text 2>/dev/null | head -20 || true)
    if [[ -n "$gn_layer_issues" ]]; then
      local issue_count; issue_count=$(echo "$gn_layer_issues" | grep -cE '^\s+\S' || true)
      if [[ "$issue_count" -gt 0 ]]; then
        warn "gitnexus 检测到 ${issue_count} 处可能的跨层依赖（详见输出）"
        echo "$gn_layer_issues" | head -5 | sed 's/^/    /'
      fi
      pass "分层检查增强（基于 gitnexus 代码图谱）"
    else
      # 空结果也提示（修静默——原代码 gitnexus 无跨层问题时连 pass 都不打印）
      pass "gitnexus 查询跨层依赖:无问题"
    fi
  else
    # gitnexus 缺失/未索引时原静默跳过（无 else 提示），
    # 与 check_review 的 ocr 缺失 warn 提示诚实化不一致——降级链须显式披露，不假装跑了图谱分析。
    warn "gitnexus 未装/未索引——分层检查降级为 grep/awk 静态分析（未用代码图谱，精度较低；gitnexus analyze 或 BUILD_DEEP_RUNTIMES=1 可升级）"
  fi

  # 临时映射文件（兼容 bash 3.2，不用 declare -A）
  local tmp_file2layer tmp_layer2idx tmp_layer_files
  tmp_file2layer=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-f2l.XXXXXX"); tmp_layer2idx=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-l2i.XXXXXX"); tmp_layer_files=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-lf.XXXXXX")
  # RETURN trap 会随外层函数（如 _gate_exec）返回二次触发——双引号定义期烘焙路径使其自包含，
  # 避免 set -u 下单引号延迟求值引用已销毁的局部变量；二次触发对已删文件 rm -f 为无害 no-op。
  # shellcheck disable=SC2064  # 有意用双引号在定义期烘焙 $tmp_* 路径（见上行注释），非延迟求值
  trap "rm -f '$tmp_file2layer' '$tmp_layer2idx' '$tmp_layer_files'" RETURN

  # ---- 1. 构建层→文件映射 + 文件→层映射 ----
  local ld
  for ld in "${LAYER_DEFS[@]}"; do
    local name="${ld%%=*}"
    local globs="${ld#*=}"
    [[ -z "$name" || -z "$globs" ]] && continue
    local matched=""
    IFS=',' read -ra garr <<< "$globs"
    for g in "${garr[@]}"; do
      g="${g// /}"
      [[ -z "$g" ]] && continue
      local m=""
      # 优先 find（覆盖未 git add 的新文件），再并 git ls-files（覆盖 git 历史但已删除的工作区文件）
      # base 解析：去掉末尾的 /**（用 % 最短匹配，不能用 %% 最长匹配——%% 会跨越中间的 * 把
      # 'overlay/custom/client/*/components/**' 误截成 'overlay/custom/client'，导致 find 扫整个 client 目录，
      # 把 __tests__/adapters/composables 全归入 component 层，check_layer §3 大量误判）。
      local base="${g%/\*\*}"
      # base 可能含 * 通配（如 overlay/custom/client/*/components），[[ -d ]] 不展开 glob 会 false。
      # 用 compgen -d 展开 glob 为实际目录列表，逐个 find（兼容 bash 3.2）。
      if [[ -d "$base" ]]; then
        m=$(find "$base" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.java' -o -name '*.vue' \) 2>/dev/null || true)
      else
        # base 含 glob 字符，展开后逐个 find
        local expanded
        expanded=$(compgen -d "$base" 2>/dev/null || true)
        if [[ -n "$expanded" ]]; then
          local d
          while IFS= read -r d; do
            [[ -z "$d" ]] && continue
            local dm; dm=$(find "$d" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.java' -o -name '*.vue' \) 2>/dev/null || true)
            [[ -n "$dm" ]] && m="${m}${m:+$'\n'}$dm"
          done <<< "$expanded"
        fi
      fi
      if [[ -z "$m" ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        m=$(git ls-files "$g" 2>/dev/null || true)
      fi
      [[ -n "$m" ]] && matched="${matched}${matched:+$'\n'}$m"
    done
    # 记录 layer -> files
    printf '%s\t' "$name" >> "$tmp_layer_files"
    printf '%s\n' "$matched" >> "$tmp_layer_files"
    # 记录 file -> layer
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      printf '%s\t%s\n' "$f" "$name" >> "$tmp_file2layer"
    done <<< "$matched"
  done

  if [[ ! -s "$tmp_file2layer" ]]; then
    warn "LAYER_DEFS 配置但未匹配到任何源文件，检查 glob 是否正确"
    return
  fi

  # ---- 2. 层索引（LAYER_ORDER[0] 最上层，只能依赖下方层）----
  local i=0 lo
  for lo in "${LAYER_ORDER[@]}"; do
    printf '%s\t%s\n' "$lo" "$i" >> "$tmp_layer2idx"
    i=$((i+1))
  done

  # 辅助：查文件所属层（接受绝对或相对路径，统一去掉 PROJECT_DIR 前缀）
  # 注意 macOS 下 /tmp 是 /private/tmp 的 symlink，PROJECT_DIR 与 realpath 结果可能前缀不一致
  local _pd; _pd=$(cd "$PROJECT_DIR" 2>/dev/null && pwd -P || echo "$PROJECT_DIR")
  _norm() { local p="$1"; p="${p#"$_pd"/}"; p="${p#"$PROJECT_DIR"/}"; p="${p#./}"; printf '%s' "$p"; }
  _layer_of() { local p; p=$(_norm "$1"); awk -F'\t' -v f="$p" '$1==f{print $2; exit}' "$tmp_file2layer"; }
  _idx_of()   { awk -F'\t' -v l="$1" '$1==l{print $2; exit}' "$tmp_layer2idx"; }

  # ---- 3. 层依赖方向断言：仅允许上层依赖下层 ----
  local f _layer_unreg=""
  while IFS= read -r line; do
    f="${line%%$'\t'*}"
    local src_layer; src_layer="${line#*$'\t'}"
    [[ -z "$f" || -z "$src_layer" ]] && continue
    local src_idx; src_idx=$(_idx_of "$src_layer")
    # R128：层在 LAYER_DEFS 命中但未登记 LAYER_ORDER 时，旧版默认索引 0（最顶层）——方向性
    # 误判（既可能假报倒置也可能漏报），且零披露。改为披露一次（去重）并跳过该文件方向判定。
    if [[ -z "$src_idx" ]]; then
      case " ${_layer_unreg:-} " in *" $src_layer "*) ;; *)
        _layer_unreg="${_layer_unreg:-} $src_layer"
        warn "层「${src_layer}」在 LAYER_DEFS 命中但未登记 LAYER_ORDER——方向判定跳过（补齐 LAYER_ORDER 后重跑）" ;;
      esac
      continue
    fi
    local imports
    imports=$(grep -hoE "(import|from)\s+['\"][^'\"]+['\"]|import\s+[a-zA-Z0-9_./]+|require\(['\"][^'\"]+['\"]\)" "$f" 2>/dev/null \
      | grep -oE "['\"][^'\"]+['\"]" | sed "s/['\"]//g" | sort -u || true)
    [[ -z "$imports" ]] && continue
    while IFS= read -r imp; do
      [[ -z "$imp" ]] && continue
      case "$imp" in
        ./*|../*)
          local dir; dir=$(dirname "$f")
          local target=""
          # realpath 对无扩展名的模块路径会失败，先按各扩展名尝试解析
          for ext in ".ts" ".js" ".py" ".go" ".tsx" ".jsx" "/index.ts" "/index.js"; do
            local cand
            cand=$(cd "$dir" 2>/dev/null && _resolve_path "${imp}${ext}" 2>/dev/null || echo "")
            if [[ -n "$cand" && -f "$cand" ]]; then target="$cand"; break; fi
          done
          [[ -z "$target" ]] && continue
          local tgt_layer; tgt_layer=$(_layer_of "$target")
          [[ -z "$tgt_layer" ]] && continue
          local tgt_idx; tgt_idx=$(_idx_of "$tgt_layer")
          if [[ -z "$tgt_idx" ]]; then
            case " ${_layer_unreg:-} " in *" $tgt_layer "*) ;; *)
              _layer_unreg="${_layer_unreg:-} $tgt_layer"
              warn "层「${tgt_layer}」在 LAYER_DEFS 命中但未登记 LAYER_ORDER——方向判定跳过（补齐 LAYER_ORDER 后重跑）" ;;
            esac
            continue
          fi
          if [[ "$tgt_layer" != "$src_layer" && "$tgt_idx" -le "$src_idx" ]]; then
            fail "层依赖违规：$f ($src_layer) → $target ($tgt_layer)。仅允许上层依赖下层（${LAYER_ORDER[*]}）"
            found=1
          fi
          ;;
      esac
    done <<< "$imports"
  done < "$tmp_file2layer"

  # ---- 4. 领域层污染检测：领域层不得 import 框架/ORM/Web/IO ----
  if [[ -n "$DOMAIN_LAYER" && ${#DOMAIN_FORBIDDEN_IMPORTS[@]} -gt 0 ]]; then
    local dom_files
    dom_files=$(awk -F'\t' -v l="$DOMAIN_LAYER" '$1==l{print $2}' "$tmp_layer_files")
    if [[ -n "$dom_files" ]]; then
      while IFS= read -r df; do
        [[ -z "$df" ]] && continue
        local ffi
        for ffi in "${DOMAIN_FORBIDDEN_IMPORTS[@]}"; do
          if grep -qE "from ['\"]?${ffi}|import ['\"]?${ffi}|require\(['\"]${ffi}" "$df" 2>/dev/null; then
            fail "领域层污染：$df import 了框架/ORM/IO 模块 '$ffi'（领域层应保持纯业务，不依赖框架）"
            found=1
          fi
        done
      done <<< "$dom_files"
    fi
  fi

  # ---- 5. 循环依赖检测（madge 若装）----
  if has_madge; then
    local circ
    circ=$(madge --circular --extensions ts,js "$PROJECT_DIR" 2>/dev/null || true)
    if echo "$circ" | grep -qi "circular"; then
      fail "检测到循环依赖（madge）："; echo "$circ" | sed 's/^/    /'
      found=1
    fi
  else
    warn "未安装 madge（npm i -g madge），循环依赖检测跳过"
  fi

  # ---- 6. 聚合间直接对象引用检测（聚合应只引用其他聚合的 ID，非对象）----
  if [[ -n "$AGGREGATE_DIR" && -d "$AGGREGATE_DIR" ]]; then
    local aggs; aggs=$(find "$AGGREGATE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true)
    if [[ -n "$aggs" ]]; then
      local ad af
      while IFS= read -r ad; do
        [[ -z "$ad" ]] && continue
        local aname; aname=$(basename "$ad")
        while IFS= read -r af; do
          [[ -z "$af" ]] && continue
          local target
          while IFS= read -r target; do
            [[ -z "$target" ]] && continue
            local other
            while IFS= read -r other; do
              [[ -z "$other" || "$other" == "$aname" ]] && continue
              local other_dir; other_dir=$(cd "$AGGREGATE_DIR/$other" 2>/dev/null && pwd -P || echo "$AGGREGATE_DIR/$other")
              if [[ "$target" == "$other_dir"* ]]; then
                fail "聚合跨边界对象引用：$af ($aname 聚合) 直接 import 了 $other 聚合的内部。聚合间应只引用 ID，不引用对象"
                found=1
              fi
            done < <(find "$AGGREGATE_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null)
          done < <(_resolve_rel_imports "$af")
        done < <(find "$ad" -type f \( -name '*.ts' -o -name '*.js' -o -name '*.py' \) 2>/dev/null)
      done <<< "$aggs"
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "分层边界检查通过（无穿透/倒置/领域污染/聚合跨引用）"
  fi
}
