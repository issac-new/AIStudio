---
ruleset_id: naiveui
适用版本: NaiveUI 2.x（2.44+ 现行；差异单独标注）
最后调研: 2026-07-17（来源：https://www.naiveui.com/ ；https://www.naiveui.com/zh-CN/os-theme/docs/introduction ；https://www.naiveui.com/zh-CN/os-theme/components/config-provider ；https://www.naiveui.com/zh-CN/os-theme/components/message ）
深度门槛: 10
---

# NaiveUI 规则集

<!--
本规则集覆盖 NaiveUI 2.x（Vue 3 生态组件库，TypeScript 编写，全树摇友好）。调研时点：2026-07-17。
NaiveUI 默认按需引入（无需 babel-plugin-import），主题用 n-config-provider overrides，暗色用 darkTheme。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `naive-ui` 包（package.json dependencies）/ `@vicons/ionicons5` 等图标包 | 高 |
| 文件 | `**/*.vue` 含 `n-` 前缀组件 / `**/*.ts` 含 `from 'naive-ui'` | 高 |
| 代码 | `from 'naive-ui'` / `useMessage(` / `useDialog(` / `n-config-provider` / `<n-data-table` | 高 |
| 配置 | `vite.config.*` 含 `NaiveUiResolver` / `unplugin-vue-components` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 naiveui 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- NaiveUI 组件使用：`grep -rlE "from 'naive-ui'" "${PROJECT_DIR}" --include='*.vue' --include='*.ts'`（计数核验基准：import naive-ui 的文件数）
- n- 前缀组件：`grep -rlE '<n-[a-z]+' "${PROJECT_DIR}" --include='*.vue'`（计数核验基准：含 n- 组件的 .vue 文件数）
- useMessage 调用：`grep -rnE 'useMessage\(|useDialog\(' "${PROJECT_DIR}" --include='*.vue' --include='*.ts'`（计数核验基准：注入式 API 调用行数）
- config-provider 主题：`grep -rnE 'n-config-provider|themeOverrides' "${PROJECT_DIR}"`（计数核验基准：主题配置行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：须具名导入，禁全局注册
- **适用版本**: NaiveUI 2.x
- **规律**: NaiveUI 默认 tree-shaking 友好，须具名 `import { NButton } from 'naive-ui'` 或用 `unplugin-vue-components` + `NaiveUiResolver` 自动按需。禁 `app.use(naive)` 全局注册（包体膨胀 + 类型丢失）。
- **违反后果**: 全量引入包体过大、全局注册类型提示丢失。
- **验证方法**: 检出 `app.use(n` / `app.component('n-` 全局注册 → fail；无 `from 'naive-ui'` 具名导入 → warn。
- **对应门禁**: fw_naiveui_named_import(warn) / fw_naiveui_no_global_register(fail)

```verify
id: naiveui-r1
cmd: 
expect: always
```

### 规律：禁与第二套 UI 库混用
- **适用版本**: NaiveUI 2.x
- **规律**: 项目应只用一套 UI 库。混用 element-plus / ant-design-vue / vant 会导致主题不一致、包体叠加、样式冲突。
- **违反后果**: 主题不一致、包体翻倍、样式优先级冲突。
- **验证方法**: 检出 `from 'element-plus'|'ant-design-vue'|'vant'` → fail。
- **对应门禁**: fw_naiveui_no_dual_ui(fail)

```verify
id: naiveui-r2
cmd: 
expect: always
```

### 规律：主题覆盖须用 n-config-provider，禁直接改 .n-* 类 CSS
- **适用版本**: NaiveUI 2.x
- **规律**: 主题定制须用 `n-config-provider` 的 `theme-overrides`（token 覆盖）。直接写 `.n-button { ... }` 覆写类名在升级时失效（类名/选择器变化）。
- **违反后果**: 升级后定制样式失效、无法动态切换主题。
- **验证方法**: `.css/.scss` 检出 `.n-*` 类覆写 → warn。
- **对应门禁**: fw_naiveui_config_provider_theme(warn)

```verify
id: naiveui-r3
cmd: 
expect: always
```

### 规律：useMessage/useDialog 须注入式，禁裸 createDiscreteApi
- **适用版本**: NaiveUI 2.x
- **规律**: `useMessage()`/`useDialog()` 须在 `n-config-provider` / `n-message-provider` 子树内调用（注入式，消费 context 主题/locale）。`createDiscreteApi` 脱离组件树，无法消费 config-provider context，仅用于脱离场景（如路由守卫），业务组件禁用。
- **违反后果**: createDiscreteApi 调用不应用主题/locale、与 config-provider 脱节。
- **验证方法**: 检出 `createDiscreteApi(` → warn。
- **对应门禁**: fw_naiveui_usemessage_inject(warn)

```verify
id: naiveui-r4
cmd: 
expect: always
```

### 规律：n-data-table 大数据须虚拟滚动
- **适用版本**: NaiveUI 2.x
- **规律**: `n-data-table` 默认全量渲染，>1k 行卡顿。须配 `virtual-scroll` + `:max-height` 启用虚拟滚动。
- **违反后果**: 大数据表格渲染卡顿、内存占用高。
- **验证方法**: 检出 `<n-data-table` 绑定大数据源但无 virtual-scroll/max-height → warn。
- **对应门禁**: fw_naiveui_datatable_virtual(warn)

```verify
id: naiveui-r5
cmd: 
expect: always
```

### 规律：暗色模式须用 darkTheme，禁手写 dark CSS
- **适用版本**: NaiveUI 2.x
- **规律**: 暗色模式须用 `n-config-provider :theme="darkTheme"`，组件内置暗色变量。手写 `.dark .xxx` CSS 与组件库主题脱节，仅覆盖部分组件。
- **违反后果**: 暗色模式下部分组件未适配、主题脱节。
- **验证方法**: 检出 `.dark`/`prefers-color-scheme` 手写暗色 CSS 且无 darkTheme → warn。
- **对应门禁**: fw_naiveui_darktheme(warn)

