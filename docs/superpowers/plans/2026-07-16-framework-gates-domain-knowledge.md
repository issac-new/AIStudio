# 技术框架枚举/约束/门禁/领域知识完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 swarm yuan skill 的 `ACTIVE_FRAMEWORKS` 从死配置变为可执行门禁，补齐 7 框架的代码验证领域知识，修正版本漂移。

**Architecture:** 三层闭环——(1) 新增 `references/framework-knowledge.md` 落地 7 框架规律；(2) `precheck.sh` 新增 `check_framework()` + `--framework` 分支，7 个 `_fw_<fw>_check()` 纯 bash grep；(3) `precheck.conf` 补全 `ACTIVE_FRAMEWORKS` 为 7 框架 + 框架约束枚举；外加 SKILL.md 版本漂移修正。

**Tech Stack:** Bash（precheck.sh 门禁）、Markdown（领域知识/文档）。零新依赖。

**Spec:** `docs/superpowers/specs/2026-07-16-framework-gates-domain-knowledge-design.md`

## Global Constraints

- **仅允许修改 `.claude/skills/ncwk-dev/` 目录下文件**（swarm yuan skill 本体）。本任务不改 overlay/upstream。
- **precheck.sh 风格对齐**：用 `skip_if_unconfigured` 处理空配置，`pass/fail/warn` 输出，纯 bash grep，零新依赖。
- **`--framework` 不进 `--all`/`--all-full` 聚合**（与 `--domain`/`--cognition` 一致，显式调用）。
- **门禁对现有代码应全 pass**（规律均经 spec 代码验证）；`v-for index key` 用 warn 非 fail。
- **版本修正**：upstream `v0.6.25` → `v0.6.30`；技术栈版本表用实际版本（vue ^3.5.32 / naive-ui ^2.44.1 / pinia ^3.0.4 / vite ^8.0.4 / vitest ^3.2.4 / koa ^2.15.3 / socket.io ^4.8.3 / typescript ~6.0.2）。
- **脚本路径**：执行 precheck 时用 `bash .claude/skills/ncwk-dev/scripts/precheck.sh`（根目录非 git 仓库，命令从项目根 `/Volumes/nvme2230/lab/ncwk` 执行）。

## File Structure

| 文件 | 变更类型 | 职责 |
|------|---------|------|
| `.claude/skills/ncwk-dev/references/framework-knowledge.md` | 新增 | 7 框架经代码验证的规律速查（项目落地版） |
| `.claude/skills/ncwk-dev/scripts/precheck.conf` | 扩展 | `ACTIVE_FRAMEWORKS` 补全为 7 框架 + 框架约束枚举变量 |
| `.claude/skills/ncwk-dev/scripts/precheck.sh` | 扩展 | `check_framework()` + 7 个 `_fw_<fw>_check()` + dispatch + Usage |
| `.claude/skills/ncwk-dev/SKILL.md` | 修正 | 版本漂移 v0.6.25→v0.6.30 + 技术栈版本表 + 门禁速查表补 `--framework` |

---

### Task 1: 新增 framework-knowledge.md 领域知识文件

**Files:**
- Create: `.claude/skills/ncwk-dev/references/framework-knowledge.md`

**Interfaces:**
- Produces: 7 框架规律文档，供 Task 3 的 `_fw_<fw>_check()` 函数逐条实现门禁。每条规律的"门禁检查名"列即 Task 3 函数内检查项标识。

- [ ] **Step 1: 创建 framework-knowledge.md**

创建 `.claude/skills/ncwk-dev/references/framework-knowledge.md`，内容如下：

