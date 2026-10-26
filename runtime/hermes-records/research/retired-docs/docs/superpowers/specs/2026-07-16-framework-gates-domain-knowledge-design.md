# 技术框架枚举/约束/门禁/领域知识完善 — 设计文档

> **范围**：swarm yuan skill（`.claude/skills/ncwk-dev/`）的技术框架适配闭环
> **目标**：让 `ACTIVE_FRAMEWORKS` 从死配置变为可执行门禁，补齐框架领域知识，修正版本漂移
> **日期**：2026-07-16

## 1. 问题现状（代码证据）

### 1.1 ACTIVE_FRAMEWORKS 是死配置
- `precheck.conf:79` 声明 `ACTIVE_FRAMEWORKS=("vue" "naiveui")`
- `precheck.sh` 全文 grep `ACTIVE_FRAMEWORKS` = **0 引用**
- 框架特定门禁根本未接上

### 1.2 领域知识是通用速查表，非项目落地
- `references/domain-knowledge.md` 自述"不是直接复制到 reference-manual 的清单——而是分析起点"
- 前端(Vue/React)/CSS 段是通用规律，未针对 ncwk 实际技术栈代码验证

### 1.3 版本漂移
- `SKILL.md` 写 upstream v0.6.25，实际 **v0.6.30**
- overlay 版本 0.6.22-overlay-1.5
- 技术栈版本表过期

### 1.4 缺失的框架领域知识
ncwk 实际技术栈（经 `upstream/hermes-studio/package.json` 验证）：
| 框架 | 实际版本 | 现有领域知识覆盖 |
|------|---------|----------------|
| vue | ^3.5.32 | 仅通用 Vue/React 段 |
| naive-ui | ^2.44.1 | 无 |
| pinia | ^3.0.4 | 无 |
| koa | ^2.15.3 | 无 |
| socket.io | ^4.8.3 | 无 |
| vite | ^8.0.4 | 无 |
| vitest | ^3.2.4 | 无 |
| typescript | ~6.0.2 | 无 |

现有 25 个门禁（`--layer/--frontend/--state/--domain` 等）**无 `--framework` 门禁**。

## 2. 整体架构（三层闭环）

```
① 领域知识层  references/framework-knowledge.md   ← 新增
   └─ 7 个技术框架的「代码验证规律」(Vue3/NaiveUI/Pinia3/Koa2/Socket.IO/Vite8/Vitest3)
      每条规律带 [代码证据] → 推导 → 违反后果 → 门禁映射

② 门禁执行层  scripts/precheck.sh                  ← 扩展
   ├─ 新增 check_framework() + --framework 分支
   ├─ 读 ACTIVE_FRAMEWORKS 逐框架调度 _fw_<fw>_check()
   └─ 纯 bash grep 实现，零新依赖，风格对齐现有 25 个门禁

③ 配置枚举层  scripts/precheck.conf               ← 补齐
   ├─ ACTIVE_FRAMEWORKS 补全为 7 框架
   └─ 新增 FRAMEWORK_FORBIDDEN_* / FRAMEWORK_REQUIRED_* 枚举变量

④ 同步修正    SKILL.md                             ← 版本漂移修正
   └─ upstream v0.6.25 → v0.6.30，技术栈版本表更新
```

**数据流**：`precheck.conf` 的 `ACTIVE_FRAMEWORKS` 枚举 → `precheck.sh --framework` 读取并调度 → 每个框架函数用 grep 验证 `framework-knowledge.md` 中的规律 → pass/fail/warn 输出。

## 3. framework-knowledge.md 内容结构

### 3.1 定位
- `domain-knowledge.md` = 通用速查表（分析起点，"不可直接复制"）
- `framework-knowledge.md` = **项目落地**（最终产出，每条规律经 ncwk 代码验证）
- 二者不重复：domain 是"该领域有哪些规律值得验证"，framework 是"本项目验证后成立的规律"

### 3.2 文件骨架
```
# 技术框架领域知识 (Framework Domain Knowledge)
> 本文件每条规律均经 ncwk 代码验证。违反 = 构建失败/运行时错误/XSS 风险。
> 维护规则：upstream 版本升级后须重新验证；规律变更须附代码证据。

## 框架清单（对应 precheck.conf ACTIVE_FRAMEWORKS）
vue | naiveui | pinia | koa | socketio | vite | vitest

## §1 Vue 3.5
## §2 NaiveUI 2.44
## §3 Pinia 3.0
## §4 Koa 2.15
## §5 Socket.IO 4.8
## §6 Vite 8.0 (overlay inject 机制)
## §7 Vitest 3.2
```

### 3.3 统一三段式规律格式
```
### 规律名
- **证据**: [文件:行] 代码片段
- **规律**: 因为 <证据>，所以 <客观规律>
- **违反后果**: <具体后果>
- **门禁**: --framework/<检查名>
```

### 3.4 7 个框架的核心规律清单（已用代码验证）