```verify
id: naiveui-r6
cmd: 
expect: always
```

### 规律：n-form 须用 rules 校验，禁手动 if 校验
- **适用版本**: NaiveUI 2.x
- **规律**: `n-form` 须配 `:rules` + `formRef.validate()`，禁手动 `if` + `alert` 校验（无字段级错误提示、无联动）。
- **违反后果**: 校验逻辑分散、无字段级错误提示。
- **验证方法**: 检出 `<n-form` 但无 `:rules` + 手动 if 校验 → warn。
- **对应门禁**: fw_naiveui_form_rules(warn)

```verify
id: naiveui-r7
cmd: 
expect: always
```

### 规律：n-select filterable 大数据须远程搜索
- **适用版本**: NaiveUI 2.x
- **规律**: `n-select` 配 `filterable` 后默认本地过滤，选项 >1k 时卡顿。须配 `@search` + `:loading` 远程搜索。
- **违反后果**: 大数据选项渲染卡顿。
- **验证方法**: 检出 `filterable` 但无 `@search`/`:loading` → warn。
- **对应门禁**: fw_naiveui_select_remote(warn)

```verify
id: naiveui-r8
cmd: 
expect: always
```

### 规律：n-upload 须配文件大小限制
- **适用版本**: NaiveUI 2.x
- **规律**: `n-upload` 默认无大小限制，须配 `@before-upload` 钩子校验 `file.file?.size`，超限返回 false。
- **违反后果**: 超大文件上传致存储耗尽、服务 DoS CWE-400。
- **验证方法**: 检出 `<n-upload` 但无 `before-upload`/`:max` → fail。
- **对应门禁**: fw_naiveui_upload_size_limit(fail)

```verify
id: naiveui-r9
cmd: 
expect: always
```

### 规律：n-modal 优先 preset="card" 统一布局
- **适用版本**: NaiveUI 2.x
- **规律**: `n-modal` 用 `preset="card"` 自动生成标题/关闭按钮/边框，统一布局。裸 n-modal 须手写标题/关闭，易不一致。
- **违反后果**: 弹窗布局不一致、手写标题/关闭按钮样式分散。
- **验证方法**: 检出 `<n-modal` 但无 preset/title/bordered → warn。
- **对应门禁**: fw_naiveui_modal_preset_card(warn)

```verify
id: naiveui-r10
cmd: 
expect: always
```

<!--
共 11 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_naiveui_named_import | warn | 无具名 from 'naive-ui' → warn | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_no_global_register | fail | app.use(n)/app.component('n-') 全局注册 → fail | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_no_dual_ui | fail | 检出 element-plus/ant-design-vue/vant → fail | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_config_provider_theme | warn | 直接覆写 .n-* 类 CSS → warn | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_usemessage_inject | warn | createDiscreteApi 脱离组件树 → warn | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_datatable_virtual | warn | n-data-table 大数据源无 virtual-scroll → warn | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_darktheme | warn | 手写 dark CSS 无 darkTheme → warn | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_form_rules | warn | n-form 无 :rules + 手动 if 校验 → warn | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_select_remote | warn | n-select filterable 无 @search → warn | NAIVEUI_FILE_GLOBS | — |
| fw_naiveui_upload_size_limit | fail | n-upload 无 before-upload 大小校验 → fail DoS | NAIVEUI_FILE_GLOBS | CWE-770（资源分配无限制，门禁文案 DoS）；GB/T 38674-2020 §8.1（输入/资源限制类安全设计） |
| fw_naiveui_modal_preset_card | warn | n-modal 无 preset/title → warn | NAIVEUI_FILE_GLOBS | — |

<!--
门禁 id 命名规范：fw_naiveui_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/naiveui.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_naiveui_<rule>(fail/warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: naiveui  requires_conf: NAIVEUI_FILE_GLOBS` 声明。
fixture 验证覆盖：violating 3/3 fail 全触发（no_global_register / no_dual_ui / upload_size_limit）；no_dual_ui 于 2026-07-20 P1 新增 element-plus 混用样本实例化唤醒，门禁判定逻辑未动。expected-fail-ids 已登记 3/3 fail id。CWE/GB 映射列（同批补录）：仅对具直接安全语义的行引证，其余标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| naiveui × vue | 须 Vue 3.x（naive-ui 不兼容 Vue 2） | naive-ui 为 Vue 3 设计 |
| naiveui × vite | 按需引入须配 unplugin-vue-components + NaiveUiResolver | naive-ui 默认 tree-shaking 友好，resolver 自动注册 |
| naiveui × tailwind | 须用 prefix 或 layer 隔离 | tailwind preflight 可能覆盖 naive-ui 默认样式 |
| naiveui × pinia | useMessage 须在 provider 子树内调用 | store 内调用 useMessage 须确保 provider 已挂载 |

<!--
无强交互的框架组合省略；本表聚焦 naiveui 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| NaiveUI 2.30 | n-data-table virtual-scroll 稳定 | 大数据表格须启用 virtual-scroll |
| NaiveUI 2.34 | useMessage 注入式 API 稳定（createDiscreteApi 标记为脱离场景） | 业务组件禁用 createDiscreteApi |
| NaiveUI 2.38 | themeOverrides 结构调整（待验证具体 token 变化） | 待验证：旧 token 路径须人工核实 |
| NaiveUI 2.44+ | 现行稳定版（待验证 minor 变化） | 待验证：2.44 是否有 breaking change 须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
