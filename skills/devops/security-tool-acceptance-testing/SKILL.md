---
name: security-tool-acceptance-testing
version: 1.2.0
description: "安全工具脚本验收：回环 fixture 零外网测试+状态机复测+工具形状边界自检。"
platforms: [macos, linux]
---

# 安全工具移植后验收：回环 fixture + 状态机复测

> 来源：ARL-Next 三脚本移植验收（敏感信息提取/外部 API 监控/站点漂移监控）实战提炼。
> 与 `worker-completion-independence-verification` 的分工：那边是 orchestrator 验 worker 交付的纪律（含 references/cli-tool-script-acceptance.md 配方），本 skill 是移植/开发方**自验**网络类工具的技术配方——但验收方同样可直接复用本配方做独立复测。

## When to Use

- 移植/开发了一个安全工具脚本（敏感信息扫描、威胁监控、站点漂移检测等），交付前自验
- 验收 worker 交付的安全工具类 CLI 脚本，需要独立复测
- 给「纯本地扫描 / 外部 API 监控 / 有状态漂移检测」类脚本设计测试

## 配方一：回环 HTTP fixture（网络工具零外网测试）

起本机 `http.server` 注入已知内容做断言——零外网依赖、可重复、不触碰真实目标：

```python
import http.server, threading
class H(http.server.BaseHTTPRequestHandler):
    state = {"v": 1, "down": False}  # 类属性 = 可变 fixture
    def log_message(self, *a): pass  # 静音访问日志
    def do_GET(self):
        # 按 self.path / self.state 返回不同内容或错误码
        ...
server = http.server.ThreadingHTTPServer(("127.0.0.1", 18099), H)
threading.Thread(target=server.serve_forever, daemon=True).start()
```

- **敏感信息扫描类**：fixture 页面注入合成凭据（JWT/云 AK/secret_key/身份证各一）分布在不同层（HTML 正文/内联 script/外链 JS/动态 chunk），断言每层都能检出——只测 HTML 层会漏掉瀑布解析的回归。
- **子进程跑被测引擎**（非 import）：`subprocess.run([sys.executable, ENGINE, ...])` 验证完整 CLI 路径。
- **断言写到内容级别**：`content in {rec["content"]}` 而非只数条数——数条数会让「检出了但内容错」漏网。
- 同站点同内容多来源（page/inline/script）会被 (hash, site) 去重合并——这是设计语义不是 bug，断言按「内容在结果里」而非「每个来源各有一条」写。

## 配方二：状态机多轮验证（有 state 文件的监控/漂移类）

| 轮次 | 操作 | 期望 |
|---|---|---|
| T1 基线首跑 | 空 state | 无告警退出（首跑告警即误报） |
| T2 内容变更 | 切 fixture 内容 | 告警 + 退出码=有发现；告警维度与变更对应 |
| T3 无变更复跑 | 同内容 | 静默（防抖不误报） |
| T4 故障防抖 | 连续 N 轮返回 503 | 容忍限内静默，达限那轮才告警（计数器真在累加） |
| T5 恢复 | 恢复正常 | 退出码回 {0,1}，全程无 traceback |

## 配方三：外部 API 工具（幂等/去重）

- run1 后检查 state 文件非空；run2 同参数 → 「无新告警 + 退出码=无发现」。
- run2 允许极少量新增——外部源结果集有动态性；逐条可解释（不在 run1 结果集）即不算去重失效。
- 无 token 匿名 API（如 GitHub Search 10 req/min）：脚本必须内置请求间隔 + 429/403 退避（Retry-After 优先、指数退避、重试 ≤2），验收时 grep 这些逻辑存在。

## 配方四：工具形状边界自检（REA tool-design 方法论，2026-10-11 融合）

自研/移植的安全工具脚本，交付前过一遍形状自检——工具边界模糊是「全能脚本腐化」的根因：

| 形状 | 用途 | 反例（不该混进来） |
|------|------|-------------------|
| inspect | 单对象事实（返回字段+位置+覆盖面） | 顺带做发现或修改 |
| search/list | 候选发现（稳定排序，需要时分页） | 顺带深入分析单个候选 |
| trace | 跨证据关系（typed edges + 未解路径） | 顺带下结论 |
| compare | 显式配对（身份+可比覆盖+受支持差异） | 隐式「和上次比」 |
| workflow | 反复出现的多源组合（保留调用方选择权） | 首版就上 workflow |
| observe/capture | 运行时行为（如实声明副作用与生命周期） | 静默启动子进程 |

