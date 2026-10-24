---
ruleset_id: element
适用版本: Element Plus 2.x（2.10+ 现行；差异单独标注）
最后调研: 2026-07-17（来源：https://element-plus.org/en-US/ ；https://element-plus.org/en-US/guide/quickstart.html ；https://element-plus.org/en-US/guide/i18n.html ；https://element-plus.org/en-US/component/table.html ；https://element-plus.org/en-US/component/form.html ）
深度门槛: 10
---

# Element Plus 规则集

<!--
本规则集覆盖 Element Plus 2.x（Vue 3 生态组件库）。调研时点：2026-07-17。
Element Plus 2.x 为 Vue 3 重写版，默认支持按需引入（unplugin-vue-components）、CSS Variables 主题、i18n。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `element-plus` 包（package.json dependencies）/ `@element-plus/icons-vue` / `unplugin-vue-components` 配 ElementPlusResolver | 高 |
| 文件 | `**/*.vue` 含 `el-` 前缀组件 / `element-plus.config.*` | 高 |
| 代码 | `import .* from 'element-plus'` / `ElMessage(` / `ElNotification(` / `ElMessageBox(` / `<el-form` / `<el-table` | 高 |
| 配置 | `vite.config.*` 含 `ElementPlusResolver` / `@element-plus` 自动导入配置 | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 element 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Element 组件使用：`grep -rlE '<el-[a-z]+' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：含 el- 组件的 .vue 文件数）
- 命令式 API 调用：`grep -rnE '\bEl(Message|Notification|MessageBox|Loading)\(' "${PROJECT_DIR}" --include='*.vue' --include='*.ts'`（计数核验基准：命令式 API 调用行数）
- 表单组件：`grep -rlE '<el-form\b' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：表单文件数）
- i18n 配置：`grep -rnE 'element-plus/es/locale|ElConfigProvider' "${PROJECT_DIR}"`（计数核验基准：i18n 配置行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：须按需引入，禁全量 import element-plus
- **适用版本**: Element Plus 2.x
- **规律**: 全量 `import ElementPlus from 'element-plus'` 会引入全部组件，包体过大（gzip 数百 KB）。生产须用 `unplugin-vue-components` + `ElementPlusResolver` 按需引入组件与样式，或 `unplugin-auto-import` 引入命令式 API。
- **违反后果**: 首屏 JS 体积膨胀 → 加载慢、LCP 恶化。
- **验证方法**: `grep -rnE "from ['\"]element-plus['\"]|import ElementPlus"` 命中全量 import → warn。
- **对应门禁**: fw_element_on_demand_import(warn)

```verify
id: element-r1
cmd: grep -rnE "from ['\"]element-plus['\"]|import ElementPlus" "${PROJECT_DIR}"
expect: hits>0
```

### 规律：表单校验须用 rules，禁手动 if 校验
- **适用版本**: Element Plus 2.x
- **规律**: `el-form` 须配 `:rules` 校验规则与 `:model`，通过 `FormInstance.validate()` 触发校验。手动 `if` 校验 + `alert` 无法与表单项联动（错误提示、字段聚焦、resetFields），且校验逻辑分散难维护。
- **违反后果**: 校验逻辑分散、无字段级错误提示、用户体验差。
- **验证方法**: 检出 `<el-form` 但无 `:rules=`/`:model=` 且含 `if(...)` 手动校验 → warn。
- **对应门禁**: fw_element_form_rules(warn)

```verify
id: element-r2
cmd: 
expect: always
```

### 规律：el-table 大数据须虚拟滚动
- **适用版本**: Element Plus 2.x
- **规律**: `el-table` 默认全量渲染 DOM，>1k 行时卡顿明显。大数据场景须用 `el-table-v2`（虚拟滚动版）或 `virtual-scroll` 属性。`el-table-v2` 为虚拟化表格，DOM 节点数恒定。
- **违反后果**: 大数据表格渲染卡顿、内存占用高、滚动掉帧。
- **验证方法**: 检出 `<el-table` 绑定疑似大数据源（list/rows/data）但无 virtual/lazy → warn。
- **对应门禁**: fw_element_table_virtual(warn)

```verify
id: element-r3
cmd: 
expect: always
```

