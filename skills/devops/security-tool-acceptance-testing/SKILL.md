---
name: security-tool-acceptance-testing
description: "安全工具脚本验收：回环 fixture 零外网测试+状态机复测。"
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

## 已知坑

- **第三方包新 Python 版本兼容**：装包后先探针最简调用（如 `Simhash(text).value`），溢出/异常时改走替代构造路径（如 features 列表构造），并在移植文件里注释原因。系统 Python 常 PEP 668 拒装——用 /tmp 一次性 venv 测试。
- **退出码契约三态**（0=有发现/1=无发现/2=错误）：三态都要实测，特别是「不可写 state 路径 → exit 2 无 traceback」这类 fail-closed 分支。
- **fixtures 覆盖坏输入**：空文件 + 坏 JSON + 未归类文件各至少一个，断言降级而非崩溃。

## 验收留痕

kanban_comment 用「声明 × 验证方式 × 结果」三列表格，每行含证据命令原文；worker 自证材料与独立复测一致时写明「采信」。
