# 全局工作区规则

## 修改范围限制

**仅允许修改 `overlay/` 项目目录下的代码。**

**严格禁止修改 `upstream/` 目录下的任何文件。** 该目录仅可用于：
- 同步拉取远端 GitHub 仓库代码（`git pull`）
- 更新本地仓库至最新稳定版

任何需要变更 upstream 代码的功能，必须通过 `overlay/patches/` 中的 patch 文件实现，经由 `npm run inject` 在构建时注入。

## 分支管理

**所有开发任务必须在 `overlay/` 仓库中基于 `main` 创建独立的 feature 分支：**

```bash
cd overlay
git checkout main
git pull origin main  # 如有 remote
git checkout -b feat/<feature-name>
```

**任务开发完成、测试验证通过后，自动合入 `main`：**

```bash
git checkout main
git merge feat/<feature-name>
```

分支命名规范：`feat/<描述>` / `fix/<描述>` / `refactor/<描述>`

## worktree 清理硬规则（2026-10-17 双删事故立法，同源 `~/.zcode/AGENTS.md` §2.3）

本工作区常有多会话并行，凡动 `.claude/worktrees/` 一律守三条：

1. **清理只走 git 通道**：正常收口 `git worktree remove`；目录已失联 `git worktree prune` 清注册。**禁止 `rm -rf` worktree 目录**——裸删留残注册，且会把该目录当工作目录的其他会话 shell 直接击穿（报 `spawn ENOENT`，2026-10-17 实录）。
2. **IN-FLIGHT 在途保护**：worktree 根有 `IN-FLIGHT` 文件且 `created` 距今 <24h=别的会话在途，不得清理；创建自己的 worktree 后也应立即写该标记（`printf 'session=<标识>\ncreated=%s\n' "$(date -Iseconds)" > IN-FLIGHT`）。
3. **「看着过期」不是清理依据**：不确定归属就先看 IN-FLIGHT 与分支提交时间；无注册的孤儿目录禁 `rm -rf`，移入 `.claude/worktrees/.quarantine/` 或报用户。

## 验证方式：一律浏览器 web 版，不做安装包

**UI/前端/产品改动的验证与交付走浏览器 web 版链路，不做 dmg/zip 安装包、不装机**（用户 2026-10-22 指示：「后续不要安装包了，使用浏览器web版」）：

```bash
cd overlay
npm run dev        # vite dev，8649 端口，后端走 8647 代理
```

然后用内置浏览器打开 `http://localhost:8649` 走查改动点，代码改动即时热更新。

**即使后续出现「装机/出包/重新安装本机软件」类措辞（含自动化目标词），也按本节执行 web 版验证，不构建安装包。**

例外说明：改动涉及 Electron 主进程、IPC、原生模块等纯浏览器无法复现的行为时，如实说明浏览器验证的局限，等待用户明确指示；不得以「浏览器验不了」为由自行出包装机。

## 项目结构

- `overlay/` — 二次开发代码仓库（patch、custom 组件、store、配置）。所有开发在此进行，通过 `npm run inject` 将 patch 注入 upstream
- `upstream/` — 上游原始项目（只读，禁止直接修改）：
  - `upstream/hermes-studio/` — SwarmStudio 桌面应用主体（hermes-studio **v0.7.37**，2026-10-19 升级轮同步：378 补丁全适配（19 再生+653/659 归档）+inject/vue-tsc/build:full/零新增回归文件，双端换装探活绿；v1.0.x 为杂项 tag 非发布线，稳定线=0.7.x）
  - `upstream/element-web/` — Element Web Matrix 客户端参考实现（**v1.12.32**，2026-10-19 实核即最新稳定（1.12.33 仅 rc））
  - `upstream/hermes-agent/` — Hermes AI Agent 运行时（**v0.22.4**，2026-10-22 升级轮自 v0.22.2 适配 72 补丁中 12 个手工移植全绿；宿主安装树同步 v0.22.4+镜像 44 文件；runaway 快照提交保护于 local/runaway-series 分支）
  - `upstream/fibo/` — EDM Council 金融行业业务本体 FIBO（软链 NVMe 归档盘；2026-10-21 克隆，master@2d73435a，最新季度 tag=master_2026Q3；领域目录 BE/FBC/FND/SEC/IND/LOAN/DER/MD 等 + AboutFIBO*.rdf 入口文件）
  - 其余参照仓（claude-code/codex/dsh-TUI/deepseek-harness/minimax-code/kimi-code/multica/routa/zcode）为 Swarm-yuan research 与 armada 血统的参考源
  - 仅可执行 `git pull` 同步远端最新代码
- `simharness/` — 推演 harness 独立仓（2026-10-03 分树隔离轮自 overlay/scripts/aipay 拆出；mx-* 全流程脚本/场景/报告生成器/守门测试）。overlay 对它只读消费；推演执行面快照与运行时落 `ncwk-sim-mux/`（SIM_ROOT），不写宿主 `~/.hermes/hermes-agent`。全流程推演唯一正本=`overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`（终态五部分；隔离边界与运维规范、历史沿革与违例先例见同目录《2026-10-05-mux-history-and-engineering-archive.md》档案件）
- `docs/superpowers/` — 设计文档 (specs) 和实施计划 (plans)
