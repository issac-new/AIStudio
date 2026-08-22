# Matrix 协作防死循环与终止规则（防刷屏 / 防循环聊天 / 防算力浪费）

> 适用范围：所有通过 Matrix 参与跨机 agent 协作的 profile
> 强制级别：🔴 承担 Matrix 收发职责的 profile 的 SOUL.md 必须引用本文件（2026-08-21 scope 精准化：当前仅 orchestrator 收发 Matrix，其余 profile 无此职责无需引用；未来新增 Matrix profile 须同步挂载）
> 设计目标：防 bot↔bot 循环聊天、防消息刷屏、防无意义算力消耗
> 阈值基线（2026-08-20 与图爸确认的保守档）：N=8 条无新信息 / 单任务消息上限 30 条 / 超时 30 分钟

---

## 〇、核心认知纠偏（2026-08-20，重要）

**对端 Matrix 账号可能是人，也可能是 bot——MXID 无法区分。** 因此**按发送者身份设防（黑名单）必然误伤或漏防**：
- 把人类 MXID 加黑名单 → bot 收不到人类指令，通讯中断；
- 只按 MXID 屏蔽已知 bot → 新 bot / 人类刷屏漏防。

**正确方向：按消息特征和对话结构设防。** 死循环的本质是「**对话无新增信息**」——这与发送者是人还是 bot 无关。本文件的七层防线（含 2026-08-20 增补的噪声过滤层）全部围绕「识别并阻断无信息增量的对话」设计，而非围绕「识别 bot」。

---

## 一、问题形态

本机只有 **@swarm** 一个 Matrix bot 负责整体对外通讯（@8650 unified gateway）。Matrix 是**跨机器通讯总线**——对端可能是其他机器的 agent bot，也可能是人类。风险：

1. **bot↔bot 死循环**：本机 bot 回一句 → 对端 bot 触发回一句 → 本机再触发……无限互回复，烧 token。
2. **人类刷屏/复读**：人类复制粘贴、无意义追问、情绪化连发，同样造成无增量消息流。
3. **消息刷屏**：单个任务在房间里刷几十条无增量信息，淹没有效信号。
4. **超时悬挂**：对端无响应但本机持续重发/等待，占住算力不放。

## 二、七层防线（含 2026-08-20 增补的噪声过滤层）（从预防到检测到熔断）

| 层 | 机制 | 位置 | 原理 | 防什么 |
|----|------|------|------|--------|
| **1** | 协议标记：bot 回复发 `m.notice`，且不回 notice | 源码层 | Matrix 生态约定：bot 消息用 m.notice，bot 间互不响应 | 根治遵守规范的 bot↔bot 互回 |
| **2** | 自标记：bot 消息带 `auto_generated` 字段，收到此类不回 | 源码层 | 显式声明"机器生成"，无关发送者身份 | 对端不规范 bot（发 m.text 的） |
| **3** | 内容指纹：连续 N 条消息相似度 > 阈值 → 判死循环 | 行为层 | 死循环本质是无新增信息，与发送者无关 | 人和 bot 都可能触发的复读循环 |
| **4** | 收敛义务：每条回复必须推进状态，否则不发 | 行为层 | 有信息增量才说话，无增量即沉默 | "好的/收到/是的"式空转 |
| **5** | 人类裁决环：疑似循环 → 暂停并 @ 人类，等裁决 | 行为层 | bot 无权决定继续，解锁权交给人 | 不确定是否真循环时的安全阀 |
| **6** | 熔断：硬阈值 N=8/上限30/超时30min → `kanban_block` | 行为层 | 最后防线 | 前 5 层全失守时兜底 |
| **7** | 噪声过滤：拦截基础设施环境噪声（不进 agent turn） | 源码层 | 混在 m.room.message 里的伪消息不烧 token | 心跳/加密失败/空消息/单字符误发/同步重放 |

### 第 7 层：基础设施环境噪声过滤（源码层，2026-08-20 增补；方式 A 共享 util 重构）

