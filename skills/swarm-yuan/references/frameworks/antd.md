---
ruleset_id: antd
适用版本: Ant Design 6.x（6.x 现行；5.x 差异单独标注）
最后调研: 2026-07-17（来源：https://ant.design/ ；https://ant.design/components/app ；https://ant.design/components/form ；https://ant.design/components/table ；https://ant.design/components/config-provider ）
深度门槛: 10
---

# Ant Design 规则集

<!--
本规则集覆盖 Ant Design 6.x（React 19 兼容）与 5.x（差异单独标注）。调研时点：2026-07-17。
Ant Design 5.x 起引入 CSS-in-JS + ConfigProvider theme token，废弃 less 变量；6.x 延续并强化 App.useApp。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `antd` 包（package.json dependencies）/ `@ant-design/icons` / `unplugin` 配 AntdResolver | 高 |
| 文件 | `**/*.tsx` / `**/*.jsx` 含 `<Button` / `<Table` / `<Form`（ant 组件 PascalCase） | 高 |
| 代码 | `from 'antd'` / `App.useApp(` / `useForm(` / `ConfigProvider` / `message.success(` | 高 |
| 配置 | `vite.config.*` / `webpack.config.*` 含 `AntdResolver` / `babel-plugin-import` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 antd 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- antd 组件使用：`grep -rlE "from 'antd'|from \"antd\"" "${PROJECT_DIR}" --include='*.tsx' --include='*.jsx'`（计数核验基准：import antd 的组件文件数）
- 静态 message 调用：`grep -rnE '\bmessage\.(success|error|info|warning)\(' "${PROJECT_DIR}" --include='*.tsx' --include='*.jsx'`（计数核验基准：静态调用行数）
- Form 表单：`grep -rlE '<Form\b' "${PROJECT_DIR}" --include='*.tsx'`（计数核验基准：表单文件数）
- ConfigProvider 主题：`grep -rnE 'ConfigProvider|theme=\{' "${PROJECT_DIR}" --include='*.tsx'`（计数核验基准：主题配置行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：React 18+ 须用 App.useApp，禁静态 message/notification/modal 调用
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: `message.success()` 等静态方法在 React 18+ concurrent 模式下无法消费 `ConfigProvider` 的 context（主题/locale/token 全失效）。须用 `App` 组件包裹根节点，子组件内 `const { message } = App.useApp()` 获取实例调用。
- **违反后果**: 静态调用不应用主题/locale、暗色模式下样式错乱、与 ConfigProvider 配置脱节。
- **验证方法**: 检出 `message.success(` 等静态调用（排除 useApp/App. 前缀）→ fail。
- **对应门禁**: fw_antd_app_useapp(fail)

```verify
id: antd-r1
cmd: 
expect: always
```

### 规律：须按需引入，禁全量 import antd
- **适用版本**: Ant Design 5.x/6.x
- **规律**: 全量 `import { ... } from 'antd'` 在未配 tree-shaking 时引入全量组件。生产须用 `unplugin-vue-components`/`unplugin-react-resolver` 按需引入，或确认 Vite/webpack tree-shaking 生效。6.x 默认 ESM tree-shaking 友好但仍推荐显式按需。
- **违反后果**: 首屏 JS 体积膨胀、加载慢。
- **验证方法**: 检出 `from 'antd'` 全量 import（无具名按需配置）→ warn。
- **对应门禁**: fw_antd_on_demand_import(warn)

```verify
id: antd-r2
cmd: 
expect: always
```

### 规律：Form 须用 useForm Hook，禁废弃 Form.create 高阶组件
- **适用版本**: Ant Design 4.x+（Form.create 已移除）
- **规律**: `Form.create` 高阶组件在 4.x 起移除，须改 `useForm()` Hook 获取 form 实例，`form.setFieldsValue()`/`form.validateFields()`。`wrappedComponentRef` 同步废弃。
- **违反后果**: Form.create 已移除，运行期报错；旧 API 无法用 Form.Item name 联动。
- **验证方法**: 检出 `Form.create(` → warn。
- **对应门禁**: fw_antd_form_useform(warn)

