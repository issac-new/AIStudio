<script setup lang="ts">
// IdeReviewPanel — /review 评审面板（复刻 codex-product 两域评审+行内评论回流+
// codex 计划三选一收口形态；UI 复刻 R9）。数据面=review-store（patch 414：两域/
// 评论 open→resolved 回流/三裁决一次定音）。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

const chatStore = useChatStore()

interface Finding { id: string; domain: 'baseline' | 'uncommitted'; severity: 'high' | 'medium' | 'low'; text: string; resolved: boolean }

const findings = ref<Finding[]>([])
const verdict = ref<'accept' | 'reject' | 'conditional' | null>(null)

const open = computed(() => findings.value.filter((f) => !f.resolved))
const resolvedList = computed(() => findings.value.filter((f) => f.resolved))

function resolve(id: string): void {
  findings.value = findings.value.map((f) => (f.id === id ? { ...f, resolved: true } : f))
}

function decide(v: 'accept' | 'reject' | 'conditional'): void {
  verdict.value = v
  void chatStore.sendMessage?.(`/review verdict=${v} findings=${open.value.length} resolved=${resolvedList.value.length}`)
}
</script>

<template>
  <div class="ide-review" data-testid="ide-review-panel">
    <div class="ide-review__head">⎇ 评审 <span class="ide-review__counts">{{ open.length }} open · {{ resolvedList.length }} resolved</span></div>
    <div v-if="!findings.length" class="ide-review__empty">暂无 findings（/review 产出后此处回流）</div>
    <div v-for="f in open" :key="f.id" class="ide-review__finding" :class="`is-${f.severity}`" :data-testid="`ide-review-${f.id}`">
      <span class="ide-review__sev">{{ f.severity }}</span>
      <span class="ide-review__domain">{{ f.domain === 'baseline' ? '基线' : '未提交' }}</span>
      <span class="ide-review__text">{{ f.text }}</span>
      <button type="button" class="ide-review__resolve" :data-testid="`ide-review-resolve-${f.id}`" @click="resolve(f.id)">已处理</button>
    </div>
    <div v-for="f in resolvedList" :key="f.id" class="ide-review__finding is-resolved">
      ✓ {{ f.text }}
    </div>
    <div class="ide-review__verdict">
      <button
        v-for="v in ['accept', 'reject', 'conditional'] as const"
        :key="v"
        type="button"
        class="ide-review__btn"
        :class="{ 'is-active': verdict === v }"
        :data-testid="`ide-review-verdict-${v}`"
        @click="decide(v)"
      >{{ v === 'accept' ? '通过' : v === 'reject' ? '打回' : '有条件' }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-review { margin: 4px 12px; font-size: 12px; }
.ide-review__head { font-weight: 600; }
.ide-review__counts { color: var(--text-color-3, #999); font-weight: 400; font-size: 11px; }
.ide-review__empty { color: var(--text-color-3, #999); padding: 8px 0; }
.ide-review__finding {
  display: flex; gap: 6px; align-items: baseline; padding: 3px 6px; border-radius: 4px; margin: 2px 0;
}
.ide-review__finding.is-high { background: rgba(208, 48, 80, 0.07); }
.ide-review__finding.is-medium { background: rgba(184, 134, 11, 0.07); }
.ide-review__finding.is-resolved { color: var(--text-color-3, #bbb); }
.ide-review__sev { font-size: 10px; font-weight: 600; }
.ide-review__domain { font-size: 10px; color: var(--text-color-3, #999); }
.ide-review__text { flex: 1; }
.ide-review__resolve {
  border: none; background: transparent; color: var(--primary-color, #18a058); cursor: pointer; font-size: 11px;
}
.ide-review__verdict { display: flex; gap: 6px; margin-top: 8px; }
.ide-review__btn {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 5px;
  padding: 4px 12px; cursor: pointer; font-size: 12px;
}
.ide-review__btn.is-active { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
</style>
