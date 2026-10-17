<!-- overlay/custom/client/ia2/views/gov/GovAiQualitySection.vue -->
<!-- AI 产出质量区（三篇调研轮 E/F 件，挂签 7 度量体检）：增量变异得分（测得对不对）
     + 增量重复率（有没有重复造轮）双指标卡。数据=simcenter /quality 只读聚合
     （evidence/mutation-score.json + dup-ratio.json，推演工具链产物）；
     未跑/未计分/基线红中止一律如实呈现不硬凑（N1）；verdict 色态透传工具原判。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { fetchQuality, qualityCards, type QualityResponse } from '../../api/ai-quality'

const run = ref('')
const loading = ref(false)
const loadError = ref('')
const quality = ref<QualityResponse | null>(null)

const cards = computed(() => (quality.value ? qualityCards(quality.value) : []))

async function load(): Promise<void> {
  const r = run.value.trim()
  if (!r) { loadError.value = '请输入轮次目录名（如 20261015-v8-run20）'; return }
  loading.value = true
  loadError.value = ''
  try {
    quality.value = await fetchQuality(r)
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="gq" data-testid="gov-aiq">
    <div class="gq__bar">
      <div>
        <h4 class="gq__title">AI 产出质量</h4>
        <p class="gq__sub">判据锚=方案正本 V8.35 §5.8.2：变异得分评「测得对不对」（覆盖率只说明覆盖到），重复率防「重复造轮」（AI 不会自行收敛重复实现）。</p>
      </div>
      <div class="gq__input-row">
        <input v-model="run" class="gq__input" data-testid="gq-run" placeholder="轮次目录名（如 20261015-v8-run20）" @keyup.enter="load">
        <button class="gq__btn" type="button" data-testid="gq-load" :disabled="loading" @click="load">{{ loading ? '读取中…' : '读取' }}</button>
      </div>
    </div>
    <p v-if="loadError" class="gq__error" data-testid="gq-error">{{ loadError }}</p>

    <p v-if="!quality" class="gq__hint" data-testid="gq-empty">输入轮次读取双指标——变异得分与重复率证据在该轮 evidence/ 落盘后可查；未跑如实显示「未跑」。</p>
    <div v-else class="gq__grid">
      <div
        v-for="c in cards"
        :key="c.key"
        class="gq__card"
        :class="`is-${c.state}`"
        :data-testid="`gq-card-${c.key}`"
      >
        <div class="gq__card-label">{{ c.label }}</div>
        <div class="gq__card-headline" :data-testid="`gq-headline-${c.key}`">{{ c.headline }}</div>
        <div class="gq__card-detail" :data-testid="`gq-detail-${c.key}`">{{ c.detail }}</div>
        <div class="gq__card-source" :title="c.source">{{ c.source || '（无来源路径）' }}</div>
      </div>
    </div>
    <p v-if="quality" class="gq__meta">
      指标口径=增量变异得分 / 增量重复率（git base..HEAD；跑法见方案 §5.8.2 准出行）。
    </p>
  </section>
</template>

<style scoped>
.gq { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--bg-primary); }
.gq__bar { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.gq__title { margin: 0; font-size: 13px; font-weight: 600; }
.gq__sub { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); max-width: 560px; }
.gq__input-row { margin-left: auto; display: flex; gap: 6px; }
.gq__input { border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 8px; font-size: 12px; width: 220px; background: transparent; color: inherit; }
.gq__btn { border: 1px solid var(--border-color); border-radius: 4px; background: transparent; color: inherit; padding: 3px 12px; font-size: 12px; cursor: pointer; }
.gq__btn:disabled { opacity: 0.5; cursor: wait; }
.gq__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.gq__hint { font-size: 12px; color: var(--text-muted); margin: 0; }
.gq__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.gq__card { border: 1px solid var(--border-color); border-top: 3px solid var(--border-color); border-radius: 8px; padding: 8px 10px; }
.gq__card.is-pass { border-top-color: var(--success); }
.gq__card.is-fail { border-top-color: var(--error); }
.gq__card.is-unmeasured, .gq__card.is-absent { border-top-color: var(--text-muted); }
.gq__card-label { font-size: 12px; font-weight: 700; }
.gq__card-headline { font-size: 15px; font-weight: 700; margin-top: 2px; }
.gq__card.is-fail .gq__card-headline { color: var(--error); }
.gq__card.is-pass .gq__card-headline { color: var(--success); }
.gq__card.is-unmeasured .gq__card-headline, .gq__card.is-absent .gq__card-headline { color: var(--text-muted); }
.gq__card-detail { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.gq__card-source { font-size: 10px; font-family: ui-monospace, monospace; color: var(--text-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gq__meta { margin: 2px 0 0; font-size: 10.5px; color: var(--text-muted); }
</style>
