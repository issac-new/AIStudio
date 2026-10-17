# 驾驶舱层级动线与末端可用性批（spec）

日期：2026-10-17
分支：feat/cockpit-nav-flatten-endpage-usability
来源：用户实报四痛点——层次结构与组织关系不清晰、层级太深太乱、使用跳跃且往返动线不合理、末端功能页不直观看不懂如何使用。直接优化（用户明示免方案轮）。

## 变更内容

### 动线连贯（往返痛点）
1. **run 上下文跨签贯通**：新增 `ia2/composables/useRunContext.ts`（query.run 优先+localStorage `ia2.lastRun` 记忆+成功读取后 remember）；监督面板/交付健康/需求追溯/问题清单四面板接入，预填即自动加载（onMounted）。运行总览读取成功同步记忆。此前四签各自 `run=ref('')`，从总览带 query 跳过去输入框仍是空的。
2. **红灯给出路**：运行总览遗留项红灯→可点跳治理·遗留项清算（button 化，绿态不可点）；六闸行→治理·质量门与流程；分支交付 KPI 卡与交付物链标题→仿真·交付健康（带 run query，与①形成闭环）；旅程页卡点遗留项行→清算（button 化+testid）。
3. **工具卡落点对齐**：stage-meta.ts 三张卡从中心级改签级直达（文档评审→/app/gov/docs、度量检查→/app/gov/metrics、审计与变更→/app/gov/audit）。
4. **关闭钮回源**：审批收件箱/看板关闭改为有来路 history.back()、无来路回工作台（此前固定回工作台，从阶段 5 审批待办进入后落到④）。

### 层级清晰
5. **面包屑**：新增 `IaBreadcrumb.vue`（旅程＞中心/阶段＞页签；标签取 sim-tabs/gov-tabs/STAGE_META 单一事实源；当前段 aria-current；旅程页与未知名不渲染），挂仿真中心/治理中心头与阶段页顶。
6. **双首页互链**：顶栏品牌区 🧭 旅程回家钮；工作台左栏新增旅程入口（IaJourneyEntry，与概览入口并列）；旅程页加「驾驶舱概览 →」链接。

### 末端可用性
7. **导语首访展开**：TabIntroBanner 首访自动展开一次（localStorage `ia2.tabIntroSeen:<tab>` 记忆），此后维持 D19 收起——兼顾「不占篇幅」与「第一次能看懂」。
8. **词条治理**：删除 zh/en 两侧 gov-audit/gov-docs 重复定义的旧版本（对象字面量后者静默覆盖的活炸弹）；删除死键 trace/accounts(旧)/observatory；新增 10 末端页词条（inbox/orchestration/sim-settings/gov-settings/model-providers/teams/agents/accounts/cases/collab，zh+en）；gov-registry/gov-harness 既有词条经挂载复活（嵌入视图获得导语）。
9. **导语挂载**：11 处末端页+2 处嵌入视图挂 TabIntroBanner（收件箱/场景编排/仿真设置/系统设置/模型服务商/团队/智能体/账户管理/交付案例/工作台中栏）。
10. **空态行动化**：GateRepairsPanel 首采 UiEmptyState 组件（孤儿组件首次生产采用：标题+提示+动作三层的原设计意图落地）；监督/交付空态加「不知道目录名？去运行总览选取 →」去处。
11. **豁免行内表单**：质量门修复单豁免理由从 window.prompt 原生弹窗改行内 input+确认/取消（必填禁用态+回车提交）。

### Spotlight 与术语
12. **命令修正扩容**：runs 直达 ia2.sim（原走退役重定向多一跳）；gov 直达 ia2.governance（原指看板协作签，语义过期）；新增旅程/监督面板/交付健康/文档评审四命令。
13. **旧术语清理**：仿真设置返回钮与动线条 aria 的「推演中心」残留→「仿真中心」（D18 残留）。

## 决策记录

1. **不动六阶段 IA 骨架**：D13 六阶段一级导航与旅程页是 2026-10-16/17 用户裁定项，本轮治的是其内的深度/跳转/末端可用性，不重开 IA 之争。
2. **run 贯通选 composable 而非各面板复制**：四处同痛点一处实现，localStorage 键 `ia2.lastRun` 单一；自动加载只做只读 GET，无副作用风险。
3. **面包屑标签不另起字典**：直接消费 sim-tabs/gov-tabs/STAGE_META 三个既有单一事实源，页级标签（看板/收件箱等 12 个）在组件内小字典（与 i18n-tab-intros 同先例模式）。
4. **首访展开而非常开**：D19「导语占篇幅」裁定不推翻——只补首访一次性展开，记忆键按页签粒度。
5. **GovModelProviders 孤立页不另加返回钮**：面包屑已覆盖其位置感（旅程＞治理中心＞模型服务商），两机制不叠加。
6. **旅程 A 区步骤落点顶栏高亮错位不在本轮修**：落点页确属各中心（技术正确），错位感由面包屑缓解；改路径→阶段映射属 IA 语义变更，超出本轮。
7. **run21 运行中不做 dist 供给**：本轮改动只合 main 推 origin；SIM 快照与 8802 studio 不动（推演进行中），下轮供给自然带上。
8. **顺路根治存量 648 测试炸面**：全量门禁实测发现 4 个测试文件（ide×3+ia-shell-header-sit）在 main 基线即模块装载失败——回归轮 D5 的补丁 648 在 upstream router 模块顶层裸调 `router.onError`，测试态 mock 最小路由器无此方法。修法=patch 正本加能力探测守卫（生产行为不变）+逆放旧 hunk/重放新 hunk 注入；该轮回归只跑了子集（699/19 绿）故未察觉，全量 4808 才暴露——再次实证「子集绿≠全量绿」。
9. **测试更新一处**：GateRepairs 豁免测试从 window.prompt 流程改行内表单流程（点击→空理由禁用断言→填理由→确认），与新交互对齐并加深必填语义断言。

## 验证

- `npx vitest run` 全量 4808/4808 绿（657 文件，含修复的 4 个存量装载失败文件）+ `npm run build`（vite+verify-dist 零默认口令）。
- 视觉/交互验证走 8649 热更新链路（工作区规则：默认不装机）。
- raw-hex 预算闸随全量测试跑（新增样式全 token 化，无裸 hex）。
