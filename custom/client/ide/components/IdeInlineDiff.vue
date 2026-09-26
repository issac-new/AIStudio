<script setup lang="ts">
// IdeInlineDiff — inline diff 逐处接受/拒绝（复刻 claude-code inline diff accept/
// reject/edit + codex-product 聚焦式 keep/undo；UI 复刻 S1）。
// 形态：diff 行（+/-/context）逐 hunk 分组，每 hunk 头部 accept/reject 按钮；
// accept→整 hunk 保留改动（resolved 态），reject→标记撤回（调 run-undo 反向语义）。
import { computed, ref } from 'vue'

interface DiffLine { kind: 'add' | 'del' | 'ctx'; text: string }
interface Hunk { id: number; lines: DiffLine[]; decision: 'pending' | 'accepted' | 'rejected' }

const props = defineProps<{ diffText?: string }>()
const emit = defineEmits<{ (e: 'reject-hunk', hunkId: number); (e: 'accept-hunk', hunkId: number) }>()

/** unified diff 文本 → hunk 分组（@@ 头为界；缺头则整文件一 hunk）。 */
function parseHunks(text: string): Hunk[] {
  const lines = text.split('\n')
  const hunks: Hunk[] = []
  let cur: DiffLine[] = []
  let id = 0
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (cur.length) hunks.push({ id: id++, lines: cur, decision: 'pending' })
      cur = []
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) cur.push({ kind: 'add', text: line.slice(1) })
    else if (line.startsWith('-') && !line.startsWith('---')) cur.push({ kind: 'del', text: line.slice(1) })
    else if (line.startsWith(' ')) cur.push({ kind: 'ctx', text: line.slice(1) })
  }
  if (cur.length) hunks.push({ id: id++, lines: cur, decision: 'pending' })
  return hunks
}

const hunks = ref<Hunk[]>(parseHunks(props.diffText ?? ''))
const stats = computed(() => ({
  adds: hunks.value.flatMap((h) => h.lines).filter((l) => l.kind === 'add').length,
  dels: hunks.value.flatMap((h) => h.lines).filter((l) => l.kind === 'del').length,
}))

function decide(id: number, decision: 'accepted' | 'rejected'): void {
  hunks.value = hunks.value.map((h) => (h.id === id ? { ...h, decision } : h))
  emit(decision === 'accepted' ? 'accept-hunk' : 'reject-hunk', id)
}

function editLine(hunkId: number, lineIndex: number): void {
  const hunk = hunks.value.find((h) => h.id === hunkId)
  if (!hunk) return
  const line = hunk.lines[lineIndex]
  if (!line) return
  const next = window.prompt('修改该行：', line.text)
  if (next !== null) {
    line.text = next
  }
}
</script>

<template>
  <div v-if="hunks.length" class="ide-idiff" data-testid="ide-inline-diff">
    <div class="ide-idiff__stats">± {{ stats.adds }} / − {{ stats.dels }}</div>
    <div
      v-for="h in hunks"
      :key="h.id"
      class="ide-idiff__hunk"
      :class="`is-${h.decision}`"
      :data-testid="`ide-idiff-hunk-${h.id}`"
    >
      <div v-if="h.decision === 'pending'" class="ide-idiff__actions">
        <button type="button" class="ide-idiff__btn is-accept" :data-testid="`ide-idiff-accept-${h.id}`" @click="decide(h.id, 'accepted')">✓ 接受</button>
        <button type="button" class="ide-idiff__btn is-reject" :data-testid="`ide-idiff-reject-${h.id}`" @click="decide(h.id, 'rejected')">✕ 拒绝</button>
      </div>
      <div class="ide-idiff__verdict" v-else>{{ h.decision === 'accepted' ? '✓ 已接受' : '✕ 已拒绝' }}</div>
      <div
        v-for="(line, li) in h.lines"
        :key="li"
        class="ide-idiff__line"
        :class="`is-${line.kind}`"
        @dblclick="editLine(h.id, li)"
      ><span class="ide-idiff__sign">{{ line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ' }}</span>{{ line.text }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-idiff { font-family: ui-monospace, monospace; font-size: 11px; margin: 4px 12px; }
.ide-idiff__stats { color: var(--text-color-3, #999); padding: 2px 0; }
.ide-idiff__hunk { border: 1px solid var(--border-color, #e8e8e8); border-radius: 5px; margin: 6px 0; overflow: hidden; }
.ide-idiff__hunk.is-accepted { border-color: var(--primary-color, #18a058); opacity: 0.75; }
.ide-idiff__hunk.is-rejected { opacity: 0.45; }
.ide-idiff__actions { display: flex; gap: 6px; padding: 4px 8px; background: var(--hover-color, rgba(0, 0, 0, 0.03)); }
.ide-idiff__verdict { padding: 3px 8px; color: var(--text-color-3, #999); }
.ide-idiff__btn {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  font-size: 11px; padding: 1px 8px; cursor: pointer;
}
.ide-idiff__btn.is-accept:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.ide-idiff__btn.is-reject:hover { border-color: #d03050; color: #d03050; }
.ide-idiff__line { padding: 0 8px; white-space: pre-wrap; word-break: break-all; }
.ide-idiff__line.is-add { background: rgba(24, 160, 88, 0.1); }
.ide-idiff__line.is-del { background: rgba(208, 48, 80, 0.1); }
.ide-idiff__sign { display: inline-block; width: 12px; color: var(--text-color-3, #999); }
</style>
