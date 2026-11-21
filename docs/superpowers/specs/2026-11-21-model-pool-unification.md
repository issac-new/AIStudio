# 模型池统一：ekkostudio 调用面钉 cc-switch 单通道（方案 A）

> 状态：已收口（2026-11-21 三提交落地：894abbf9d 立项＋1f4083f52 批二＋e6047aa95 审查三 I；全量 9876/0、server tsc 零错、隔离冒烟 401＝路由挂载+JWT 门在位；批三挂账另批实施）。

## 1. 背景与对账（2026-11-21 三路实测）

现状三链（锚点均为当日亲核）：

| 链路 | 现状 | 锚点 |
|---|---|---|
| 宿主 hermes teams/CLI | **已统一**：主 config 单条 `cc-switch-route`（:15721/hermes/v1，codex_responses，PROXY_MANAGED）；`:638` 有当日退役注记「ekkostudio 模型池退役：统一走 cc-switch 单通道」 | `~/.hermes/config.yaml:523-534,638` |
| ekkostudio（studio 应用） | 双轨之源：内嵌 ekko-agent 与桥接 CLI 全部折叠为 `ekkostudio` provider → studio 内部网关 `/api/ekko-studio/models/v1` → 直连真实供应商（自有池~40 家预置＋OAuth/.env 凭据＋5min 超时＋无跨供应商 failover）。**本机零使用**（`providers/users/` 不存在、`model_api_keys` 0 行、`provider_audit_events` 0 行） | `vendor/hermes-studio/packages/server/src/modules/studio/services/providers/hermes-projection.ts:15,84-86`；`bootstrap/provider-gateway-client.ts:6-21`；`modules/hermes/controllers/models.ts:618` |
| IDE 编码引擎（zcode 底座） | 独立池（用户 2026-09-26 立法） | `custom/server/enginemodels/engine-model-config.ts:1-8` |

两池不对等：cc-switch 具备账号池 LB/降级队列/熔断/按 lane 超时/会话粘性/统一审计（`~/.cc-switch/cc-switch.db` 的 endpoints/providers/proxy_config＋proxy_request_logs）；studio 网关只有单供应商直连。studio 直连绕过计量/熔断/审计三层，与既有红线冲突（`team/skills/devops/llm-routing-redlines/SKILL.md`：脚本面「统一出口走 cc-switch」）。

**用户三裁决（2026-11-21）**：① 方案 A＝studio 池退役＋改写点直钉 cc-switch（否掉 B 薄代理/C 反向统一）；② IDE 引擎池不并入；③ 供应商管理 UI 保留（CC Switch 亦为供应商管理的一个渠道，两渠道并存）。

## 变更

按依赖序三件：

1. **补丁 812**（B 类，vendor/hermes-studio；series 尾 811 已核，取 812）——上游目标可配置化＋统一模式三改写点：
   - `hermes-projection.ts`：新增 `studioUpstreamBaseUrl()`——env `EKKO_MODEL_UPSTREAM_BASE_URL`，**默认 `http://127.0.0.1:15721/hermes/v1`**（本仓=部署正身，默认即统一口径）；显式设 `self` 回退原 studio 网关（上游产品态逃生门，保回归可测）。统一模式下投影产物：providers 条目 `api_key: PROXY_MANAGED`＋`session_affinity_header: session_id`（profile 名作 session 值）；**模型名跳过 `qualifyModelRoute` namespace 限定**（裸名透传，namespace 前缀仅服务 studio 网关反解，直钉后无消费者）。
   - `provider-gateway-client.ts`：`resolveAgentGatewayRuntime` 的 baseUrl/apiKey 同源切换（统一模式 apiKey=PROXY_MANAGED），`x-studio-*` 头保留透传（cc-switch 忽略未知头，无害）。
   - `modules/hermes/controllers/models.ts::getAvailableModelGroupsForProfile`：统一模式返回白名单单组（provider=`cc-switch-route`），legacy 模式原逻辑不变。
2. **custom 新域 `custom/server/modelpool/`**：白名单**单一事实源**（TS 模块 `pool.ts`，非 JSON——白名单变更走代码+测试，版本化可审查）；导出 `unifiedModelPool()`（models＋contextLength＋defaultModel）＋只读 `GET /api/modelpool`（诊断/UI 数据源）。补丁侧经 `../custom/modelpool/...` 相对路径 import（810/811 挂载先例）。白名单口径：**默认模型 `aim`**（占位符对换组/开 LB 免疫，0917 舰队裁决）＋实名备选 `glm-5.3`/`kimi-for-coding`/`glm-5.3-flash`/`claude-opus-5`；辅助任务（compression/review 等）统一默认 `aim`（粘性 provider 原生模型，必可服务——cc-switch 选点模型盲，异源实名在粘错 provider 时 400，team 技能 ccswitch-routing-semantics 规则 3 实录）。
3. **供应商管理 UI：不动**（裁决③）——上游 account pool 管理能力完整保留，本批零改动。

