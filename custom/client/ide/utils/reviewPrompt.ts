// overlay/custom/client/ide/utils/reviewPrompt.ts
// /review 评审模式提示词资产（codex-product /review 语义移植）：
// 专职 reviewer 回合——只读盘点当前工作区改动，按发现严重度分级输出，
// 不改任何文件。落点是 sendMessage 注入普通代理回合（与 M3 同范式：
// 提示词资产 + 普通回合，无专用写工具，审批门即确认门）。
export interface ReviewPromptOptions {
  /** 目标范围提示（如分支名/目录）；空 = 当前工作区全部未提交改动 */
  scope?: string
}

export function buildReviewPrompt(opts: ReviewPromptOptions = {}): string {
  const scopeLine = opts.scope?.trim()
    ? `评审范围：${opts.scope.trim()}。`
    : '评审范围：当前工作区全部未提交改动（git status + git diff）。'
  return `请对本工作区做一次只读代码评审。

${scopeLine}

## 硬性约束
1. 只读：用 git status / git diff / read_file 等只读手段盘点；禁止改任何文件。
2. 逐文件给结论，不要泛泛而谈；每条发现标注文件与行号锚点。
3. 严重度分三级：
   - P0 阻断（bug/安全/数据丢失风险，必须修才能合入）
   - P1 应当修（可维护性/一致性/遗漏的测试）
   - P2 建议（风格/可读性/可选项）
4. 先给一段「总评」（≤3 句：改动意图是否合理、整体质量、能否合入），
   再按严重度分组列发现；没有该级别的发现就写「无」。
5. 结尾给「建议动作」：直接合入 / 修完 P0 再合 / 需要再谈（选一个）。

现在开始盘点工作区并给出评审。`
}
