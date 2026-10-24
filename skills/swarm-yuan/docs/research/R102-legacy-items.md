# R102 遗留项收尾轮（2026-10-09，v2.65.0）

> 触发：完成 R101 留档三项后续——①生成物 hooks.json 扁平形态在 Claude Code 是否被静默丢弃（活体验证）；②5 宿主 hook 能力复核（2026-07 基线后）；③软链部署 self-check 环境性误报根治。外加清理已合并残留分支。

## 一、遗留①：Claude Code 扁平 hooks.json 被静默丢弃——坐实为真 bug，已修

活体实证（claude CLI 2.1.295，skills-dir 插件探针 + 无头会话，2026-10-09）三步对照：

| 形态 | hooks.json | 结果 |
|---|---|---|
| 扁平 `{"matcher": M, "command": C}` | 探针 deny JSON | **未拦**：Write 照常落盘（hook 疑似未加载） |
| 嵌套 `{"matcher": M, "hooks": [{"type": "command", ...}]}` | 同一 deny JSON | **真实阻断**：文件未创建，reason 经「PreToolUse hook error」透传 |
| 嵌套 + 无害命令（对照） | `true` | 放行——归因锁死：拦截来自 deny JSON 而非 hook 存在本身 |

结论：生成物 hooks/hooks.json 原扁平形态被 Claude Code 静默丢弃，deep 集成的 L1 写时拦截（fail-gate-hook deny）在宿主层长期未生效——与 Codex 回归 #23、ZCode 实证②同型的第三例（schema 静默丢字段/丢条目族）。修复：generate-skill.sh 模板改嵌套形态（五事件 10 条目命令串逐字保留），test-r102 ①机器锁防回退（模板提取 JSON 解析断言全嵌套 + 扁平模式 grep 反断言 + zcode/codex 适配器同形态锁）。

## 二、遗留②：五宿主 hook 能力复核——基线判定全部过时，通道在册

复核结论（官方文档/官方仓库锚点，WebSearch 后端空转改直接抓取官方源；两个关键锚点主会话独立复核）：