- **限制合法性**：限制必须来自真实格式/协议/权限/实测资源约束——「假设的 agent 预算」不是理由。先测量再定预算，在昂贵步骤前强制。
- **产物证据化**：结论带 confidence（observed/derived/inferred）+ authority + limitations；「未覆盖」输出为 unknown，不是 absence。
- **失败保真**：tagged error + 部分事实保留；降级必须显式（不可静默 fallback 到次优数据源）。
- 原文：`~/hermes-docker-sandbox/workspace/research/rea-src/docs/tool-design.md`；调研报告同目录 `rea-research-report.md` §2.5。

## 配方五：静态内容扫描器全库基线首跑（效力验证）

规则引擎级工具（关键词/启发式/正则扫描器，如 skill 注入/投毒检测器）交付后，用全库真实语料跑一次基线首跑——fixtures 单元测试只证明「能检出」，基线首跑补「误报边界」这半张效力证明，两半齐了才算效力验证闭环。

- **执行形态**：顶层类目逐目录 `scan <dir> --format json`，纯本地；5000+ 文件量级约 1 分钟。汇总脚本只收新规则命中 + flagged 计数，落 raw-summary.json（机器可复读）；再对每个新规则命中文件抽 snippets 逐类定性（真恶意 / fixtures 预期 / 误报机理），落定性结论 JSON + 命中样本表。安全发现类结果按 hack-kb 约定归档（ts/target/chain/product/cond/evidence 一行 jsonl）。
- **先探输出形状再解析**：扫描器 JSON 按 target 形态分层——单文件形态在顶层 `findings`，目录形态在 `results[].findings`；按错层级解析=静默漏报，会把「全库干净」建立在零解析上。单文件直 scan 与目录扫描行为不同（顶层散文件不在目录扫描覆盖内），空结果先核对扫描路径真实存在，再判零命中。
- **双面数字分开报**：恶意面检出率（fixtures 命中占比）与真实面误报率（真实文件命中中误报占比）是两个独立指标——合成一句「检出 N 处」会掩盖「fixtures 全检出、真实面 100% 误报」这类工具在真实语料上不可用的事实。
- **误报三类高发机理（词面启发式结构性边界）**：①防御性安全文档——分析对象语言被当指令（「检查越狱检测实现」命中注入规则），「以安全为研究对象」的语料对注入类词面规则天然接近全量误报；②教程/标准引文——示例代码叙述句（「now make the key」）命中凭据类规则；③运维祈使句——给 agent 的正常操作指令（「Must print TEST_OK」）命中指令类规则。这是词面启发的结构边界，不是部署错误。
- **误报不是终点是改进票**：按机理写改进方向（类目/路径豁免清单、升级为「注释+指令动词+工具调用目标」多要素共现再报），误报机理+改进方向落盘台账后效力验证才闭环。
- **成色升降纪律**：效力级是可升降的实测状态不是终身标签——基线双面数字已知后，落地/裁决表的成色从「生效，效力待首次实战」升为 Exercised，禁用永久性「未验证」措辞（后续 session 会误判为从未跑过）；残留缺口（误报改进）另开小卡登记，不回退已验证部分的成色。

## 已知坑

- **第三方包新 Python 版本兼容**：装包后先探针最简调用（如 `Simhash(text).value`），溢出/异常时改走替代构造路径（如 features 列表构造），并在移植文件里注释原因。系统 Python 常 PEP 668 拒装——用 /tmp 一次性 venv 测试。
- **退出码契约三态**（0=有发现/1=无发现/2=错误）：三态都要实测，特别是「不可写 state 路径 → exit 2 无 traceback」这类 fail-closed 分支。
- **fixtures 覆盖坏输入**：空文件 + 坏 JSON + 未归类文件各至少一个，断言降级而非崩溃。

## 验收留痕

kanban_comment 用「声明 × 验证方式 × 结果」三列表格，每行含证据命令原文；worker 自证材料与独立复测一致时写明「采信」。