**背景**：adapter 在事件订阅层只注册消息类 handler——typing/已读回执/presence/成员变动这些经典噪声天然不烧 token。真正漏进来的是混在消息流里的**伪消息**。

**架构（方式 A 共享 util，2026-08-20）**：通用逻辑抽到共享模块 **`gateway/noise_filter.py`**（单一事实源），matrix / weixin adapter 各自 import 并按平台特性传参。**同一份代码，两个平台，token 节省覆盖 matrix + weixin**。

**平台差异（按平台特性传参，非一刀切）**：

| 噪声类型 | matrix | weixin | 说明 |
|---------|:------:|:------:|------|
| 空消息 / 纯标点 | ✅ | ✅ | 通用高置信度 |
| 单字符误发（c/嗯/.） | ✅ | ✅ | 通用高置信度 |
| 心跳 / 健康检查 | ✅ | ✅ | 通用高置信度 |
| 加密失败占位符 | ✅ | — | matrix E2EE 特有 |
| 同步重放回声 | ✅ | — | matrix 同步机制特有 |
| 语音转文字失败占位 | — | ✅ | weixin STT 特有 |
| 撤回回声 | — | ✅ | weixin 特有 |
| 纯表情 / 链接卡片无文字 | 记日志 | 记日志 | **语义级，默认不拦**（见下） |

**微信保守策略（图爸 2026-08-20 决策）**：微信是日常通讯（含妈妈/家人），只拦**高置信度**噪声；语义级（纯表情/链接卡片）可能是真实人类意图，**默认只记日志不拦截**——要拦需显式设 `WEIXIN_NOISE_FILTER_SEMANTIC_EMOJI=true` 等。matrix 相对宽松（「宁可错杀」）。

**机制**：在进 agent turn 之前调用 `noise_reason()` 判定，命中即拦截并打 debug 日志（含原因）。可观测 + 可回退。

**开关命名**：`{PLATFORM}_NOISE_FILTER` 总开关 + `{PLATFORM}_NOISE_FILTER_{CLASS}` 子类开关（默认 true 开启；语义级 SEMANTIC_* 默认 false）。matrix 开关在 orchestrator/.env；weixin 开关在 orchestrator/.env + [已移除]-orchestrator/.env（两个 gateway 进程）。

**已验证**（2026-08-20 单元测试）：matrix 路径 10 例、weixin 路径 9 例、语义级 2 例全部通过；平台差异精确生效（matrix 拦加密占位/同步重放、weixin 拦 STT 失败/撤回回声）。漂移→自动重打场景端到端验证通过。

### 第 1 层：协议标记（源码层，根治规范 bot 互回）

**机制**：bot 的**回复**消息发 `m.notice`（而非 `m.text`），且收到 `m.notice` 一律不回复。

**原理**：Matrix 生态约定 `m.notice` 专为 bot 设计。遵守规范的 bot 收到 notice 不会响应——死循环从协议层被掐断。

**adapter 现状**（2026-08-20 查证）：
- **收**：`adapter.py` L3333 已忽略 `m.notice`（`MATRIX_PROCESS_NOTICES` 默认 false）——收端已合规。
- **发**：L2340 bot 回复发的是 `m.text`——发端**未合规**，需改为 `m.notice`。

**改动**：把 bot 回复的 msgtype 从 `m.text` 改为 `m.notice`。代价：m.notice 在部分客户端显示样式不同（通常无通知音、显示为系统样式），但对跨机协作房间可接受。

### 第 2 层：自标记（源码层，对付不规范对端）

**机制**：bot 发出的每条消息在 content 里加自定义字段 `"auto_generated": true`（及可选 `"x-swarm-bot": "orchestrator"`）；收到带此字段的消息一律不回复。

**原理**：对端 bot 可能不遵守 m.notice 约定（发 m.text）。显式自标记让「机器生成」成为消息自身的属性，与 msgtype、发送者身份解耦。双方都做自标记时，bot 间不会互回。

**改动**：bot 回复的 content 加 `auto_generated: true` 字段；收端检测到该字段则跳过（不触发 agent turn）。

### 第 3 层：内容指纹去重（行为层，抓无新增信息）

