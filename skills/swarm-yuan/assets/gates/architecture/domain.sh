# gate: domain
# domain: architecture / enforce: warn / tier: arch
check_domain() {
  echo "=== 领域知识检查（动态识别→深入分析→客观规律违规检测）==="
  local found=0

  # ---- 1. spec §18 领域知识段存在性 + 动态分析质量 ----
  local spec_file="${SPEC_FILE:-}"
  [[ -z "$spec_file" ]] && spec_file=$(_first_existing_file "spec-template.md" "specs/spec-template.md" "docs/spec-template.md")
  # 排除 *template* 模板文件--模板含 §18 标题会自证 pass（乞题谬误）
  [[ -n "$spec_file" && "$(basename "$spec_file")" == *template* ]] && spec_file=""
  if [[ -n "$spec_file" && -f "$spec_file" ]]; then
    if grep -qE '^## 18\..*领域知识' "$spec_file" 2>/dev/null; then
      pass "spec §18 领域知识段存在"
      # 检查 §18.2 深入分析表是否有"依据"（非空壳填写）
      local analysis_rows; analysis_rows=$(awk '/^### 18\.2/,/^### 18\.3/' "$spec_file" 2>/dev/null | grep -cE '^\|.*\|.*\|.*\|.*\|.*\|.*\|' || true)
      local has_evidence; has_evidence=$(awk '/^### 18\.2/,/^### 18\.3/' "$spec_file" 2>/dev/null | grep -cE '因为|依据|证据|@/|src/|代码' || true)
      if [[ "$analysis_rows" -gt 2 ]]; then
        if [[ "$has_evidence" -ge 1 ]]; then
          pass "§18.2 领域深入分析表已填写且含代码依据（${analysis_rows} 行分析，${has_evidence} 处证据）"
        else
          warn "§18.2 领域分析表已填写但无代码依据——每条规律须标注依据（代码证据/文档证据/行业常识），非套用通用清单"
        fi
      else
        warn "§18.2 领域深入分析表未填写——须逐领域分析核心实体→因果→约束→遵循→风险"
      fi
      # 检查 §18.3 声明 checkbox
      if grep -qE '^\s*- \[[x]\].*动态识别' "$spec_file" 2>/dev/null; then
        pass "§18.3 领域声明已勾选"
      else
        warn "§18.3 领域声明未全部勾选——须确认动态识别+深入分析+标注依据+不违反客观规律"
      fi
    else
      warn "spec 缺少 §18 领域知识约束段——须动态识别领域→深入分析→推导客观规律"
    fi
  else
    # R118：这里不能 skip_if_unconfigured——下方代码层客观规律检查仍会执行，
    # 旧版会造成“跳过 1 + fail 1”同时出现、执行数被算成 0 的自相矛盾汇总。
    warn "未找到 spec，§18 领域知识段未检查（代码层客观规律检查继续执行）"
  fi

  # ---- 2. reference-manual 含"领域知识"段且规律有依据 ----
  local rm_file
  rm_file=$(_first_existing_file "${SKILL_DIR}/references/reference-manual.md" "references/reference-manual.md" "reference-manual.md" ".claude/skills/*/references/reference-manual.md")  # R140 G-D3：技能根候选最优先（temp 部署形态 CWD=PROJECT_DIR 落错文件）
  if [[ -n "$rm_file" ]]; then
    if grep -qiE '领域知识|领域规则|客观规律|业务规则|行业知识' "$rm_file" 2>/dev/null; then
      # 检查规律是否有代码依据（非通用清单复制）
      local has_evidence; has_evidence=$(grep -cE '因为|依据|证据|@/|src/|代码' "$rm_file" 2>/dev/null || true)
      if [[ "$has_evidence" -ge 1 ]]; then
        pass "reference-manual 含领域知识段且规律有代码依据"
      else
        warn "reference-manual 领域知识段无代码依据——规律须从项目代码分析推导，非套用通用清单"
      fi
      pass "reference-manual 含领域知识段"
    else
      warn "reference-manual 缺少'领域知识'段——须补充项目所属技术+业务领域的专业知识规则"
    fi
  fi

  # ---- 3. 客观规律违规检测（硬门禁：检测代码中违反通用常识的模式）----
  # 3a. 安全常识：密码明文存储
  # R118-D5（nest-forge 实证）：排除词表补 \.spec\. / \.test\. / \.e2e-spec\. 路径形态——
  # _scan_src 的 grep -v 作用于整行（含路径前缀），词表只认 test/mock 词时 *.spec.ts
  # 测试夹具密码（password: 'super-secret-1'）照命中"明文存储"硬 fail，无豁免通道。
  # 测试夹具不是"存储的密码"：夹具密码永不入生产存储，排除语义与 gitleaks 路径
  # 排除（check_sensitive）对齐——同门禁族判定标准一致。
  local pwd_violation
  pwd_violation=$(_scan_src "password\s*[=:]\s*['\"][^'\"]+['\"]" 'ts,js,py,java' 'test\|mock\|node_modules\|placeholder\|example\|xxx\|yyy\|\.spec\.\|\.test\.\|\.e2e-spec\.\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}")
  if [[ -n "$pwd_violation" ]]; then
    fail "违反安全客观规律：检测到密码明文存储（密码必须哈希，不可明文）"
    echo "$pwd_violation" | head -3 | sed 's/^/    /'
    found=1
  fi
  # 3b. 数据库常识：SQL 拼接（非参数化）——排除词同 R118-D5 补路径形态
  local sql_violation
  sql_violation=$(_scan_src "SELECT.*\+.*FROM|INSERT.*\+.*VALUES|WHERE.*\+.*=" 'ts,js,py,java' 'test\|mock\|node_modules\|\.spec\.\|\.test\.\|\.e2e-spec\.\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}")
  if [[ -n "$sql_violation" ]]; then
    fail "违反数据库客观规律：检测到 SQL 字符串拼接（必须参数化查询，防注入）"
    echo "$sql_violation" | head -3 | sed 's/^/    /'
    found=1
  fi
  # 3c. 前端常识：v-html / dangerouslySetInnerHTML 直接拼接动态内容（排除 sanitize/renderMarkdown/DOMPurify 等消毒场景）
  local xss_violation
  xss_violation=$(_scan_src 'v-html|dangerouslySetInnerHTML|innerHTML\s*=' 'vue,svelte,tsx,jsx,ts,js' 'test\|mock\|node_modules\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}" \
    | grep -viE 'sanitize|renderMarkdown|DOMPurify|escape|encode|sanitizeHtml|marked\(|markdownit' || true)
  if [[ -n "$xss_violation" ]]; then
    warn "潜在前端客观规律违反：v-html/innerHTML 使用但未检测到消毒函数（sanitize/renderMarkdown/DOMPurify）。如已消毒请人工确认"
    echo "$xss_violation" | head -3 | sed 's/^/    /'
  fi
  # 3d. 并发常识：共享可变状态无锁
  local race_violation
  race_violation=$(_scan_src 'global\s+\w+\s*=|window\.\w+\s*=' 'ts,js' 'test\|mock\|node_modules\|config\|const\|readonly\|coverage\|dist\|target' "${WRITABLE_DIRS[@]+"${WRITABLE_DIRS[@]}"}")
  if [[ -n "$race_violation" ]]; then
    warn "潜在并发违规：检测到全局可变状态（共享可变状态须同步，否则竞态）"
  fi

  if [[ $found -eq 0 ]]; then
    if [[ -n "$spec_file" && -f "$spec_file" ]]; then
      pass "领域知识检查通过（无客观规律违规）"
    else
      # 保留既有完整通过文案（下游断言/用户脚本按此匹配），追加“领域段未检查”披露。
      pass "领域知识检查通过（无客观规律违规）——spec §18 未提供，领域段未检查"
    fi
  fi
}
