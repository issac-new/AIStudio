# SwarmStudio 与 Hermes Agent Teams 安全问题整改方案

- 方案日期：2026-10-16
- 版本：v2（预警先行版）
- 修订记录：v1 按严重程度组织 15 个整改项，全部指向修复。v2 应用用户 2026-10-16 的裁定，改为先预警、后阻断。阻断类改造全部挂起，短期只建观测与告警，多轮数据后再逐项提请决策。
- 依据：《SwarmStudio 产品与 Hermes Agent Teams 安全检查报告》（2026-10-16，6 域 20 项）
- 执行约束：upstream 目录只读，改动走 `overlay/patches/` 加 `npm run inject`；overlay 内改动走 feature 分支，测试绿后合 main

## 决策记录

本段记录本方案及 2026-10-16 第一批落地的关键决策，含被否方案与理由。

| 编号 | 决策 | 备选（被否） | 理由 |
|---|---|---|---|
| D1 | 第一批只做观测与告警面，不动任何执行开关 | 直接按严重程度修复（v1 方案） | 用户 2026-10-16 裁定：先不阻断现有用法，多轮数据后再决策。阻断类全部挂起并写死启用判据 |
| D2 | 阻断项启用判据先写死再挂起 | 先挂起、以后再看 | 没有数据阈值的挂起会无限期拖延；每项配「数据阈值加人工复核」双条件，4 周数据不达标不提请 |
| D3 | M6 审计账身份字段取上游 `AgentToolContext` 第三参数 | 改上游钩子签名或自造上下文 | 上游 `ToolExecuteHook` 本就有该参数且调用处始终透传，补形参即可，零 patch |
| D4 | M7 检测器不带 D 编号，用域名命名 | 延续 D11/D12/D13 编号 | 现有 `detectRunawayLoop` 已占用 D11，续编会撞号；与 disk.capacity、runtime.spawn-health 等后期件一致 |
| D5 | M7 时段告警用「时段∩高危」交集口径 | 报全部非工作时段活动 | agent 7×24 在跑，报全量时段活动只会狼来了；E2 检查项原文也只要求高危操作 |
| D6 | M8 出厂口令门禁做成 WARN 态 | 直接硬失败（v1 方案） | 用户先预警裁定；源头修复未完成前硬失败会阻断构建。转 FAIL 判据：源头修复完成且连续两周 WARN 零新增 |
| D7 | M9 告警中继用轮询加三层去重 | 订阅式 fanOut | 与巡检架构同构、可经 deps 注入测试；订阅面生产零消费方，新开生命周期反而添状态 |
| D8 | 水位线只按过了冷却的事件推进 | 按全部新事件推进 | 实测缺陷：被冷却抑制的事件会把水位垫高，后续同刻或更早的新事件被静默丢弃（冷却与水位线耦合） |
| D9 | 盘点脚本独立成脚本，不塞进巡检官 | 只做巡检官 collector | 周报要人读的报告并落盘，且不依赖 studio server 在跑；collector 与脚本同源同口径 |
| D10 | 双会话碰撞后改用 cherry-pick 落干净分支 | 直接 merge 原分支 | 原分支混进了另一会话未合入的提交（completion.zero-delivery），merge 会捎带；cherry-pick 只应用本批 diff |

## 一、整改原则

用户裁定原文：安全检查相关改造先不阻断用户非授权范围内的使用，在多轮后，进行实际分析再决策，短期内先进行预警即可。

由这条裁定推导出三条执行纪律：

1. **零阻断**。第一阶段不改任何会改变现有行为的开关。具体是不动 approvals 档位、不裁 toolsets、不上文件黑名单、不改监听默认值、不让构建失败。预警期内所有现有用法照原样跑通。
2. **只观测**。短期交付物是观测面与告警面：审计账补字段、巡检官加检测器、告警接消费方、盘点脚本出数据。
3. **判据先行**。每个阻断项在挂起前先写死「启用判据」，即需要看到什么数据才提请决策。没有判据的阻断项不提请，避免凭印象开闸。

