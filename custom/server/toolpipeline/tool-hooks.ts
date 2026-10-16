// overlay/custom/server/toolpipeline/tool-hooks.ts
// P1 工具执行瀑布的 overlay 消费面（2026-10-04 九源轮）。
//
// ekko registry 瀑布（patch 565/566：preExecute 在权限后、postExecute 在结果
// 回填前）+ manager 注入（两处 createRuntime）。钩子链现状（2026-10-08 H3 v1 起）：
// auditHook（观测）→ toolresultguard（结果围栏，默认关）→ enforce-gate（执法门，
// HERMES_TOOL_ENFORCE=1 才生效）。审计面 fail-open 永不阻断；执法面显式开启后
// 可拦（deny 语义见 enforce-gate.ts 三级策略链），未开启时零行为变化。
//
// 2026-10-16 安全轮 M6（预警先行版）：审计账补身份字段 + 按天轮转 + 失败计数。
// 背景：安全检查 E1 判「部分符合」——原账本无会话与身份标识（无法回答"谁调的
// 工具"），且每次 append 全文件读数、超 1000 行整文件重写（并发丢行 + 只留
// 约 2.5 分钟历史，撑不起频次类告警）。本版零行为变化：只加字段、改轮转、
// 加计数，不动任何裁决路径。
import { existsSync, mkdirSync, appendFileSync, readFileSync, statSync, renameSync, unlinkSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { ekkoGuardHook } from '../toolresultguard'
import { ekkoEnforceGateHook } from './enforce-gate'
import { skillGuardHook } from '../skillgov/skill-guard-hook'
import { reportLostSuspensionsOnBoot } from './enforce-approvals'

export interface ToolExecAuditEntry {
  ts: number
  phase: 'pre' | 'post'
  tool: string
  /** pre：入参键清单（不落值——脱敏纪律）；post：ok 与 error 摘要 */
  inputKeys?: string[]
  ok?: boolean
  error?: string
  /** M6：身份字段（取自上游 AgentToolContext；标识非机密，落账不违反脱敏纪律）。
   *  无头/CLI 运行取不到时为 undefined——账本允许匿名行，不阻断。 */
  sessionId?: string
  userId?: string
  profileId?: string
  runId?: string
}

/** 单日文件行数上限（超限转 .1/.2 后缀，同 agent.log 轮转命名） */
const DAY_CAP = 5000
/** 保留天数（跨天时 lazy 清理更早文件，无定时器） */
const RETAIN_DAYS = 14

/** 落盘失败计数（fail-open 不阻断工具执行，但失败必须可见——静默失效=审计幻觉） */
let writeFailures = 0

function auditDir(): string {
  const env = process.env.TOOL_EXEC_AUDIT_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'tool-exec-audit')
}

/** 当日账本文件（本地时区日期，与 governance/change-governance-store.ts 的日期切分同款） */
function auditFile(now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return join(auditDir(), `tool-exec-${day}.jsonl`)
}

/** 跨天轮转 + 过期清理（lazy：append 时顺手做，失败不阻断） */
function rotateAndPrune(now = new Date()): void {
  try {
    const dir = auditDir()
    if (!existsSync(dir)) return
    const cutoff = now.getTime() - RETAIN_DAYS * 86_400_000
    for (const name of readdirSync(dir)) {
      const m = name.match(/^tool-exec-(\d{4})-(\d{2})-(\d{2})\.jsonl(?:\.(\d+))?$/)
      if (!m) continue
      const dayMs = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      if (Number.isFinite(dayMs) && dayMs < cutoff) {
        try { unlinkSync(join(dir, name)) } catch { /* 单文件删失败跳过错过后轮再试 */ }
      }
    }
  } catch { /* 清理失败不阻断 */ }
}

/** 单文件超 DAY_CAP 时向后转缀（.1 最新→数字增大越旧，同 agent.log 语义） */
function rolloverIfFull(file: string): void {
  try {
    let size = 0
    try { size = statSync(file).size } catch { return }
    // 粗估行数（平均行长 ~200B）；超限才精确计数，避免每次 append 全读
    if (size < DAY_CAP * 120) return
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length <= DAY_CAP) return
    for (let i = 1; ; i++) {
      const rotated = `${file}.${i}`
      if (!existsSync(rotated)) {
        renameSync(file, rotated)
        break
      }
    }
  } catch { /* 轮转失败不阻断：账本继续追加到当前文件 */ }
}

function appendEntry(entry: ToolExecAuditEntry): void {
  try {
    const file = auditFile()
    mkdirSync(auditDir(), { recursive: true })
    rolloverIfFull(file)
    appendFileSync(file, JSON.stringify(entry) + '\n')
    // 跨天/超限的清理与轮转低频触发（每 200 条做一次，避免每 append 读目录）
    if (Math.random() < 1 / 200) rotateAndPrune()
  } catch {
    // fail-open 保持：审计失败不阻断工具执行；但计数可见
    writeFailures += 1
    if (writeFailures === 1 || writeFailures % 50 === 0) {
      import('../govbus/event-log')
        .then(({ appendGovEvent }) => {
          appendGovEvent({
            domain: 'system',
            severity: 'warn',
            type: 'tool.exec-audit.write-failed',
            source: 'toolpipeline/tool-hooks',
            summary: `工具执行审计账落盘失败 ${writeFailures} 次（fail-open 未阻断执行，但该窗口审计有缺）`,
            payload: { failures: writeFailures },
          })
        })
        .catch(() => { /* govbus 不可用：计数仍在进程内可见 */ })
    }
  }
}