```markdown
# 技术框架领域知识 (Framework Domain Knowledge)

> 本文件每条规律均经 ncwk 代码验证。违反 = 构建失败/运行时错误/XSS 风险。
> 维护规则：upstream 版本升级后须重新验证；规律变更须附代码证据。
> 与 domain-knowledge.md 的关系：后者是通用速查表（分析起点），本文件是项目落地（最终产出）。

## 框架清单（对应 precheck.conf ACTIVE_FRAMEWORKS）
vue | naiveui | pinia | koa | socketio | vite | vitest

---

## §1 Vue 3.5（^3.5.32）

### 规律：须用 `<script setup>` SFC，非 Options API
- **证据**: 107 个 .vue 文件全部用 `<script setup>`；0 处 `defineComponent`/`data()` Options API
- **规律**: 因为全项目统一 SFC + Composition API，所以新增组件须用 `<script setup>`
- **违反后果**: 风格不一致；与既有组件无法用 composable 复用
- **门禁**: --framework/fw_vue_setup

### 规律：响应式优先 ref/computed，慎用 reactive
- **证据**: 590 ref / 535 computed / 3 reactive（reactive 仅用于复杂嵌套对象）
- **规律**: 因为 ref 对重构友好、computed 自动缓存派生状态，所以优先 ref+computed
- **违反后果**: reactive 解构丢失响应式；派生状态存 ref 导致冗余更新
- **门禁**: --framework/fw_vue_reactivity（warn 级，reactive > 5 处时提示）

### 规律：v-html 须配套 sanitize
- **证据**: 9 处 v-html；MatrixRoomSummaryCard.vue:55 注释"必须先 HTML 转义再做 URL 自动链接，否则 <img onerror=...> 将经 v-html 执行（存储型 XSS）"；MatrixMessageBody.vue:26 用 sanitizeHtml
- **规律**: 因为 v-html 会执行原始 HTML，所以须配套 sanitizeHtml/DOMPurify/escapeHtml
- **违反后果**: 存储型 XSS
- **门禁**: --framework/fw_vue_vhtml_sanitize

### 规律：v-for 须稳定 key，不可用 index
- **证据**: 96 处 v-for，仅 1 处用 index（RunTraceNodeDetail.vue:76，对稳定 children 数组，边界可接受）
- **规律**: 因为 index 作 key 在列表增删时导致 DOM 复用错乱，所以须用唯一稳定标识
- **违反后果**: 列表渲染错乱、状态串项
- **门禁**: --framework/fw_vue_vfor_key（warn 级，容忍稳定数组边界）

---

## §2 NaiveUI 2.44（^2.44.1）

### 规律：须具名导入组件，非全局注册
- **证据**: 13 个文件用 `import { NButton, NSelect } from 'naive-ui'`；0 处 `<n-button>` 全局注册写法
- **规律**: 因为项目未全局注册 NaiveUI，所以须具名导入
- **违反后果**: 组件不渲染
- **门禁**: --framework/fw_naiveui_named_import

### 规律：须用 useMessage/useDialog 注入式 API
- **证据**: KanbanAttachments.vue:13 `const message = useMessage()`
- **规律**: 因为 NaiveUI 的通知 API 须在 setup 上下文注入，所以用 useMessage 而非命令式
- **违反后果**: 通知不显示或报错
- **门禁**: --framework/fw_naiveui_injection

### 规律：不引入第二套 UI 库
- **证据**: package.json 无 element-plus/ant-design-vue/vant/@arco-design
- **规律**: 因为混用 UI 库导致样式冲突、体积膨胀，所以仅用 NaiveUI
- **违反后果**: 样式冲突、bundle 体积翻倍
- **门禁**: --framework/fw_naiveui_no_dual_ui

---

## §3 Pinia 3.0（^3.0.4）

### 规律：store 间单向依赖，聚合层只读消费
- **证据**: dev-guide §8.5 + cockpit/store/cockpit.ts:7-9 只读 import matrix stores
- **规律**: 因为循环依赖导致构建失败，所以 cockpit（聚合层）只读引用叶子层 store
- **违反后果**: 循环依赖、构建失败
- **门禁**: --framework/fw_pinia_ownership

### 规律：须 defineStore 定义，经 alias 引用
- **证据**: 14 处 defineStore，经 @/custom 或 @/stores alias 引用
- **规律**: 因为 Pinia 须显式定义 store，所以用 defineStore + alias
- **违反后果**: store 不被 Pinia 识别
- **门禁**: --framework/fw_pinia_alias

---

## §4 Koa 2.15（^2.15.3）

### 规律：路由经 factory 函数注入，非全局 app.use
- **证据**: loop.ts:22 `createLoopRouter(store, scheduler, webhook)` factory；dev-guide §8.7
- **规律**: 因为全局 app.use 导致测试难、路由耦合，所以用 factory 注入
- **违反后果**: 路由无法单测、循环依赖
- **门禁**: --framework/fw_koa_router_factory

### 规律：controller 须经 patch 注入 upstream server index
- **证据**: dev-guide §8.4 + patches/134 在 upstream server index import + app.use(loopRouter)
- **规律**: 因为 upstream 只读，新后端模块须经 patch 接入
- **违反后果**: 路由不生效（upstream 未导入）
- **门禁**: --framework/fw_koa_patch_inject

### 规律：ctx 须参数校验
- **证据**: dev-guide §5 + server/security/url-guard.ts（出站 URL 须经 url-guard）
- **规律**: 因为 Koa ctx 直接信任输入有注入风险，所以须校验
- **违反后果**: SSRF/路径穿越
- **门禁**: --framework/fw_koa_input_validate

---

## §5 Socket.IO 4.8（^4.8.3）

### 规律：须经 setup 函数注册命名空间
- **证据**: loop-socket.ts:16 `setupLoopSocketNamespace(io, store)` 注册 /loop 命名空间
- **规律**: 因为裸 socket.on 难管理生命周期，所以用 setup 函数封装
- **违反后果**: 命名空间泄漏、连接不释放
- **门禁**: --framework/fw_socketio_namespace

### 规律：socket 接入须经 patch 注入
- **证据**: patches/135 在 upstream server index 调用 setupLoopSocketNamespace
- **规律**: 因为 upstream 只读，socket 接入须 patch
- **违反后果**: socket 不生效
- **门禁**: --framework/fw_socketio_patch_inject

---

## §6 Vite 8.0（^8.0.4，overlay inject 机制）

### 规律：alias 须数组形式，@/custom 须在 @ 前
- **证据**: vite.config.overlay.ts:19-20 注释"用数组形式 alias(保证顺序:更具体的前缀先匹配)；@/custom 必须在 @ 前"
- **规律**: 因为 Vite 对象形式 alias 不保证顺序，数组形式按声明顺序匹配
- **违反后果**: @/custom 被 @ 兜底拦截，custom 组件解析失败
- **门禁**: --framework/fw_vite_alias_order

### 规律：inject 须幂等
- **证据**: dev-guide §1 铁律 7 "inject 幂等：npm run inject 可重复执行，npm run clean 可回滚"
- **规律**: 因为 patch 须可重复 apply，所以 inject/clean 幂等
- **违反后果**: 重复构建失败
- **门禁**: --framework/fw_vite_inject_idempotent（检查 scripts/inject.mjs 存在 --clean 分支）

---

## §7 Vitest 3.2（^3.2.4）

### 规律：测试须放 custom/<module>/__tests__/*.test.ts
- **证据**: dev-guide §8.6 + vitest.config.ts include 规则
- **规律**: 因为 vitest.config.ts 只 include custom 下测试，所以测试须放 custom
- **违反后果**: 测试不被执行
- **门禁**: --framework/fw_vitest_location

### 规律：upstream 代码不直接写单测
- **证据**: dev-guide §8.6 "upstream 代码经 patch 注入后由 overlay 间接覆盖"
- **规律**: 因为 upstream 只读，测试须经 overlay 间接覆盖
- **违反后果**: 违反只读约束
- **门禁**: --framework/fw_vitest_no_upstream_test

---

## 使用方式

1. **识别框架**：从 precheck.conf ACTIVE_FRAMEWORKS 确定项目激活的框架
2. **查本表**：找到该框架的规律与门禁检查名
3. **执行门禁**：`bash scripts/precheck.sh --framework`
4. **解读结果**：pass=合规，fail=须修复，warn=建议关注

> 本文件是 precheck `--framework` 门禁的规律依据。门禁实现见 `scripts/precheck.sh` check_framework()。
```

