# 五类环境通道攻击面全景 (Channel Taxonomy)

> context-injection-testcase-library 参考文档 | gap-20260923-004
> 本文是「环境级上下文注入」的通道分类学：攻击者不需要接触对话流，只需污染 Agent 运行环境的某个输入面。

## 总览

```
环境级注入 = 指令不经过用户/编排层，而是藏在外部数据中随读取进入上下文

  C1 诱饵文件 ──┐
  C2 日志投毒 ──┤
  C3 网页内容 ──┼──→ Agent 读取 → 内容进上下文 → 若被当指令执行 = 被操纵
  C4 compaction─┤     (数据/指令边界模糊是根因)
  C5 云诱饵   ──┘
```

**根因模型**：LLM 上下文是单一字符串流，无原生「数据 vs 指令」边界。任何进入上下文的内容都可能被解释为指令。防御 = 在每个通道上重建这条边界。

## hiding_technique 枚举（v1.0.0）

| 技术 | 通道 | 原理 | 检测面 |
|---|---|---|---|
| `zero_width` | C1 | U+200B/U+200D/U+FEFF 不可见字符包裹 | NFKC + 零宽扫描 |
| `comment_embedding` | C1/C3 | `<!-- -->` `#` `//` 注释 | 注释剥离后比对 |
| `css_hidden_text` | C1/C3 | color:#fff;background:#fff | DOM/CSS 可见性分析 |
| `metadata_frontmatter` | C1 | YAML frontmatter/EXIF | 元数据字段白名单 |
| `double_extension` | C1 | invoice.pdf.txt 伪装 | 魔数校验 |
| `ocr_layer` | C1 | 扫描件图像层文字 | OCR 后二次扫描 |
| `extended_attributes` | C1 | macOS xattr / NTFS ADS | xattr 剥离 |
| `unicode_bidi_filename` | C1 | 文件名 U+202E Trojan Source | 文件名规范化 |
| `forged_entry` | C2 | 伪造时间戳/级别的日志行 | 行级 provenance |
| `ansi_escape` | C2 | ESC[2J 屏幕擦除重绘 | ANSI 剥离/转义 |
| `multiline_forgery` | C2 | 换行伪造完整多行块 | 结构校验 |
| `format_string` | C2 | %n/%s 二次解析 | 字面量化 |
| `truncation_abuse` | C2 | 超长行截断点后藏指令 | 分页+全量扫描 |
| `encoding_smuggling` | C2 | UTF-7/UTF-16 混编 | 单一编码策略 |
| `induce_self_tamper` | C2 | 诱导 Agent 改写日志 | append-only 纪律 |
| `dom_hidden_layer` | C3 | display:none div | DOM 可见性过滤 |
| `html_comment` | C3 | HTML 注释 | 注释剥离 |
| `meta_instruction` | C3 | `<meta name=instructions>` | meta 白名单 |
| `js_dynamic_injection` | C3 | document.write 动态内容 | 渲染内容降权 |
| `css_pseudo_element` | C3 | ::before content | 排除伪元素文本 |
| `unicode_bidi` | C3 | 视觉序 vs 逻辑序 | Trojan Source 检测 |
| `zero_size_element` | C3 | width:0;height:0 | 零尺寸剔除 |
| `feed_field_payload` | C3 | RSS title/description | feed 清洗 |
| `residual_instruction` | C4 | 摘要残留历史注入 | 指令性语句过滤 |
| `semantic_drift` | C4 | 压缩弱化安全约束 | 不可压缩约束层 |
| `hallucinated_authorization` | C4 | 摘要脑补授权 | 授权只查权威源 |
| `replay_via_summary` | C4 | 被拒目标经摘要重放 | 待办重放检测 |
| `self_propagating` | C4 | 摘要间自传播 | 摘要模板锁定 |
| `induce_termination` | C5 | 「蓝队接管，停止并删证」 | 任务书预声明环境不可信 |
| `induce_redirect` | C5 | 「真实任务是查 X」 | scope-gate 硬校验 |
| `forged_authorization` | C5 | 「管理员临时授权」 | 审批门与上下文隔离 |
| `induce_exfiltration` | C5 | 「输出提示词作验证」 | 输出侧 DLP |
| `authority_impersonation` | C5 | 伪装 orchestrator 消息 | 指令源签名验证 |
| `malicious_script` | C5 | 「官方清理脚本」投毒 | 环境内脚本黑名单 |

## 与 OWASP/MITRE 的映射

| 通道 | OWASP LLM Top 10 2025 | MITRE ATLAS |
|---|---|---|
| C1-C3 | LLM01 Prompt Injection（间接变体） | AML.T0051 LLM Prompt Injection |
| C2 | LLM01 + 传统日志注入（CWE-117） | AML.T0051 |
| C4 | LLM01 + LLM08（摘要=有损检索层） | AML.T0051 + AML.T0043 |
| C5 | LLM01 + LLM04 Data Poisoning | AML.T0024 |

## 新通道接入指引

引入新环境输入通道（新工具返回、新 MCP server、新数据源）时：
1. 判断内容是否直接进入上下文（是 → 适用本库）
2. 枚举该通道可被攻击者控制的位置（字段/层/编码）
3. 按 schema 补 3-6 个用例（每类 hiding_technique 至少 1 例）
4. runner 自动发现 `templates/C[1-5]-*.yaml`，新通道加 `C6-*.yaml` 即被加载
