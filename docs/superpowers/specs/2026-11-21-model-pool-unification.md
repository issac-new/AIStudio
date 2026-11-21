# 模型池统一：ekkostudio 调用面钉 cc-switch 单通道（方案 A）

> 状态：实施中（2026-11-21 开工，worktree `.claude/worktrees/model-pool-unify`，分支 feat/model-pool-unify）。

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

**批三挂账（本 spec 立账、另批实施）**：cc-switch launchd 保活＋双路判别器探针常驻（统一后 cc-switch 为全流量单点，run27 坏状态 ~3h 周期实录）；宿主 ：8648 走查验证。

## 决策记录

1. **方案 A 直钉**（用户裁决）：链路最短、彻底消双轨；代价=投影＋网关上游两处补丁。否掉 B（多一跳＋双协议适配长期维护；本机对外 key 表 0 行，无消费者）与 C（TS 重造账号池/降级队列/熔断/审计，且违背已立红线方向）。
2. **IDE 池不并入**（用户裁决）：2026-09-26 独立立法延续，`engine-model-config.ts:1-8` 红线不动。
3. **供应商管理 UI 保留**（用户裁决）：CC Switch 与 studio 供应商管理并列为两个管理渠道；本批不改其行为。
4. **env 默认=cc-switch URL 而非空默认**：本仓即部署正身（补丁编码部署口径是二开常规，先例 801 皮肤色）；`self` 逃生门显式回退，保上游产品态可回归测试。
5. **裸模型名透传**：模型名归客户端所有（ccswitch-routing-semantics 规则 1），cc-switch 按请求名直路由；namespace 限定是 studio 网关的私有协议，直钉后删。
6. **默认/辅助模型=aim**：粘性换组免疫（0917 舰队口径，claude 分支 22.6 万次 200 实测）；实名白名单仅作显式选择项。
7. **白名单放 custom TS 模块而非 JSON/读 cc-switch DB**：单一事实源＋类型化＋守门测试覆盖；读 cc-switch SQLite 引入跨进程双写耦合，不做。将来需要热改时再评估配置文件化。
8. **补丁号 812**：series 尾 811 核查过，无撞号。

## 验证

- **vitest 目标**（新增＋改造，全在两态上断言）：
  - 投影统一态：`synchronizeHermesProvider` 产物含 upstream base_url＋`api_key=PROXY_MANAGED`＋`session_affinity_header: session_id`＋裸模型名（无 namespace 前缀）；
  - 投影 legacy 态（env=self）：产物与现状逐字段一致（回归）；
  - `resolveAgentGatewayRuntime` 两态 baseUrl/apiKey；
  - `getAvailableModelGroupsForProfile` 统一态=白名单单组、legacy 态原输出；
  - modelpool 域：`unifiedModelPool()` 形状＋`GET /api/modelpool` 契约（vi.mock 单例模式，router 契约测试先例）。
- **补丁重放**：`npm run inject` 后目标测试绿（fresh worktree pretest 自动注入，N-4 已根治）。
- **批三走查判据**（机械可查）：studio 聊天发起 → `proxy_request_logs` 新增 `app_type='hermes'` 记录且 `request_model`=裸名；UI 模型清单=白名单；env=self 回退原网关行为不变。
- **门槛**：提交前 `npx vitest run <目标路径>`；合并前 `npm test` 全量＋`npm run typecheck:harness`（涉服务端新模块）。

## 设计文档影响

DESIGN_SYNC: none——`docs/DESIGN.md` 无模型调用链章节（grep 实测：cc-switch/模型池/供应商零命中，仅记忆 provider 与「主/辅两档」表述，与本批无涉）；`docs/design/mechanism-map.md` §2「渠道轮转+熔断＝cc-switch 外部进程」经本批后仍成立（cc-switch 从推演/teams 通道升级为全流量唯一上游，机制语义不变、覆盖面扩大，无需改写）；本架构决策以本 spec 为事实源。
