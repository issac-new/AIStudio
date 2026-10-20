# 驾驶舱全面整治：matrix 链接修复 + 推演/日常拆分 + 噪声清理 + 布局修复

> 状态：实施中（2026-10-20 起）。分支 `feat/cockpit-split-hygiene`。本文是本轮变更正本；三路只读走查（导航/内容/侵入/布局）的发现清单浓缩于第二节，逐处 file:line 见调查底稿。

## 一、用户诉求（2026-10-20 原文要点）

1. 全面走查驾驶舱各层级模块与链接功能：导航不连贯、历史冗余（过期推演信息）、内容不准确不完善、机读噪声与假功能，不具备给人类员工使用的前提。
2. matrix 报错链接不对。
3. 拆分全流程推演与日常功能：可共享技术组件，不得彼此侵入。推演=典型场景串联全部功能（从接收需求起，导演模拟全体人类员工协作走完全流程）；日常=会话串起的 kanban 任务、工作区、IDE 工作台，按阶段分类管理；两者互相检验工作是否有效。
4. 解决页面布局与按钮的遮罩、溢出。

## 二、走查发现摘要

**导航与冗余**：阶段页签实为 33 个（①6/②4/③4/④5/⑤6/⑥8），文档仍写 29；teams/agents/accounts/cases 存在独立整页与阶段页签双入口双 URL；约 3000 行零引用死视图（旧 OrchestrateView/SpecList/SpecDetail、RunCenterView+RunDetailView 全家、RunCanvas、GovCluster/GovSessionHealth 等）；sim-tabs 残留已不渲染的死词条；「运行中心」「旅程首页」等过时称呼仍在按钮文案。

**机读噪声与假功能**：SimAnchorDrawer 把原始 JSON 直接倾倒给用户；strict/pass/important/P1-P6 等英文枚举与原始时间戳/键名直出；建号表单默认值写死 `127.0.0.1:8008`；监督签提示手打过期 run 号示例；语音/视频按钮点击仅弹「即将推出」；看板「？」按钮空对象；IDE 任务简报「看板卡↗」的 `boardHref` 未定义（死链）；收件箱 GatekeeperSection 批准/打回绑空函数；②启动准备「文档已入库」检查实为假检查（只判 state 可读）。

**matrix 链接 bug**：分享弹窗生成 `matrix.to` 外链——私有 homeserver 上无法解析；二维码把房间 ID 发给第三方 qrserver.com；房间摘要卡把 `matrix://` URI 裸挂 `<a target=_blank>`。产品内链规范=`#/app/s/room/<roomId>[?event=]`（useEventTileData.ts 已立法）。

**推演/日常互相侵入**：日常六阶段进度完全由推演 run-state 派生（无运行=全部未开始）；②⑤⑥阶段页头挂 RunSelector；⑤验收 trace/delivery/uat 三签整嵌推演面板且 uat/g5 可直接写推演台账；推演「运行编排」签读全部日常看板；工作台左栏常驻已退役的「循环」分组；收件箱渲染推演干预卡；useRunContext 全局记忆两侧互串。

**布局遮罩/溢出**：全产品无 z-index 分层账本（四个互斥全屏层同挤 z60、页头面板 999 反超弹窗 1000）；注意力条抽屉定位依赖已删的全局类且硬编码 left；看板抽屉评论输入条 fixed 定位随抽屉宽度错位；推演总览/工作台两旗舰页零响应式断点；TracePanel/DeliveryPanel 表格无横向滚动兜底；清算灯/Cockpit 徽标整句 nowrap 必溢出。

## 三、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | ⑤验收 trace/delivery/uat/g5 重做成日常数据源（用户裁定） | 看板任务/审批/registry 文档为源；旧推演面板撤回推演区 evidence 签；日常面板顶部留「推演参照」链接行=互验通道 |
| D2 | 假功能保留占位但统一真实反馈（用户裁定） | 不留无反应控件；语音/视频/看板「？」点击有统一轻提示；死链错链必修 |
| D3 | 死代码直接删（用户裁定） | git 历史即存档；孤儿路由留 redirect 兜底旧深链；teams/agents/accounts/cases 独立页 redirect 至阶段签 |
| D4 | matrix 链接一律产品内链；QR 本地生成无依赖则移除 | matrix.to 在私有 homeserver 不可解析；房间 ID 禁外发第三方 |
| D5 | `/app/sim*` 导航域独立（整轮域），不挂任何阶段归属 | stage-attribution/nav-centers/areaForPath 三表同步；进推演区不高亮阶段 |
| D6 | 日常进度源=看板任务按阶段聚合（useDailyStageProgress） | 左栏阶段点与旅程五步卡不再依赖推演 run-state；无 run 时日常功能完整可用 |
| D7 | 阶段页去 RunSelector；运行上下文 chip 仅推演区显示；useRunContext 分区 | 日常页不再要求先选推演运行 |
| D8 | 写推演台账（uat-verdict/release-gate）的动作收口回推演区 | 日常判定写看板卡/审批系统；跨区只读+链接 |
| D9 | 推演「运行编排」签改只读 graph specs+run steps | 看板链交互视图只留 /app/board |
| D10 | domain-split 结构测试守门 import 方向 | 禁 views/stage→views/sim 与 api/sim-*、禁 views/sim→workspace store，白名单仅 crossref 链接模块 |
| D11 | 新 z-layers.ts 分层账本（drawer/modal/header-panel/toast） | 替换冲突字面量，弹层叠序可预期 |
| D12 | 并行会话在途改动不主动收编提交 | 重叠文件随批提交时在 commit message 如实记录归属（2026-10-20 10:34-10:36 主树在途 UX 修改） |

## 四、批次

- **B1 matrix 链接修复**：ShareDialog 内链+别名解析+QR 处置；SummaryCard matrix:// 处理；历史加载错误条改「人话+可展开原始」。
- **B2 假功能统一占位与死链**：占位提示统一；boardHref 修复；假检查诚实化；黑话出 UI 清理；术语过期修复；data-testid 反引号修复。
- **B3 机读噪声人话化**：新 `ia2/format.ts`（枚举中文映射+时间戳格式化）；SimAnchorDrawer 结构化+折叠原始 JSON；按清单逐处应用；删 8 个死 TAB_INTROS 词条。
- **B4 推演/日常拆分**：D5-D10 全量落地；⑤验收新四面板（DailyTrace/DailyDelivery/DailyUat/DailyG5Panel）。
- **B5 死代码删除**：D3 清单全量；旅程五步卡目标改阶段签。
- **B6 布局修复**：z-layers 账本；AttentionStrip 定位；看板抽屉输入条 sticky；旗舰页断点；表格滚动兜底；nowrap 策略；ide-taskbar archived 上限；页签条溢出提示。
- **B7 验证收口**：定向+全量 client 测试；浏览器 8649 走查关键页；验证账回填；合 main；serve-main 同步热更。

## 五、明确不做（挂账）

- ⑥治理八签全面双语化（本轮只删死词条+修混排）。
- GovOverlay 管理台与治理签的信息聚合重复（登记，重构另立轮）。
- QR 本地生成不新增依赖：无现成依赖则移除 QR 功能。

## 六、验证账（收口时回填）

待实施后回填：定向用例清单与结果、浏览器走查清单与结果、并行会话改动收编记录。
