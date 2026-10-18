# 产品化走查批：报错清零与开发痕迹清理（spec）

日期：2026-10-19
分支：`fix/product-ux-errors`
来源：用户走查全流程推演专区（`/app/sim`）后的三条反馈——页面拼接感强、正常产品不该出现「第 X 轮次」演示信息、当前存在大量报错。

## 变更

**报错清零**

- 后端以 `npm run serve` 启动（注入 `OBS_SIM_ROOT` / `GOVERNANCE_REPO` / 分支仓），修掉仿真中心整族 503；这是运行时配置问题，不改代码。
- `FlowNavPanel`：`ia2.flow.newChat` 缺词条改传默认文案；`ApprovalPanel` / `CockpitOverview`：历史决策枚举 `approved_once` / `approved_scoped` 先判词条存在再翻译，未上词表给产品短名。
- `BpaPcfPanel`：`data-testid` 误写为动态绑定（`:data-testid="bpa-roadmap-count"`）导致 Vue 渲染期读未定义属性，改回静态属性。
- `BpaLinkPanel` / `BpaMaturityPanel`：ECharts 在隐藏页签容器宽高为 0 时初始化会告警并画错尺寸，改为容器可见后再初始化（`ResizeObserver` 重试）。

**开发痕迹清理**

- 新增 `run-display.ts`：运行目录名只在 title / 请求参数里出现，界面显示「2026 年 10 月 17 日运行」「10/17 运行」。
- 顶栏运行 chip、左栏尾注、运行选择器、阶段页、追溯表、后台工作条统一走该展示名。
- 术语：七幕→七阶段、代偿→自动代处理、净计→人工完成、补偿类型代码（dispatch-preset/nudge/…）映射人话、轮次内不跟踪→未纳入跟踪。
- 运行监控/证据库里的「端点未接（挂账项）」改为产品化空态；任务卡绝对路径改工作区末两层，完整路径进 title。

**空壳页签补全**

- 新增 `GET /api/hermes/sim/frames`（递归枚举 `evidence/screenshots` 图片）与 `GET /api/hermes/sim/frame`（按相对路径取图，`resolve+startsWith` 双闸防穿越）。
- 证据库：帧图廊按步骤筛选、before/after 标注、点击看大图；台账进页自动读取。
- 运行监控：进页自动探测四服务/调度器/空闲工作者，并给「运行已结束/进行中」一句话状态。

## 决策记录

1. **运行目录名保留但降级为 title**：目录名是端点参数与证据反查锚，删除会断排查链；界面上只显示日期，目录名放在悬浮提示里。
2. **术语改显示层不改数据层**：run-state、台账、issues.log 的键与类型不动，只在前端映射成人话，避免破坏与 harness 的契约。
3. **帧图廊补端点而不是继续留空态**：截图目录实物存在（run21 有 50 张），只差只读枚举与取图两个端点；这是「页签可用」的最小闭环。
4. **服务端不配探测命令时给人话**：`SIM_DISPATCHER_HEALTH_CLI` / `SIM_SLEEPING_WORKERS_CLI` 缺席是部署选择，不是故障；界面提示「未接入」而不是红字报错。
5. **i18n 用守卫而非强改上游词表**：缺词条是 overlay 自定义枚举与词表不同步，改自定义组件即可，避免为两个键动 473 补丁与全量 inject。
6. **隐藏页签图表的解法是延后初始化**：不引入全局 chart 管理器，两个 BPA 面板各自 `ResizeObserver`，范围最小、无跨组件耦合。

## 验证

- `npx vitest run`：722 文件通过 / 5 跳过；5242 用例通过 / 8 跳过 / 0 失败。
- `npx vite build --config vite.config.overlay.ts`：构建通过。
- 新增 `run-display.test.ts`（3 例）与 `frames.test.ts`（2 例）守门。
