# CLAUDE.md

<!-- 脱敏正本（2026-11-02）：源自家机 ~/.zcode/CLAUDE.md，本机卷路径泛化为「外置卷/外置盘」；
     其余逐字保留。密钥位置仅以路径提及（其红线本就要求不复述值）。 -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么目录

ZCode（z.ai 的 Claude Code 兼容 CLI）的用户级配置与状态目录。`~/.zcode` 是内置盘实体目录（2026-10-05 由外置盘软链迁移而来，外置盘上留有一份 10 月初的旧副本，不再使用）。不是代码仓库：无 git、无构建/测试系统。这里的开发工作是维护 AGENTS.md 规则、skills、hook 脚本和工具配置。

## 常用命令

```bash
bash scripts/model-peak-guard.sh status   # 查看 CCswitch failover 队列 + 磁盘水位状态
bash scripts/model-peak-guard.sh check    # SessionStart hook 入口：高峰期 + 超长会话(≥700 msg) + 磁盘水位三检查
bash scripts/model-peak-guard.sh disk-guard   # 手动跑一次磁盘水位守卫（launchd 也每 5 分钟自动跑）
bash scripts/model-peak-guard.sh disk-resume  # 手动恢复被水位门禁挂起的置顶任务进程
bash scripts/cc-usage-stats.sh [today|week|month|all]  # 按真实命中模型统计用量，默认 today
shellcheck scripts/<name>.sh              # 改 shell 脚本后自检
```

两个脚本的数据源都是外部 `~/.cc-switch/cc-switch.db`（CCswitch），不在本目录。peak/offpeak 由 `~/Library/LaunchAgents/com.zcode.model-peak-{on,off}.plist` 定时触发，脚本幂等，可重复执行。磁盘水位守卫由 `~/Library/LaunchAgents/com.zcode.disk-guard.plist` 每 5 分钟触发：监控卷必查 `/System/Volumes/Data`，外置卷仅在已挂载时纳入（2026-10-16 改条件式，防守卫反向依赖外置盘）；任一 <20GB 时告警（30 分钟冷却）并 SIGSTOP 挂起 running 置顶任务的 zcode-cli 进程树（含同 pgid 的 hermes gateway 等守护进程，cwd 不在 running workspace 的会话不受影响），水位回升 ≥24GB 自动 SIGCONT 恢复；状态文件 `scripts/.disk-guard-state.json`，阈值可用 `DISK_WARN_MB`/`DISK_RESUME_MB` 覆盖，`DRY_RUN=1` 只打印不发信号。三个 launchd 任务的日志统一写 `~/Library/Logs/zcode/`（原因见红线）。

## 架构：各目录怎么咬合

