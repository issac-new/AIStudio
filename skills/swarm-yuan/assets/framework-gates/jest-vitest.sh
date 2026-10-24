# ruleset: jest-vitest  requires_conf: VITEST_CONFIG_GLOBS VITEST_TEST_GLOBS VITEST_CONFIG_FILE VITEST_FORBIDDEN_UPSTREAM_TEST JEST_CONFIG_GLOBS
# gates: fw_jest_test_location(warn) fw_jest_mock_hoisted(warn) fw_jest_snapshot_governance(warn) fw_jest_coverage_threshold(fail) fw_jest_jest_fn_to_vi(warn) fw_jest_environment(warn) fw_jest_setup_files(warn) fw_jest_globals(warn) fw_jest_in_source(warn) fw_jest_bench(warn) fw_jest_typecheck(warn) fw_jest_no_upstream_test(fail)
# harvested-from: P5 范例（2026-07-17），规律源自 Vitest 3.x/4.x 与 Jest 兼容官方文档；vitest 合并自 ncwk-dev precheck.sh:2633-2654 (2026-07-17)
_fw_jest_vitest_check() {
  echo "  [jest-vitest] Vitest 3.x/4.x（Jest 兼容）框架规律"

  # ---------- 收集配置文件（VITEST_CONFIG_GLOBS 优先，回退 VITEST_CONFIG_FILE 单文件）----------
  # R138：jest 侧配置此前零收集面——cfgarr 只装 vitest 配置，package.json 内嵌 jest 段
  # 与 jest.config.* 不进检查面，backend「配了 coverageThreshold 但 test 脚本无 --coverage」
  # 漏报（nest-forge 双包实证）。并入两源：① JEST_CONFIG_GLOBS（显式 conf）；
  # ② 自动发现——PROJECT_DIR 下 jest.config.{js,ts,mjs,cjs} + 含 "jest" 段的 package.json
  # （node_modules/dist 排除）。jest 配置进全部 jest-vitest 门禁（键名差异由各检查
  # 兼容：environment 检查大小写不敏感以认 Jest 的 testEnvironment）——R139 修正口径，
  # 旧注释「按文件名分流、jest 只喂 coverage」与实现不符，已按实现事实改写。
  local cfgs cfgarr=()
  cfgs=$(_fw_resolve_globs ${VITEST_CONFIG_GLOBS[@]+"${VITEST_CONFIG_GLOBS[@]}"} 2>/dev/null | sort -u)
  # 回退：GLOBS 未配置或无结果时，用 VITEST_CONFIG_FILE 单文件路径（兼容旧 conf / 单配置项目）
  if [[ -z "$cfgs" && -n "${VITEST_CONFIG_FILE:-}" && -f "${VITEST_CONFIG_FILE:-}" ]]; then
    cfgs="${VITEST_CONFIG_FILE:-}"
  fi
  if [[ "${JEST_CONFIG_GLOBS+x}" == "x" && ${#JEST_CONFIG_GLOBS[@]} -gt 0 ]]; then
    cfgs="$(printf '%s\n%s\n' "$cfgs" "$(_fw_resolve_globs ${JEST_CONFIG_GLOBS[@]+"${JEST_CONFIG_GLOBS[@]}"} 2>/dev/null)" | sed '/^$/d' | sort -u)"
  fi
  # R139：经进程替换直读（旧版落 /tmp/fw-jest-cfgs.$$ 临时文件再读回，注入 precheck.sh
  # 的 set -euo pipefail 上下文里，写入与 rm 之间任何失败/中断都残留临时文件且无 trap）。
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && cfgarr+=("$ln")
  done < <({
    printf '%s\n' "$cfgs"
    find "${PROJECT_DIR:-.}" -maxdepth 3 -type f \( -name 'jest.config.js' -o -name 'jest.config.ts' -o -name 'jest.config.mjs' -o -name 'jest.config.cjs' \) \
      -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' 2>/dev/null
    # 含内嵌 "jest" 配置段的 package.json（双包/monorepo 的 backend 侧典型形态）。
    # R139：判据收紧为「对象值形态」`"jest": {`——旧 `"jest":` 会把 devDependencies
    # 里的 jest 依赖声明（`"jest": "^29"`）也当配置段收集，任何依赖 jest 的 package.json
    # 都进检查面，逐包阈值判定下必误报「未配阈值」（r132 态E 实抓）。
    find "${PROJECT_DIR:-.}" -maxdepth 3 -name package.json -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' -exec grep -lE '"jest"[[:space:]]*:[[:space:]]*\{' {} + 2>/dev/null || true
  } | sed '/^$/d' | while IFS= read -r _cl; do printf '%s\n' "$_cl"; done \
    | awk -v pd="${PROJECT_DIR:-.}" 'index($0, pd "/") == 1 { print substr($0, length(pd) + 2); next } { print }' \
    | sort -u)

  # ---------- 收集测试文件（VITEST_TEST_GLOBS 优先，回退 VITEST_TEST_DIR_PATTERNS 旧约定）----------
  local tests testarr=()
  tests=$(_fw_resolve_globs ${VITEST_TEST_GLOBS[@]+"${VITEST_TEST_GLOBS[@]}"} 2>/dev/null | sort -u)
  # 回退：GLOBS 未配置或无结果时，用 VITEST_TEST_DIR_PATTERNS（ncwk-dev 旧约定，兼容未迁移 conf）
  if [[ -z "$tests" && -n "${VITEST_TEST_DIR_PATTERNS+x}" && ${#VITEST_TEST_DIR_PATTERNS[@]} -gt 0 ]]; then
    tests=$(_fw_resolve_globs ${VITEST_TEST_DIR_PATTERNS[@]+"${VITEST_TEST_DIR_PATTERNS[@]}"} 2>/dev/null | sort -u)
  fi
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && testarr+=("$ln")
  done <<< "$tests"

  if [[ ${#cfgarr[@]} -eq 0 && ${#testarr[@]} -eq 0 ]]; then
    warn "jest-vitest: VITEST_CONFIG_GLOBS / VITEST_TEST_GLOBS 未配置或无文件可检"
    return
  fi

  # ====================================================================
  # fw_jest_test_location(warn)：测试文件须在 config include 内
  # ====================================================================
  # 简化：测试文件路径须含 test/spec/__tests__ 约定（与 include 一致）
  local loc_bad=""
  local f
  for f in "${testarr[@]+"${testarr[@]}"}"; do
    if ! printf '%s' "$f" | grep -qE '\.test\.|\.spec\.|__tests__'; then
      loc_bad="${loc_bad}${f}
"
    fi
  done
  # 配置 include 须含 test/spec/__tests__
  local include_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE "include:|include =" "$c" 2>/dev/null; then
      if grep -qE 'test|spec|__tests__' "$c" 2>/dev/null; then
        include_ok=1
      fi
    fi
  done
  if [[ -n "$loc_bad" ]]; then
    warn "fw_jest_test_location: 测试文件不在 test/spec/__tests__ 约定位置（须与 vitest.config include 一致，否则不被收集）:
${loc_bad}"
  elif [[ "$include_ok" -eq 0 && ${#cfgarr[@]} -gt 0 ]]; then
    warn "fw_jest_test_location: vitest.config 未明确 include test/spec 约定"
  else
    pass "fw_jest_test_location: 测试位置约定与 include 一致"
  fi

  # ====================================================================
  # fw_jest_mock_hoisted(warn)：跨变量引用 mock 须用 vi.hoisted
  # 判据（vi.mock 提升语义下真正会 ReferenceError 的形态）：vi.mock factory 体内引用了
  # 模块顶层声明的标识符（const/let/var，且该标识符的声明不在 vi.hoisted(...) 内）。
  # 自包含工厂（只引用 vi 与工厂内部定义）与 import 绑定都不触发——import 由 ESM hoisting 保证。
  # ====================================================================
  local hoist_bad=""
  for f in "${testarr[@]+"${testarr[@]}"}"; do
    grep -qE "vi\.mock\(" "$f" 2>/dev/null || continue
    # 模块顶层声明的标识符 = 第 0 列的 const/let/var（排除 vi.hoisted 行上的声明）；缩进的局部变量不算
    local declared
    declared=$(grep -E "^(const|let|var)[[:space:]]+[A-Za-z_\$][A-Za-z0-9_\$]*" "$f" 2>/dev/null \
      | grep -vE 'vi\.hoisted\(' \
      | sed -E 's/^(const|let|var)[[:space:]]+([A-Za-z_\$][A-Za-z0-9_\$]*).*/\2/' | sort -u || true)
    [[ -z "$declared" ]] && continue
    # 扫描窗 = vi.mock( 行起，到第 0 列的 }) / ) 收口行止；括号在本行配平的单行调用只看本行
    local hit=0 name
    for name in $declared; do
      if awk -v id="$name" '
        function balanced(s,  o, c, t) { t=s; o=gsub(/\(/,"(",t); t=s; c=gsub(/\)/,")",t); return o==c && o>0 }
        {
          if (!inmock && $0 ~ /vi\.mock\(/) {
            if ($0 ~ ("[^A-Za-z0-9_$.]" id "[^A-Za-z0-9_$]")) {found=1; exit}
            if (!balanced($0)) inmock=1
            next
          }
          if (inmock) {
            if ($0 ~ ("[^A-Za-z0-9_$.]" id "[^A-Za-z0-9_$]")) {found=1; exit}
            if ($0 ~ /^\}?\)+;?[[:space:]]*$/) inmock=0
          }
        }
        END {exit !found}
      ' "$f" 2>/dev/null; then
        hit=1
        break
      fi
    done
    [[ "$hit" -eq 1 ]] && hoist_bad="${hoist_bad}${f}: vi.mock factory 引用模块顶层变量，须 vi.hoisted 提升（否则 mock 提升后 ReferenceError）
"
  done
  _fw_report warn fw_jest_mock_hoisted "$hoist_bad" "vi.mock factory 引用变量未用 vi.hoisted 提升（Vitest mock 提升到顶部，外部变量未定义 ReferenceError）" "未检出需 vi.hoisted 的 mock（或已用）"

  # ====================================================================
  # fw_jest_snapshot_governance(warn)：快照须有治理标记（禁无脑 --update）
  # ====================================================================
  local snap_bad=""
  for f in "${testarr[@]+"${testarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'toMatchSnapshot\(|toMatchInlineSnapshot\(' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && snap_bad="${snap_bad}${f}:${ln}
"
  done
  _fw_report warn fw_jest_snapshot_governance "$snap_bad" "检出快照断言（须定期评审 + 禁无脑 -u 更新，CI 须 --ci 防止生成新快照）" "未检出快照断言（或无快照风险）"

  # ====================================================================
  # fw_jest_coverage_threshold(fail)：覆盖率阈值存在且真实生效
  # ====================================================================
  # R119：同时接受 Jest `coverageThreshold` 与 Vitest `coverage.thresholds`，
  # 且必须同时存在数值阈值——旧版只匹配 `@vitest/coverage` 插件名，装插件没配阈值也假 pass。
  # R132（D1 根治，trade-forge 实抓）：配置通道 ≠ 生效通道——阈值已配但
  # ① vitest 项目的 @vitest/coverage-v8|istanbul 不在 package.json 依赖，或
  # ② 测试命令不带 --coverage 且 coverage.enabled/collectCoverage 未开，
  # 阈值从不执行，门禁对「配了但从不生效」假 pass。判定升级为三通道：
  # 阈值存在 + provider 就位（vitest 须装包；jest 内建免检）+ 执行通道开启。
  # R138（nest-forge 双包实抓）：三通道判定由「跨配置单变量聚合」改为「逐配置独立判定」——
  # 旧版 cov_exec 一包命中即全体 pass，frontend 开了 --coverage 就掩盖 backend 阈值从不执行；
  # 现逐 cfg 收集 provider 缺 / 执行通道未开两类失败面，任一包不达标即 fail 并点名。
  # R139 补全：R138 只覆盖「配了阈值但通道未就位」半个不达标面——「某配置完全没配数值阈值」
  # 在混合配置下（frontend 配了、backend 没配）被 cov_ok 单布尔吞掉静默 pass；现未配面也
  # 逐配置收集点名，与注释承诺的「任一包不达标即 fail」对齐（test-r138 混合夹具锁）。
  local cov_bad="" cov_nothr="" cov_cfg_pkg _c_exec _c_prov
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    # R138-6c：数值阈值 ERE 容引号——package.json 内嵌 jest 段是 "lines": 50（键值皆带引号），
    # 旧 ERE 只认 JS/YAML 裸形态 lines: 50，jest 段配了阈值也从不进三通道判定（假"未配"）。
    if ! grep -qE 'coverageThreshold|coverage\.thresholds|[[:space:]]thresholds[[:space:]]*:' "$c" 2>/dev/null \
       || ! grep -qE '["'\'']?(lines|branches|functions|statements)["'\'']?[[:space:]]*:[[:space:]]*["'\'']?[0-9]+' "$c" 2>/dev/null; then
      cov_nothr="${cov_nothr}${c}
"
      continue
    fi
    _c_exec=0; _c_prov=1
    # 执行通道之一：配置内直接开启（vitest coverage.enabled / jest collectCoverage）
    grep -qE 'coverage\.enabled[[:space:]]*:[[:space:]]*true|collectCoverage[[:space:]]*:[[:space:]]*true' \
      "$c" 2>/dev/null && _c_exec=1
    # provider 核验 + 执行通道之二：配置同目录 package.json（devDeps + test 脚本）
    cov_cfg_pkg="$(dirname "$c")/package.json"
    if [[ -f "$cov_cfg_pkg" ]]; then
      # vitest 项目（vitest/vite 命名配置）须装 provider 包；jest 内建覆盖率免检
      case "$(basename "$c")" in
        vitest.config.*|vite.config.*)
          grep -qE '"@vitest/coverage-(v8|istanbul)"' "$cov_cfg_pkg" 2>/dev/null || _c_prov=0
          ;;
      esac
      grep -qE -- '--coverage' "$cov_cfg_pkg" 2>/dev/null && _c_exec=1
    else
      # 无 package.json 的 vitest 命名配置：provider 无从安装，同判缺失
      case "$(basename "$c")" in
        vitest.config.*|vite.config.*) _c_prov=0 ;;
      esac
    fi
    if [[ "$_c_prov" -eq 0 ]]; then
      cov_bad="${cov_bad}${c}（provider @vitest/coverage-v8|istanbul 未在同目录 package.json 依赖）
"
    elif [[ "$_c_exec" -eq 0 ]]; then
      cov_bad="${cov_bad}${c}（test 脚本不带 --coverage 且 coverage.enabled/collectCoverage 未设 true）
"
    fi
  done
  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    pass "fw_jest_coverage_threshold: 无配置文件，跳过"
  elif [[ -n "$cov_nothr" ]]; then
    fail "fw_jest_coverage_threshold: 未配覆盖率阈值（Jest coverageThreshold 或 Vitest coverage.thresholds；无阈值则覆盖率无门禁，回归无感知；逐包判定以下配置未配）: $(printf '%s' "$cov_nothr" | tr '\n' ' ')"
  elif [[ -n "$cov_bad" ]]; then
    fail "fw_jest_coverage_threshold: 阈值已配但以下配置的生效通道未就位（配置通道≠生效通道，逐包独立判定）：$(printf '%s' "$cov_bad" | tr '\n' ' ')"
  else
    pass "fw_jest_coverage_threshold: 已配覆盖率阈值且各配置执行通道均就位（provider 依赖 + --coverage/enabled）"
  fi

  # ====================================================================
  # fw_jest_jest_fn_to_vi(warn)：禁残留 Jest API（jest.fn/jest.mock）
  # 纯 Jest 项目（无 vitest 依赖/配置）jest.fn 是正确 API——此门禁不适用，诚实跳过。
  # 判据：package.json devDependencies 无 vitist/vitest && 无 vitest.config.* && 无 vite.config.* 含 test 段
  # 纯 Jest 项目（无 vitest 依赖/config）jest.fn 是正确 API——guard 跳过检测
  local _vitest_present=0
  if grep -q '"vitest"' "${PROJECT_DIR:-.}/package.json" 2>/dev/null \
     || find "${PROJECT_DIR:-.}" -maxdepth 2 \( -name 'vitest.config.*' -o -name 'vitest.setup.*' \) 2>/dev/null | grep -q .; then
    _vitest_present=1
  fi
  if [[ "$_vitest_present" -eq 0 ]]; then
    pass "fw_jest_jest_fn_to_vi: 纯 Jest 项目（无 vitest）——jest.fn/jest.mock 为正确 API，此门禁不适用"
  elif true; then  # guard（非 else——保持后续门禁流不变）
  # ====================================================================
  local jest_bad=""
  for f in "${testarr[@]+"${testarr[@]}"}"; do
    local ln
    ln=$(grep -nE '\bjest\.(fn|mock|spyOn|useFakeTimers|clearAllMocks)\(' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && jest_bad="${jest_bad}${f}:${ln}
"
  done
  _fw_report warn fw_jest_jest_fn_to_vi "$jest_bad" "检出残留 Jest API（Vitest 须用 vi.fn/vi.mock，Jest API 仅兼容模式可用）" "未检出残留 Jest API（已用 vi.*）"
  fi  # guard 关口

  # ====================================================================
  # fw_jest_environment(warn)：须显式配置 environment（jsdom/happy-dom/node）
  # R139：-i 兼容 Jest 键名——Vitest 是 environment:，Jest 是 testEnvironment:
  # （大写 E），旧大小写敏感 grep 对纯 Jest 项目已配 testEnvironment 仍误报「未配」。
  # ====================================================================
  local env_ok=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'environment:' "$c" 2>/dev/null; then
      env_ok=1
    fi
  done
  if [[ ${#cfgarr[@]} -eq 0 ]]; then
    pass "fw_jest_environment: 无配置文件，跳过"
  elif [[ "$env_ok" -eq 1 ]]; then
    pass "fw_jest_environment: 已显式配置 environment"
  else
    warn "fw_jest_environment: 未配 environment（默认 node，DOM 测试须 jsdom/happy-dom，否则 document undefined）"
  fi

  # ====================================================================
  # fw_jest_setup_files(warn)：DOM 环境须配 setupFiles（@testing-library/jest-dom）
  # ====================================================================
  local setup_hit=0 dom_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    grep -qE 'setupFiles' "$c" 2>/dev/null && setup_hit=1
    grep -qE 'jsdom|happy-dom' "$c" 2>/dev/null && dom_hit=1
  done
  if [[ "$dom_hit" -eq 0 ]]; then
    pass "fw_jest_setup_files: 非 DOM 环境，跳过 setupFiles"
  elif [[ "$setup_hit" -eq 1 ]]; then
    pass "fw_jest_setup_files: DOM 环境已配 setupFiles"
  else
    warn "fw_jest_setup_files: DOM 环境未配 setupFiles（须引入 @testing-library/jest-dom 扩展 matcher）"
  fi

  # ====================================================================
  # fw_jest_globals(warn)：禁开 globals: true（显式 import 更安全）
  # ====================================================================
  local g_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'globals:[[:space:]]*true' "$c" 2>/dev/null; then
      g_hit=1
    fi
  done
  if [[ "$g_hit" -eq 1 ]]; then
    warn "fw_jest_globals: globals: true（全局 describe/it 污染全局作用域，推荐显式 import { describe, it } from 'vitest'）"
  else
    pass "fw_jest_globals: 未开 globals（或已显式 import）"
  fi

  # ====================================================================
  # fw_jest_in_source(warn)：in-source testing 须隔离 if(import.meta.vitest)
  # ====================================================================
  local insrc_bad=""
  for f in "${testarr[@]+"${testarr[@]}"}"; do
    : # 测试文件本身不算 in-source
  done
  # 检查配置是否声明了 in-source 约定但无对应隔离（简化：配置含 include src 即提示）
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE "include:.*src/" "$c" 2>/dev/null; then
      insrc_bad="${c}: in-source testing 须用 if(import.meta.vitest) 隔离 + 生产构建剔除"
    fi
  done
  _fw_report warn fw_jest_in_source "$insrc_bad" "配置 include src/（in-source testing 须 if(import.meta.vitest) 隔离，否则生产打包含测试）" "无 in-source 配置（或已隔离）"

  # ====================================================================
  # fw_jest_bench(warn)：benchmark 须用 .bench.ts 约定
  # ====================================================================
  local bench_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'bench' "$c" 2>/dev/null; then
      bench_hit=1
    fi
  done
  if [[ "$bench_hit" -eq 1 ]]; then
    pass "fw_jest_bench: 已配置 benchmark"
  else
    warn "fw_jest_bench: 未配 benchmark（性能敏感模块须 .bench.ts 基准，防回归）"
  fi

  # ====================================================================
  # fw_jest_typecheck(warn)：类型测试须启用 typecheck
  # ====================================================================
  local tc_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'typecheck' "$c" 2>/dev/null; then
      tc_hit=1
    fi
  done
  if [[ "$tc_hit" -eq 1 ]]; then
    pass "fw_jest_typecheck: 已启用 typecheck"
  else
    warn "fw_jest_typecheck: 未启 typecheck（类型断言测试须 typecheck: { enabled: true }）"
  fi

  # ====================================================================
  # fw_jest_no_upstream_test(fail)：禁在只读 upstream 目录新增测试文件
  # （合并自原 vitest.sh，门禁 id 由 fw_vitest_no_upstream_test 改名以遵循 fw_jest_ 命名规范）
  # ncwk 仓库契约：upstream/ 子目录全为只读第三方快照，prune 掉 upstream/<子包>/，
  # 仅保留对 upstream/ 直属文件的检测。迁移到其他仓库时须按该仓库只读目录约定调整 prune 路径。
  # 2026-07-20 沉睡修复：prune 原为 -path "./upstream/*"，upstream/ 直属文件亦被剪掉，
  # 门禁永不命中（实测 upstream/direct.test.ts 修复前不打印、修复后打印且 upstream/pkg/ 嵌套仍 prune）；
  # 改 -path "./upstream/*/*" 后行为与上行注释意图一致，pass/fail 输出行未动。
  # ====================================================================
  if [[ -n "${VITEST_FORBIDDEN_UPSTREAM_TEST:-}" ]]; then
    local up_hits
    up_hits=$( { find . \( -path ./node_modules -o -path "./upstream/*/*" \) -prune -o -name "*.test.ts" -print 2>/dev/null | grep -E "$VITEST_FORBIDDEN_UPSTREAM_TEST" | head -5 || true; } )
    if [[ -z "$up_hits" ]]; then
      pass "fw_jest_no_upstream_test: 无 upstream 直属测试文件"
    else
      fail "fw_jest_no_upstream_test: 检出 upstream 测试文件（违反只读）:
${up_hits}"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
