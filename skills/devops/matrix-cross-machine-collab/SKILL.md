---
name: matrix-cross-machine-collab
description: "Use for Matrix cross-machine agent collab + loop prevention."
---

# Matrix 跨机协作与防死循环

设计 Matrix 作为**跨机器 agent 通讯总线**时的完整方法：防死循环、防刷屏、防算力浪费、自动建群编排、源码改动持久化。

> 适用场景：Hermes bot（如 @swarm unified gateway）通过 Matrix 与其他机器上的 agent bot / 人类协作。本机多 profile 协作走看板，不走 Matrix——不要为本机 profile 间协作建 Matrix 房间。

## 核心认知纠偏（最高优先级）

**对端 Matrix 账号可能是人，也可能是 bot——MXID 无法区分。**

这决定了防循环的根本思路：

- ❌ **按发送者身份设防（MXID 黑名单）必然误伤或漏防**。把人类加黑名单 → bot 收不到人类指令；只屏蔽已知 bot → 新 bot / 人类刷屏漏防。
- ✅ **按消息特征 + 对话结构设防**。死循环的本质是「**对话无新增信息**」，与发送者是人还是 bot 无关。人类复制粘贴刷屏同样要拦。

黑名单（`MATRIX_IGNORE_USER_PATTERNS`）**仅作为辅助**，只放 100% 确认的纯 bot MXID（明确部署、无人类使用）。主防永远靠下面的六层防线。

## 六层防线（从预防到熔断）

| 层 | 机制 | 位置 | 原理 |
|----|------|------|------|
| 1 | 协议标记：bot 回复发 `m.notice`，不回 notice | 源码层 | Matrix 生态约定 bot 用 m.notice 且互不响应，协议层掐断规范 bot 互回 |
| 2 | 自标记：bot 消息带 `auto_generated: true`，收到此类不回 | 源码层 | 显式声明"机器生成"，与 msgtype/发送者身份解耦，对付不规范对端 |
| 3 | 内容指纹：连续 3 条消息无新增信息 → 疑似循环 | 行为层 | 死循环本质=无信息增量，人和 bot 都拦得住 |
| 4 | 收敛义务：每条回复必须推进状态，否则不发 | 行为层 | 正向约束，把"防循环"从检测变成纪律 |
| 5 | 人类裁决环：疑似循环 → 暂停并 @ 人类等裁决 | 行为层 | 用不对称权限打破 bot↔bot 对称僵局 |
| 6 | 熔断：硬阈值（N=8 无增量/单任务 30 条/超时 30min）→ `kanban_block` | 行为层 | 最后防线兜底 |
| 7 | 噪声过滤：拦基础设施环境噪声（不进 agent turn） | 源码层 | 混在消息流里的伪消息不烧 token，覆盖 matrix + weixin |

### 第 7 层：环境噪声过滤（共享 util，2026-08-20 方式 A 重构）

**先查订阅层再设计过滤**——很多经典噪声根本没订阅事件 handler，天然不烧 token，别写空规则。matrix adapter 只注册 ROOM_MESSAGE/REACTION/INVITE，typing/已读回执/presence/成员变动在订阅层就挡了。真正漏的是混在消息流里的**伪消息**。

**架构**：通用逻辑抽到共享模块 `gateway/noise_filter.py`（单一事实源），各 adapter import 并按平台特性传参。**同一份代码覆盖多平台，token 节省跨 adapter 生效**。

**平台差异按特性传参，非一刀切**：

| 噪声类型 | matrix | weixin | 说明 |
|---------|:------:|:------:|------|
| 空消息/纯标点/单字符/心跳 | ✅ | ✅ | 通用高置信度 |
| 加密失败占位符 / 同步重放 | ✅ | — | matrix E2EE/同步机制特有 |
| 语音转文字失败 / 撤回回声 | — | ✅ | weixin STT/撤回特有 |
| 纯表情 / 链接卡片无文字 | 记日志 | 记日志 | **语义级，默认不拦** |

**关键设计**：
- **高置信度 vs 语义级分级**。高置信度（空/单字符/心跳/加密失败/STT失败/撤回）默认拦；语义级（纯表情/链接卡片/复读）默认只记日志不拦——日常通讯平台（家人在用）语义级可能是真实意图。要拦语义级需显式设 `{PLATFORM}_NOISE_FILTER_SEMANTIC_*=true`。
- **日常通讯平台保守**（微信含家人）：只拦高置信度，语义级只观察。跨机总线（matrix 主要对 bot）可宽松。
- **决策矛盾时保守优先**：用户同时说"全部加上"和"保守"时，按保守落地——高置信度拦、语义级只记日志，并在回复里点明这个张力。