## 二、阶段总表

| 阶段 | 内容 | 周期 | 对现有用法的阻断 |
|---|---|---|---|
| 一 预警建设 | M6 审计账补全、M7 三个检测器、M9 告警消费、M4 催办房间、M8 出厂口令预警态、盘点脚本 | 本周 | 零 |
| 二 观察积累 | 预警执行，按周出数据分析，积累多轮 | 2 至 4 周 | 零 |
| 三 数据决策 | 按第五节判据逐项提请，一项一议 | 多轮后 | 逐项评估，未提请的不动 |

## 三、第一阶段 预警建设

本阶段六项全部是加观测、加告警，不改执行行为。每项附零阻断声明。

### M6 审计账补全

**落点**：`overlay/custom/server/toolpipeline/tool-hooks.ts`。

**现状**：账本条目只有 ts、phase、tool、inputKeys、ok、error 六个字段（`tool-hooks.ts:17-25`），无会话与身份标识。每次 append 后全文件读数，超过 1000 行整文件重写保留后半 500 行（`tool-hooks.ts:39-54`）。fail-open，审计失败不阻断工具执行。钩子链经 patch 566 注入 studio server 的两处 createRuntime（`upstream/hermes-studio/packages/server/src/modules/ekko/services/manager.ts:89,180`）。

**改法**：

1. 补上下文字段。上游 `ToolExecuteHook` 接口第三个参数本就是 `AgentToolContext`（`upstream/hermes-studio/packages/ekko-agent/src/tools/types.ts:132-142`），含 userId、sessionId、profileId、runId、workspaceId（同文件 `:45-75`），调用处始终透传（`packages/ekko-agent/src/tools/registry.ts:111,123`）。auditHook 现在忽略了这个参数，补上形参即可，不需要新 patch。enforce-gate 已有取 `context?.profileId` 的先例（`overlay/custom/server/toolpipeline/enforce-gate.ts:273`）。
2. 轮转改按天分文件。文件名 `tool-exec-YYYY-MM-DD.jsonl`，单文件 5000 行上限转 `.1`、`.2`，保留 14 天，跨天时顺手移除过期文件。去掉每次全文件读数，行数用文件 size 粗估。
3. fail-open 保持不变，落盘失败加计数并上报一条治理事件，避免静默失效。

**范围声明（必读）**：这套钩子只覆盖 studio server 内的 ekko runtime。agent teams 是 Python 子进程（`hermes -p <profile> chat -q`，`upstream/hermes-agent/hermes_cli/kanban_db_dispatch.py:2959-3010`），不经过这条链，审计账看不到它们。teams 的观测靠 M6b 的 state.db 采集面，两者互补，不要当成一个东西。

**零阻断声明**：只加字段、改轮转，不动任何裁决路径。

**验收**：

```bash
cd /Users/cuishi/lab/ncwk/overlay && npx vitest run custom/server/toolpipeline/__tests__/
# 新账本每行含 ts/phase/tool/sessionId/userId/ok 六字段
python3 -c "
import json
line = open('$HOME/.hermes-web-ui/tool-exec-audit/tool-exec-$(date +%F).jsonl').readline()
e = json.loads(line)
assert {'ts','phase','tool'} <= set(e), e
print('OK')"
```

### M6b teams 观测采集面

**落点**：`overlay/custom/server/clusterinspector/collectors.ts` 新增 collector，`cluster-inspector-controller.ts:228` 的 `ensureInspector` 实参处装配。

**数据源**：每个 profile 的 `~/.hermes/profiles/<profile>/state.db`，messages 表的 `tool_calls` 字段是 JSON 数组，元素形如 `{"function": {"name": "terminal", "arguments": "..."}}`，`role='tool'` 的结果消息带 `tool_name`。各 profile 库物理独立，逐库统计即可。

**采集口径**（两个都出，对不上本身就是异常信号）：

