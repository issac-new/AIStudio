# 环境变量清单（离线安装包 2026-11-02）

两类变量：**A. `~/.hermes/.env`**（agent/studio 运行时读取，模板见 `dot-env.example`）与 **B. 进程环境变量**（启动命令或系统环境里设置）。锚点口径：`实测`＝源码定位到的消费点；`目录级`＝消费面在某模块内、未逐行定位（不编造行号）。

## A. ~/.hermes/.env（24 键，家机实测口径）

| 变量 | 用途 | 消费点 |
|---|---|---|
| API_SERVER_ENABLED | agent API 网关（默认 8650）开关 | agent 树 `gateway/`（目录级） |
| API_SERVER_KEY | 上述网关的鉴权 key；studio 后端读同一值做代理 | 实测：`custom/server/runtimecaps/runtime-caps-controller.ts:120`（读 `~/.hermes/.env`＋config.yaml 端口，代理 `127.0.0.1:8650`） |
| HERMES_GATEWAY_TOKEN | agent 网关接入令牌（直连房间/矩阵通道） | agent 树 `gateway/`（目录级） |
| BAILIAN_API_KEY / DASHSCOPE_API_KEY / QWEN_PORTAL_API_KEY | 模型 provider 凭证（百炼/通义/问答门户） | agent 树 `providers/`（目录级） |
| CHERRY_DEEPSEEK/ LMSTUDIO/ MODELSCOPE/ OLLAMA_API_KEY | cc-switch 多 provider 档的 key 组（本地端点可空） | agent 树 `providers/`＋cc-switch 配置（目录级） |
| AGENT_BROWSER_EXECUTABLE_PATH | agent 浏览器工具的浏览器路径 | agent 树 `tools/`（目录级） |
| BROWSERBASE_PROXIES / BROWSERBASE_ADVANCED_STEALTH / BROWSER_SESSION_TIMEOUT / BROWSER_INACTIVITY_TIMEOUT | BrowserBase 云浏览器会话参数（离线机用不到） | agent 树 `tools/`（目录级） |
| TERMINAL_TIMEOUT / TERMINAL_LIFETIME_SECONDS / TERMINAL_MODAL_IMAGE | 终端工具超时/存活/图片显示行为 | agent 树终端工具族（目录级） |
| HERMES_LOCAL_STT_COMMAND | 本地语音转文字命令 | agent 树语音工具（目录级） |
| MESSAGING_CWD | messaging 工具工作目录 | agent 树 messaging（目录级） |
| IMAGE_TOOLS_DEBUG / VISION_TOOLS_DEBUG / WEB_TOOLS_DEBUG / MOA_TOOLS_DEBUG | 工具族调试日志开关 | agent 树对应工具族（目录级） |

## B. 进程环境变量（按需设置）

| 变量 | 用途 | 消费点 |
|---|---|---|
| OVERLAY_UPSTREAM_ROOT | 上游树根（缺省解析序：env ＞ 仓内 `vendor/` ＞ 旧 `../upstream`）；离线包内已带 vendor，一般不用设 | 实测：`scripts/build.mjs:14-20`、`scripts/zcode-engine.mjs:22-26` |
| ZCODE_BIN | zcode 引擎 CLI 路径（ACP 桥 spawn 用）；安装脚本 S5 已部署到 `~\.hermes\ycode\zcode.cjs` | 实测：`scripts/zcode-engine.mjs:99-101`（桥按 `[node, ZCODE_BIN, 'app-server', '--stdio']` 消费） |
| HERMES_BIN | hermes CLI 覆盖（studio 子进程调用 agent CLI 时用）；**Windows 离线机建议 `setx HERMES_BIN %USERPROFILE%\.hermes\hermes-agent\venv.py314\Scripts\hermes.exe`**（缺省裸名 `hermes` 走 PATH，venv 不在 PATH 时找不到） | 实测：`custom/server/runtime/hermes-invocation.ts:29-42`（win32 走 hermes.exe/hermes.cmd 通道） |
| NPM_CONFIG_REGISTRY / PIP_INDEX_URL 等 | npm/pip 镜像——**目标机已配好，安装脚本不碰**（D3） | 目标机环境（用户侧管理） |

## 相关但随包/目标机自管的配置

- `~/.hermes/config.yaml`：结构模板见 `config.example.yaml`（源自仓内 `team/config.yaml` 脱敏正本，model/provider 段按目标机改）。
- `%USERPROFILE%\.zcode\AGENTS.md`：全局 AI 协作规则，模板见 `zcode/AGENTS.md`（脱敏正本）。
