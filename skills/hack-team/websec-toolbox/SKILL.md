---
name: websec-toolbox
description: "Websec tool matrix with usage: scan/recon/redteam."
---

# WebSec Toolbox（Web安全工具库 蒸馏）

> 来源：微信公众号「Web安全工具库」2026-03 ~ 2026-09 推荐工具，5 个仓库 README 全文蒸馏
> （原始证据：workspace/websec-tools-survey/raw/tools/*_README.md，抓取于 2026-09-09）。
> 选型问本 skill；全文细节读 raw/ 下对应 README。

## 合规红线（先读）

清单内工具全部**仅限授权渗透测试 / CTF / 靶场**使用。凡对第三方资产使用，
必须先过 `security-domain-delegation` 的授权门（被动/主动判定 + 目标侧授权）。
工具能力描述不构成使用授权。

## 工具选型表

| 任务 | 工具 | 仓库 | 语言 | 热度 |
|---|---|---|---|---|
| Web 综合扫描（指纹+WAF+bypass+漏测） | FLUX-Webscan | github.com/MY0723/FLUX-Webscan | Python | ★232 |
| 逆向+渗透集成工作台（Windows GUI） | MetaSword 次元剑 | github.com/soevai/MetaSword | Electron/JS | ★368 |
| AI 红队 agent（Claude Code 原生编排） | bface-agent | github.com/gmeier909/bface-agent | Go | ★15 |
| 双环境工具包管理器（Win+WSL Kali） | plutox-sec-forge | github.com/okdkebm/plutox-sec-forge | Python/清单 | ★1 |
| 新手向多合一信息收集 | xxx-mods-scanner | github.com/lkpnb/xxx-mods-scanner | Python | ★9 |

## 各工具要点与命令

### FLUX-Webscan（综合扫描主力）
- **能力**：25,156+ 指纹（含 46 个 AI 组件）、130+ WAF 识别（融合 wafw00f）、
  700+ bypass payload（59 类技术）、差分测试降误报 80%+、云密钥检测（12 云厂 + 熵值校验）、
  AI 基础设施 CVE 检测（589+，基于 AI-Infra-Guard）、K8s/容器/CI-CD 配置检测、
  Playwright 渲染扫描（SPA/前端路由）、静态/渲染/混合三模式、断点续扫。
- **命令**：
  ```bash
  pip install requests beautifulsoup4 colorlog pyyaml flask
  python flux.py -t <目标> --vuln-test -o report.html   # 标准扫描
  python flux.py -t <目标> --full --dnslog xxx.dnslog.cn -o report.html  # 全面(深度)
  python flux.py -t <目标> --fuzz-paths                  # 敏感路径 fuzz
  python flux.py -t <目标> --vuln-test --proxy http://127.0.0.1:8080     # 带代理
  ```
- **独有价值**：渲染模式可抓 XHR/fetch 运行时请求 + 前端路由追踪（pushState/hashchange）；
  轻量交互引擎点击高价值元素（login/admin/upload/swagger）且规避危险按钮。

### bface-agent（AI 红队 agent，架构参考价值最高）
- **形态**：Claude Code 驱动，Go 写的 MCP server 提供 23 个工具（C2 8 + WebShell 9 + 测绘 1 等）。
- **核心理念**：认知架构 > 工具堆砌——结构化目标档案 7 件套（target/credentials/vulns/
  attack-graph/footholds/loot，跨会话连续）、项目黑板 DAG（SQLite 8 种边类型）、
  漏洞三态验证闭环（可复现才入账）、9 个按入口点分支的决策树 skill、Web HITL 审批门。
- **测绘聚合**：FOFA/Hunter/Quake 三平台一键查询 + 方言自动适配（写 FOFA 语法自动转三家）。
- **对 Hermes hack-team 的借鉴**：档案 7 件套 ≈ engagement workspace；三态验证闭环可纳入
  `fp-check` 流程；决策树 skill 组织法可增强 `pentest-methodology-fusion`。

### plutox-sec-forge（工具包管理器 + 编排范式）
- **能力**：125+ 工具 manifest 清单（Win 宿主 22 + WSL Kali 101+），`清单即配置`，
  CI 校验清单格式；Autopilot 按 killchain 顺序编排（recon → discovery → vuln → fuzz → audit）。
- **命令**：
  ```bash
  bash wsl-kali/install.sh -c web,intranet        # 按领域安装
  bash scripts/run-autopilot.sh plan <目标> --domain web          # 预览(不执行)
  bash scripts/run-autopilot.sh scan <目标> --auth "授权编号 #xxx" # 授权门禁必填
  ```
- **对 Hermes hack-team 的借鉴**：`--auth` 必填 + consent.txt 落盘 + 危险任务单独
  `--allow-dangerous` 的门禁实现，与 `scope-gate` skill 同源，可交叉引用；
  证据报告（命令/退出码/耗时/输出 → report.md + run.json）可对齐 Diamond Checker 验收。

### MetaSword 次元剑（集成工作台）
- **能力**：Electron 工具箱，聚合逆向（IDA/x64dbg/dnSpy/Cheat Engine）+ 渗透
  （Burp/Yakit/Tscan/ez），内置 AI Agent 与 Frida，插件扩展、多主题。
- **限制**：完整版需从作者博客下载（GitHub Release 只有 Loader 启动器）；
  Windows 平台为主。适合给操作员做桌面工作台，不适合 agent 自动化调用。

### xxx-mods-scanner（轻量侦察）
- **能力**：网站存活扫描、子域名挖掘、目录扫描、指纹识别、403 绕过。适合快速摸底，
  功能与 ARL-Next/wih 移植能力重叠度高，作轻量替补。

## 组合建议（授权场景）

1. **摸底**：xxx-mods-scanner 快速收集 → FLUX 指纹+WAF 识别定防护等级。
2. **深度扫描**：FLUX 差分漏测（WAF 场景自动选 bypass payload）→ 结果进报告。
3. **AI 编排**：bface-agent 管理 engagement 档案与验证闭环；或用 plutox Autopilot
   跑流水线（两者都要 `--auth` 授权依据）。
4. **逆向任务**：MetaSword 作人工分析工作台（agent 侧仍走 cybermes-tools）。

## 证据链

- 文章索引 16 篇（含标题/日期/搜狗链接）：`distilled/merged_target_articles.json`
- 5 工具 README 全文：`raw/tools/<name>_README.md`（2026-09-09 抓取）
- 仓库元数据（star/pushed_at）：`tools_meta.json`