- **AGENTS.md**：用户级全局规则的唯一正本，ZCode 在每个 workspace 加载。内容为红线、worktree 并行工作流、验证门禁、文档自检清单。修改时：先留 `.bak`（目录里 `AGENTS.md.v2.1.bak` / `.v2.2.bak` 是既有惯例），末尾版本注释递增，跨仓正本需同步（见文件末尾注释里的路径）。
- **skills/**：约 80 个 skill，每个是 `skills/<name>/SKILL.md`（YAML frontmatter：name / description / triggers）加 `references/`。部分 skill（如 browse、graphify）带 src / test / bin，是可执行小程序，改动要当作项目对待，不是纯文档。
- **cli/config.json**：hook 与 skill 开关的总线。hook 体系与 Claude Code 兼容；SessionStart 上挂着两件事：`model-peak-guard.sh check` 和 IPWatch webhook（curl 到 127.0.0.1:8787）。注意 ZCode 不展开 AGENTS.md 里的 `@import`（验证结论记录在 `cli/plugins/rtk-zcode-bridge/README.md`），动态上下文只能靠 SessionStart hook 注入。
- **scripts/model-peak-guard.sh**：工作日 14:00-18:00 把 BigModel 移出 CCswitch 降级队列；并含磁盘水位门禁（disk-guard，2026-09-30 ncwk swarm 经 Matrix 消息风暴半小时写满系统盘后加设）。peak 幂等靠 `scripts/.peak-guard-state.json` 的存在性判断（存在即在高峰期）；disk-guard 幂等靠 `scripts/.disk-guard-state.json`（记录挂起 pid 集合与告警时间戳）。`TARGET_ID` 是硬编码的 provider UUID，CCswitch 里重建 provider 后会失效，需同步更新。
- **cli/plugins/**：`installed_plugins.json` 记录市场插件（ralph-loop、superpowers 等）；`rtk-zcode-bridge` 是本地插件，PreToolUse 把 Bash 命令透明改写为 `rtk` 前缀，fail-open。
- **v2/**：ZCode v2 桌面端配置（provider、bot、setting、日志、任务索引 sqlite）。
- **computer-use/**："ZCode Computer Use.app" 及其 dev 副本。

运行时状态不要手改：`cli/agents/sess_*`（会话数据）、`cli/log/zcode-YYYY-MM-DD.jsonl`（peak guard 解析它取 messageCount）、`v2/logs/`、`v2/tasks-index.sqlite*`。

## 红线（本目录特有）

- 密钥不落文档：`v2/provider_config.json`、`v2/credentials.json`、`cli/config.json`（含 IPWatch secret）里有真实 API key。排查或写文档时只引用路径，不要复述值。
- hook 输出 schema 严格：`check` 只能输出 `{"additionalContext":"..."}` 一个 key（用 jq 生成），多一个 key 都会校验失败。
- `cli/config.json` 的 JSON 转义风格是正斜杠加 `\/`，编辑时保持原样，改前按惯例留 `.bak`。
- launchd 任务的**任何路径**（ProgramArguments 脚本本体、StandardOutPath/StandardErrorPath）都必须放系统盘用户目录，不能指向 `~/.zcode` 软链或外置卷：launchd 打不开这类路径时 job 以 EX_CONFIG(78) 静默失败且日志全无。同类事故两次：9/3 18:47 `~/.zcode` 改软链后 peak/offpeak 因 stdout 重定向静默失效近一个月（2026-09-30 发现）；10-05 `.zcode` 迁回内置盘后，三个 plist 的 ProgramArguments 仍指外置盘旧路径，盘弹出期间 disk-guard 持续 `No such file or directory` 静默失效，且 launchd 每 5 分钟执行外置盘路径会把已弹出的物理在线卷反复戳回挂载态（2026-10-16 修复）。脚本内部 bash 读写外置卷没问题，launchd 自己触碰的路径不行。
- `v2/` 运行时状态目录不能是指向外置盘的软链：2026-10-08 曾把 v2/logs、v2/checkpoints 软链到外置盘重定位目录省内置空间，盘未挂载时主进程启动 `mkdir logs` 解析悬空软链直接 ENOENT 崩溃（2026-10-20 修复为本地目录；清理脚本第 5 段会自动把此类软链换成本地目录）。
- 家目录运行时/缓存目录（`~/.npm`、`~/.cache`、`~/Downloads`、`Library/Caches/*` 等）一律本地，禁止软链到外置盘：10-08 sysdisk-reloc 与 `~/bin/ensure-nvme2230-mount.sh` 谱系曾把 19 处此类路径指到外置盘并在登录时自动挂载+重建软链，任意应用都在写外置盘；写入者未清就弹出导致 2026-10-20 HFS+ 编目损坏（fsck exit 8）。`ensure-nvme2230-mount.sh` 是休眠地雷（plist 已 .disabled，但其 `else ln -s` 分支会把缺失缓存目录重新链向外置盘），勿再启用。弹出外置盘一律走 `~/bin/eject-nvme2230`（bootout modelsync → 杀持有者 → eject），清理脚本第 6 段会自动把此类软链换回本地目录。