```sql
-- 口径 A：assistant 发起的工具调用（近 30 天按工具聚合）
SELECT je.value ->> 'function' ->> 'name' AS tool, COUNT(*) AS n
FROM messages m, json_each(m.tool_calls) je
WHERE m.role = 'assistant' AND m.tool_calls IS NOT NULL
  AND m.timestamp >= strftime('%s', 'now', '-30 days')
GROUP BY tool ORDER BY n DESC;
```

已在真实库实测通过（orchestrator 库口径 A 首位 execute_code 452 次、terminal 391 次）。sqlite3 需 3.38 以上支持 `->>`，本机 3.45.3 满足。用 `file:...?mode=ro` 只读打开，不碰 WAL。

**采集内容**：按 profile 聚合五类计数。近 1 小时与近 24 小时的工具调用总数。高危工具（terminal、execute_code、delegate_task）调用数。非工作时段（0 至 6 时）调用数。敏感路径读取数，路径参数里出现 `/etc/`、`~/.ssh/` 或其他用户 home 前缀即计入。全部只记计数与路径形态，不落参数值。

**零阻断声明**：只读采集，不写 profile 任何文件。

**验收**：collector 单测（空库、坏库、缺库三种形态都返回合法空态）；跑一次采集后 `ClusterSnapshot` 里能看到全部 profile 的计数。

### M7 三个告警检测器

**落点**：`overlay/custom/server/clusterinspector/detectors.ts`，范式同 `detectGateway`（`detectors.ts:56-72`），总入口 `detectAll`（`detectors.ts:433-460`）。

命名注意：现有 `detectRunawayLoop`（`detectors.ts:276`）已占用 D11 编号，新检测器不带 D 编号，用域名命名：`security.tool-rate`、`security.offhours-highrisk`、`security.tool-blacklist`。

三个检测器：

| 检测器 | 判据 | severity | subject |
|---|---|---|---|
| security.tool-rate | 单 profile 工具调用超过 100 次每分钟，2 倍升 high | warn | profile:<id> |
| security.offhours-highrisk | 0 至 6 时的高危工具调用，逐 profile 报 | warn | profile:<id> |
| security.tool-blacklist | 调用黑名单工具（默认 terminal_exec、code_exec、delegate_task） | high | tool:<name> |

阈值一律进 `DetectOptions`（`detectors.ts:18-51` 追加，缺省即默认，测试可注入）：`toolRatePerMin`、`offhoursStart`、`offhoursEnd`、`toolBlacklist`。黑名单常量放 detectors.ts 顶部，与 `STALL_TAIL_RE`（`detectors.ts:53`）同址，支持环境变量 `CLUSTER_INSPECTOR_TOOL_BLACKLIST` 逗号分隔覆写。

数据源用 M6 与 M6b 两个采集面合成，`snap.toolAudit` 缺席时返回空数组，与现有「未接线等于合法空态」的约定一致。

**零阻断声明**：检测器只产 Anomaly，Anomaly 走既有治理事件与催办通道，不拦任何调用。另注意：治理事件流里现有的 872 条 tool.denied 是执法门历史上开启时留下的。执法门没开就不会有新增，本阶段不能把 tool.denied 当数据源。

**验收**：三个检测器各一个单测，仿 `__tests__/disk-capacity.test.ts` 三段式（阈值边界、阈值可调、未接线空态）。

### M9 告警消费方

**落点**：`overlay/custom/server/clusterinspector/inspector.ts`，在 `runOnce` 的检测循环之后加 `relaySecurityEvents()`，编入现有动作串（`inspector.ts:551`）。

**现状**：`appendGovEvent` 有同步进程内 fanOut，`subscribeGovEvent`（`govbus/event-log.ts:74-80`）已实现但生产代码零调用方，订阅面闲置。

