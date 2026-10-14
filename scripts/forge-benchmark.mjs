#!/usr/bin/env node
// overlay[benchmarkforge] 专家基线考卷生成 CLI（2026-10-14 阿里调研轮 C）。
// 用法：
//   npm run bench:expert -- --repo <仓库路径> --set-name <集名> [--since 3.months.ago] [--limit 20] [--track e2e|process]
// 产题即导入 Eval 用例集（建议随后在 Eval Studio 内 sealSet 密封——同仓历史对
// 被测 agent 可见时考卷失效，密封是逐题对错不出库的防线）。
const { runForgeCli } = await import('../custom/server/benchmarkforge/forge-cli.ts')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const res = await runForgeCli({
  repo: arg('repo', '.'),
  setName: arg('set-name', '专家基线集'),
  since: arg('since', undefined),
  limit: Number(arg('limit', '20')) || 20,
  track: arg('track', 'e2e') === 'process' ? 'process' : 'e2e',
})
if (!res.ok) {
  console.error('FAIL:', (res.problems || []).join('；'))
  process.exit(1)
}
console.log(`OK: 导入 ${res.tasks} 题进 Eval 用例集（建议 sealSet 密封）`)
