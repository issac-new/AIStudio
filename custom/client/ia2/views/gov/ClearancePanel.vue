<!-- overlay/custom/client/ia2/views/gov/ClearancePanel.vue -->
<!-- 签 3 清偿门（C2 工单，R6——设计正本 §二 S11）：台账全量表（三态徽）+
     按目标 resolve（挂 PR 锚）/waive（强制理由）审批 + 开轮放行灯
     （灯值与 check-clearance 同源——orgloop X2 端点单一消费面）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchClearanceLedger, resolveClearance, waiveClearance, groupClearanceTargets,
  type ClearanceLedgerView,
} from '../../api/gatekeeper'
import { humanDateTime } from '../../format'

const ledger = ref<ClearanceLedgerView | null>(null)
const loadError = ref('')
const rawError = ref('')
const busy = ref(false)
const actionMsg = ref('')

/** 台账技术错误人话化：正文给人能懂的原因与下一步，原始错误进 title 供排查。 */
function humanizeLedgerError(message: string): string {
  return /ORGLOOP_LEDGER_TSV/.test(message)
    ? '还没有遗留事项台账（开始一次运行后生成）'
    : message
}

const resolveInput = ref<Record<string, string>>({})
const waiveInput = ref<Record<string, string>>({})

const targets = computed(() => (Array.isArray(ledger.value?.rows) ? groupClearanceTargets(ledger.value) : []))
const rows = computed(() => (Array.isArray(ledger.value?.rows) ? [...ledger.value.rows].reverse().slice(0, 100) : []))

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  rawError.value = ''
  try {
    ledger.value = await fetchClearanceLedger()
  } catch (e) {
    rawError.value = (e as Error).message
    loadError.value = humanizeLedgerError(rawError.value)
  } finally {
    busy.value = false
  }
}

async function act(kind: 'resolve' | 'waive', target: string): Promise<void> {
  busy.value = true
  actionMsg.value = ''
  loadError.value = ''
  rawError.value = ''
  try {
    if (kind === 'resolve') {
      ledger.value = await resolveClearance(target, (resolveInput.value[target] ?? '').trim())
      delete resolveInput.value[target]
    } else {
      ledger.value = await waiveClearance(target, (waiveInput.value[target] ?? '').trim())
      delete waiveInput.value[target]
    }
    actionMsg.value = `已${kind === 'resolve' ? '登记根治' : '豁免'} ${targetLabel(target)}（留痕在 orgloop 处置记录）`
  } catch (e) {
    rawError.value = (e as Error).message
    loadError.value = humanizeLedgerError(rawError.value)
  } finally {
    busy.value = false
  }
}

const STATE_LABEL: Record<string, string> = { open: '未清', waived: '豁免', resolved: '已清' }

onMounted(() => { void refresh() })
</script>

<script lang="ts">
// 信息降噪（2026-10-22）：主文案说人话供人类员工决策，内部代号只进 title 供排查反查。
// 导出为守门测试锚点。
/** 清算目标（缺陷 PR 编号）的人话名。 */
export const TARGET_LABEL: Record<string, string> = {
  'PR-1': '锁文件',
  'PR-2': '自动批准',
  'PR-3': '催办',
  'PR-4': '卡片补录/代办',
  'PR-5': '环形依赖',
  'PR-6': '挂账先例',
  'PR-7': '预设派发',
}

/** 台账类型码的人话名；未登记的码原样透出，不假装认识。 */
export const KIND_LABEL: Record<string, string> = {
  'dispatch-preset': '预设派发',
  'auto-approve': '自动批准',
  nudge: '催办',
  'card-walk-done': '卡片代办',
  dispatch: '派发',
}

/** 目标显示名：已知 PR 给缺陷名；未知 PR-N 标「补偿记录」；非 PR 目标（defect 缺席回落 type）按类型码映射。 */
export function targetLabel(target: string): string {
  const key = String(target ?? '').trim()
  if (TARGET_LABEL[key]) return TARGET_LABEL[key]
  if (/^PR-\d+$/.test(key)) return `补偿记录 ${key}`
  return KIND_LABEL[key] ?? key
}

/** 类型显示名：命中映射给人话，未命中原样返回。 */
export function kindLabel(kind: string): string {
  const key = String(kind ?? '').trim()
  return KIND_LABEL[key] ?? key
}
</script>