**改法**：轮询式，不新开订阅生命周期。新增 `InspectorDeps.getSecurityEvents`，默认实现读 `queryGovEvents({minSeverity:'high'})`，过滤 security 与 approval 两个域。三层去重防刷屏。水位线只消费 `ts > lastRelayTs` 的事件。键冷却用 `type + refs.profileId` 组合键，复用 `COOLDOWN_MS`（`inspector.ts:61`；实测同一条事件 100 秒内重复 3 次，无冷却必刷屏）。每轮封顶 2 条，超限聚合为一条汇总。发送复用 `nudgeStalled` 的矩阵通道（`inspector.ts:170-172`），profile 从 `refs.profileId` 取，无 profileId 的不带 mention。总开关 `CLUSTER_INSPECTOR_SECURITY_RELAY` 默认开。

**零阻断声明**：只发消息，不改任何裁决。

**验收**：inspector 单测五项。注入同键 3 条只发 1 条。跨轮同键且间隔小于冷却时长则抑制。单轮 5 条发 2 条加 1 条汇总。未配房间时静默跳过。

### M4 催办房间配置

**落点**：跑 cluster inspector 的 studio server 进程环境，以及 agent 进程读的 profile config.yaml。

**改法**：server 环境加 `CLUSTER_INSPECTOR_NUDGE_ROOM='!<房间>:<服务器>'`。未配时 `nudgeStalled` 静默跳过（`inspector.ts:155`，代码注释自述安全缺省），所以不配则前面所有告警都到不了人。发送者凭据读 `~/.hermes/profiles/<profile>/.env` 的五件套（MATRIX_HOMESERVER、MATRIX_ACCESS_TOKEN、MATRIX_USER_ID 三必填），profile 解析顺序 `LOOP_MATRIX_PROFILE` 到 `~/.hermes/active_profile` 到 orchestrator（`overlay/custom/server/matrix/gateway-env.ts:66-106`）。agent 侧矩阵白名单按需写进 profile config.yaml 的 matrix 段，先用 `free_response_rooms` 验证再收窄 `allowed_rooms`，设错会把 agent 变成群聋子。

**零阻断声明**：配置只影响告警投递，不影响 agent 行为。

**验收**：触发一次已知告警（如临时调低磁盘水位阈值），房间收到消息；凭据五件套存在性检查通过。

### M8 出厂默认口令门禁（预警态）

**落点**：`overlay/scripts/verify-dist.mjs`（现 31 行，postbuild 钩子）。

**默认口令全部出处**（已实测定位）：

| 出处 | 锚点 | 性质 |
|---|---|---|
| 桌面自动登录 | `upstream/hermes-studio/packages/client/src/components/hermes/pets/WebPet.vue:189` | 生产包内，`POST /api/auth/login` 带 admin/123456 |
| overlay dev 登录桩 | `overlay/registries/client/entry.mts:93` | `import.meta.env.DEV` 门控，生产构建触发 tree-shake，不进包 |
| i18n 提示文案 | 12 个语言文件 `login.defaultCredentialsHint` | 当前无 .vue 消费此键，死键但字符串仍进包 |
| 桌面重置登录 | `upstream/hermes-studio/packages/desktop/src/main/desktop-login-reset.ts:7` | 重置功能用 |
| 服务端 bootstrap | `upstream/hermes-studio/packages/server/src/modules/studio/repositories/users-store.ts:48-49` | 空库首登建超管 |

**改法（预警态）**：扫描 `dist/client/index.html` 与 `dist/client/assets/*.js`，两类模式。P1 自动登录调用（`username:"admin",password:"123456"` 字面量），P2 提示文案（同时含 123456 与口令类关键词）。命中打 WARN 行并计数，退出码保持 0，不阻断构建。负向断言排除误报：`123456(?!\s*:)` 排除 telegram token 占位符形态。留一个显式豁免位 `VERIFY_DIST_ALLOW_DEFAULT_PASSWORD=1`，放过时同样打 WARN 留痕，不提供静默豁免。

**零阻断声明**：WARN 不进退出码，构建照过。

**验收**：反向测试五项。造含 P1 字面量的假 asset，退出码为 0 且 stderr 有 WARN。造 P2 文案，结果相同。造 `123456:ABC-DEF` 占位符，不误报。干净 asset 无 WARN。豁免位生效。

