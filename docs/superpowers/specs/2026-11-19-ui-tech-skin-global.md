# 全站 UI 科技感皮肤（A 全局基座＋B 骨架＋C 组件面）

日期：2026-11-19　分支：feat/ui-tech-skin-global　类型：A 类（skin.scss/主题层）＋B 类（theme/variables 补丁 801）　用户裁决：全做（A+B+C 三批）

## 变更

以 A2UI 皮肤批（2026-11-18-ekko-ui-tech-skin，main 13f006fd4）已验证的五件能力为底料，把科技感从「聊天内 Surface 卡片」扩到全站。评估依据＝三视图页面探针实测（395/395/485 元素：玻璃拟态 0、动效 0、发光阴影 6/6/1；全局 accent 灰阶 #333/#e0e0）。

| 批 | 内容 | 落点 |
|---|---|---|
| A 全局皮肤基座 | ① 补丁 801：`theme.ts`＋`variables.scss` 的 accent/primary 灰阶 base 换青蓝皮肤色（复用 A2UI 立法值亮 #0891b2/暗 #22d3ee；用户 accentColor 定制仍优先——`resolveThemeCustomization` 上游通道不冲突）；② A 类 `custom/client/styles/skin.scss`：全局 `--ekko-skin-accent` 三件套统一正本＋通用控件发光叠加（按钮 hover 光晕/输入框聚焦外光/卡片描边光/链接交互色），entry.mts 注入（polish.scss D22 质感基座同款零补丁模式） | vendor 2 文件（B 类补丁 801）＋custom 1 新文件＋entry 1 行 |
| B 骨架层 | 侧边栏/顶栏/标签栏/看板外壳：玻璃底、active 发光指示、mono 状态徽章 | 优先 skin.scss 全局类覆盖（.n-layout-sider/.n-tabs 等）；naive-ui overrides 够不着的走补丁 801 扩展 |
| C 组件面 | naive-ui 通用组件（按钮/输入/卡片/表格/进度/标签/开关）经 themeOverrides 统一；cockpit/eval/ia2/loop 等核心域视图的定制类逐个过堂 | theme.ts overrides 键＋skin.scss＋各域 custom 文件 |

## 决策记录

- **D1（产品级皮肤＝改 base 而非运行时注入）**：上游已有 accentColor 用户定制通道（theme-customization.ts），产品默认皮肤落 theme.ts/variables.scss 的 base 字面量（补丁 801）——用户定制优先级天然高于 base，两条路不打架；放弃 entry 层 localStorage 预写（会被 syncThemeFromServer 冲掉）与 JS 钩子黑魔法。
- **D2（皮肤色复用 A2UI 立法值）**：亮 #0891b2（cyan-600）/暗 #22d3ee（cyan-400）与聊天内卡片同源，全站一个皮肤事实源；textOnAccent 由上游 readableTextColor 自动算，不再手工配。
- **D3（skin.scss 只做全局无损叠加）**：沿用 polish.scss D22 克制纪律——只加发光/玻璃/交互色叠加，不动布局/间距/字号；选择器只打通用组件类与皮肤变量，不打业务域类（域类过堂在批 C 逐域处理）。
- **D4（验收＝探针指标翻绿）**：三视图探针（玻璃/动效/发光/等宽计数）改造后显著翻绿＋亮暗双主题浏览器走查＋raw-hex 棘轮合规＋全量测试绿；对照基线=本 spec 评估数据。

## 验证

- [x] 补丁 801：series 登记＋clean+inject 全量重放 status=complete；重放后 theme.ts primary（#0891b2/#22d3ee）与 variables.scss accent/RGB 分量全落地
- [x] 浏览器实物走查（暗色 #/app）：探针对比＝rootAccent #e0e0e0→#22d3ee、皮肤色元素 0→20、骨架 rail 玻璃 blur(14px)+皮肤右缘 rgba(34,211,238,.28) 命中；亮色主题切换验证 rootAccent=#0891b2、bodyBg 250,250,250。视觉评估：交互色系全站落地（链接/指示/CTA/选中态青蓝），暗色 6.5/10——氛围层（侧栏渐变可见度/顶栏光线）受 DOM 定位疑点拖累（见挂账）
- [x] raw-hex-budget／wcag-contrast 守门绿（skin.scss 全变量引用零裸 hex；56/56 含 chat 面）
- [x] 全量 `npm test`（2026-11-19）：9205 例 9191 绿 / 3 failed 全定谳清偿——①②docs 索引 2 处=新增 spec 未重建索引，gen-doc-indexes --write（704 specs）随批转绿；③overlay-pristine-replay=worktree 8647 production serve 挡 clean 守卫（复现上批同款环境态），停服后 3/3 文件 31 用例复跑全绿

### 挂账（批 B 遗留，下批清偿）

1. `.studio-page-header` 在 #/app 视图 display:none——顶栏光线 CSS 已命中但元素不可见；需查骨架 DOM 双态（reload 瞬时 0×0 与渲染态并存）后重定向选择器。
2. `.studio-navigation-rail` 渐变底被原样式覆盖为 none（border/shadow/blur 命中、background 输）——需提权或改走变量注入。
3. 域内细调（评估两轮点名）：顶栏 tab 未选中灰字对比度、状态点三套语言不统一（裸点/徽标/胶囊）、主区卡片静态边框层次——归域内批，skin 层不打域类（D3 纪律）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md`：新增「全局视觉皮肤」小节（皮肤色事实源、与用户 accentColor 定制的关系、克制纪律）——随批修订。
