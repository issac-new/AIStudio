# 04 secret 最小暴露 redactor（D4）

矩阵映射：P0-14 环境权限清理与范围化 Token（`research/moanju-fusion/research-slices/p0-claims.md`）。

## 机制说明

扫描模块输出 / 日志 / 文本，识别硬编码凭据 pattern 并以 `[REDACTED]` 占位替换：

| 规则 | 目标 |
|---|---|
| SEC-01-assignment | `password=xxx` / `"token": "xxx"` 等赋值风格（含 JSON 冒号） |
| SEC-02-bearer | `Bearer xxx` / `Basic xxx` header |
| SEC-03-aws-access-key | AKIA... 16 位 |
| SEC-04-aws-secret | 40 位 base64 型 AWS secret |
| SEC-05-github-token | ghp_/gho_/ghu_/ghs_/ghr_ 前缀 |
| SEC-06-private-key-block | PEM 私钥块头 |
| SEC-07-connection-string | `scheme://user:pass@host` 内嵌凭据 |
| SEC-08-high-entropy-heuristic | ≥16 字符、熵 ≥3.3 的字母数字混合长串（兜底，宁误脱敏不漏） |

**本模块自身绝不打印原始命中值**：报告 findings 只含规则 id、span、掩码 preview（最多保留前 3-5 字符 + `[REDACTED]`）。

## fail-closed 原则

- 长随机串无法确定是否凭据时按凭据处理（SEC-08 兜底，阈值实测覆盖 18 字符弱熵串）。
- patterns 配置非法 -> exit 2，不静默用空规则。
- 命中即 exit 1（有 secret 进过输出 = 需要处理），脱敏文本写 `--out` 或 stderr。

## 命令

```bash
# 正面：普通日志 -> exit 0
python3 04-secret-minimal-exposure/gate.py --text "worker-a finished batch 42"

# 反面：含凭据 -> exit 1，输出已脱敏
python3 04-secret-minimal-exposure/gate.py --text "password = 'hunter2secret'"

# URL 连接串
python3 04-secret-minimal-exposure/gate.py --text "postgres://admin:pw123456@db:5432/x"

# 全部 fixture：python3 04-secret-minimal-exposure/test_gate.py
```

## fixture 清单（test_gate.py，14 例全过；凭据全部为伪造占位样例）

| 类 | 用例 | 期望 |
|---|---|---|
| 正 | clean_log_no_findings | 无 findings |
| 正 | clean_config_no_findings | 无 findings |
| 反 | password_assignment_redacted | SEC-01 命中 + 无泄漏 |
| 反 | bearer_redacted | SEC-02 |
| 反 | aws_key_redacted | SEC-03 |
| 反 | github_token_redacted | SEC-05 |
| 反 | pem_block_redacted | SEC-06 |
| 反 | connection_string_redacted | SEC-07 |
| 反 | high_entropy_fallback_redacted | SEC-08 兜底 |
| 反 | preview_is_masked_not_full_value | preview 不含完整原值 |
| 反 | findings_never_contain_full_secret | 报告永不泄漏原值 |
| CLI | clean_exit_0 / secret_exit_1 / bad_patterns_exit_2 | 0/1/2 |

## 关键决策

- SEC-07 固定替换**最后一个**捕获组（密码体），避免 scheme 被误当密钥体替换（实测踩坑：最长组策略会把 `postgres` 当凭据，密码反而留下）。
- 高熵阈值 3.3 而非 3.8：实测 18 字符弱熵 secret（熵 3.50）在 3.8 下漏检。
- fixture 凭据均为明显伪造格式（hunter2secret / AKIAIOSFODNN7EXAMPLE 等），不含任何真实凭据。