- [ ] **Step 2: 验证文件已创建**

Run: `test -f .claude/skills/ncwk-dev/references/framework-knowledge.md && echo "OK" || echo "MISSING"`
Expected: `OK`

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk
git -C overlay add -A 2>/dev/null; # 根目录非 git 仓库，skill 文件不入 overlay 仓库
echo "framework-knowledge.md created (root 非 git 仓库，无需提交)"
```

> 注：`.claude/skills/ncwk-dev/` 在项目根目录，根目录非 git 仓库，故 skill 文件变更不进 git。后续 Task 同理，提交步骤改为"验证落盘"。

---

### Task 2: precheck.conf 补全 ACTIVE_FRAMEWORKS + 框架约束枚举

**Files:**
- Modify: `.claude/skills/ncwk-dev/scripts/precheck.conf:78-86`

**Interfaces:**
- Produces: `ACTIVE_FRAMEWORKS`（7 框架数组）+ 各框架 `VUE_*`/`NAIVEUI_*`/`PINIA_*`/`KOA_*`/`SOCKETIO_*`/`VITE_*`/`VITEST_*` 约束变量，供 Task 3 的 `check_framework()` 读取。

- [ ] **Step 1: 替换 precheck.conf 末尾框架段**

将 `precheck.conf` 第 78-86 行（从 `# ===== 框架适配` 到文件末尾 `JAVA_BUILD_FILES=()`）替换为：