### 规律：文案须 i18n，禁硬编码中文
- **适用版本**: Element Plus 2.x
- **规律**: 国际化项目须用 `$t()` / `t()` 调用文案 key，配合 `ElConfigProvider` + `element-plus/es/locale` 切换语言。硬编码中文无法切换语言，且维护时改文案需逐文件查找。
- **违反后果**: 无法国际化、多语言版本维护困难。
- **验证方法**: `.vue/.ts` 文件含连续中文字符且无 `$t(`/`t(`/`i18n` → warn。
- **对应门禁**: fw_element_i18n_no_hardcode_cn(warn)

```verify
id: element-r4
cmd: 
expect: always
```

### 规律：主题覆盖须用 CSS Variables，禁直接改组件包 SCSS 源
- **适用版本**: Element Plus 2.x
- **规律**: Element Plus 2.x 使用 CSS Variables（`--el-color-primary` 等）实现主题，覆盖 `--el-*` 变量即可定制主题。直接 `@use 'element-plus/theme'` 修改内部 SCSS 变量会在升级时丢失定制（源码变更）。
- **违反后果**: 升级 element-plus 后定制样式丢失、维护成本高。
- **验证方法**: `.scss/.css` 引用 `node_modules/element-plus` 内部 SCSS → warn。
- **对应门禁**: fw_element_theme_no_override_component(warn)

```verify
id: element-r5
cmd: 
expect: always
```

### 规律：命令式 API 须显式 import，禁依赖全局挂载
- **适用版本**: Element Plus 2.x
- **规律**: `ElMessage`/`ElNotification`/`ElMessageBox`/`ElLoading` 为命令式 API，按需引入项目须显式 `import { ElMessage } from 'element-plus'`。依赖 `app.use(ElementPlus)` 全局挂载在按需引入/SSR 场景下失效。
- **违反后果**: 按需引入/SSR 下命令式 API undefined 运行期报错。
- **验证方法**: 检出 `ElMessage(`/`ElNotification(` 调用但同文件无 import → warn。
- **对应门禁**: fw_element_imperative_api(warn)

```verify
id: element-r6
cmd: 
expect: always
```

### 规律：el-form-item 须配 prop 与 model 字段对应
- **适用版本**: Element Plus 2.x
- **规律**: `el-form-item` 的 `prop` 须与 `:model` 对象的字段路径对应，否则 `validate()`/`resetFields()` 无法定位字段，校验与重置失效。
- **违反后果**: 校验不触发、resetFields 不清空、字段错误提示错位。
- **验证方法**: 检出 `<el-form-item` 但无 `prop=`/`prop:` → warn。
- **对应门禁**: fw_element_form_item_prop(warn)

```verify
id: element-r7
cmd: 
expect: always
```

### 规律：el-dialog 须配 destroy-on-close
- **适用版本**: Element Plus 2.x
- **规律**: `el-dialog` 默认关闭后保留子组件实例（仅 v-show），表单/校验状态残留。须配 `destroy-on-close` 销毁子组件，下次打开重新初始化。
- **违反后果**: 关闭重开 dialog 后表单数据/校验状态残留、数据泄漏。
- **验证方法**: 检出 `<el-dialog` 但无 `destroy-on-close` → warn。
- **对应门禁**: fw_element_dialog_destroy_on_close(warn)

```verify
id: element-r8
cmd: 
expect: always
```

### 规律：el-tree 大数据须虚拟滚动
- **适用版本**: Element Plus 2.x
- **规律**: `el-tree` 默认全量渲染节点，>1k 节点卡顿。须用 `el-tree-v2`（虚拟化树）或配 `:height` 虚拟滚动。
- **违反后果**: 大数据树渲染卡顿、展开/折叠掉帧。
- **验证方法**: 检出 `<el-tree` 但无 virtual/height → warn。
- **对应门禁**: fw_element_tree_virtual(warn)

```verify
id: element-r9
cmd: 
expect: always
```

### 规律：日期组件须配 value-format
- **适用版本**: Element Plus 2.x
- **规律**: `el-date-picker`/`el-time-picker` 默认 `value-format` 为 Date 对象，序列化为 JSON 时区不一致、反序列化需手动处理。须显式配 `value-format="YYYY-MM-DD"` 等字符串格式，保证序列化一致性。
- **违反后果**: 时区错乱、序列化反序列化不一致、跨端展示差异。
- **验证方法**: 检出 `<el-date-picker`/`<el-time-picker` 但无 `value-format` → warn。
- **对应门禁**: fw_element_date_value_format(warn)

