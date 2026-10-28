---
name: adversarial-review-closeout
description: "Use when 蓝军/Checker 审查卡 done 回执：WARNING 逐条验真+三分处置。"
---

# 蓝军/Checker 审查回执的收口

触发：对抗审查卡（蓝军/Checker/评审卡）done 回执送达。PASS + N WARNING 不是收口信号，是新验收对象入场——审查者自身的报告同样是不信任面。

## 程序

1. **全文读完整报告**：网关回执常截断 WARNING 尾部；报告路径在卡 metadata/summary，先读全文再动作。
2. **WARNING 逐条独立验真**：每条用自己的命令复现证据（sed 到 file:line、grep 计数、ls 文件），不采信审查者转述。负向声明尤甚——审查者判「引用文件不存在/悬空」时，其搜索根可能只扫了 ~/.hermes 与 docker-sandbox，漏了用户级产物根（~/research/ 等）；判不存在前用 `find ~ -maxdepth 6 -name "<文件名>"` 或 mdfind 全域兜底。「查无此物」有两解：真没有，或没搜到。
3. **WARNING 三分处置**：
   - 代码层 bug（可 grep 复现）→ 派修复卡给未参与原任务的 worker；修复卡同时补防回归断言。
   - doc-only 且源头在派工方文本（worker 照抄了派工 body 里的错误术语）→ 派工方直修并注明订正来源；禁派卡让 worker 修源头不在自己身上的错。
   - 范围外并行线改动（红线文件在窗口内被别的线合法写入）→ 先全板任务库归属确认（+memory 回执佐证）；确认合法后只修引用歧义（补绝对路径），不回滚并行线内容。
4. **终合卡合并残余**：代码层修复+终合报告+commit draft 合一张终合卡；body 显式列「禁碰已处置文件」——orchestrator 已订正的文件再修=覆盖。

## 陷阱

- **结构断言须行首锚定**：lint/测试断言「## X 存在」用子串匹配对拼接损坏失明——生成器 join 缺分隔符时标题与下节头拼同一行，子串仍在而结构已坏。断言须逐行比对或 startswith。
- **派工文本新领域术语先验存在性**：往卡 body 写非自己领域的属性名/接口名前，先 grep 该领域权威源（设计文档/官方 semconv/API spec）确认术语存在——worker 忠实照抄派工文本，源头错术语会复制进产物与共享契约。

## 与相关 skill 分工

- worker-completion-independence-verification（default 侧）：验 worker 自述；本 skill 验审查者报告（另一信任面）。
- gateway-notification-disposition：回执判性（同源/延迟/新事件）；本 skill 管判性之后的 WARNING 处置。
- 注：default 侧 worker-completion-independence-verification 若增「审查者报告验真」节，可与本件合并收敛（留 curator）。
