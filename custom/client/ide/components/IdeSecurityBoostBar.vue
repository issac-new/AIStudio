<script setup lang="ts">
// IdeSecurityBoostBar — 安全扫描 + 多路加压入口条（吸收 v2 批 codesec/boost）。
// codesec（qoder 三档扫描）：static 档真实跑——经 ideGitApi.status + diff 读当前
// git 变更的真实 diff 内容，只扫新增行（正则级：硬编码密钥/口令）；semantic/
// dataflow 档展示计划不虚标执行（引擎侧记档）。发现只报文件/行/类别，不回显
// 命中的敏感原值。无变更=「未扫描到变更，不代表安全」（不装安全）；失败显示
// 原因（不伪装成无发现）。2026-10-27 Task 11：boost 入口的浏览器原生弹窗输入
// 改面板内联输入；已退役的 studio git status 端点与「文件路径当内容」扫描
// 一并清退（守门见 __tests__/security-boost-contract.test.ts）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { ideGitApi } from '../api/git'
import { planScan, gradeFinding, type SecurityFinding } from '../../../server/codesec/code-security'

const chat = useChatStore()
const { root } = useIdeWorkspace()
const { t } = useI18n()

/** 单次扫描最多取的变更文件数（每文件一次 diff 请求，防巨仓打爆）。 */
const SCAN_FILE_CAP = 20

const open = ref(false)
const findings = ref<SecurityFinding[] | null>(null)
const scanning = ref(false)
const scanRisk = ref<'low' | 'medium' | 'high'>('medium')
/** 扫描面失败原因（status/diff 级）；非空时面板显示原因而非「无发现」。 */
const scanError = ref('')
const scannedFiles = ref(0)
const capped = ref(false)
/** 未跟踪文件计数：git diff 无内容可读，跳过并如实提示（不计入已扫描）。 */
const skippedUntracked = ref(0)