### M8b 源头修复评估（只评估不动手）

默认口令的根治要动上游五处，本阶段只做评估报告，不改任何上游文件。评估四个问题。桌面免密登录改主进程下发一次性 token，改造面有多大。i18n 死键摘除的影响面。reset 功能是否保留。bootstrap 要不要加首次登录强制改密。评估结论供第三阶段决策。

## 四、第二阶段 观察指标与周报

预警跑起来后，按周从三个数据面出分析报告。周报的目的只有一个：给第五节的每个判据提供数据。

| 指标 | 数据面 | 服务哪个决策 |
|---|---|---|
| 各岗工具使用分布（近 7 天与近 30 天对比） | state.db 盘点 | M2 裁剪判据 |
| 高危命令实际发生清单与频次 | state.db 盘点加审计账 | M1 审批判据、M3 执法门判据 |
| 敏感路径读取实际发生（/etc、~/.ssh、其他用户 home） | state.db 盘点 | M10 黑名单判据 |
| 非工作时段活动分布 | 盘点加 D12 告警 | M1 判据、告警阈值校准 |
| 出厂口令泄漏面变化 | M8 WARN 计数 | M8 转硬失败判据 |
| 告警误报率与噪音量 | 治理事件流 | M7 阈值校准 |
| 工具集静默失效面（acp、messaging 等零工具集） | resolve_toolset 检查 | M2 裁剪判据（裁之前先修失效名） |

盘点脚本每次跑完落一份带日期的报告，周报直接引用，不重复造口径。

多轮的定义：至少 4 个完整周的连续数据，覆盖一次完整的任务周期。少于 4 周的判据不提请。

## 五、第三阶段 阻断项决策判据（全部挂起）

以下十项在挂起状态，不预执行。每项的启用判据是数据阈值加人工复核双条件，达标后一项一议，议一项动一项。任何一项未达标都不动。

| 项 | 挂起内容 | 启用判据 |
|---|---|---|
| M1 审批档位显式化 | 49 个 team 写 approvals 段，根配置改 smart | 数据显示高危命令日均不超过 10 次，且集中在已知运维动作，人工确认成本可接受。cron、single_query、unattended 三档保持 deny 不变 |
| M2 toolsets 裁剪 | 按岗三级裁剪 | 目标岗近 30 天对某高危工具零调用，或调用可由只读工具替代且任务负责人确认。另需先修掉 acp 与 messaging 两个静默失效名 |
| M3 执法门总闸 | HERMES_TOOL_ENFORCE=1 | 预警期 shadow 数据表明规则无误拦；且需先解决覆盖问题（钩子只到 studio server，teams 不经过，见下） |
| M5 绑定地环 | BIND_HOST=127.0.0.1 | 观察期无人从非回环地址访问，有访问日志佐证。LAN 用户需逐个确认 |
| M10 文件黑名单 | file_safety 与 approval_detection 两层 | 观察期零合法敏感路径读取，或合法读取可枚举并逐一加白 |
| M11 稳定层红线 | System Prompt 加不可覆盖红线 | 出现实际提示注入案例，或用户裁定 |
| M12 权限衰减 | delegation 条件重授、MCP 默认不继承 | 观察期出现子 agent 实际扩权事件，或用户裁定 |
| M13 默认绑定值 | 上游默认改 127.0.0.1 | M5 观察通过，且 Docker 与 LAN 两种形态的 BIND_HOST 补配完成 |
| M14 服务账号切换 | agent 提交推送换 bot 身份 | 新账号权限配置验证完成，灰度一个 profile 一周无推送失败 |
| M15 凭证轮换台账 | 建台账按 90 天轮换 | 无阻断属性，随时可做，不占决策名额 |

