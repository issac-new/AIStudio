# SwarmStudio overlay — AI 工作入口

一句话：SwarmStudio 桌面应用（Electron + Koa + Vue 3）的二次开发仓；上游 `upstream/hermes-studio` 只读，所有改动经 `patches/` 与 `custom/` 在构建时注入（`npm run inject`）。

## 工作规则

1. 只改本仓；上游目录只允许 `git pull`。
2. 代码改动先写 `docs/superpowers/specs/YYYY-MM-DD-<slug>.md`，至少含「变更 / 决策记录 / 验证」三段；spec 是决策事实源，不是事后补记。
3. 分支 `feat|fix|refactor/<slug>`，从 `origin/main` 起；并行会话用 worktree；清理只走 `git worktree remove/prune`，禁止 `rm -rf`。
4. 提交前跑目标测试 `npx vitest run <path>`；合并前 `npm test`；新增服务端模块跑 `npm run typecheck:harness`。
5. 失败不隐瞒：测试红、步骤跳过、未验证项必须写进交付说明。
6. 安全纪律：审计不落敏感原值；密钥只存 env 名；不削弱既有安全边界。
7. 注释用中文，标识符用英文；注释只写约束与来源，不复述代码。

## 目录导航

| 路径 | 作用 |
|---|---|
| `custom/server/` | Koa 服务端扩展；域索引见 `custom/server/AGENTS.md` |
| `custom/client/` | Vue 客户端扩展；组件约定见 `custom/client/AGENTS.md` |
| `custom/qgate/` | 质量门禁框架（L0-L5 gate packs） |
| `patches/` | 上游注入补丁（编号 series）；改上游行为必须走这里 |
| `runtime/` | agent 运行时扩展（Python/TS 工具与检查器） |
| `scripts/` | inject / build / serve / verify 脚本 |
| `docs/superpowers/specs/` | 设计规格与决策记录（单一事实源） |
| `registries/` | 客户端/服务端路由与功能注册表 |

## 三条不变量

- **单一事实源**：契约、阈值、格式只定义一处；改一端必须同步消费者与守门测试。
- **fail-soft 不造假**：源缺席返回 `null` / `available:false`，不猜数；审计失败可见但不阻断业务。
- **执行层强制**：权限与沙箱不能只靠提示词，边界上的确定性检查优先。

## 输出格式

结论先行 → 改动清单（文件:行）→ 验证命令与结果 → 未做/未验证项。
