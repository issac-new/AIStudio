# 03 Skill 供应链门禁（D3）

矩阵映射：P0-08 SkillSieve 三层 Skill 检测 + P0-10 Agent Skill 七阶段生命周期（`research/moanju-fusion/research-slices/p0-claims.md`）。

## 机制说明

对新增 skill / plugin 目录做**三层最小来源校验**，生成 JSON 校验报告：

- **L1 元数据层**：SKILL.md 存在性、大小 ∈ [40B, 200KB]、UTF-8 可解码、frontmatter 含 name/description。
- **L2 静态内容层**：文本文件（.md/.py/.sh/.js/.ts/.json/.yaml/...）恶意行为 heuristics，8 条确定性正则：
  - SC-001 curl|bash 管道执行、SC-002 base64 -d|sh、SC-003 凭据文件读取（.ssh/.env/id_rsa/.aws）、SC-004 反向 shell、SC-005 环境变量凭据外传、SC-008 SKILL.md 内嵌提示注入 —— 命中即 REJECT
  - SC-006 持久化（crontab/LaunchAgents/shell rc 追加）、SC-007 eval/exec 远程内容 —— 仅 WARN
- **L3 结构层**：目录总量 ≤2MB、文件数 ≤500、单文件 ≤500KB（防巨型载荷绕过审核）、敏感绝对路径引用。

决策：任一 high 命中 -> REJECT；仅 medium -> WARN（放行但必须留报告）；无命中 -> ALLOW。

## fail-closed 原则

- SKILL.md 缺失 / 目录缺失 / 目录遍历 IO 失败 / 校验器自身异常 -> 一律 REJECT（exit 1 或 2），绝不默认放行。
- 未在文本后缀白名单内的文件跳过内容扫描但计入 L3 预算。

## 命令

```bash
# 反面：无 SKILL.md 的目录 -> exit 1
python3 03-skill-supply-chain-gate/gate.py /tmp/empty-dir

# 正面：结构干净 skill（相对本工作区示例）
python3 03-skill-supply-chain-gate/gate.py 03-skill-supply-chain-gate/fixtures-clean-skill --report /tmp/skill-report.json

# 全部 fixture：python3 03-skill-supply-chain-gate/test_gate.py
```

## fixture 清单（test_gate.py，10 例全过；临时目录构造，不落真实 skill）

| 类 | 用例 | 期望 |
|---|---|---|
| 正 | clean_skill_allows | ALLOW, exit 0 |
| 反 | missing_skillmd_rejects | REJECT (SK-001) |
| 反 | tiny_skillmd_rejects | REJECT (SK-002, <40B 占位伪装) |
| 反 | injected_skillmd_rejects | REJECT (SC-008 提示注入) |
| 反 | curl_pipe_bash_rejects | REJECT (SC-001) |
| 反 | reverse_shell_rejects | REJECT (SC-004) |
| 反 | credential_read_rejects | REJECT (SC-003) |
| 反 | medium_only_warns | WARN + findings（SC-007） |
| 反 | cli_missing_dir_exit_1 | exit 1 |
| 正 | report_file_written | --report JSON 落盘可解析 |

## 关键决策

- 三层沿用 SkillSieve 命名（L1 元数据/L2 静态/L3 结构）；矩阵的"运行行为层"属运行时监控，不在本静态门禁范围。
- heuristics 全部确定性正则（无 LLM），保证可复现。
- 最小 size 下限 40B 是针对"语义伪装占位 SKILL.md"的防绕过设计。