```bash
# ===== 框架适配门禁（--framework）=====
ACTIVE_FRAMEWORKS=("vue" "naiveui" "pinia" "koa" "socketio" "vite" "vitest")

# --- Vue 3.5 ---
VUE_FILE_GLOBS=("overlay/custom/client/**/*.vue")
VUE_REQUIRE_SCRIPT_SETUP=1
VUE_FORBIDDEN_OPTIONS_API="export default.*defineComponent\|data\s*()\s*{"
VUE_VHTML_SANITIZE_REQUIRED=1
VUE_VHTML_SANITIZE_PATTERNS="sanitizeHtml\|DOMPurify\|escapeHtml\|sanitize"
VUE_VFOR_FORBIDDEN_INDEX_KEY=':key="index"'
VUE_REACTIVE_WARN_THRESHOLD=5

# --- NaiveUI 2.44 ---
NAIVEUI_FILE_GLOBS=("overlay/custom/client/**/*.vue" "overlay/custom/client/**/*.ts")
NAIVEUI_NAMED_IMPORT_REQUIRED=1
NAIVEUI_FORBIDDEN_GLOBAL_REGISTER="<n-[a-z-]+"
NAIVEUI_FORBIDDEN_DUAL_UI="element-plus\|ant-design-vue\|vant\|@arco-design"

# --- Pinia 3.0 ---
PINIA_FILE_GLOBS=("overlay/custom/client/**/*.ts")
PINIA_DEFINESTORE_REQUIRED=1
PINIA_AGGREGATE_STORE="overlay/custom/client/cockpit/store/cockpit.ts"
PINIA_AGGREGATE_READONLY=1

# --- Koa 2.15 ---
KOA_FILE_GLOBS=("overlay/custom/server/**/*.ts")
KOA_ROUTER_FACTORY_REQUIRED=1
KOA_FORBIDDEN_GLOBAL_APPUSE="app\.use\(.*Router"
KOA_INPUT_GUARD="url-guard\|allowlist\|validate"

# --- Socket.IO 4.8 ---
SOCKETIO_FILE_GLOBS=("overlay/custom/server/**/*.ts")
SOCKETIO_NAMESPACE_REQUIRED=1
SOCKETIO_FORBIDDEN_BARE_SOCKET="^socket\.on\("

# --- Vite 8.0 ---
VITE_CONFIG_FILE="overlay/vite.config.overlay.ts"
VITE_ALIAS_ARRAY_FORM_REQUIRED=1
VITE_ALIAS_ORDER_REQUIRED=1
VITE_INJECT_SCRIPT="overlay/scripts/inject.mjs"

# --- Vitest 3.2 ---
VITEST_CONFIG_FILE="overlay/vitest.config.ts"
VITEST_TEST_DIR_PATTERNS=("overlay/custom/**/__tests__/*.test.ts")
VITEST_FORBIDDEN_UPSTREAM_TEST="upstream/.*\.test\.ts"

# ===== 框架适配（ncwk 是 Vue3+NaiveUI+Koa 项目，不激活 JVM 规则集）=====
MYBATIS_MAPPER_DIRS=()
SQL_INJECTION_WHITELIST=()
LOMBOK_ANNOTATIONS="@Data|@Slf4j|@Builder|@Getter|@Setter|@RequiredArgsConstructor"
SHARDING_KEY_COLUMNS=()
SHARDED_TABLES=()
SPRING_BATCH_JOB_DIRS=()
JAVA_BUILD_FILES=()
```

- [ ] **Step 2: 验证 conf 可被 source**

Run: `cd /Volumes/nvme2230/lab/ncwk && bash -c 'source .claude/skills/ncwk-dev/scripts/precheck.conf && echo "frameworks=${ACTIVE_FRAMEWORKS[*]}"'`
Expected: `frameworks=vue naiveui pinia koa socketio vite vitest`

- [ ] **Step 3: 验证落盘**

确认 `precheck.conf` 末尾包含 `ACTIVE_FRAMEWORKS=("vue" "naiveui" "pinia" "koa" "socketio" "vite" "vitest")` 且原 JVM 段保留。

---

### Task 3: precheck.sh 新增 check_framework + 7 个框架检查函数

**Files:**
- Modify: `.claude/skills/ncwk-dev/scripts/precheck.sh`（在 `check_shift_left()` 后、`case "$MODE"` 前插入新函数；在 case 分支补 `--framework`；更新 Usage）

