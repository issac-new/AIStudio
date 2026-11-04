<script setup lang="ts">
// IdeReviewPanel — /review 评审面板（复刻 codex-product 两域评审+行内评论回流+
// codex 计划三选一收口形态；UI 复刻 R9）。数据面=review-store（patch 414：两域/
// 评论 open→resolved 回流/三裁决一次定音）。
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { authFetch } from '../utils/auth-fetch'

const chatStore = useChatStore()

interface Finding { id: string; domain: 'baseline' | 'uncommitted'; severity: 'high' | 'medium' | 'low'; text: string; resolved: boolean }

const findings = ref<Finding[]>([])
const verdict = ref<'accept' | 'reject' | 'conditional' | null>(null)
const reviewId = ref<string | null>(null)

/** 真实链：/review 创建（POST /api/review，domain 必填两域之一）→ GET /:id findings 回流。 */
async function startReview(): Promise<void> {
  try {
    const id = `ide-${chatStore.activeSessionId ?? 's'}-${Date.now()}`
    const res = await authFetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewId: id, domain: 'uncommitted' }),
    })
    if (!res.ok) return
    reviewId.value = id
    await refresh()
  } catch { /* 创建失败保持空态 */ }
}

async function refresh(): Promise<void> {
  if (!reviewId.value) return
  try {
    const res = await authFetch(`/api/review/${encodeURIComponent(reviewId.value)}`)
    if (!res.ok) return
    const body = (await res.json()) as {
      review?: { reviewId: string; domain?: string; comments?: Array<{ commentId?: string; file?: string; line?: number; body?: string; state?: string }> }
    }
    const rec = body.review
    const list = rec?.comments ?? []
    findings.value = list.map((c, i) => ({
      id: String(c.commentId ?? `c${i}`),
      domain: rec?.domain === 'baseline' ? 'baseline' : 'uncommitted',
      severity: 'medium',
      text: `${c.file}:${c.line} — ${c.body}`,
      resolved: c.state === 'resolved',
    }))
  } catch { /* 拉取失败保持现状 */ }
}

const open = computed(() => findings.value.filter((f) => !f.resolved))
const resolvedList = computed(() => findings.value.filter((f) => f.resolved))

// 2026-11-04 走查修复（消息区被工具条挤压）：空态常驻全宽三段（头行+空态块+
// verdict 行 ≈122px）是中栏底部最大挤占者，消息区被压到 44px、新消息几乎不可
// 见。改可折叠：头行常驻（~24px，计数+▾/▸），内容段（空态/findings/verdict）
// 仅展开态渲染。展开为事件驱动而非状态推导——findings 到场自动展开；open 全
// 部 resolved 后保持展开（verdict 三选一还没点，面板不得抽走——推导式
// `userUnfolded || open>0` 在最后一例 resolve 时瞬间塌掉，行为测试实锤）；
// 用户手动折叠后新 findings 再来再自动弹开。
const unfolded = ref(false)
watch(open, (list) => {
  if (list.length > 0) unfolded.value = true
})
const expanded = computed(() => unfolded.value)
function toggleFold(): void {
  unfolded.value = !unfolded.value
}

/** 已处理：先本地置 resolved，再回流服务端（patch 414 resolve 端点）；失败如实回退，
 *  避免 UI 显示 resolved 而服务端仍 open、下次 refresh 打回。 */
async function resolve(id: string): Promise<void> {
  const prev = findings.value
  findings.value = findings.value.map((f) => (f.id === id ? { ...f, resolved: true } : f))
  if (!reviewId.value) return // 无在评评审（如内部预置数据），仅本地态
  try {
    const res = await authFetch(`/api/review/${encodeURIComponent(reviewId.value)}/comments/${encodeURIComponent(id)}/resolve`, { method: 'POST' })
    if (!res.ok) throw new Error(`resolve ${res.status}`)
  } catch {
    findings.value = prev
  }
}

function decide(v: 'accept' | 'reject' | 'conditional'): void {
  verdict.value = v
  void chatStore.sendMessage?.(`/review verdict=${v} findings=${open.value.length} resolved=${resolvedList.value.length}`)
}
</script>

<template>
  <div class="ide-review" :class="{ 'is-collapsed': !expanded }" data-testid="ide-review-panel">
    <div class="ide-review__head" data-testid="ide-review-head" :title="expanded ? '折叠评审条' : '展开评审条'" @click="toggleFold">
      <span class="ide-review__caret" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
      ⎇ 评审 <span class="ide-review__counts">{{ open.length }} open · {{ resolvedList.length }} resolved</span>
    </div>
    <template v-if="expanded">
    <div v-if="!findings.length" class="ui-empty-state ui-empty-state--compact">
      暂无 findings
      <button type="button" class="ide-review__start" data-testid="ide-review-start" @click="startReview">发起评审</button>
    </div>
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
    </template>
  </div>
</template>

<style scoped lang="scss">
.ide-review { margin: 4px 12px; font-size: 12px; }
.ide-review__head { font-weight: 600; cursor: pointer; user-select: none; }
.ide-review__caret { display: inline-block; width: 12px; color: var(--text-muted); font-size: 10px; }
.ide-review__counts { color: var(--text-muted); font-weight: 400; font-size: 11px; }
.ide-review__finding {
  display: flex; gap: 6px; align-items: baseline; padding: 3px 6px; border-radius: 4px; margin: 2px 0;
}
.ide-review__finding.is-high { background: rgba(208, 48, 80, 0.07); }
.ide-review__finding.is-medium { background: rgba(184, 134, 11, 0.07); }
.ide-review__finding.is-resolved { color: var(--text-muted); }
.ide-review__sev { font-size: 10px; font-weight: 600; }
.ide-review__domain { font-size: 10px; color: var(--text-muted); }
.ide-review__text { flex: 1; }
.ide-review__resolve {
  border: none; background: transparent; color: var(--primary-color); cursor: pointer; font-size: 11px;
}
.ide-review__verdict { display: flex; gap: 6px; margin-top: 8px; }
.ide-review__btn {
  border: 1px solid var(--border-color); background: transparent; border-radius: 5px;
  padding: 4px 12px; cursor: pointer; font-size: 12px;
}
.ide-review__btn.is-active { border-color: var(--primary-color); color: var(--primary-color); }

.ide-review__start {
  border: 1px solid var(--border-color); background: transparent; border-radius: 4px;
  padding: 1px 8px; cursor: pointer; font-size: 11px; margin-left: 6px;
}
</style>
