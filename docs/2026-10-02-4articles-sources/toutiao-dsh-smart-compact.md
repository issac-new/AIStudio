# 源文附录④：DSH 信息零丢失压缩插件（头条文章要点摘录）

- 出处：https://www.toutiao.com/article/7691162002513674786/（2026-09-30，经 webReader 渲染抓取）
- 标题：《重磅DSH信息零丢失压缩插件：拒绝摘要幻觉，对话100%无损还原》
- 插件：dsh-smart-compact（npm 包，BSD-3-Clause，作者 hoyyang，仓 ~hoyyang/dsh-smart-compact）

## 核心机制（文中实测口径）

1. 零摘要换窗：旧对话整段原文归档（非摘要），开新干净窗口；0 次摘要模型调用，100% 无损，可随时召回原文。
2. 三带水位：安静带（<85%）/ 宽容带（85% ~ 85%+8192 tok）/ 强制带（≥85%+8192 tok）。
3. 五件套工具：get_context_remaining（总量/窗口/剩余）+ 25%/50%/75% 分层提醒 + ctx_notes（写/增/读/检索/列出工作笔记，跨压缩跨换窗存续）+ ctx_history（列出/读/检索已归档窗口）+ new_context（模型主动申请换窗）；手动入口 /smart-compact。
4. 机械交接锚点："Context window #N opened" + 任务 + 最近动作三行，纯机械派生（零模型调用）——反摘要幻觉的核心设计。
5. 笔记新鲜度门（v0.5.2）：笔记落后于事件即 STALE 警示。
6. 诚实降级（v0.3.2）：从未写过笔记时，锚点退化为 ctx_history 召回模式。
7. 强制脱敏（v0.5.0）：强制换窗时锚点行清洗手机号/邮箱/证件号/公司名。
8. 可观测性：engine-state.json 探针（reminderObserved 计数、lastRolloverTrigger、lastRolloverRefusedReason）。
9. 单槽压缩服务 + 让位序：必须排在 dsh-glm/dsh-kiro 之前；/compact 保持禁用。
10. 兼容性：dsh ≥ 0.1.5-rc（Session.snapshotEvents()），升级后 npm install 重建，含 token-meter 补丁。
11. 证据：Vitest 123 绿；双安装联调；真实模型 E2E；393 事件/约 30.7 万 token 全量归档。