**机制**：对房间内最近消息流做语义去重——连续 **3 条**消息满足以下任一，判为疑似死循环：
- 内容文本高度相似（复读/同义改写/纯确认回声）；
- 结构同构且无新实体（相同的 JSON 骨架、相同的状态报告，无新数据）；
- 纯 ack 链（"好的"→"收到"→"OK"→"好的"……）。

**原理**：死循环的本质是**无新增信息**，与发送者是人还是 bot 无关。人类复制粘贴刷屏同样触发——这正是黑名单抓不住而内容指纹能抓住的。

**动作**：命中 → 触发第 5 层（人类裁决环），不直接判死（可能是人类的合法重复确认）。

### 第 4 层：收敛义务（行为层，正向约束）

**机制**：bot 在发**每一条** Matrix 消息前自检——这条回复是否推进了对话状态？推进 = 提供新信息 / 提出新问题 / 给出新决策 / 交付新产物。**无增量 → 不发。**

**原理**：与其被动检测循环，不如主动要求每条消息有信息量。这把"防循环"从检测变成纪律。

**自检清单**（发送前过一遍）：
1. 这条消息是否包含对方尚不知道的信息？
2. 是否把对话向任务目标推进了一步？
3. 如果我不发这条，对话会损失什么？（答案为"无"→ 不发）

**典型空转模式**（一律不发）：纯确认（"好的"/"收到"）、复述对方观点、无结论的礼貌性回应、重复已说过的状态。

### 第 5 层：人类裁决环（行为层，打破对称性）

**机制**：当第 3 层检测到疑似循环，bot **暂停回复**并向房间内的人类发一条裁决请求，等人类明确指令再继续。

**原理**：bot↔bot 死循环无解是因为**两边对等、都觉得自己该回**。引入人类裁决——用不对称权限打破对称僵局。bot 无权决定"是否继续"，只有人有。

**裁决请求格式**：
```
⚠️ 检测到疑似对话循环（最近 3 条消息无新增信息）。
@[人类账号] 请裁决：
- 回复「继续」→ 我恢复响应
- 回复「停止」→ 本任务在 Matrix 收敛，转看板留痕
- 直接给新指令 → 我按新指令执行
```

**纪律**：发出裁决请求后，**在收到人类响应前不再发任何业务消息**（避免加剧刷屏）。

### 第 6 层：熔断（行为层，最后防线）

即使前五层全失守，运行时按以下硬阈值**强制终止**：

| 触发条件（任一命中） | 动作 |
|---------------------|------|
| 同一房间内**连续 8 条**消息无新增有效信息 | 停止回复，该房间进入 10 分钟静默期 |
| 单个 kanban 任务在 Matrix 的**累计消息达 30 条** | 停止在 Matrix 交互，回合收敛，结论 `kanban_comment` 留痕 |
| 对端 **30 分钟无实质响应** 且本任务在等对方输入 | `kanban_block(kind="transient", reason="Matrix 对端超时无响应")` |
| 人类裁决环发出后 **15 分钟无人类响应** | `kanban_block(kind="needs_input", reason="循环裁决无人响应")` |

熔断后：
- 把「为什么熔断、当前进展、需要什么人工输入」写进 `kanban_block` reason；
- **不要**继续向房间发消息解释（那只会加剧刷屏）；
- 等图爸或对端管理员解除，由 dispatcher 重新拉起。

## 三、辅助机制：入口黑名单（保留，仅针对已确认的纯 bot）

`MATRIX_IGNORE_USER_PATTERNS` 黑名单**保留但仅用于已 100% 确认为纯 bot 的对端 MXID**（如对端明确部署的自动化 agent，无人类使用）。**人类账号一律不加**。

> ⚠️ 黑名单是**辅助**而非主防——它无法区分人和 bot，主防永远靠七层防线（含 2026-08-20 增补的噪声过滤层）（特征+结构）。对端账号性质台账见 `_shared/decisions/matrix-peers.md`。**当前黑名单为空**（已知 @cuishi/@testuser2 均为人类账号）。

## 四、落地位置总览

