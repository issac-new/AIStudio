---
name: moa-run-verification
version: 1.1.0
description: "验收 MoA 运行与槽位失败判性：槽位级判据、401/429/超时三分处置"
---

# MoA 运行验收与槽位失败判性

## 定位

MoA 配置（wires、密钥恢复、preset 结构、思考参数契约）的权威源是 `hermes-moa-configuration`（default profile，读无边界）。本件只补它没写的两类操作：**运行验收判据**与**槽位失败处置**。冲突时以权威源为准；若日后它吸收本件内容，本件退役。

## 何时用

- 用户要求「测试 MoA 是否正常」、跑 `-m moa:<preset>` E2E 后判定成败
- E2E 日志里出现参考槽 failed，要判该修配置、该等配额、还是该找用户要 key

## 验收判据（槽位级，不是运行级）

1. `参考 N/N — custom:moa-<x>:<model>` 行只证明槽位**被调用**。槽位成功 = verbose 日志中无该槽 `MoA reference model <slot> failed` WARNING，且最终答案里无该槽 `[failed: …]` 标记。把扇出行当成功清单会高估健康度。
2. rc=0 + 聚合器答对 ≠ 参考健康——全部参考失败时进程照样 rc=0、聚合器单独作答。退出码和最终答案都不能当参考质量的证据。
3. 思考参数以**最终请求体**为准：grep verbose 日志各槽的 `'json_data':` 块看 thinking/output_config 是否真的发出，不看 slot 配置写了什么——配置到请求体之间有映射层（见权威源技能的思考契约表）。
4. 日志解析法：扇出行正则 `参考 (\d)/(\d) — (custom:moa-\w+):([\w.-]+)` 建槽位表，WARNING 行 `failed: Error code: (\d+)` 建失败表，按 provider 对齐 → 得「N 成功 / M 失败 / 哪几家」。

## 失败三分处置（只修真坏的）

判性以 E2E 运行日志为准，不用孤立直连探针下结论——单探针 429 后下一轮 E2E 可能正常（token_plan 配额分钟级恢复），反之亦然。

**401（key 无效）**：先比配置 key 与 cc-switch 库源行的**尾缀**，再决定动作：

```bash
sqlite3 "file:~/.cc-switch/cc-switch.db?immutable=1" \
  "SELECT json_extract(settings_config,'$.api_key') FROM providers WHERE name='<provider>'"
# 或 env 形态：json_extract(settings_config,'$.env.ANTHROPIC_AUTH_TOKEN')
```

- 尾缀不同 = 上游轮换了 key、库行里有新值 → 新 key 真调 200 验证 → **同时写两层**（`~/.hermes/profiles/<profile>/config.yaml` + `~/.hermes/shared/profiles.yaml`；只写 live 层会被 generate-configs.py 重新生成时洗回）→ 重跑 E2E 确认该槽恢复。
- 尾缀相同 = key 本身被上游吊销 → 唯一出路是用户去厂商平台重签。库里「完整明文 key」≠ 有效 key（可能已被吊销），确认无第二恢复源后停止搜索直接找用户，别继续翻备份。归档库/备份翻出的明文 key 测出 401 时，先看错误体是否回显被拒 key 尾四字符（形如 `Your api key: ****8956`）——尾号对得上才坐实「被拒的就是这把」，轮换/吊销结论才成立；cc-switch 请求日志只记 URL 不记 auth 头，grep 日志找 token 是死路，早跳过。
- 比对技巧：sqlite3 CLI 输出带尾换行，长度差 1 是噪音不是差异——先 `tr -d '\n'`，比 prefix 与 tail 而非只比长度。

**429（配额/限流）**：厂商侧墙，不是配置 bug，**不动配置**。周/月配额错误体里带重置时间戳（转告用户即可）；token_plan「quota exhausted」可能分钟级恢复——复探一次再判槽位下线。

**`Request timed out or interrupted`**：网络抖动，重跑一轮再诊断。

## 槽位缺员时的汇报口径

`degraded_reference_policy: loud` 下失败槽在答案里显式标注，预设可以长期以 N-1 槽跑。汇报分三层：机制 OK/坏、当前 M/N 槽可用、缺的是哪家+为什么（key 吊销等用户重签 / 配额等重置 / 网络抖动待复跑）。禁止只报「跑通了」或只报「挂了」。
