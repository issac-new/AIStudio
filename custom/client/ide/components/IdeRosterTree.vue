<script setup lang="ts">
// IdeRosterTree — 名册树视图（吸收第一批 B5，routa team-page 名册树：
// lead 聚合成员+delegates/descendants 计数）。数据源=GET /api/zcode-engine/
// squad/roster（squads 定义）+ subagentStreams 聚合 delegateCounts（活跃委派数）。
// 树投影=utils/roster-tree.ts（纯函数，routa 语义）。
import { computed, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { buildRosterTree, type RosterNode } from '../utils/roster-tree'

const chat = useChatStore()
const squads = ref<Record<string, { leader: string; members: string[] }>>({})
const open = ref(true)
const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await fetch('/api/zcode-engine/squad/roster')
    if (!res.ok) throw new Error(`http_${res.status}`)
    const body = await res.json() as { squads?: Record<string, { leader: string; members: string[] }> }
    squads.value = body.squads ?? {}
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
})

/** agent → 活跃委派数（subagentStreams 按 goal 前缀/成员名聚合——名册成员名与
 * subagentId 无稳定映射时计 0，诚实不虚构）。 */
const delegateCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const [, s] of chat.subagentStreams) {
    if (s.status === 'running' || s.status === 'pending') {
      // 成员名匹配：stream 的 goal/subagentId 含成员名即计入（粗粒度，标注估算）。
      for (const members of Object.values(squads.value)) {
        for (const m of members.members) {
          if ((s.goal ?? '').includes(m) || (s.subagentId ?? '').includes(m)) {
            counts[m] = (counts[m] ?? 0) + 1
          }
        }
      }
    }
  }
  return counts
})

const tree = computed<RosterNode[]>(() =>
  buildRosterTree({ squads: squads.value, delegateCounts: delegateCounts.value }))
</script>

<template>
  <div v-if="Object.keys(squads).length" class="ide-roster" data-testid="ide-roster-tree">
    <button type="button" class="ide-roster__head" data-testid="ide-roster-toggle" @click="open = !open">
      ⌘ 名册树 · {{ Object.keys(squads).length }} squads {{ open ? '▾' : '▸' }}
    </button>
    <div v-if="open" class="ide-roster__body">
      <div v-for="node in tree" :key="node.id" class="ide-roster__node" :data-testid="`ide-roster-node-${node.id}`">
        <span class="ide-roster__lead" :title="`leader: ${squads[node.id]?.leader}`">★</span>
        <span class="ide-roster__id">{{ node.id }}</span>
        <span class="ide-roster__count" :title="`直接委派 ${node.delegates} · 全部后代 ${node.descendants}（委派计数按名册成员名匹配估算）`">
          ⓓ{{ node.delegates }} ⤵{{ node.descendants }}
        </span>
        <span class="ide-roster__members" :title="(squads[node.id]?.members ?? []).join('、')">
          {{ (squads[node.id]?.members ?? []).slice(0, 5).join(' ') }}{{ (squads[node.id]?.members ?? []).length > 5 ? ' …' : '' }}
        </span>
      </div>
    </div>
    <p v-if="loadError" class="ide-roster__err" data-testid="ide-roster-error">{{ loadError }}</p>
  </div>
</template>

<style scoped lang="scss">
.ide-roster { margin: 4px 12px; font-size: 12px; }
.ide-roster__head {
  border: none; background: transparent; cursor: pointer; padding: 2px 0;
  font-size: 11px; font-weight: 600; color: var(--text-color-3, #999); display: block; width: 100%; text-align: left;
}
.ide-roster__node { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; }
.ide-roster__lead { color: var(--warning-color, #f0a020); font-size: 11px; }
.ide-roster__id { font-weight: 600; color: var(--text-color-2, #555); }
.ide-roster__count { font-size: 10px; color: var(--info-color, #2080f0); white-space: nowrap; }
.ide-roster__members { font-size: 10px; color: var(--text-color-3, #999); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-roster__err { font-size: 10px; color: var(--error-color, #d03050); margin: 2px 0; }
</style>
