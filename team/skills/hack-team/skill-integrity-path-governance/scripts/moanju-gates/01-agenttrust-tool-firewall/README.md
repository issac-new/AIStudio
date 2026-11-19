# 01 工具调用意图闸门（D1）

矩阵映射：P0-01 AgentTrust 工具调用防火墙 + P0-02 可信动作清单 + P0-03 Agent IAM 目的/意图约束（`research/moanju-fusion/research-slices/p0-claims.md`）。

## 机制说明

对结构化 Action（tool/caller/purpose/mode/params）做**确定性**（无 LLM）规则判断，输出 AgentTrust 四态决策 ALLOW / WARN / BLOCK / REVIEW：

1. schema 校验：缺字段或 mode 非法 -> BLOCK。
2. 可信动作清单：tool 不在 `TRUSTED_ACTIONS` -> BLOCK。
3. Agent IAM 目的约束：写类高风险动作 purpose 为空/未指定 -> BLOCK。
4. 核心默认拒绝：高风险动作在 `headless`（非交互）场景 -> BLOCK。
5. 高风险动作在 `interactive` 场景 -> REVIEW（需人工批准；无批准通道时视同拒绝，exit 1）。
6. 低风险动作放行；参数含路径穿越特征（`..`）或凭据式键名 -> WARN（放行带提示）。

## fail-closed 原则

- 无法判断（schema 不完整、JSON 解析失败）一律不放行。
- 清单外工具、headless 高风险、无 purpose 写操作：默认拒绝并给出原因码。
- 决不因输入异常退化为 ALLOW。

## 命令

```bash
# 实测命令（正面：低风险只读 -> exit 0）
python3 01-agenttrust-tool-firewall/gate.py --action '{"tool":"file_read","caller":"w","purpose":"read docs","mode":"headless","params":{"path":"README.md"}}'

# 实测命令（反面：headless 高风险 -> exit 1）
python3 01-agenttrust-tool-firewall/gate.py --action '{"tool":"file_delete","caller":"w","purpose":"cleanup","mode":"headless","params":{"path":"/tmp/x"}}'

# 输入错误 -> exit 2
python3 01-agenttrust-tool-firewall/gate.py --action '{bad json}'

# 全部 fixture：python3 test_gate.py（exit 0=通过, 1=失败）
```

## fixture 清单

| 类 | 用例（test_gate.py） | 期望 |
|---|---|---|
| 正 | readonly_headless_allows | ALLOW, exit 0 |
| 正 | suspicious_param_warns_but_allows | WARN, exit 0 |
| 正 | highrisk_interactive_returns_review | REVIEW, exit 1（未批准不放行） |
| 反 | unknown_tool_blocked | BLOCK, exit 1 |
| 反 | highrisk_headless_blocked | BLOCK, exit 1 |
| 反 | purpose_missing_blocked | BLOCK, exit 1 |
| 反 | schema_missing_fields_blocked | BLOCK, exit 1 |
| 反 | credential_read_headless_blocked | BLOCK, exit 1 |
| 反 | cli_input_error_exit_2 | exit 2 |

## 关键决策

- 决策名沿用矩阵（allow/warn/block/review）；REVIEW 映射 exit 1，因本模块运行于无人工批准通道的自动化环境，REVIEW 即"本次不放行"。
- 可信清单内置 8 个动作（3 低风险只读 + 5 高风险写/外发/凭据）；扩展清单须显式改代码，不做运行时动态扩权。