#### §1 Vue 3.5
| 规律 | 证据 | 门禁检查名 |
|------|------|-----------|
| 须用 `<script setup>` SFC，非 Options API | 107 文件全用 setup；0 处 Options API | fw_vue_setup |
| 响应式优先 `ref`/`computed`，慎用 `reactive` | 590 ref / 535 computed / 3 reactive | fw_vue_reactivity |
| `v-html` 须配套 sanitize | 9 处 v-html，MatrixRoomSummaryCard.vue:55 注释 + sanitizeHtml | fw_vue_vhtml_sanitize |
| 列表 `v-for` 须稳定 key，不可用 index | 96 处 v-for，仅 1 处用 index（稳定 children 数组，边界可接受） | fw_vue_vfor_key |

#### §2 NaiveUI 2.44
| 规律 | 证据 | 门禁检查名 |
|------|------|-----------|
| 须具名导入组件（`import { NButton }`），非全局注册 | KanbanAttachments.vue:3；0 处 `<n-` 全局注册 | fw_naiveui_named_import |
| 须用 `useMessage`/`useDialog` 注入式 API | KanbanAttachments.vue:13 `useMessage()` | fw_naiveui_injection |
| 不引入第二套 UI 库 | package.json 无 element-plus/antd/vant | fw_naiveui_no_dual_ui |

#### §3 Pinia 3.0
| 规律 | 证据 | 门禁检查名 |
|------|------|-----------|
| store 间单向依赖（cockpit 聚合层只读消费） | dev-guide §8.5 + cockpit/store/cockpit.ts:7-9 | fw_pinia_ownership |
| 须 `defineStore` 定义，经 alias 引用 | 14 处 defineStore | fw_pinia_alias |

#### §4 Koa 2.15
| 规律 | 证据 | 门禁检查名 |
|------|------|-----------|
| 路由经 `createLoopRouter()` factory 注入 | loop.ts:22 + dev-guide §8.7 | fw_koa_router_factory |
| controller 须经 patch 注入 upstream server index | dev-guide §8.4 + patches/134 | fw_koa_patch_inject |
| ctx 须参数校验（url-guard allowlist） | dev-guide §5 + server/security/url-guard.ts | fw_koa_input_validate |

#### §5 Socket.IO 4.8
| 规律 | 证据 | 门禁检查名 |
|------|------|-----------|
| 须经 `setupLoopSocketNamespace(io, store)` 注册命名空间 | loop-socket.ts:16 | fw_socketio_namespace |
| socket 接入须经 patch 注入 | patches/135 | fw_socketio_patch_inject |

#### §6 Vite 8.0
| 规律 | 证据 | 门禁检查名 |
|------|------|-----------|
| alias 须数组形式，`@/custom` 必须在 `@` 前 | vite.config.overlay.ts:19-20 注释 | fw_vite_alias_order |
| inject 须幂等（可重复执行，clean 可回滚） | dev-guide §1 铁律 7 | fw_vite_inject_idempotent |

#### §7 Vitest 3.2
| 规律 | 证据 | 门禁检查名 |
|------|------|-----------|
| 测试须放 `custom/<module>/__tests__/*.test.ts` | dev-guide §8.6 | fw_vitest_location |
| upstream 代码不直接写单测 | dev-guide §8.6 | fw_vitest_no_upstream_test |

## 4. precheck.conf 枚举补齐

在现有 `ACTIVE_FRAMEWORKS=("vue" "naiveui")` 基础上补全为 7 框架，并新增框架专属约束变量：

```bash
# ===== 框架适配门禁（--framework）=====
ACTIVE_FRAMEWORKS=("vue" "naiveui" "pinia" "koa" "socketio" "vite" "vitest")

# --- Vue ---
VUE_FILE_GLOBS=("overlay/custom/client/**/*.vue")
VUE_REQUIRE_SCRIPT_SETUP=1
VUE_FORBIDDEN_OPTIONS_API="export default.*defineComponent\|data\s*()\s*{"
VUE_VHTML_SANITIZE_REQUIRED=1
VUE_VHTML_SANITIZE_PATTERNS="sanitizeHtml\|DOMPurify\|escapeHtml\|sanitize"
VUE_VFOR_FORBIDDEN_INDEX_KEY=':key="index"'

# --- NaiveUI ---
NAIVEUI_FILE_GLOBS=("overlay/custom/client/**/*.vue" "overlay/custom/client/**/*.ts")
NAIVEUI_NAMED_IMPORT_REQUIRED=1
NAIVEUI_FORBIDDEN_GLOBAL_REGISTER="<n-[a-z-]+"
NAIVEUI_FORBIDDEN_DUAL_UI="element-plus\|ant-design-vue\|vant\|@arco-design"

# --- Pinia ---
PINIA_FILE_GLOBS=("overlay/custom/client/**/*.ts")
PINIA_DEFINESTORE_REQUIRED=1
PINIA_AGGREGATE_STORE="overlay/custom/client/cockpit/store/cockpit.ts"
PINIA_AGGREGATE_READONLY=1

# --- Koa ---
KOA_FILE_GLOBS=("overlay/custom/server/**/*.ts")
KOA_ROUTER_FACTORY_REQUIRED=1
KOA_FORBIDDEN_GLOBAL_APPUSE="app\.use\(.*Router"
KOA_INPUT_GUARD="url-guard\|allowlist\|validate"

# --- Socket.IO ---
SOCKETIO_FILE_GLOBS=("overlay/custom/server/**/*.ts")
SOCKETIO_NAMESPACE_REQUIRED=1
SOCKETIO_FORBIDDEN_BARE_SOCKET="^socket\.on\("

# --- Vite ---
VITE_CONFIG_FILE="overlay/vite.config.overlay.ts"
VITE_ALIAS_ARRAY_FORM_REQUIRED=1
VITE_ALIAS_ORDER_REQUIRED=1

# --- Vitest ---
VITEST_CONFIG_FILE="overlay/vitest.config.ts"
VITEST_TEST_DIR_PATTERNS=("overlay/custom/**/__tests__/*.test.ts")
VITEST_FORBIDDEN_UPSTREAM_TEST="upstream/.*\\.test\\.ts"
```

