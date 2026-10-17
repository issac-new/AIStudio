<!-- overlay/custom/client/ia2/views/sim/EvidencePanel.vue -->
<!-- S3 证据库（B2 工单，R7/R12——设计正本 §二 S3）：两类高频锚检索先行（$事件号
     与十六进制 commit；t_ 卡/! 房间服务端已支持，检索框提示注明）→结果进锚点
     抽屉（全产品唯一反查交互）；台账/journal 两张只读子表；帧图廊=帧目录端点
     未接，挂账态如实呈现（N1：缺数据如实显示缺席，不硬凑）。 -->
<script setup lang="ts">
import { ref } from 'vue'
import { fetchAnchor, type AnchorResult } from '../../api/supervision'
import { fetchClearanceLedger, type ClearanceLedgerView } from '../../api/gatekeeper'
import SimAnchorDrawer from '../../components/sim/SimAnchorDrawer.vue'

const anchorId = ref('')
const searching = ref(false)
const anchorError = ref('')
const anchorFound = ref<AnchorResult | null>(null)

const drawerOpen = ref(false)
const drawerTitle = ref('')
const drawerAnchorType = ref<'event' | 'commit' | null>(null)
const drawerAnchorId = ref('')
const drawerEvidence = ref('')

const ledger = ref<ClearanceLedgerView | null>(null)
const ledgerError = ref('')

async function search(): Promise<void> {
  const id = anchorId.value.trim()
  if (!id) { anchorError.value = '请输入锚（$事件号 / 十六进制 commit 号；t_ 卡号与 ! 房间号亦可用）'; return }
  searching.value = true
  anchorError.value = ''
  anchorFound.value = null
  try {
    const res = await fetchAnchor(id)
    anchorFound.value = res
    drawerAnchorType.value = res.type === 'event' ? 'event' : res.type === 'commit' ? 'commit' : null
    drawerAnchorId.value = id
    drawerTitle.value = `锚反查 ${id}`
    drawerEvidence.value = res.error
      ? `查询失败：${res.error}`
      : JSON.stringify(res.matches ?? res.data ?? res, null, 2)
    drawerOpen.value = true
  } catch (e) {
    anchorError.value = (e as Error).message
  } finally {
    searching.value = false
  }
}

async function loadLedger(): Promise<void> {
  ledgerError.value = ''
  try {
    ledger.value = await fetchClearanceLedger()
  } catch (e) {
    ledger.value = null
    ledgerError.value = (e as Error).message
  }
}
</script>

<template>
  <div class="ev" data-testid="ev-panel">
    <section class="ev__box">
      <h4 class="ev__h">锚点检索</h4>
      <div class="ev__row">
        <input v-model="anchorId" class="ev__input" data-testid="ev-anchor-input" placeholder="$ 事件号 或 7-40 位十六进制 commit（t_ 卡 / ! 房间亦可）" @keyup.enter="search">
        <button class="ev__btn" type="button" data-testid="ev-anchor-search" :disabled="searching" @click="search">反查</button>
      </div>
      <p v-if="anchorError" class="ev__error" data-testid="ev-anchor-error">{{ anchorError }}</p>
      <p v-else-if="anchorFound" class="ev__hint" :data-testid="'ev-anchor-found'">命中类型：{{ anchorFound.type }}（原文已进右侧抽屉）。</p>
    </section>

    <section class="ev__box">
      <h4 class="ev__h">帧图廊</h4>
      <p class="ev__hint" data-testid="ev-frames-absent">帧目录端点未接（挂账项）——按步分组的帧网格待端点就绪后实装，当前如实缺席。</p>
    </section>

    <section class="ev__box">
      <h4 class="ev__h">台账（代偿九型，只读）</h4>
      <button class="ev__btn" type="button" data-testid="ev-ledger-load" @click="loadLedger">读取台账</button>
      <p v-if="ledgerError" class="ev__error" data-testid="ev-ledger-error">{{ ledgerError }}</p>
      <p v-else-if="!ledger" class="ev__hint">点击读取（消费 orgloop /ledger 端点）。</p>
      <template v-else>
        <p class="ev__hint" data-testid="ev-ledger-summary">待处理 {{ ledger.open }}｜已处理 {{ ledger.resolved }}｜已豁免 {{ ledger.waived }}｜{{ ledger.pass ? '清算放行' : '禁止启动新运行' }}</p>
        <table v-if="ledger.rows.length > 0" class="ev__table" data-testid="ev-ledger-table">
          <thead><tr><th>类型</th><th>缺陷</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="r in ledger.rows.slice(0, 50)" :key="r.id">
              <td>{{ r.type }}</td>
              <td>{{ r.defect || '—' }}</td>
              <td>
                <span class="ev__state" :class="`ev__state--${r.state}`" :data-testid="`ev-ledger-state-${r.id}`">{{ r.state === 'open' ? '待处理' : r.state === 'waived' ? '已豁免' : '已处理' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <section class="ev__box">
      <h4 class="ev__h">journal 子表</h4>
      <p class="ev__hint">观察窗 journal 的检索与时间线在「监督面板」签承载（同源端点，单一消费面不重复建表）。</p>
    </section>

    <SimAnchorDrawer
      :open="drawerOpen"
      :title="drawerTitle"
      :anchor-type="drawerAnchorType"
      :anchor-id="drawerAnchorId"
      :evidence="drawerEvidence"
      @close="drawerOpen = false"
    />
  </div>
</template>

<style scoped lang="scss">
.ev { display: flex; flex-direction: column; gap: 12px; }
.ev__box { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; }
.ev__h { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.ev__row { display: flex; gap: 6px; }
.ev__input {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  font-family: var(--font-mono);
}
.ev__btn {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.ev__error { color: var(--ia-fail); font-size: 12px; margin: 6px 0 0; word-break: break-all; }
.ev__hint { color: var(--text-muted); font-size: 12px; margin: 6px 0 0; }
.ev__table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
.ev__table th, .ev__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); }
.ev__state { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.ev__state--open { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.ev__state--waived { color: var(--ia-compensated); background: rgba(150, 84, 214, 0.18); }
.ev__state--resolved { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
</style>
