<!-- overlay/custom/client/governance/components/EmergencyStopSection.vue -->
<!-- AGT 吸收轮 E（2026-10-21）：全局紧急停止 + 停后活性复核。
     语义如实（对齐 AGT LIMITATIONS）：合作式中止，不是进程强杀；复核仍在跑的
     如实标红，不粉饰 allStopped。确认闸=输入 STOP-ALL 才解锁按钮。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { emergencyStop, type EmergencyStopResp } from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'

const i18nCtx = useI18n()
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  const g = loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
  return (g as unknown as { posture: Record<string, string> }).posture
})

const confirmText = ref('')
const reason = ref('')
const running = ref(false)
const report = ref<EmergencyStopResp['report'] | null>(null)
const error = ref('')

const unlocked = computed(() => confirmText.value === 'STOP-ALL')

async function stop(): Promise<void> {
  if (!unlocked.value || running.value) return
  running.value = true
  error.value = ''
  try {
    const res = await emergencyStop(reason.value || '全局紧急停止（治理姿态面板）')
    if (res.ok && res.report) report.value = res.report
    else error.value = res.error ?? '停止失败'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    running.value = false
    confirmText.value = ''
  }
}

onMounted(() => { /* 只挂载，不自动触发 */ })
</script>

<template>
  <div class="es" data-testid="emergency-stop">
    <div class="es__bar">
      <h3 class="es__title">{{ L?.stopTitle }}</h3>
    </div>
    <p class="es__sub">{{ L?.stopSub }}</p>
    <div v-if="error" class="es__error">{{ error }}</div>
    <div class="es__form">
      <input v-model="reason" class="es__reason" placeholder="原因（可选，留痕到治理事件流）" >
      <input
        v-model="confirmText" class="es__confirm" :placeholder="L?.stopConfirm"
        data-testid="es-confirm" @keydown.enter="() => void stop()"
      >
      <button
        type="button" class="es__btn" :disabled="!unlocked || running"
        data-testid="es-button" @click="() => void stop()"
      >{{ running ? L?.stopRunning : L?.stopButton }}</button>
    </div>
    <div v-if="report" class="es__report" data-testid="es-report">
      <p class="es__targets">{{ String(L?.stopTargets ?? '').replace('{n}', String(report.targets)) }}</p>
      <p v-if="report.allStopped" class="es__ok" data-testid="es-all-stopped">{{ L?.stopAllStopped }}</p>
      <p v-else class="es__bad" data-testid="es-still-working">{{ String(L?.stopStillWorking ?? '').replace('{n}', String(report.stillWorking.length)) }}</p>
      <div v-for="r in report.results" :key="r.sessionId" class="es__row" :data-ok="r.ok">
        <span class="es__sid">{{ r.profile }} · {{ r.sessionId }}</span>
        <span>{{ r.ok ? '✓' : `✗ ${r.error ?? ''}` }}</span>
      </div>
      <div v-for="s in report.stillWorking" :key="s.sessionId" class="es__row es__row--bad">
        <span class="es__sid">{{ s.profile }} · {{ s.sessionId }}</span>
        <span>仍在跑（isAborting={{ s.isAborting }}）</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.es {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.es__bar { display: flex; align-items: center; gap: 8px; }
.es__title { margin: 0; font-size: 14px; color: var(--danger); }
.es__sub, .es__targets { margin: 0; font-size: 12px; opacity: 0.7; }
.es__error { color: var(--danger); font-size: 12px; }
.es__form { display: flex; gap: 8px; flex-wrap: wrap; }
.es__reason, .es__confirm {
  flex: 1 1 160px; font-size: 12px; padding: 3px 8px;
  border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary);
}
.es__confirm { max-width: 200px; }
.es__btn {
  font-size: 12px; padding: 3px 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--danger); color: var(--danger); background: var(--bg-primary);
}
.es__btn:not(:disabled):hover { color: var(--text-on-accent); background: var(--danger); }
.es__btn:disabled { opacity: 0.45; cursor: default; }
.es__ok { margin: 0; font-size: 12px; color: rgb(21 128 61); }
.es__bad { margin: 0; font-size: 12px; color: var(--danger); font-weight: 600; }
.es__row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; border-bottom: 1px dashed var(--border-color); }
.es__row[data-ok="false"], .es__row--bad { color: var(--danger); }
.es__sid { font-family: monospace; }
</style>
