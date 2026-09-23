# R1 实施计划——zcode 底座可运行性实证

spec：`specs/2026-09-23-zcode-foundation-design.md` §4 R1。目标：一个真实编码回合经 zcode 引擎完成。

## 步骤

1. **依赖安装**：`cd upstream/zcode && pnpm install`（Node v24.21.0 ✓ pnpm 10.33.2 ✓ engines 满足；Electron 走 npmmirror 镜像）。产物在后台跑，日志落 `/tmp/zcode-build/install.log`。
2. **构建**：`pnpm run build`（turbo 全仓）或最小面 `pnpm --filter @zcode/server build` + `--filter @zcode/zcode-server-cli build`（若 server 依赖未构建的 workspace 包则回退全仓）。
3. **起引擎服务**：`node packages/zcode-server-cli/dist/…` 或 `pnpm --filter @zcode/server dev`（entry-http，:3030）。验 `curl :3030` 握手。
4. **认证前提**：`zcode login`（zai/bigmodel）或既有 `~/.zcode/v2/credentials.json`；本机 `~/.zcode/` 已有 v2/ 目录，先探后登。
5. **真实回合实证**：优先无头 CLI 最小闭环 `zcode -p "…" --output-format stream-json --cwd /tmp/zcode-r1-probe`，采 NDJSON 事件流（session.created→turn.started→tool.updated→result 行）；再起 server 走 WS `IZCodeAgentService.createSession + sendPrompt` 同样跑一回合。
6. **证据落盘**：`evidence/20260923-zcode-r1/`（事件流原文 + 命令 + 截图/输出）。

## 验收硬标准

- [ ] 构建零错（或记录豁免项）
- [ ] 无头 CLI 一回合：事件流含 turn.started/tool.updated 或 message 流 + result 行
- [ ] server 通道一回合：createSession + sendPrompt 产出可订阅事件
- [ ] 认证路径记录（login 产物位置）

## 已知风险

- pnpm install 体量大（125M 仓 + Electron 下载），首次可能 5-15 分钟。
- turbo 全仓 build 含 desktop（Electron 打包重）；优先 server/cli 最小面。
- 未登录时模型请求阶段才失败（无前置 gate）——先探 credentials。