| 层 | 落地位置 | 是否需改源码 |
|----|---------|-------------|
| 1 协议标记 | adapter.py `_build_text_message_content`（bot 回复可改 m.notice） | ✅ 需改，持久化见 §五 |
| 2 自标记 | adapter.py 发端 content 加 auto_generated + 收端检测 | ✅ 需改，持久化见 §五 |
| 3 内容指纹 | SOUL 行为约束（发送前比对最近消息） | ❌ 行为层 |
| 4 收敛义务 | SOUL 行为约束（发送前自检清单） | ❌ 行为层 |
| 5 人类裁决 | SOUL 行为约束（疑似循环→@人类） | ❌ 行为层 |
| 6 熔断 | SOUL 行为约束（硬阈值→kanban_block） | ❌ 行为层 |
| 7 噪声过滤 | adapter.py `_matrix_noise_reason` + `_handle_text_message` 调用 | ✅ 需改，持久化见 §五 |

## 五、源码改动的持久化（防 hermes update 冲掉）

第 1/2 层改了 `plugins/platforms/matrix/adapter.py`，会被 `hermes update` 覆盖。持久化方案：
1. 改动用**明确标记区块**包裹：`# >>> swarm:anti-loop >>>` ... `# <<< swarm:anti-loop <<<`，便于 update 后重新定位；
2. 改动 diff 备份到 `_shared/decisions/matrix-adapter-antiloop.patch`；
3. 把「检查 anti-loop 标记是否存在」加进 `inventory-drift-watchdog`（周一 9 点 cron），update 冲掉后自动告警并提示重打 patch。

## 六、与其他规则的关系

- 与 `exit-protocol.md` 一致：熔断的归宿是 `kanban_block`，不是文本面板。
- 与 `shared-rules-reference.md` 的 Gateway 留痕联动：Matrix 协作任务按复杂度照常留痕，熔断不影响留痕义务。
- 本规则只管 **Matrix 跨机协作**；本机 board 内的 kanban 交互不受此限。

## 七、验证清单（配置后机械验证）

```bash
# 1. adapter 收端忽略 m.notice（原有）
grep -n "m.notice" ~/.hermes/hermes-agent/plugins/platforms/matrix/adapter.py

# 2. anti-loop 标记区块存在（发端 auto_generated + 收端检测）
grep -c "swarm:anti-loop"  # 期望 4，2026-08-21 实机 2（两个 profile 的 watchdog 漂移未重打，属已知债务，weixin patch 待人工重建） ~/.hermes/hermes-agent/plugins/platforms/matrix/adapter.py   # 应为 4

# 3. noise-filter 标记区块存在（第 7 层）
grep -c "swarm:noise-filter" ~/.hermes/hermes-agent/plugins/platforms/matrix/adapter.py   # 应为 3

# 4. 噪声过滤函数与调用点存在
grep -n "_matrix_noise_reason" ~/.hermes/hermes-agent/plugins/platforms/matrix/adapter.py

# 5. 环境开关（orchestrator/.env）
grep "MATRIX_IGNORE_AUTO_GENERATED\|MATRIX_NOISE_FILTER\|MATRIX_BOT_REPLY_AS_NOTICE" ~/.hermes/profiles/orchestrator/.env

# 6. 黑名单（当前应为空——已知对端均人类）
grep MATRIX_IGNORE_USER_PATTERNS ~/.hermes/profiles/orchestrator/.env

# 7. 本文件被相关 SOUL.md 引用
grep -rl "matrix-collaboration-termination" ~/.hermes/profiles/*/SOUL.md

# 8. patch 备份存在且可应用
test -f ~/.hermes/profiles/_shared/decisions/matrix-adapter-antiloop.patch && echo "✓ patch 已备份"
cd ~/.hermes/hermes-agent && patch --dry-run -p1 -R < ~/.hermes/profiles/_shared/decisions/matrix-adapter-antiloop.patch && echo "✓ patch 可应用"

# 9. watchdog 漂移检测（应 exit 0）
bash ~/.hermes/profiles/_shared/decisions/matrix_antiloop_drift_check.sh
```
