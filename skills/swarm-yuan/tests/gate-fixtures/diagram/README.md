# diagram gate-fixture（R122 后语义）

`check_diagram`（`--diagram`，原 `--mermaid` 别名仍兼容）自 R122 起为**两层检查**：

1. **客观契约机械查**（`scripts/diagram-check.sh`）：单文件安全、可访问 SVG
   （`role="img"` + `aria-labelledby` + 非空 `title`/`desc`）、远程资源白名单、
   脚本策略、内联事件属性、`viewBox` 与 `min-width`。有图表产物且违约时，
   门禁按 `gate-enforce-level.conf` 的 `warn` 档阻断（退出非 0）。
2. **主观质量 AI 检查单**：选型、密度、可读性、图与代码事实一致性；机械层不替 AI 判断。

无图表产物时输出选型指引并通过，不制造“无图即失败”的假门禁。

## fixture 语义

| fixture | 语义态 | 断言 |
| --- | --- | --- |
| `compliant/` | 项目内无图表产物（`docs/diagrams`、`.swarm-yuan/diagrams` 均不存在） | 退出 0；`expect-output` 命中「未发现图表产物」与通过行 |
| `compliant-warn-no-diagram/` | 同上（保留原样本，验证无图不阻断） | 退出 0；`expect-output` 命中「未发现图表产物」与通过行 |

坏图（缺 `role="img"`、外链脚本、缺 `min-width`）的检出由
`tests/test-r122-diagram-capability.sh` 的结构检查正反态覆盖；新增
`violating*/` fixture 时应放 `docs/diagrams/*.html` 并以退出非 0 + `expect-output` 断言。

门禁行为真值来源：`assets/gates-advisory.sh` `check_diagram()` 与
`scripts/diagram-check.sh`；上游深检在 `runtime/diagram-design/` 可达时追加。