```verify
id: antd-r3
cmd: 
expect: always
```

### 规律：Table 大数据须虚拟滚动
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: `<Table>` 默认全量渲染 DOM，>1k 行卡顿。须配 `scroll={{ y }}` 限定高度 + 虚拟滚动（6.x 支持 `virtual` 属性，待验证具体版本），或用 `react-window`/`vxe-table` 替代。
- **违反后果**: 大数据表格渲染卡顿、内存占用高。
- **验证方法**: 检出 `<Table` 绑定大数据源但无 virtual/scroll → warn。
- **对应门禁**: fw_antd_table_virtual(warn)

```verify
id: antd-r4
cmd: 
expect: always
```

### 规律：主题须用 ConfigProvider theme token，禁直接覆写 .ant-* 类 CSS
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: antd 5.x 起用 CSS-in-JS + `ConfigProvider` 的 `theme.token` 定制主题（`colorPrimary` 等）。直接写 `.ant-btn { ... }` 覆写组件类名会在升级时失效（类名 hash 变化），且无法响应动态主题切换。
- **违反后果**: 升级后样式失效、无法动态切换主题、暗色模式错乱。
- **验证方法**: `.css/.less` 检出 `.ant-*` 类覆写 → warn。
- **对应门禁**: fw_antd_configprovider_theme(warn)

```verify
id: antd-r5
cmd: 
expect: always
```

### 规律：Form.Item 须配 name 与 data 字段对应
- **适用版本**: Ant Design 4.x+/6.x
- **规律**: `Form.Item` 的 `name` 须与 `Form` 的 `initialValues`/`name path` 对应，否则 `validateFields()`/`setFieldsValue()` 无法定位字段，校验与取值失效。
- **违反后果**: 校验不触发、取值 undefined、字段联动失效。
- **验证方法**: 检出 `<Form.Item` 但无 `name=` → warn。
- **对应门禁**: fw_antd_form_item_name(warn)

```verify
id: antd-r6
cmd: 
expect: always
```

### 规律：Modal 须配 destroyOnClose
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: `Modal` 默认关闭后保留子组件实例，表单/状态残留。须配 `destroyOnClose` 销毁子组件，下次打开重新初始化。（6.x 起 `destroyOnClose` 改名 `destroyOnHidden`，待验证具体版本，两者均检出）
- **违反后果**: 关闭重开 Modal 后表单数据/校验状态残留。
- **验证方法**: 检出 `<Modal` 但无 `destroyOnClose` → warn。
- **对应门禁**: fw_antd_modal_destroyonclose(warn)

```verify
id: antd-r7
cmd: 
expect: always
```

### 规律：Select showSearch 大数据须远程搜索
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: `Select` 配 `showSearch` 后默认本地过滤，全量渲染选项。选项 >1k 时卡顿。须配 `onSearch` + `filterOption={false}` 远程搜索，按需加载选项。
- **违反后果**: 大数据选项渲染卡顿、内存占用高。
- **验证方法**: 检出 `showSearch` 但无 `onSearch`/`filterOption={false}` → warn。
- **对应门禁**: fw_antd_select_remote(warn)

```verify
id: antd-r8
cmd: 
expect: always
```

### 规律：Upload 须配文件大小限制
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: `Upload` 默认无大小限制，用户可上传任意大文件致存储耗尽/DoS。须配 `beforeUpload` 钩子校验 `file.size`，超限返回 false 或 `Upload.LIST_IGNORE`。
- **违反后果**: 超大文件上传致存储耗尽、服务 DoS CWE-400。
- **验证方法**: 检出 `<Upload` 但无 `beforeUpload`/`maxCount` → fail。
- **对应门禁**: fw_antd_upload_size_limit(fail)

```verify
id: antd-r9
cmd: 
expect: always
```

### 规律：长文本须用 Typography.Ellipsis，禁手写 .slice 截断
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: 长文本截断须用 `Typography.Paragraph` / `Typography.Text` 的 `ellipsis` 属性，自适应宽度 + tooltip 展示全文。手写 `.slice(0, n) + '...'` 无法自适应、无 tooltip、响应式失效。
- **违反后果**: 截断长度写死、无 tooltip、响应式错位。
- **验证方法**: 检出 `.slice(0, n)` 截断显示 → warn。
- **对应门禁**: fw_antd_typography_ellipsis(warn)