**Interfaces:**
- Consumes: Task 2 的 `ACTIVE_FRAMEWORKS` + 各框架约束变量
- Produces: `check_framework` 函数 + `--framework` dispatch 分支

- [ ] **Step 1: 在 check_shift_left 函数后插入 check_framework 与 7 个子函数**

在 `precheck.sh` 第 2406 行（`check_shift_left` 函数的结束 `}` 之后、第 2408 行 `case "$MODE" in` 之前）插入以下完整代码：

```bash

# ===== 框架适配门禁（--framework）=====
check_framework() {
  echo "▶ 框架适配门禁 (--framework)"
  if [[ ${#ACTIVE_FRAMEWORKS[@]} -eq 0 ]]; then
    skip_if_unconfigured "ACTIVE_FRAMEWORKS 未配置"; return
  fi
  for fw in "${ACTIVE_FRAMEWORKS[@]}"; do
    case "$fw" in
      vue)      _fw_vue_check ;;
      naiveui)  _fw_naiveui_check ;;
      pinia)    _fw_pinia_check ;;
      koa)      _fw_koa_check ;;
      socketio) _fw_socketio_check ;;
      vite)     _fw_vite_check ;;
      vitest)   _fw_vitest_check ;;
      *) warn "未知框架: $fw（precheck.conf ACTIVE_FRAMEWORKS）" ;;
    esac
  done
}

_fw_vue_check() {
  echo "  [vue] Vue 3.5 框架规律"
  local globs="${VUE_FILE_GLOBS[*]}"
  # 规律1: <script setup> 强制
  if [[ "$VUE_REQUIRE_SCRIPT_SETUP" == "1" ]]; then
    local total setup
    total=$(grep -rlE "<script" $globs 2>/dev/null | wc -l | xargs)
    setup=$(grep -rlE "<script setup" $globs 2>/dev/null | wc -l | xargs)
    if [[ "$total" -gt 0 && "$setup" -eq "$total" ]]; then
      pass "vue: 全部 SFC 用 <script setup> ($setup/$total)"
    else
      fail "vue: 存在非 <script setup> 的 SFC (setup=$setup total=$total)"
    fi
  fi
  # 规律2: 禁 Options API
  if [[ -n "$VUE_FORBIDDEN_OPTIONS_API" ]]; then
    local hits; hits=$(grep -rnE "$VUE_FORBIDDEN_OPTIONS_API" $globs 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "vue: 无 Options API"
    else fail "vue: 检出 Options API: $hits"; fi
  fi
  # 规律3: v-html 须配套 sanitize（同文件级）
  if [[ "$VUE_VHTML_SANITIZE_REQUIRED" == "1" ]]; then
    local vhtml_files="" bad=0 offenders=""
    while IFS= read -r f; do vhtml_files="$vhtml_files $f"; done < <(grep -rlE "v-html" $globs 2>/dev/null)
    if [[ -z "${vhtml_files// }" ]]; then
      pass "vue: 无 v-html 使用"
    else
      for f in $vhtml_files; do
        if ! grep -qE "$VUE_VHTML_SANITIZE_PATTERNS" "$f" 2>/dev/null; then
          offenders="$offenders $f"; bad=$((bad+1))
        fi
      done
      if [[ "$bad" -eq 0 ]]; then
        pass "vue: v-html 均配套 sanitize ($(echo $vhtml_files | wc -w | xargs) 处)"
      else
        fail "vue: v-html 未配套 sanitize: $offenders"
      fi
    fi
  fi
  # 规律4: v-for 禁 index 作 key（warn 级）
  if [[ -n "$VUE_VFOR_FORBIDDEN_INDEX_KEY" ]]; then
    local hits; hits=$(grep -rnE "$VUE_VFOR_FORBIDDEN_INDEX_KEY" $globs 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "vue: v-for 无 index 作 key"
    else warn "vue: v-for 用 index 作 key（稳定数组可接受）: $hits"; fi
  fi
  # 规律5: reactive 用量预警
  local rc; rc=$(grep -rhoE "\breactive\b" $globs 2>/dev/null | wc -l | xargs)
  if [[ -n "$VUE_REACTIVE_WARN_THRESHOLD" && "$rc" -gt "$VUE_REACTIVE_WARN_THRESHOLD" ]]; then
    warn "vue: reactive 用量 $rc 处（阈值 $VUE_REACTIVE_WARN_THRESHOLD），建议优先 ref/computed"
  fi
}

_fw_naiveui_check() {
  echo "  [naiveui] NaiveUI 2.44 框架规律"
  local globs="${NAIVEUI_FILE_GLOBS[*]}"
  # 规律1: 须具名导入
  if [[ "$NAIVEUI_NAMED_IMPORT_REQUIRED" == "1" ]]; then
    local named; named=$(grep -rlE "from 'naive-ui'" $globs 2>/dev/null | wc -l | xargs)
    if [[ "$named" -gt 0 ]]; then pass "naiveui: 具名导入 ($named 文件)"
    else warn "naiveui: 未检出具名导入（或未使用 NaiveUI）"; fi
  fi
  # 规律2: 禁全局注册
  if [[ -n "$NAIVEUI_FORBIDDEN_GLOBAL_REGISTER" ]]; then
    local hits; hits=$(grep -rnE "$NAIVEUI_FORBIDDEN_GLOBAL_REGISTER" $globs 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "naiveui: 无全局注册组件"
    else fail "naiveui: 检出全局注册组件（须具名导入）: $hits"; fi
  fi
  # 规律3: 禁第二套 UI 库
  if [[ -n "$NAIVEUI_FORBIDDEN_DUAL_UI" ]]; then
    local hits; hits=$(grep -rnE "$NAIVEUI_FORBIDDEN_DUAL_UI" overlay/package.json 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "naiveui: 无第二套 UI 库"
    else fail "naiveui: 检出第二套 UI 库: $hits"; fi
  fi
}

_fw_pinia_check() {
  echo "  [pinia] Pinia 3.0 框架规律"
  local globs="${PINIA_FILE_GLOBS[*]}"
  # 规律1: 须 defineStore
  if [[ "$PINIA_DEFINESTORE_REQUIRED" == "1" ]]; then
    local cnt; cnt=$(grep -rlE "defineStore" $globs 2>/dev/null | wc -l | xargs)
    if [[ "$cnt" -gt 0 ]]; then pass "pinia: defineStore 定义 ($cnt 文件)"
    else warn "pinia: 未检出 defineStore（或未用 Pinia）"; fi
  fi
  # 规律2: 聚合层 store 须只读消费（存在性检查）
  if [[ -n "$PINIA_AGGREGATE_STORE" && -f "$PINIA_AGGREGATE_STORE" ]]; then
    pass "pinia: 聚合层 store 存在 ($PINIA_AGGREGATE_STORE)"
  else
    warn "pinia: 聚合层 store 未配置或不存在"
  fi
}

_fw_koa_check() {
  echo "  [koa] Koa 2.15 框架规律"
  local globs="${KOA_FILE_GLOBS[*]}"
  # 规律1: 须 factory 注入
  if [[ "$KOA_ROUTER_FACTORY_REQUIRED" == "1" ]]; then
    local factory; factory=$(grep -rlE "create.*Router\s*\(" $globs 2>/dev/null | wc -l | xargs)
    if [[ "$factory" -gt 0 ]]; then pass "koa: router factory 注入 ($factory 处)"
    else warn "koa: 未检出 router factory"; fi
  fi
  # 规律2: 禁裸 app.use(router)
  if [[ -n "$KOA_FORBIDDEN_GLOBAL_APPUSE" ]]; then
    local hits; hits=$(grep -rnE "$KOA_FORBIDDEN_GLOBAL_APPUSE" $globs 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "koa: 无裸 app.use(router)"
    else warn "koa: 检出裸 app.use(router)（建议 factory）: $hits"; fi
  fi
  # 规律3: 须输入校验
  if [[ -n "$KOA_INPUT_GUARD" ]]; then
    local hits; hits=$(grep -rlE "$KOA_INPUT_GUARD" $globs 2>/dev/null | wc -l | xargs)
    if [[ "$hits" -gt 0 ]]; then pass "koa: 输入校验存在 ($hits 处)"
    else warn "koa: 未检出输入校验（url-guard/validate）"; fi
  fi
}

_fw_socketio_check() {
  echo "  [socketio] Socket.IO 4.8 框架规律"
  local globs="${SOCKETIO_FILE_GLOBS[*]}"
  # 规律1: 须命名空间 setup
  if [[ "$SOCKETIO_NAMESPACE_REQUIRED" == "1" ]]; then
    local setup; setup=$(grep -rlE "setup.*[Ss]ocket.*[Nn]amespace\|io\.of\(" $globs 2>/dev/null | wc -l | xargs)
    if [[ "$setup" -gt 0 ]]; then pass "socketio: 命名空间 setup ($setup 处)"
    else warn "socketio: 未检出命名空间 setup"; fi
  fi
  # 规律2: 禁裸 socket.on
  if [[ -n "$SOCKETIO_FORBIDDEN_BARE_SOCKET" ]]; then
    local hits; hits=$(grep -rnE "$SOCKETIO_FORBIDDEN_BARE_SOCKET" $globs 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "socketio: 无裸 socket.on"
    else warn "socketio: 检出裸 socket.on（建议 setup 封装）: $hits"; fi
  fi
}

_fw_vite_check() {
  echo "  [vite] Vite 8.0 框架规律"
  # 规律1: alias 须数组形式 + @/custom 在 @ 前
  if [[ -n "$VITE_CONFIG_FILE" && -f "$VITE_CONFIG_FILE" ]]; then
    if grep -qE "alias:\s*\[" "$VITE_CONFIG_FILE" 2>/dev/null; then
      pass "vite: alias 数组形式"
    else
      fail "vite: alias 须用数组形式（保证顺序）"
    fi
    # 检查 @/custom 在 @ 之前
    local custom_line at_line
    custom_line=$(grep -nE "@/custom" "$VITE_CONFIG_FILE" 2>/dev/null | head -1 | cut -d: -f1)
    at_line=$(grep -nE "find:\s*['\"]@['\"]" "$VITE_CONFIG_FILE" 2>/dev/null | head -1 | cut -d: -f1)
    if [[ -n "$custom_line" && -n "$at_line" && "$custom_line" -lt "$at_line" ]]; then
      pass "vite: @/custom 在 @ 之前 (行 $custom_line < $at_line)"
    else
      fail "vite: @/custom 须在 @ 之前 (custom=$custom_line at=$at_line)"
    fi
  else
    warn "vite: 配置文件未配置或不存在 ($VITE_CONFIG_FILE)"
  fi
  # 规律2: inject 幂等（inject.mjs 存在 --clean 分支）
  if [[ -n "$VITE_INJECT_SCRIPT" && -f "$VITE_INJECT_SCRIPT" ]]; then
    if grep -qE "\-\-clean" "$VITE_INJECT_SCRIPT" 2>/dev/null; then
      pass "vite: inject.mjs 含 --clean 回滚分支"
    else
      fail "vite: inject.mjs 须支持 --clean 回滚"
    fi
  fi
}

_fw_vitest_check() {
  echo "  [vitest] Vitest 3.2 框架规律"
  # 规律1: 测试须在 custom 下
  if [[ -n "$VITEST_CONFIG_FILE" && -f "$VITEST_CONFIG_FILE" ]]; then
    if grep -qE "custom" "$VITEST_CONFIG_FILE" 2>/dev/null; then
      pass "vitest: 配置 include custom 测试"
    else
      warn "vitest: 配置未明确 include custom"
    fi
  else
    warn "vitest: 配置文件不存在 ($VITEST_CONFIG_FILE)"
  fi
  # 规律2: 禁 upstream 测试
  if [[ -n "$VITEST_FORBIDDEN_UPSTREAM_TEST" ]]; then
    local hits; hits=$(find . -path ./node_modules -prune -o -name "*.test.ts" -print 2>/dev/null | grep -E "$VITEST_FORBIDDEN_UPSTREAM_TEST" | head -5)
    if [[ -z "$hits" ]]; then pass "vitest: 无 upstream 测试文件"
    else fail "vitest: 检出 upstream 测试文件（违反只读）: $hits"; fi
  fi
}
```