<template>
  <div class="clr" data-testid="clr-panel">
    <div class="clr__bar">
      <h4 class="clr__h">遗留项清算</h4>
      <span
        v-if="ledger"
        class="clr__lamp"
        :class="ledger.pass ? 'clr__lamp--green' : 'clr__lamp--red'"
        data-testid="clr-lamp"
      >{{ ledger.pass ? '放行（零未清）' : `${ledger.open} 项未清·清算前不能启动新运行` }}</span>
      <button class="clr__btn" type="button" data-testid="clr-refresh" :disabled="busy" @click="refresh">刷新</button>
    </div>

    <p v-if="loadError" class="clr__error" data-testid="clr-error" :title="rawError">{{ loadError }}</p>
    <p v-if="actionMsg" class="clr__msg" data-testid="clr-action-msg">{{ actionMsg }}</p>
    <p v-else-if="!ledger && !loadError" class="clr__hint">读取中……</p>

    <template v-if="ledger">
      <section class="clr__box">
        <h5 class="clr__h2">按缺陷目标审批（resolve 挂 PR 锚；waive 强制理由）</h5>
        <p v-if="targets.length === 0" class="clr__hint" data-testid="clr-targets-empty">台账无未清项。</p>
        <div v-for="g in targets" :key="g.target" class="clr__target" :data-testid="`clr-target-${g.target}`">
          <div class="clr__target-head">
            <span class="clr__target-name" :title="g.target">{{ targetLabel(g.target) }}</span>
            <span class="clr__target-meta" :title="g.types.join('、')">{{ g.openCount }} 项未清（{{ g.types.map(kindLabel).join('、') }}）</span>
          </div>
          <div class="clr__target-actions">
            <input v-model="resolveInput[g.target]" class="clr__input" :data-testid="`clr-resolve-pr-${g.target}`" placeholder="根治 PR 锚（必填）">
            <button class="clr__btn" type="button" :data-testid="`clr-resolve-${g.target}`" :disabled="busy || !(resolveInput[g.target] ?? '').trim()" @click="act('resolve', g.target)">登记根治</button>
            <input v-model="waiveInput[g.target]" class="clr__input clr__input--reason" :data-testid="`clr-waive-reason-${g.target}`" placeholder="批准理由（必填）">
            <button class="clr__btn" type="button" :data-testid="`clr-waive-${g.target}`" :disabled="busy || !(waiveInput[g.target] ?? '').trim()" @click="act('waive', g.target)">批准豁免</button>
          </div>
        </div>
      </section>

      <section class="clr__box">
        <h5 class="clr__h2">台账全量（{{ ledger.rows?.length ?? 0 }} 行，倒序前 100）</h5>
        <table class="clr__table" data-testid="clr-table">
          <thead><tr><th>类型</th><th>缺陷</th><th>时刻</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td :title="r.type">{{ kindLabel(r.type) }}</td>
              <td>{{ r.defect || '—' }}</td>
              <td class="clr__mono">{{ humanDateTime((r as { ts?: string }).ts) }}</td>
              <td><span class="clr__state" :class="`clr__state--${r.state}`">{{ STATE_LABEL[r.state] }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.clr { display: flex; flex-direction: column; gap: 12px; }
.clr__bar { display: flex; gap: 10px; align-items: center; }
.clr__h { margin: 0; font-size: 13px; font-weight: 600; }
.clr__h2 { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.clr__lamp { padding: 1px 10px; border-radius: 4px; font-size: 12px; color: var(--text-on-accent); }
.clr__lamp--red { background: var(--error); }
.clr__lamp--green { background: var(--ia-fresh); }
.clr__btn {
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.clr__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.clr__msg { color: var(--ia-fresh); font-size: 12px; margin: 0; }
.clr__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.clr__box { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; }
.clr__target { padding: 6px 0; & + & { border-top: 1px dashed var(--border-color); } }
.clr__target-head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.clr__target-name { font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
.clr__target-meta { font-size: 11px; color: var(--text-muted); }
.clr__target-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.clr__input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 170px;
  background: transparent;
  color: inherit;
  &--reason { flex: 1; min-width: 180px; }
}
.clr__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.clr__table th, .clr__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); }
.clr__mono { font-family: var(--font-mono); font-size: 11px; }
.clr__state { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.clr__state--open { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.clr__state--waived { color: var(--ia-compensated); background: rgba(150, 84, 214, 0.18); }
.clr__state--resolved { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
</style>