| 宿主 | 2026-10 实测 | 事件/阻断/配置 | 变化性质 | 证据 |
|---|---|---|---|---|
| Cursor | 有，可阻断 | `preToolUse`；permission deny / exit 2 / failClosed；`~/.cursor/hooks.json` 与项目 `.cursor/hooks.json` | 基线漏判（Hooks beta 2025-09 含 blocking，PreToolUse 2026-01 起） | [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)（主会话独立复核）；changelog 1.7/2.4 |
| Windsurf（=Devin 产品线） | CLI 面有，可阻断；桌面端仅 advisory | `PreToolUse`；decision block / exit 2 / updatedInput；`.devin/hooks.v1.json`（兼容 .claude/settings.json） | 基线部分漏判（2026-04 起）+ 产品形态变化（docs 并入 Devin，CLI 更名 devin，Cascade 标 legacy） | [docs.devin.ai/cli/extensibility/hooks/overview.md](https://docs.devin.ai/cli/extensibility/hooks/overview.md)、changelog stable |
| OpenCode | 有，可阻断 | `tool.execute.before`（throw 即中止，可改写入参）；`.opencode/plugins/` + `opencode.json` | 基线漏判（2025 年即存在） | [opencode.ai/docs/plugins/](https://opencode.ai/docs/plugins/) |
| Gemini CLI | 有，可阻断 | `BeforeTool`；decision deny（alias block，reason 必填）/ exit 2 / tool_input 改写；`settings.json` hooks 段（项目/用户/系统/扩展四层） | 基线漏判（v0.21.0 2025-12 发布） | [geminicli.com/docs/hooks/](https://geminicli.com/docs/hooks/)、[reference](https://geminicli.com/docs/hooks/reference/)、PR #9108/#14307 |
| Kimi | 旧 kimi-cli 归档停维（2026-09-23）；接任 kimi-code 有，可阻断 | `PreToolUse`；exit 2 / permissionDecision deny（fail-open）；`~/.kimi-code/config.toml` `[[hooks]]` | **基线后产品更替**（kimi-code 2026-05-26 首发） | [kimi-code hooks](https://moonshotai.github.io/kimi-code/en/customization/hooks.html)（主会话独立复核）、[kimi-code config](https://moonshotai.github.io/kimi-code/en/configuration/config-files)、[kimi-cli 归档公告](https://github.com/MoonshotAI/kimi-cli) |

统一语义：四家协议已趋同 Claude Code 风格（PreToolUse + matcher 正则 + exit 2 + JSON deny + 默认 fail-open），一套「deny 优先 + exit 2」渲染模板可覆盖，仅配置载体不同（cursor hooks.json / .devin/hooks.v1.json / opencode 插件 / gemini settings.json hooks 段 / kimi-code config.toml）。共同注意点：四家默认 fail-open，作强制门禁须与 L2/L3/L4 并用（cursor 可配 failClosed）。

本轮动作：能力基线更正（common.sh 能力表注记 + 降级线措辞「无写时拦截」→「本生成链未接写时拦截」+ facts.conf FACT_SPEC_WRITE_HOOK_HOSTS 注记 + README/SKILL.md/两处代码注释同步）——原「无 hook 宿主」表述失实，按复核结果改为「L1 未接线宿主（hook 通道在册）」。**接线不做**：本机仅 opencode CLI 可用，其余四家无法活体实证（扁平 hooks.json 教训：未实证的接线=静默失效风险），接线独立轮登记于 §五。

## 三、遗留③：软链部署 self-check 误报根治

双修（81 框架 fixture 全矩阵 81/0 + 软链布局复现转绿）：

1. **dotnet csproj 兜底改双通道**（framework-gates/dotnet.sh）：原 `find .`（cwd 相对）两坑——precheck 启动 cd PROJECT_DIR 后 fixture 语料越界命中他语料 csproj、软链部署 find 不下钻符号链接致兜底失明。改「源目录上溯至 PROJECT_DIR 查 *.csproj（覆盖 csproj 在 .cs 祖先目录的标准布局）+ 源目录子树 find（排除口径不变）」，语义收紧到「与扫描源同工程」，越界与失明同时消除。violating 侧无 csproj 仍告警（隔离锁 test-r102 ②2c）。
2. **CI 三档对账分支三分**（self-check.sh check_bootstrap_gate）：缺 ci.yml 时——生成器仓布局（父目录有 verifier/）保留 warn+FAIL；部署副本布局改 ⊘ SKIPPED 披露不计 FAIL（对齐「跳过≠警告」口径）。根因侧：install.sh 分发边界补排除 ci/（G4 的「安装态无 ci/ 静默跳过」假设因未排除而失效）——ci/ 是仓库 CI 自举配置，不入安装产物。

验证链：软链布局（链名 swarm-yuan，与真实部署同构）dotnet 双态通过 + verify-framework-ruleset 通过；test-r102 ②③行为锁（抽函数三分支断言）。

## 四、顺带

- 清理已合并残留本地分支 feat/r97-runtime-refresh、feat/r99-runtime-refresh（git branch -d 安全删除，均已入 main）。

## 五、留待后续

- **五宿主 L1 接线轮**（本轮复核的直接产出）：按 §二 统一语义渲染五宿主 hooks 配置（cursor hooks.json / .devin/hooks.v1.json / opencode 插件 / gemini settings.json hooks / kimi-code config.toml `[[hooks]]`），每家以本机 CLI 活体实证为准（先装 CLI 再接，未实证不宣称——扁平 hooks.json 三例教训）；接线后 TA_WRITE_HOOK_* 与 FACT_SPEC_WRITE_HOOK_HOSTS 同步 3→8。【已销项：R103 完成渲染全量（spec-first-bridge 统一 exit 2 协议 + 五家 schema 渲染器）；活体实证受阻面如实记录（五家 CLI/凭据不可得，见 R103 §三），宣称面按 rendered 态收窄，FACT 新增 HOST_HOOKS_RENDERED=5；deny 实证留 R103 §六】
- **Kimi 安装目标对象更替**：install.sh 的 kimi 检测/安装面向已归档的 kimi-cli（~/.kimi）；接任 kimi-code 的安装/规则位（~/.kimi-code/config.toml）与产物布局待接线轮一并处理。【已销项：R103 install.sh 改 ~/.kimi-code/skills 优先（legacy 回退 ~/.kimi），kimi 适配器 hooks 入 config.toml [[hooks]]，ta_is_user_level +kimi-code】
- Windsurf/Devin 双面（桌面端 Cascade 插件 hook 仅 advisory）：接线轮按 Devin CLI 面渲染，桌面面维持诚实降级线。【已销项：R103 渲染 .devin/hooks.v1.json（CLI 面），安全线明注桌面端 Cascade 仅 advisory】

## 六、验证

run-sweep 全量、81 框架 fixture 矩阵、软链布局复现、test-r102 新锁、部署刷新与 diff 对账：见 CHANGELOG v2.65.0 与收口记录。