- [ ] **Step 2: 在 case 分支补 --framework dispatch**

在 `precheck.sh` 第 2476 行 `--shift-left) check_shift_left ;;` 之后、`*)` 之前插入：

```bash
  --framework) check_framework ;;
```

- [ ] **Step 3: 更新 Usage 帮助字符串**

将第 2478 行 Usage 字符串中的 `|--shift-left]` 改为 `|--shift-left|--framework]`。

即把：
```
[--mermaid|--shift-left]"
```
改为：
```
[--mermaid|--shift-left|--framework]"
```

- [ ] **Step 4: 验证 precheck.sh 语法正确**

Run: `cd /Volumes/nvme2230/lab/ncwk && bash -n .claude/skills/ncwk-dev/scripts/precheck.sh && echo "SYNTAX OK" || echo "SYNTAX ERROR"`
Expected: `SYNTAX OK`

- [ ] **Step 5: 验证 --framework 在 Usage 中可见**

Run: `cd /Volumes/nvme2230/lab/ncwk && bash .claude/skills/ncwk-dev/scripts/precheck.sh --invalid-flag 2>&1 | grep -o "framework"`
Expected: `framework`

- [ ] **Step 6: 验证落盘**

确认 `precheck.sh` 含 `check_framework()`、`_fw_vue_check`、`--framework) check_framework`。

