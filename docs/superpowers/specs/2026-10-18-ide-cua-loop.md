# Cua 完整电脑操作回路（2026-10-18）

**主旨三句话**：把 IDE 的「电脑操作」从声明式提示词升级为真实闭环——会话级闸门（fail-closed 默认）→ hermes spawn 注入 broker 凭据 → zcode 官方 computer-use 插件执行 → 截图证据回显 IDE。受众是 IDE 使用者与后续维护者，读完应能验收开关行为、fail-closed 语义与证据浮窗。

## 架构事实（实测锚点）

1. **插件链自动就绪**：zcode CLI（含 hermes scoped `ZCODE_STORAGE_DIR`/`ZCODE_DATA_BASE_DIR` 隔离环境）首次运行自动 seed 官方插件缓存（实测 `plugins list --json`：17 插件含 `computer-use@zcode-plugins-official`，缓存落 `storage/cli/plugins/cache/.../computer-use/0.6.4`）。
2. **CUA 能力载体**：`node_repl` MCP server（`built-in-node-repl.ts:39` 注入 `ZCODE_CUA_PLUGIN_ROOT`）；技能（`zcode-cua-plugin/skills/computer-use/SKILL.md`）引导 agent 经 `mcp__node_repl__js` bootstrap `scripts/computer-use-client.mjs`。
3. **凭据配对**（`packages/shared/src/runtimeEnv.ts:147`）：`ZCODE_CUA_PERMISSION_BROKER_SOCKET` + `ZCODE_CUA_PLUGIN_AUTHORITY` **成对**出现才被捕获并定向注入 node_repl env；半组=fail-closed 清空。socket 键被列入 `SANITIZED_RUNTIME_ENV_KEYS`，绝不随全局子进程 env 泄漏（confused-deputy 防护，官方注释明示）。
4. **官方 bundle 无内嵌回落**：安装版 `glm/zcode.cjs` 零处 `ZCODE_CUA_DISABLE`（实测 grep）；无 broker 凭据时 CUA 恒 unavailable——即 hermes 现状默认即 fail-closed。内嵌 Node 后端回落只存在于 overlay zcode-patch 004 的源码构建。
5. **Broker 实体**：桌面 Helper（`~/.zcode/computer-use/ZCode Computer Use.app`，lease 见 `/tmp/zcode-cua-<uid>/controller-lease.json`，socket `/tmp/zcode-cua-<uid>/broker.sock`，0600 同 UID 即鉴权；authority 是来源标记非口令）。

## 实现

1. **策略单一事实源** `custom/server/cua/policy.ts`：`runtime/ide-cua.json` 会话开关注；`cuaEnvForSession` → 关闭（默认）=`{ZCODE_CUA_DISABLE:'1'}`（对 004 源码构建生效；官方 bundle 本就无凭据=关）；开启=`{ZCODE_CUA_PERMISSION_BROKER_SOCKET, ZCODE_CUA_PLUGIN_AUTHORITY:'hermes-ide-cua'}`（socket 路径探测 `/tmp/zcode-cua-<uid>/broker.sock`，缺席时如实报不可用）。
2. **hermes 闸门 patch 664**（`chat-turn.ts`，git diff --no-index 生成）：spawn 前合并 `cuaEnvForSession(run.launch.sessionId)` 进 `run.launch.env`（per-turn 生效，不改持久面）。
3. **REST**（native-routes）：`GET /api/ide/cua/status`（available=插件缓存已 seed + broker socket 活性）、`GET/PUT /api/ide/cua/session/:id`。
4. **客户端**：composer 电脑操作开关改写真实策略（PUT→服务端生效值回填；写失败按钮回弹不装成功）；会话切换拉取服务端态；`IdeCuaFloat` 浮窗从 `node_repl` 工具结果提取 image content（三种到达形态兼容）渲染缩略图/大图/保存。

## 决策记录

- D-1：默认 fail-closed，会话显式 opt-in。理由=桌面控制高危；官方 bundle 无凭据即关，patch 664 的 DISABLE 值对 004 构建同样关——两形态一致。
- D-2：凭据成对注入（socket+authority='hermes-ide-cua'）。理由=runtimeEnv.ts 捕获要求成对；authority 标记来源便于审计；不碰 refresh marker（可选键）。
- D-3：不自起 broker、不动桌面 Helper。理由=Helper 由桌面管理（lease/supervision）；socket 接受连接即用，不接受则如实报不可用。若用户无桌面 Helper，开启开关后 agent 会收到明确 unavailable——诚实优于伪造。
- D-4：证据渲染在 IDE 浮窗（cuaEvidence 提取），不改上游 MessageList。理由=上游组件无插槽，开 patch 的冲突面大于收益；工具卡仍显示原始 JSON（完整数据不丢）。
- D-5：gate 集成测试经 `OVERLAY_UPSTREAM_ROOT` 指向私有注入克隆，无标记时 skip（zcode-002 旧引擎守卫同款）。理由=共享上游注入态随分支漂移，测试不能依赖并行会话的注入时机。

## 验收

- 单测：policy 6 + REST 4 + gate 2（需注入克隆）+ evidence 5 + float 1 = 18 新用例。
- E2E：开启=agent 经 computer-use 技能真截图（stream-json 含 image content）；关闭=不可用（两形态一致）。
- 全量回归零失败；smoke/双模式不回归。

## E2E 实测记录（2026-10-18，12 轮迭代）

| 轮 | 结果 |
|---|---|
| fail-closed 对照 | ✅ 无 env → "Computer Use is unavailable for this node_repl session" |
| 桌面 Helper 直连 | ❌ peer verification failed（第三方宿主按设计拒连）→ 转自有 broker |
| 自有 broker 协议 | v3-v6 逐层攻克：authenticate（IPC v3 两段式握手，缺它=broker_response_ambiguous）→ id 回显 → 裸载荷（CallToolResult 包裹会让官方 toText 套娃、SDK 解析空列表）→ 官方词表（list_applications/broker_info，非 list_apps） |
| v8-v10 | capture_app 返回真 PNG（3024×1964 base64，broker trace 实录）；SDK 状态配对面要求 state_id/elements/app/window 四键 |
| v11-v12 | get_app_state 语义实锚=官方也走 capture_app 期望 AX 状态文档；补齐后 SDK 正常走完 has_image 判定 |

**终态**：全协议链贯通（authenticate→broker_info→list_applications(active 标记)→request_access→capture_app(状态文档+真图像字节)）。最终一轮无模型可见图像的唯一原因是**环境事实**：本机前台是 loginwindow（锁屏/登录面），官方层按产品设计对无窗口 faceless 进程拒发图像（"hidden or unrendered window, has_image: false"）——解锁后同一链路即出图。此边界如实记录，不装通过。

**桌面 Helper 结论**：`~/.zcode/computer-use/ZCode Computer Use.app` 的 peer-verification 只认 dev.zcode.app 签名链（desktopHostProcess.ts:274-278 注释明示），第三方宿主（hermes/IDE）按设计被拒。自有 broker（upstream/zcode 补丁源码 broker-server.js）是 IDE 侧的正路，006 补丁使其与官方 node_repl host 0.6.x 协议完全兼容。
