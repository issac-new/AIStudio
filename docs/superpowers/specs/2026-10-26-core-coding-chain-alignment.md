# 核心编码链对齐：ACP→Ycode→项目技能→任务工作区（2026-10-26）

分支：`fix/core-coding-chain`

## 变更

用户给定的系统逻辑第 7、8 段要求：hermes agent 编码时经 ACP 调用 Ycode；Ycode 加载
swarm-yuan 生成的项目技能 `XXX-dev`，用该技能开发；任务 workspace 即 Ycode 项目根。
勘察确认现状存在三处断点：worker-coder 默认 ACP provider 是 claude；`acp_send` 未显式
传 `cwd` 时落全局沙箱而非任务工作区；swarm-yuan 在编码完成后才生成，顺序与描述相反，
且技能名无 `<项目>-dev` 约定。本批按「能力缺口改实现」对齐。

1. **acp-client 插件（22 个 profile 副本）**：provider 解析顺序改为
   显式参数 > `HERMES_ACP_PROVIDER` > `config.default_provider`；cwd 解析顺序改为
   显式参数 > `HERMES_KANBAN_WORKSPACE` > `client.default_cwd`。`acp_agents` 与
   `acp_send` 共用同一解析函数。
2. **worker-coder profile**：`env_extra` 增 `HERMES_ACP_PROVIDER=zcode`（Ycode 的 ACP 桥
   `zcode-acp-server`）。只在 worker-coder 开，其他 profile 保持各自默认路由。
3. **worker-coder SOUL**：标准循环插入「4.5 编码前准备项目 dev skill」；第 5 步改为
   `acp_send(provider="zcode", cwd="$HERMES_KANBAN_WORKSPACE")` 且首轮 prompt 必须要求
   引擎先读项目技能；第 9.5 步改为编码后 `--upgrade` + `--verify-completeness`。长任务
   保留 `coding-delegate` 后台驱动通道。
4. **skillgov 生成端点**：`name` 缺省时按 `<项目目录名>-dev` 派生（字符集归一）；默认
   产物落 `<项目>/.claude/skills/<name>`（swarm-yuan 默认根），并软链到
   `~/.zcode/skills/<name>` 供 Ycode 装载；不再落项目同级 `<name>-skill`。
5. **runtime 注册**：`runtime/hermes-skills` 注册进 `skills.external_dirs`，使
   `coding-delegate` 在运行时可见；`runtime-manifest.json` 补其 `SKILL.md` 条目。
6. **整合正本**：§4.2 补编码链、§5.3 补 `<项目>-dev` 命名与落点。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | provider 用 profile `.env`（`env_extra`）注入，不修改 live `config.yaml` | live 配置被 `.gitignore` 排除且含机器路径；仓内 env 可复现、可跨机同步 | 直接改仓内 per-profile config（否决：HEAD 已改为仅留 example，加回会引入路径/密钥风险） | 是 |
| D2 | cwd 顺序=显式 > 任务工作区 env > 默认 | kanban 派发已注入 `HERMES_KANBAN_WORKSPACE`；不跟随就会让引擎读写错目录 | 把绝对路径写进 config（否决：换机即失效，且换任务不跟随） | 是 |
| D3 | 技能先行：生成/加载 `<项目>-dev` → 编码 → 升级校验 | 用户描述的顺序是「加载技能后开发」；现状「编码后才生成」无法让本轮编码受技能约束 | 维持编码后生成（否决：与描述相反，技能只对下一轮生效） | 是 |
| D4 | 项目技能落 `<项目>/.claude/skills/<name>`，再软链到 `~/.zcode/skills/<name>`；不双写 `.hermes/skills` | `.claude/skills` 是 swarm-yuan 默认根，也是既有 `aistudio-dev` 布局；Ycode（zcode CLI）运行时只扫 `.zcode/skills`（源码测试实证），故以用户级软链建立单一产物；hermes 项目技能根只认 `.hermes/skills`，双写会制造第二真值 | 直接生成进项目 `.zcode/skills`（否决：多数项目未忽略该目录，会脏化工作区/被提交）；双写 `.hermes/skills`（否决：第二真值 + worktree 回收风险） | 是 |
| D5 | `HERMES_ACP_PROVIDER=zcode` 只加在 worker-coder | 编码职责在 worker-coder；全域改默认会改变 hack/ops/product 等 profile 的既有引擎路由 | 全 profile 改 zcode（否决：越过本次任务边界） | 是 |

## 验证

- 插件接线守门（Python）：22 副本哈希一致；含 `HERMES_ACP_PROVIDER` 与
  `HERMES_KANBAN_WORKSPACE` 解析；`acp_agents`/`acp_send` 均走统一解析。
  `python3 -m pytest team/tests/test_core_coding_chain.py -q` → 6/6 通过。
- worker 配置守门（Python）：profiles.yaml worker-coder `env_extra` 含 zcode；
  SOUL 标准循环中「项目 dev skill 准备」在 `acp_send` 之前、「升级」在其后。
- skillgov：`npx vitest run custom/server/skillgov` → 18/18；覆盖名称派生、
  字符集归一、默认落点 `.claude/skills`、`~/.zcode/skills` 软链幂等且不覆盖真目录。
- runtime 注册：`npx vitest run scripts/__tests__/register-runtime.test.ts` → 4/4；
  覆盖双目录幂等注册与错误配置拒绝。
- 插件函数探针（stdlib import）：provider 优先级 显式 > env > config、cwd 优先级
  显式 > 任务工作区 env > 默认，全部符合预期。
- Ycode 技能根依据：`upstream/zcode/apps/zcode-cli/packages/core/tests/skill-*.test.ts`
  以 `/workspace/.zcode/skills/<name>/SKILL.md` 为运行时路径；因此产物留在
  `.claude/skills`、用 `~/.zcode/skills` 软链进装载面。
- **live 生效面（未执行，需部署步）**：本批只改仓内源。宿主需把 `team/profiles/*`
  与 `team/shared/profiles.yaml` 同步到 `~/.hermes/profiles`、跑 `generate-configs.py`
  生成 worker-coder `.env`，并跑 `npm run runtime:register` 注册 `runtime/hermes-skills`。
- 未验证项：真实 ACP 编码回合（需在具备 `zcode-acp-server` + 项目工作区的宿主跑）；
  浏览器交互不涉及。

## 挂账（本轮不做）

- board→profile/员工归属绑定（第 4 段逻辑）与 A2A 跨用户互调（第 3 段逻辑）另批。
- 文档全量真相批（CLAUDE.md、旧路径、总账数字）按用户排序在其后。

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md —— §4.2 补编码链，§5.3 补项目技能命名与落点。
