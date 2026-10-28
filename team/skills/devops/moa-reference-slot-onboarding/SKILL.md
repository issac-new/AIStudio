---
name: moa-reference-slot-onboarding
description: 给 MoA preset 增加新参考模型/厂商时用：七步接入环+思考参数注入通道决策
---

# MoA 参考槽新厂商接入环

用户新增 MoA 参考模型（如「moa 再增加 X」「MoA 模式增加 X 和 Y」）时按本环执行。每接入一家跑一遍全环，禁跳步。

**权威分工**：wires/密钥恢复源/思考契约表 → `hermes-moa-configuration`（default profile，读无边界写有门）；E2E 槽位级验收判据 → `moa-run-verification`。本件只补两者都没写的「接入顺序 + 注入通道决策」。冲突时以上两者为准。

## 七步接入环

1. **Key 溯源**（只探活源，死源早跳）：cc-switch 库 `hermes` 类型 provider 行（全明文）→ `settings_config` 未掩码行 → 本地备份（先 grep `__ROTATED-YYYYMMDD__` 占位符；大量备份共享同一 mtime 秒 = 批量重写指纹，里面的 key 是洗过的）→ 全掩码则停搜直接找用户要，拿到后先比对尾缀与掩码尾一致才用。死源勿翻：cc-switch 请求日志只记 URL、WebKit localstorage 只有 UI 状态。key 暂存 scratch（chmod 600），配置写完后删。
2. **Wire 定型 + 真调验证**：优先厂商官方 anthropic 兼容端点，`api_mode: anthropic_messages`，`base_url` **不带尾 `/v1`**（客户端自追加 `/v1/messages`）。写任何配置前先用 urllib 直连 POST 验 key+model id 双真（ anthropic 式：`x-api-key` + `anthropic-version`）。禁经 cc-switch 代理验证——单活 provider 代理会拿活跃模型 200 假答。
3. **思考契约 A/B**（禁信文档，禁信 Hermes 映射）：同一道有思考量差的问题（bat-and-ball 型）跑梯度：无参 / 厂商 effort low / high / max / Hermes 槽位 effort（manual budget 路径）。产出两个事实：该厂商 max 档形状 + 无参默认给到哪档。梯度数据落 scratch 供写表引用。
4. **注入通道决策**（见下决策表）——选错通道 = 思考量静默降档。
5. **两层写入**：`~/.hermes/profiles/<profile>/config.yaml`（custom_providers + preset 槽位）**和** `~/.hermes/shared/profiles.yaml` 的 `shared_config.custom_providers`（生成源）同时写；只写 live 层会被 generate-configs.py 重生成时洗回。
6. **Regen 存活验证**：重跑 `generate-configs.py --profile <p>`，assert provider 行 + 槽位 + extra_body 三者在位。
7. **E2E 槽位级验收**（判据照 moa-run-verification）：`hermes chat -q "<可验证小题>" -m 'moa:<preset>' --cli -v` → 参考 N/N 扇出全触发 + 无该槽 failed WARNING + 各槽最终请求体（`'json_data':` 块）思考参数实发 + 答案正确 + rc=0。选 max 档后补一道难题探针确认不炸延迟、答案仍对。

收尾：把新厂商行（wire/model/ctx/max 形状/槽位配置/A-B 数据）写入 hermes-moa-configuration 的厂商表与 references/current-presets.md——两者是 default 域文件，orchestrator 会话用文件级 `patch` 走 canonical 绝对路径改（门禁规则见 orchestrator-profile-skill-writeback）。

## 注入通道决策表（非 kimi/claude 厂商，槽位 effort 必降档）

机制：Hermes 对非 kimi/claude 厂商把槽位 effort 走 manual budget 路径 → 发 `thinking.budget_tokens`，多数厂商忽略或只给中档。

| 厂商思考契约（A/B 实测） | 通道 | 形状 |
|---|---|---|
| 强制开启/无参即 max（GLM、MiMo 型） | 槽位**全部省略**思考参数 | 无 reasoning_effort、无 extra_body |
| kimi 家族（adapter 逐字映射） | 槽位 `reasoning_effort: max` | adapter 转 `output_config.effort: max` |
| anthropic wire 上有 effort 阶梯（StepFun、DeepSeek 型） | provider **`extra_body: {output_config: {effort: <top>}}`** | SDK 平铺进最终请求体；json_data 里无 extra_body 键 = 平铺成功 |
| 二进制开关且默认关（MiniMax 型） | provider `extra_body: {thinking: {type: adaptive}}` | 开 = 该厂商 max |

验证永远看最终请求体，不看配置写了什么。

## Pitfalls

- **无参 ≠ max**：StepFun 无参=medium、DeepSeek 无参≈中档、kimi coding wire 默认=high——每家 A/B 后才下结论，禁从别家的默认档外推。
- **槽位 effort 加在非 kimi 槽 = 静默降档**：budget_tokens 被 StepFun 降档、被 DeepSeek 忽略；厂商阶梯只能走 extra_body。
- **context_length 按厂商文档填**，勿抄舰队 1M 默认（DeepSeek 128K 也够参考槽用）。
- **掩码 key ≠ 可恢复**：cc-switch 主库掩码后唯一活源常是用户；「备份里翻出明文」≠ 有效（可能已吊销，401 错误体回显尾四字符才坐实归属）。
- 两层写完不做 regen 存活验证 = 下次生成时丢配置又从头排障。
