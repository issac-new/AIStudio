#!/usr/bin/env bash
# generator/subcommands.sh — generate-skill.sh 子命令拦截块（--rollback-frameworks /
# --inject-frameworks / --verify-completeness / --version / --check-framework-globs /
# --mark-active / --render-tools / --refresh）。
# 由主文件在函数定义与 conf.sh 加载之后 source——执行序与拆分前逐字节一致；
# 块内代码直调此前定义的函数，互不封装（行为保持式拆分，挂账清偿批次六）。
if [[ "${1:-}" == "--rollback-frameworks" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --rollback-frameworks <skill-dir>"; exit 1; }
  rollback_frameworks "$2"
  exit $?
fi

if [[ "${1:-}" == "--inject-frameworks" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --inject-frameworks <skill-dir> [--remove <fw>]"; exit 1; }
  # F4（dsh 吸收·定向移除）：--remove <fw> 先从 conf 的 ACTIVE_FRAMEWORKS 移除该框架，
  # 再走常规注入（区块重建 + F1 sync 自动回收其死变量）——此前移除框架无路径，只能手改。
  REMOVE_FW=""
  if [[ "${3:-}" == "--remove" && -n "${4:-}" ]]; then
    REMOVE_FW="$4"
  fi
  inject_frameworks "$2"
  exit $?
fi

# --remove 的 conf 编辑：由 inject_frameworks 在快照之后直接调用（效果快照含移除前状态，
# 回滚才能完整撤销）。


# ============================================================
# --verify-completeness 子命令（独立于 create/upgrade，单独拦截）
# 用法: bash generate-skill.sh --verify-completeness <skill-dir>
# 无占位符机器执法：扫描目标 skill 的 SKILL.md / references/*.md /
# scripts/precheck.conf / hooks/hooks.json（存在才查），命中占位符模式
# 或未勾 checkbox（- [ ]）则打印 file:line 清单并 exit 1；零命中 exit 0。
# 调用追踪机器执法（设计理念 2）：references/workflow.md 每个节点段
# （## 节点… 标题起）须含「调用追踪」要素，缺则列 file:line 并 exit 1。
# ============================================================
# R126：_vc_proj_root 与 _detect_delivery_shapes 前置到子命令分发点之前定义——
# 旧版 _detect_delivery_shapes 定义在文件后段（create 流），--verify-completeness/
# --mark-active 在中段拦截即 exit，函数与 _DELIVERY_SHAPES 变量对该路径不可见，
# 「交付形态 DoD 在位性」执法自 2026-10-11 落地起从未触发（死代码）。前置后
# verify_completeness 就地懒计算（按技能 conf 推导项目根），create 流调用点不变。
_vc_proj_root() {  # $1=skill_dir → stdout 项目根（①环境 PROJECT_DIR ②技能 conf 链 ③旧布局推导；空=未知）
  local _sd="$1" _pr
  _pr="${PROJECT_DIR:-}"
  if [[ -z "$_pr" && -f "$_sd/scripts/precheck.conf" ]]; then
    # Task 2：conf_* 链式求值（含 %q/注释/单引号语义均由 source 本身消化，
    # 旧 grep 版须手工剥注释剥引号且漏 patch/industry 覆盖）。
    _pr="$(conf_value PROJECT_DIR "$_sd")"
    # 占位符形态（draft 未回填 <项目根绝对路径>）不当真值消费（同判据）
    case "$_pr" in "<"*">") _pr="" ;; esac
  fi
  if [[ -z "$_pr" ]]; then
    _pr="$(cd "$_sd/../../.." 2>/dev/null && pwd)"
  fi
  printf '%s' "$_pr"
}

# ── 交付形态嗅探（2026-10-11 平台根治：交付六型 DoD 盖章，run14 教训——单测全绿≠可运行）──
# 形态标记与每型运行证据的正本=AIStudio custom/server/delivery-contract；此处仅嗅探呈现，AI 核正后写入 DoD。
_detect_delivery_shapes() {
  local d="$1" out=""
  # R126：mini-program 嗅探补 maxdepth 3 与排除链（旧版全树 find 不排 node_modules/.git，
  # 大仓 create/verify 时此嗅探成主要耗时点；对齐下方各判据既有限深约定）
  if find "$d" -maxdepth 3 \( -name '*.wxml' -o -name '*.axml' -o -name 'project.config.json' -o -name 'mini.project.json' \) \
      -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    out="mini-program（运行证据=真开发者工具 runtime-proof：编译+启动+首帧，launchOk/screenshot/checkedAt）"
  fi
  if find "$d" -maxdepth 3 \( -name 'vite.config.*' -o -name 'next.config.*' -o -name 'index.html' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    out="${out:+${out}；}web-frontend（运行证据=真实浏览器走查帧）"
  fi
  # backend-service 判据（R106-D9 扩容：原 Dockerfile/src/server* 偏 JS——Go/Django/JVM 后端全漏，
  # go-forge 回归实证 13 条 REST 路由只因 internal/ 布局嗅不出形态）。任一命中即计一次（去重防拼接）。
  local _be_svc=0
  if find "$d" -maxdepth 3 \( -name 'Dockerfile' -o -path '*/src/server*' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 3 -name 'go.mod' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q . && \
     { find "$d" -maxdepth 3 \( -name 'main.go' -o -name 'cmd' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; }; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 3 -name 'manage.py' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 2 \( -name 'pom.xml' -o -name 'build.gradle' -o -name 'build.gradle.kts' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  # R108-D1：Cargo.toml 是 Rust 服务的工程清单（同 go.mod/manage.py 家族）——原判据缺位，
  # rust-forge 回归实证 axum 后端 5 条 REST 路由只嗅出 web-frontend、backend-service 全漏
  # （⑥/⑨ 节点缺启动冒烟 DoD 要求）。maxdepth 3 对齐 go.mod（含 workspace 子 crate 布局）。
  if [[ "$_be_svc" -eq 0 ]] && find "$d" -maxdepth 3 -name 'Cargo.toml' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    _be_svc=1
  fi
  if [[ "$_be_svc" -eq 1 ]]; then
    out="${out:+${out}；}backend-service（运行证据=启动冒烟日志+跨模块契约测试）"
  fi
  if find "$d" -maxdepth 3 \( -path '*android/app/build.gradle*' -o -name 'project.pbxproj' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | grep -q .; then
    out="${out:+${out}；}mobile-app（运行证据=模拟器/真机安装启动）"
  fi
  echo "${out:-未嗅探到运行面形态（governance-doc/library-sdk 类由 AI 按任务判定并在 DoD 声明证据面）}"
}

# ============================================================
# R128：verify_completeness 行为保持式拆分——六件检查各自成子函数，stdout 返回
# 检查结果（段间不共享局部状态），编排器只做拼装与终局裁决。文案/扫描顺序/退出码
# 与拆分前逐字一致（前后产物 diff 基线见 tests/test-r128-function-size.sh 头注）。
# 子函数必须前置定义：--verify-completeness/--mark-active 在文件中段拦截即 exit，
# 定义在后段对这两个调用面不可见（R126 同型教训）。
# ============================================================
# 收集检查目标（存在才查；空数组在 bash 3.2 + set -u 下须用 ${arr[@]+...} 防空崩）。
# 追加顺序 = grep 扫描顺序（grep 按参数序输出 file:line），不可调换。
_vc_collect_targets() {  # $1=skill_dir → stdout 逐行检查目标（无目标=无输出）
  local skill_dir="$1"
  local targets=() f _uff
  [[ -f "$skill_dir/SKILL.md" ]] && targets+=("$skill_dir/SKILL.md")
  for f in "$skill_dir"/references/*.md; do
    [[ -f "$f" ]] && targets+=("$f")
  done
  [[ -f "$skill_dir/scripts/precheck.conf" ]] && targets+=("$skill_dir/scripts/precheck.conf")
  # WP-R P3-3: precheck.arch.conf 也含 --inject-frameworks 注入的 TODO 占位符,须纳入扫描
  [[ -f "$skill_dir/scripts/precheck.arch.conf" ]] && targets+=("$skill_dir/scripts/precheck.arch.conf")
  # R126-MED9：USER_FILLABLE_FILES 两件（snippets/mcp-tools，模板用「（填入…）」占位风格）
  # 与 compliance conf 此前不在扫描面——完全没填也能过 --mark-active --strict 占位符清零关。
  [[ -f "$skill_dir/scripts/precheck.compliance.conf" ]] && targets+=("$skill_dir/scripts/precheck.compliance.conf")
  for _uff in ${USER_FILLABLE_FILES[@]+"${USER_FILLABLE_FILES[@]}"}; do
    [[ -f "$skill_dir/$_uff" ]] && targets+=("$skill_dir/$_uff")
  done
  [[ -f "$skill_dir/hooks/hooks.json" ]] && targets+=("$skill_dir/hooks/hooks.json")
  # commands/*.md 骨架模板内嵌数字可能漂移（G6），纳入无占位符扫描
  for f in "$skill_dir"/commands/*.md; do
    [[ -f "$f" ]] && targets+=("$f")
  done
  [[ ${#targets[@]} -eq 0 ]] && return 0
  for f in "${targets[@]}"; do printf '%s\n' "$f"; done
}

# P0 占位符扫描：grep -F 固定串多模式（-e 叠加），三平台兼容；输出 file:line:内容 清单。
# 占位符四模式（骨架未填充痕迹）：待填充/（待填充）/<占位符>/填充指引
# WP-Q4 P0/P1 分级机器化：占位符所在行含「P1 待补」或「P1待补」→ 归 P1；否则归 P0。
_vc_scan_placeholders() {  # $@=目标文件 → stdout P0 占位符命中清单
  local p0_hits
  # R126-MED9：占位符四模式补「（填入」——USER_FILLABLE_FILES 模板（snippets/mcp-tools）
  # 的占位风格是「# （填入项目实际的…）」，四词族此前全不命中。
  p0_hits=$(grep -Fn -e '待填充' -e '（待填充）' -e '<占位符>' -e '填充指引' -e '（填入' \
    "$@" 2>/dev/null | grep -vE 'P1[[:space:]]*待补' || true)
  printf '%s' "$p0_hits"
}

# P1 占位符扫描：四词族命中且行含 P1 标记 + 「（P1 待补）」独立标记兜底合并
# （R66-A1 kb66 演练实证：骨架 emit 的 P1 行不含四词则 p0/p1 双不命中，
#  template-spec「--mark-active 前清零」成空承诺。修：P1 标记独立 grep 兜底合并）。
_vc_scan_p1() {  # $@=目标文件 → stdout P1 占位符命中清单
  local p1_hits
  p1_hits=$(grep -Fn -e '待填充' -e '（待填充）' -e '<占位符>' -e '填充指引' -e '（填入' \
    "$@" 2>/dev/null | grep -E 'P1[[:space:]]*待补' || true)
  if [[ $# -gt 0 ]]; then
    p1_hits=$(printf '%s
%s
' "$p1_hits" "$(grep -Fn -e 'P1 待补' -e '（P1 待补）' "$@" 2>/dev/null || true)" | grep -v '^$' || true)
  fi
  printf '%s' "$p1_hits"
}

# 未勾 checkbox（- [ ]）扫描：仅骨架"填充指引"清单算占位；
# 目标 skill 的"完成检查表/流程完成检查表"段是给使用者运行中勾选的，剔除该段防误伤。
# 实现：对每个目标文件用 awk 标记"检查表段"区间，仅输出段外的 - [ ] 行。
_vc_scan_checkboxes() {  # $@=目标文件 → stdout 未勾 checkbox 命中清单
  local cb_hits="" tf out
  for tf in "$@"; do
    [[ -f "$tf" ]] || continue
    out=$(awk '
      /^#+ .*(检查表|检查清单|自检|审查清单|裁决条款|清单（)/ { intable=1; next }
      /^#+ / { intable=0 }
      # 九轮复盘：排除 ``` 代码块——gsd-patterns.md/cognitive-bias.md 等 UNIVERSAL_FILES
      # 模板里的 ```markdown 示例（破窗清单格式演示）含 - [ ]，是正确的方法论示例，
      # 非待清无占位符。原未排除代码块，导致 --mark-active 永远拒绝（E2E Step ⑧ 死锁）。
      # /^```/ 行首匹配 fence 边界，toggle 翻转；完整配对 fence 正确，
      # 未闭合 fence 把块内全判为 incode（保守不误报，可接受）。
      /^```/ { incode=!incode; next }
      # 真 checkbox 判定：行首（可有缩进）的 "- [ ]"。
      # 反引号引用（`- [ ]`）是方法论说明文字（如 gsd-patterns.md L181/185/187 讲解语法），
      # 非行首 checkbox，不匹配；与上方代码块排除同批修复 E2E Step ⑧ 死锁。
      /^[[:space:]]*- \[ \]/ && !intable && !incode { print FILENAME":"FNR":"$0 }
    ' "$tf" 2>/dev/null || true)
    [[ -n "$out" ]] && cb_hits="${cb_hits}${cb_hits:+
}${out}"
  done
  printf '%s' "$cb_hits"
}

# 调用追踪要素机器执法（理念 2：全链路追踪落实到 workflow 模板）：
# workflow.md 每个「## 节点…」段须含「调用追踪」字样（第 ⑨ 要素）。
# R52 补强：每节点段另须含「方法论引用」字样（第 ⑩ 要素——引用本节点消费的 references 档，
# 与 task-methodology-router §文档路由表消费节点序互为正反；节点级实载分派由本断言守）。
# 骨架阶段（待填充）已被占位符检查拦截；此处针对已填充内容。
# 无节点段（项目裁剪后无 workflow 节点）不查，放行。无 workflow.md 文件亦放行（空输出）。
_vc_check_workflow() {  # $1=skill_dir → stdout 节点要素/交付形态 DoD 缺失清单
  local skill_dir="$1"
  local wf="$skill_dir/references/workflow.md" trace_miss=""
  if [[ -f "$wf" ]]; then
    # 节点段标题判定：标题行含「节点」且含冒号（如「## 节点①：需求理解」）。
    # 不用正则字符类匹配①-⑩/CJK数字——BSD awk 20200816 把多字节字符类按字节解析
    # 导致 [一] 匹配任意 ASCII 字符（已实测）。index() 固定子串匹配对 UTF-8 安全。
    # 交付形态 DoD 在位性（2026-10-11 根治）：嗅探到运行面形态而 workflow 无「交付形态」段=留痕
    # R126 接线：旧版依赖 create 流才赋值的 _DELIVERY_SHAPES——verify/mark-active 路径
    # 该变量恒空，本检查自落地起从未触发；且 trace_miss 紧接着被下方 awk 赋值整体覆盖
    # （双保险双失效）。改为就地懒计算（按技能 conf 推导项目根，_vc_proj_root 单一解析），
    # 结果用追加不用覆盖。
    local _vc_shapes _vc_proj
    _vc_shapes="${_DELIVERY_SHAPES:-}"
    if [[ -z "$_vc_shapes" ]]; then
      _vc_proj=$(_vc_proj_root "$skill_dir")
      [[ -n "$_vc_proj" && -d "$_vc_proj" ]] && _vc_shapes=$(_detect_delivery_shapes "$_vc_proj")
    fi
    if [[ -n "$_vc_shapes" && "$_vc_shapes" != 未嗅探到* ]] && ! grep -q '交付形态' "$wf"; then
      trace_miss="${trace_miss}${trace_miss:+$'\n'}references/workflow.md: 缺交付形态 DoD 段（嗅探到 ${_vc_shapes}——⑤/⑥/⑨ 节点须按形态写运行证据与 RUNTIME-结论行，单测全绿≠可运行）"
    fi
    local _wf_miss
    _wf_miss=$(awk '

      /^## / && index($0, "节点") > 0 && (index($0, "：") > 0 || index($0, ":") > 0) {
        if (node != "" && !has) print FILENAME":"line": 节点段缺追踪要素（R13 4 要素模型：⑥ 产出物与追踪段须含 trace-log.sh 调用）: " node
        if (node != "" && !meth) print FILENAME":"line": 节点段缺方法论引用要素（R52 补强：⑩ 方法论引用须含 references 档，互为正反 task-methodology-router 路由表）: " node
        node=$0; line=FNR; has=0; meth=0; next
      }
      /调用追踪|trace-log\.sh/ { has=1 }
      /方法论引用/ { meth=1 }
      END {
        if (node != "" && !has) print FILENAME":"line": 节点段缺追踪要素（R13 4 要素模型：⑥ 产出物与追踪段须含 trace-log.sh 调用）: " node
        if (node != "" && !meth) print FILENAME":"line": 节点段缺方法论引用要素（R52 补强：⑩ 方法论引用须含 references 档，互为正反 task-methodology-router 路由表）: " node
      }
    ' "$wf" 2>/dev/null || true)
    [[ -n "$_wf_miss" ]] && trace_miss="${trace_miss}${trace_miss:+$'\n'}${_wf_miss}"
  fi
  printf '%s' "$trace_miss"
}

# R21-A：任务配方结构执法——recipes.md 存在（standard/compliance 档骨架）时：
#   ① §A 业务功能清单 / §B 任务配方 两节标题须存在；② 每个「### 配方」段须含五要素
#   （触发场景/前置查询/复用件/胶水/门禁与验证）——填完后丢要素在此被抓，不靠 AI 自觉。
# BSD awk 多字节安全：index() 固定子串匹配（同上 trace_miss 先例，不用字符类正则）。
_vc_check_recipes() {  # $1=skill_dir → stdout recipes 节/五要素缺失清单
  local rcp="$1/references/recipes.md" recipes_miss=""
  if [[ -f "$rcp" ]]; then
    LC_ALL=C grep -q '业务功能清单' "$rcp" 2>/dev/null || recipes_miss="$rcp: 缺 §A 业务功能清单节（既有业务功能实现编目，R21 配方层）"
    LC_ALL=C grep -q '任务配方' "$rcp" 2>/dev/null || recipes_miss="${recipes_miss}${recipes_miss:+
}$rcp: 缺 §B 任务配方节（五要素配方，R21 配方层）"
    local _rcp_out
    _rcp_out=$(LC_ALL=C awk '
      function chk() {
        if (node == "") return
        miss = ""
        if (index(blk, "触发场景") == 0) miss = miss " 触发场景"
        if (index(blk, "前置查询") == 0) miss = miss " 前置查询"
        if (index(blk, "复用件") == 0) miss = miss " 复用件"
        if (index(blk, "胶水") == 0) miss = miss " 胶水"
        if (index(blk, "门禁与验证") == 0) miss = miss " 门禁与验证"
        if (miss != "") print FILENAME":"line": 配方段缺五要素（"miss" ）: " node
      }
      /^## / { chk(); node=""; next }
      /^### / && index($0, "配方") > 0 { chk(); node=$0; line=FNR; blk=""; next }
      /^### / { chk(); node=""; next }
      { if (node != "") blk = blk $0 "\n" }
      END { chk() }
    ' "$rcp" 2>/dev/null || true)
    [[ -n "$_rcp_out" ]] && recipes_miss="${recipes_miss}${recipes_miss:+
}$_rcp_out"
  fi
  printf '%s' "$recipes_miss"
}

# R21-B：dev-guide「开发偏好」固定节存在性核验（整节被删即命中；
# 内容允许"暂无已记录偏好"诚实降级——占位符扫描管填充，此处只管节不丢）。
_vc_check_dev_guide() {  # $1=skill_dir → stdout 固定节缺失行（无缺失=空输出）
  local dg="$1/references/dev-guide.md"
  if [[ -f "$dg" ]] && ! LC_ALL=C grep -q '开发偏好' "$dg" 2>/dev/null; then
    printf '%s' "$dg: 缺「开发偏好」节（R21-B 固定节——开发者实际习惯承接位，无来源写「暂无已记录偏好」）"
  fi
}

# G1：decisions.jsonl 校验 ① 每行 JSON 合法性 ② UserChallenge 行五要素非空（文件不存在不告警——draft 期允许空）
# 决策账本有双账——trace-log --decision 与 SKILL.md
# 填充指引都写项目侧 .swarm-yuan/decisions.jsonl，本核验此前只认技能侧账本，按文档执行即死锁
# （audit-closure 已合并一侧，此处是另一半）。技能侧缺账时回退项目侧/codex 技能侧。
# 自定义 target-dir 形态的决策账本回退：
# 项目根原从 skill_dir 上三级派生（.claude/skills/<name> 布局假设）——自定义 target-dir
# 生成的技能（同级目录布局）上三级不是项目根，回退失明 → --strict 误报
# 「缺少决策记录」死锁。修法对齐 detect-profile-drift.sh:39 同族三级解析：
# ① 环境 PROJECT_DIR ② 技能自身 precheck.conf 的 PROJECT_DIR= ③ 旧布局推导兜底。
# C2: --strict 模式下强制 decisions.jsonl 至少 1 条记录（spec-template §2 决策记录契约：
# --mark-active 前须≥1 决策；UserChallenge 类决策须带 missing_context/cost_if_wrong）
# draft 期（非 strict）允许空；strict 时文件缺失或零记录均记为 hit。
_vc_check_decisions() {  # $1=skill_dir $2=strict（--strict 或空）→ stdout 决策校验缺失清单
  local skill_dir="$1" strict="${2:-}"
  local dec_file="$skill_dir/.swarm-yuan/decisions.jsonl" decisions_miss=""
  if [[ ! -s "$dec_file" ]]; then
    # R126：三级解析收敛为 _vc_proj_root 单一实现（verify_completeness 前置定义处），
    # 与交付形态 DoD 懒计算共用同一项目根推导——两份手抄解析是漂移源。
    local _dc _proj_root
    _proj_root=$(_vc_proj_root "$skill_dir")
    for _dc in "${_proj_root:-X}/.swarm-yuan/decisions.jsonl" \
               "${_proj_root:-X}"/.codex/skills/*/.swarm-yuan/decisions.jsonl; do
      [[ -s "$_dc" ]] && { dec_file="$_dc"; break; }
    done
  fi
  if [[ -f "$dec_file" ]]; then
    if command -v python3 >/dev/null 2>&1; then
      local py_out
      py_out=$(python3 -c '
import sys, json
for i, line in enumerate(sys.stdin, 1):
    line = line.strip()
    if not line: continue
    try:
        obj = json.loads(line)
    except Exception as e:
        print("%d: 非法JSON (%s)" % (i, e))
        continue
    if not isinstance(obj, dict):
        print("%d: 决策记录必须是JSON对象" % i)
        continue
    typ = obj.get("type")
    if not typ or not (obj.get("ai_suggestion") or obj.get("suggestion")) or not obj.get("user_action"):
        print("%d: 决策记录缺 type/ai_suggestion/user_action 非空字段" % i)
    if typ == "UserChallenge:incomplete":
        print("%d: UserChallenge:incomplete 不得作为完整决策激活" % i)
    elif typ == "UserChallenge":
        for k in ("alternatives", "missing_context", "cost_if_wrong"):
            if not obj.get(k):
                print("%d: UserChallenge 缺 %s" % (i, k))
' < "$dec_file" 2>/dev/null || true)
      [[ -n "$py_out" ]] && decisions_miss=$(printf '%s\n' "$py_out" | sed "s|^|$dec_file:|")
    else
      # 降级：grep 字段存在性（bash 3.2 兼容，不阻塞）
      local ln=0 dline
      while IFS= read -r dline; do
        ln=$((ln + 1))
        echo "$dline" | grep -q '"type"' || { decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: 非法JSON（缺 type 字段）"; continue; }
        echo "$dline" | grep -q '"type":"UserChallenge"' || continue
        echo "$dline" | grep -q '"alternatives"' || decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: UserChallenge 缺 alternatives"
        echo "$dline" | grep -q '"missing_context"' || decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: UserChallenge 缺 missing_context"
        echo "$dline" | grep -q '"cost_if_wrong"' || decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file:$ln: UserChallenge 缺 cost_if_wrong"
      done < "$dec_file"
    fi
  fi
  if [[ "$strict" == "--strict" ]]; then
    local _dec_cnt=0
    if [[ -f "$dec_file" ]]; then
      # R126：grep -c 零命中时打印 0 且 exit 1——pipefail 下无 || true 兜底会被 set -e
      # 静默中止（decisions.jsonl 存在但零有效行正是本分支要抓的「零记录」情形）。
      _dec_cnt=$(grep -c '.' "$dec_file" 2>/dev/null | xargs || true)
    fi
    if [[ "$_dec_cnt" -eq 0 ]]; then
      decisions_miss="${decisions_miss}${decisions_miss:+$'\n'}$dec_file: 缺少决策记录（--mark-active 须≥1 条，spec-template §2 契约；UserChallenge 须带 missing_context/cost_if_wrong）"
    fi
  fi
  printf '%s' "$decisions_miss"
}

# 终局裁决：hits 非空 → 按 draft/strict 分级放行或拦截；空 → P1 单独 warn + 通过。
_vc_report() {  # $1=hits $2=p1_hits $3=p1_cnt $4=status $5=strict → rc 0/1
  local hits="$1"
  local p1_hits="$2"
  local p1_cnt="$3"
  local _vc_status="$4"
  local strict="${5:-}"
  if [[ -n "$hits" ]]; then
    echo "✗ 占位符/未勾项/缺失要素未清零（$(printf '%s\n' "$hits" | wc -l | tr -d ' ') 处）:"
    printf '%s\n' "$hits"
    if [[ "$_vc_status" == "draft" && "$strict" != "--strict" ]]; then
      echo "ℹ draft 状态：允许残留（填充中段，断点续传安全）；--mark-active 前须清零"
      [[ "$p1_cnt" -gt 0 ]] && echo "  （含 ${p1_cnt} 处 P1 占位符：P1 分级，draft 期允许，--mark-active 前 exit 1）"
      return 0
    fi
    return 1
  fi
  # P1 占位符在非 --strict 模式下单独 warn（不 exit 1）
  if [[ "$p1_cnt" -gt 0 && "$strict" != "--strict" ]]; then
    echo "⚠ 发现 ${p1_cnt} 处 P1 占位符（P1 分级，draft 期允许，--mark-active 前须清零）:"
    printf '%s\n' "$p1_hits"
  fi
  echo "✓ 无占位符确认"
  return 0
}

# strict 激活的工作流形态：standard/compliance 必须保留九节点且顺序稳定；
# lite 明确无 workflow 不在此检查。兼容「设计 spec/spec」「实施 plan/plan」标题别名。
_vc_check_workflow_shape() {  # $1=skill_dir → stdout 结构缺失/错序清单
  local skill_dir="$1" profile wf titles i key line miss=""
  profile="$(sed -n 's/^profile:[[:space:]]*//p' "$skill_dir/SKILL.md" 2>/dev/null | head -1 | tr -d '[:space:]')"
  [[ "$profile" == "lite" ]] && return 0
  wf="$skill_dir/references/workflow.md"
  if [[ ! -f "$wf" ]]; then
    printf '%s' "references/workflow.md: standard/compliance 激活必须有九节点工作流"
    return 0
  fi
  titles="$(grep '^## 节点' "$wf" 2>/dev/null || true)"
  i=0
  for key in 需求 探查 spec plan 编码 测试 审查 合入 发布; do
    i=$((i+1))
    line="$(printf '%s\n' "$titles" | sed -n "${i}p")"
    if [[ -z "$line" ]] || ! printf '%s' "$line" | grep -q "$key"; then
      miss="${miss}${miss:+$'\n'}references/workflow.md: 第 ${i} 节点应含「${key}」且保持九节点顺序"
    fi
  done
  if [[ "$(printf '%s\n' "$titles" | grep -c . || true)" -ne 9 ]]; then
    miss="${miss}${miss:+$'\n'}references/workflow.md: standard/compliance 节点数必须为 9（当前 $(printf '%s\n' "$titles" | grep -c . || true)）"
  fi
  printf '%s' "$miss"
}

verify_completeness() {
  local skill_dir="$1" strict="${2:-}"
  trace_tool "verify-completeness" "$skill_dir"
  [[ -d "$skill_dir" ]] || { echo "✗ 目录不存在: $skill_dir" >&2; return 1; }
  # WP-H 状态门：draft 骨架允许占位符残留（报告模式 exit 0）；--strict（--mark-active 路径）保持 exit 1
  local _vc_status=""
  if [[ -f "$skill_dir/SKILL.md" ]]; then
    _vc_status=$(grep -m1 '^status: ' "$skill_dir/SKILL.md" 2>/dev/null | sed 's/^status: *//' | tr -d '[:space:]')
  fi
  # 收集检查目标（存在才查；R128 起收敛为 _vc_collect_targets 单一实现，追加顺序 = 扫描顺序）
  local targets=() f
  while IFS= read -r f; do targets+=("$f"); done < <(_vc_collect_targets "$skill_dir")
  if [[ ${#targets[@]} -eq 0 ]]; then
    echo "⚠ 未找到可检查文件（SKILL.md / references/*.md / precheck.conf / hooks.json 均不存在）"
    # R126：strict 路径零文件改 fail-closed——「无对象可查」不是「查过合格」，旧版
    # 独立 --verify-completeness --strict <空目录> 打印 ✓ 放行（fail-open）。
    # --mark-active 因有 SKILL.md 预查本不受此影响，此处守的是独立调用面。
    if [[ "$strict" == "--strict" ]]; then
      echo "✗ strict 模式无可检查文件——目录不是有效技能骨架，拒绝放行: $skill_dir" >&2
      return 1
    fi
    echo "✓ 无占位符确认"
    return 0
  fi
  # grep -F 固定串多模式（-e 叠加），三平台兼容；输出 file:line:内容 清单。
  # WP-Q4 P0/P1 分级机器化（P0/P1 判据见 _vc_scan_placeholders/_vc_scan_p1 头注）：
  #   - P1 占位符（含「（P1 待补）」标记）：draft 期允许，--strict（--mark-active）前须清零
  #   - P0 占位符（不含 P1 标记的常规占位符）：draft 期也仅 warn（draft 允许残留），--strict 时 exit 1
  local hits="" p1_hits="" p0_hits="" cb_hits
  p0_hits=$(_vc_scan_placeholders ${targets[@]+"${targets[@]}"})
  p1_hits=$(_vc_scan_p1 ${targets[@]+"${targets[@]}"})
  hits="$p0_hits"
  # 未勾 checkbox（- [ ]）：检查表段/代码块外的行首 checkbox（_vc_scan_checkboxes 单一实现）
  cb_hits=$(_vc_scan_checkboxes ${targets[@]+"${targets[@]}"})
  hits=$(printf '%s\n%s\n' "$hits" "$cb_hits" | grep -v '^$' || true)
  # P1 占位符追加到 hits（--strict 模式下也算，draft 模式下仅 warn 不计入 hits）
  if [[ "$strict" == "--strict" && -n "$p1_hits" ]]; then
    hits=$(printf '%s\n%s\n' "$hits" "$p1_hits" | grep -v '^$' || true)
  fi
  local p1_cnt=0
  [[ -n "$p1_hits" ]] && p1_cnt=$(printf '%s\n' "$p1_hits" | grep -c . | tr -d ' \n' || true)
  # 调用追踪要素机器执法 + 交付形态 DoD 在位性（_vc_check_workflow 单一实现；
  # 无 workflow.md 或无节点段放行，空输出不并入 hits）
  local trace_miss=""
  trace_miss=$(_vc_check_workflow "$skill_dir")
  hits=$(printf '%s\n%s\n' "$hits" "$trace_miss" | grep -v '^$' || true)
  # R21-A 任务配方结构执法（_vc_check_recipes）+ R21-B dev-guide「开发偏好」固定节核验
  # （_vc_check_dev_guide；两段按原序并入——recipes 缺失在前，固定节缺失在后）
  local recipes_miss="" dg_miss=""
  recipes_miss=$(_vc_check_recipes "$skill_dir")
  dg_miss=$(_vc_check_dev_guide "$skill_dir")
  recipes_miss=$(printf '%s\n%s\n' "$recipes_miss" "$dg_miss" | grep -v '^$' || true)
  hits=$(printf '%s\n%s\n' "$hits" "$recipes_miss" | grep -v '^$' || true)
  # G1/C2：decisions.jsonl 校验（JSON 合法性 + UserChallenge 五要素 + strict 零记录拦截，
  # 双账回退与 C2 判据见 _vc_check_decisions 头注；decisions_miss 并入 hits 统一裁决）
  local decisions_miss=""
  decisions_miss=$(_vc_check_decisions "$skill_dir" "$strict")
  hits=$(printf '%s\n%s\n' "$hits" "$decisions_miss" | grep -v '^$' || true)
  if [[ "$strict" == "--strict" ]]; then
    local shape_miss=""
    shape_miss=$(_vc_check_workflow_shape "$skill_dir")
    hits=$(printf '%s\n%s\n' "$hits" "$shape_miss" | grep -v '^$' || true)
  fi
  _vc_report "$hits" "$p1_hits" "$p1_cnt" "$_vc_status" "$strict"
}

if [[ "${1:-}" == "--verify-completeness" ]]; then
  # R39-D3（2026-09-19 执勤实证）：SKILL.md 生成流程 表记载写法为 `--verify-completeness --strict <dir>`
  # （标志前置），实现只认 `<dir> --strict`（后置）——照权威文档写法报"目录不存在: --strict"。
  # 与主解析器"标志须前置"的约定也互相矛盾。修复：--strict 双序兼容（任意位置剥离，取首个目录参数）。
  ___vc_dir="" ; ___vc_strict=0
  shift
  for ___a in "$@"; do
    case "$___a" in
      --strict) ___vc_strict=1 ;;
      *) [[ -z "$___vc_dir" ]] && ___vc_dir="$___a" ;;
    esac
  done
  [[ -n "$___vc_dir" ]] || { echo "Usage: bash generate-skill.sh --verify-completeness <skill-dir> [--strict]"; exit 1; }
  if [[ "$___vc_strict" -eq 1 ]]; then
    verify_completeness "$___vc_dir" --strict
  else
    verify_completeness "$___vc_dir"
  fi
  exit $?
fi

# ============================================================
# check_framework_globs <skill-dir> —— mark-active 的框架门禁空转防线（R48-G5 抽函数可测化）
# 返回 0=每个 ACTIVE_FRAMEWORKS 框架至少一个 glob 族变量已填；1=有框架全空（stderr 报清单）。
# R33-F1 立法（框架 glob 空转拦截）+ R47-D3 修（变量名以注入区块 requires_conf 声明为准，
# id 前缀推导为补充）。独立成函数供 --check-framework-globs 子命令与测试直调（变异回归锚点）。
# check_spec_first_wiring <skill-dir> —— mark-active 的 spec-first 联动防线（R75-D3）
# 缺陷（2026-09-29 NestJS 执勤实证）：骨架 conf 的 WRITABLE_DIRS=()  # TODO:model 若 AI 填充时漏配，
# spec-first 前置门（fail-gate-hook）在 WRITABLE_DIRS 未配时按设计"放行（不阻碍诊断）"——
# active 技能上 spec 门整链静默空转（SPEC_REQUIRED=1 的字面承诺无机器保证），mark-active 六关原不校验。
# 判据：SPEC_REQUIRED 解析为 1 且 WRITABLE_DIRS 解析为空 → fail（对齐 #20b 注释安全解析范式）。
check_spec_first_wiring() {
  local _sf_dir="$1"
  [[ -f "$_sf_dir/scripts/precheck.conf" ]] || return 0   # 无 conf 非生成物形态，跳过
  # Task 2：经 conf_* 五层链求有效值——单引号、patch 赋空、industry/compliance 覆盖
  # 与运行时同一条真值链（旧 grep 版三缺陷：单引号 '1' 读成未启用、后层赋空读不到、
  # 漏 compliance/industry 两层）。
  local _spec_req="" _wd=""
  _spec_req="$(conf_value SPEC_REQUIRED "$_sf_dir")"
  _wd="$(conf_items WRITABLE_DIRS "$_sf_dir" | paste -sd' ' -)"
  [[ "$_spec_req" == "1" ]] || return 0   # SPEC_REQUIRED≠1 = 门未启用，无需可写区
  if [[ -z "${_wd// /}" ]]; then
    echo "✗ spec-first 联动检查失败：SPEC_REQUIRED=1 但 WRITABLE_DIRS 为空——spec-first 前置门在运行时将静默放行（整链空转）。填充 scripts/precheck.conf 的 WRITABLE_DIRS（如 ("src")），或显式置 SPEC_REQUIRED=0 并落 decisions.jsonl 留痕后重跑 --mark-active" >&2
    return 1
  fi
  echo "  ✓ spec-first 联动检查通过（SPEC_REQUIRED=1 + WRITABLE_DIRS=($_wd) 非空）"
  return 0
}

# ============================================================
# R128：check_framework_globs 行为保持式拆分——id 收集/变量样式推导/空转核验/
# 全变量核验各自成子函数（_cfg_*）。文案/退出码/stderr 逐条位置与拆分前逐字一致。
# ============================================================
# R126：沿 conf 链（core→arch→patch）收集 ACTIVE_FRAMEWORKS 与变量取值——运行时 conf
# 链式 source 含 patch 覆盖层，核验面此前只读 core+arch，与运行时各看不同真值。
_cfg_collect_ids() {  # $1=skill_dir → stdout 去重排序后的框架 id（空白分隔）
  # Task 2：ACTIVE_FRAMEWORKS 经 conf_* 末层胜出（与运行时 source 链同义）——
  # 旧版各层 grep 取并集，patch 收缩清单（移除框架）会被并集吞掉。
  local _cfg_af
  _cfg_af="$(conf_items ACTIVE_FRAMEWORKS "$1" | tr '\n' ' ')"
  printf '%s' "$(printf '%s' "${_cfg_af}" | tr '[:space:]' '\n' | LC_ALL=C sort -u | sed '/^$/d' || true)"
}

_cfg_fw_upper() {  # $1=框架 id → stdout 大写去横线形态（变量前缀）
  printf '%s' "$1" | tr -d '-' | tr '[:lower:]' '[:upper:]'
}

_cfg_declared_vars() {  # $1=skill_dir $2=框架 id → stdout 该框架 requires_conf 声明变量（空白分隔）
  if [[ -f "$1/scripts/precheck.sh" ]]; then
    grep -m1 "^# ruleset: $2  *requires_conf:" "$1/scripts/precheck.sh" 2>/dev/null | sed 's/.*requires_conf: *//' || true
  fi
}

# R48-G5b（变异回归断言负向断言逼出的 D3 残留半修）：注入区块已声明 requires_conf 时，
# 门禁实际只读声明变量——id 前缀猜测变量在此形态下是假阳性放行（填了 JESTVITEST_*
# 过执法但 jest-vitest 门禁读 VITEST_* 依旧空转）。收紧：声明在案 → 只认声明变量；
# 未注入 ruleset 的框架 → 保留 id 前缀推导兜底。
# R58-D9：声明在案 → 认**全部**声明变量、不挑名字形态（原 case 只留 glob 族名，
# vite 声明的 VITE_CONFIG_FILE/VITE_INJECT_SCRIPT 等被全滤掉 → 永远 missing 假阳性）。
# requires_conf 的语义就是"该规则集的输入变量"，非 glob 名同样是门禁的已填输入。
_cfg_pattern_for() {  # $1=skill_dir $2=框架 id → stdout 该框架已填判据 ERE（声明变量并集或 id 前缀兜底）
  local _cfg_dir="$1" _cfg_id="$2"
  local _cfg_vars _cfg_v _cfg_decl_glob=""
  _cfg_vars=$(_cfg_declared_vars "$_cfg_dir" "$_cfg_id")
  for _cfg_v in ${_cfg_vars}; do
    _cfg_decl_glob="${_cfg_decl_glob}${_cfg_decl_glob:+|}${_cfg_v}"
  done
  if [[ -n "$_cfg_decl_glob" ]]; then
    printf '%s' "${_cfg_decl_glob}"
  else
    printf '%s' "$(_cfg_fw_upper "$_cfg_id")[A-Z0-9_]*(SRC_GLOBS|MAPPER_DIRS|CONFIG_FILES|SQL_GLOBS|SCHEMA_GLOBS|JOB_DIRS|KEY_COLUMNS|SHARD_KEY|GLOBS)"
  fi
}

# 空转核验：每个激活框架按判据 ERE 数已填变量（≥1 即不空转）。全空框架的空值变量
# 逐条 file:line 位置同步打到 stderr（供编排器 ✗ 行的「位置见上方清单」指代）。
# 全空框架清单落全局 _cg_missing（" FW1 FW2" 空格前缀形态，空串=无全空框架）——
# 必须直调不走命令替换：下方 listing 管道在 grep 零命中时 pipefail rc=1，set -e 上下文
# （--check-framework-globs 顶层直调）沿用拆分前「当场静默中止」行为；命令替换会吞掉
# 该中止（bash 3.2 赋值语句不传播命令替换内的 -e 中止），属行为漂移，R128 实测拦下。
# R58-D9b：填值形态双认——数组 `VAR=("x` 与标量 `VAR="x`（vite 声明标量变量，
# 原正则只认数组形态 → 标量永远假阴性）
# R126：判据收敛到 _conf_var_filled 单一实现——旧 ERE 只认双引号起，
# 单引号/裸值已填形态被计空（误报「框架 glob 全空」阻断 --mark-active）。
_cfg_check_alive() {  # $1=skill_dir $2..=框架 id → stderr 空值位置清单；全局 _cg_missing=全空框架清单
  local _cfg_dir="$1"; shift
  local _cfg_id _cfg_fw _cfg_pat _cfg_hit _cfg_l _cfg_c
  _cg_missing=""
  for _cfg_id in "$@"; do
    _cfg_fw=$(_cfg_fw_upper "$_cfg_id")
    _cfg_pat=$(_cfg_pattern_for "$_cfg_dir" "$_cfg_id")
    _cfg_hit=0
    while IFS= read -r _cfg_l; do
      [[ -n "$_cfg_l" ]] || continue
      _conf_var_filled "$_cfg_l" && _cfg_hit=$((_cfg_hit+1))
    done < <(while IFS= read -r _cfg_c; do grep -hE "^(${_cfg_pat})=" "$_cfg_c" 2>/dev/null || true; done < <(_skill_conf_files "$_cfg_dir"))
    if [[ "${_cfg_hit:-0}" -eq 0 ]]; then
      _cg_missing="${_cg_missing} ${_cfg_fw}"
      # R114-followup：报错附空值变量精确 file:line——框架变量双 conf 分散（precheck.conf 与
      # precheck.arch.conf 各持若干），只报名字时首轮填充易改错文件（R114 研发链实录）。
      # R128：管道尾 || true——conf 链首文件对该框架变量零命中时 grep rc=1，pipefail 下整条
      # 管道 rc=1 → set -e 就地中止整个子命令（rc=1 且连下方「✗ 框架 glob 全空」都不输出，
      # 静默失败；--mark-active 的 if ! 上下文则不死）。拆分时基线对比拦下的潜伏缺陷，单独立法修复。
      while IFS= read -r _cfg_c; do
        grep -nE "^(${_cfg_pat})=" "$_cfg_c" 2>/dev/null | while IFS= read -r _cfg_ln; do
          echo "    空值变量位置（改这里）：$(basename "${_cfg_c}"):${_cfg_ln%%:*} $(printf '%s' "${_cfg_ln#*:}" | cut -d= -f1)" >&2
        done || true
      done < <(_skill_conf_files "$_cfg_dir")
    fi
  done
}

# 全变量核验（advisory）：requires_conf 声明的每个变量逐一核验已填——
# ≥1 只保"不空转"，空值变量无机器拦截，此处仅披露不阻断。
# R126：判据收敛 _conf_var_filled——旧 `^VAR=.+[^ ]` 把 VAR=()/VAR="" 判已填
# （本 advisory 实质死代码），且漏 patch 覆盖层。
_cfg_check_declared() {  # $1=skill_dir $2..=框架 id → stdout advisory ⚠ 行（全填=无输出）
  local _cfg_dir="$1"; shift
  local _cfg_id2 _cfg_fw2 _cfg_vars2 _cfg_evar
  local _cg_empty=""
  for _cfg_id2 in "$@"; do
    _cfg_fw2=$(_cfg_fw_upper "$_cfg_id2")
    _cfg_vars2=$(_cfg_declared_vars "$_cfg_dir" "$_cfg_id2")
    for _cfg_evar in ${_cfg_vars2}; do
      local _cg_ef=1 _cg_l
      while IFS= read -r _cg_l; do
        _conf_var_filled "$_cg_l" && { _cg_ef=0; break; }
      done < <(while IFS= read -r _cfg_c2; do grep -h "^${_cfg_evar}=" "$_cfg_c2" 2>/dev/null || true; done < <(_skill_conf_files "$_cfg_dir"))
      [[ "$_cg_ef" -eq 1 ]] && _cg_empty="${_cg_empty} ${_cfg_fw2}.${_cfg_evar}"
    done
  done
  if [[ -n "$_cg_empty" ]]; then
    echo "  ⚠ 框架声明变量有未填项（不阻塞激活但框架门禁可能不完全生效）：${_cg_empty}"
  fi
}

check_framework_globs() {
  local _cg_dir="$1"
  local _cg_ids
  _cg_ids=$(_cfg_collect_ids "$_cg_dir")
  # 直调（不走命令替换）——-e 上下文与拆分前逐位一致，理由见 _cfg_check_alive 头注
  _cfg_check_alive "$_cg_dir" ${_cg_ids}
  if [[ -n "${_cg_missing}" ]]; then
    echo "✗ 框架 glob 全空（TODO(framework-gates) 未填充）：${_cg_missing} 无任何已填变量——框架门禁将空转（空值变量逐条位置见上方清单；两 conf 均无该变量时按 requires_conf 声明名新增行）。填充后重跑 --mark-active" >&2
    return 1
  fi
  # 全变量核验（≥1 只保"不空转"——空值变量无机器拦截；advisory 不阻断）
  _cfg_check_declared "$_cg_dir" ${_cg_ids}
  echo "✓ 框架 glob 检查通过（ACTIVE_FRAMEWORKS 每框架至少一个声明变量已填）"
  return 0
}

# --help（R72-D1：此前无 help 分支——误传旗标时落到 ${2:?} 参数缺失报错，
# 以 bash 原生 `line N: 2:` 前缀吐 usage，不指引正确用法；R125：补齐全部子命令与 --version）
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi
if [[ "${1:-}" == "--version" ]]; then
  _gv_src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  git -C "$_gv_src" describe --tags --always 2>/dev/null || echo "unknown"
  exit 0
fi

# --check-framework-globs <skill-dir>：单跑框架空转防线（R48-G5——供 test-framework-conf-consistency
# 直调做变异回归断言：正向=requires_conf 变量可放行；负向=id 前缀伪造变量不放行）
if [[ "${1:-}" == "--check-framework-globals" || "${1:-}" == "--check-framework-globs" ]]; then
  _cgd="${2:-}"
  [[ -n "$_cgd" && -f "$_cgd/SKILL.md" ]] || { echo "Usage: bash generate-skill.sh --check-framework-globs <skill-dir>"; exit 1; }
  trace_tool "check-framework-globs" "$_cgd"
  check_framework_globs "$_cgd"
  exit $?
fi

_write_skill_manifest() {  # $1=skill_dir $2=run_id（WP7：目标技能自描述）
  local dir="$1" run_id="$2" af="" fw_json="" fw m2 m1 fwtotal fcount total core
  local skill_name profile industry version
  # shellcheck disable=SC1091
  . "$ASSETS_DIR/lib/json.sh"
  skill_name="${SKILL_NAME:-$(sed -n 's/^name:[[:space:]]*//p' "$dir/SKILL.md" 2>/dev/null | head -1)}"
  profile="${PROFILE:-$(sed -n 's/^profile:[[:space:]]*//p' "$dir/SKILL.md" 2>/dev/null | head -1 | tr -d '[:space:]')}"
  industry="${INDUSTRY:-none}"
  version="${SWARM_YUAN_SRC_VERSION:-}"
  if [[ -z "$version" || "$version" == "unknown" ]]; then
    if [[ -f "$dir/.swarm-yuan-version" ]]; then
      version="$(sed -n 's/^source_version=//p' "$dir/.swarm-yuan-version" | head -1)"
    fi
    if [[ -z "$version" && -f "$ASSETS_DIR/../.bundle-version" ]]; then
      version="$(sed -n 's/^version=//p' "$ASSETS_DIR/../.bundle-version" | head -1)"
    fi
  fi
  [[ -n "$version" && "$version" != "unknown" ]] || { echo "✗ manifest 缺少可追溯生成器版本" >&2; return 1; }
  if [[ -f "$dir/scripts/precheck.conf" ]]; then
    af="$(conf_items ACTIVE_FRAMEWORKS "$dir" | tr '\n' ' ')"
  fi
  for fw in $af; do
    fw_json="${fw_json}${fw_json:+,}\"$(json_escape "$fw")\""
  done
  [[ -f "$ASSETS_DIR/registry/gates.tsv" && -f "$ASSETS_DIR/registry/frameworks.tsv" ]] || {
    echo "✗ manifest 缺少门禁/框架注册表，拒绝使用硬编码兜底数字" >&2; return 1; }
  m2="$(awk -F '\t' '!/^#/ && $9=="M2"{n++} END{print n+0}' "$ASSETS_DIR/registry/gates.tsv")"
  m1="$(awk -F '\t' '!/^#/ && $9=="M1"{n++} END{print n+0}' "$ASSETS_DIR/registry/gates.tsv")"
  fwtotal="$(awk -F '\t' '!/^#/ && NF{n++} END{print n+0}' "$ASSETS_DIR/registry/frameworks.tsv")"
  total="$(awk -F '\t' '!/^#/ && NF{n++} END{print n+0}' "$ASSETS_DIR/registry/gates.tsv")"
  core="$(awk -F '\t' '!/^#/ && $5=="core"{n++} END{print n+0}' "$ASSETS_DIR/registry/gates.tsv")"
  [[ "$m2" -gt 0 && "$m1" -ge 0 && "$fwtotal" -gt 0 && "$total" -gt 0 && "$core" -gt 0 ]] || { echo "✗ manifest 注册表计数异常" >&2; return 1; }
  # 排除备份/effects/旧 manifest 后 +1 计入本 manifest，避免升级时膨胀。
  fcount="$(find "$dir" -type f \
    ! -path '*/.upgrade-backup-*/*' ! -path '*/.swarm-yuan/effects/*' \
    ! -name 'skill-manifest.json' | wc -l | tr -d ' ')"
  fcount=$((fcount + 1))
  {
    printf '{\n'
    printf '  "schema": 1,\n'
    printf '  "name": "%s",\n' "$(json_escape "$skill_name")"
    printf '  "version": "%s",\n' "$(json_escape "$version")"
    printf '  "generated_at": "%s",\n' "${SWARM_YUAN_STAMP:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
    printf '  "run_id": "%s",\n' "$(json_escape "$run_id")"
    printf '  "profile": "%s",\n' "$(json_escape "$profile")"
    printf '  "industry": "%s",\n' "$(json_escape "$industry")"
    printf '  "active_frameworks": [%s],\n' "$fw_json"
    printf '  "gates": {"total": %s, "core": %s, "m2": %s, "m1": %s},\n' \
      "$total" "$core" "$m2" "$m1"
    printf '  "frameworks": {"total": %s, "m2": %s},\n' "$fwtotal" "$fwtotal"
    printf '  "files": {"count": %s}\n' "$fcount"
    printf '}\n'
  } > "$dir/skill-manifest.json"
  echo "  ✓ skill-manifest.json（profile=${profile} / industry=${industry} / frameworks=${fwtotal} / files=${fcount}）"
}

_ma_final_budget() {  # $1=skill_dir；strict 激活检查最终交付物预算
  local dir="$1" sm map refs
  # facts 只提供预算值，不把生成期骨架测量当最终产物测量。
  # shellcheck disable=SC1091
  . "$ASSETS_DIR/facts.conf"
  sm="$(wc -c < "$dir/SKILL.md" | tr -d ' ')"
  map="$(wc -c < "$dir/references/reference-manual.md" | tr -d ' ')"
  # 614400B 是通用分发文件的提示上下文预算，按 dist.tsv 的 target/offline
  # 文档集逐文件实测；项目特定 reference-manual/workflow/recipes 不混入该口径。
  # relations.jsonl 与其他机器查询文件不进入 Markdown 预算。
  refs=0
  local _rel _aud _tier _mode _cat _offline _src _req _bytes
  while IFS=$'\t' read -r _rel _aud _tier _mode _cat _offline _src _req _bytes; do
    [[ "$_rel" == references/*.md && "$_aud" == "target" && "$_offline" == "yes" ]] || continue
    # onto 是机器事实源（与 relations.jsonl 同类），不计入提示上下文预算。
    [[ "$_cat" == "onto" ]] && continue
    case "$_tier" in lite|standard) ;; *) continue ;; esac
    [[ -f "$dir/$_rel" ]] || continue
    _bytes="$(wc -c < "$dir/$_rel" | tr -d ' ')"
    refs=$((refs + _bytes))
  done < <(grep -v '^#' "$ASSETS_DIR/registry/dist.tsv")
  if [[ "$sm" -gt "${FACT_SKILLMD_BYTES_BUDGET:-11392}" ]]; then
    echo "✗ 最终产物预算：SKILL.md ${sm}B > ${FACT_SKILLMD_BYTES_BUDGET}B——先拆分路由与按需索引，不直接上调预算" >&2
    return 1
  fi
  if [[ "$map" -gt "${FACT_MAP_BYTES_BUDGET:-32768}" ]]; then
    echo "✗ 最终产物预算：reference-manual.md ${map}B > ${FACT_MAP_BYTES_BUDGET}B——清单须按领域分片，relations.jsonl 保持机器查询" >&2
    return 1
  fi
  if [[ "$refs" -gt "${FACT_ARTIFACT_BYTES_BUDGET:-614400}" ]]; then
    echo "✗ 最终产物预算：references/*.md 合计 ${refs}B > ${FACT_ARTIFACT_BYTES_BUDGET}B——大型知识文件须分片并按需加载" >&2
    return 1
  fi
  echo "  ✓ 最终产物预算（SKILL ${sm}B / 地图 ${map}B / Markdown ${refs}B）"
  return 0
}

# --mark-active 子命令（WP-H 状态门：draft → active；WP-Q1A 串联 inventory-verify --path-check）
# 用法: bash generate-skill.sh --mark-active <skill-dir>
# 三道关：
#   ① verify_completeness --strict（占位符零残留，P0/P1 分级）
#   ② inventory-verify.sh --path-check（§4/§6/§9 表格登记的路径必须在仓库真实存在）
#   ③ inventory-verify.sh 基线 FAIL 维度阻断（HALLUCINATION 列表非空阻断）
# 三关全过才把 SKILL.md frontmatter 的 status: draft 翻为 active；
# active 后目标 skill 的 precheck.sh --all-full/--compliance-suite 才解除禁用（precheck 侧状态门）。
# ============================================================
if [[ "${1:-}" == "--mark-active" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --mark-active <skill-dir>"; exit 1; }
  _ma_dir="$2"
  [[ -f "$_ma_dir/SKILL.md" ]] || { echo "✗ SKILL.md 不存在: $_ma_dir" >&2; exit 1; }
  # R28-DF7（2026-09-16 执勤实证）：技能与项目分离存放（CI 产物目录）时，decisions 双账
  # 回退链（verify_completeness 内 ${PROJECT_DIR:-skill_dir 上三级}）两路皆空——PROJECT_DIR
  # 未导出、skill_dir 上三级不再是项目根。conf 里明明有真值，提前读出导出即闭环。
  # 占位符形态（draft 未回填 <项目根绝对路径>）不导出，保持原回退链。
  if [[ -z "${PROJECT_DIR:-}" && -f "$_ma_dir/scripts/precheck.conf" ]]; then
    # Task 2：conf_* 链式求值（旧 grep 版手工剥引号/注释，漏 patch/industry 覆盖层）。
    _ma_pd="$(conf_value PROJECT_DIR "$_ma_dir")"
    case "$_ma_pd" in
      "<"*">") : ;;
      ?*) [[ -d "$_ma_pd" ]] && export PROJECT_DIR="$_ma_pd" ;;
    esac
  fi
  if ! grep -q '^status: draft' "$_ma_dir/SKILL.md"; then
    echo "ℹ 非 draft 状态（已是 active 或无 status 字段），无需标记"
    exit 0
  fi
  # R33-F1 框架空转防线（R48-G5 抽函数）：逻辑与可测锚点单一事实源化，见上方 check_framework_globs
  if ! check_framework_globs "$_ma_dir"; then
    exit 1
  fi
  # R75-D3 spec-first 联动防线（抽函数可测化，同 R48-G5 范式）
  if ! check_spec_first_wiring "$_ma_dir"; then
    exit 1
  fi
  # ① 无占位符核验
  if ! verify_completeness "$_ma_dir" --strict; then
    echo "✗ ①占位符未清零，保持 draft（--all-full/--compliance-suite 仍禁用）" >&2
    exit 1
  fi
  # ②③ inventory-verify 路径校验（HALLUCINATION 阻断；FAIL 维度作为告警不阻断——fail-open）
  # 补串 --stability-audit（WP-Q1A 时漏串，仅文档化）——稳定性标注与三自动信号
  # （近 90 天 git churn / fan-in / 同名测试）冲突时 STABILITY_WARN（advisory，不阻断）。
  _ma_iv="$BASE/scripts/inventory-verify.sh"
  [[ -f "$_ma_iv" ]] || { echo "✗ ②③ inventory-verify 缺失，拒绝 mark-active" >&2; exit 1; }
  _ma_proj="$(conf_value PROJECT_DIR "$_ma_dir")"
  _ma_proj=$(cd "$_ma_proj" 2>/dev/null && pwd || true)
  if [[ -z "$_ma_proj" || ! -d "$_ma_proj" || ! -f "$_ma_dir/references/reference-manual.md" ]]; then
    echo "✗ ②③ 必需核验对象缺失（有效 PROJECT_DIR 或 reference-manual.md）——strict 激活不允许跳过" >&2
    exit 1
  fi
  _iv_rc=0
  _iv_out=$(bash "$_ma_iv" "$_ma_proj" --skill-dir "$_ma_dir" --tsv --path-check --stability-audit --strict 2>&1) || _iv_rc=$?
  if [[ -n "${_iv_out:-}" ]]; then
    printf '%s\n' "${_iv_out}" | grep -E '(PASS|FAIL|NO_LIST|SCAN_ERROR)$' | head -20 || true
  fi
  if [[ "$_iv_rc" -ne 0 ]]; then
    echo "✗ ②③ strict 清单核验未通过（rc=${_iv_rc}；FAIL/NO_LIST/SCAN_ERROR/DIM_MISMATCH/HALLUCINATION 均阻断）" >&2
    printf '%s\n' "$_iv_out" | tail -20 >&2
    exit 1
  fi
  # 关系边集仍是 advisory：缺失不阻断，存在断边只披露，不把可选产物冒充必需证据。
  _ma_rx="$BASE/scripts/relations-extract.sh"
  if [[ -f "$_ma_dir/references/relations.jsonl" && -f "$_ma_rx" ]]; then
    if ! _rx_out=$(bash "$_ma_rx" "$_ma_proj" --verify --skill-dir "$_ma_dir" 2>&1); then
      echo "⚠ relations-extract --verify 执行异常（advisory，不阻断）" >&2
    else
      _rx_miss=$(printf '%s\n' "$_rx_out" | grep -c '^RELATION_MISS' || true)
      if [[ "${_rx_miss:-0}" -gt 0 ]]; then
        echo "⚠ 关系边集抽样失锚 ${_rx_miss} 处（advisory：重跑 relations-extract.sh 重建边集；不阻断）" >&2
        printf '%s\n' "$_rx_out" | grep '^RELATION_MISS' >&2
      fi
    fi
  fi
  _ma_final_budget "$_ma_dir" || exit 1
  _write_skill_manifest "$_ma_dir" "activate-$(date -u +%Y%m%dT%H%M%SZ)-$$" || exit 1
  mkdir -p "$_ma_dir/.swarm-yuan"
  printf '{"status":"passed","inventory":"strict-pass","budget":"pass","manifest":"refreshed"}\n' \
    > "$_ma_dir/.swarm-yuan/activation-report.json"
  # R15（HarnessEval P7）：audit-closure --strict 闭环完备性检查（advisory 降级——
  # 无 decisions.jsonl 或全部 closed 时过；有 open goal 时 warn 不阻断，fail-open 教义：
  # 审计未完成是提示信号不是阻断条件，有下层门禁兜底）
  _ma_ac="$(cd "$(dirname "$0")" && pwd)/audit-closure.sh"
  if [[ -x "$_ma_ac" || -f "$_ma_ac" ]]; then
    _ac_proj=$( (set +u; . "$_ma_dir/scripts/precheck.conf" 2>/dev/null || true; printf '%s' "${PROJECT_DIR:-}") )
    if [[ -n "$_ac_proj" && -d "$_ac_proj" ]]; then
      if ! bash "$_ma_ac" "$_ac_proj" --strict >/dev/null 2>&1; then
        echo "⚠ audit-closure：存在 open goal（change↔validation 未闭合）——advisory 提示，不阻断 mark-active" >&2
        bash "$_ma_ac" "$_ac_proj" 2>&1 | grep '⚠' >&2 || true
      fi
    fi
  fi
  sed -i.bak 's/^status: draft/status: active/' "$_ma_dir/SKILL.md" && rm -f "$_ma_dir/SKILL.md.bak"
  echo "✓ 已标记 status: active（--all-full/--compliance-suite 已解锁）"
  exit 0
fi

# ============================================================
# --render-tools 子命令（独立于 create/upgrade，单独拦截）
# 用法: bash generate-skill.sh --render-tools <skill-dir> [project-root] [tool]
# G7 三档对齐：runnable（全部 7 工具目录复制即可运行）/ cli（6 工具派生原生规则）/
#   deep（Claude Code 已深度集成，no-op）。档位元数据：assets/tool-adapters/common.sh TA_TIER_*。
# 从目标 skill 的 SKILL.md + scripts/precheck.conf 派生各 AI 工具原生规则文件：
#   Cursor .cursor/rules/<skill>.mdc（description/globs/alwaysApply 三字段）
#   Windsurf .windsurf/rules/<skill>.md（trigger: model_decision）
#   Gemini/Codex/OpenCode/Kimi 的 GEMINI.md/AGENTS.md 段（标记区块包裹，幂等重渲染）
#   Claude Code 维持现状（hooks/commands 已深度集成，不渲染）
# project-root 缺省自动推导（用户级工具 home → 各工具全局规则位；否则取项目根）；
# tool 缺省渲染全部 7 工具，指定则只渲染其一。适配器：assets/tool-adapters/<tool>.sh
# （install.sh 共用 source）。重渲染同一项目为 no-op（内容一致跳过）。
# ============================================================
if [[ "${1:-}" == "--render-tools" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --render-tools <skill-dir> [project-root] [tool]"; exit 1; }
  TA_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/tool-adapters"
  export TA_DIR
  # shellcheck disable=SC1090
  . "$TA_DIR/common.sh"
  ta_render_tools "$2" "${3:-}" "${4:-}"
  exit $?
fi

# ============================================================
# --refresh 子命令（WP-Q3-1 自成长机制最小切片：dry-run 报告 + 不实际修改）
# 用法: bash generate-skill.sh --refresh <skill-dir>
# 走 project-fingerprint.sh --diff 拿变化报告，加上：
#   ① 当前 skill 状态（draft/active）+ 上一次 refresh 时间
#   ② 建议行动（无变化 → 无需刷新；有变化 → --upgrade 详情）
#   ③ 把当前指纹落盘到 project（新基线）——可选 --commit-fp
# 红线：仅报告，不改任何文件；不写 reference-manual.md（那是 --upgrade 的活）。
# ============================================================
if [[ "${1:-}" == "--refresh" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: bash generate-skill.sh --refresh <skill-dir> [--commit-fp]"; exit 1; }
  _rf_dir="$2"; shift 2
  [[ -d "$_rf_dir" ]] || { echo "✗ skill 目录不存在: $_rf_dir" >&2; exit 1; }
  [[ -f "$_rf_dir/SKILL.md" ]] || { echo "✗ SKILL.md 不存在: $_rf_dir" >&2; exit 1; }
  # 项目根：从 precheck.conf 拿
  _rf_conf="$_rf_dir/scripts/precheck.conf"
  [[ -f "$_rf_conf" ]] || { echo "✗ scripts/precheck.conf 不存在，无法定位项目根" >&2; exit 1; }
  _rf_proj=$( (set +u; . "$_rf_conf" 2>/dev/null || true; printf '%s' "${PROJECT_DIR:-}") )
  [[ -n "$_rf_proj" && -d "$_rf_proj" ]] || { echo "✗ precheck.conf 中 PROJECT_DIR 无效: ${PROJECT_DIR:-（空）}" >&2; exit 1; }
  _rf_proj=$(cd "$_rf_proj" && pwd)
  # fingerprint 脚本路径
  _rf_fp="$(cd "$(dirname "$0")" && pwd)/project-fingerprint.sh"
  [[ -x "$_rf_fp" || -f "$_rf_fp" ]] || { echo "✗ project-fingerprint.sh 缺失: $_rf_fp" >&2; exit 1; }
  # 跑 diff
  # 指纹脚本非零退出 = 感知链自身故障，不得折叠成「无变化」。
  _rf_rc=0
  _rf_out=$(bash "$_rf_fp" "$_rf_proj" --diff 2>&1) || _rf_rc=$?
  if [[ "$_rf_rc" -ne 0 ]]; then
    echo "✗ --refresh: project-fingerprint --diff 异常退出（rc=${_rf_rc}）——感知链故障，不判无变化" >&2
    printf '%s\n' "$_rf_out" | tail -10 >&2
    exit 1
  fi
  # 输出报告
  echo "## --refresh dry-run（skill=$(basename "$_rf_dir")，project=${_rf_proj}）"
  _rf_status=$(grep -m1 '^status:' "$_rf_dir/SKILL.md" 2>/dev/null | sed 's/^status: *//')
  echo "  当前 skill 状态: ${_rf_status:-无 status 字段}"
  if printf '%s\n' "$_rf_out" | LC_ALL=C grep -q '⚠ 项目源码已变化'; then
    # 建议从"只 --upgrade"升级为完整更新链——--upgrade 只刷工具链，
    # reference-manual.md 组件库清单需 AI 重探查更新 + inventory-verify 核验。
    echo "  → 检测到变化，更新链（详见目标技能 SKILL.md「自成长」段）："
    echo "      ① --upgrade 刷工具链（保留 reference-manual.md 内容文件）"
    echo "      ② AI 按「变化目录（scope）」局部重探查变化目录 → 更新 reference-manual.md 清单（未变 scope 条目不重写）"
    echo "      ③ inventory-verify.sh 计数核验（≥0.95 + 路径存在性）→ ④ --commit-fp 落新基线"
    printf '%s\n' "$_rf_out" | LC_ALL=C grep -v '^⚠' | LC_ALL=C grep -v '^  →' | LC_ALL=C grep -v '^$' | LC_ALL=C sed 's/^/    /'
    # --commit-fp：把当前指纹落盘为新基线
    if [[ "${1:-}" == "--commit-fp" ]]; then
      bash "$_rf_fp" "$_rf_proj" --write >/dev/null
      echo "  ✓ --commit-fp：已把当前指纹落盘为新基线（$_rf_proj/.swarm-yuan/project-fingerprint）"
    fi
    exit 0
  elif printf '%s\n' "$_rf_out" | LC_ALL=C grep -q '无既有指纹'; then
    # 无基线 ≠ 无变化——此前落入 else 报"✓ 无变化"，首次感知场景假阴性。
    echo "  → 无指纹基线（尚未做过首次感知），无法判断变化——建议落基线："
    echo "      bash scripts/generate-skill.sh --refresh <skill-dir> --commit-fp"
    if [[ "${1:-}" == "--commit-fp" ]]; then
      bash "$_rf_fp" "$_rf_proj" --write >/dev/null
      echo "  ✓ --commit-fp：已把当前指纹落盘为基线（$_rf_proj/.swarm-yuan/project-fingerprint）"
    fi
    exit 0
  else
    echo "  ✓ 无变化（文件骨架指纹未变）"
    printf '%s\n' "$_rf_out" | LC_ALL=C grep -E '^\s*✓' | head -1 || true
    exit 0
  fi
fi

# ---- 检测运行环境 ----
# 默认目标：项目内 .agent/skills/（Agent Skills 开放标准默认路径；2026-10-29 起，原 .claude/skills）。
# 历史行为（2026-07-21 前）：项目内无 .claude/skills 时 fallback 到 $HOME/.claude/skills 全局目录，
# 导致 generate-skill.sh <name> <project> 把骨架生成到用户全局 skills 目录、项目目录内却什么都没有，
# 与 README/SKILL.md 宣称的"为某项目生成开发技能"不符。改为默认在项目内创建（当时选 .claude/skills，
# 2026-10-29 对齐开放标准改 .agent/skills）。
# 全局安装走 install.sh；用户仍可用第 3 参数 target-dir 显式指定任意目录。
detect_skill_dir() {
  local project="$1"
  # 1) 项目内已有 skills 目录（任意受支持运行时）→ 优先复用；.agent/skills 探测最前
  #    （默认路径优先），单目录存量项目不受影响（无 .agent/skills 时命中既有目录）。
  local rt
  for rt in .agent/skills .claude/skills .codex/skills .cursor/skills .codeium/windsurf/skills .config/opencode/skills .gemini/skills .kimi/skills .zcode/skills; do
    if [[ -d "$project/$rt" ]]; then echo "$project/$rt"; return; fi
  done
  # 2) 项目内无 skills 目录 → 默认在项目内创建 .agent/skills/
  echo "$project/.agent/skills"
}

detect_runtime_name() {
  local project="$1"
  # 仅按项目内已有的 skills 目录判定运行时；不再因 $HOME 下有全局 skills 目录就误报。
  if [[ -d "$project/.agent/skills" ]]; then echo "Agent 通用"
  elif [[ -d "$project/.claude/skills" ]]; then echo "Claude Code"
  elif [[ -d "$project/.codex/skills" ]]; then echo "Codex"
  elif [[ -d "$project/.cursor/skills" ]]; then echo "Cursor"
  elif [[ -d "$project/.codeium/windsurf/skills" ]]; then echo "Windsurf"
  elif [[ -d "$project/.config/opencode/skills" ]]; then echo "OpenCode"
  elif [[ -d "$project/.gemini/skills" ]]; then echo "Gemini CLI"
  elif [[ -d "$project/.kimi/skills" ]]; then echo "Kimi"
  elif [[ -d "$project/.zcode/skills" ]]; then echo "ZCode"
  else echo "通用（将在项目内创建 .agent/skills/）"
  fi
}

# ---- 统一解析 --upgrade / --profile（R125：两旗标任意顺序、可组合）----
# 旧实现先只看 $1 是否是 --upgrade、再循环 --profile：`--profile lite --upgrade ...`