**批三执行记录（2026-11-21 晚，同日销账）**：
- **②保活**：`~/.cc-switch/keepalive/cc-switch-keepalive.sh`＋LaunchAgent `com.ccswitch.keepalive`（5 分钟探针＝小负载流式判据；连续 2 败 quit+reopen CC Switch，600s 冷却；探针实测过门，失败计数文件在位）。
- **①走查（真机 ：8648，新 dist 五文件补丁）**：login 200 → `/api/modelpool` 200（unified=true＋白名单 5 项）→ `/api/hermes/available-models` 200（唯一组 cc-switch-route，default_provider=cc-switch-route）→ socket `/chat-run` 真跑一回合 → **`proxy_request_logs` 落 `app_type='hermes'` 记录＝E2E 通道实证**。走查连环修三件：KNOWN_KEYS 告警（fix2）；宿主 runtime 半同步残态致 bridge ImportError（63 个纯新增 runtime 模块补拷，热修 18 件原样保留）；`aim` 在未配 `meta.model_mappings` 的 hermes lane 原样透传→上游 400（fix3：默认模型改实名 `glm-5.3`，aim 降为选项）。
- **③runtime 收口判向（dossier 待用户裁决）**：保留 15＋差异 14 中 18 件为**双向分歧**（宿主独有热修：hosted_rooms authority 子系统 144 行/approval smart_cache/agent_init prompt_caching/model_tools action-gate 等 vs repo 独有近三日批次：dual_sign/required_capabilities 等）——整灌倒退 repo、覆盖毁热修，须热修作者会话认领移植（建议独立批）；9 件 repo 超集已随 63 模块补拷收敛（`deploy --apply` 级覆盖未执行，.bak 零产生）。

## 决策记录

1. **方案 A 直钉**（用户裁决）：链路最短、彻底消双轨；代价=投影＋网关上游两处补丁。否掉 B（多一跳＋双协议适配长期维护；本机对外 key 表 0 行，无消费者）与 C（TS 重造账号池/降级队列/熔断/审计，且违背已立红线方向）。
2. **IDE 池不并入**（用户裁决）：2026-09-26 独立立法延续，`engine-model-config.ts:1-8` 红线不动。
3. **供应商管理 UI 保留**（用户裁决）：CC Switch 与 studio 供应商管理并列为两个管理渠道；本批不改其行为。
4. **env 默认=cc-switch URL 而非空默认**：本仓即部署正身（补丁编码部署口径是二开常规，先例 801 皮肤色）；`self` 逃生门显式回退，保上游产品态可回归测试。
5. **裸模型名透传**：模型名归客户端所有（ccswitch-routing-semantics 规则 1），cc-switch 按请求名直路由；namespace 限定是 studio 网关的私有协议，直钉后删。
6. **默认模型=glm-5.3（fix3 修订；原定 aim）**：走查实证 hermes lane 未配 `meta.model_mappings` 时 `aim` 被原样透传→上游 400（`proxy_request_logs` 20:35:35 实录）——默认必须用粘性 provider 原生名。`aim` 保留为白名单选项，lane 侧配好 model_mappings 后可切回占位符获得换组免疫（0917 舰队口径，claude 分支 22.6 万次 200 实测）。辅助任务同默认实名档。
7. **白名单放 custom TS 模块而非 JSON/读 cc-switch DB**：单一事实源＋类型化＋守门测试覆盖；读 cc-switch SQLite 引入跨进程双写耦合，不做。将来需要热改时再评估配置文件化。
8. **补丁号 812**：series 尾 811 核查过，无撞号。

## 验证

- **vitest 目标**（新增＋改造）：
  - 投影统一态**行为断言**（mock 账号面/存储面真跑 `synchronizeHermesProvider`）：产物含 upstream base_url＋`api_key=PROXY_MANAGED`＋`session_affinity_header: session_id`＋**裸模型名**（回归锁：断言不出现 `cc-switch-route/` 前缀——审查 P1-1 曾漏网处）；
  - 投影 legacy 态与池漏斗早退＝**内容锁**（补丁是本仓产物，内容断言成立；legacy 路径触真实账号面不做行为调用）；
  - `resolveAgentGatewayRuntime` 统一态行为断言（真 import 打补丁模块）＋显式 URL 覆盖；
  - modelpool 域：`unifiedModelPool()` 不变式＋`resolveModelUpstream` 两态＋`GET /api/modelpool` 投影契约。
- **审查修复留痕**（节点⑦ 蓝军 2026-11-21）：P1-1 投影 models 循环漏网前缀化→循环条件修复＋回归锁；P2-2 投影仅内容锁可被死代码骗过→补行为测试；P3-3 本段原措辞夸大（声称 legacy 行为断言）→校准如上。
- **fix2（批三走查首战发现）**：新 dist 首启告警 `[config-helpers] ... unknown config keys ignored: session_affinity_header`——studio 侧 `provider-compat.ts` KNOWN_KEYS 白名单缺该键（内存视图丢弃＋每轮告警；文件写回实测保留，无丢键风险）。根治=补丁 812 增第五文件补键（python 侧 `config_providers.py:126/278/520` 原生消费同键，两侧口径对齐）。全量 9877/0。
- **补丁重放**：`npm run inject` 后目标测试绿（fresh worktree pretest 自动注入，N-4 已根治）。
- **批三走查判据**（机械可查）：studio 聊天发起 → `proxy_request_logs` 新增 `app_type='hermes'` 记录且 `request_model`=裸名；UI 模型清单=白名单；env=self 回退原网关行为不变。
- **门槛**：提交前 `npx vitest run <目标路径>`；合并前 `npm test` 全量＋`npm run typecheck:harness`（涉服务端新模块）。

## 设计文档影响

DESIGN_SYNC: none——`docs/DESIGN.md` 无模型调用链章节（grep 实测：cc-switch/模型池/供应商零命中，仅记忆 provider 与「主/辅两档」表述，与本批无涉）；`docs/design/mechanism-map.md` §2「渠道轮转+熔断＝cc-switch 外部进程」经本批后仍成立（cc-switch 从推演/teams 通道升级为全流量唯一上游，机制语义不变、覆盖面扩大，无需改写）；本架构决策以本 spec 为事实源。