/** 观测钩子（v2，2026-10-16 安全轮 M6）：pre 记键名，post 记结局；两条都带身份字段。
 *  上游 ToolExecuteHook 第三参数本就是 AgentToolContext（ekko-agent/src/tools/types.ts
 *  :132-142，含 userId/sessionId/profileId/runId），调用处始终透传——此前忽略未用。 */
const auditHook = {
  async preExecute(name: string, input: Record<string, unknown>, context?: { userId?: string; sessionId?: string; profileId?: string; runId?: string }) {
    appendEntry({
      ts: Date.now(),
      phase: 'pre',
      tool: name,
      inputKeys: Object.keys(input ?? {}).slice(0, 20),
      sessionId: context?.sessionId,
      userId: context?.userId,
      profileId: context?.profileId,
      runId: context?.runId,
    })
  },
  async postExecute(name: string, _input: Record<string, unknown>, result: { ok?: boolean; error?: string }, context?: { userId?: string; sessionId?: string; profileId?: string; runId?: string }) {
    appendEntry({
      ts: Date.now(),
      phase: 'post',
      tool: name,
      ok: typeof result?.ok === 'boolean' ? result.ok : undefined,
      error: typeof result?.error === 'string' ? result.error.slice(0, 200) : undefined,
      sessionId: context?.sessionId,
      userId: context?.userId,
      profileId: context?.profileId,
      runId: context?.runId,
    })
  },
}

// toolresultguard P1a（2026-10-06 五文轮）：postExecute 增加注入判定/隔离改写
// （结果回填模型前）。守卫默认关（TRG_ENABLED=0 时零行为变化），超时/离线
// fail-open，S0 预筛兜底——关闭态与既有 v1 观测语义完全一致。
// H3 v1（2026-10-08 六文调研轮）：enforce-gate 执法钩子排末位（紧贴真实执行）——
// 阶梯/风险档/权限模式三级裁决，HERMES_TOOL_ENFORCE=1 才生效（默认零行为变化）。
// "只观测不拦截"的 v1 边界自此收窄为"默认不拦截"（执法面显式开启后可拦）。
// Skill 三段治理（2026-10-13 挂账清偿轮）：skillGuardHook 排泛型围栏后、执法门前——
// skill_view/skill_manage 按注册扫描 verdict 拦 + 装载内容内联 shell 警示
// （SKILLGOV_ENFORCE=1 才执法；观测审计恒开 fail-open）。
export const ekkoToolExecuteHooks = [auditHook, ekkoGuardHook(), skillGuardHook(), ekkoEnforceGateHook()]

// H3 中间态（进程面边界缓解）：钩子装配=server 启动面，扫一遍重启遗留挂起单
// （waitingAt 标记在案→govbus 提醒+清标记；幂等、fail-soft、fire-and-forget）。
void reportLostSuspensionsOnBoot()

/** 读尾部（测试/消费面）。跨日文件按新→旧回读合并，最终按时间正序返回
 *  （保持 v1 契约：entries[0] 最早）。签名与返回类型不变。
 *  覆盖范围声明：本账只记 studio server ekko runtime 的工具调用；agent teams
 *  （hermes -p <profile> chat -q Python 子进程）不经过该链，其工具调用以各
 *  profile 的 state.db 为准（clusterinspector collectProfileToolUsage 面）。 */
export function readToolExecAudit(limit = 100): ToolExecAuditEntry[] {
  try {
    const dir = auditDir()
    if (!existsSync(dir)) return []
    const files = readdirSync(dir)
      .filter((f) => /^tool-exec-\d{4}-\d{2}-\d{2}\.jsonl(\.\d+)?$/.test(f))
      .sort()
      .reverse()
    const out: ToolExecAuditEntry[] = []
    for (const f of files) {
      if (out.length >= limit) break
      try {
        const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean)
        for (const l of lines.reverse()) {
          if (out.length >= limit) break
          out.push(JSON.parse(l) as ToolExecAuditEntry)
        }
      } catch { /* 单文件读失败跳过 */ }
    }
    return out.reverse()
  } catch {
    return []
  }
}

/** 落盘失败计数（观测面健康指标：>0 即该窗口审计有缺） */
export function toolExecAuditWriteFailures(): number {
  return writeFailures
}

/** 测试隔离。 */
export function _useAuditDirForTests(dir: string): void {
  process.env.TOOL_EXEC_AUDIT_DIR = dir
}

/** 测试专用：跨天清理与超限转缀的内部入口（生产路径由 appendEntry 低频触发） */
export function _rotateAndPruneForTests(now = new Date()): void {
  rotateAndPrune(now)
}

export function _rolloverIfFullForTests(file: string): void {
  rolloverIfFull(file)
}
