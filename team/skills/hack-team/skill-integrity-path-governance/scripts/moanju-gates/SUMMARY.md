# P0 安全机制最小实现 — SUMMARY

任务卡：t_60f59d51（依据研究卡 t_f28ddf0f 冻结矩阵：mechanism-matrix.md / p0-claims.md / hermes-gap-map.md）
产物根：`research/moanju-fusion/implementation-slices/`

## 机制清单（每机制一行：路径 + 关键决策 + 测试命令 + 退出码契约）

1. **01-agenttrust-tool-firewall**（D1 工具调用意图闸门，P0-01/02/03）— 关键决策：AgentTrust 四态 ALLOW/WARN/BLOCK/REVIEW；可信动作清单外工具一律 BLOCK；headless 高风险一律 BLOCK（核心默认拒绝）；写类动作 purpose 缺失 BLOCK；REVIEW 无批准通道映射 exit 1。测试：`python3 01-agenttrust-tool-firewall/test_gate.py`（9/9）。退出码：0=放行(ALLOW/WARN)，1=拒绝(BLOCK/REVIEW)，2=输入/配置错误。
2. **02-prompt-injection-detector**（D2 提示注入识别器，P0-05/06）— 关键决策：7 条可配置确定性 pattern；source 来源强制标注；命中即 untrusted-content-envelope（外部内容只作数据不作指令）；配置非法 exit 2 不静默放行。测试：`python3 02-prompt-injection-detector/test_gate.py`（13/13）。退出码：0=clean，1=检出注入，2=配置/输入错误。
3. **03-skill-supply-chain-gate**（D3 Skill 供应链门禁，P0-08/10）— 关键决策：SkillSieve 三层（L1 元数据/L2 静态 heuristics 8 条正则/L3 结构预算）；high 命中 REJECT、仅 medium WARN 放行带报告；SKILL.md <40B 视为占位伪装拒绝；校验器自身异常 REJECT。测试：`python3 03-skill-supply-chain-gate/test_gate.py`（10/10）。退出码：0=通过(含 WARN)，1=REJECT，2=未用（校验器异常归 1）。
4. **04-secret-minimal-exposure**（D4 secret 最小暴露，P0-14）— 关键决策：8 条凭据 pattern + 高熵兜底（≥16 字符、熵≥3.3，实测覆盖弱熵 18 字符串）；SEC-07 固定替换末捕获组防 scheme 误替换；findings 报告永不含完整原值。测试：`python3 04-secret-minimal-exposure/test_gate.py`（14/14）。退出码：0=无命中，1=有命中（输出已脱敏），2=配置/输入错误。
5. **05-execution-trace-audit**（D5 执行轨迹可归因，P0-16）— 关键决策：append-only JSONL；params 只落 SHA-256 不落原文；output 只落 120 字符截断摘要且先过 04 redactor；历史含坏 JSON 行判篡改停止追加。测试：`python3 05-execution-trace-audit/test_gate.py`（10/10）。退出码：0=记录成功/校验通过，1=记录被拒，2=配置/IO/篡改嫌疑。

## 一键回归

```bash
cd research/moanju-fusion/implementation-slices
for d in 01-agenttrust-tool-firewall 02-prompt-injection-detector \
         03-skill-supply-chain-gate 04-secret-minimal-exposure \
         05-execution-trace-audit; do python3 $d/test_gate.py; done
# 期望：9/9, 13/13, 10/10, 14/14, 10/10 —— 共 56/56 passed
```

pytest 兼容：每个 test_gate.py 均含 pytest 可收集的 `test_*` 纯 assert 函数；
`pytest 01-agenttrust-tool-firewall -v` 等价可用（本机无 pytest，已验证独立运行路径）。

## 约束符合性

- 全部纯 Python 标准库（argparse/json/re/hashlib/pathlib/tempfile/datetime/math/os/sys），零第三方依赖。
- 全部 fail-closed：无法判断/输入异常/配置错误 → 拒绝或 exit 2，绝不默认放行。
- 无真实 secret：凭据 fixture 全部为伪造占位格式；模块自身不打印原始命中值。
- 写入范围仅 implementation-slices/；未触碰 Hermes 生产 SOUL/配置/凭据。

## 实测修正记录（本卡验证期修复的真 bug）

1. 03 缺 `import re`（NameError 被校验器 fail-closed 兜住转 REJECT——恰好证明 fail-closed 生效，但属实现缺陷）。
2. 03 L1 非致命 findings 被静默丢弃（tiny SKILL.md 场景 findings 丢失）→ 改为带回合并。
3. 04 SEC-07 最长捕获组策略把 scheme 当密码替换、真密码残留 → 固定末组。
4. 04 高熵阈值 3.8 漏检熵 3.50 的 18 字符 secret → 降至 3.3。
5. 05 output_summary 未过 redactor 前的 secret 泄漏进日志 → 已确认摘要走 redact 链路（test_secret_not_in_log_file 断言）。
6. 02 disregard 正则漏 "the" 限定词 → 补 `(the\s+)?`。