---

### Task 4: 执行 --framework 门禁验证 + 修正 SKILL.md 版本漂移

**Files:**
- Modify: `.claude/skills/ncwk-dev/SKILL.md:8,15,56-57`

**Interfaces:**
- Consumes: Task 1-3 产出
- Produces: 验证通过的门禁 + 修正后的 SKILL.md

- [ ] **Step 1: 执行 --framework 门禁**

Run: `cd /Volumes/nvme2230/lab/ncwk && bash .claude/skills/ncwk-dev/scripts/precheck.sh --framework 2>&1`
Expected: 全 pass 或仅 vue v-for index / reactive warn（无 fail）

若出现 fail，记录失败项，对照 `framework-knowledge.md` 检查是门禁误报还是真实问题。误报则调整 `precheck.conf` 对应正则；真实问题则报告用户。

- [ ] **Step 2: 执行 --all-full 确认不破坏现有门禁**

Run: `cd /Volumes/nvme2230/lab/ncwk && bash .claude/skills/ncwk-dev/scripts/precheck.sh --all-full 2>&1 | tail -5`
Expected: 与 Task 3 前行为一致（`--framework` 不在 `--all-full` 中，不影响）

- [ ] **Step 3: 修正 SKILL.md 版本漂移**

修改 `SKILL.md`：
- 第 8 行：`注入 hermes-studio 上游（v0.6.25）` → `注入 hermes-studio 上游（v0.6.30）`
- 第 15 行：`upstream/hermes-studio/`（v0.6.25）→ `upstream/hermes-studio/`（v0.6.30）
- 第 14 行：`hermes-overlay v0.6.22-overlay` 保留（overlay 版本未变）