## 5. precheck.sh check_framework 实现

### 5.1 主函数 + dispatch

风格对齐现有门禁：`skip_if_unconfigured` 处理空配置，`pass/fail/warn` 输出，纯 bash grep。

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
```

dispatch 接入（现有 case 分支，约 2452 行附近）：
```bash
--framework) check_framework ;;
```

`--all` / `--all-full` 聚合中**不自动包含** `--framework`（与 `--domain`/`--cognition` 一致，属进阶门禁，显式调用）。Usage 帮助字符串补 `--framework`。

### 5.2 各框架检查函数（同构，以 Vue 为例）

```bash
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
  # 规律2: v-html 须配套 sanitize（同文件级检查）
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
  # 规律3: 禁 Options API
  if [[ -n "$VUE_FORBIDDEN_OPTIONS_API" ]]; then
    local hits; hits=$(grep -rnE "$VUE_FORBIDDEN_OPTIONS_API" $globs 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "vue: 无 Options API"
    else fail "vue: 检出 Options API: $hits"; fi
  fi
  # 规律4: v-for 禁 index 作 key
  if [[ -n "$VUE_VFOR_FORBIDDEN_INDEX_KEY" ]]; then
    local hits; hits=$(grep -rnE "$VUE_VFOR_FORBIDDEN_INDEX_KEY" $globs 2>/dev/null)
    if [[ -z "$hits" ]]; then pass "vue: v-for 无 index 作 key"
    else warn "vue: v-for 用 index 作 key（稳定数组可接受）: $hits"; fi
  fi
}
```

其余 6 个 `_fw_<fw>_check()` 同构，按 §3.4 规律表逐条 grep 检查。`v-for index key` 用 `warn`（非 fail）以容忍边界情况。

### 5.3 SKILL.md 版本修正
- `v0.6.25` → `v0.6.30`
- 技术栈版本表更新为实际版本（vue ^3.5.32 / naive-ui ^2.44.1 / pinia ^3.0.4 / vite ^8.0.4 / vitest ^3.2.4 / koa ^2.15.3 / socket.io ^4.8.3 / typescript ~6.0.2）
- 门禁速查表补 `--framework` 行

## 6. 风险与边界

- **grep 误报**：`v-html 配套 sanitize` 是同文件级检查，若 sanitize 在父组件而 v-html 在子组件会误报 → 可接受（鼓励就地消毒）
- **性能**：7 框架 × 3-4 规律 = ~25 次 grep，与 `--frontend` 同量级，可接受
- **向后兼容**：`ACTIVE_FRAMEWORKS` 原本死配置，激活后对已有代码**应全 pass**（规律均经代码验证）；若有 fail 说明发现真实问题
- **v-for index key 边界**：用 warn 而非 fail，容忍 `RunTraceNodeDetail.vue:76` 这类稳定数组场景

## 7. 验证方式

完成后执行：
```bash
bash .claude/skills/ncwk-dev/scripts/precheck.sh --framework   # 应全 pass（或仅 v-for index warn）
bash .claude/skills/ncwk-dev/scripts/precheck.sh --all-full    # 确认不破坏现有门禁
```

## 8. 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `references/framework-knowledge.md` | 新增 | 7 框架代码验证规律 |
| `scripts/precheck.conf` | 扩展 | ACTIVE_FRAMEWORKS 补全 + 框架约束枚举 |
| `scripts/precheck.sh` | 扩展 | check_framework + 7 个 _fw_*_check + dispatch |
| `SKILL.md` | 修正 | 版本漂移 v0.6.25→v0.6.30 + 技术栈版本表 + 门禁速查表 |
