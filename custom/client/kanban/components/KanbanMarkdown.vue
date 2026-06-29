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
  for (const raw of lines) {
    const line = raw
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${renderInline(bullet[1])}</li>`)
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
  }
  if (inList) out.push('</ul>')
  let html = out.join('\n')
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) =>
    `<pre class="kanban-md-code"><code>${escapeHtml(blocks[Number(i)])}</code></pre>`,
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
}
</style>
