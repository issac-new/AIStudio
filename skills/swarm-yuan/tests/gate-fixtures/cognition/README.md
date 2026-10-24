# cognition gate-fixture（R13 后语义）

check_cognition 自 R13 批次1a 起为 AI 判断引导模式（机械计分退役，GATE_AI_JUDGMENT 唯一模式）：
输出固定的逐维自查引导文案，唯一状态信号 = 认知自查留痕文件是否存在。

- compliant/：含 .swarm-yuan/notes/cognition.md → 断言 pass 行（留痕存在）
- compliant-full/：无留痕 → 断言 warn 行（留痕缺失，advisory 不阻断）

两组均 exit 0（advisory 永不 fail）。旧"五层认知基底 X/22 机械分数"断言已随计分退役删除；
cognition-metrics.jsonl 是退役计分时代的历史产物，已删除。
