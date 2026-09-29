<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  source: string
}>()

const renderedHtml = computed(() => {
  if (!props.source) return ''
  return renderMarkdown(props.source)
})

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInline(esc: string): string {
  return esc
    .replace(/`([^`\n]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      (_m, text, href) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
    )
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)
}

function renderMarkdown(src: string): string {
  const blocks: string[] = []
  let working = String(src).replace(/```([\s\S]*?)```/g, (_m, code) => {
    blocks.push(code)
    return `\u0000CODE${blocks.length - 1}\u0000`
  })
  const escaped = escapeHtml(working)
  const lines = escaped.split(/\r?\n/)
  const out: string[] = []
  let inList = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    // 引用块：连续 > 行合并为一个 blockquote（治理工件结论/注记段）
    const quote = /^\s*&gt;\s?(.*)$/.exec(line)
    if (quote) {
      const qs: string[] = [quote[1]]
      i += 1
      while (i < lines.length) {
        const q2 = /^\s*&gt;\s?(.*)$/.exec(lines[i])
        if (!q2) break
        qs.push(q2[1])
        i += 1
      }
      out.push(`<blockquote>${qs.map((q) => `<p>${renderInline(q)}</p>`).join('')}</blockquote>`)
      continue
    }
    // 表格：当前行含 | 且下一行是 |---| 分隔行 → 表头+表体渲染（治理工件台账/矩阵主体）
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const head = splitRow(line)
      i += 2
      const body: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        body.push(splitRow(lines[i]))
        i += 1
      }
      out.push(
        `<table class="kanban-md-table"><thead><tr>${head
          .map((c) => `<th>${renderInline(c)}</th>`)
          .join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      )
      continue
    }
    if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${renderInline(bullet[1])}</li>`)
      i += 1
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
    } else if (line.trim() === '') {
      out.push('')
    } else {
      out.push(`<p>${renderInline(line)}</p>`)
    }
    i += 1
  }
  if (inList) out.push('</ul>')
  let html = out.join('\n')
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_m, n) =>
    `<pre class="kanban-md-code"><code>${escapeHtml(blocks[Number(n)])}</code></pre>`,
  )
  return html
}
</script>

<template>
  <div class="kanban-markdown" v-html="renderedHtml" />
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-markdown {
  font-size: 13px;
  line-height: 1.6;
  color: $text-primary;

  :deep(p) { margin: 0.25rem 0; }
  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    margin: 0.6rem 0 0.2rem;
    line-height: 1.25;
  }
  :deep(h1) { font-size: 1.05rem; }
  :deep(h2) { font-size: 0.95rem; }
  :deep(h3) { font-size: 0.88rem; }
  :deep(h4) { font-size: 0.82rem; }
  :deep(ul) {
    margin: 0.25rem 0 0.25rem 1.1rem;
    padding: 0;
  }
  :deep(li) { margin: 0.1rem 0; }
  :deep(a) {
    color: $accent-primary;
    text-decoration: underline;
  }
  :deep(code) {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8rem;
    padding: 0.05rem 0.3rem;
    background: color-mix(in srgb, currentColor 8%, transparent);
    border-radius: 3px;
    color: inherit;
  }
  :deep(pre.kanban-md-code) {
    margin: 0.35rem 0;
    padding: 0.5rem 0.6rem;
    background: color-mix(in srgb, currentColor 6%, transparent);
    border: 1px solid $border-light;
    border-radius: $radius-sm;
    overflow-x: auto;

    code {
      background: transparent;
      padding: 0;
      font-size: 0.8rem;
      white-space: pre;
      color: inherit;
    }
  }
  :deep(strong) { font-weight: 600; }
  :deep(blockquote) {
    margin: 0.35rem 0;
    padding: 0.25rem 0.7rem;
    border-left: 3px solid $accent-primary;
    background: color-mix(in srgb, currentColor 5%, transparent);
    border-radius: 0 $radius-sm $radius-sm  0;

    p { margin: 0.15rem 0; }
  }
  :deep(table.kanban-md-table) {
    margin: 0.4rem 0;
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;

    th, td {
      border: 1px solid $border-light;
      padding: 0.3rem 0.5rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: color-mix(in srgb, currentColor 6%, transparent); font-weight: 600; }
    tbody tr:nth-child(even) td {
      background: color-mix(in srgb, currentColor 3%, transparent);
    }
  }
}
</style>