M3 有一个结构性事实，必须写进决策记录。执法门是 studio server 进程内的 TypeScript 钩子，agent teams 是 Python 子进程，hermes-agent 仓全量检索无 `HERMES_TOOL_ENFORCE` 消费点。即使打开总闸，49 个 team 也读不到。teams 的管控只能走 M1 与 M2，落在配置与工具集层面。若要 teams 也纳入执法面，需在 Python 侧新建对应钩子，属独立立项。

M1 另有一个实测事实：根配置 `~/.hermes/config.yaml` 对带 profile 的启动不生效。`~/.hermes/active_profile` 内容为 orchestrator，`hermes config path` 解析到 profile 目录的 config.yaml。配置由 profile 文件与上游默认值深合并而成，根配置的字段不起作用。根配置只影响显式以 `~/.hermes` 为 home 的进程（当前 2 个）和不带 profile 的 CLI 调用。所以 M1 的主战场是各 profile 的 config.yaml，不是根配置。

## 六、附录 patch 级草案（挂起备用）

以下草案供第三阶段启用时取用，本阶段不提交、不注入。patch 工程规范有六条。文件放 `overlay/patches/`，命名 `<编号>-<agent|server>-<slug>.patch`。在 `patches/series` 追加一行才生效，该文件当前 360 行。路由按路径前缀：命中 `agent/`、`tools/`、`tests/tools/` 进 hermes-agent，命中 `packages/` 进 hermes-studio。hermes-agent 的 patch 失败只 WARN 跳过，hermes-studio 的失败直接退出。写 patch 用 `git diff` 生成，不手改 hunk 头。套用前在纯基线 `git apply --check` 干跑，inject 后比对终态 diff。

### M10 草案：文件系统边界

第一层改 `agent/file_safety.py` 的 `get_read_block_error`（386-432），在末尾加系统敏感文件与凭证目录读拒。三个注意点。macOS 的 `resolve()` 会把 /etc 改写进 /private/etc，两种拼写都要查。/etc 只拒 shadow、passwd、sudoers 三个文件，不拒整目录，避免误伤 os-release、hosts 这类合法诊断对象。凭证目录（.ssh、.aws、.gnupg、.kube、.docker、.config/gh）在任何 home 前缀下一律拒读。文件顶部需补 `import re`。

第二层改 `tools/approval_detection.py` 的 `DANGEROUS_PATTERNS`（228-482，元素是正则加描述的元组），末尾加三条。分别是 cat 类命令读 /etc/shadow 等敏感文件、find 全网搜私钥、读其他用户 .ssh 目录。放 DANGEROUS 不放 HARDLINE，理由是读取可恢复、非主机破坏，合法运维需人工放行，对应审批而不是无条件拦截。

覆盖确认：file_safety 读拒覆盖 read_file 与 search（`tools/file_tools.py:649,1177`）；写拒在 `tools/file_operations.py` 后端层覆盖 write_file、patch、delete、move；terminal 两层都不覆盖，所以第二层必须补。

### M11 草案：稳定层红线

`agent/system_prompt.py` 的 `build_system_prompt_parts`（743-808）返回 stable、context、volatile 三段，stable 是缓存前缀每轮常在。红线段落作为常量加在 `HERMES_DISCLOSURE_GUIDELINES`（734 行）附近，在 stable 组装处（763 行后）append。位置在身份段之后，符合地板覆盖 persona 的语义。红线段落文本包含三条禁止与一句不可覆盖声明。

配套把 SOUL.md 纳入 `agent/file_safety.py` 的 `build_write_denied_paths`（176-206），加进 home_files 与 hermes_files 两处。这与 #45947「config.yaml 只读拒不写拒」的哲学不冲突。SOUL.md 是 prompt 构建时加载的 persona，不是实时读取的安全控制，且本就有审批门保护（`tools/file_tools_write_guards.py:189-190`）。升级为硬拒时需同时从审批门移除同名条目，避免双轨。profile config.yaml 维持不纳入。

### M12 草案：权限衰减

