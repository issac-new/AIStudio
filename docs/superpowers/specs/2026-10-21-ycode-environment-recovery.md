# Ycode 环境恢复：补丁链 + 词条基线 + 引擎 + 工作区沙箱（spec）

日期：2026-10-21
分支：`main`（本轮直接修复环境；变更文件均在 overlay）
来源：`2026-10-21-swarmstudio-complete-design.md` §9.3 环境类缺口；上一轮 `npm run build` prebuild 失败与 IDE 自检 2 项失败的现场。

## 一、问题（四个断点）

1. **构建 prebuild 失败**：`ensure-injected` 在 zcode 树干净时重放 7 条 zcode 补丁，001 `server-cli-yazl-external` 与 v3.16.1 上游冲突（上游已原生把 `yazl` 列入 external），`npm run build` 直接断。
2. **catalog-check 崩栈**：本机 ZCode 已升到 **3.16.2**，脚本仍按 3.14.0 的 `p={...}` 变量名找中文目录；3.16.2 中文目录是 `m={...}`，英文才是 `p`，脚本抛「上游内嵌结构已变化」。
3. **引擎未运行**：`:3030` 无监听，IDE 工作流/引擎模型等能力只能走 503 告警。
4. **IDE 自检 2 项失败**：
   - files/list 对 `~/.hermes-web-ui/coding-agent/workspace/default/global` 返回 400「outside the hermes base sandbox」，且请求前 `await primeTaskWorkspaceCache()` 跑 hermes CLI 约 12–14s，贴着自检 15s 超时线；
   - Git status 对同一工作区返回 404 `not_a_repo`，自检把 404 当硬失败（非 Git 工作区本是合法状态）。

## 二、变更

### 1. zcode 补丁链（沿用并行轮已落修正，本轮验证并收编）

- `zcode-patches/series`：001 退役（上游已吸收，补丁文件留档不登记）；002 恢复登记；003-007 保留。基线注明 `origin/main @ 0a1fc56 (v3.16.1)`。
- `zcode-patches/002-import-session-rpc.patch`、`006-zcode-cua-plugin-bundled.patch` 按 v3.16.1 上下文适配。
- `ensure-injected` 现在 zcode 树脏（补丁已应用）→ 跳过重放；`npm run build` prebuild 恢复。

### 2. catalog-check 版本自适应

`scripts/zcode-catalog-check.mjs`：

- 提取方式从「固定变量名 `p=`」改为「锚点前 1MB 窗口扫描所有 `标识符={` 候选，解析后取包含锚点键且值为中文的最大对象」——不再依赖 minified 变量名。
- 快照目录按安装版本命名：`docs/superpowers/notes/zcode-<version 去点>/`；本机 3.16.2 → `zcode-3162`。
- 新增 `--refresh`：按本机版本重建 `zh-CN-keys.txt`、`ns-counts.json`、`baseline.json`。
- 无对应版本快照时给出明确指令，不再拿旧基线误报或崩栈。
- 新增 `docs/superpowers/notes/zcode-3162/`（3.16.2，6985 键 / 101 命名空间）。

### 3. coding-agent 工作区放行 + 跳过 CLI 预热

- `custom/server/services/hermes/task-workspace-cache.ts`：新增 `isWithinCodingAgentWorkspace`（`<webuiHome>/coding-agent/workspace/` 段边界），并纳入 `isWithinKnownTaskWorkspace` 的静态放行。
- `patches/123-server-files-root-task-workspace-allowlist.patch`：files/download 的预热门前加 `!isWithinKnownTaskWorkspace(candidate)`——coding-agent 静态路径不再等待 hermes CLI 刷新；任务 workspace 仍按原语义预热。
- 不启用启动即预热（会与 kanban 任务查询争用，实测导致 IDE 幽灵任务深链抽屉无法按时收起）。

### 4. 自检判定修正

`custom/client/ide/utils/selfCheck.ts`：

- `api()` 支持 `warnStatuses`；Git 探针把 404 计入 warn，并用本地化 `notRepo` 文案替换原始 HTTP 串。
- 非 Git 工作区是合法状态，不再计为产品硬失败。

### 5. 引擎运行

- `npm run zcode:ensure` 通过（依赖与 `packages/server/dist/entry-http.js` 就绪）。
- `npm run zcode:serve` 拉起引擎，`:3030` 监听（WS 通道）。

## 三、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 001 补丁退役而非强行适配 | 上游 `tsup.config.ts` 已原生把 `yazl` 列入 external 并附原因注释，补丁语义被吸收；继续应用只会在每次升级时冲突 |
| D2 | catalog 提取按内容（中文锚点值）而非变量名 | 3.16.2 中文目录变量从 `p` 变为 `m`；minified 变量名不是稳定契约，内容锚点才是 |
| D3 | 快照按安装版本分目录 + `--refresh` | 版本升级必然漂移；固定 3.14.0 基线会让守门永远红。刷新模式把「升级后重建基线」变成一条命令 |
| D4 | coding-agent 工作区按 app 管理目录放行，限 `/coding-agent/workspace/` 段边界 | files 沙箱基底是 `~/.hermes`，而 IDE coding 工作区在 `~/.hermes-web-ui`；该目录由 WebUI 自建自管，与任务 workspace 同级放行，不放行 webui home 其他目录 |
| D5 | 静态可判路径跳过 CLI 预热，不做启动预热 | 预热本为任务 workspace 冷启动兜底；coding-agent 已静态放行。启动预热会周期性跑 hermes CLI，与 kanban 查询争用（实测幽灵任务抽屉 8s 内收不起） |
| D6 | Git 404 记 warn | 非 Git 工作区是合法草稿态；自检应诚实提示「面板显示 not_a_repo」而不是判产品失败 |
| D7 | 引擎源码仍钉 v3.16.1，桌面词条基线跟 3.16.2 | 引擎 pin 在既有设计（`zcode-foundation-design.md` D1）；桌面 App 已 3.16.2，词条对照以实际安装为准。引擎升级另立轮 |

## 四、验证

- `npm run catalog-check`：**OK 3.16.2，6985 键 / 101 命名空间**。
- `npm run zcode:ensure`：依赖与构建产物已就绪；`:3030` LISTEN（`node packages/server/dist/entry-http.js`）。
- files API（coding-agent 工作区，冷启动）：**HTTP 200 / 19ms**（修复前 400 / 12–14s）。
- IDE smoke：**11/11 PASS**（含幽灵任务深链 `drawer=0`、自检弹层 `13 通过 · 2 告警 · 0 失败`、无页面错误）。
- IDE 自检：**13 通过 / 2 告警 / 0 失败**；告警=非 Git 工作区、资源管理器扫描超预算（既有诚实告警）。
- `npm run build`：prebuild 通过，vite 构建 **20.62s**，`verify-dist` OK（口令扫描零命中）。
- 定向测试：`task-workspace-cache.test.ts` 3/3 + `self-check.test.ts` 7/7。

## 五、未做 / 挂账

- ZCode 桌面 3.16.2 与引擎源码 v3.16.1 的版本差：引擎升级另立轮，不在本轮强推。
- 非 Git 草稿工作区仍显示 warn（设计选择，不隐藏）。
- 资源管理器扫描超预算 warn 为既有环境态。
- 后端重启日志出现一次 `kanban-overview.ts:399 handleUpgrade` 未处理拒绝（重启竞态，未影响 smoke/自检）；登记待后续排查。
