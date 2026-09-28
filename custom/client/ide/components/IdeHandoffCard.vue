<script setup lang="ts">
// IdeHandoffCard — 会话交接卡（UI 融合 UI-6，dsh coder "final message=entire
// handoff" 吸收落地）。侦听当前会话最后一条 assistant 消息：通过 handoff 六段
// 结构校验（server 域同源：validateHandoff/renderHandoff——注入同树相对引用）
// 即在消息流底部浮一张结构化交接卡（六段），不进 MessageList（零 upstream 侵入）。
import { computed } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { validateHandoff, renderHandoff, type Handoff } from '../../../server/handoff/handoff-script'

const chatStore = useChatStore()

const SECTION_TITLES: Record<keyof Handoff, string> = {
  done: '已完成', notDone: '未完成', risks: '风险', next: '下一步', artifacts: '产物', verify: '复核',
}

function parseHandoff(text: string): Handoff | null {
  // 六段式宽松解析：`## 标题` 分段（handoff-script 渲染同款标题），段内 - 列表行。
  const lines = text.split('\n')
  const sections: Partial<Record<keyof Handoff, string[]>> = {}
  const titleMap: Record<string, keyof Handoff> = {
    '已完成': 'done', '未完成': 'notDone', '风险': 'risks', '下一步': 'next', '产物': 'artifacts', '复核': 'verify',
  }
  let current: keyof Handoff | null = null
  for (const line of lines) {
    const m = /^##\s*(\S+)/.exec(line.trim())
    if (m && titleMap[m[1]]) {
      current = titleMap[m[1]]
      sections[current] = sections[current] ?? []
    } else if (current && line.trim().startsWith('-')) {
      sections[current]!.push(line.trim().slice(1).trim())
    }
  }
  const handoff = {
    done: sections.done ?? [], notDone: sections.notDone ?? [], risks: sections.risks ?? [],
    next: sections.next ?? [], artifacts: sections.artifacts ?? [], verify: sections.verify ?? [],
  }
  return validateHandoff(handoff).ok ? handoff : null
}

const handoff = computed<Handoff | null>(() => {
  const messages = chatStore.activeSession?.messages ?? []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role: string; content: unknown }
    if (m.role !== 'assistant') continue
    const text = typeof m.content === 'string' ? m.content : ''
    if (!text.includes('## ')) return null // 最近一条 assistant 无段落结构即无交接
    return parseHandoff(text)
  }
  return null
})

const sections = computed(() => Object.keys(SECTION_TITLES) as Array<keyof Handoff>)
</script>

<template>
  <section v-if="handoff" class="ide-handoff" data-testid="ide-handoff-card">
    <header class="ide-handoff__head">⇄ 交接书（final message = entire handoff）</header>
    <div
      v-for="key in sections"
      :key="key"
      class="ide-handoff__section"
      :data-testid="`ide-handoff-${key}`"
    >
      <span class="ide-handoff__title">{{ SECTION_TITLES[key] }}</span>
      <ul>
        <li v-for="(line, i) in handoff[key]" :key="i">{{ line }}</li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
.ide-handoff {
  border: 1px solid var(--border-color, #e0e0e0);
  border-left: 3px solid var(--primary-color, #18a058);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 6px 12px;
  font-size: 12px;
  background: var(--card-color, #fafafa);
}

.ide-handoff__head {
  font-weight: 600;
  margin-bottom: 4px;
}

.ide-handoff__section {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}

.ide-handoff__title {
  flex: 0 0 48px;
  color: var(--text-color-3, #999);
}

.ide-handoff__section ul {
  margin: 0;
  padding-left: 14px;
}
</style>