- [ ] **Step 4: SKILL.md 门禁速查表补 --framework**

在第 57 行 `| 全部 25 | ... --all-full |` 之后新增一行：

```markdown
| 框架适配 | `bash scripts/precheck.sh --framework` |
```

并更新"全部 25"为"全部 26"（新增 --framework 门禁，虽不进 --all-full 聚合但门禁总数 +1）。

- [ ] **Step 5: SKILL.md 技术栈版本表补实际版本**

在 SKILL.md 技术栈段（`**技术栈**：Vue 3 + TypeScript + Vite + NaiveUI + Vitest + SQLite + Koa + Electron` 行）替换为带版本：

```markdown
- **技术栈**：Vue 3.5 + TypeScript 6.0 + Vite 8.0 + NaiveUI 2.44 + Pinia 3.0 + Vitest 3.2 + Koa 2.15 + Socket.IO 4.8 + SQLite + Electron
```

- [ ] **Step 6: 最终验证**

Run: `cd /Volumes/nvme2230/lab/ncwk && bash .claude/skills/ncwk-dev/scripts/precheck.sh --framework 2>&1 | grep -cE "✓|pass" && bash .claude/skills/ncwk-dev/scripts/precheck.sh --framework 2>&1 | grep -cE "✗|fail"`
Expected: pass 计数 > 0，fail 计数 = 0

- [ ] **Step 7: 验证落盘**

确认 SKILL.md 含 `v0.6.30`、`--framework`、`Vue 3.5`；确认 `precheck.sh --framework` 无 fail。

---

## Self-Review

**1. Spec coverage:**
- §1 领域知识层 → Task 1 ✓
- §2 门禁执行层 check_framework + 7 子函数 + dispatch + Usage → Task 3 ✓
- §3 配置枚举层 ACTIVE_FRAMEWORKS + 约束变量 → Task 2 ✓
- §4 版本漂移修正 SKILL.md → Task 4 ✓
- §5 验证方式 --framework + --all-full → Task 4 Step 1-2 ✓

**2. Placeholder scan:** 无 TBD/TODO；所有代码块完整；所有命令含 expected output。

**3. Type consistency:** `ACTIVE_FRAMEWORKS` 7 框架在 conf/sh/knowledge 三处一致（vue/naiveui/pinia/koa/socketio/vite/vitest）；`_fw_<fw>_check` 函数名与 `check_framework` case 分支一一对应；conf 变量名（如 `VUE_VHTML_SANITIZE_PATTERNS`）在 sh 中引用完全一致。
