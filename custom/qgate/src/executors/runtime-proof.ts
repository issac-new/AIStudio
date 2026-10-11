// runtime-proof executor（长会话治理 B5）：runtime-verify 产物的关卡消费面。
// 证据纪律（run14「结论可信证据不可信」根治件之一）：AI 员工声称「真工具跑起来了」
// 必须落到 runtime-proof.json 记录——本 executor 校验五要素（tool/appid/launchOk/
// screenshot/checkedAt）+ 新鲜度，fail-closed：缺失/畸形/超龄/launchOk≠true 一律
// FAIL（error 证据 INCONCLUSIVE，永不转 PASS——同 raw-evidence 纪律）。
// 记录生产面 = runtime-verify 注册表（REST /api/hermes/runtime-verify/*）；
// 本 executor 只消费不生产（关卡独立性：不依赖验证器在位，只认产物）。

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'

export interface RuntimeProofExecutorInput {
  runId: string
  gateId: string
  workspace: string
  commit?: string
}

interface ProofRecord {
  tool?: unknown
  projectPath?: unknown
  appid?: unknown
  launchOk?: unknown
  screenshot?: unknown
  checkedAt?: unknown
}

export function runRuntimeProofExecutor(executor: ExecutorSpec, input: RuntimeProofExecutorInput): Evidence {
  const startedAt = Date.now()
  const done = (result: 'pass' | 'fail' | 'error', summary: string, execution: 'exercised' | 'present' = 'exercised'): Evidence => ({
    id: `ev-${randomUUID().slice(0, 12)}-runtime-proof`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result,
    execution,
    independence: 'spec-derived',
    summary,
    provenance: { startedAt, endedAt: Date.now(), commit: input.commit, cwd: input.workspace },
  })

  if (!executor.proofFile) {
    return done('error', 'runtime-proof executor requires proofFile')
  }
  const path = join(input.workspace, executor.proofFile)
  if (!existsSync(path)) {
    return done('fail', `runtime-proof 记录缺失：${executor.proofFile}——先经 runtime-verify 真实执行生成（REST /api/hermes/runtime-verify/*），无记录=不达标`)
  }
  let record: ProofRecord
  try {
    record = JSON.parse(readFileSync(path, 'utf8')) as ProofRecord
  } catch (e) {
    return done('error', `runtime-proof 记录畸形（JSON 解析失败）：${String(e)}`)
  }
  const violations: string[] = []
  if (typeof record.tool !== 'string' || !record.tool) violations.push('tool 缺失')
  if (typeof record.projectPath !== 'string' || !record.projectPath) violations.push('projectPath 缺失')
  if (record.launchOk !== true) violations.push('launchOk 须为 true（启动失败/未跑=不达标）')
  if (typeof record.screenshot !== 'string' || !record.screenshot) violations.push('screenshot 缺失（首帧凭证）')
  if (typeof record.checkedAt !== 'string' || !record.checkedAt) {
    violations.push('checkedAt 缺失')
  } else {
    const ageMs = Date.now() - Date.parse(record.checkedAt)
    if (!Number.isFinite(ageMs)) violations.push('checkedAt 不可解析')
    else {
      const maxHours = executor.proofMaxAgeHours ?? 24
      if (ageMs > maxHours * 3600_000) violations.push(`记录超龄（${Math.round(ageMs / 3600_000)}h > ${maxHours}h）——重跑取证`)
    }
  }
  if (violations.length > 0) {
    return done('fail', `runtime-proof 不达标：${violations.join('；')}`)
  }
  return done('pass', `runtime-proof 达标：${record.tool} 启动成功且首帧在档（${String(record.checkedAt)}，appid=${String(record.appid ?? '-')}）`)
}