共享模块 API：`noise_reason(body, platform, *, event_ts, startup_ts, enable_decrypt, enable_sync_replay, enable_stt_failure, enable_recall)` 判高置信度；`semantic_reason(body, platform)` 判语义级。开关 `{PLATFORM}_NOISE_FILTER` + `{PLATFORM}_NOISE_FILTER_{CLASS}`。

详见 `references/noise-filter-shared-util.md`（平台传参表、噪声类型全集、双 adapter 挂载点、单元测试）。

### 各层要点

- **第 1/2 层（源码）**：改 adapter 发端 builder（统一 content 构造点）+ 收端消息 handler。详见 `references/adapter-antiloop-patch.md`。
- **第 3 层（内容指纹）**：连续 3 条满足任一判疑似循环——文本高度相似 / 结构同构无新实体 / 纯 ack 链（"好的"→"收到"→"OK"）。命中**不直接判死**（可能是人类合法重复确认），转第 5 层。
- **第 4 层（收敛义务）发送前自检**：① 是否含对方未知的新信息？② 是否向任务目标推进一步？③ 如果不发会损失什么（"无"→不发）。**典型空转一律不发**：纯确认、复述对方观点、无结论礼貌回、重复状态。
- **第 5 层（人类裁决）**：疑似循环时发裁决请求（继续/停止/新指令三选项），**收到人类响应前不再发业务消息**。这是打破对称性的关键——bot 无权决定继续，只有人有。
- **第 6 层（熔断）**：归宿是 `kanban_block(kind="transient")`，**不要继续向房间发消息解释**（加剧刷屏）。等管理员解除由 dispatcher 拉起。

## 自动建群编排（orchestrator 职责）

跨机协作任务（本机 worker + 对端 agent 共同参与）的编排流程：

1. **任务拆解**：按七要素模板拆子卡，`parents=[...]` 表达依赖。跨机子任务 body 标注 `cross_machine: <对端bot MXID>`。
2. **建对外协作房间**：用 helper 脚本调 homeserver Client-Server API 建私密房（private_chat preset），拉对端 bot 进房。房间命名 = `<任务slug>-协作`，一次任务一间，留档不删。
3. **房间↔看板绑定**：room_id 写进主任务 `kanban_comment`。
4. **分发**：向房间发七要素任务书，@对端 bot。
5. **协作纪律**：受六层防线约束。
6. **回收**：对端交付后**验证产出**（证伪主义，不信任自述），`kanban_complete`。

**纪律**：先建看板子卡再发房间消息——看板是事实源，房间只是通讯面。建群失败（对端拒邀请/homeserver 不可达）→ `kanban_block(kind="transient")`，重试不超过 2 次。

## 源码改动持久化（防 hermes update 冲掉）

改 adapter.py 会被 `hermes update` 覆盖。三件套：

1. 改动用**明确标记区块**包裹：`# >>> swarm:anti-loop >>>` ... `# <<< swarm:anti-loop <<<`，便于 update 后重新定位。
2. 改前备份原文件 + 改后用 `git diff` 生成 patch（a/ b/ 前缀，可 `patch -p1` 应用）。
3. 漂移检测脚本进 watchdog cron：grep 标记是否存在，缺失则自动重打 patch，无法干净应用则告警人工。

**验证 patch 可应用**：`patch --dry-run -p1 -R < patchfile`（逆向 dry-run 确认格式有效）。

## 设计要点

- **默认不破坏现有行为**：新机制用环境开关控制，默认保守值。如发端 m.notice 用 `MATRIX_BOT_REPLY_AS_NOTICE`（默认 false 保持 m.text，避免改变客户端通知行为）；收端 auto_generated 检测默认 true。
- **自回环安全**：bot 自己发的 auto_generated 消息在 sync 回环时，必须先被 `_is_self_sender` 在入口拦下，不能触发 anti-loop 误跳过——改收端时确认检测点在 self-sender 过滤**之后**。
- **mention 例外**：带 auto_generated 但显式 mention 本 bot 的消息仍响应（对端 bot 可能在显式调用），不会把合法跨机调用当循环掐掉。
- **edit 事件不动**：edit 外层 msgtype 必须是 m.text（Matrix 协议要求），收端已跳过 m.replace relation，不构成循环面。

## 参考文件

- `references/adapter-antiloop-patch.md` — adapter.py 发端/收端 anti-loop 改动的精确落点、自回环安全性论证、patch 持久化命令