第一处，`tools/delegate_tool_toolsets.py:116-119`，orchestrator 角色无条件重授 delegation 改为条件授予：仅当父未显式禁用时才重授。`inherited_disabled` 是 list，成员判定直接可用。

第二处要翻两个点。`tools/delegate_tool_config.py:175-177` 的 `_get_inherit_mcp_toolsets` 默认值从 True 翻 False，`hermes_cli/config_defaults.py:1356-1359` 的出厂默认值同步翻。只翻一处会漏：`HERMES_IGNORE_USER_CONFIG=1` 与配置读取异常两条回退路径返回空字典，此时 `.get()` 为 None，由函数默认值决定。现有测试无任何断言「默认开启继承」，翻默认不破坏既有绿测。新增用例四个：父禁用时不重授、父未禁用时重授、默认不继承 MCP、显式开启时继承。文档同步点 `tools/AGENTS.md:140`。

### M13 草案：默认绑定值

`packages/server/src/modules/studio/public/config.ts:53` 默认值 `'0.0.0.0'` 改 `'127.0.0.1'`，`bootstrap/http.ts:169` 的兜底同步改。影响面分三种形态。Docker 形态容器内必须绑 0.0.0.0，否则主机不可达，需在 `docker-compose.yml` 补 `BIND_HOST=0.0.0.0`。LAN 多设备访问依赖 0.0.0.0，需显式配置。桌面形态本就走回环，受益。文档同步三处：`README.md:411`、`README_zh.md:404`、`docs/docker.md:41`。另注意 `packages/desktop/src/main/webui-port.ts:17-19` 有一处独立的 0.0.0.0 默认，但是端口释放探测用，单列决策不混入本项。

## 七、风险

1. **预警期风险暴露窗口继续存在**。这是用户裁定下的知情选择，不是遗漏。零阻断意味着已发现的高危面（全量工具集、无文件边界、身份未分离）在观察期内原样存在。缓解：观察期设上限，4 周内必须出第一轮决策，不允许无限期挂起。
2. **告警噪音导致狼来了**。三层去重加每轮封顶之后仍有噪音可能。缓解：周报统计误报率，误报率超过三成的检测器先降阈值或临时关，不硬扛。
3. **观测面不全导致误判**。审计账只覆盖 studio server runtime，teams 靠 state.db 离线采集，两者之间存在时间差，state.db 的落盘时点也可能滞后。缓解：周报同时给两个面的数字，对不上时以 state.db 为准并记录差异，不掩盖。
4. **盘点脚本读 49 个库有成本**。全量扫描一次的时间需要实测。缓解：采集面做增量（按 timestamp 水位），首次全量之后只读增量。
5. **M8 预警态可能没人看**。WARN 不进退出码，构建日志里容易漏掉。缓解：WARN 行带固定前缀与计数，周报单列一项跟踪，连续两周零新增才考虑转硬失败。

## 八、Non-goals

1. 不做 terminal 容器化后端重构。独立项目，涉及 agent 执行环境、工具链、镜像供给。
2. 不做多租户与行级隔离。C2 在单机形态下判不适用。
3. 不重写审计体系。run-trace 零输出根因未定位，先用 overlay 账本与 state.db 两个面覆盖。
4. 本阶段不动上游任何文件。patch 草案只写不提交。
5. 不处理沙箱 compose 的 Redis 无认证与 Postgres 弱口令。属 dev 与 sim 编排，非 agent 生产库。

## 九、验收总纲

1. 每个修改项有机械验收判据，能跑命令或跑测试证明。
2. 第一阶段收口复跑五项。配置检查确认未改任何执行配置。单测全绿。告警端到端跑通一次。盘点脚本产出首份报告。零阻断声明逐项检查。
3. 收敛判据是零新缺陷的完整轮。预警期的「零新缺陷」特指观测面自身不引入阻断、不引入崩溃、不丢数据。
4. 第二阶段每周出数据报告，第四周出第一轮决策建议。
5. 全部阻断项决策完毕后，重跑检查清单 20 项，逐项对比修改前后结论，出复查报告。