```verify
id: antd-r10
cmd: 
expect: always
```

### 规律：Row/Col 须配响应式断点
- **适用版本**: Ant Design 5.x+/6.x
- **规律**: `Col` 仅用静态 `span` 无响应式断点时，移动端错位。须配 `xs/sm/md/lg/xl/xxl` 断点，按屏幕宽度自适应列数。
- **违反后果**: 移动端布局错位、响应式失效。
- **验证方法**: 检出 `<Col` 仅用 `span=` 无断点 → warn。
- **对应门禁**: fw_antd_grid_responsive(warn)

```verify
id: antd-r11
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
| fw_antd_app_useapp | fail | message/notification/modal 静态调用 → fail context 失效 | ANTD_SRC_GLOBS | — |
| fw_antd_on_demand_import | warn | 全量 import antd → warn 包体过大 | ANTD_SRC_GLOBS | — |
| fw_antd_form_useform | warn | Form.create 废弃 API → warn | ANTD_SRC_GLOBS | — |
| fw_antd_table_virtual | warn | Table 大数据源未配虚拟滚动 → warn | ANTD_SRC_GLOBS | — |
| fw_antd_configprovider_theme | warn | 直接覆写 .ant-* 类 CSS → warn | ANTD_SRC_GLOBS | — |
| fw_antd_form_item_name | warn | Form.Item 无 name → warn | ANTD_SRC_GLOBS | — |
| fw_antd_modal_destroyonclose | warn | Modal 无 destroyOnClose → warn | ANTD_SRC_GLOBS | — |
| fw_antd_select_remote | warn | Select showSearch 无 onSearch → warn | ANTD_SRC_GLOBS | — |
| fw_antd_upload_size_limit | fail | Upload 无 beforeUpload 大小校验 → fail DoS | ANTD_SRC_GLOBS | CWE-770（资源分配无限制，门禁文案 DoS）；GB/T 38674-2020 §8.1（输入/资源限制类安全设计） |
| fw_antd_typography_ellipsis | warn | 手写 .slice 截断 → warn | ANTD_SRC_GLOBS | — |
| fw_antd_grid_responsive | warn | Col 仅 span 无断点 → warn | ANTD_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_antd_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/antd.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_antd_<rule>(fail/warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: antd  requires_conf: ANTD_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 message.success 静态调用 + Form.create + Upload 无 beforeUpload → app_useapp + upload_size_limit fail 主触发（2/2）；compliant 全 pass。expected-fail-ids 已登记 2/2 fail id（2026-07-20 P1）。CWE/GB 映射列（同批补录）：仅对具直接安全语义的行引证，其余标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| antd × react | 须 React 18+ 才能用 App.useApp | React 17 及以下无 useSyncExternalStore，App.useApp 不可用 |
| antd × vite | 按需引入须配 unplugin-react-resolver | 否则全量引入或组件未注册 |
| antd × tailwind | 须用 prefix 或 layer 隔离样式 | tailwind preflight 会重置 antd 默认样式（如 button 背景） |
| antd × nextjs | 须用 antd-registry / App 路由 SSR 抽取样式 | antd CSS-in-JS SSR 须单独处理，否则样式闪烁 |

<!--
无强交互的框架组合省略；本表聚焦 antd 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| antd 4.x | 移除 Form.create，改 useForm | 旧高阶组件表单全量迁移 |
| antd 5.0 | 引入 CSS-in-JS + ConfigProvider theme token，废弃 less 变量 | 旧 less 变量定制失效，须改 theme.token |
| antd 5.0 | 移除 babel-plugin-import（推荐 unplugin） | 旧按需引入配置失效 |
| antd 6.0 | Modal destroyOnClose 改名 destroyOnHidden（待验证） | 待验证：属性名变化须人工核实 |
| antd 6.0 | Table virtual 属性稳定（待验证具体版本） | 待验证：6.x 虚拟滚动 API 须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