```verify
id: element-r10
cmd: 
expect: always
```

### 规律：el-upload 须配文件大小限制
- **适用版本**: Element Plus 2.x
- **规律**: `el-upload` 默认无大小限制，用户可上传任意大文件，导致存储耗尽/带宽占用/DoS。须配 `before-upload` 钩子校验 `file.size`，超限拒绝并提示。
- **违反后果**: 超大文件上传致存储耗尽、服务 DoS CWE-400。
- **验证方法**: 检出 `<el-upload` 但无 `before-upload`/`:limit` → fail。
- **对应门禁**: fw_element_upload_size_limit(fail)

```verify
id: element-r11
cmd: 
expect: always
```

### 规律：el-select 大数据须远程搜索
- **适用版本**: Element Plus 2.x
- **规律**: `el-select` 配 `filterable` 后默认本地过滤，全量渲染所有选项。选项 >1k 时渲染卡顿。须配 `remote-method` 远程搜索，按需加载选项。
- **违反后果**: 大数据选项渲染卡顿、内存占用高。
- **验证方法**: 检出 `filterable` 但无 `remote-method` → warn。
- **对应门禁**: fw_element_select_remote_search(warn)

```verify
id: element-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_element_on_demand_import | warn | 全量 import element-plus → warn 包体过大 | ELEMENT_SRC_GLOBS | — |
| fw_element_form_rules | warn | el-form 未用 :rules + 手动 if 校验 → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_table_virtual | warn | el-table 大数据源未配虚拟滚动 → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_i18n_no_hardcode_cn | warn | 硬编码中文文案 → warn 无法国际化 | ELEMENT_SRC_GLOBS | — |
| fw_element_theme_no_override_component | warn | 直接改 element-plus 内部 SCSS → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_imperative_api | warn | 命令式 API 未显式 import → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_form_item_prop | warn | el-form-item 无 prop → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_dialog_destroy_on_close | warn | el-dialog 无 destroy-on-close → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_tree_virtual | warn | el-tree 未配虚拟滚动 → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_date_value_format | warn | 日期组件无 value-format → warn | ELEMENT_SRC_GLOBS | — |
| fw_element_upload_size_limit | fail | el-upload 无 before-upload 大小校验 → fail DoS | ELEMENT_SRC_GLOBS | CWE-770（资源分配无限制，门禁文案 DoS）；GB/T 38674-2020 §8.1（输入/资源限制类安全设计） |
| fw_element_select_remote_search | warn | el-select filterable 无 remote-method → warn | ELEMENT_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_element_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/element.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_element_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: element  requires_conf: ELEMENT_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含全量 import + 手动表单校验 + 硬编码中文 + el-upload 无大小限制 → upload_size_limit fail 主触发（1/1）；compliant 全 pass。expected-fail-ids 已登记 1/1 fail id（2026-07-20 P1）。CWE/GB 映射列（同批补录）：仅对具直接安全语义的行引证，其余标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| element × vue | 须 Vue 3.x（element-plus 不兼容 Vue 2） | element-plus 为 Vue 3 重写，Vue 2 须用 element-ui |
| element × vite | 按需引入须配 unplugin-vue-components + ElementPlusResolver | 否则全量引入或组件未注册 |
| element × i18n | 须 ElConfigProvider + element-plus/es/locale 切换语言 | 否则组件内置文案为中文默认 |
| element × tailwind | 主题冲突须用 prefix 或 layer 隔离 | tailwind preflight 可能覆盖 element 默认样式 |

<!--
无强交互的框架组合省略；本表聚焦 element 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Element Plus 2.0 | Vue 3 重写，API 与 element-ui（Vue 2）不兼容 | Vue 2 项目升级须全量迁移 API |
| Element Plus 2.2 | 引入 CSS Variables 主题系统 | 旧 SCSS 变量覆盖方式废弃，须改 --el-* 变量 |
| Element Plus 2.4 | el-table-v2 稳定（虚拟滚动） | 大数据表格须迁移至 el-table-v2 |
| Element Plus 2.6 | i18n 默认 locale 调整（待验证具体值） | 待验证：默认语言包路径变化须人工核实 |
| Element Plus 2.10+ | 现行稳定版（待验证 minor 变化） | 待验证：2.10 是否有 breaking change 须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