/** 单个 diff 的新增行级检查：只扫 '+' 行（上下文/删除行里的历史问题不算变更发现）。 */
const ADDED_CHECKS: Array<{ re: RegExp; detail: string }> = [
  { re: /sk-[a-zA-Z0-9]{16,}/, detail: '疑似硬编码 API 密钥（sk- 前缀）' },
  { re: /(password|passwd|secret|api[_-]?key)\s*[=:]\s*['"][^'"]{6,}/i, detail: '疑似硬编码口令/令牌' },
]

function scanDiffText(file: string, diffText: string, out: SecurityFinding[]): void {
  let line = 0
  for (const raw of diffText.split('\n')) {
    const hunk = raw.match(/^@@ [^+]*\+(\d+)/)
    if (hunk) { line = Number(hunk[1]) - 1; continue }
    if (raw.startsWith('+++') || raw.startsWith('---')) continue
    if (raw.startsWith('+')) {
      line += 1
      // 只报类别与位置，不回显命中的原值（安全约束：不输出敏感原值）
      for (const check of ADDED_CHECKS) {
        if (check.re.test(raw)) out.push(gradeFinding({ tier: 'static', file, line, detail: check.detail }))
      }
    } else if (raw.startsWith(' ') || raw === '') {
      line += 1
    }
  }
}

/** static 档真实扫描（正则级；semantic/dataflow 展示计划）。 */
async function runScan(): Promise<void> {
  scanning.value = true
  findings.value = []
  scanError.value = ''
  scannedFiles.value = 0
  capped.value = false
  const ws = root.value
  if (!ws) {
    scanError.value = t('ide.security.noWorkspace', '无工作区：先绑定任务工作区再扫描')
    scanning.value = false
    return
  }
  try {
    const st = await ideGitApi.status(ws)
    const changes = st.changes ?? []
    capped.value = changes.length > SCAN_FILE_CAP
    skippedUntracked.value = 0
    // untracked 文件 git diff 无内容可读（不读文件系统旁路），跳过并如实计数
    // ——既不冒充已扫描，也不假装没有变更。
    skippedUntracked.value = changes.filter((c) => c.kind === 'untracked').length
    const picked = changes.filter((c) => c.kind !== 'untracked').slice(0, SCAN_FILE_CAP)
    const errors: string[] = []
    const result: SecurityFinding[] = []
    await Promise.all(picked.map(async (c) => {
      try {
        // staged=index 侧非空（与 IdeGitPane toGroups 同口径）
        const d = await ideGitApi.diff(ws, c.file, c.indexStatus !== ' ')
        scanDiffText(c.file, d.diff ?? '', result)
        scannedFiles.value += 1
      } catch (err) {
        errors.push(`${c.file}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }))
    findings.value = result
    // 失败可见：任一文件 diff 读取失败时显示原因，不把部分失败伪装成干净
    if (errors.length) scanError.value = errors[0]
  } catch (err) {
    findings.value = []
    scanError.value = err instanceof Error ? err.message : String(err)
  } finally {
    scanning.value = false
  }
}

/** 扫描面状态：无变更=「不代表安全」的诚实空态；全未跟踪=另注未扫描原因。 */
const scanState = computed<'idle' | 'noChanges' | 'clean' | 'found' | 'error' | 'untrackedOnly'>(() => {
  if (scanError.value) return 'error'
  if (findings.value === null) return 'idle'
  if (findings.value.length) return 'found'
  if (scannedFiles.value > 0) return 'clean'
  if (skippedUntracked.value > 0) return 'untrackedOnly'
  return 'noChanges'
})

// ── boost 内联输入（/boost 模板注入当前会话——多路并行由 agent 执行）──
const boostOpen = ref(false)
const boostQuery = ref('')

/** boost 入口：面板内联输入提交（取代浏览器原生弹窗输入——不可样式化不可取消校验）。 */
function runBoost(): void {
  const q = boostQuery.value.trim()
  if (!q) return
  void chat.sendMessage(`/boost ${q}`)
  boostOpen.value = false
  boostQuery.value = ''
}
</script>

<template>
  <div class="ide-secbar" data-testid="ide-security-boost-bar">
    <button
      type="button"
      class="ide-secbar__btn"
      :title="t('ide.security.title', '安全扫描')"
      data-testid="ide-scan-toggle"
      @click="open = !open"
    >🛡</button>
    <button
      type="button"
      class="ide-secbar__btn"
      :title="t('ide.security.boostTitle', '多路并行推理（/boost 管线）')"
      data-testid="ide-boost-run"
      @click="boostOpen = !boostOpen"
    >⚡</button>
    <div v-if="open" class="ide-secbar__panel" data-testid="ide-scan-panel">
      <div class="ide-secbar__head">
        {{ t('ide.security.title', '安全扫描') }}
        <select v-model="scanRisk" data-testid="ide-scan-risk" :title="t('ide.security.planSuffix', '（static 档真实执行；semantic/dataflow 引擎侧待接）')">
          <option value="low">{{ t('ide.security.riskLow', '低危') }}</option>
          <option value="medium">{{ t('ide.security.riskMedium', '中危') }}</option>
          <option value="high">{{ t('ide.security.riskHigh', '高危') }}</option>
        </select>
        <button type="button" class="ide-secbar__run" :disabled="scanning" data-testid="ide-scan-run" @click="runScan">
          {{ scanning ? t('ide.security.running', '扫描中…') : t('ide.security.run', '扫描') }}
        </button>
      </div>
      <p class="ide-secbar__plan" :title="planScan(scanRisk).detail">
        {{ t('ide.security.planPrefix', '计划：') }}{{ planScan(scanRisk).tiers.join(' → ') }}{{ t('ide.security.planSuffix', '（static 档真实执行；semantic/dataflow 引擎侧待接）') }}
      </p>
      <p v-if="scanState === 'noChanges'" class="ide-secbar__clean" data-testid="ide-scan-clean">
        {{ t('ide.security.noChanges', '未扫描到变更，不代表安全') }}
      </p>
      <p v-else-if="scanState === 'clean'" class="ide-secbar__clean" data-testid="ide-scan-clean">
        {{ t('ide.security.noFindings', '✓ 无 static 档发现') }}
      </p>
      <p v-else-if="scanState === 'untrackedOnly'" class="ide-secbar__clean" data-testid="ide-scan-clean">
        {{ t('ide.security.untrackedNote', '{n} 个未跟踪文件不在 git diff 内，未扫描').replace('{n}', String(skippedUntracked)) }}
      </p>
      <!-- 混合场景（已扫若干 + 还有未跟踪）同样如实标注未扫描面 -->
      <p v-else-if="skippedUntracked" class="ide-secbar__meta">
        {{ t('ide.security.untrackedNote', '{n} 个未跟踪文件不在 git diff 内，未扫描').replace('{n}', String(skippedUntracked)) }}
      </p>
      <p v-if="scanError" class="ide-secbar__error" data-testid="ide-scan-error">
        {{ t('ide.security.failIntro', '扫描不可用：') }}{{ scanError }}
      </p>
      <p v-if="scannedFiles" class="ide-secbar__meta">
        {{ t('ide.security.scannedFiles', '已扫描 {n} 个文件的变更内容').replace('{n}', String(scannedFiles)) }}{{ capped ? t('ide.security.capNote', '（仅前 20 个文件）') : '' }}
      </p>
      <div v-for="(f, i) in findings" :key="i" class="ide-secbar__finding" :data-severity="f.severity" :data-testid="`ide-scan-finding-${i}`">
        [{{ f.severity }}] {{ f.file || '(会话)' }}:{{ f.line }} — {{ f.detail }}
      </div>
    </div>
    <!-- boost 内联输入（面板内嵌，取代浏览器原生弹窗输入） -->
    <div v-if="boostOpen" class="ide-secbar__panel ide-secbar__boost" data-testid="ide-boost-panel">
      <input
        v-model="boostQuery"
        type="text"
        class="ide-secbar__boost-input"
        :placeholder="t('ide.security.boostPlaceholder', '要并行多路推理的问题')"
        data-testid="ide-boost-input"
        @keydown.enter="runBoost"
        @keydown.esc.stop="boostOpen = false"
      >
      <button type="button" class="ide-secbar__boost-send" data-testid="ide-boost-send" @click="runBoost">
        {{ t('ide.security.boostSend', '发送') }}
      </button>
      <button type="button" class="ide-secbar__boost-cancel" data-testid="ide-boost-cancel" @click="boostOpen = false; boostQuery = ''">
        {{ t('ide.security.boostCancel', '取消') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-secbar { position: relative; display: inline-flex; gap: 2px; }
.ide-secbar__btn {
  min-width: 32px; min-height: 32px;
  border: none; background: transparent; cursor: pointer;
  font-size: 14px; padding: 0; color: var(--text-muted);
  &:hover { color: var(--text-primary); }
}
.ide-secbar__panel {
  position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 90;
  background: var(--card-color); border: 1px solid var(--border-color);
  border-radius: 6px; padding: 8px 10px; min-width: 300px; max-width: 380px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); font-size: 12px;
}
.ide-secbar__head { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; }
.ide-secbar__head select { font-size: 12px; }
.ide-secbar__run {
  min-height: 40px; /* 主要动作命中区（视觉最小集） */
  border: 1px solid var(--primary-color); color: var(--primary-color);
  background: transparent; border-radius: 4px; font-size: 12px;
  padding: 6px 14px; cursor: pointer; margin-left: auto;
}
.ide-secbar__plan { color: var(--text-muted); margin: 4px 0; font-size: 12px; }
.ide-secbar__clean { color: var(--text-secondary); margin: 4px 0; }
.ide-secbar__error { color: var(--error-color); margin: 4px 0; }
.ide-secbar__meta { color: var(--text-muted); margin: 2px 0; }
.ide-secbar__finding { color: var(--text-secondary); padding: 2px 0; font-size: 13px;
  &[data-severity='high'] { color: var(--error-color); }
  &[data-severity='medium'] { color: var(--warning-color); } }
.ide-secbar__boost { display: flex; align-items: center; gap: 6px; }
.ide-secbar__boost-input {
  flex: 1; min-width: 0; min-height: 40px; padding: 0 8px;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: transparent; color: var(--text-primary); font-size: 14px; outline: none;
}
.ide-secbar__boost-send {
  min-height: 40px; padding: 6px 14px; border: none; border-radius: 4px;
  background: var(--primary-color); color: var(--text-on-accent);
  font-size: 14px; cursor: pointer;
}
.ide-secbar__boost-cancel {
  min-height: 40px; padding: 6px 10px; border: 1px solid var(--border-color);
  border-radius: 4px; background: transparent; color: var(--text-secondary);
  font-size: 12px; cursor: pointer;
}
</style>
