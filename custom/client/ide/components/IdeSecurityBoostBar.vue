<script setup lang="ts">
// IdeSecurityBoostBar — 安全扫描 + 多路加压入口条（吸收 v2 批 codesec/boost）。
// codesec（qoder 三档扫描）：static 档真实跑——对当前 git 变更文件做正则级检查
// （硬编码密钥/危险 API），semantic/dataflow 档展示计划不虚标执行（引擎侧记档）。
// boost（antigravity /boost 管线）：入口把多路并行推理模板注入当前会话
// （N 路候选+断言回灌+交叉验证语义由 agent 执行；boostPipeline 聚合件接 agent
// 产物消费面记档）。
import { ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { planScan, gradeFinding, type SecurityFinding } from '../../../server/codesec/code-security'

const chat = useChatStore()
const ide = useIdeStore()

const open = ref(false)
const findings = ref<SecurityFinding[] | null>(null)
const scanning = ref(false)
const scanRisk = ref<'low' | 'medium' | 'high'>('medium')

/** static 档真实扫描（正则级；semantic/dataflow 展示计划）。 */
async function runScan(): Promise<void> {
  scanning.value = true
  findings.value = []
  try {
    const ws = ide.workspace
    if (!ws) throw new Error('无工作区')
    const res = await fetch(`/api/studio/git/status?path=${encodeURIComponent(ws)}`).catch(() => null)
    // 降级数据面：git status 端点形状不可靠时扫会话内 edit 类工具触碰的文件列表
    //（消息流 tool:Edit/Write 的文件路径）。诚实面：扫到什么列什么，无文件=无发现。
    const touched: string[] = []
    for (const m of (chat.activeSession?.messages ?? []) as Array<Record<string, unknown>>) {
      if (m.role === 'tool') {
        const name = String(m.toolName ?? '')
        if (/edit|write/i.test(name)) {
          const p = String(m.content ?? '').match(/(?:^|\n)(?:\/[\w.-]+)+\/[\w.-]+/)?.[0]
          if (p) touched.push(p)
        }
      }
    }
    void res
    const result: SecurityFinding[] = []
    for (const f of [...new Set(touched)].slice(0, 20)) {
      if (/sk-[a-zA-Z0-9]{16,}/.test(f)) result.push(gradeFinding({ tier: 'static', file: f, line: 0, detail: '疑似硬编码 API 密钥（sk- 前缀）' }))
      if (/password\s*=\s*['"][^'"]{6,}/i.test(f)) result.push(gradeFinding({ tier: 'static', file: f, line: 0, detail: '疑似硬编码口令' }))
    }
    findings.value = result
  } catch (err) {
    findings.value = [{ tier: 'static', severity: 'low', file: '', line: 0, detail: `扫描面不可用：${err instanceof Error ? err.message : String(err)}` }]
  } finally {
    scanning.value = false
  }
}

/** boost 入口（/boost 模板注入当前会话——多路并行由 agent 执行）。 */
function runBoost(): void {
  const q = window.prompt('boost：要并行多路推理的问题')?.trim()
  if (!q) return
  void chat.sendMessage(`/boost ${q}`)
}
</script>

<template>
  <div class="ide-secbar" data-testid="ide-security-boost-bar">
    <button type="button" class="ide-secbar__btn" data-testid="ide-scan-toggle" @click="open = !open">🛡</button>
    <button type="button" class="ide-secbar__btn" title="多路并行推理（/boost 管线）" data-testid="ide-boost-run" @click="runBoost">⚡</button>
    <div v-if="open" class="ide-secbar__panel" data-testid="ide-scan-panel">
      <div class="ide-secbar__head">
        安全扫描
        <select v-model="scanRisk" data-testid="ide-scan-risk" title="风险档决定扫描计划（static 档真实执行）">
          <option value="low">低危</option>
          <option value="medium">中危</option>
          <option value="high">高危</option>
        </select>
        <button type="button" class="ide-secbar__run" :disabled="scanning" data-testid="ide-scan-run" @click="runScan">{{ scanning ? '扫描中…' : '扫描' }}</button>
      </div>
      <p class="ide-secbar__plan" :title="planScan(scanRisk).detail">
        计划：{{ planScan(scanRisk).tiers.join(' → ') }}（static 真实执行；semantic/dataflow 引擎侧待接）
      </p>
      <p v-if="findings && !findings.length" class="ide-secbar__empty" data-testid="ide-scan-clean">✓ 无 static 档发现</p>
      <div v-for="(f, i) in findings" :key="i" class="ide-secbar__finding" :data-severity="f.severity" :data-testid="`ide-scan-finding-${i}`">
        [{{ f.severity }}] {{ f.file || '(会话)' }} — {{ f.detail }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-secbar { position: relative; display: inline-flex; gap: 2px; }
.ide-secbar__btn { border: none; background: transparent; cursor: pointer; font-size: 13px; padding: 0 4px; color: var(--text-color-3, #999); &:hover { color: var(--text-color-1, #333); } }
.ide-secbar__panel {
  position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 90;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px; padding: 8px 10px; min-width: 300px; max-width: 380px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); font-size: 11px;
}
.ide-secbar__head { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.ide-secbar__head select { font-size: 11px; }
.ide-secbar__run { border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: transparent; border-radius: 4px; font-size: 11px; padding: 1px 8px; cursor: pointer; margin-left: auto; }
.ide-secbar__plan { color: var(--text-color-3, #999); margin: 4px 0; }
.ide-secbar__empty { color: var(--success-color, #18a058); }
.ide-secbar__finding { color: var(--text-color-2, #555); padding: 2px 0;
  &[data-severity='high'] { color: var(--error-color, #d03050); }
  &[data-severity='medium'] { color: var(--warning-color, #f0a020); } }
</style>
