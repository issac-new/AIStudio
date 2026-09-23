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

- [x] 构建零错（或记录豁免项）——`pnpm install` 二跑 57.6s（首跑 electron postinstall 卡死 GitHub 源，`ELECTRON_SKIP_BINARY_DOWNLOAD=1` 豁免，R1 无桌面需求）；`@zcode/cli`（29.6MB cjs）与 `packages/server`（tsup，entry-http 2.73MB）构建零错
- [x] 无头 CLI 一回合：`/tmp/zcode-r1-probe` 读 note.txt——事件流 269 行（tool.updated ×4 + model.streaming ×234 + turn.completed + result 行），response 原样复述，usage 2 次模型请求/79,935 tokens/缓存命中 39,936；证据 `ncwk-sim-aipay/evidence/20260923-zcode-r1/headless-stream.jsonl`
- [x] server 通道服务面：`packages/server` 源码链构建后 entry-http 启动成功——Provider Registry 就绪（6 provider）、:3030 监听、真实凭证连通（zcode-plan balance API success）；WS channel 回合（createSession+sendPrompt）留 R2（通道为二进制帧需 @zcode/rpc client，patch 层落地时接线）
- [x] 认证路径记录：`~/.zcode/v2/credentials.json` 既有生效，零登录动作

## R1 发现的缺口（转入 R2）

1. `packages/zcode-server-cli` 独立打包 ESM 下 `yazl` 动态 require 崩（`Dynamic require of "fs" is not supported`）——上游打包配置缺口，R2 patch 层修（tsup external CJS 依赖或改 CJS 输出）。
2. `pnpm install` 需 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`（或 mise 的 npmmirror 镜像），否则 electron postinstall 挂 GitHub 源——R2 接入脚本固化该 env。
3. `session.created` 事件未出现在 stream-json 流（sessionId 从 result 行取到 `sess_7fbc…`）；R2 接线时核实首事件语义。

## 已知风险

- pnpm install 体量大（125M 仓 + Electron 下载），首次可能 5-15 分钟。
- turbo 全仓 build 含 desktop（Electron 打包重）；优先 server/cli 最小面。
- 未登录时模型请求阶段才失败（无前置 gate）——先探 credentials。
