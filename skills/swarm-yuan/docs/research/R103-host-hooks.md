# R103 五宿主 hooks 整合轮（2026-10-09，v2.66.0）

> 触发：完成 R102 §五登记的三项——①五宿主 L1 写时拦截整合（cursor/devin/opencode/gemini/kimi-code）；②Kimi 安装目标从已归档 kimi-cli 更替为 kimi-code；③Windsurf/Devin 双面处理。纪律前提（R102 定）：先装 CLI、活体实证才宣称。

## 一、架构：spec-first-bridge 多宿主桥（exit 2 统一阻断协议）

五宿主协议趋同点（官方文档锚定）：**exit 2 + stderr 原因 = 阻断**（Cursor「Exit code 2 - Block the action」/Gemini「exit code 2 Critical Block」/Devin「exit code 2 阻断」/kimi-code「exit 2 Intentional block」），OpenCode 以 tool.execute.before 抛错阻断。桥 `assets/hooks/spec-first-bridge.sh`：

1. **归一化**：宽松键提取各宿主 payload（tool 取 tool_name/toolName/tool/name；入参取 tool_input/toolInput/tool_args/toolArgs/input/args/params 兼顶层平铺）→ 工具名统一映射（Shell|run_shell_command|exec|bash→Bash；write|write_file→Write；edit|replace→Edit）→ 构造 Claude 形态 payload。
2. **判定**：喂 fail-gate-hook.sh（判据单一事实源，spec-first-lib spf_*），零改造复用。
3. **协议翻译**：deny（hookSpecificOutput.permissionDecision）→ 提取 reason → stderr + exit 2；放行 exit 0 静默。缺库/缺 conf/解析失败一律放行（fail-open，与 fail-gate-hook 同失败哲学）。

活体验证受阻面如实记录（§三）下的诚实定位：桥与判定链由 test-r103 ①矩阵锁（五家 payload 形态 × 拦/放/修好放行/fail-open 六类），宿主侧 schema 由官方文档锚 + 渲染器格式锁；**deny 在真实宿主运行时未实证**——宣称面按能力表 rendered 态收窄（「未实证不宣称」），强制面以 L2/L3/L4 为准。

## 二、五宿主渲染器（各按官方 schema，勿与 Claude 嵌套形混用）

| 宿主 | 载体 | schema 要点 | 证据（访问 2026-10-09） |
|---|---|---|---|
| Cursor | `<proj>/.cursor/hooks.json`（用户级 ~/.cursor/hooks.json） | 顶层 `{"version":1,"hooks":{...}}`；条目**扁平**（command/matcher/type/timeout 于条目层）；preToolUse | [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks) |
| Gemini | `<proj>/.gemini/settings.json` hooks 段 | 条目**嵌套** `{"matcher","sequential","hooks":[{type,command,timeout 毫秒}]}`；BeforeTool；matcher=工具名正则 | [geminicli.com/docs/hooks/reference/](https://geminicli.com/docs/hooks/reference/) |
| Windsurf=Devin CLI | `<proj>/.devin/hooks.v1.json` | **hooks 对象即整文件（无外层键）**；条目 Claude 嵌套形；PreToolUse；matcher=write\|edit\|exec | [docs.devin.ai/cli/extensibility/hooks/overview.md](https://docs.devin.ai/cli/extensibility/hooks/overview.md) |
| OpenCode | `<proj>/.opencode/plugins/swarm-yuan-spec-first.js`（用户级 ~/.config/opencode/plugins/） | 本地插件自动加载；`tool.execute.before` 抛错即中止；JS 模板调桥（--tool/--path/--cmd/--cwd 显式参数） | [opencode.ai/docs/plugins/](https://opencode.ai/docs/plugins/) |
| kimi-code | `~/.kimi-code/config.toml` [[hooks]]（TOML 注释标记块） | `event/matcher/command/timeout` 四字段表数组；hook 规则全部在 config.toml | [kimi-code config-files](https://moonshotai.github.io/kimi-code/en/configuration/config-files) |

JSON 三家（cursor/gemini/devin）一律**幂等合并**（ta_merge_json_hook：结构键缺则建、判别子串防重、原子写）——用户既有 hooks/settings 配置保全（test-r103 ②断言）；kimi 用 TOML 注释标记块（ta_upsert_marker_block 风格参数扩展 html|toml）；opencode 插件独立文件名零冲突。

## 三、活体实证受阻面（如实记录）

| 宿主 | CLI | 凭据 | 受阻原因 |
|---|---|---|---|
| Cursor | 未装 | 无 | 需 Cursor 账号 OAuth（桌面登录），无人值守不可得 |
| Devin | 未装 | 无 | 需 Devin 账号 OAuth |
| OpenCode | 1.16.2 在机 | auth.json **0 credentials** | 无模型凭据，无头会话起不来 |
| Gemini | 0.63.0 在机 | 无（settings.json 无 Auth；jetski token 属他产品） | 需 GEMINI_API_KEY 或 Google OAuth |
| kimi-code | **CLI 不在机**（桌面应用卸载留 ~/.kimi-code 数据） | oauth/kimi-code **空文件**（token 2026-10-04 过期，refresh_token 在 credentials/） | 无 CLI 二进制可跑 |

调查中两个值得记录的发现：**npm 包 `kimi-code` 是冒名代理包**（"Start anthropic-proxy with Kimi model and run claude-code"、Groq API key——非 Moonshot 官方 CLI；本轮安装验证后已卸载清理，防 `kimi` 命令被冒名占用）；真实 kimi-code 是桌面应用形态（~/Library/Application Support/kimi-code-app，Electron 壳），其数据目录 migration-report.json 载明 2026-07-20 完成 ~/.kimi→~/.kimi-code 配置迁移——产品更替在本机既有实证。

## 四、Kimi 安装目标更替 + Windsurf 双面

- install.sh：kimi 检测/安装改为 **~/.kimi-code/skills 优先**（kimi-code 的 merge_all_available_skills + AGENTS.md 加载为其指令面，config-files 页 watch 列表实证），~/.kimi/skills 为旧 kimi-cli 的 legacy 回退；ta_is_user_level +$HOME/.kimi-code。
- Windsurf 双面：渲染器只写 **Devin CLI 面**（.devin/hooks.v1.json）；桌面端 Cascade 插件 hook 官方明示 best-effort（无阻断），安全线明注「桌面端 Cascade 仅 advisory」——不假装桌面面拦得住。

## 五、验证

- test-r103-host-hooks：①桥矩阵 9 断言（五家 payload/显式参数/拦截/放行/修好放行/fail-open）②渲染器 schema 锁 14 断言（含扁平 vs 嵌套 vs bare 三形分辨、幂等、用户配置保全、JS 模板转义）③三态安全线 8 断言 ④kimi 更替 3 断言 ⑤随发登记 2 断言。
- run-sweep 全量、81 框架 fixture、test-r101 断言串同步、test-r68 受控语言、部署刷新与 diff 对账：见 CHANGELOG v2.66.0 与收口记录。

## 六、留待后续

- **五宿主 deny 活体实证**：凭据/CLI 可得后逐家跑通（探针范式照 R102 §一三步对照）；实证一家把能力表该家 rendered→hook、FACT 计数 3→N 渐进上调。npm 冒名包教训：kimi-code CLI 只认官方发布渠道（GitHub Releases/官网），装前核对包归属。
- OpenCode 插件的 `$` shell API 细节（.quiet().nothrow() 链）按 Bun shell 惯例书写、未活体跑过——实证轮一并核。
